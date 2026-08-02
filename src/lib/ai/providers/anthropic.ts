import { parseAPIError, parseHTTPError } from '../errors'
import { type AIModel, type ChatMessage, type ChatMessageContent, type ChatSendOptions, type Provider } from '../types'
import { buildAnthropicBaseUrl } from '../utils'
import { providerFetch } from '../providerHttp'
import { readBoundedProviderResponseText } from './boundedResponseText'
import { stringifyProviderJsonRequestBody } from '@/lib/ai/providerRequestBody'
import { buildAnthropicMessageRequest } from './anthropicRequest'
import { consumeAnthropicStream, consumeAnthropicStreamResult, isAbortError } from './anthropicStream'
import { runAnthropicAgentToolLoop } from '@/lib/ai/computerUse/anthropicAgentToolLoop'

export const ANTHROPIC_VERSION = '2023-06-01'

export function buildAnthropicHeaders(apiKey: string, includeContentType = false): Record<string, string> {
  return {
    'x-api-key': apiKey,
    'anthropic-version': ANTHROPIC_VERSION,
    'anthropic-dangerous-direct-browser-access': 'true',
    ...(includeContentType ? { 'Content-Type': 'application/json' } : {}),
  }
}

async function readResponseTextOrFallback(response: Response, signal?: AbortSignal): Promise<string> {
  return await readBoundedProviderResponseText(response, signal)
}

async function requestAnthropic<T>({
  url,
  headers,
  body,
  timeoutMs,
  signal,
  consume,
}: {
  url: string
  headers: Record<string, string>
  body: Record<string, unknown>
  timeoutMs: number
  signal?: AbortSignal
  consume: (response: Response, signal: AbortSignal) => Promise<T>
}): Promise<T> {
  const controller = new AbortController()
  let timedOut = false
  const timeoutId = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)
  const forwardAbort = () => controller.abort()
  signal?.addEventListener('abort', forwardAbort, { once: true })
  if (signal?.aborted) forwardAbort()

  try {
    const response = await providerFetch(url, {
      method: 'POST',
      headers,
      body: stringifyProviderJsonRequestBody(body),
      signal: controller.signal,
    })
    if (!response.ok) {
      const errorText = await readResponseTextOrFallback(response, controller.signal)
      let errorBody
      try {
        errorBody = JSON.parse(errorText)
      } catch {
        errorBody = { message: errorText }
      }
      throw parseHTTPError(response.status, errorBody)
    }
    return await consume(response, controller.signal)
  } catch (error) {
    if (isAbortError(error) && (timedOut || signal?.aborted)) {
      if (timedOut) throw new Error('The AI request timed out.')
      throw error
    }
    throw parseAPIError(error)
  } finally {
    clearTimeout(timeoutId)
    signal?.removeEventListener('abort', forwardAbort)
  }
}

export async function sendAnthropicMessage({
  message,
  history,
  model,
  provider,
  apiKey,
  timeoutMs,
  onChunk,
  signal,
  options,
}: {
  message: ChatMessageContent
  history: ChatMessage[]
  model: AIModel
  provider: Provider
  apiKey: string
  timeoutMs: number
  onChunk: (chunk: string) => void
  signal?: AbortSignal
  options?: ChatSendOptions
}): Promise<string> {
  const baseUrl = buildAnthropicBaseUrl(provider.apiHost)
  const url = `${baseUrl}/messages`
  const body = buildAnthropicMessageRequest({ message, history, model, options })
  const headers = buildAnthropicHeaders(apiKey, true)
  if (options?.computerUseEnabled) {
    return await runAnthropicAgentToolLoop({
      approvalContext: options.computerUseApprovalContext,
      body,
      defaultCwd: options.computerUseCwd,
      onChunk,
      onApiTranscript: options.onApiTranscript,
      onCommandStatus: options.onComputerCommandStatus,
      onWebSearchStatus: options.onWebSearchStatus,
      signal,
      webSearchEnabled: options.webSearchEnabled === true,
      requestResult: async (nextBody, nextOnChunk) => {
        const result = await requestAnthropic({
          url,
          headers,
          body: { ...nextBody, stream: true },
          timeoutMs,
          signal,
          consume: (response, requestSignal) =>
            consumeAnthropicStreamResult(response, nextOnChunk, requestSignal),
        })
        return { content: result.blocks }
      },
    })
  }
  return await requestAnthropic({
    url,
    headers,
    body,
    timeoutMs,
    signal,
    consume: (response, requestSignal) => consumeAnthropicStream(response, onChunk, requestSignal),
  })
}
