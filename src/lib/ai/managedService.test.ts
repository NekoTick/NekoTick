import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  hasElectronDesktopBridgeMock,
  clearClientSessionMock,
  getManagedModelsMock,
  getManagedModelsVersionMock,
  managedChatCompletionMock,
  managedChatCompletionStreamMock,
  managedImageGenerationMock,
  managedImageEditMock,
  reportManagedClientDiagnosticMock,
} = vi.hoisted(() => ({
  hasElectronDesktopBridgeMock: vi.fn(),
  clearClientSessionMock: vi.fn(),
  getManagedModelsMock: vi.fn(),
  getManagedModelsVersionMock: vi.fn(),
  managedChatCompletionMock: vi.fn(),
  managedChatCompletionStreamMock: vi.fn(),
  managedImageGenerationMock: vi.fn(),
  managedImageEditMock: vi.fn(),
  reportManagedClientDiagnosticMock: vi.fn(),
}));

vi.mock('@/lib/desktop/backend', () => ({
  hasElectronDesktopBridge: hasElectronDesktopBridgeMock,
}));

vi.mock('@/lib/account/desktopCommands', () => ({
  accountCommands: {
    getManagedModels: getManagedModelsMock,
    getManagedModelsVersion: getManagedModelsVersionMock,
    getManagedBudget: vi.fn(),
    reportManagedClientDiagnostic: reportManagedClientDiagnosticMock,
    managedChatCompletion: managedChatCompletionMock,
    managedChatCompletionStream: managedChatCompletionStreamMock,
    managedImageGeneration: managedImageGenerationMock,
    managedImageEdit: managedImageEditMock,
  },
}));

vi.mock('@/lib/account/webCommands', () => ({
  webAccountCommands: {
    clearClientSession: clearClientSessionMock,
  },
}));

function managedJsonResponse(payload: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  if (!headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }
  return new Response(JSON.stringify(payload), {
    ...init,
    headers,
  });
}

describe('managedService', () => {
  beforeEach(() => {
    vi.resetModules();
    hasElectronDesktopBridgeMock.mockReset();
    clearClientSessionMock.mockReset();
    getManagedModelsMock.mockReset();
    getManagedModelsVersionMock.mockReset();
    managedChatCompletionMock.mockReset();
    managedChatCompletionStreamMock.mockReset();
    managedImageGenerationMock.mockReset();
    managedImageEditMock.mockReset();
    reportManagedClientDiagnosticMock.mockReset();
    vi.restoreAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'debug').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  it('reports managed client diagnostics only through the desktop session bridge', async () => {
    hasElectronDesktopBridgeMock.mockReturnValue(true);
    reportManagedClientDiagnosticMock.mockResolvedValue({});
    const { reportManagedDesktopClientDiagnostic } = await import('./managedService');

    await reportManagedDesktopClientDiagnostic({ kind: 'chat_json', model: 'gpt-5-pro' });

    expect(reportManagedClientDiagnosticMock).toHaveBeenCalledWith({ kind: 'chat_json', model: 'gpt-5-pro' });
  });

  it('uses credentialed web requests for managed models', async () => {
    hasElectronDesktopBridgeMock.mockReturnValue(false);
    const fetchMock = vi.fn().mockResolvedValue(
      managedJsonResponse({
        data: [{ id: 'gpt-4o-mini', display_name: 'GPT-4o Mini' }],
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const { fetchManagedModels } = await import('./managedService');
    const models = await fetchManagedModels();

    expect(models).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledWith('https://api.vlaina.com/v1/models', {
      method: 'GET',
      cache: 'no-store',
      credentials: 'include',
      signal: expect.any(AbortSignal),
      headers: {
        Accept: 'application/json',
      },
    });
  });

  it('reuses the managed model catalog inside the short local cache window', async () => {
    hasElectronDesktopBridgeMock.mockReturnValue(false);
    const fetchMock = vi.fn().mockResolvedValue(
      managedJsonResponse({
        model_catalog_version: 'v1',
        data: [{ id: 'gpt-4o-mini', display_name: 'GPT-4o Mini' }],
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const { fetchManagedModelCatalog, fetchManagedModels } = await import('./managedService');
    const first = await fetchManagedModelCatalog();
    const second = await fetchManagedModels();

    expect(first.version).toBe('v1');
    expect(second.map((model) => model.apiModelId)).toEqual(['gpt-4o-mini']);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('coalesces concurrent managed model catalog requests', async () => {
    hasElectronDesktopBridgeMock.mockReturnValue(false);
    let resolveFetch!: (value: Response) => void;
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    }));
    vi.stubGlobal('fetch', fetchMock);

    const { fetchManagedModelCatalog } = await import('./managedService');
    const first = fetchManagedModelCatalog();
    const second = fetchManagedModelCatalog();
    resolveFetch(managedJsonResponse({
      model_catalog_version: 'v1',
      data: [{ id: 'gpt-4o-mini', display_name: 'GPT-4o Mini' }],
    }));

    await expect(first).resolves.toMatchObject({ version: 'v1' });
    await expect(second).resolves.toMatchObject({ version: 'v1' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('invalidates the cached managed catalog when the lightweight version changes', async () => {
    hasElectronDesktopBridgeMock.mockReturnValue(false);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(managedJsonResponse({
        model_catalog_version: 'v1',
        data: [{ id: 'old-model', display_name: 'Old Model' }],
      }))
      .mockResolvedValueOnce(managedJsonResponse({
        success: true,
        model_catalog_version: 'v2',
      }))
      .mockResolvedValueOnce(managedJsonResponse({
        model_catalog_version: 'v2',
        data: [{ id: 'new-model', display_name: 'New Model' }],
      }));
    vi.stubGlobal('fetch', fetchMock);

    const { fetchManagedModelCatalog, fetchManagedModelsVersion } = await import('./managedService');
    const first = await fetchManagedModelCatalog();
    const version = await fetchManagedModelsVersion();
    const second = await fetchManagedModelCatalog();

    expect(first.models.map((model) => model.apiModelId)).toEqual(['old-model']);
    expect(version).toBe('v2');
    expect(second.models.map((model) => model.apiModelId)).toEqual(['new-model']);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('uses lightweight web requests for managed model versions', async () => {
    hasElectronDesktopBridgeMock.mockReturnValue(false);
    const fetchMock = vi.fn().mockResolvedValue(
      managedJsonResponse({
        success: true,
        model_catalog_version: 'v1',
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const { fetchManagedModelsVersion } = await import('./managedService');
    const version = await fetchManagedModelsVersion();

    expect(version).toBe('v1');
    expect(fetchMock).toHaveBeenCalledWith('https://api.vlaina.com/v1/models/version', {
      method: 'GET',
      cache: 'no-store',
      credentials: 'include',
      signal: expect.any(AbortSignal),
      headers: {
        Accept: 'application/json',
      },
    });
  });

  it('retries quickly failed managed web GET requests once', async () => {
    vi.useFakeTimers();
    try {
      hasElectronDesktopBridgeMock.mockReturnValue(false);
      const fetchMock = vi
        .fn()
        .mockRejectedValueOnce(new TypeError('fetch failed'))
        .mockResolvedValueOnce(managedJsonResponse({
            success: true,
            model_catalog_version: 'v2',
          }));
      vi.stubGlobal('fetch', fetchMock);

      const { fetchManagedModelsVersion } = await import('./managedService');
      const request = fetchManagedModelsVersion();

      await vi.advanceTimersByTimeAsync(300);

      await expect(request).resolves.toBe('v2');
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('retries abort-shaped managed web GET failures when the request was not cancelled', async () => {
    vi.useFakeTimers();
    try {
      hasElectronDesktopBridgeMock.mockReturnValue(false);
      const fetchMock = vi
        .fn()
        .mockRejectedValueOnce(new DOMException('upstream reset', 'AbortError'))
        .mockResolvedValueOnce(managedJsonResponse({
            success: true,
            model_catalog_version: 'v3',
          }));
      vi.stubGlobal('fetch', fetchMock);

      const { fetchManagedModelsVersion } = await import('./managedService');
      const request = fetchManagedModelsVersion();

      await vi.advanceTimersByTimeAsync(300);

      await expect(request).resolves.toBe('v3');
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not retry managed web POST requests', async () => {
    hasElectronDesktopBridgeMock.mockReturnValue(false);
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('fetch failed'));
    vi.stubGlobal('fetch', fetchMock);

    const { requestManagedChatCompletion } = await import('./managedService');
    await expect(requestManagedChatCompletion({ model: 'gpt-4o-mini' })).rejects.toThrow('fetch failed');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reports managed web JSON timeouts without treating them as user aborts', async () => {
    vi.useFakeTimers();
    try {
      hasElectronDesktopBridgeMock.mockReturnValue(false);
      const fetchMock = vi.fn((_url, init) => new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => {
          reject(new DOMException('timeout abort', 'AbortError'));
        }, { once: true });
      }));
      vi.stubGlobal('fetch', fetchMock);

      const { requestManagedChatCompletion } = await import('./managedService');
      const request = requestManagedChatCompletion({ model: 'gpt-4o-mini' });
      const expectation = expect(request).rejects.toThrow('Managed API request timed out.');

      await vi.advanceTimersByTimeAsync(30_000);

      await expectation;
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('reports managed web JSON timeouts during response parsing', async () => {
    vi.useFakeTimers();
    try {
      hasElectronDesktopBridgeMock.mockReturnValue(false);
      const reader = {
        read: vi.fn(() => new Promise<ReadableStreamReadResult<Uint8Array>>(() => undefined)),
        cancel: vi.fn(async () => undefined),
        releaseLock: vi.fn(),
      };
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers(),
        body: {
          getReader: () => reader,
        },
      });
      vi.stubGlobal('fetch', fetchMock);

      const { requestManagedChatCompletion } = await import('./managedService');
      const request = requestManagedChatCompletion({ model: 'gpt-4o-mini' });
      const expectation = expect(request).rejects.toThrow('Managed API request timed out.');

      await vi.advanceTimersByTimeAsync(0);
      expect(reader.read).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(30_000);

      await expectation;
      expect(reader.cancel).toHaveBeenCalledTimes(1);
      expect(reader.releaseLock).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not start managed web JSON requests when the external signal is already aborted', async () => {
    hasElectronDesktopBridgeMock.mockReturnValue(false);
    const controller = new AbortController();
    controller.abort();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const { requestManagedChatCompletion } = await import('./managedService');

    await expect(requestManagedChatCompletion({ model: 'gpt-4o-mini' }, controller.signal))
      .rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects managed web JSON requests promptly when fetch ignores cancellation', async () => {
    hasElectronDesktopBridgeMock.mockReturnValue(false);
    const controller = new AbortController();
    const fetchMock = vi.fn(() => new Promise(() => undefined));
    vi.stubGlobal('fetch', fetchMock);

    const { requestManagedChatCompletion } = await import('./managedService');
    const request = requestManagedChatCompletion({ model: 'gpt-4o-mini' }, controller.signal);
    request.catch(() => undefined);

    await Promise.resolve();
    controller.abort();

    await expect(request).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reports managed web JSON timeouts even when fetch ignores cancellation', async () => {
    vi.useFakeTimers();
    try {
      hasElectronDesktopBridgeMock.mockReturnValue(false);
      const fetchMock = vi.fn(() => new Promise(() => undefined));
      vi.stubGlobal('fetch', fetchMock);

      const { requestManagedChatCompletion } = await import('./managedService');
      const request = requestManagedChatCompletion({ model: 'gpt-4o-mini' });
      const expectation = expect(request).rejects.toThrow('Managed API request timed out.');

      await vi.advanceTimersByTimeAsync(30_000);

      await expectation;
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not return managed web JSON results after external cancellation during response parsing', async () => {
    hasElectronDesktopBridgeMock.mockReturnValue(false);
    const controller = new AbortController();
    const reader = {
      read: vi.fn(async () => {
        controller.abort();
        return {
          done: false,
          value: new TextEncoder().encode(JSON.stringify({ choices: [{ message: { content: 'late success' } }] })),
        };
      }),
      cancel: vi.fn(async () => undefined),
      releaseLock: vi.fn(),
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers(),
      body: {
        getReader: () => reader,
      },
    });
    vi.stubGlobal('fetch', fetchMock);

    const { requestManagedChatCompletion } = await import('./managedService');

    await expect(requestManagedChatCompletion({ model: 'gpt-4o-mini' }, controller.signal))
      .rejects.toMatchObject({ name: 'AbortError' });
    expect(reader.cancel).toHaveBeenCalledTimes(1);
    expect(reader.releaseLock).toHaveBeenCalledTimes(1);
  });

  it('rejects oversized managed web JSON responses before reading the body', async () => {
    hasElectronDesktopBridgeMock.mockReturnValue(false);
    const cancel = vi.fn();
    const response = new Response(
      new ReadableStream({
        cancel,
      }),
      {
        status: 200,
        headers: {
          'content-length': String(64 * 1024 * 1024 + 1),
        },
      }
    );
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));

    const { requestManagedChatCompletion } = await import('./managedService');

    await expect(requestManagedChatCompletion({ model: 'gpt-4o-mini' }))
      .rejects.toThrow('Managed API response body is too large.');
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(() => response.body?.getReader()).not.toThrow();
  });

  it('cancels managed web JSON body reads when the streamed body exceeds the limit', async () => {
    hasElectronDesktopBridgeMock.mockReturnValue(false);
    const reader = {
      read: vi.fn(async () => ({
        done: false,
        value: { byteLength: 64 * 1024 * 1024 + 1 } as Uint8Array,
      })),
      cancel: vi.fn(async () => undefined),
      releaseLock: vi.fn(),
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers(),
      body: {
        getReader: () => reader,
      },
    }));

    const { requestManagedChatCompletion } = await import('./managedService');

    await expect(requestManagedChatCompletion({ model: 'gpt-4o-mini' }))
      .rejects.toThrow('Managed API response body is too large.');
    expect(reader.cancel).toHaveBeenCalledTimes(1);
    expect(reader.releaseLock).toHaveBeenCalledTimes(1);
  });

  it('preserves client session when managed web auth is rejected', async () => {
    hasElectronDesktopBridgeMock.mockReturnValue(false);
    const fetchMock = vi.fn().mockResolvedValue(new Response('', { status: 401 }));
    vi.stubGlobal('fetch', fetchMock);

    const { fetchManagedModels, MANAGED_AUTH_REQUIRED_ERROR } = await import('./managedService');

    await expect(fetchManagedModels()).rejects.toThrow(MANAGED_AUTH_REQUIRED_ERROR);
    expect(clearClientSessionMock).not.toHaveBeenCalled();
  });

  it('extracts nested managed web error messages', async () => {
    hasElectronDesktopBridgeMock.mockReturnValue(false);
    const fetchMock = vi.fn().mockResolvedValue(
      managedJsonResponse({ error: { message: 'upstream overloaded' } }, { status: 500 })
    );
    vi.stubGlobal('fetch', fetchMock);

    const { fetchManagedModels } = await import('./managedService');

    await expect(fetchManagedModels()).rejects.toThrow('Managed API request failed: HTTP 500');
    expect(clearClientSessionMock).not.toHaveBeenCalled();
  });

  it('sanitizes managed web forbidden business errors without clearing session', async () => {
    hasElectronDesktopBridgeMock.mockReturnValue(false);
    const fetchMock = vi.fn().mockResolvedValue(
      managedJsonResponse({ error: 'Model is not available for this user', errorCode: 'points_exhausted' }, { status: 403 })
    );
    vi.stubGlobal('fetch', fetchMock);

    const { requestManagedChatCompletion } = await import('./managedService');

    await expect(requestManagedChatCompletion({ model: 'unpublished-model' })).rejects.toThrow('MANAGED_QUOTA_EXHAUSTED');
    expect(clearClientSessionMock).not.toHaveBeenCalled();
  });

  it('preserves native tool calls while removing legacy function messages from managed web requests', async () => {
    hasElectronDesktopBridgeMock.mockReturnValue(false);
    const fetchMock = vi.fn().mockResolvedValue(
      managedJsonResponse({ choices: [{ message: { content: 'ok' } }] })
    );
    vi.stubGlobal('fetch', fetchMock);

    const { requestManagedChatCompletion } = await import('./managedService');

    await requestManagedChatCompletion({
      model: 'deepseek-chat',
      tools: [{ type: 'function', function: { name: 'web_search' } }],
      tool_choice: 'auto',
      parallel_tool_calls: true,
      functions: [{ name: 'legacy_search' }],
      function_call: 'auto',
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
        { role: 'assistant', content: '', function_call: { name: 'legacy_search', arguments: '{}' } },
        { role: 'function', name: 'legacy_search', content: 'legacy result' },
        {
          role: 'assistant',
          content: 'Visible final answer',
          reasoning_content: 'final reasoning',
          tool_calls: [],
          tool_call_id: 'stale-id',
        },
      ],
    });

    const body = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string);
    expect(body.tools).toEqual([{ type: 'function', function: { name: 'web_search' } }]);
    expect(body.tool_choice).toBe('auto');
    expect(body.parallel_tool_calls).toBe(true);
    expect(body.functions).toBeUndefined();
    expect(body.function_call).toBeUndefined();
    expect(body.messages).toEqual([
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
      {
        role: 'assistant',
        content: 'Visible final answer',
        reasoning_content: 'final reasoning',
      },
    ]);
  });

  it('bounds managed chat completion messages while preserving the system prompt', async () => {
    hasElectronDesktopBridgeMock.mockReturnValue(false);
    const fetchMock = vi.fn().mockResolvedValue(
      managedJsonResponse({ choices: [{ message: { content: 'ok' } }] })
    );
    vi.stubGlobal('fetch', fetchMock);

    const { requestManagedChatCompletion } = await import('./managedService');

    await requestManagedChatCompletion({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: 'system prompt' },
        ...Array.from({ length: 80 }, (_value, index) => ({
          role: 'user',
          content: `message-${index}`,
        })),
      ],
    });

    const body = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string);
    expect(body.messages).toHaveLength(64);
    expect(body.messages[0]).toEqual({ role: 'system', content: 'system prompt' });
    expect(body.messages[1]).toEqual({ role: 'user', content: 'message-17' });
    expect(body.messages.at(-1)).toEqual({ role: 'user', content: 'message-79' });
  });

  it('preserves native tool transcript messages before managed desktop bridge requests', async () => {
    hasElectronDesktopBridgeMock.mockReturnValue(true);
    managedChatCompletionMock.mockResolvedValue({ choices: [{ message: { content: 'ok' } }] });

    const { requestManagedChatCompletion } = await import('./managedService');

    await requestManagedChatCompletion({
      model: 'deepseek-chat',
      messages: [{
        role: 'assistant',
        content: null,
        tool_calls: [{
          id: 'call-1',
          type: 'function',
          function: { name: 'web_search', arguments: '{"query":"x"}' },
        }],
      }, {
        role: 'user',
        content: 'Continue',
      }],
    });

    expect(managedChatCompletionMock).toHaveBeenCalledWith({
      model: 'deepseek-chat',
      messages: [{
        role: 'assistant',
        content: '',
        tool_calls: [{
          id: 'call-1',
          type: 'function',
          function: { name: 'web_search', arguments: '{"query":"x"}' },
        }],
      }, { role: 'user', content: 'Continue' }],
    });
  });

  it('treats auth and network failures as recoverable managed service errors', async () => {
    const { isManagedServiceRecoverableError, MANAGED_AUTH_REQUIRED_ERROR } = await import('./managedService');

    expect(isManagedServiceRecoverableError(new Error(MANAGED_AUTH_REQUIRED_ERROR))).toBe(true);
    expect(
      isManagedServiceRecoverableError(
        'Managed API request failed: error sending request for url (https://api.vlaina.com/v1/models)'
      )
    ).toBe(true);
    expect(
      isManagedServiceRecoverableError(
        new Error('Managed API request failed: error sending request for url (https://api.vlaina.com/v1/models)')
      )
    ).toBe(true);
    expect(isManagedServiceRecoverableError(new Error('Failed to fetch'))).toBe(true);
    expect(
      isManagedServiceRecoverableError(
        new Error("Error invoking remote method 'desktop:managed:get-models': TypeError: fetch failed")
      )
    ).toBe(true);
    expect(isManagedServiceRecoverableError(new Error('Unexpected JSON shape'))).toBe(false);
  });

  it('keeps desktop managed model requests inside desktop commands', async () => {
    hasElectronDesktopBridgeMock.mockReturnValue(true);
    getManagedModelsMock.mockResolvedValue({
      data: [{ id: 'gpt-4o-mini' }],
    });

    const { fetchManagedModels } = await import('./managedService');
    const models = await fetchManagedModels();

    expect(models[0]?.apiModelId).toBe('gpt-4o-mini');
    expect(getManagedModelsMock).toHaveBeenCalledTimes(1);
  });

  it('keeps desktop managed model version requests inside desktop commands', async () => {
    hasElectronDesktopBridgeMock.mockReturnValue(true);
    getManagedModelsVersionMock.mockResolvedValue({
      success: true,
      model_catalog_version: 'v1',
    });

    const { fetchManagedModelsVersion } = await import('./managedService');
    const version = await fetchManagedModelsVersion();

    expect(version).toBe('v1');
    expect(getManagedModelsVersionMock).toHaveBeenCalledTimes(1);
  });

  it('passes abort signals through desktop managed image generation requests', async () => {
    hasElectronDesktopBridgeMock.mockReturnValue(true);
    managedImageGenerationMock.mockResolvedValue({ data: [{ url: 'https://cdn.example.com/generated.png' }] });
    const controller = new AbortController();

    const { requestManagedImageGeneration } = await import('./managedService');
    const result = await requestManagedImageGeneration(
      { model: 'gpt-image-2', prompt: 'draw' },
      controller.signal,
    );

    expect(result).toEqual({ data: [{ url: 'https://cdn.example.com/generated.png' }] });
    expect(managedImageGenerationMock).toHaveBeenCalledWith(
      { model: 'gpt-image-2', prompt: 'draw' },
      controller.signal,
    );
  });

  it('passes abort signals through desktop managed image edit requests', async () => {
    hasElectronDesktopBridgeMock.mockReturnValue(true);
    managedImageEditMock.mockResolvedValue({ data: [{ url: 'https://cdn.example.com/edited.png' }] });
    const controller = new AbortController();
    const body = new Blob(['multipart-body']);
    const headers = { 'Content-Type': 'multipart/form-data; boundary=test' };

    const { requestManagedImageEdit } = await import('./managedService');
    const result = await requestManagedImageEdit(body, headers, controller.signal);

    expect(result).toEqual({ data: [{ url: 'https://cdn.example.com/edited.png' }] });
    expect(managedImageEditMock).toHaveBeenCalledWith(body, headers, controller.signal);
  });

  it('passes abort signals through managed web image generation requests', async () => {
    hasElectronDesktopBridgeMock.mockReturnValue(false);
    const controller = new AbortController();
    const fetchMock = vi.fn().mockResolvedValue(
      managedJsonResponse({ data: [{ url: 'https://cdn.example.com/generated.png' }] })
    );
    vi.stubGlobal('fetch', fetchMock);

    const { requestManagedImageGeneration } = await import('./managedService');
    const result = await requestManagedImageGeneration(
      { model: 'gpt-image-2', prompt: 'draw' },
      controller.signal,
    );

    expect(result).toEqual({ data: [{ url: 'https://cdn.example.com/generated.png' }] });
    expect(fetchMock).toHaveBeenCalledWith('https://api.vlaina.com/v1/images/generations', {
      method: 'POST',
      cache: 'no-store',
      credentials: 'include',
      signal: expect.any(AbortSignal),
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: 'gpt-image-2', prompt: 'draw' }),
    });
    const fetchSignal = fetchMock.mock.calls[0]?.[1]?.signal as AbortSignal;
    expect(fetchSignal.aborted).toBe(false);
    controller.abort();
    expect(fetchSignal.aborted).toBe(true);
  });

  it('rejects managed web binary image edits promptly when fetch ignores cancellation', async () => {
    hasElectronDesktopBridgeMock.mockReturnValue(false);
    const controller = new AbortController();
    const fetchMock = vi.fn(() => new Promise(() => undefined));
    vi.stubGlobal('fetch', fetchMock);

    const { requestManagedImageEdit } = await import('./managedService');
    const request = requestManagedImageEdit(
      new Blob(['multipart-body']),
      { 'Content-Type': 'multipart/form-data; boundary=test' },
      controller.signal,
    );
    request.catch(() => undefined);

    await Promise.resolve();
    controller.abort();

    await expect(request).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('streams managed chat completions on web', async () => {
    hasElectronDesktopBridgeMock.mockReturnValue(false);
    const encoder = new TextEncoder();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(
            encoder.encode(
              [
                'data: {"choices":[{"delta":{"reasoning_content":"思考中"}}]}',
                'data: {"choices":[{"delta":{"content":"你好"}}]}',
                'data: [DONE]',
                '',
              ].join('\n')
            )
          );
          controller.close();
        },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { requestManagedChatCompletionStream } = await import('./managedService');
    const chunks: string[] = [];
    const content = await requestManagedChatCompletionStream(
      {
        model: 'gpt-5.4',
        messages: [{ role: 'user', content: 'hello' }],
        stream: true,
      },
      (chunk) => chunks.push(chunk)
    );

    expect(content).toBe('<think>思考中</think>你好');
    expect(chunks[chunks.length - 1]).toBe('<think>思考中</think>你好');
    expect(fetchMock).toHaveBeenCalledWith('https://api.vlaina.com/v1/chat/completions', {
      method: 'POST',
      cache: 'no-store',
      credentials: 'include',
      headers: {
        Accept: 'text/event-stream',
        'Content-Type': 'application/json',
      },
      signal: expect.any(AbortSignal),
      body: JSON.stringify({
        model: 'gpt-5.4',
        messages: [{ role: 'user', content: 'hello' }],
        stream: true,
      }),
    });
  });

  it('keeps resumed managed reasoning hidden after visible content has started', async () => {
    hasElectronDesktopBridgeMock.mockReturnValue(false);
    const encoder = new TextEncoder();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(
            encoder.encode(
              [
                'data: {"choices":[{"delta":{"reasoning_content":"first"}}]}',
                'data: {"choices":[{"delta":{"content":"visible"}}]}',
                'data: {"choices":[{"delta":{"reasoning_content":"second"}}]}',
                'data: {"choices":[{"delta":{"content":" answer"}}]}',
                'data: [DONE]',
                '',
              ].join('\n')
            )
          );
          controller.close();
        },
      }),
    }));

    const { requestManagedChatCompletionStream } = await import('./managedService');
    const chunks: string[] = [];
    const content = await requestManagedChatCompletionStream(
      {
        model: 'gpt-5.4',
        messages: [{ role: 'user', content: 'hello' }],
        stream: true,
      },
      (chunk) => chunks.push(chunk)
    );

    expect(content).toBe('<think>first</think>visible<think>second</think> answer');
    expect(chunks[chunks.length - 1]).toBe('<think>first</think>visible<think>second</think> answer');
  });

  it('consumes the final managed SSE data line even without a trailing newline', async () => {
    hasElectronDesktopBridgeMock.mockReturnValue(false);
    const encoder = new TextEncoder();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(
            encoder.encode('data: {"choices":[{"delta":{"content":"final token"}}]}')
          );
          controller.close();
        },
      }),
    }));

    const { requestManagedChatCompletionStream } = await import('./managedService');
    const chunks: string[] = [];
    const content = await requestManagedChatCompletionStream(
      {
        model: 'gpt-5.4',
        messages: [{ role: 'user', content: 'hello' }],
        stream: true,
      },
      (chunk) => chunks.push(chunk)
    );

    expect(content).toBe('final token');
    expect(chunks).toEqual(['final token']);
  });

  it('parses managed stream message chunks as assistant content', async () => {
    hasElectronDesktopBridgeMock.mockReturnValue(false);
    const encoder = new TextEncoder();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(
            encoder.encode(
              [
                'data: {"choices":[{"message":{"content":"message body"}}]}',
                'data: [DONE]',
                '',
              ].join('\n')
            )
          );
          controller.close();
        },
      }),
    }));

    const { requestManagedChatCompletionStream } = await import('./managedService');
    const chunks: string[] = [];
    const content = await requestManagedChatCompletionStream(
      {
        model: 'gpt-5.4',
        messages: [{ role: 'user', content: 'hello' }],
        stream: true,
      },
      (chunk) => chunks.push(chunk)
    );

    expect(content).toBe('message body');
    expect(chunks).toEqual(['message body']);
  });

  it('sanitizes managed web stream error payloads', async () => {
    hasElectronDesktopBridgeMock.mockReturnValue(false);
    const encoder = new TextEncoder();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(
            encoder.encode('data: {"error":{"message":"Model is not available for this user","code":"points_exhausted"}}\n\n')
          );
          controller.close();
        },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { requestManagedChatCompletionStream } = await import('./managedService');

    await expect(requestManagedChatCompletionStream(
      {
        model: 'gpt-5.4',
        messages: [{ role: 'user', content: 'hello' }],
        stream: true,
      },
      vi.fn()
    )).rejects.toThrow('MANAGED_QUOTA_EXHAUSTED');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('sanitizes managed HTTP error payload types', async () => {
    hasElectronDesktopBridgeMock.mockReturnValue(false);
    const fetchMock = vi.fn().mockResolvedValue(
      managedJsonResponse({
        type: 'error',
        error: {
          type: 'points_exhausted',
          message: 'Model is not available for this user',
        },
      }, { status: 402 })
    );
    vi.stubGlobal('fetch', fetchMock);

    const { requestManagedChatCompletionStream } = await import('./managedService');

    await expect(requestManagedChatCompletionStream(
      {
        model: 'gpt-5.4',
        messages: [{ role: 'user', content: 'hi' }],
        stream: true,
      },
      vi.fn()
    )).rejects.toMatchObject({
      message: 'MANAGED_QUOTA_EXHAUSTED',
      errorCode: 'points_exhausted',
      statusCode: 402,
    });
  });

  it('passes abort signals through managed web streams', async () => {
    hasElectronDesktopBridgeMock.mockReturnValue(false);
    const controller = new AbortController();
    const fetchMock = vi.fn((_url, init) => {
      expect(init.signal).toBeInstanceOf(AbortSignal);
      return Promise.reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
    });
    vi.stubGlobal('fetch', fetchMock);

    const { requestManagedChatCompletionStream } = await import('./managedService');
    const request = requestManagedChatCompletionStream(
      {
        model: 'gpt-5.4',
        messages: [{ role: 'user', content: 'hello' }],
        stream: true,
      },
      vi.fn(),
      controller.signal,
    );
    controller.abort();

    await expect(request).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('rejects managed web streams promptly when fetch ignores cancellation', async () => {
    hasElectronDesktopBridgeMock.mockReturnValue(false);
    const controller = new AbortController();
    const fetchMock = vi.fn(() => new Promise(() => undefined));
    vi.stubGlobal('fetch', fetchMock);

    const { requestManagedChatCompletionStream } = await import('./managedService');
    const request = requestManagedChatCompletionStream(
      {
        model: 'gpt-5.4',
        messages: [{ role: 'user', content: 'hello' }],
        stream: true,
      },
      vi.fn(),
      controller.signal,
    );
    request.catch(() => undefined);

    await Promise.resolve();
    controller.abort();

    await expect(request).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not return managed web stream content when aborted after stream consumption', async () => {
    hasElectronDesktopBridgeMock.mockReturnValue(false);
    const controller = new AbortController();
    vi.doMock('@/lib/ai/webSearch/openAIStreamWithTools', () => ({
      consumeOpenAIStreamWithTools: vi.fn(async () => {
        controller.abort();
        return {
          content: 'late success',
          assistantContent: 'late success',
          reasoningContent: '',
          toolCalls: [],
        };
      }),
    }));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      body: new ReadableStream(),
    }));

    try {
      const { requestManagedChatCompletionStream } = await import('./managedService');

      await expect(requestManagedChatCompletionStream(
        {
          model: 'gpt-5.4',
          messages: [{ role: 'user', content: 'hello' }],
          stream: true,
        },
        vi.fn(),
        controller.signal,
      )).rejects.toMatchObject({ name: 'AbortError' });
    } finally {
      vi.doUnmock('@/lib/ai/webSearch/openAIStreamWithTools');
    }
  });

  it('reports managed web stream timeouts without treating them as user aborts', async () => {
    vi.useFakeTimers();
    try {
      hasElectronDesktopBridgeMock.mockReturnValue(false);
      const fetchMock = vi.fn((_url, init) => new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => {
          reject(new DOMException('stream timeout abort', 'AbortError'));
        }, { once: true });
      }));
      vi.stubGlobal('fetch', fetchMock);

      const { requestManagedChatCompletionStream } = await import('./managedService');
      const request = requestManagedChatCompletionStream(
        {
          model: 'gpt-5.4',
          messages: [{ role: 'user', content: 'hello' }],
          stream: true,
        },
        vi.fn(),
      );
      const expectation = expect(request).rejects.toThrow('Managed API request timed out.');

      await vi.advanceTimersByTimeAsync(300_000);

      await expectation;
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps downstream managed web abort-shaped failures distinct from managed timeouts', async () => {
    hasElectronDesktopBridgeMock.mockReturnValue(false);
    const fetchMock = vi.fn().mockRejectedValue(Object.assign(new Error('socket aborted'), { name: 'AbortError' }));
    vi.stubGlobal('fetch', fetchMock);

    const { requestManagedChatCompletionStream } = await import('./managedService');

    await expect(requestManagedChatCompletionStream(
      {
        model: 'gpt-5.4',
        messages: [{ role: 'user', content: 'hello' }],
        stream: true,
      },
      vi.fn(),
    )).rejects.toMatchObject({
      name: 'AbortError',
      message: 'socket aborted',
    });
  });

  it('passes the managed diagnostic request id into the desktop stream bridge', async () => {
    hasElectronDesktopBridgeMock.mockReturnValue(true);
    managedChatCompletionStreamMock.mockResolvedValue({ content: 'ok' });

    const { requestManagedChatCompletionStream } = await import('./managedService');

    await requestManagedChatCompletionStream(
      {
        model: 'gpt-5.4',
        messages: [{ role: 'user' }],
        stream: true,
      },
      vi.fn()
    );

    expect(managedChatCompletionStreamMock).toHaveBeenCalledTimes(1);
    expect(managedChatCompletionStreamMock.mock.calls[0]?.[0]).toMatchObject({
      messages: [{ role: 'user', content: '' }],
    });
    expect(typeof managedChatCompletionStreamMock.mock.calls[0]?.[3]).toBe('string');
    expect(managedChatCompletionStreamMock.mock.calls[0]?.[3]).toContain('managed-stream-');
  });

  it('normalizes desktop managed native tool stream results', async () => {
    hasElectronDesktopBridgeMock.mockReturnValue(true);
    managedChatCompletionStreamMock.mockResolvedValue({
      content: '',
      assistantContent: '',
      reasoningContent: 'inspect first',
      toolCalls: [{
        id: 'call-1',
        type: 'function',
        function: { name: 'run_command', arguments: '{"command":"pwd","purpose":"Inspect cwd"}' },
      }],
    });

    const { requestManagedChatCompletionStreamWithTools } = await import('./managedService');
    const result = await requestManagedChatCompletionStreamWithTools(
      { model: 'gpt-5.4', messages: [{ role: 'user', content: 'inspect' }], stream: true },
      vi.fn(),
    );

    expect(result).toEqual({
      content: '',
      assistantContent: '',
      reasoningContent: 'inspect first',
      toolCalls: [{
        id: 'call-1',
        type: 'function',
        function: { name: 'run_command', arguments: '{"command":"pwd","purpose":"Inspect cwd"}' },
      }],
    });
  });

});
