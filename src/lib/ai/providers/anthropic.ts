import { createAIError, parseAPIError, parseHTTPError } from '../errors'
import { AIErrorType, type AIModel, type ChatMessage, type ChatMessageContent, type ChatSendOptions, type Provider } from '../types'
import { buildAnthropicBaseUrl } from '../utils'
import { providerFetch } from '../providerHttp'
import { readBoundedProviderJsonResponse, readBoundedProviderResponseText } from './boundedResponseText'
import { stringifyProviderJsonRequestBody } from '@/lib/ai/providerRequestBody'
import { buildAnthropicMessageRequest } from './anthropicRequest'
import { consumeAnthropicStream, isAbortError } from './anthropicStream'
import { runAnthropicAgentToolLoop } from '@/lib/ai/computerUse/anthropicAgentToolLoop'

export const ANTHROPIC_VERSION = '2023-06-01'
const MAX_PROVIDER_ERROR_SUMMARY_CHARS = 8192

export function buildAnthropicHeaders(apiKey: string, includeContentType = false): Record<string, string> {
  return {
    'x-api-key': apiKey,
    'anthropic-version': ANTHROPIC_VERSION,
    'anthropic-dangerous-direct-browser-access': 'true',
    ...(includeContentType ? { 'Content-Type': 'application/json' } : {}),
  }
}

function summarizeError(error: unknown): string {
  let message = ''
  if (error instanceof Error) {
    message = error.message
  } else if (error && typeof error === 'object' && typeof (error as { message?: unknown }).message === 'string') {
    message = (error as { message: string }).message
  } else {
    switch (typeof error) {
      case 'string':
      case 'number':
      case 'boolean':
      case 'bigint':
      case 'symbol':
        message = String(error)
        break
      default:
        message = ''
    }
  }
  return (message || 'Unknown error').slice(0, MAX_PROVIDER_ERROR_SUMMARY_CHARS)
}

async function readResponseTextOrFallback(response: Response, signal?: AbortSignal): Promise<string> {
  return await readBoundedProviderResponseText(response, signal)
}

async function requestAnthropicJson({
  url,
  headers,
  body,
  timeoutMs,
  signal,
}: {
  url: string
  headers: Record<string, string>
  body: Record<string, unknown>
  timeoutMs: number
  signal?: AbortSignal
}): Promise<Record<string, unknown>> {
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
    return await readBoundedProviderJsonResponse<Record<string, unknown>>(response, controller.signal)
  } catch (error) {
    if (isAbortError(error) && (timedOut || signal?.aborted)) {
      if (timedOut) throw new Error('The AI request timed out.')
      throw error
    }
    const parsedError = parseAPIError(error)
    const detail = `Anthropic chat request to ${url} failed: ${summarizeError(error)}`
    if (parsedError.type === AIErrorType.NETWORK_ERROR) {
      throw createAIError(parsedError.type, parsedError.message, detail, parsedError.statusCode)
    }
    throw parsedError
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
      requestJson: (nextBody) => requestAnthropicJson({
        url,
        headers,
        body: nextBody,
        timeoutMs,
        signal,
      }),
    })
  }
  const controller = new AbortController()
  let timedOut = false
  const timeoutId = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)
  const forwardAbort = () => {
    if (!controller.signal.aborted) {
      controller.abort()
    }
  }
  signal?.addEventListener('abort', forwardAbort, { once: true })
  if (signal?.aborted) {
    forwardAbort()
  }

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

    return await consumeAnthropicStream(response, onChunk, controller.signal)
  } catch (error) {
    if (isAbortError(error) && (timedOut || signal?.aborted)) {
      if (timedOut) {
        throw new Error('The AI request timed out.')
      }
      throw error
    }
    const parsedError = parseAPIError(error)
    const detail = `Anthropic chat request to ${url} failed: ${summarizeError(error)}`
    if (parsedError.type === AIErrorType.NETWORK_ERROR) {
      throw createAIError(parsedError.type, parsedError.message, detail, parsedError.statusCode)
    }
    throw parsedError
  } finally {
    clearTimeout(timeoutId)
    signal?.removeEventListener('abort', forwardAbort)
  }
}
