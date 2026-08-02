import http from 'node:http';
import https from 'node:https';
import zlib from 'node:zlib';
import { WebSearchError } from '../types.mjs';

export const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';
export const MAX_RAW_TEXT_BYTES = 1_000_000;

export const DEFAULT_CRAWLER_TIMEOUT_MS = 12000;
const MAX_CRAWLER_TIMEOUT_INPUT_CHARS = 16;
const MAX_CRAWLER_TIMEOUT_MS = 30000;

export function createAbortError() {
  return new DOMException('The web search request was cancelled.', 'AbortError');
}

export function throwIfAborted(signal) {
  if (!signal?.aborted) return;
  throw createAbortError();
}

export function normalizeCrawlerTimeoutMs(value) {
  let parsed = Number.NaN;
  if (typeof value === 'number') {
    parsed = value;
  } else if (typeof value === 'string' && value.length <= MAX_CRAWLER_TIMEOUT_INPUT_CHARS) {
    const trimmed = value.trim();
    parsed = /^\d+$/.test(trimmed) ? Number.parseInt(trimmed, 10) : Number.NaN;
  }
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_CRAWLER_TIMEOUT_MS;
  }
  return Math.min(Math.floor(parsed), MAX_CRAWLER_TIMEOUT_MS);
}

async function raceWithAbort(promise, signal) {
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

export async function readResponseArrayBuffer(response, signal) {
  throwIfAborted(signal);
  if (!response.body) {
    return new ArrayBuffer(0);
  }

  const reader = response.body.getReader();
  const chunks = [];
  let totalBytes = 0;
  const cancelReader = () => {
    void reader.cancel(createAbortError()).catch(() => undefined);
  };
  signal?.addEventListener('abort', cancelReader, { once: true });

  try {
    while (true) {
      const { done, value } = await raceWithAbort(reader.read(), signal);
      throwIfAborted(signal);
      if (done) {
        break;
      }

      const buffer = Buffer.from(value);
      chunks.push(buffer);
      totalBytes += buffer.length;
      if (totalBytes > MAX_RAW_TEXT_BYTES) {
        void reader.cancel().catch(() => undefined);
        throw new WebSearchError('content_too_large', 'The page response is too large.');
      }
    }
  } finally {
    signal?.removeEventListener('abort', cancelReader);
    reader.releaseLock();
  }

  const body = Buffer.concat(chunks, totalBytes);
  return body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength);
}

function headersToRecord(headers) {
  const record = {};
  for (const [key, value] of Object.entries(headers)) {
    if (typeof value === 'string') {
      record[key] = value;
    } else if (Array.isArray(value)) {
      record[key] = value.join(', ');
    }
  }
  return record;
}

export function decodeResponseBody(buffer, contentEncoding) {
  const encoding = String(contentEncoding ?? '').toLowerCase();
  try {
    if (encoding.includes('br')) return zlib.brotliDecompressSync(buffer, { maxOutputLength: MAX_RAW_TEXT_BYTES });
    if (encoding.includes('gzip')) return zlib.gunzipSync(buffer, { maxOutputLength: MAX_RAW_TEXT_BYTES });
    if (encoding.includes('deflate')) return zlib.inflateSync(buffer, { maxOutputLength: MAX_RAW_TEXT_BYTES });
  } catch (error) {
    if (error?.code === 'ERR_BUFFER_TOO_LARGE') {
      throw new WebSearchError('content_too_large', 'The page response is too large.', error);
    }
    return buffer;
  }
  return buffer;
}

function buildHostHeader(parsedUrl) {
  const defaultPort = parsedUrl.protocol === 'https:' ? '443' : '80';
  return parsedUrl.port && parsedUrl.port !== defaultPort
    ? `${parsedUrl.hostname}:${parsedUrl.port}`
    : parsedUrl.hostname;
}

export function fetchAddress(resolvedUrl, addressEntry, signal) {
  const parsedUrl = resolvedUrl.parsed;
  const address = addressEntry.address;
  const family = addressEntry.family;

  return new Promise((resolve, reject) => {
    let settled = false;
    let request;
    const rejectRequest = (error) => {
      if (settled) return;
      settled = true;
      reject(error);
      request?.destroy(error);
    };
    const transport = parsedUrl.protocol === 'https:' ? https : http;
    request = transport.request({
      hostname: address,
      port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
      path: `${parsedUrl.pathname}${parsedUrl.search}`,
      method: 'GET',
      servername: parsedUrl.hostname,
      lookup: (_hostname, _options, callback) => callback(null, address, family),
      headers: {
        Accept: 'text/html,application/json,text/plain;q=0.9,*/*;q=0.8',
        Host: buildHostHeader(parsedUrl),
        'User-Agent': USER_AGENT,
      },
    }, (response) => {
      const chunks = [];
      let totalBytes = 0;
      const resolveResponse = () => {
        if (settled) return;
        try {
          const status = response.statusCode;
          if (!Number.isInteger(status) || status < 200 || status > 599) {
            throw new WebSearchError('http_error', 'The page returned an invalid HTTP response.');
          }
          const body = status === 204 || status === 205 || status === 304
            ? null
            : Buffer.concat(chunks);
          const result = new Response(body, {
            status,
            headers: headersToRecord(response.headers),
          });
          settled = true;
          resolve(result);
        } catch (error) {
          rejectRequest(error);
        }
      };
      const rejectResponse = (error) => {
        rejectRequest(error instanceof WebSearchError
          ? error
          : new WebSearchError('network_error', 'The page response was interrupted.', error));
      };

      response.on('data', (chunk) => {
        const buffer = Buffer.from(chunk);
        chunks.push(buffer);
        totalBytes += buffer.length;
        if (totalBytes >= MAX_RAW_TEXT_BYTES) {
          resolveResponse();
          request.destroy();
        }
      });
      response.on('end', resolveResponse);
      response.on('error', rejectResponse);
      response.on('aborted', () => {
        rejectResponse(new WebSearchError('network_error', 'The page response was interrupted.'));
      });
    });

    const abort = () => {
      rejectRequest(new WebSearchError('timeout', 'The page request timed out.'));
    };

    request.on('error', (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    });
    request.setTimeout(5000, () => {
      rejectRequest(new WebSearchError('timeout', 'The page request timed out.'));
    });
    request.on('close', () => signal?.removeEventListener('abort', abort));
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) {
      abort();
      return;
    }
    request.end();
  });
}

async function fetchWithVerifiedAddress(resolvedUrl, signal) {
  const addresses = [...resolvedUrl.addresses]
    .sort((left, right) => (left.family === 4 ? 0 : 1) - (right.family === 4 ? 0 : 1))
    .slice(0, 4);
  if (addresses.length === 0) {
    throw new WebSearchError('blocked_url', 'This URL resolves to a blocked address.');
  }

  let lastError;
  for (const address of addresses) {
    try {
      return await fetchAddress(resolvedUrl, address, signal);
    } catch (error) {
      lastError = error;
      if (signal?.aborted) {
        throw error;
      }
    }
  }

  throw lastError;
}

export async function fetchWithTimeout(fetchImpl, resolvedUrl, timeoutMs, signal, consumeResponse) {
  throwIfAborted(signal);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const combinedSignal = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;

  try {
    const response = !fetchImpl
      ? await fetchWithVerifiedAddress(resolvedUrl, combinedSignal)
      : await raceWithAbort(fetchImpl(resolvedUrl.url, {
      headers: {
        Accept: 'text/html,application/json,text/plain;q=0.9,*/*;q=0.8',
        'User-Agent': USER_AGENT,
      },
      redirect: 'manual',
      cache: 'no-store',
      signal: combinedSignal,
    }), combinedSignal);

    return typeof consumeResponse === 'function'
      ? await consumeResponse(response, combinedSignal)
      : response;
  } catch (error) {
    if (signal?.aborted) {
      throw createAbortError();
    }
    if (controller.signal.aborted) {
      throw new WebSearchError('timeout', 'The page request timed out.', error);
    }
    if (error instanceof WebSearchError) {
      throw error;
    }
    throw new WebSearchError('network_error', 'The page could not be reached.', error);
  } finally {
    clearTimeout(timeout);
  }
}
