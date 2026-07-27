import type { ApiTranscriptMessage, ChatMessage, ChatMessageContent } from '@/lib/ai/types'
import {
  MAX_INLINE_IMAGE_PERSISTENCE_BRANCH_DEPTH,
  MAX_INLINE_IMAGE_PERSISTENCE_MESSAGE_NODES,
  MAX_INLINE_IMAGE_PERSISTENCE_VERSIONS,
} from './sessionInlineImageConstants'
import { replaceImageSourceReferences } from './sessionInlineImageScrubber'
import { deriveMessageImageSourcesFromContent } from './sessionInlineImageSources'

interface InlineImageReplacementContext {
  changed: boolean
  messageNodes: number
}

function areImageSourcesEqual(left: readonly string[] | undefined, right: readonly string[] | undefined) {
  if (left === right) {
    return true
  }
  if (!left || !right || left.length !== right.length) {
    return false
  }
  return left.every((source, index) => source === right[index])
}

function replaceApiTranscriptContent(
  content: ChatMessageContent | null | undefined,
  replacements: Map<string, string>,
  context?: InlineImageReplacementContext,
): ChatMessageContent | null | undefined {
  if (typeof content === 'string') {
    const nextContent = replaceImageSourceReferences(content, replacements)
    if (context && nextContent !== content) {
      context.changed = true
    }
    return nextContent
  }

  if (!Array.isArray(content)) {
    return content
  }

  return content.map((part) => {
    if (part.type === 'text') {
      return {
        ...part,
        text: (() => {
          const nextText = replaceImageSourceReferences(part.text, replacements)
          if (context && nextText !== part.text) {
            context.changed = true
          }
          return nextText
        })(),
      }
    }
    if (part.type !== 'image_url') {
      return part
    }
    return {
      ...part,
      image_url: {
        ...part.image_url,
        url: replacements.get(part.image_url.url) || part.image_url.url,
      },
    }
  })
}

function replaceApiTranscriptSources(
  apiTranscript: ApiTranscriptMessage[] | undefined,
  replacements: Map<string, string>,
  context?: InlineImageReplacementContext,
): ApiTranscriptMessage[] | undefined {
  return apiTranscript?.map((message) => ({
    ...message,
    content: replaceApiTranscriptContent(message.content, replacements, context),
  }))
}

function replaceRequestContextSources(
  requestContext: ChatMessage['requestContext'],
  replacements: Map<string, string>,
  context: InlineImageReplacementContext,
): ChatMessage['requestContext'] {
  if (!requestContext?.imageSources?.length) {
    return requestContext
  }
  const imageSources = requestContext.imageSources.map((source) => replacements.get(source) || source)
  if (areImageSourcesEqual(requestContext.imageSources, imageSources)) {
    return requestContext
  }
  context.changed = true
  return { ...requestContext, imageSources }
}

export function applyImageSourceReplacements(
  messages: ChatMessage[],
  replacements: Map<string, string>,
  context: InlineImageReplacementContext = { changed: false, messageNodes: 0 },
  depth = 0,
): ChatMessage[] {
  const nextMessages: ChatMessage[] = []
  for (let index = 0; index < messages.length; index += 1) {
    if (context.messageNodes >= MAX_INLINE_IMAGE_PERSISTENCE_MESSAGE_NODES) {
      return index === 0 ? messages : nextMessages.concat(messages.slice(index))
    }

    context.messageNodes += 1
    const message = messages[index]
    const nextContent = replaceImageSourceReferences(message.content, replacements)
    if (nextContent !== message.content) {
      context.changed = true
    }
    const nextImageSources = deriveMessageImageSourcesFromContent(nextContent)
    if (!areImageSourcesEqual(message.imageSources, nextImageSources)) {
      context.changed = true
    }
    nextMessages.push({
      ...message,
      content: nextContent,
      apiTranscript: replaceApiTranscriptSources(message.apiTranscript, replacements, context),
      imageSources: nextImageSources,
      requestContext: replaceRequestContextSources(message.requestContext, replacements, context),
      versions: message.versions?.map((version, versionIndex) => {
        if (versionIndex >= MAX_INLINE_IMAGE_PERSISTENCE_VERSIONS) {
          return version
        }

        const nextVersionContent = version.content === message.content
          ? nextContent
          : replaceImageSourceReferences(version.content, replacements)
        if (nextVersionContent !== version.content) {
          context.changed = true
        }

        return {
          ...version,
          content: nextVersionContent,
          apiTranscript: replaceApiTranscriptSources(version.apiTranscript, replacements, context),
          requestContext: replaceRequestContextSources(version.requestContext, replacements, context),
          subsequentMessages: depth < MAX_INLINE_IMAGE_PERSISTENCE_BRANCH_DEPTH
            ? applyImageSourceReplacements(version.subsequentMessages || [], replacements, context, depth + 1)
            : version.subsequentMessages,
        }
      }),
    })
  }
  return nextMessages
}
