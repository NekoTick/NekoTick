import { MANAGED_API_BASE } from './constants';
import { normalizeManagedPublicErrorCode, parseManagedError } from './errors';
import {
  fetchManagedJsonWithRetry,
  MANAGED_JSON_TIMEOUT_MS,
  MANAGED_STREAM_TIMEOUT_MS,
  normalizeManagedAbortError,
  raceManagedRequest,
  readManagedJson,
  throwIfExternallyAborted,
  throwIfManagedRequestAborted,
} from './webRequestRuntime';
import { stringifyProviderJsonRequestBody } from '@/lib/ai/providerRequestBody';
import { consumeOpenAIStreamWithTools } from '@/lib/ai/webSearch/openAIStreamWithTools';
import type { OpenAIStreamToolResult } from '@/lib/ai/webSearch/openAIToolTypes';
import { aiTransportFetch } from '@/lib/ai/nativeFetchRuntime';

const MANAGED_BACKEND_STREAM_ERROR = Symbol('managedBackendStreamError');

interface ManagedJsonRequestInit extends RequestInit {
  timeoutMs?: number;
}

type ManagedBackendStreamError = Error & {
  [MANAGED_BACKEND_STREAM_ERROR]?: true;
  errorCode?: string;
};

function publicManagedStreamErrorMessage(message: string | undefined, errorCode: string | undefined): string {
  const normalizedCode = normalizeManagedPublicErrorCode(errorCode);
  switch (normalizedCode) {
    case 'points_exhausted':
    case 'inactive_points':
    case 'insufficient_points':
      return 'MANAGED_QUOTA_EXHAUSTED';
    case 'upstream_rate_limited':
      return 'UPSTREAM_RATE_LIMITED';
    case 'upstream_unavailable':
      return 'UPSTREAM_UNAVAILABLE';
    case 'unsupported_message_content':
    case 'unsupported_model_input':
      return 'UNSUPPORTED_MODEL_INPUT';
    case 'unsupported_tool_calling':
      return 'UNSUPPORTED_TOOL_CALLING';
    case 'invalid_request':
      return 'INVALID_REQUEST';
    default:
      return message === 'UPSTREAM_UNAVAILABLE' || message === 'UPSTREAM_RATE_LIMITED'
        ? message
        : 'Managed API request failed: HTTP 502';
  }
}

export async function requestManagedWebJson<T>(path: string, init?: ManagedJsonRequestInit): Promise<T> {
  const timeoutController = new AbortController();
  const timeoutMs = typeof init?.timeoutMs === 'number' && Number.isFinite(init.timeoutMs)
    ? Math.max(0, init.timeoutMs)
    : MANAGED_JSON_TIMEOUT_MS;
  const timer = timeoutMs > 0
    ? setTimeout(() => timeoutController.abort(), timeoutMs)
    : null;
  const fetchInit: RequestInit = { ...(init ?? {}) };
  delete (fetchInit as ManagedJsonRequestInit).timeoutMs;
  const externalSignal = fetchInit.signal;

  const combinedSignal = externalSignal
    ? AbortSignal.any([externalSignal, timeoutController.signal])
    : timeoutController.signal;

  try {
    throwIfExternallyAborted(externalSignal);
    const requestInit: RequestInit = {
      ...fetchInit,
      signal: combinedSignal,
      cache: 'no-store',
      credentials: 'include',
      redirect: 'error',
      headers: {
        Accept: 'application/json',
        ...(fetchInit.body ? { 'Content-Type': 'application/json' } : {}),
        ...(fetchInit.headers ?? {}),
      },
    };
    const response = await fetchManagedJsonWithRetry(
      `${MANAGED_API_BASE}${path}`,
      requestInit,
      timeoutController,
      externalSignal,
    );
    throwIfManagedRequestAborted(timeoutController, externalSignal);

    if (!response.ok) {
      const managedError = await raceManagedRequest(
        parseManagedError(response, combinedSignal),
        timeoutController,
        externalSignal,
      );
      throwIfManagedRequestAborted(timeoutController, externalSignal);
      throw managedError;
    }

    return await readManagedJson<T>(response, timeoutController, externalSignal);
  } catch (error) {
    return normalizeManagedAbortError(error, timeoutController, externalSignal);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function requestManagedWebBinaryJson<T>(
  path: string,
  body: BodyInit,
  headers: Record<string, string>,
  signal?: AbortSignal,
  timeoutMs = MANAGED_STREAM_TIMEOUT_MS
): Promise<T> {
  const timeoutController = new AbortController();
  const timer = timeoutMs > 0
    ? setTimeout(() => timeoutController.abort(), timeoutMs)
    : null;
  const combinedSignal = signal
    ? AbortSignal.any([signal, timeoutController.signal])
    : timeoutController.signal;

  try {
    throwIfExternallyAborted(signal);
    const response = await raceManagedRequest(aiTransportFetch(`${MANAGED_API_BASE}${path}`, {
      method: 'POST',
      cache: 'no-store',
      credentials: 'include',
      redirect: 'error',
      signal: combinedSignal,
      headers: {
        Accept: 'application/json',
        ...headers,
      },
      body,
    }), timeoutController, signal);
    throwIfManagedRequestAborted(timeoutController, signal);

    if (!response.ok) {
      const managedError = await raceManagedRequest(parseManagedError(response, combinedSignal), timeoutController, signal);
      throwIfManagedRequestAborted(timeoutController, signal);
      throw managedError;
    }

    return await readManagedJson<T>(response, timeoutController, signal);
  } catch (error) {
    return normalizeManagedAbortError(error, timeoutController, signal);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function requestManagedWebStream(
  path: string,
  body: Record<string, unknown>,
  onChunk: (chunk: string) => void,
  signal?: AbortSignal
): Promise<OpenAIStreamToolResult> {
  const timeoutController = new AbortController();
  const timer = setTimeout(() => timeoutController.abort(), MANAGED_STREAM_TIMEOUT_MS);
  const combinedSignal = signal
    ? AbortSignal.any([signal, timeoutController.signal])
    : timeoutController.signal;

  try {
    throwIfExternallyAborted(signal);
    const response = await raceManagedRequest(aiTransportFetch(`${MANAGED_API_BASE}${path}`, {
      method: 'POST',
      cache: 'no-store',
      credentials: 'include',
      redirect: 'error',
      signal: combinedSignal,
      headers: {
        Accept: 'text/event-stream',
        'Content-Type': 'application/json',
      },
      body: stringifyProviderJsonRequestBody(body),
    }), timeoutController, signal);
    throwIfManagedRequestAborted(timeoutController, signal);

    if (!response.ok) {
      const managedError = await raceManagedRequest(parseManagedError(response, combinedSignal), timeoutController, signal);
      throwIfManagedRequestAborted(timeoutController, signal);
      throw managedError;
    }

    if (!response.body) {
      throw new Error('Managed API response body is null');
    }

    const result = await consumeOpenAIStreamWithTools(response, onChunk, {
      signal: combinedSignal,
      mapErrorPayload(message, code) {
        const error = new Error(publicManagedStreamErrorMessage(message, code)) as ManagedBackendStreamError;
        error[MANAGED_BACKEND_STREAM_ERROR] = true;
        const normalizedCode = normalizeManagedPublicErrorCode(code);
        if (normalizedCode) {
          error.errorCode = normalizedCode;
        }
        return error;
      },
    });
    throwIfManagedRequestAborted(timeoutController, signal);
    return result;
  } catch (error) {
    return normalizeManagedAbortError(error, timeoutController, signal);
  } finally {
    clearTimeout(timer);
  }
}
