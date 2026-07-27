import { accountCommands } from '@/lib/account/desktopCommands';
import { hasElectronDesktopBridge } from '@/lib/desktop/backend';

import {
  MANAGED_API_BASE,
  MANAGED_AUTH_REQUIRED_ERROR,
  MANAGED_PROVIDER_ID,
  MANAGED_PROVIDER_NAME,
} from './managed/constants';
import {
  getManagedServiceErrorMessage,
  isManagedServiceRecoverableError,
} from './managed/errors';
import {
  createManagedProvider,
  normalizeManagedModelCatalogPayload,
  normalizeManagedBudgetPayload,
  normalizeManagedModelsVersionPayload,
} from './managed/normalizers';
import type {
  ManagedModelCatalog,
  ManagedBudgetPayload,
  ManagedBudgetStatus,
  ManagedModelsPayload,
  ManagedModelsVersionPayload,
} from './managed/types';
import {
  requestManagedWebBinaryJson,
  requestManagedWebJson,
  requestManagedWebStream,
} from './managed/webRequests';
import {
  assertProviderJsonRequestBodySize,
  stringifyProviderJsonRequestBody,
} from './providerRequestBody';
import type { OpenAIStreamToolResult } from './webSearch/openAIToolTypes';
import { normalizeManagedStreamResult } from './managed/streamResult';

const MAX_MANAGED_CHAT_MESSAGES = 64
const MANAGED_MODEL_CATALOG_CACHE_TTL_MS = 60_000

let managedModelCatalogCache: {
  catalog: ManagedModelCatalog
  expiresAt: number
} | null = null
let managedModelCatalogInFlight: Promise<ManagedModelCatalog> | null = null
let managedModelCatalogCacheGeneration = 0

export {
  MANAGED_API_BASE,
  MANAGED_AUTH_REQUIRED_ERROR,
  MANAGED_PROVIDER_ID,
  MANAGED_PROVIDER_NAME,
  createManagedProvider,
  getManagedServiceErrorMessage,
  isManagedServiceRecoverableError,
};
export type { ManagedBudgetStatus };

export function isManagedProviderId(providerId: string | null | undefined): boolean {
  return providerId === MANAGED_PROVIDER_ID;
}

export function isManagedModelId(modelId: string | null | undefined): boolean {
  return modelId === MANAGED_PROVIDER_ID || Boolean(modelId?.startsWith(`${MANAGED_PROVIDER_ID}:`));
}

export async function fetchManagedModels() {
  return (await fetchManagedModelCatalog()).models;
}

export function clearManagedModelCatalogCache(): void {
  managedModelCatalogCache = null
  managedModelCatalogInFlight = null
  managedModelCatalogCacheGeneration += 1
}

async function loadManagedModelCatalog(): Promise<ManagedModelCatalog> {
  if (hasElectronDesktopBridge()) {
    const payload = (await accountCommands.getManagedModels()) as ManagedModelsPayload | undefined;
    return normalizeManagedModelCatalogPayload(payload ?? {});
  }

  const payload = await requestManagedWebJson<ManagedModelsPayload>('/models', {
    method: 'GET',
  });
  return normalizeManagedModelCatalogPayload(payload ?? {});
}

export async function fetchManagedModelCatalog(options: { forceRefresh?: boolean } = {}): Promise<ManagedModelCatalog> {
  const now = Date.now()
  if (options.forceRefresh) {
    clearManagedModelCatalogCache()
  }
  if (!options.forceRefresh && managedModelCatalogCache && managedModelCatalogCache.expiresAt > now) {
    return managedModelCatalogCache.catalog
  }
  if (!options.forceRefresh && managedModelCatalogInFlight) {
    return managedModelCatalogInFlight
  }

  const cacheGeneration = managedModelCatalogCacheGeneration
  let request: Promise<ManagedModelCatalog>
  request = loadManagedModelCatalog()
    .then((catalog) => {
      if (cacheGeneration === managedModelCatalogCacheGeneration) {
        managedModelCatalogCache = {
          catalog,
          expiresAt: Date.now() + MANAGED_MODEL_CATALOG_CACHE_TTL_MS,
        }
      }
      return catalog
    })
    .finally(() => {
      if (managedModelCatalogInFlight === request) {
        managedModelCatalogInFlight = null
      }
    })

  managedModelCatalogInFlight = request
  return request
}

export async function fetchManagedModelsVersion(): Promise<string | null> {
  let version: string | null
  if (hasElectronDesktopBridge()) {
    const payload = (await accountCommands.getManagedModelsVersion()) as ManagedModelsVersionPayload | undefined;
    version = normalizeManagedModelsVersionPayload(payload ?? {});
  } else {
    const payload = await requestManagedWebJson<ManagedModelsVersionPayload>('/models/version', {
      method: 'GET',
    });
    version = normalizeManagedModelsVersionPayload(payload ?? {});
  }

  const cachedVersion = managedModelCatalogCache?.catalog.version || null
  if (version && cachedVersion) {
    if (version === cachedVersion) {
      managedModelCatalogCache!.expiresAt = Date.now() + MANAGED_MODEL_CATALOG_CACHE_TTL_MS
    } else {
      clearManagedModelCatalogCache()
    }
  }
  return version;
}

export async function fetchManagedBudget(): Promise<ManagedBudgetStatus> {
  const payload = hasElectronDesktopBridge()
    ? ((await accountCommands.getManagedBudget()) as ManagedBudgetPayload | undefined)
    : await requestManagedWebJson<ManagedBudgetPayload>('/budget', { method: 'GET' });
  return normalizeManagedBudgetPayload(payload ?? {})
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function sanitizeManagedChatMessage(message: unknown): unknown {
  if (!isRecord(message)) {
    return message
  }

  const nextMessage = { ...message }
  delete nextMessage.function_call
  if (Array.isArray(nextMessage.tool_calls) && nextMessage.tool_calls.length === 0) {
    delete nextMessage.tool_calls
  }
  if (nextMessage.role !== 'tool') {
    delete nextMessage.tool_call_id
  }
  const hasAssistantMetadata = Boolean(nextMessage.reasoning_content) ||
    (Array.isArray(nextMessage.tool_calls) && nextMessage.tool_calls.length > 0)
  if (nextMessage.role === 'assistant' && nextMessage.content == null && hasAssistantMetadata) {
    nextMessage.content = ''
  }
  if (
    (nextMessage.role === 'system' || nextMessage.role === 'user' || nextMessage.role === 'tool') &&
    nextMessage.content == null
  ) {
    nextMessage.content = ''
  }
  return nextMessage
}

function isLegacyFunctionTranscriptMessage(message: unknown): boolean {
  if (!isRecord(message)) return false
  return message.role === 'function' || isRecord(message.function_call)
}

function selectManagedChatMessages(messages: unknown[]): unknown[] {
  if (messages.length <= MAX_MANAGED_CHAT_MESSAGES) {
    return messages
  }

  const first = messages[0]
  if (isRecord(first) && first.role === 'system') {
    return [first, ...messages.slice(-(MAX_MANAGED_CHAT_MESSAGES - 1))]
  }
  return messages.slice(-MAX_MANAGED_CHAT_MESSAGES)
}

function sanitizeManagedChatCompletionBody(body: object): Record<string, unknown> {
  const nextBody = isRecord(body) ? body : {}
  const managedBody = { ...nextBody }
  delete managedBody.functions
  delete managedBody.function_call
  if (!Array.isArray(managedBody.messages)) {
    return managedBody
  }
  return {
    ...managedBody,
    messages: selectManagedChatMessages(
      managedBody.messages.filter((message) => !isLegacyFunctionTranscriptMessage(message)),
    ).map(sanitizeManagedChatMessage),
  }
}

export async function requestManagedChatCompletion(
  body: object,
  signal?: AbortSignal
): Promise<Record<string, unknown>> {
  const sanitizedBody = sanitizeManagedChatCompletionBody(body)
  if (hasElectronDesktopBridge()) {
    assertProviderJsonRequestBodySize(sanitizedBody)
    return (await (signal
      ? accountCommands.managedChatCompletion(sanitizedBody, signal)
      : accountCommands.managedChatCompletion(sanitizedBody))) as Record<string, unknown>
  }
  return await requestManagedWebJson<Record<string, unknown>>('/chat/completions', {
    method: 'POST',
    body: stringifyProviderJsonRequestBody(sanitizedBody),
    signal,
  })
}

export async function reportManagedDesktopClientDiagnostic(body: Record<string, unknown>): Promise<void> {
  if (!hasElectronDesktopBridge()) return;
  await accountCommands.reportManagedClientDiagnostic(body);
}

export async function requestManagedImageGeneration(
  body: object,
  signal?: AbortSignal
): Promise<Record<string, unknown>> {
  if (hasElectronDesktopBridge()) {
    assertProviderJsonRequestBodySize(body)
    return (await accountCommands.managedImageGeneration(body, signal)) as Record<string, unknown>
  }
  return await requestManagedWebJson<Record<string, unknown>>('/images/generations', {
    method: 'POST',
    body: stringifyProviderJsonRequestBody(body),
    timeoutMs: 300_000,
    signal,
  })
}

export async function requestManagedImageEdit(
  body: BodyInit,
  headers: Record<string, string>,
  signal?: AbortSignal
): Promise<Record<string, unknown>> {
  return hasElectronDesktopBridge()
    ? ((await accountCommands.managedImageEdit(body, headers, signal)) as Record<string, unknown>)
    : await requestManagedWebBinaryJson<Record<string, unknown>>('/images/edits', body, headers, signal)
}

async function requestManagedChatCompletionStreamResult(
  body: Record<string, unknown>,
  onChunk: (chunk: string) => void,
  signal?: AbortSignal
): Promise<OpenAIStreamToolResult> {
  const requestId = `managed-stream-${Date.now()}-${crypto.randomUUID()}`
  const sanitizedBody = sanitizeManagedChatCompletionBody(body)
  if (hasElectronDesktopBridge()) {
    assertProviderJsonRequestBodySize(sanitizedBody)
    const result = await accountCommands.managedChatCompletionStream(sanitizedBody, onChunk, signal, requestId)
    return normalizeManagedStreamResult(result)
  }
  const result = await requestManagedWebStream('/chat/completions', sanitizedBody, onChunk, signal)
  return normalizeManagedStreamResult(result)
}

export async function requestManagedChatCompletionStream(
  body: Record<string, unknown>,
  onChunk: (chunk: string) => void,
  signal?: AbortSignal
): Promise<string> {
  return (await requestManagedChatCompletionStreamResult(body, onChunk, signal)).content
}

export async function requestManagedChatCompletionStreamWithTools(
  body: Record<string, unknown>,
  onChunk: (chunk: string) => void,
  signal?: AbortSignal
): Promise<OpenAIStreamToolResult> {
  return await requestManagedChatCompletionStreamResult(body, onChunk, signal)
}
