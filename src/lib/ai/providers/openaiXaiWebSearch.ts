import type { ApiTranscriptMessage, ChatCompletionRequest, ChatSendOptions } from '../types'
import { parseHTTPError } from '../errors'
import { providerFetch } from '../providerHttp'
import { stringifyProviderJsonRequestBody } from '@/lib/ai/providerRequestBody'
import { sanitizeWebSearchSourceUrl } from '@/lib/ai/webSearch/statusMarkup'
import {
  emitApiTranscript,
  emitChunk,
  emitWebSearchStatus,
  readResponseJson,
  readResponseTextOrFallback,
  rejectHtmlErrorContent,
  throwIfAborted,
} from './openaiRuntime'
import { buildChatCompletionOptions, extractTextPrompt } from './openaiRouting'
import { runWithOpenAIRequestTimeout } from './openaiRequestTimeout'

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function hostLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

function textFromResponseContent(value: unknown): string {
  if (typeof value === 'string') return value
  if (!Array.isArray(value)) return ''
  return value.map((part) => {
    if (typeof part === 'string') return part
    if (!isRecord(part)) return ''
    if (typeof part.text === 'string') return part.text
    if (typeof part.content === 'string') return part.content
    return ''
  }).join('')
}

function extractXaiResponsesText(payload: Record<string, unknown>): string {
  if (typeof payload.output_text === 'string') return payload.output_text

  const output = Array.isArray(payload.output) ? payload.output : []
  const parts: string[] = []
  for (const item of output) {
    if (!isRecord(item)) continue
    if (typeof item.content === 'string') {
      parts.push(item.content)
      continue
    }
    if (!Array.isArray(item.content)) continue
    for (const content of item.content) {
      if (!isRecord(content)) continue
      if (content.type === 'output_text' && typeof content.text === 'string') {
        parts.push(content.text)
      }
    }
  }
  return parts.join('')
}

const MAX_XAI_CITATION_SCAN_NODES = 20_000
const XAI_CITATION_KEYS = ['citations', 'citation', 'annotations', 'inline_citations', 'url_citation', 'source', 'sources', 'content', 'output'] as const

function collectXaiCitationUrlsFromValue(value: unknown, urls: string[]): void {
  const stack = [value]
  let visitedNodes = 0

  while (stack.length > 0 && urls.length < 8) {
    const current = stack.pop()
    visitedNodes += 1
    if (visitedNodes > MAX_XAI_CITATION_SCAN_NODES) return

    const safeUrl = sanitizeWebSearchSourceUrl(current)
    if (safeUrl) {
      if (!urls.includes(safeUrl)) urls.push(safeUrl)
      continue
    }

    if (Array.isArray(current)) {
      for (let index = current.length - 1; index >= 0; index -= 1) {
        stack.push(current[index])
      }
      continue
    }

    if (!isRecord(current)) continue

    const recordUrl = sanitizeWebSearchSourceUrl(current.url)
    if (recordUrl && !urls.includes(recordUrl)) {
      urls.push(recordUrl)
    }
    for (let index = XAI_CITATION_KEYS.length - 1; index >= 0; index -= 1) {
      const key = XAI_CITATION_KEYS[index]
      if (key in current) stack.push(current[key])
    }
  }
}

function extractXaiCitationUrls(payload: Record<string, unknown>): string[] {
  const urls: string[] = []
  collectXaiCitationUrlsFromValue(payload.citations, urls)
  collectXaiCitationUrlsFromValue(payload.inline_citations, urls)
  collectXaiCitationUrlsFromValue(payload.output, urls)
  return urls.slice(0, 8)
}

function buildXaiResponsesInput(messages: ApiTranscriptMessage[]): Array<Record<string, unknown>> {
  return messages
    .filter((message) => message.role === 'system' || message.role === 'user' || message.role === 'assistant')
    .map((message) => ({
      role: message.role,
      content: textFromResponseContent(message.content),
    }))
    .filter((message) => typeof message.content === 'string' && message.content.trim().length > 0)
}

export async function sendXaiNativeWebSearchMessage({
  baseUrl,
  headers,
  body,
  onChunk,
  signal,
  options,
  timeoutMs,
}: {
  baseUrl: string
  headers: Record<string, string>
  body: ChatCompletionRequest
  onChunk: (chunk: string) => void
  signal?: AbortSignal
  options?: ChatSendOptions
  timeoutMs: number
}): Promise<string> {
  throwIfAborted(signal)
  emitWebSearchStatus(
    options?.onWebSearchStatus,
    signal,
    { phase: 'searching', query: extractTextPrompt(body.messages[body.messages.length - 1]?.content ?? '') }
  )
  const payload = await runWithOpenAIRequestTimeout(signal, timeoutMs, async (requestSignal) => {
    const response = await providerFetch(`${baseUrl}/responses`, {
      method: 'POST',
      headers,
      body: stringifyProviderJsonRequestBody({
        model: body.model,
        input: buildXaiResponsesInput(body.messages),
        tools: [{ type: 'web_search' }],
        ...buildChatCompletionOptions(options),
      }),
      signal: requestSignal,
    })

    if (!response.ok) {
      const errorText = await readResponseTextOrFallback(response, requestSignal)
      let errorBody
      try {
        errorBody = JSON.parse(errorText)
      } catch {
        errorBody = { message: errorText }
      }
      throw parseHTTPError(response.status, errorBody)
    }

    return await readResponseJson<Record<string, unknown>>(response, requestSignal)
  })
  throwIfAborted(signal)
  const content = rejectHtmlErrorContent(extractXaiResponsesText(payload))
  if (!content.trim()) {
    throw new Error('The model completed web search but returned no visible answer.')
  }
  const citationUrls = extractXaiCitationUrls(payload)
  if (citationUrls.length > 0) {
    emitWebSearchStatus(options?.onWebSearchStatus, signal, {
      phase: 'results',
      results: citationUrls.slice(0, 5).map((url) => ({ title: hostLabel(url), url, snippet: '', publishedAt: null })),
      metrics: { resultCount: citationUrls.length },
    })
    emitWebSearchStatus(options?.onWebSearchStatus, signal, {
      phase: 'complete',
      urls: citationUrls,
      metrics: { successCount: citationUrls.length },
    })
  }
  emitChunk(onChunk, signal, content)
  emitApiTranscript(options?.onApiTranscript, signal, [{ role: 'assistant', content }])
  return content
}
