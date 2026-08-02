const MAX_MANAGED_STREAM_LINE_CHARS = 1024 * 1024;
const MAX_MANAGED_ERROR_BODY_BYTES = 64 * 1024;
const MAX_MANAGED_STREAM_ERROR_CODE_CHARS = 512;
const MANAGED_STREAM_ERROR_CODE_PATTERN = /^[A-Za-z0-9._:-]+$/;
const MANAGED_PUBLIC_ERROR_MESSAGES = new Map([
  ['points_exhausted', 'MANAGED_QUOTA_EXHAUSTED'],
  ['inactive_points', 'MANAGED_QUOTA_EXHAUSTED'],
  ['insufficient_points', 'MANAGED_QUOTA_EXHAUSTED'],
  ['upstream_rate_limited', 'UPSTREAM_RATE_LIMITED'],
  ['upstream_unavailable', 'UPSTREAM_UNAVAILABLE'],
  ['unsupported_message_content', 'UNSUPPORTED_MODEL_INPUT'],
  ['unsupported_model_input', 'UNSUPPORTED_MODEL_INPUT'],
  ['unsupported_tool_calling', 'UNSUPPORTED_TOOL_CALLING'],
  ['invalid_request', 'INVALID_REQUEST'],
]);
const SAFE_MANAGED_JSON_ERROR_MESSAGES = new Set([
  ...MANAGED_PUBLIC_ERROR_MESSAGES.values(),
  'Invalid managed JSON request body.',
  'Managed API request timed out.',
  'Managed JSON request body is too large.',
  'vlaina session is still activating',
  'vlaina session is temporarily unavailable',
  'vlaina sign-in required',
]);
export const MANAGED_BACKEND_STREAM_ERROR = Symbol('managedBackendStreamError');

export function normalizeManagedStreamErrorCode(value) {
  if (typeof value !== 'string' || value.length > MAX_MANAGED_STREAM_ERROR_CODE_CHARS) {
    return null;
  }
  const normalized = value.trim();
  return normalized && MANAGED_STREAM_ERROR_CODE_PATTERN.test(normalized) ? normalized : null;
}

export function normalizeManagedPublicErrorCode(value) {
  const normalized = normalizeManagedStreamErrorCode(value)?.toLowerCase() ?? null;
  return normalized && MANAGED_PUBLIC_ERROR_MESSAGES.has(normalized) ? normalized : null;
}

function readManagedErrorProperty(error, key) {
  if (!error || typeof error !== 'object') return undefined;
  try {
    return error[key];
  } catch {
    return undefined;
  }
}

function normalizeManagedErrorStatus(value) {
  return Number.isInteger(value) && value >= 100 && value <= 599 ? value : null;
}

function createManagedJsonError(message, statusCode, errorCode) {
  const error = new Error(message);
  if (statusCode !== null) {
    error.statusCode = statusCode;
  }
  if (errorCode) {
    error.errorCode = errorCode;
  }
  return error;
}

export function extractManagedPayloadErrorCode(payload) {
  if (typeof payload?.errorCode === 'string' && payload.errorCode.trim()) {
    return normalizeManagedPublicErrorCode(payload.errorCode);
  }
  if (typeof payload?.error?.code === 'string' && payload.error.code.trim()) {
    return normalizeManagedPublicErrorCode(payload.error.code);
  }
  if (typeof payload?.error?.type === 'string' && payload.error.type.trim()) {
    return normalizeManagedPublicErrorCode(payload.error.type);
  }
  return null;
}

export function normalizeManagedErrorPayload(payload, status) {
  const fallback = `Managed stream failed: HTTP ${status}`;
  const errorCode = extractManagedPayloadErrorCode(payload);
  const message = errorCode ? MANAGED_PUBLIC_ERROR_MESSAGES.get(errorCode) : fallback;

  return { message, statusCode: status, errorCode };
}

export function sanitizeManagedJsonIpcError(error) {
  if (readManagedErrorProperty(error, 'name') === 'AbortError') {
    return createAbortError();
  }

  const message = readManagedErrorProperty(error, 'message');
  const statusCode = normalizeManagedErrorStatus(
    readManagedErrorProperty(error, 'statusCode') ?? readManagedErrorProperty(error, 'status'),
  );
  const errorCode = normalizeManagedPublicErrorCode(readManagedErrorProperty(error, 'errorCode'));
  if (errorCode) {
    return createManagedJsonError(
      MANAGED_PUBLIC_ERROR_MESSAGES.get(errorCode),
      statusCode,
      errorCode,
    );
  }
  if (typeof message === 'string' && SAFE_MANAGED_JSON_ERROR_MESSAGES.has(message)) {
    return createManagedJsonError(message, statusCode, null);
  }

  return createManagedJsonError(
    statusCode === null
      ? 'Managed API request failed.'
      : `Managed API request failed: HTTP ${statusCode}`,
    statusCode,
    null,
  );
}

export function createManagedBackendStreamError(payload) {
  const normalized = normalizeManagedErrorPayload(payload, 502);
  const error = new Error(normalized.message);
  const errorCode = normalized.errorCode;
  if (errorCode) {
    error.errorCode = errorCode;
  }
  error[MANAGED_BACKEND_STREAM_ERROR] = true;
  return error;
}

export function createAbortError() {
  return new DOMException('Aborted', 'AbortError');
}

export function createManagedStreamTimeoutError() {
  const error = new Error('Managed stream timed out.');
  error.errorCode = 'managed_stream_timeout';
  return error;
}

export function isManagedStreamTimeoutError(error) {
  return readManagedErrorProperty(error, 'errorCode') === 'managed_stream_timeout';
}

export function throwIfAborted(signal) {
  if (!signal?.aborted) return;
  throw createAbortError();
}

export function assertManagedStreamLineLength(line) {
  if (line.length > MAX_MANAGED_STREAM_LINE_CHARS) {
    throw new Error('Managed stream line is too large.');
  }
}

export function appendManagedStreamBuffer(buffer, next) {
  if (buffer.length + next.length > MAX_MANAGED_STREAM_LINE_CHARS) {
    throw new Error('Managed stream line is too large.');
  }
  return buffer + next;
}

export async function raceWithAbort(promise, signal) {
  if (!signal) return await promise;
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

async function readManagedErrorText(response, signal) {
  if (!response.body) {
    return '';
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytesRead = 0;
  let text = '';
  const cancelReader = () => {
    void reader.cancel(createAbortError()).catch(() => {});
  };
  signal?.addEventListener('abort', cancelReader, { once: true });

  try {
    while (true) {
      const { done, value } = await raceWithAbort(reader.read(), signal);
      if (done) {
        break;
      }

      bytesRead += value.byteLength;
      if (bytesRead > MAX_MANAGED_ERROR_BODY_BYTES) {
        void reader.cancel(createAbortError()).catch(() => {});
        return '';
      }
      text += decoder.decode(value, { stream: true });
    }

    return text + decoder.decode();
  } finally {
    signal?.removeEventListener('abort', cancelReader);
    reader.releaseLock();
  }
}

export async function readManagedErrorPayload(response, signal) {
  const fallback = { message: `Managed stream failed: HTTP ${response.status}`, statusCode: response.status, errorCode: null };
  let text = '';
  try {
    throwIfAborted(signal);
    text = await readManagedErrorText(response, signal);
  } catch (error) {
    if (signal?.aborted) {
      throw createAbortError();
    }
    text = '';
  }
  if (!text) {
    return fallback;
  }

  try {
    const payload = JSON.parse(text);
    return normalizeManagedErrorPayload(payload, response.status);
  } catch {
    return fallback;
  }
}
