const HTTP_HEADER_NAME_PATTERN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
const AI_PROVIDER_HTTP_AUTHORITY_URL_PATTERN = /^https?:\/\//i;
const UNSAFE_AI_PROVIDER_URL_CHARS_PATTERN = /[\u0000-\u001F\u007F\u202A-\u202E\u2066-\u2069\uFFFD]/;
const IPC_REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,160}$/;
const AI_PROVIDER_TRANSPORT_RETRY_DELAYS_MS = [300];
const AI_PROVIDER_FAST_FAILURE_RETRY_WINDOW_MS = 2000;
const MAX_AI_PROVIDER_REQUEST_BODY_BYTES = 64 * 1024 * 1024;
const MAX_AI_PROVIDER_REQUEST_BODY_BASE64_CHARS = Math.ceil(MAX_AI_PROVIDER_REQUEST_BODY_BYTES / 3) * 4;
const MAX_AI_PROVIDER_URL_CHARS = 4096;
const MAX_AI_PROVIDER_HEADER_NAME_CHARS = 256;
const MAX_AI_PROVIDER_HEADER_VALUE_CHARS = 16 * 1024;

export const AI_PROVIDER_CONNECTION_FAILURE_CODE = 'AI_PROVIDER_CONNECTION_FAILED';
export const MAX_AI_PROVIDER_RESPONSE_BODY_BYTES = 64 * 1024 * 1024;
export const MAX_AI_PROVIDER_RESPONSE_IPC_CHUNK_BYTES = 256 * 1024;

export function createAbortError() {
  return new DOMException('Aborted', 'AbortError');
}

function throwIfAborted(signal) {
  if (!signal?.aborted) return;
  throw createAbortError();
}

export async function raceWithAbort(promise, signal) {
  throwIfAborted(signal);
  promise.catch(() => undefined);

  return await new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      signal.removeEventListener('abort', abort);
    };
    const settle = (callback) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback();
    };
    const abort = () => {
      settle(() => reject(createAbortError()));
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
            throwIfAborted(signal);
            resolve(value);
          } catch (error) {
            reject(error);
          }
        });
      },
      (error) => {
        settle(() => {
          try {
            throwIfAborted(signal);
            reject(error);
          } catch (abortError) {
            reject(abortError);
          }
        });
      },
    );
  });
}

function delayAiProviderRetry(ms, signal) {
  return new Promise((resolve, reject) => {
    let timeout;
    const cleanup = () => {
      clearTimeout(timeout);
      signal.removeEventListener('abort', abort);
    };
    const abort = () => {
      cleanup();
      reject(createAbortError());
    };
    timeout = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) {
      abort();
    }
  });
}

export async function fetchAiProviderRequestWithRetry(request, signal) {
  const shouldRetry = request.method === 'GET';
  for (let attempt = 0; ; attempt += 1) {
    const startedAt = Date.now();
    try {
      return await raceWithAbort(fetch(request.url, {
        method: request.method,
        headers: request.headers,
        body: request.body,
        signal,
        cache: 'no-store',
        redirect: 'error',
      }), signal);
    } catch (error) {
      const retryDelayMs = shouldRetry ? AI_PROVIDER_TRANSPORT_RETRY_DELAYS_MS[attempt] : undefined;
      const failedQuickly = Date.now() - startedAt <= AI_PROVIDER_FAST_FAILURE_RETRY_WINDOW_MS;
      if (signal.aborted || retryDelayMs == null || !failedQuickly) {
        throw error;
      }
      await delayAiProviderRetry(retryDelayMs, signal);
    }
  }
}

export function requireSafeIpcRequestId(value, label) {
  const id = typeof value === 'string' ? value.trim() : '';
  if (!IPC_REQUEST_ID_PATTERN.test(id)) {
    throw new Error(`${label} must contain only safe channel characters.`);
  }
  return id;
}

export function normalizeAiProviderRequest(rawRequest) {
  if (!rawRequest || typeof rawRequest !== 'object') {
    throw new Error('AI provider request is required.');
  }

  const url = normalizeAiProviderUrl(rawRequest.url);
  const method = rawRequest.method == null
    ? 'GET'
    : typeof rawRequest.method === 'string'
      ? rawRequest.method.toUpperCase()
      : '';
  if (method !== 'GET' && method !== 'POST') {
    throw new Error(`Unsupported AI provider request method: ${method}`);
  }

  const headers = normalizeAiProviderHeaders(rawRequest.headers);
  const body = normalizeAiProviderRequestBody(rawRequest);
  return { url, method, headers, body };
}

function normalizeAiProviderRequestBody(rawRequest) {
  if (rawRequest.bodyBase64 != null) {
    if (typeof rawRequest.bodyBase64 !== 'string') {
      throw new Error('Invalid AI provider base64 request body.');
    }
    const bodyBase64 = rawRequest.bodyBase64;
    if (bodyBase64.length > MAX_AI_PROVIDER_REQUEST_BODY_BASE64_CHARS) {
      throw new Error('AI provider request body is too large.');
    }
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(bodyBase64) || bodyBase64.length % 4 !== 0) {
      throw new Error('Invalid AI provider base64 request body.');
    }
    const decodedByteLength = getBase64DecodedByteLength(bodyBase64);
    if (decodedByteLength === null || decodedByteLength > MAX_AI_PROVIDER_REQUEST_BODY_BYTES) {
      throw new Error('AI provider request body is too large.');
    }
    return Buffer.from(bodyBase64, 'base64');
  }

  if (rawRequest.body == null) {
    return undefined;
  }

  if (typeof rawRequest.body !== 'string') {
    throw new Error('Invalid AI provider request body.');
  }
  const body = rawRequest.body;
  if (Buffer.byteLength(body, 'utf8') > MAX_AI_PROVIDER_REQUEST_BODY_BYTES) {
    throw new Error('AI provider request body is too large.');
  }
  return body;
}

export function getBase64DecodedByteLength(payload) {
  if (payload.length % 4 !== 0) {
    return null;
  }

  let padding = 0;
  if (payload.endsWith('==')) {
    padding = 2;
  } else if (payload.endsWith('=')) {
    padding = 1;
  }

  const byteLength = Math.floor((payload.length * 3) / 4) - padding;
  return byteLength >= 0 ? byteLength : null;
}

function normalizeAiProviderUrl(rawUrl) {
  if (typeof rawUrl !== 'string') {
    throw new Error('A non-empty AI provider URL is required.');
  }
  if (rawUrl.length > MAX_AI_PROVIDER_URL_CHARS) {
    throw new Error('AI provider request URL is not supported.');
  }

  const trimmed = rawUrl.trim();
  if (!trimmed) {
    throw new Error('A non-empty AI provider URL is required.');
  }
  if (
    trimmed.length > MAX_AI_PROVIDER_URL_CHARS ||
    !AI_PROVIDER_HTTP_AUTHORITY_URL_PATTERN.test(trimmed) ||
    UNSAFE_AI_PROVIDER_URL_CHARS_PATTERN.test(trimmed) ||
    trimmed.includes('\\')
  ) {
    throw new Error('AI provider request URL is not supported.');
  }

  let parsed;
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

function isLoopbackProviderHostname(hostname) {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  return normalized === 'localhost'
    || normalized.endsWith('.localhost')
    || normalized === '::1'
    || /^127(?:\.\d{1,3}){3}$/.test(normalized);
}

function normalizeAiProviderHeaders(rawHeaders) {
  const headers = {};
  if (!rawHeaders || typeof rawHeaders !== 'object') {
    return headers;
  }

  for (const [key, value] of Object.entries(rawHeaders)) {
    if (key.length > MAX_AI_PROVIDER_HEADER_NAME_CHARS) {
      throw new Error(`Invalid AI provider request header: ${key.slice(0, MAX_AI_PROVIDER_HEADER_NAME_CHARS)}`);
    }
    const normalizedKey = key.trim();
    if (!normalizedKey) {
      continue;
    }
    if (normalizedKey.length > MAX_AI_PROVIDER_HEADER_NAME_CHARS) {
      throw new Error(`Invalid AI provider request header: ${normalizedKey}`);
    }
    if (value == null) {
      continue;
    }
    if (!HTTP_HEADER_NAME_PATTERN.test(normalizedKey)) {
      throw new Error(`Invalid AI provider request header: ${normalizedKey}`);
    }
    let normalizedValue = '';
    if (typeof value === 'string') {
      normalizedValue = value;
    } else if (typeof value === 'number' && Number.isFinite(value)) {
      normalizedValue = String(value);
    } else if (typeof value === 'boolean') {
      normalizedValue = String(value);
    } else {
      throw new Error(`Invalid AI provider request header value: ${normalizedKey}`);
    }
    if (normalizedValue.length > MAX_AI_PROVIDER_HEADER_VALUE_CHARS) {
      throw new Error(`Invalid AI provider request header value: ${normalizedKey}`);
    }
    if (/[\u0000\r\n]/.test(normalizedValue)) {
      throw new Error(`Invalid AI provider request header value: ${normalizedKey}`);
    }
    headers[normalizedKey] = normalizedValue;
  }

  return headers;
}
