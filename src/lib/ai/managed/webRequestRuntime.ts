import { isErrorNamed } from '../errorClassification';

export const MANAGED_JSON_TIMEOUT_MS = 30_000;
export const MANAGED_STREAM_TIMEOUT_MS = 300_000;

const MANAGED_GET_RETRY_DELAYS_MS = [300];
const MANAGED_FAST_FAILURE_RETRY_WINDOW_MS = 2000;
const MAX_MANAGED_JSON_RESPONSE_BODY_BYTES = 64 * 1024 * 1024;
const MAX_MANAGED_CONTENT_LENGTH_CHARS = 32;

function isAbortError(error: unknown): boolean {
  return isErrorNamed(error, 'AbortError');
}

function createAbortError(): DOMException {
  return new DOMException('Aborted', 'AbortError');
}

function createManagedTimeoutError(): Error {
  return new Error('Managed API request timed out.');
}

function createManagedResponseTooLargeError(): Error {
  return new Error('Managed API response body is too large.');
}

export function throwIfExternallyAborted(signal?: AbortSignal | null): void {
  if (!signal?.aborted) return;
  throw createAbortError();
}

export function throwIfManagedRequestAborted(
  timeoutController: AbortController,
  externalSignal?: AbortSignal | null,
): void {
  if (!timeoutController.signal.aborted && !externalSignal?.aborted) return;
  throw createAbortError();
}

export function normalizeManagedAbortError(
  error: unknown,
  timeoutController: AbortController,
  externalSignal?: AbortSignal | null,
): never {
  if (isAbortError(error) && timeoutController.signal.aborted && !externalSignal?.aborted) {
    throw createManagedTimeoutError();
  }
  throw error;
}

export async function raceManagedRequest<T>(
  promise: Promise<T>,
  timeoutController: AbortController,
  externalSignal?: AbortSignal | null,
): Promise<T> {
  throwIfManagedRequestAborted(timeoutController, externalSignal);
  promise.catch(() => undefined);

  return await new Promise<T>((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      timeoutController.signal.removeEventListener('abort', abort);
      externalSignal?.removeEventListener('abort', abort);
    };
    const settle = (callback: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback();
    };
    const abort = () => {
      settle(() => reject(createAbortError()));
    };

    timeoutController.signal.addEventListener('abort', abort, { once: true });
    externalSignal?.addEventListener('abort', abort, { once: true });
    if (timeoutController.signal.aborted || externalSignal?.aborted) {
      abort();
      return;
    }

    promise.then(
      (value) => {
        settle(() => {
          try {
            throwIfManagedRequestAborted(timeoutController, externalSignal);
            resolve(value);
          } catch (error) {
            reject(error);
          }
        });
      },
      (error) => {
        settle(() => {
          try {
            throwIfManagedRequestAborted(timeoutController, externalSignal);
            reject(error);
          } catch (abortError) {
            reject(abortError);
          }
        });
      },
    );
  });
}

async function delayManagedRetry(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) {
    return Promise.reject(createAbortError());
  }

  return new Promise((resolve, reject) => {
    let timeout: ReturnType<typeof setTimeout>;
    const abort = () => {
      clearTimeout(timeout);
      reject(createAbortError());
    };
    const complete = () => {
      signal.removeEventListener('abort', abort);
      resolve();
    };
    signal.addEventListener('abort', abort, { once: true });
    timeout = setTimeout(complete, ms);
  });
}

function readContentLength(response: Response): number | null {
  const rawContentLength = response.headers.get('content-length');
  if (!rawContentLength) {
    return null;
  }

  if (rawContentLength.length > MAX_MANAGED_CONTENT_LENGTH_CHARS) {
    return null;
  }
  const trimmed = rawContentLength.trim();
  if (!/^\d+$/.test(trimmed)) {
    return null;
  }
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

async function readManagedJsonText(
  response: Response,
  timeoutController: AbortController,
  externalSignal?: AbortSignal | null,
): Promise<string> {
  throwIfManagedRequestAborted(timeoutController, externalSignal);

  const contentLength = readContentLength(response);
  if (contentLength !== null && contentLength > MAX_MANAGED_JSON_RESPONSE_BODY_BYTES) {
    void response.body?.cancel().catch(() => undefined);
    throw createManagedResponseTooLargeError();
  }

  if (!response.body) {
    return '';
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let bytesRead = 0;
  const cancelReader = () => {
    void reader.cancel(createAbortError()).catch(() => undefined);
  };
  timeoutController.signal.addEventListener('abort', cancelReader, { once: true });
  externalSignal?.addEventListener('abort', cancelReader, { once: true });

  try {
    while (true) {
      const { done, value } = await raceManagedRequest(reader.read(), timeoutController, externalSignal);
      throwIfManagedRequestAborted(timeoutController, externalSignal);
      if (done) {
        break;
      }

      bytesRead += value.byteLength;
      if (bytesRead > MAX_MANAGED_JSON_RESPONSE_BODY_BYTES) {
        void reader.cancel().catch(() => undefined);
        throw createManagedResponseTooLargeError();
      }
      chunks.push(decoder.decode(value, { stream: true }));
    }

    chunks.push(decoder.decode());
    return chunks.join('');
  } finally {
    timeoutController.signal.removeEventListener('abort', cancelReader);
    externalSignal?.removeEventListener('abort', cancelReader);
    reader.releaseLock();
  }
}

export async function readManagedJson<T>(
  response: Response,
  timeoutController: AbortController,
  externalSignal?: AbortSignal | null,
): Promise<T> {
  const text = await readManagedJsonText(response, timeoutController, externalSignal);
  throwIfManagedRequestAborted(timeoutController, externalSignal);
  return JSON.parse(text) as T;
}

export async function fetchManagedJsonWithRetry(
  url: string,
  init: RequestInit,
  timeoutController: AbortController,
  externalSignal?: AbortSignal | null,
): Promise<Response> {
  const method = init.method == null
    ? 'GET'
    : typeof init.method === 'string' && init.method.length <= 16
      ? init.method.toUpperCase()
      : '';
  const shouldRetry = method === 'GET';
  const retrySignal = init.signal ?? timeoutController.signal;
  for (let attempt = 0; ; attempt += 1) {
    const startedAt = Date.now();
    try {
      return await raceManagedRequest(fetch(url, init), timeoutController, externalSignal);
    } catch (error) {
      const retryDelayMs = shouldRetry ? MANAGED_GET_RETRY_DELAYS_MS[attempt] : undefined;
      const failedQuickly = Date.now() - startedAt <= MANAGED_FAST_FAILURE_RETRY_WINDOW_MS;
      if (retrySignal.aborted || retryDelayMs == null || !failedQuickly) {
        throw error;
      }
      await delayManagedRetry(retryDelayMs, retrySignal);
    }
  }
}
