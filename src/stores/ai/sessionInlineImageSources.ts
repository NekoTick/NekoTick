import type { ApiTranscriptMessage, ChatMessage, ChatMessageContent } from '@/lib/ai/types'
import { parseMarkdownAndHtmlImageTokens } from '@/lib/markdown/markdownImageTokens'
import { normalizeRenderableDataImageSrc } from '@/components/common/markdown/imagePolicy'
import { extractChatMessageImageSources } from '@/lib/ai/chatImageSourcePolicy'
import {
  INLINE_DATA_IMAGE_TARGET_HINT_PATTERN,
  MARKDOWN_INLINE_DATA_IMAGE_HINT_PATTERN,
  MAX_INLINE_IMAGE_PERSISTENCE_BRANCH_DEPTH,
  MAX_INLINE_IMAGE_PERSISTENCE_BRANCH_MESSAGES,
  MAX_INLINE_IMAGE_PERSISTENCE_MESSAGE_NODES,
  MAX_INLINE_IMAGE_PERSISTENCE_SOURCES,
  MAX_INLINE_IMAGE_PERSISTENCE_VERSIONS,
  MAX_INLINE_IMAGE_TOKENS_PER_CONTENT,
  MESSAGE_IMAGE_TOKEN_HINT_PATTERN,
} from './sessionInlineImageConstants'

export type InlineImageSourceGroups = Map<string, Set<string>>

function addInlineImageSource(groups: InlineImageSourceGroups, source: string | null | undefined) {
  if (!source) {
    return
  }
  const normalized = normalizeRenderableDataImageSrc(source)
  if (!normalized) {
    return
  }
  if (!groups.has(normalized) && groups.size >= MAX_INLINE_IMAGE_PERSISTENCE_SOURCES) {
    return
  }
  const aliases = groups.get(normalized) ?? new Set<string>()
  aliases.add(normalized)
  aliases.add(source)
  groups.set(normalized, aliases)
}

function collectInlineImageSourcesFromContent(content: string | undefined, groups: InlineImageSourceGroups) {
  if (!content) {
    return
  }
  if (!INLINE_DATA_IMAGE_TARGET_HINT_PATTERN.test(content)) {
    return
  }
  parseMarkdownAndHtmlImageTokens(content, {
    maxTokens: MAX_INLINE_IMAGE_TOKENS_PER_CONTENT,
  }).forEach((token) => addInlineImageSource(groups, token.src))
}

export function deriveMessageImageSourcesFromContent(content: string): string[] | undefined {
  if (!content || !MESSAGE_IMAGE_TOKEN_HINT_PATTERN.test(content)) {
    return undefined
  }

  const sources = extractChatMessageImageSources(content, {
    maxSources: MAX_INLINE_IMAGE_PERSISTENCE_SOURCES,
    maxTokens: MAX_INLINE_IMAGE_TOKENS_PER_CONTENT,
    persistable: true,
  })
  return sources.length > 0 ? sources : undefined
}

function collectInlineImageSourcesFromApiContent(content: ChatMessageContent | null | undefined, groups: InlineImageSourceGroups) {
  if (typeof content === 'string') {
    collectInlineImageSourcesFromContent(content, groups)
    return
  }

  if (!Array.isArray(content)) {
    return
  }

  content.forEach((part) => {
    if (part.type === 'text') {
      collectInlineImageSourcesFromContent(part.text, groups)
      return
    }
    if (part.type === 'image_url') {
      addInlineImageSource(groups, part.image_url.url)
    }
  })
}

function collectInlineImageSourcesFromApiTranscript(apiTranscript: ApiTranscriptMessage[] | undefined, groups: InlineImageSourceGroups) {
  if (!apiTranscript) {
    return
  }

  apiTranscript.forEach((message) => collectInlineImageSourcesFromApiContent(message.content, groups))
}

function collectInlineImageSourcesFromRequestContext(
  requestContext: ChatMessage['requestContext'],
  groups: InlineImageSourceGroups,
) {
  requestContext?.imageSources?.forEach((source) => addInlineImageSource(groups, source))
}

function hasMarkdownInlineDataImageHintInContent(content: ChatMessageContent | null | undefined): boolean {
  if (typeof content === 'string') {
    return MARKDOWN_INLINE_DATA_IMAGE_HINT_PATTERN.test(content)
  }
  if (!Array.isArray(content)) {
    return false
  }
  return content.some((part) =>
    part.type === 'text'
      ? MARKDOWN_INLINE_DATA_IMAGE_HINT_PATTERN.test(part.text)
      : part.type === 'image_url' && INLINE_DATA_IMAGE_TARGET_HINT_PATTERN.test(part.image_url.url)
  )
}

export function hasMarkdownInlineDataImageHint(messages: ChatMessage[]): boolean {
  return messages.some((message) =>
    hasMarkdownInlineDataImageHintInContent(message.content) ||
    message.requestContext?.imageSources?.some((source) =>
      INLINE_DATA_IMAGE_TARGET_HINT_PATTERN.test(source)
    ) ||
    message.apiTranscript?.some((transcriptMessage) =>
      hasMarkdownInlineDataImageHintInContent(transcriptMessage.content)
    ) ||
    message.versions?.slice(0, MAX_INLINE_IMAGE_PERSISTENCE_VERSIONS).some((version) =>
      hasMarkdownInlineDataImageHintInContent(version.content) ||
      version.requestContext?.imageSources?.some((source) =>
        INLINE_DATA_IMAGE_TARGET_HINT_PATTERN.test(source)
      ) ||
      version.apiTranscript?.some((transcriptMessage) =>
        hasMarkdownInlineDataImageHintInContent(transcriptMessage.content)
      )
    )
  )
}

export function collectInlineImageSources(messages: ChatMessage[], groups: InlineImageSourceGroups = new Map()) {
  const stack: Array<{ depth: number; messages: ChatMessage[] }> = [{ depth: 0, messages }]
  let visited = 0

  while (stack.length > 0 && visited < MAX_INLINE_IMAGE_PERSISTENCE_MESSAGE_NODES) {
    const frame = stack.pop()!

    for (const message of frame.messages) {
      if (visited >= MAX_INLINE_IMAGE_PERSISTENCE_MESSAGE_NODES) {
        break
      }
      visited += 1

      collectInlineImageSourcesFromContent(message.content, groups)
      collectInlineImageSourcesFromRequestContext(message.requestContext, groups)
      collectInlineImageSourcesFromApiTranscript(message.apiTranscript, groups)
      message.versions?.slice(0, MAX_INLINE_IMAGE_PERSISTENCE_VERSIONS).forEach((version) => {
        if (version.content !== message.content) {
          collectInlineImageSourcesFromContent(version.content, groups)
        }
        collectInlineImageSourcesFromRequestContext(version.requestContext, groups)
        collectInlineImageSourcesFromApiTranscript(version.apiTranscript, groups)
        if (
          frame.depth < MAX_INLINE_IMAGE_PERSISTENCE_BRANCH_DEPTH &&
          Array.isArray(version.subsequentMessages) &&
          version.subsequentMessages.length > 0
        ) {
          stack.push({
            depth: frame.depth + 1,
            messages: version.subsequentMessages.slice(0, MAX_INLINE_IMAGE_PERSISTENCE_BRANCH_MESSAGES),
          })
        }
      })
    }
  }

  return groups
}

export function hasInlineImageSourcesOutsideProcessedSet(messages: ChatMessage[], processedSources: InlineImageSourceGroups) {
  const latestSources = collectInlineImageSources(messages, new Map())
  for (const source of latestSources.keys()) {
    if (!processedSources.has(source)) {
      return true
    }
  }
  return false
}
