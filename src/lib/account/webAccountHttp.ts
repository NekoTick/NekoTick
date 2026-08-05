import {
  isNativeCapacitorRuntime,
  requestNativeAccountHttp,
  type NativeAccountHttpResponse,
} from './capacitorRuntime';

const TRANSIENT_ACCOUNT_RETRY_DELAYS_MS = [250, 750];
const ACCOUNT_REQUEST_TIMEOUT_MS = 15_000;
const MAX_ACCOUNT_RESPONSE_BODY_BYTES = 64 * 1024;
const MAX_ACCOUNT_CONTENT_LENGTH_CHARS = 32;

function createAccountTimeoutError(): Error {
  return new Error('Account API request timed out.');
}

function throwIfTimedOut(signal: AbortSignal): void {
  if (!signal.aborted) return;
  throw createAccountTimeoutError();
}

async function raceAccountRequest<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  throwIfTimedOut(signal);
  promise.catch(() => undefined);

  return await new Promise<T>((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      signal.removeEventListener('abort', abort);
    };
    const settle = (callback: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback();
    };
    const abort = () => {
      settle(() => reject(createAccountTimeoutError()));
    };

    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) {
      abort();
      return;
    }

    promise.then(
      (value) => {
        settle(() => {
          try {
            throwIfTimedOut(signal);
            resolve(value);
          } catch (error) {
            reject(error);
          }
        });
      },
      (error) => {
        settle(() => {
          try {
            throwIfTimedOut(signal);
            reject(error);
          } catch (timeoutError) {
            reject(timeoutError);
          }
        });
      }
    );
  });
}

function serializeNativeResponseBody(response: NativeAccountHttpResponse): BodyInit | null {
  if ([204, 205, 304].includes(response.status)) return null;
  if (typeof response.data === 'string') return response.data;
  if (response.data === null || response.data === undefined) return null;
  return JSON.stringify(response.data);
}

async function fetchNativeAccountResponse(
  input: RequestInfo | URL,
  init: RequestInit,
): Promise<Response> {
  if (typeof input !== 'string' && !(input instanceof URL)) {
    throw new Error('Native account HTTP requires a URL.');
  }
  if (init.body !== undefined && init.body !== null && typeof init.body !== 'string') {
    throw new Error('Native account HTTP requires a string body.');
  }

  const headers: Record<string, string> = {};
  new Headers(init.headers).forEach((value, key) => {
    headers[key] = value;
  });
  const nativeResponse = await requestNativeAccountHttp({
    url: input.toString(),
    method: init.method ?? 'GET',
    headers,
    data: typeof init.body === 'string' ? init.body : undefined,
    connectTimeout: ACCOUNT_REQUEST_TIMEOUT_MS,
    readTimeout: ACCOUNT_REQUEST_TIMEOUT_MS,
    responseType: 'text',
  });

  return new Response(serializeNativeResponseBody(nativeResponse), {
    status: nativeResponse.status,
    headers: nativeResponse.headers,
  });
}

export async function withAccountRequestTimeout<T>(
  operation: (signal: AbortSignal) => Promise<T>
): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => {
    controller.abort();
  }, ACCOUNT_REQUEST_TIMEOUT_MS);

  try {
    return await operation(controller.signal);
  } catch (error) {
    if (controller.signal.aborted) {
      throw createAccountTimeoutError();
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

async function fetchAccountResponse(input: RequestInfo | URL, init: RequestInit = {}, signal: AbortSignal): Promise<Response> {
  throwIfTimedOut(signal);
  const request = isNativeCapacitorRuntime()
    ? fetchNativeAccountResponse(input, init)
    : fetch(input, { ...init, signal });
  const response = await raceAccountRequest(request, signal);
  throwIfTimedOut(signal);
  return response;
}

function readContentLength(response: Response): number | null {
  const rawContentLength = response.headers?.get('content-length');
  if (!rawContentLength) {
    return null;
  }

  if (rawContentLength.length > MAX_ACCOUNT_CONTENT_LENGTH_CHARS) {
    return null;
  }
  const trimmed = rawContentLength.trim();
  if (!/^\d+$/.test(trimmed)) {
    return null;
  }
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

async function readAccountResponseText(response: Response, signal: AbortSignal): Promise<string> {
  throwIfTimedOut(signal);
  const contentLength = readContentLength(response);
  if (contentLength !== null && contentLength > MAX_ACCOUNT_RESPONSE_BODY_BYTES) {
    void response.body?.cancel().catch(() => undefined);
    throw new Error('Account API response body is too large.');
  }

  if (!response.body) {
    return '';
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytesRead = 0;
  let text = '';
  const cancelReader = () => {
    void reader.cancel(createAccountTimeoutError()).catch(() => undefined);
  };
  signal.addEventListener('abort', cancelReader, { once: true });

  try {
    while (true) {
      const { done, value } = await raceAccountRequest(reader.read(), signal);
      throwIfTimedOut(signal);
      if (done) {
        break;
      }

      bytesRead += value.byteLength;
      if (bytesRead > MAX_ACCOUNT_RESPONSE_BODY_BYTES) {
        void reader.cancel().catch(() => undefined);
        throw new Error('Account API response body is too large.');
      }
      text += decoder.decode(value, { stream: true });
    }

    return text + decoder.decode();
  } finally {
    signal.removeEventListener('abort', cancelReader);
    reader.releaseLock();
  }
}

export async function readAccountJson<T>(response: Response, signal: AbortSignal): Promise<T> {
  throwIfTimedOut(signal);
  const text = await readAccountResponseText(response, signal);
  throwIfTimedOut(signal);
  return JSON.parse(text) as T;
}

export async function fetchAccountJson<T>(
  input: RequestInfo | URL,
  init: RequestInit = {}
): Promise<{ response: Response; data: T }> {
  return await withAccountRequestTimeout(async (signal) => {
    const response = await fetchAccountResponse(input, init, signal);
    const data = await readAccountJson<T>(response, signal);
    return { response, data };
  });
}

export async function fetchAccount(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  return await withAccountRequestTimeout((signal) => fetchAccountResponse(input, init, signal));
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isTransientAccountNetworkError(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase();
  if (error instanceof DOMException && error.name === 'AbortError') {
    return false;
  }
  return (
    error instanceof TypeError ||
    message.includes('failed to fetch') ||
    message.includes('fetch failed') ||
    message.includes('networkerror') ||
    message.includes('network request failed') ||
    message.includes('load failed') ||
    message.includes('err_internet_disconnected')
  );
}

export async function retryTransientAccountNetworkError<T>(operation: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= TRANSIENT_ACCOUNT_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isTransientAccountNetworkError(error) || attempt >= TRANSIENT_ACCOUNT_RETRY_DELAYS_MS.length) {
        throw error;
      }
      await delay(TRANSIENT_ACCOUNT_RETRY_DELAYS_MS[attempt] ?? 0);
    }
  }
  throw lastError;
}

export async function readJsonErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const payload = await withAccountRequestTimeout((signal) => readAccountJson<{ error?: string }>(response, signal));
    if (typeof payload.error === 'string' && payload.error.trim()) {
      return payload.error;
    }
  } catch {
  }
  return fallback;
}
