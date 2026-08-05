import type {
  StreamingHttpChunkEvent,
  StreamingHttpErrorEvent,
  StreamingHttpPlugin,
  StreamingHttpResponseEvent,
  StreamingHttpTerminalEvent,
} from '@vlaina/capacitor-streaming-http';
import {
  MAX_NATIVE_HTTP_BODY_BYTES,
  normalizeNativeRequestBody,
} from './nativeRequestBody';

const MAX_NATIVE_EVENT_BASE64_CHARS = 1024 * 1024;
const MAX_CONTENT_LENGTH_CHARS = 32;
const MAX_ERROR_MESSAGE_CHARS = 1024;
const READ_TIMEOUT_MS = 300_000;
let nextRequestSequence = 0;

interface ActiveRequest {
  controller: ReadableStreamDefaultController<Uint8Array> | null;
  reject: (error: unknown) => void;
  resolve: (response: Response) => void;
  responseBytes: number;
  responseReceived: boolean;
  settled: boolean;
  signal?: AbortSignal | null;
  abort: () => void;
  stream: ReadableStream<Uint8Array>;
}

function createAbortError(): DOMException {
  return new DOMException('Aborted', 'AbortError');
}

function normalizeUrl(value: string): string {
  const parsed = new URL(value);
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
    throw new Error('Native AI requests require an HTTPS URL.');
  }
  return parsed.toString();
}

function headersToRecord(headers: HeadersInit | undefined): Record<string, string> {
  const record: Record<string, string> = {};
  new Headers(headers).forEach((value, key) => {
    record[key] = value;
  });
  return record;
}

function decodeBase64(value: string): Uint8Array {
  if (value.length > MAX_NATIVE_EVENT_BASE64_CHARS) {
    throw new Error('Native HTTP response chunk is too large.');
  }
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function readContentLength(headers: Record<string, string>): number | null {
  const value = Object.entries(headers).find(([key]) => key.toLowerCase() === 'content-length')?.[1];
  if (!value || value.length > MAX_CONTENT_LENGTH_CHARS || !/^\d+$/.test(value.trim())) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function sanitizeResponseHeaders(source: Record<string, string>): Headers {
  const headers = new Headers();
  for (const [name, value] of Object.entries(source)) {
    if (name.toLowerCase() !== 'set-cookie' && name.toLowerCase() !== 'set-cookie2') {
      headers.append(name, value);
    }
  }
  return headers;
}

function safeErrorMessage(message: unknown): string {
  if (typeof message !== 'string') return 'Native HTTP request failed.';
  const trimmed = message.trim();
  return trimmed && trimmed.length <= MAX_ERROR_MESSAGE_CHARS
    ? trimmed
    : 'Native HTTP request failed.';
}

function safeStatusText(value: unknown): string {
  if (typeof value !== 'string' || /[\r\n]/.test(value)) return '';
  for (let index = 0; index < value.length; index += 1) {
    if (value.charCodeAt(index) > 0xff) return '';
  }
  return value;
}

export function createNativeStreamingFetch(plugin: StreamingHttpPlugin) {
  const active = new Map<string, ActiveRequest>();
  let listenersReady: Promise<void> | null = null;

  const cancelNative = (id: string) => {
    void plugin.cancel({ id }).catch(() => undefined);
  };
  const cleanup = (id: string, request: ActiveRequest) => {
    active.delete(id);
    request.signal?.removeEventListener('abort', request.abort);
  };
  const fail = (id: string, error: unknown, shouldCancel: boolean) => {
    const request = active.get(id);
    if (!request || request.settled) return;
    request.settled = true;
    cleanup(id, request);
    if (shouldCancel) cancelNative(id);
    if (request.responseReceived) request.controller?.error(error);
    else request.reject(error);
  };

  const onResponse = (event: StreamingHttpResponseEvent) => {
    const request = active.get(event.id);
    if (!request || request.settled || request.responseReceived) return;
    const contentLength = readContentLength(event.headers);
    if (contentLength !== null && contentLength > MAX_NATIVE_HTTP_BODY_BYTES) {
      fail(event.id, new Error('Native HTTP response body is too large.'), true);
      return;
    }
    if (!Number.isInteger(event.status) || event.status < 200 || event.status > 599) {
      fail(event.id, new Error('Native HTTP returned invalid response metadata.'), true);
      return;
    }
    try {
      const responseBody = [204, 205, 304].includes(event.status) ? null : request.stream;
      const response = new Response(responseBody, {
        status: event.status,
        statusText: safeStatusText(event.statusText),
        headers: sanitizeResponseHeaders(event.headers),
      });
      request.responseReceived = true;
      request.resolve(response);
    } catch (error) {
      fail(event.id, error, true);
    }
  };
  const onChunk = (event: StreamingHttpChunkEvent) => {
    const request = active.get(event.id);
    if (!request || request.settled) return;
    if (!request.responseReceived) {
      fail(event.id, new Error('Native HTTP returned data before response metadata.'), true);
      return;
    }
    try {
      const bytes = decodeBase64(event.dataBase64);
      request.responseBytes += bytes.byteLength;
      if (request.responseBytes > MAX_NATIVE_HTTP_BODY_BYTES) {
        fail(event.id, new Error('Native HTTP response body is too large.'), true);
        return;
      }
      request.controller?.enqueue(bytes);
    } catch (error) {
      fail(event.id, error, true);
    }
  };
  const onEnd = (event: StreamingHttpTerminalEvent) => {
    const request = active.get(event.id);
    if (!request || request.settled) return;
    if (!request.responseReceived) {
      fail(event.id, new Error('Native HTTP ended before response metadata.'), false);
      return;
    }
    request.settled = true;
    cleanup(event.id, request);
    request.controller?.close();
  };
  const onError = (event: StreamingHttpErrorEvent) => {
    fail(event.id, new Error(safeErrorMessage(event.message)), false);
  };

  const ensureListeners = async () => {
    listenersReady ??= Promise.all([
      plugin.addListener('response', onResponse),
      plugin.addListener('chunk', onChunk),
      plugin.addListener('end', onEnd),
      plugin.addListener('error', onError),
    ]).then(() => undefined);
    await listenersReady;
  };

  return async (url: string, init: RequestInit = {}): Promise<Response> => {
    if (init.signal?.aborted) throw createAbortError();
    const method = (init.method ?? 'GET').toUpperCase();
    if (method !== 'GET' && method !== 'POST') {
      throw new Error('Native AI requests support only GET and POST.');
    }
    const safeUrl = normalizeUrl(url);
    const requestBody = await normalizeNativeRequestBody(init.body, init.signal);
    await ensureListeners();
    if (init.signal?.aborted) throw createAbortError();

    nextRequestSequence = (nextRequestSequence + 1) % Number.MAX_SAFE_INTEGER;
    const id = `native-http-${Date.now().toString(36)}-${nextRequestSequence.toString(36)}`;
    let resolve!: (response: Response) => void;
    let reject!: (error: unknown) => void;
    const responsePromise = new Promise<Response>((resolvePromise, rejectPromise) => {
      resolve = resolvePromise;
      reject = rejectPromise;
    });
    const request = {} as ActiveRequest;
    request.stream = new ReadableStream<Uint8Array>({
      start(controller) {
        request.controller = controller;
      },
      cancel() {
        if (request.settled) return;
        request.settled = true;
        cleanup(id, request);
        cancelNative(id);
      },
    });
    Object.assign(request, {
      abort: () => fail(id, createAbortError(), true),
      reject,
      resolve,
      responseBytes: 0,
      responseReceived: false,
      settled: false,
      signal: init.signal,
    });
    active.set(id, request);
    init.signal?.addEventListener('abort', request.abort, { once: true });

    try {
      await plugin.start({
        id,
        url: safeUrl,
        method,
        headers: headersToRecord(init.headers),
        ...requestBody,
        includeCookies: init.credentials === 'include',
        readTimeoutMs: READ_TIMEOUT_MS,
      });
    } catch (error) {
      fail(id, error, false);
    }
    return await responsePromise;
  };
}

export { MAX_NATIVE_HTTP_BODY_BYTES };
