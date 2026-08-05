import type { ApiTranscriptMessage, AIModel, ChatCompletionRequest, ChatMessage, ChatMessageContent, ChatMessageContentPart, ChatSendOptions, Provider } from '../types'
import { resolveApiModelId } from '../utils'
import { normalizeApiTranscriptMessagesForProviderReplay } from '@/lib/ai/apiTranscript'
import { parseThinkingContent, stripThinkingContent } from '@/lib/ai/stripThinkingContent'
import { stripWebSearchStatusMarkup } from '@/lib/ai/webSearch/statusMarkup'
import {
  MAX_CURRENT_REQUEST_CONTENT_PARTS,
  MAX_CURRENT_REQUEST_MESSAGE_CHARS,
  sanitizeCurrentRequestTextContent,
} from '@/lib/ai/requestContext'
import { normalizeRenderableImageSrc } from '@/lib/markdown/renderableImagePolicy'
import { MANAGED_PROVIDER_ID } from '@/lib/ai/managedService'
import { getHistoryMessageRequestContent } from '@/lib/ai/requestContextHistoryContent'

export function isDeepSeekOpenAICompatible(provider: Provider, model: AIModel): boolean {
  const haystack = [provider.name, provider.apiHost, model.name, model.apiModelId].join(' ').toLowerCase()
  return haystack.includes('deepseek')
}

export function isClaudeModel(provider: Provider, model: AIModel): boolean {
  const haystack = [provider.id, provider.name, provider.apiHost, model.name, model.apiModelId].join(' ').toLowerCase()
  return haystack.includes('claude') || haystack.includes('anthropic')
}

export function isMoonshotModel(provider: Provider, model: AIModel): boolean {
  const haystack = [provider.id, provider.name, provider.apiHost, model.id, model.providerId, model.name, model.apiModelId].join(' ').toLowerCase()
  return haystack.includes('moonshot') || haystack.includes('kimi')
}

export function isGrokModel(provider: Provider, model: AIModel): boolean {
  const haystack = [provider.id, provider.name, provider.apiHost, model.id, model.providerId, model.name, model.apiModelId].join(' ').toLowerCase()
  return /(^|[\s._:/-])grok(?:[\s._:/-]|\d|$)/i.test(haystack) ||
    /(^|[\s._:/-])x[\s._-]?ai(?:[\s._:/-]|$)/i.test(haystack)
}

function isOfficialXaiProvider(provider: Provider): boolean {
  try {
    const hostname = new URL(provider.apiHost).hostname.toLowerCase()
    return hostname === 'api.x.ai' || hostname.endsWith('.x.ai')
  } catch {
    return provider.apiHost.toLowerCase().includes('api.x.ai')
  }
}

export function shouldReplayApiTranscript(provider: Provider, model: AIModel): boolean {
  return provider.id !== MANAGED_PROVIDER_ID &&
    provider.endpointType !== 'anthropic' &&
    isDeepSeekOpenAICompatible(provider, model)
}

export function shouldUseWebSearchTextProtocol(provider: Provider, model: AIModel): boolean {
  return provider.id === MANAGED_PROVIDER_ID || isClaudeModel(provider, model) || isMoonshotModel(provider, model)
}

export function shouldUseXaiNativeWebSearch(provider: Provider, model: AIModel): boolean {
  if (!isOfficialXaiProvider(provider)) return false
  return isGrokModel(provider, model)
}

export function buildChatCompletionOptions(options?: ChatSendOptions): Partial<ChatCompletionRequest> {
  return {
    ...(typeof options?.max_tokens === 'number' ? { max_tokens: options.max_tokens } : {}),
    ...(typeof options?.max_completion_tokens === 'number' ? { max_completion_tokens: options.max_completion_tokens } : {}),
  }
}

export function extractTextPrompt(content: ChatMessageContent): string {
  if (typeof content === 'string') return content.trim()

  return content
    .filter((part): part is Extract<typeof part, { type: 'text' }> => part.type === 'text')
    .map((part) => part.text.trim())
    .filter(Boolean)
    .join('\n\n')
    .trim()
}

function normalizeProviderImageUrl(value: string): string | null {
  const url = normalizeRenderableImageSrc(value)
  if (!url) return null

  const normalized = url.toLowerCase()
  return normalized.startsWith('http://') ||
    normalized.startsWith('https://') ||
    normalized.startsWith('data:')
    ? url
    : null
}

function normalizeImageDetail(value: unknown): 'auto' | 'low' | 'high' | null {
  return value === 'auto' || value === 'low' || value === 'high' ? value : null
}

export function sanitizeCurrentMessageContent(content: ChatMessageContent): ChatMessageContent {
  if (!Array.isArray(content)) {
    return sanitizeCurrentRequestTextContent(content)
  }

  let remainingTextChars = MAX_CURRENT_REQUEST_MESSAGE_CHARS
  const parts = content.slice(0, MAX_CURRENT_REQUEST_CONTENT_PARTS).flatMap((part): ChatMessageContentPart[] => {
    if (part.type === 'text') {
      if (remainingTextChars <= 0) return []
      const text = sanitizeCurrentRequestTextContent(part.text, remainingTextChars)
      remainingTextChars -= text.length
      return text ? [{ ...part, text }] : []
    }

    const url = normalizeProviderImageUrl(part.image_url.url)
    if (!url) return []

    const detail = normalizeImageDetail(part.image_url.detail)
    return [{
      type: 'image_url',
      image_url: {
        url,
        ...(detail ? { detail } : {}),
      },
    }]
  })

  return parts.length > 0 ? parts : ''
}

export function buildAssistantApiTranscriptFromRenderedContent(content: string): ApiTranscriptMessage[] {
  const parsed = parseThinkingContent(content)
  const reasoningParts = parsed.parts.filter(Boolean)
  if (reasoningParts.length === 0) return []

  return [{
    role: 'assistant',
    content: parsed.visible,
    reasoning_content: reasoningParts.join('\n\n'),
  }]
}

function stripRenderedThinkingFromAssistantContent(content: ChatMessageContent): ChatMessageContent {
  if (typeof content === 'string') {
    return stripWebSearchStatusMarkup(stripThinkingContent(content))
  }

  return content.map((part) => {
    if (part.type !== 'text') return part
    return { ...part, text: stripWebSearchStatusMarkup(stripThinkingContent(part.text)) }
  })
}

export function buildOpenAIChatRequest(
  message: ChatMessageContent,
  history: ChatMessage[],
  model: AIModel,
  provider: Provider,
  options?: ChatSendOptions
): ChatCompletionRequest {
  const replayApiTranscript = shouldReplayApiTranscript(provider, model)
  const apiMessages: ApiTranscriptMessage[] = history.flatMap((entry) => {
    const transcript = entry.apiTranscript ?? entry.versions?.[entry.currentVersionIndex]?.apiTranscript
    if (replayApiTranscript && entry.role === 'assistant' && transcript?.length) {
      const normalizedTranscript = normalizeApiTranscriptMessagesForProviderReplay(transcript)
      if (normalizedTranscript) return normalizedTranscript
    }
    return [{
      role: entry.role,
      content: entry.role === 'assistant'
        ? stripRenderedThinkingFromAssistantContent(entry.content)
        : getHistoryMessageRequestContent(entry),
    }]
  })
  apiMessages.push({ role: 'user', content: sanitizeCurrentMessageContent(message) })

  return {
    model: resolveApiModelId(model),
    messages: apiMessages,
    stream: true,
    ...buildChatCompletionOptions(options),
  }
}
