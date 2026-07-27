import { IMAGE_PLACEHOLDER } from '@/lib/ai/prompts'
import type { ChatMessage, ChatMessageContent } from '@/lib/ai/types'
import { getHistoryMessageRequestContext } from '@/lib/ai/requestContextHistoryContent'
import { MAX_REQUEST_CONTEXT_IMAGE_SOURCES } from '@/lib/ai/requestContextSnapshot'
import { MAX_CHAT_MESSAGE_IMAGE_SOURCE_CHARS } from './attachmentKinds'
import { imageSourceToAttachment, normalizeVisionAttachment } from './visionAttachments'
import { throwIfChatRequestAborted } from './requestLifecycle'

export const MAX_REQUEST_CONTEXT_IMAGE_HYDRATION_CONCURRENCY = 4
export const MAX_REQUEST_CONTEXT_HYDRATED_IMAGE_CHARS = MAX_CHAT_MESSAGE_IMAGE_SOURCE_CHARS

function getContentImageBudget(content: ChatMessageContent): {
  imageCount: number
  imageSourceChars: number
} {
  if (!Array.isArray(content)) {
    return { imageCount: 0, imageSourceChars: 0 }
  }
  return content.reduce((budget, part) => {
    if (part.type === 'image_url') {
      budget.imageCount += 1
      budget.imageSourceChars += part.image_url.url.length
    }
    return budget
  }, { imageCount: 0, imageSourceChars: 0 })
}

async function hydrateSources(
  sources: readonly string[],
  signal: AbortSignal,
  budget: { remainingChars: number },
): Promise<string[]> {
  const results: string[] = []
  for (
    let start = 0;
    start < sources.length && budget.remainingChars > 0;
    start += MAX_REQUEST_CONTEXT_IMAGE_HYDRATION_CONCURRENCY
  ) {
    const batch = sources.slice(start, start + MAX_REQUEST_CONTEXT_IMAGE_HYDRATION_CONCURRENCY)
    const hydratedBatch = await Promise.all(batch.map(async (source, batchIndex) => {
      throwIfChatRequestAborted(signal)
      const part = await normalizeVisionAttachment(imageSourceToAttachment(source, start + batchIndex))
      throwIfChatRequestAborted(signal)
      return part?.type === 'image_url' ? part.image_url.url : null
    }))

    for (const source of hydratedBatch) {
      if (!source) continue
      if (source.length > budget.remainingChars) {
        budget.remainingChars = 0
        return results
      }
      results.push(source)
      budget.remainingChars -= source.length
    }
  }
  return results
}

export async function hydrateRequestHistoryContexts(
  history: ChatMessage[],
  signal: AbortSignal,
  maxHydratedImageChars = MAX_REQUEST_CONTEXT_HYDRATED_IMAGE_CHARS,
  maxHydratedImages = MAX_REQUEST_CONTEXT_IMAGE_SOURCES,
): Promise<ChatMessage[]> {
  const hydrated = [...history]
  let remainingImages = Math.max(
    0,
    Math.min(maxHydratedImages, MAX_REQUEST_CONTEXT_IMAGE_SOURCES),
  )
  const hydrationBudget = {
    remainingChars: Math.max(
      0,
      Math.min(maxHydratedImageChars, MAX_REQUEST_CONTEXT_HYDRATED_IMAGE_CHARS),
    ),
  }

  for (let index = hydrated.length - 1; index >= 0; index -= 1) {
    const message = hydrated[index]!
    const context = getHistoryMessageRequestContext(message)
    if (!context?.imageSources?.length) continue
    const sources = context.imageSources.slice(0, remainingImages)
    remainingImages -= sources.length
    const imageSources = sources.length > 0
      ? await hydrateSources(sources, signal, hydrationBudget)
      : []
    const unavailableCount = context.imageSources.length - imageSources.length
    hydrated[index] = {
      ...message,
      requestContext: {
        ...context,
        text: unavailableCount > 0
          ? [context.text, IMAGE_PLACEHOLDER]
              .filter(Boolean)
              .join('\n\n')
          : context.text,
        imageSources,
      },
    }
  }
  return hydrated
}

export function hydrateRequestHistoryForCurrentContent(
  history: ChatMessage[],
  content: ChatMessageContent,
  signal: AbortSignal,
): Promise<ChatMessage[]> {
  const currentBudget = getContentImageBudget(content)
  return hydrateRequestHistoryContexts(
    history,
    signal,
    MAX_REQUEST_CONTEXT_HYDRATED_IMAGE_CHARS - currentBudget.imageSourceChars,
    MAX_REQUEST_CONTEXT_IMAGE_SOURCES - currentBudget.imageCount,
  )
}
