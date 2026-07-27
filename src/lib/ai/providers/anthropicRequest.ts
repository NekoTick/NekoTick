import { resolveApiModelId } from '../utils'
import type { AIModel, ChatMessage, ChatMessageContent, ChatSendOptions } from '../types'
import {
  MAX_CURRENT_REQUEST_CONTENT_PARTS,
  MAX_CURRENT_REQUEST_MESSAGE_CHARS,
  sanitizeCurrentRequestTextContent,
} from '@/lib/ai/requestContext'
import { stripThinkingContent } from '@/lib/ai/stripThinkingContent'
import { normalizeRenderableDataImageSrc } from '@/lib/markdown/renderableImagePolicy'
import { getHistoryMessageRequestContent } from '@/lib/ai/requestContextHistoryContent'

function extractTextContent(content: ChatMessageContent): string {
  if (typeof content === 'string') {
    return content
  }

  return content
    .map((part) => {
      if (part.type === 'text') {
        return part.text
      }
      return ''
    })
    .join('')
}

type AnthropicContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }

type AnthropicMessage = {
  role: 'user' | 'assistant'
  content: string | AnthropicContentBlock[]
}

function dataImageToAnthropicBlock(src: string): AnthropicContentBlock | null {
  const normalized = normalizeRenderableDataImageSrc(src)
  if (!normalized) {
    return null
  }

  const match = /^data:(image\/[^;,]+);base64,([A-Za-z0-9+/=]+)$/i.exec(normalized)
  if (!match) {
    return null
  }

  const mediaType = match[1]?.toLowerCase()
  if (!mediaType || mediaType === 'image/svg+xml') {
    return null
  }

  return {
    type: 'image',
    source: {
      type: 'base64',
      media_type: mediaType,
      data: match[2] || '',
    },
  }
}

function buildAnthropicUserContent(content: ChatMessageContent): string | AnthropicContentBlock[] {
  if (typeof content === 'string') {
    return sanitizeCurrentRequestTextContent(content)
  }

  const blocks: AnthropicContentBlock[] = []
  let remainingTextChars = MAX_CURRENT_REQUEST_MESSAGE_CHARS
  for (const part of content.slice(0, MAX_CURRENT_REQUEST_CONTENT_PARTS)) {
    if (part.type === 'text') {
      if (part.text && remainingTextChars > 0) {
        const text = sanitizeCurrentRequestTextContent(part.text, remainingTextChars)
        remainingTextChars -= text.length
        if (text) {
          blocks.push({ type: 'text', text })
        }
      }
      continue
    }

    const imageBlock = dataImageToAnthropicBlock(part.image_url.url)
    if (imageBlock) {
      blocks.push(imageBlock)
    }
  }

  return blocks.length > 0 ? blocks : ''
}

function buildAnthropicMessages(
  message: ChatMessageContent,
  history: ChatMessage[]
): { system?: string; messages: AnthropicMessage[] } {
  const messages: AnthropicMessage[] = []
  const systemParts: string[] = []

  history.forEach((entry) => {
    const requestContent = getHistoryMessageRequestContent(entry)
    const content = stripThinkingContent(extractTextContent(requestContent))

    if (entry.role === 'system') {
      if (content) systemParts.push(content)
      return
    }

    const messageContent = entry.role === 'assistant'
      ? content
      : buildAnthropicUserContent(requestContent)
    if (!messageContent || (Array.isArray(messageContent) && messageContent.length === 0)) return

    messages.push({
      role: entry.role === 'assistant' ? 'assistant' : 'user',
      content: messageContent,
    })
  })

  messages.push({
    role: 'user',
    content: buildAnthropicUserContent(message),
  })

  return {
    system: systemParts.join('\n\n') || undefined,
    messages,
  }
}

export function buildAnthropicMessageRequest({
  message,
  history,
  model,
  options,
}: {
  message: ChatMessageContent
  history: ChatMessage[]
  model: AIModel
  options?: ChatSendOptions
}): Record<string, unknown> {
  const { system, messages } = buildAnthropicMessages(message, history)
  return {
    model: resolveApiModelId(model),
    messages,
    system,
    stream: true,
    max_tokens: options?.max_completion_tokens ?? options?.max_tokens ?? 4096,
  }
}
