import type { ProviderFetchInit } from './providerHttpTypes';
import { AI_PROVIDER_CONNECTION_FAILURE_CODE } from './providerHttpErrors';
import { raceWithAbort, throwIfAborted, createAbortError } from './providerHttpAbort';
import { aiTransportFetch } from './nativeFetchRuntime';

const PROVIDER_GET_RETRY_DELAYS_MS = [300];
const PROVIDER_FAST_FAILURE_RETRY_WINDOW_MS = 2000;
const MAX_PROVIDER_REQUEST_URL_CHARS = 16 * 1024;
const HTTP_AUTHORITY_URL_PATTERN = /^https?:\/\//i;
const UNSAFE_PROVIDER_URL_CHARS_PATTERN = /[\u0000-\u001F\u007F\u202A-\u202E\u2066-\u2069\uFFFD]/;

export function normalizeProviderRequestUrl(url: unknown): string {
  if (typeof url !== 'string' || url.length > MAX_PROVIDER_REQUEST_URL_CHARS) {
    throw new Error('AI provider request URL is not supported.');
  }
  const trimmed = url.trim();
  if (
    !trimmed ||
    trimmed.length > MAX_PROVIDER_REQUEST_URL_CHARS ||
    !HTTP_AUTHORITY_URL_PATTERN.test(trimmed) ||
    UNSAFE_PROVIDER_URL_CHARS_PATTERN.test(trimmed) ||
    trimmed.includes('\\')
  ) {
    throw new Error('AI provider request URL is not supported.');
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error('AI provider request URL is not supported.');
  }

  if (
    (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') ||
    parsed.username ||
    parsed.password
  ) {
    throw new Error('AI provider request URL is not supported.');
  }
  if (parsed.protocol === 'http:' && !isLoopbackProviderHostname(parsed.hostname)) {
    throw new Error('AI provider request URL must use HTTPS unless it targets the local computer.');
  }

  return parsed.toString();
}

function isLoopbackProviderHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  return normalized === 'localhost'
    || normalized.endsWith('.localhost')
    || normalized === '::1'
    || /^127(?:\.\d{1,3}){3}$/.test(normalized);
}

function delayProviderRetry(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    return Promise.reject(createAbortError());
  }

  return new Promise((resolve, reject) => {
    let timeout: ReturnType<typeof setTimeout>;
    const abort = () => {
      clearTimeout(timeout);
      reject(createAbortError());
    };
    const complete = () => {
      signal?.removeEventListener('abort', abort);
      resolve();
    };
    signal?.addEventListener('abort', abort, { once: true });
    timeout = setTimeout(complete, ms);
  });
}

export async function fetchWithGetRetry(url: string, init: ProviderFetchInit): Promise<Response> {
  const shouldRetry = init.method === 'GET';
  for (let attempt = 0; ; attempt += 1) {
    const startedAt = Date.now();
    try {
      throwIfAborted(init.signal);
      const response = await raceWithAbort(
        aiTransportFetch(url, { ...init, redirect: 'error' }),
        init.signal,
      );
      throwIfAborted(init.signal);
      return response;
    } catch (error) {
      const retryDelayMs = shouldRetry ? PROVIDER_GET_RETRY_DELAYS_MS[attempt] : undefined;
      const failedQuickly = Date.now() - startedAt <= PROVIDER_FAST_FAILURE_RETRY_WINDOW_MS;
      if (init.signal?.aborted) {
        throw error;
      }
      if (retryDelayMs == null || !failedQuickly) {
        throw new Error(AI_PROVIDER_CONNECTION_FAILURE_CODE);
      }
      await delayProviderRetry(retryDelayMs, init.signal);
    }
  }
}
