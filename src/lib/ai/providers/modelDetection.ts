import { AIErrorType, type Provider } from '../types'
import {
  extractErrorCode,
  extractErrorMessage,
  inferErrorTypeByMessage,
  isErrorNamed,
} from '../errorClassification'
import { buildAnthropicBaseUrl, buildOpenAIBaseUrl } from '../utils'
import { providerFetch } from '../providerHttp'
import { buildAnthropicHeaders } from './anthropic'
import { readBoundedProviderJsonResponse } from './boundedResponseText'
import { MAX_AI_MODEL_FIELD_CHARS, MAX_AI_PROVIDER_FETCHED_MODELS } from '@/lib/storage/unifiedStorageSaveTypes'

export type ProviderEndpointType = NonNullable<Provider['endpointType']>

export interface ModelFetchResult {
  models: string[]
  endpointType: ProviderEndpointType
}

interface ModelListResponse {
  ok: boolean
  status: number
  data: unknown
}

export const MAX_PROVIDER_MODEL_LIST_IDS = MAX_AI_PROVIDER_FETCHED_MODELS
export const MAX_PROVIDER_MODEL_ID_CHARS = MAX_AI_MODEL_FIELD_CHARS
const MODEL_FETCH_RESPONSE_TOO_LARGE_MESSAGE = 'AI provider response body is too large.'
const MODEL_FETCH_INVALID_RESPONSE_MESSAGE = 'AI provider returned an invalid model list response.'

type ModelFetchErrorMessageKey =
  | 'settings.ai.fetchModelsFailed'
  | 'settings.ai.fetchModelsResponseTooLarge'
  | 'settings.ai.fetchModelsInvalidResponse'
  | 'chat.error.authFailed'
  | 'chat.error.timeout'
  | 'chat.error.customProviderConnectionFailed'
  | 'chat.error.upstreamRateLimited'

export function getModelFetchErrorMessageKey(error: unknown): ModelFetchErrorMessageKey {
  const message = extractErrorMessage(error)
  const normalized = message.toLowerCase()
  const status = extractErrorCode(error) || normalized.match(/:\s*(\d{3})\s*$/)?.[1] || ''

  if (status === '401' || status === '403') return 'chat.error.authFailed'
  if (status === '429') return 'chat.error.upstreamRateLimited'
  if (/^5\d{2}$/.test(status)) return 'chat.error.customProviderConnectionFailed'
  if (normalized.includes('response body is too large')) {
    return 'settings.ai.fetchModelsResponseTooLarge'
  }
  if (
    normalized.includes('invalid model list response')
    || normalized.includes('invalid response metadata')
    || normalized.includes('invalid json')
    || normalized.includes('unexpected token')
    || normalized.includes('unexpected end of json')
    || isErrorNamed(error, 'SyntaxError')
  ) {
    return 'settings.ai.fetchModelsInvalidResponse'
  }

  if (isErrorNamed(error, 'AbortError')) return 'chat.error.timeout'
  switch (inferErrorTypeByMessage(message)) {
    case AIErrorType.AUTH_ERROR:
      return 'chat.error.authFailed'
    case AIErrorType.TIMEOUT:
      return 'chat.error.timeout'
    case AIErrorType.RATE_LIMIT:
      return 'chat.error.upstreamRateLimited'
    case AIErrorType.NETWORK_ERROR:
    case AIErrorType.SERVER_ERROR:
      return 'chat.error.customProviderConnectionFailed'
    default:
      return 'settings.ai.fetchModelsFailed'
  }
}

function createInvalidModelListResponseError(): Error {
  return new Error(MODEL_FETCH_INVALID_RESPONSE_MESSAGE)
}

function normalizeModelId(value: string): string {
  return value.slice(0, MAX_PROVIDER_MODEL_ID_CHARS).trim()
}

function normalizeModelIds(values: unknown[]): string[] {
  const seen = new Set<string>()
  const ids: string[] = []

  for (const value of values) {
    if (ids.length >= MAX_PROVIDER_MODEL_LIST_IDS) {
      break
    }

    const id = typeof value === 'string' ? normalizeModelId(value) : ''
    if (!id) continue
    const key = id.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    ids.push(id)
  }

  return ids
}

function extractModelId(value: unknown): string {
  if (typeof value === 'string') {
    return value
  }
  if (!value || typeof value !== 'object') {
    return ''
  }

  const record = value as { id?: unknown; name?: unknown; model?: unknown }
  if (typeof record.id === 'string') {
    return record.id
  }
  if (typeof record.name === 'string') {
    return record.name
  }
  if (typeof record.model === 'string') {
    return record.model
  }
  return ''
}

function normalizeModelList(values: unknown): string[] {
  if (!Array.isArray(values)) {
    return []
  }

  const ids: unknown[] = []
  for (const value of values) {
    if (ids.length >= MAX_PROVIDER_MODEL_LIST_IDS) {
      break
    }
    ids.push(extractModelId(value))
  }

  return normalizeModelIds(ids)
}

function isAbortError(error: unknown): boolean {
  return isErrorNamed(error, 'AbortError')
}

function createAbortError(): DOMException {
  return new DOMException('Aborted', 'AbortError')
}

function throwIfAborted(signal?: AbortSignal | null): void {
  if (!signal?.aborted) return
  throw createAbortError()
}

export async function detectProviderEndpointModels(
  provider: Provider,
  apiKey: string,
  signal?: AbortSignal,
): Promise<ModelFetchResult> {
  const orderedEndpointTypes: ProviderEndpointType[] = provider.endpointType === 'anthropic'
    ? ['anthropic', 'openai']
    : ['openai', 'anthropic']

  throwIfAborted(signal)
  let lastError: unknown
  for (const endpointType of orderedEndpointTypes) {
    try {
      const models = endpointType === 'anthropic'
        ? await getAnthropicModels(provider, apiKey, signal)
        : await getOpenAIModels(provider, apiKey, signal)

      throwIfAborted(signal)
      return { models, endpointType }
    } catch (error) {
      if (signal?.aborted) {
        throw createAbortError()
      }
      lastError = error
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Failed to fetch models')
}

async function getOpenAIModels(provider: Provider, apiKey: string, signal?: AbortSignal): Promise<string[]> {
  const url = `${buildOpenAIBaseUrl(provider.apiHost)}/models`
  const response = await fetchModelListResponse(url, {
    Authorization: `Bearer ${apiKey}`,
  }, signal)
  throwIfAborted(signal)

  if (!response.ok) {
    throw new Error(`Failed to fetch OpenAI-compatible models: ${response.status}`)
  }

  if (!response.data || typeof response.data !== 'object' || Array.isArray(response.data)) {
    throw createInvalidModelListResponseError()
  }
  const data = response.data as { data?: unknown; models?: unknown }
  if (Array.isArray(data.data)) {
    const dataModels = normalizeModelList(data.data)
    if (dataModels.length > 0 || !Array.isArray(data.models) || data.data.length === 0) {
      return dataModels
    }
  }
  if (Array.isArray(data.models)) {
    return normalizeModelList(data.models)
  }
  throw createInvalidModelListResponseError()
}

async function getAnthropicModels(provider: Provider, apiKey: string, signal?: AbortSignal): Promise<string[]> {
  const url = `${buildAnthropicBaseUrl(provider.apiHost)}/models`
  const response = await fetchModelListResponse(url, buildAnthropicHeaders(apiKey), signal)
  throwIfAborted(signal)

  if (!response.ok) {
    throw new Error(`Failed to fetch Anthropic models: ${response.status}`)
  }

  if (!response.data || typeof response.data !== 'object' || Array.isArray(response.data)) {
    throw createInvalidModelListResponseError()
  }
  const data = response.data as { data?: unknown }
  if (!Array.isArray(data.data)) {
    throw createInvalidModelListResponseError()
  }
  return normalizeModelList(data.data)
}

async function readModelListJson(response: Response, signal: AbortSignal): Promise<unknown> {
  throwIfAborted(signal)
  try {
    return await readBoundedProviderJsonResponse<unknown>(response, signal)
  } catch (error) {
    if (isAbortError(error) || signal.aborted) {
      throw error
    }
    if (
      error instanceof Error
      && error.message === MODEL_FETCH_RESPONSE_TOO_LARGE_MESSAGE
    ) {
      throw error
    }
    if (isErrorNamed(error, 'SyntaxError')) {
      throw createInvalidModelListResponseError()
    }
    throw error
  }
}

async function fetchModelListResponse(
  url: string,
  headers: Record<string, string>,
  externalSignal?: AbortSignal,
): Promise<ModelListResponse> {
  const controller = new AbortController()
  let didTimeout = false
  const timeoutId = setTimeout(() => {
    didTimeout = true
    controller.abort()
  }, 10000)
  const signal = externalSignal
    ? AbortSignal.any([externalSignal, controller.signal])
    : controller.signal

  try {
    throwIfAborted(externalSignal)
    const response = await providerFetch(url, {
      method: 'GET',
      headers,
      signal,
    })
    throwIfAborted(signal)

    if (!response.ok) {
      void response.body?.cancel().catch(() => undefined)
      return { ok: false, status: response.status, data: null }
    }

    return {
      ok: true,
      status: response.status,
      data: await readModelListJson(response, signal),
    }
  } catch (error) {
    if (externalSignal?.aborted) {
      throw createAbortError()
    }
    if (didTimeout && !externalSignal?.aborted && isAbortError(error)) {
      throw new Error('Model listing request timed out.')
    }
    throw error
  } finally {
    clearTimeout(timeoutId)
  }
}
