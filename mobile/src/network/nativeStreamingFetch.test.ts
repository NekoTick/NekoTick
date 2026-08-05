import type {
  StreamingHttpChunkEvent,
  StreamingHttpErrorEvent,
  StreamingHttpPlugin,
  StreamingHttpResponseEvent,
  StreamingHttpTerminalEvent,
} from '@vlaina/capacitor-streaming-http';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createNativeStreamingFetch,
  MAX_NATIVE_HTTP_BODY_BYTES,
} from './nativeStreamingFetch';

type EventName = 'response' | 'chunk' | 'end' | 'error';

function encodeBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function createPluginMock() {
  const listeners = new Map<EventName, (event: never) => void>();
  const plugin = {
    start: vi.fn(async () => undefined),
    cancel: vi.fn(async () => undefined),
    addListener: vi.fn(async (name: EventName, listener: (event: never) => void) => {
      listeners.set(name, listener);
      return { remove: vi.fn(async () => undefined) };
    }),
  } as unknown as StreamingHttpPlugin;

  const emit = {
    response(event: StreamingHttpResponseEvent) {
      listeners.get('response')?.(event as never);
    },
    chunk(event: StreamingHttpChunkEvent) {
      listeners.get('chunk')?.(event as never);
    },
    end(event: StreamingHttpTerminalEvent) {
      listeners.get('end')?.(event as never);
    },
    error(event: StreamingHttpErrorEvent) {
      listeners.get('error')?.(event as never);
    },
  };
  return { emit, plugin };
}

describe('createNativeStreamingFetch', () => {
  let mock: ReturnType<typeof createPluginMock>;

  beforeEach(() => {
    mock = createPluginMock();
  });

  it('reconstructs metadata and UTF-8 bytes split across native chunks', async () => {
    const nativeFetch = createNativeStreamingFetch(mock.plugin);
    const pending = nativeFetch('https://api.example.test/v1/chat/completions', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: '{"stream":true}',
    });
    await vi.waitFor(() => expect(mock.plugin.start).toHaveBeenCalledTimes(1));
    const options = vi.mocked(mock.plugin.start).mock.calls[0]?.[0];
    const id = options?.id ?? '';

    mock.emit.response({
      id,
      status: 200,
      statusText: 'OK',
      headers: { 'content-type': 'text/event-stream' },
    });
    const response = await pending;
    const bytes = new TextEncoder().encode('data: 你好\n\n');
    mock.emit.chunk({ id, dataBase64: encodeBase64(bytes.subarray(0, 8)) });
    mock.emit.chunk({ id, dataBase64: encodeBase64(bytes.subarray(8)) });
    mock.emit.end({ id });

    await expect(response.text()).resolves.toBe('data: 你好\n\n');
    expect(options).toMatchObject({
      method: 'POST',
      body: '{"stream":true}',
      includeCookies: true,
    });
  });

  it('omits cookies for provider requests unless credentials are included', async () => {
    const nativeFetch = createNativeStreamingFetch(mock.plugin);
    const pending = nativeFetch('https://api.example.test/v1/models', { method: 'GET' });
    await vi.waitFor(() => expect(mock.plugin.start).toHaveBeenCalledTimes(1));
    const options = vi.mocked(mock.plugin.start).mock.calls[0]?.[0];
    const id = options?.id ?? '';
    mock.emit.response({ id, status: 200, statusText: 'OK', headers: {} });
    mock.emit.end({ id });

    await pending;
    expect(options?.includeCookies).toBe(false);
  });

  it('drops localized status text that cannot be represented by Response', async () => {
    const nativeFetch = createNativeStreamingFetch(mock.plugin);
    const pending = nativeFetch('https://api.example.test/v1/models');
    await vi.waitFor(() => expect(mock.plugin.start).toHaveBeenCalledTimes(1));
    const id = vi.mocked(mock.plugin.start).mock.calls[0]?.[0].id ?? '';
    mock.emit.response({ id, status: 200, statusText: 'Success \u6210\u529f', headers: {} });
    mock.emit.end({ id });

    await expect(pending).resolves.toMatchObject({ status: 200, statusText: '' });
  });

  it('preserves non-success responses without exposing Set-Cookie', async () => {
    const nativeFetch = createNativeStreamingFetch(mock.plugin);
    const pending = nativeFetch('https://api.example.test/v1/chat/completions', { method: 'POST' });
    await vi.waitFor(() => expect(mock.plugin.start).toHaveBeenCalledTimes(1));
    const id = vi.mocked(mock.plugin.start).mock.calls[0]?.[0].id ?? '';
    mock.emit.response({
      id,
      status: 429,
      statusText: 'Too Many Requests',
      headers: {
        'content-type': 'application/json',
        'retry-after': '30',
        'set-cookie': 'session=secret; HttpOnly',
      },
    });
    const response = await pending;
    mock.emit.chunk({
      id,
      dataBase64: encodeBase64(new TextEncoder().encode('{"error":"rate_limited"}')),
    });
    mock.emit.end({ id });

    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBe('30');
    expect(response.headers.get('set-cookie')).toBeNull();
    await expect(response.json()).resolves.toEqual({ error: 'rate_limited' });
  });

  it('passes binary multipart bodies as base64', async () => {
    const nativeFetch = createNativeStreamingFetch(mock.plugin);
    const pending = nativeFetch('https://api.example.test/v1/images/edits', {
      method: 'POST',
      body: new Blob([new Uint8Array([0, 1, 2, 255])]),
    });
    await vi.waitFor(() => expect(mock.plugin.start).toHaveBeenCalledTimes(1));
    const options = vi.mocked(mock.plugin.start).mock.calls[0]?.[0];
    const id = options?.id ?? '';
    mock.emit.response({ id, status: 200, statusText: 'OK', headers: {} });
    mock.emit.end({ id });

    await pending;
    expect(options?.bodyBase64).toBe('AAEC/w==');
    expect(options?.body).toBeUndefined();
  });

  it('keeps concurrent native response streams isolated by request ID', async () => {
    const nativeFetch = createNativeStreamingFetch(mock.plugin);
    const firstPending = nativeFetch('https://api.example.test/v1/first', { method: 'POST' });
    const secondPending = nativeFetch('https://api.example.test/v1/second', { method: 'POST' });
    await vi.waitFor(() => expect(mock.plugin.start).toHaveBeenCalledTimes(2));
    const firstId = vi.mocked(mock.plugin.start).mock.calls[0]?.[0].id ?? '';
    const secondId = vi.mocked(mock.plugin.start).mock.calls[1]?.[0].id ?? '';
    mock.emit.response({ id: secondId, status: 200, statusText: 'OK', headers: {} });
    mock.emit.response({ id: firstId, status: 200, statusText: 'OK', headers: {} });
    const [firstResponse, secondResponse] = await Promise.all([firstPending, secondPending]);
    mock.emit.chunk({ id: secondId, dataBase64: encodeBase64(new TextEncoder().encode('second')) });
    mock.emit.chunk({ id: firstId, dataBase64: encodeBase64(new TextEncoder().encode('first')) });
    mock.emit.end({ id: secondId });
    mock.emit.end({ id: firstId });

    await expect(firstResponse.text()).resolves.toBe('first');
    await expect(secondResponse.text()).resolves.toBe('second');
  });

  it('cancels the native request when aborted before response metadata', async () => {
    const controller = new AbortController();
    const nativeFetch = createNativeStreamingFetch(mock.plugin);
    const pending = nativeFetch('https://api.example.test/v1/chat/completions', {
      method: 'POST',
      signal: controller.signal,
    });
    pending.catch(() => undefined);
    await vi.waitFor(() => expect(mock.plugin.start).toHaveBeenCalledTimes(1));
    const id = vi.mocked(mock.plugin.start).mock.calls[0]?.[0].id ?? '';
    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(mock.plugin.cancel).toHaveBeenCalledWith({ id });
  });

  it('cancels native work when the response stream reader is cancelled', async () => {
    const nativeFetch = createNativeStreamingFetch(mock.plugin);
    const pending = nativeFetch('https://api.example.test/v1/chat/completions', { method: 'POST' });
    await vi.waitFor(() => expect(mock.plugin.start).toHaveBeenCalledTimes(1));
    const id = vi.mocked(mock.plugin.start).mock.calls[0]?.[0].id ?? '';
    mock.emit.response({ id, status: 200, statusText: 'OK', headers: {} });
    const response = await pending;

    await response.body?.cancel();

    expect(mock.plugin.cancel).toHaveBeenCalledWith({ id });
  });

  it('rejects oversized request bodies before starting native work', async () => {
    const blob = new Blob(['x']);
    Object.defineProperty(blob, 'size', {
      configurable: true,
      value: MAX_NATIVE_HTTP_BODY_BYTES + 1,
    });
    const nativeFetch = createNativeStreamingFetch(mock.plugin);

    await expect(nativeFetch('https://api.example.test/v1/images/edits', {
      method: 'POST',
      body: blob,
    })).rejects.toThrow('Native HTTP request body is too large.');
    expect(mock.plugin.start).not.toHaveBeenCalled();
  });

  it('cancels responses whose declared body exceeds the native limit', async () => {
    const nativeFetch = createNativeStreamingFetch(mock.plugin);
    const pending = nativeFetch('https://api.example.test/v1/chat/completions', { method: 'POST' });
    await vi.waitFor(() => expect(mock.plugin.start).toHaveBeenCalledTimes(1));
    const id = vi.mocked(mock.plugin.start).mock.calls[0]?.[0].id ?? '';
    mock.emit.response({
      id,
      status: 200,
      statusText: 'OK',
      headers: { 'content-length': String(MAX_NATIVE_HTTP_BODY_BYTES + 1) },
    });

    await expect(pending).rejects.toThrow('Native HTTP response body is too large.');
    expect(mock.plugin.cancel).toHaveBeenCalledWith({ id });
  });

  it('surfaces native errors through an already returned response body', async () => {
    const nativeFetch = createNativeStreamingFetch(mock.plugin);
    const pending = nativeFetch('https://api.example.test/v1/chat/completions', { method: 'POST' });
    await vi.waitFor(() => expect(mock.plugin.start).toHaveBeenCalledTimes(1));
    const id = vi.mocked(mock.plugin.start).mock.calls[0]?.[0].id ?? '';
    mock.emit.response({ id, status: 200, statusText: 'OK', headers: {} });
    const response = await pending;
    mock.emit.error({ id, message: 'Connection lost.' });

    await expect(response.text()).rejects.toThrow('Connection lost.');
  });
});
