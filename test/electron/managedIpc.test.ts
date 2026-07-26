import { describe, expect, it, vi } from 'vitest';
import { registerManagedIpc } from '../../electron/managedIpc.mjs';
import { normalizeManagedErrorPayload } from '../../electron/managedIpcErrors.mjs';
import { createManagedStreamAccumulator } from '../../electron/managedIpcPayloads.mjs';

const MAX_MANAGED_IPC_BODY_BYTES = 64 * 1024 * 1024;
const MAX_MANAGED_STREAM_LINE_CHARS = 1024 * 1024;
const MAX_MANAGED_STREAM_CONTENT_CHARS = 4 * 1024 * 1024;
const MANAGED_STREAM_TIMEOUT_MS = 300_000;

function registerHarness(overrides: Partial<Parameters<typeof registerManagedIpc>[0]> = {}) {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  const options = {
    handleIpc: (name: string, handler: (...args: unknown[]) => unknown) => {
      handlers.set(name, handler);
    },
    requestManagedJson: vi.fn(),
    requestManagedPublicJson: vi.fn(),
    fetchWithStoredSession: vi.fn(),
    managedApiBaseUrl: 'https://api.example.com/v1',
    createElectronBillingCheckout: vi.fn(),
    requireNonEmptyString: (value: unknown) => String(value ?? '').trim(),
    ...overrides,
  };

  registerManagedIpc(options);
  return { handlers, options };
}

function createOversizedBase64Body() {
  const encodedLength = Math.ceil((MAX_MANAGED_IPC_BODY_BYTES + 1) / 3) * 4;
  return `${'A'.repeat(encodedLength - 1)}=`;
}

function streamResponse(chunks: string[]) {
  return new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(new TextEncoder().encode(chunk));
      }
      controller.close();
    },
  }));
}

async function waitForSenderCall(
  sender: { send: ReturnType<typeof vi.fn> },
  predicate: (args: unknown[]) => boolean
) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (sender.send.mock.calls.some(predicate)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

describe('managed ipc stream bridge', () => {
  it('bounds cumulative managed stream content', () => {
    const accumulator = createManagedStreamAccumulator(() => true);

    expect(() => accumulator.pushDelta({
      reasoning: null,
      content: 'x'.repeat(MAX_MANAGED_STREAM_CONTENT_CHARS + 1),
    })).toThrow('Managed stream content is too large.');
  });

  it('preserves the stable unsupported tool capability error', () => {
    expect(normalizeManagedErrorPayload({
      error: 'UNSUPPORTED_TOOL_CALLING',
      errorCode: 'unsupported_tool_calling',
    }, 400)).toEqual({
      message: 'UNSUPPORTED_TOOL_CALLING',
      statusCode: 400,
      errorCode: 'unsupported_tool_calling',
    });
  });

  it('uses public managed requests for model listing only', async () => {
    const { handlers, options } = registerHarness();
    options.requestManagedPublicJson.mockResolvedValueOnce({ data: [] });
    options.requestManagedJson.mockResolvedValue({ success: true });

    await handlers.get('desktop:managed:get-models')?.();
    await handlers.get('desktop:managed:get-budget')?.();
    await handlers.get('desktop:managed:client-diagnostic')?.({}, { kind: 'chat_json', model: 'gpt-5-pro' });
    await handlers.get('desktop:managed:chat-completion')?.({}, {});
    await handlers.get('desktop:managed:image-generation')?.({}, { model: 'gpt-image-2', prompt: 'draw' });
    await handlers.get('desktop:managed:image-edit')?.({}, {
      bodyBase64: Buffer.from('multipart-body').toString('base64'),
      headers: { 'Content-Type': 'multipart/form-data; boundary=test' },
    });

    expect(options.requestManagedPublicJson).toHaveBeenCalledWith('/models', { method: 'GET' });
    expect(options.requestManagedJson).toHaveBeenCalledWith('/budget', { method: 'GET' });
    expect(options.requestManagedJson).toHaveBeenCalledWith('/client-diagnostics', {
      method: 'POST',
      body: '{"kind":"chat_json","model":"gpt-5-pro"}',
    });
    expect(options.requestManagedJson).toHaveBeenCalledWith('/chat/completions', {
      method: 'POST',
      body: '{}',
    });
    expect(options.requestManagedJson).toHaveBeenCalledWith('/images/generations', {
      method: 'POST',
      body: '{"model":"gpt-image-2","prompt":"draw"}',
    });
    expect(options.requestManagedJson).toHaveBeenCalledWith('/images/edits', {
      method: 'POST',
      headers: { 'Content-Type': 'multipart/form-data; boundary=test' },
      body: Buffer.from('multipart-body'),
    });
  });

  it('does not require stored session credentials for managed model listing', async () => {
    const { handlers, options } = registerHarness();
    options.requestManagedPublicJson.mockResolvedValueOnce({ data: [] });

    await handlers.get('desktop:managed:get-models')?.();

    expect(options.requestManagedPublicJson).toHaveBeenCalledTimes(1);
    expect(options.requestManagedJson).not.toHaveBeenCalled();
    expect(options.fetchWithStoredSession).not.toHaveBeenCalled();
  });

  it('sanitizes managed chat completion message content before forwarding', async () => {
    const { handlers, options } = registerHarness();
    options.requestManagedJson.mockResolvedValue({ success: true });

    await handlers.get('desktop:managed:chat-completion')?.({}, {
      model: 'deepseek-chat',
      messages: [
        {
          role: 'assistant',
          content: null,
          reasoning_content: 'hidden',
          tool_calls: [{
            id: 'call-1',
            type: 'function',
            function: { name: 'web_search', arguments: '{"query":"x"}' },
          }],
        },
        { role: 'tool', tool_call_id: 'call-1' },
      ],
    });

    expect(options.requestManagedJson).toHaveBeenCalledWith('/chat/completions', {
      method: 'POST',
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          {
            role: 'assistant',
            content: '',
            reasoning_content: 'hidden',
            tool_calls: [{
              id: 'call-1',
              type: 'function',
              function: { name: 'web_search', arguments: '{"query":"x"}' },
            }],
          },
          { role: 'tool', tool_call_id: 'call-1', content: '' },
        ],
      }),
    });
  });

  it('cancels managed chat completion requests by request id', async () => {
    const { handlers, options } = registerHarness();
    let capturedSignal: AbortSignal | undefined;
    options.requestManagedJson.mockImplementationOnce((_path, init) => {
      capturedSignal = init.signal as AbortSignal | undefined;
      return new Promise((_resolve, reject) => {
        capturedSignal?.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'));
        }, { once: true });
      });
    });

    const request = handlers.get('desktop:managed:chat-completion')?.(
      {},
      'managed-json-1',
      { model: 'deepseek-chat' },
    ) as Promise<unknown>;
    request.catch(() => undefined);

    await Promise.resolve();
    await handlers.get('desktop:managed:chat-completion:cancel')?.({}, 'managed-json-1');

    expect(capturedSignal?.aborted).toBe(true);
    await expect(request).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('cancels managed image generation requests by request id', async () => {
    const { handlers, options } = registerHarness();
    let capturedSignal: AbortSignal | undefined;
    options.requestManagedJson.mockImplementationOnce((_path, init) => {
      capturedSignal = init.signal as AbortSignal | undefined;
      return new Promise((_resolve, reject) => {
        capturedSignal?.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'));
        }, { once: true });
      });
    });

    const request = handlers.get('desktop:managed:image-generation')?.(
      {},
      'managed-image-generation-1',
      { model: 'gpt-image-2', prompt: 'draw' },
    ) as Promise<unknown>;
    request.catch(() => undefined);

    await Promise.resolve();
    await handlers.get('desktop:managed:image-generation:cancel')?.({}, 'managed-image-generation-1');

    expect(capturedSignal?.aborted).toBe(true);
    await expect(request).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('cancels managed image edit requests by request id', async () => {
    const { handlers, options } = registerHarness();
    let capturedSignal: AbortSignal | undefined;
    options.requestManagedJson.mockImplementationOnce((_path, init) => {
      capturedSignal = init.signal as AbortSignal | undefined;
      return new Promise((_resolve, reject) => {
        capturedSignal?.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'));
        }, { once: true });
      });
    });

    const request = handlers.get('desktop:managed:image-edit')?.(
      {},
      'managed-image-edit-1',
      {
        bodyBase64: Buffer.from('multipart-body').toString('base64'),
        headers: { 'Content-Type': 'multipart/form-data; boundary=test' },
      },
    ) as Promise<unknown>;
    request.catch(() => undefined);

    await Promise.resolve();
    await handlers.get('desktop:managed:image-edit:cancel')?.({}, 'managed-image-edit-1');

    expect(capturedSignal?.aborted).toBe(true);
    await expect(request).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('rejects oversized managed image edit bodies before transport', async () => {
    const { handlers, options } = registerHarness();

    await expect(
      handlers.get('desktop:managed:image-edit')?.({}, {
        bodyBase64: createOversizedBase64Body(),
        headers: { 'Content-Type': 'multipart/form-data; boundary=test' },
      }),
    ).rejects.toThrow('Managed binary request body is too large.');

    expect(options.requestManagedJson).not.toHaveBeenCalled();
  });

  it('rejects managed image edit headers that could override desktop session credentials', async () => {
    const { handlers, options } = registerHarness();
    const bodyBase64 = Buffer.from('multipart-body').toString('base64');

    await expect(
      handlers.get('desktop:managed:image-edit')?.({}, {
        bodyBase64,
        headers: {
          'Content-Type': 'multipart/form-data; boundary=test',
          Authorization: 'Bearer attacker',
        },
      }),
    ).rejects.toThrow('Invalid managed binary request header.');
    await expect(
      handlers.get('desktop:managed:image-edit')?.({}, {
        bodyBase64,
        headers: {
          'x-app-session-token': 'attacker',
        },
      }),
    ).rejects.toThrow('Invalid managed binary request header.');

    expect(options.requestManagedJson).not.toHaveBeenCalled();
  });

  it('rejects object request ids and managed headers without coercion', async () => {
    const { handlers, options } = registerHarness();
    let stringReads = 0;
    const throwingValue = {
      toString() {
        stringReads += 1;
        throw new Error('Unexpected managed IPC coercion');
      },
    };

    await expect(
      handlers.get('desktop:managed:chat-completion')?.({}, throwingValue, {}),
    ).rejects.toThrow('managed chat completion request id must contain only safe channel characters.');
    await expect(
      handlers.get('desktop:managed:image-edit')?.({}, {
        bodyBase64: '',
        headers: { 'X-Test': throwingValue },
      }),
    ).rejects.toThrow('Invalid managed binary request header.');

    expect(stringReads).toBe(0);
    expect(options.requestManagedJson).not.toHaveBeenCalled();
  });

  it('rejects managed json results that resolve after cancellation', async () => {
    const { handlers, options } = registerHarness();
    let resolveRequest: ((value: unknown) => void) | undefined;
    let capturedSignal: AbortSignal | undefined;
    options.requestManagedJson.mockImplementationOnce((_path, init) => {
      capturedSignal = init.signal as AbortSignal | undefined;
      return new Promise((resolve) => {
        resolveRequest = resolve;
      });
    });

    const request = handlers.get('desktop:managed:chat-completion')?.(
      {},
      'managed-json-stale',
      { model: 'deepseek-chat' },
    ) as Promise<unknown>;
    request.catch(() => undefined);

    await Promise.resolve();
    await handlers.get('desktop:managed:chat-completion:cancel')?.({}, 'managed-json-stale');
    resolveRequest?.({ choices: [{ message: { content: 'stale' } }] });

    expect(capturedSignal?.aborted).toBe(true);
    await expect(request).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('rejects managed json requests promptly even when the transport ignores cancellation', async () => {
    const { handlers, options } = registerHarness();
    let capturedSignal: AbortSignal | undefined;
    options.requestManagedJson.mockImplementationOnce((_path, init) => {
      capturedSignal = init.signal as AbortSignal | undefined;
      return new Promise(() => undefined);
    });

    const request = handlers.get('desktop:managed:chat-completion')?.(
      {},
      'managed-json-ignores-abort',
      { model: 'deepseek-chat' },
    ) as Promise<unknown>;
    request.catch(() => undefined);

    await Promise.resolve();
    await handlers.get('desktop:managed:chat-completion:cancel')?.({}, 'managed-json-ignores-abort');

    expect(capturedSignal?.aborted).toBe(true);
    await expect(request).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('does not let an old managed json request clear or resolve a newer request with the same id', async () => {
    const { handlers, options } = registerHarness();
    const signals: AbortSignal[] = [];
    let resolveFirst: ((value: unknown) => void) | undefined;
    let resolveSecond: ((value: unknown) => void) | undefined;
    options.requestManagedJson
      .mockImplementationOnce((_path, init) => {
        signals.push(init.signal as AbortSignal);
        return new Promise((resolve) => {
          resolveFirst = resolve;
        });
      })
      .mockImplementationOnce((_path, init) => {
        signals.push(init.signal as AbortSignal);
        return new Promise((resolve) => {
          resolveSecond = resolve;
        });
      });

    const first = handlers.get('desktop:managed:image-generation')?.(
      {},
      'managed-json-reused',
      { model: 'gpt-image-2', prompt: 'first' },
    ) as Promise<unknown>;
    first.catch(() => undefined);
    await Promise.resolve();

    const second = handlers.get('desktop:managed:image-generation')?.(
      {},
      'managed-json-reused',
      { model: 'gpt-image-2', prompt: 'second' },
    ) as Promise<unknown>;
    second.catch(() => undefined);
    await Promise.resolve();

    resolveFirst?.({ data: [{ url: 'stale' }] });
    await expect(first).rejects.toMatchObject({ name: 'AbortError' });

    await handlers.get('desktop:managed:image-generation:cancel')?.({}, 'managed-json-reused');
    resolveSecond?.({ data: [{ url: 'current-but-cancelled' }] });

    expect(signals).toHaveLength(2);
    expect(signals[0].aborted).toBe(true);
    expect(signals[1].aborted).toBe(true);
    await expect(second).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('sanitizes managed stream message content before forwarding', async () => {
    const fetchWithStoredSession = vi.fn(async () => streamResponse([
      'data: {"choices":[{"delta":{"content":"ok"}}]}\n\n',
    ]));
    const { handlers } = registerHarness({ fetchWithStoredSession });
    const sender = { isDestroyed: () => false, send: vi.fn() };

    await handlers.get('desktop:managed:chat-completion-stream:start')?.({ sender }, 'managed-sanitize', {
      model: 'deepseek-chat',
      messages: [
        {
          role: 'assistant',
          content: null,
          tool_calls: [{
            id: 'call-1',
            type: 'function',
            function: { name: 'web_search', arguments: '{"query":"x"}' },
          }],
        },
      ],
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(JSON.parse(fetchWithStoredSession.mock.calls[0][1].body as string)).toMatchObject({
      model: 'deepseek-chat',
      messages: [{
        role: 'assistant',
        content: '',
        tool_calls: expect.any(Array),
      }],
    });
    expect(fetchWithStoredSession.mock.calls[0][1].headers).toMatchObject({
      Accept: 'text/event-stream',
      'Content-Type': 'application/json',
    });
  });

  it('rejects unsafe stream request ids before starting a request', async () => {
    const { handlers, options } = registerHarness();

    await expect(
      handlers.get('desktop:managed:chat-completion-stream:start')?.(
        { sender: { isDestroyed: () => false, send: vi.fn() } },
        'managed\nother',
        {},
      ),
    ).rejects.toThrow('safe channel characters');
    expect(options.fetchWithStoredSession).not.toHaveBeenCalled();
  });

  it('does not let an old stream cleanup or abort event affect a newer stream with the same id', async () => {
    const cancelFirstStream = vi.fn();
    const signals: AbortSignal[] = [];
    const firstStream = new ReadableStream<Uint8Array>({
      start() {
      },
      cancel() {
        cancelFirstStream();
      },
    });
    const secondStream = new ReadableStream<Uint8Array>({ start() {} });
    const fetchWithStoredSession = vi
      .fn()
      .mockImplementationOnce(async (_url: string, init: RequestInit) => {
        signals.push(init.signal as AbortSignal);
        return new Response(firstStream);
      })
      .mockImplementationOnce(async (_url: string, init: RequestInit) => {
        signals.push(init.signal as AbortSignal);
        return new Response(secondStream);
      });
    const { handlers } = registerHarness({ fetchWithStoredSession });
    const sender = { isDestroyed: () => false, send: vi.fn() };

    await handlers.get('desktop:managed:chat-completion-stream:start')?.({ sender }, 'managed-1', {});
    await handlers.get('desktop:managed:chat-completion-stream:start')?.({ sender }, 'managed-1', {});
    await Promise.resolve();
    await Promise.resolve();

    await handlers.get('desktop:managed:chat-completion-stream:cancel')?.({}, 'managed-1');

    expect(signals).toHaveLength(2);
    expect(signals[0].aborted).toBe(true);
    expect(signals[1].aborted).toBe(true);
    expect(cancelFirstStream).toHaveBeenCalledTimes(1);
    expect(sender.send).not.toHaveBeenCalledWith(
      'desktop:managed:stream:managed-1:error',
      { message: 'Aborted' },
    );
  });

  it('ignores managed stream responses that resolve after initial fetch cancellation', async () => {
    let resolveFetch: ((value: Response) => void) | undefined;
    const signals: AbortSignal[] = [];
    const fetchWithStoredSession = vi.fn((_url: string, init: RequestInit) => {
      signals.push(init.signal as AbortSignal);
      return new Promise<Response>((resolve) => {
        resolveFetch = resolve;
      });
    });
    const { handlers } = registerHarness({ fetchWithStoredSession });
    const sender = { isDestroyed: () => false, send: vi.fn() };

    await handlers.get('desktop:managed:chat-completion-stream:start')?.({ sender }, 'managed-fetch-late', {});
    await vi.waitFor(() => expect(fetchWithStoredSession).toHaveBeenCalled());
    await handlers.get('desktop:managed:chat-completion-stream:cancel')?.({}, 'managed-fetch-late');
    resolveFetch?.(streamResponse([
      'data: {"choices":[{"delta":{"content":"late"}}]}\n\n',
    ]));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(signals).toHaveLength(1);
    expect(signals[0].aborted).toBe(true);
    expect(sender.send).not.toHaveBeenCalled();
  });

  it('releases managed stream readers promptly when read and cancel both ignore abort', async () => {
    const fakeReader = {
      read: vi.fn(() => new Promise<ReadableStreamReadResult<Uint8Array>>(() => undefined)),
      cancel: vi.fn(() => new Promise<void>(() => undefined)),
      releaseLock: vi.fn(),
    };
    const fetchWithStoredSession = vi.fn(async () => ({
      ok: true,
      status: 200,
      body: {
        getReader: () => fakeReader,
      },
    }));
    const { handlers } = registerHarness({ fetchWithStoredSession });
    const sender = { isDestroyed: () => false, send: vi.fn() };

    await handlers.get('desktop:managed:chat-completion-stream:start')?.({ sender }, 'managed-reader-hangs', {});
    await vi.waitFor(() => expect(fakeReader.read).toHaveBeenCalled());
    await handlers.get('desktop:managed:chat-completion-stream:cancel')?.({}, 'managed-reader-hangs');

    await vi.waitFor(() => expect(fakeReader.releaseLock).toHaveBeenCalledTimes(1));
    expect(fakeReader.cancel).toHaveBeenCalled();
    expect(sender.send).not.toHaveBeenCalledWith(
      'desktop:managed:stream:managed-reader-hangs:error',
      { message: 'Aborted' },
    );
  });

  it('times out stalled managed streams locally without posting diagnostics', async () => {
    vi.useFakeTimers();
    try {
      const reader = {
        read: vi.fn(() => new Promise<ReadableStreamReadResult<Uint8Array>>(() => undefined)),
        cancel: vi.fn(async () => undefined),
        releaseLock: vi.fn(),
      };
      const fetchWithStoredSession = vi.fn(async () => ({
        ok: true,
        status: 200,
        body: {
          getReader: () => reader,
        },
      }));
      const { handlers } = registerHarness({ fetchWithStoredSession });
      const sender = { isDestroyed: () => false, send: vi.fn() };

      await handlers.get('desktop:managed:chat-completion-stream:start')?.({ sender }, 'managed-stream-timeout', {
        model: 'deepseek-chat',
      });
      await vi.waitFor(() => expect(reader.read).toHaveBeenCalled());
      await vi.advanceTimersByTimeAsync(MANAGED_STREAM_TIMEOUT_MS);
      await vi.waitFor(() => expect(sender.send).toHaveBeenCalledWith(
        'desktop:managed:stream:managed-stream-timeout:error',
        {
          message: 'Managed stream timed out.',
          statusCode: undefined,
          errorCode: 'managed_stream_timeout',
        },
      ));

      expect(reader.cancel).toHaveBeenCalled();
      expect(reader.releaseLock).toHaveBeenCalledTimes(1);
      expect(fetchWithStoredSession).toHaveBeenCalledTimes(1);
      expect(String(fetchWithStoredSession.mock.calls[0]?.[0])).toBe('https://api.example.com/v1/chat/completions');
    } finally {
      vi.useRealTimers();
    }
  });

  it('consumes the final SSE line without a trailing newline', async () => {
    const fetchWithStoredSession = vi.fn(async () => streamResponse([
      'data: {"choices":[{"delta":{"content":"final"}}]}',
    ]));
    const { handlers } = registerHarness({ fetchWithStoredSession });
    const sender = { isDestroyed: () => false, send: vi.fn() };

    await handlers.get('desktop:managed:chat-completion-stream:start')?.({ sender }, 'managed-final', {});
    await waitForSenderCall(sender, ([channel]) =>
      channel === 'desktop:managed:stream:managed-final:done'
    );

    expect(sender.send).toHaveBeenCalledWith('desktop:managed:stream:managed-final:chunk', 'final');
    expect(sender.send).toHaveBeenCalledWith('desktop:managed:stream:managed-final:done', { content: 'final' });
  });

  it('coalesces rapid managed stream chunks before crossing the IPC boundary', async () => {
    const deltas = Array.from({ length: 20 }, (_, index) =>
      `data: {"choices":[{"delta":{"content":"${index}"}}]}\n\n`
    );
    const fetchWithStoredSession = vi.fn(async () => streamResponse(deltas));
    const { handlers } = registerHarness({ fetchWithStoredSession });
    const sender = { isDestroyed: () => false, send: vi.fn() };

    await handlers.get('desktop:managed:chat-completion-stream:start')?.({ sender }, 'managed-coalesced', {});
    await waitForSenderCall(sender, ([channel]) =>
      channel === 'desktop:managed:stream:managed-coalesced:done'
    );

    const chunkCalls = sender.send.mock.calls.filter(([channel]) =>
      channel === 'desktop:managed:stream:managed-coalesced:chunk'
    );
    expect(chunkCalls.length).toBeLessThan(deltas.length);
    expect(chunkCalls.at(-1)?.[1]).toBe(Array.from({ length: 20 }, (_, index) => String(index)).join(''));
  });

  it('rejects managed stream buffers that grow too large before a newline arrives', async () => {
    const fetchWithStoredSession = vi.fn(async () => streamResponse([
      'x'.repeat(MAX_MANAGED_STREAM_LINE_CHARS),
      'x',
    ]));
    const { handlers } = registerHarness({ fetchWithStoredSession });
    const sender = { isDestroyed: () => false, send: vi.fn() };

    await handlers.get('desktop:managed:chat-completion-stream:start')?.({ sender }, 'managed-oversized-buffer', {});
    await waitForSenderCall(sender, ([channel]) =>
      channel === 'desktop:managed:stream:managed-oversized-buffer:error'
    );

    expect(sender.send).toHaveBeenCalledWith(
      'desktop:managed:stream:managed-oversized-buffer:error',
      { message: 'Managed stream line is too large.', statusCode: undefined, errorCode: undefined },
    );
  });

  it('keeps resumed managed reasoning hidden after visible content has started', async () => {
    const fetchWithStoredSession = vi.fn(async () => streamResponse([
      'data: {"choices":[{"delta":{"reasoning_content":"first"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"visible"}}]}\n\n',
      'data: {"choices":[{"delta":{"reasoning_content":"second"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":" answer"}}]}\n\n',
      'data: [DONE]\n\n',
    ]));
    const { handlers } = registerHarness({ fetchWithStoredSession });
    const sender = { isDestroyed: () => false, send: vi.fn() };

    await handlers.get('desktop:managed:chat-completion-stream:start')?.({ sender }, 'managed-reasoning', {});
    await waitForSenderCall(sender, ([channel]) =>
      channel === 'desktop:managed:stream:managed-reasoning:done'
    );

    expect(sender.send).toHaveBeenCalledWith(
      'desktop:managed:stream:managed-reasoning:chunk',
      '<think>first</think>visible<think>second</think> answer',
    );
    expect(sender.send).toHaveBeenCalledWith(
      'desktop:managed:stream:managed-reasoning:done',
      { content: '<think>first</think>visible<think>second</think> answer' },
    );
  });

  it('surfaces managed stream error payloads', async () => {
    const fetchWithStoredSession = vi.fn(async () => streamResponse([
      'data: {"error":{"message":"upstream failed"}}\n\n',
    ]));
    const { handlers } = registerHarness({ fetchWithStoredSession });
    const sender = { isDestroyed: () => false, send: vi.fn() };

    await handlers.get('desktop:managed:chat-completion-stream:start')?.({ sender }, 'managed-error', {});
    await waitForSenderCall(sender, ([channel]) =>
      channel === 'desktop:managed:stream:managed-error:error'
    );

    expect(sender.send).toHaveBeenCalledWith('desktop:managed:stream:managed-error:error', { message: 'upstream failed' });
    expect(fetchWithStoredSession).toHaveBeenCalledTimes(1);
  });

  it('summarizes non-primitive managed stream errors without coercion', async () => {
    let stringReads = 0;
    const throwingError = {
      toString() {
        stringReads += 1;
        throw new Error('Unexpected managed stream error coercion');
      },
    };
    const fetchWithStoredSession = vi.fn(async () => {
      throw throwingError;
    });
    const { handlers } = registerHarness({ fetchWithStoredSession });
    const sender = { isDestroyed: () => false, send: vi.fn() };

    await handlers.get('desktop:managed:chat-completion-stream:start')?.({ sender }, 'managed-object-error', {});
    await waitForSenderCall(sender, ([channel]) =>
      channel === 'desktop:managed:stream:managed-object-error:error'
    );

    expect(stringReads).toBe(0);
    expect(sender.send).toHaveBeenCalledWith('desktop:managed:stream:managed-object-error:error', {
      message: 'Unknown error',
      statusCode: undefined,
      errorCode: undefined,
    });
  });

  it('rejects oversized managed stream lines', async () => {
    const fetchWithStoredSession = vi.fn(async () => streamResponse([
      'x'.repeat(MAX_MANAGED_STREAM_LINE_CHARS + 1),
    ]));
    const { handlers } = registerHarness({ fetchWithStoredSession });
    const sender = { isDestroyed: () => false, send: vi.fn() };

    await handlers.get('desktop:managed:chat-completion-stream:start')?.({ sender }, 'managed-line-too-large', {});
    await waitForSenderCall(sender, ([channel]) =>
      channel === 'desktop:managed:stream:managed-line-too-large:error'
    );

    expect(sender.send).toHaveBeenCalledWith('desktop:managed:stream:managed-line-too-large:error', {
      message: 'Managed stream line is too large.',
      statusCode: undefined,
      errorCode: undefined,
    });
  });

  it('extracts sanitized managed HTTP error payloads for streams', async () => {
    const fetchWithStoredSession = vi.fn(async () => new Response(
      JSON.stringify({
        success: false,
        error: 'UPSTREAM_UNAVAILABLE',
        errorCode: 'upstream_unavailable',
      }),
      {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      },
    ));
    const { handlers } = registerHarness({ fetchWithStoredSession });
    const sender = { isDestroyed: () => false, send: vi.fn() };

    await handlers.get('desktop:managed:chat-completion-stream:start')?.({ sender }, 'managed-http-error', {});
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(sender.send).toHaveBeenCalledWith('desktop:managed:stream:managed-http-error:error', {
      message: 'UPSTREAM_UNAVAILABLE',
      statusCode: 502,
      errorCode: 'upstream_unavailable',
    });
  });

  it('extracts managed HTTP nested error types for streams', async () => {
    const fetchWithStoredSession = vi.fn(async () => new Response(
      JSON.stringify({
        type: 'error',
        error: {
          type: 'points_exhausted',
          message: 'quota unavailable',
        },
      }),
      {
        status: 402,
        headers: { 'Content-Type': 'application/json' },
      },
    ));
    const { handlers } = registerHarness({ fetchWithStoredSession });
    const sender = { isDestroyed: () => false, send: vi.fn() };

    await handlers.get('desktop:managed:chat-completion-stream:start')?.({ sender }, 'managed-http-error-type', {});
    await waitForSenderCall(sender, ([channel]) =>
      channel === 'desktop:managed:stream:managed-http-error-type:error'
    );

    expect(sender.send).toHaveBeenCalledWith('desktop:managed:stream:managed-http-error-type:error', {
      message: 'MANAGED_QUOTA_EXHAUSTED',
      statusCode: 402,
      errorCode: 'points_exhausted',
    });
  });

  it('bounds managed stream HTTP error body reads', async () => {
    const cancel = vi.fn();
    const encoder = new TextEncoder();
    const fetchWithStoredSession = vi.fn(async () => new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode('x'.repeat(64 * 1024 + 1)));
        },
        cancel,
      }),
      { status: 502 },
    ));
    const { handlers } = registerHarness({ fetchWithStoredSession });
    const sender = { isDestroyed: () => false, send: vi.fn() };

    await handlers.get('desktop:managed:chat-completion-stream:start')?.({ sender }, 'managed-http-error-large', {});
    await waitForSenderCall(sender, ([channel]) =>
      channel === 'desktop:managed:stream:managed-http-error-large:error'
    );

    expect(cancel).toHaveBeenCalledTimes(1);
    expect(sender.send).toHaveBeenCalledWith('desktop:managed:stream:managed-http-error-large:error', {
      message: 'Managed stream failed: HTTP 502',
      statusCode: 502,
      errorCode: undefined,
    });
  });

  it('cancels managed stream requests while HTTP error bodies are still pending without emitting stale events', async () => {
    const reader = {
      read: vi.fn(() => new Promise<ReadableStreamReadResult<Uint8Array>>(() => undefined)),
      cancel: vi.fn(async () => undefined),
      releaseLock: vi.fn(),
    };
    const fetchWithStoredSession = vi.fn(async () => ({
      ok: false,
      status: 502,
      body: {
        getReader: () => reader,
      },
    }));
    const { handlers } = registerHarness({ fetchWithStoredSession });
    const sender = { isDestroyed: () => false, send: vi.fn() };

    await handlers.get('desktop:managed:chat-completion-stream:start')?.({ sender }, 'managed-error-cancel', {});
    await vi.waitFor(() => expect(reader.read).toHaveBeenCalled());
    await handlers.get('desktop:managed:chat-completion-stream:cancel')?.({}, 'managed-error-cancel');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(reader.cancel).toHaveBeenCalled();
    expect(reader.releaseLock).toHaveBeenCalledTimes(1);
    expect(sender.send).not.toHaveBeenCalledWith(
      'desktop:managed:stream:managed-error-cancel:error',
      { message: 'Aborted' },
    );
  });
});
