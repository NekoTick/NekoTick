import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ACCOUNT_AUTH_INVALIDATED_EVENT } from './sessionEvent';

const mocks = vi.hoisted(() => {
  const account = {
    getSessionStatus: vi.fn().mockResolvedValue({
      connected: true,
      provider: 'google',
      username: 'vla',
      primaryEmail: 'vla@example.com',
      avatarUrl: null,
      membershipTier: 'pro',
      membershipName: 'Pro',
    }),
    startAuth: vi.fn().mockResolvedValue({ success: true, provider: 'google', error: null }),
    requestEmailCode: vi.fn().mockResolvedValue(true),
    verifyEmailCode: vi.fn().mockResolvedValue({ success: true, provider: 'email', error: null }),
    disconnect: vi.fn().mockResolvedValue(undefined),
    createBillingCheckout: vi.fn().mockResolvedValue({ success: true, url: 'https://example.com' }),
    getManagedModels: vi.fn().mockResolvedValue({ data: [] }),
    getManagedModelsVersion: vi.fn().mockResolvedValue({ success: true, model_catalog_version: '0' }),
    getManagedBudget: vi.fn().mockResolvedValue({ active: true }),
    reportManagedClientDiagnostic: vi.fn().mockResolvedValue({}),
    managedChatCompletion: vi.fn().mockResolvedValue({ id: 'resp-1' }),
    cancelManagedChatCompletion: vi.fn().mockResolvedValue(undefined),
    managedImageGeneration: vi.fn().mockResolvedValue({ data: [] }),
    cancelManagedImageGeneration: vi.fn().mockResolvedValue(undefined),
    managedImageEdit: vi.fn().mockResolvedValue({ data: [] }),
    cancelManagedImageEdit: vi.fn().mockResolvedValue(undefined),
    startManagedChatCompletionStream: vi.fn().mockResolvedValue(undefined),
    cancelManagedChatCompletionStream: vi.fn().mockResolvedValue(undefined),
    onManagedStreamChunk: vi.fn(),
    onManagedStreamDone: vi.fn(),
    onManagedStreamError: vi.fn(),
  };

  return {
    getElectronBridge: vi.fn(() => ({ account })),
    account,
  };
});

vi.mock('@/lib/electron/bridge', () => ({
  getElectronBridge: mocks.getElectronBridge,
}));

import { accountCommands } from './desktopCommands';

const MAX_MANAGED_DESKTOP_BODY_BYTES = 64 * 1024 * 1024;

describe('desktop account commands', () => {
  beforeEach(() => {
    mocks.getElectronBridge.mockReturnValue({ account: mocks.account });
    for (const value of Object.values(mocks.account)) {
      if (typeof value === 'function' && 'mockClear' in value) {
        value.mockClear();
      }
    }
  });

  it('delegates account status and auth methods to the electron bridge', async () => {
    expect(await accountCommands.getAccountSessionStatus()).toMatchObject({
      connected: true,
      provider: 'google',
    });

    await accountCommands.accountAuth('google');
    await accountCommands.requestEmailAuthCode('vla@example.com', 'zh-CN');
    await accountCommands.verifyEmailAuthCode('vla@example.com', '123456');
    await accountCommands.reportManagedClientDiagnostic({ kind: 'chat_json' });

    expect(mocks.account.startAuth).toHaveBeenCalledWith('google');
    expect(mocks.account.requestEmailCode).toHaveBeenCalledWith('vla@example.com', 'zh-CN');
    expect(mocks.account.verifyEmailCode).toHaveBeenCalledWith('vla@example.com', '123456');
    expect(mocks.account.reportManagedClientDiagnostic).toHaveBeenCalledWith({ kind: 'chat_json' });
  });

  it('does not dispatch auth invalidation when managed calls fail with sign-in required', async () => {
    const invalidated = vi.fn();
    window.addEventListener(ACCOUNT_AUTH_INVALIDATED_EVENT, invalidated, { once: true });
    mocks.account.getManagedBudget.mockRejectedValueOnce(new Error('vlaina sign-in required'));

    await expect(accountCommands.getManagedBudget()).rejects.toThrow('vlaina sign-in required');

    expect(invalidated).not.toHaveBeenCalled();
  });

  it('disconnects and dispatches auth invalidation', async () => {
    const invalidated = vi.fn();
    window.addEventListener(ACCOUNT_AUTH_INVALIDATED_EVENT, invalidated, { once: true });

    await accountCommands.accountDisconnect();

    expect(mocks.account.disconnect).toHaveBeenCalledTimes(1);
    expect(invalidated).toHaveBeenCalledTimes(1);
  });

  it('streams managed completions through bridge events', async () => {
    const listeners: Record<string, ((payload: any) => void) | undefined> = {};
    mocks.account.onManagedStreamChunk.mockImplementation((_requestId: string, callback: (content: string) => void) => {
      listeners.chunk = callback;
      return vi.fn();
    });
    mocks.account.onManagedStreamDone.mockImplementation((_requestId: string, callback: (payload: { content: string }) => void) => {
      listeners.done = callback;
      return vi.fn();
    });
    mocks.account.onManagedStreamError.mockImplementation((_requestId: string, callback: (payload: { message: string }) => void) => {
      listeners.error = callback;
      return vi.fn();
    });
    mocks.account.startManagedChatCompletionStream.mockImplementationOnce(async () => {
      listeners.chunk?.('hello');
      listeners.done?.({ content: 'hello world' });
    });

    const onChunk = vi.fn();
    const result = await accountCommands.managedChatCompletionStream(
      { model: 'vlaina-managed/test' },
      onChunk,
      undefined,
      'req-1',
    );

    expect(mocks.account.startManagedChatCompletionStream).toHaveBeenCalledWith('req-1', { model: 'vlaina-managed/test' });
    expect(onChunk).toHaveBeenCalledWith('hello');
    expect(result).toBe('hello world');
  });

  it('cancels managed streams when a chunk callback aborts the signal', async () => {
    const listeners: Record<string, ((payload: any) => void) | undefined> = {};
    mocks.account.onManagedStreamChunk.mockImplementation((_requestId: string, callback: (content: string) => void) => {
      listeners.chunk = callback;
      return vi.fn();
    });
    mocks.account.onManagedStreamDone.mockImplementation((_requestId: string, callback: (payload: { content: string }) => void) => {
      listeners.done = callback;
      return vi.fn();
    });
    mocks.account.onManagedStreamError.mockImplementation((_requestId: string, callback: (payload: { message: string }) => void) => {
      listeners.error = callback;
      return vi.fn();
    });
    mocks.account.startManagedChatCompletionStream.mockImplementationOnce(async () => {
      listeners.chunk?.('partial');
      listeners.done?.({ content: 'stale done' });
    });
    const controller = new AbortController();
    const chunks: string[] = [];

    await expect(accountCommands.managedChatCompletionStream(
      { model: 'vlaina-managed/test' },
      (chunk) => {
        chunks.push(chunk);
        controller.abort();
      },
      controller.signal,
      'req-chunk-abort',
    )).rejects.toMatchObject({ name: 'AbortError' });

    expect(chunks).toEqual(['partial']);
    expect(mocks.account.cancelManagedChatCompletionStream).toHaveBeenCalledWith('req-chunk-abort');
  });

  it('rejects managed streams when a done event arrives after signal cancellation during listener setup', async () => {
    const controller = new AbortController();
    const cleanupChunk = vi.fn();
    const cleanupDone = vi.fn();
    const cleanupError = vi.fn();
    mocks.account.onManagedStreamChunk.mockImplementation(() => cleanupChunk);
    mocks.account.onManagedStreamDone.mockImplementation((_requestId: string, callback: (payload: { content: string }) => void) => {
      controller.abort();
      callback({ content: 'stale done' });
      return cleanupDone;
    });
    mocks.account.onManagedStreamError.mockImplementation(() => cleanupError);

    await expect(accountCommands.managedChatCompletionStream(
      { model: 'vlaina-managed/test' },
      vi.fn(),
      controller.signal,
      'req-done-after-abort',
    )).rejects.toMatchObject({ name: 'AbortError' });

    expect(mocks.account.startManagedChatCompletionStream).not.toHaveBeenCalled();
    expect(mocks.account.cancelManagedChatCompletionStream).toHaveBeenCalledWith('req-done-after-abort');
    expect(cleanupChunk).toHaveBeenCalledTimes(1);
    expect(cleanupDone).toHaveBeenCalledTimes(1);
    expect(cleanupError).not.toHaveBeenCalled();
    expect(mocks.account.onManagedStreamError).not.toHaveBeenCalled();
  });

  it('rejects and cleans up managed streams when a chunk callback throws', async () => {
    const cleanupChunk = vi.fn();
    const cleanupDone = vi.fn();
    const cleanupError = vi.fn();
    const listeners: Record<string, ((payload: any) => void) | undefined> = {};
    mocks.account.onManagedStreamChunk.mockImplementation((_requestId: string, callback: (content: string) => void) => {
      listeners.chunk = callback;
      return cleanupChunk;
    });
    mocks.account.onManagedStreamDone.mockImplementation((_requestId: string, callback: (payload: { content: string }) => void) => {
      listeners.done = callback;
      return cleanupDone;
    });
    mocks.account.onManagedStreamError.mockImplementation((_requestId: string, callback: (payload: { message: string }) => void) => {
      listeners.error = callback;
      return cleanupError;
    });
    mocks.account.startManagedChatCompletionStream.mockImplementationOnce(async () => {
      listeners.chunk?.('partial');
      listeners.done?.({ content: 'stale done' });
    });

    await expect(accountCommands.managedChatCompletionStream(
      { model: 'vlaina-managed/test' },
      () => {
        throw new Error('chunk handler failed');
      },
      undefined,
      'req-chunk-throw',
    )).rejects.toThrow('chunk handler failed');

    expect(cleanupChunk).toHaveBeenCalledTimes(1);
    expect(cleanupDone).toHaveBeenCalledTimes(1);
    expect(cleanupError).toHaveBeenCalledTimes(1);
    expect(mocks.account.cancelManagedChatCompletionStream).toHaveBeenCalledWith('req-chunk-throw');
  });

  it('cancels managed chat completions when the signal aborts', async () => {
    mocks.account.managedChatCompletion.mockImplementationOnce(() => new Promise(() => {}));

    const controller = new AbortController();
    const request = accountCommands.managedChatCompletion(
      { model: 'vlaina-managed/test' },
      controller.signal,
    );

    controller.abort();

    await expect(request).rejects.toMatchObject({ name: 'AbortError' });
    const requestId = mocks.account.managedChatCompletion.mock.calls[0]?.[1] as string;
    expect(requestId).toMatch(/^managed-json-/);
    expect(mocks.account.cancelManagedChatCompletion).toHaveBeenCalledWith(requestId);
  });

  it('does not return managed chat completion results after signal cancellation', async () => {
    const controller = new AbortController();
    mocks.account.managedChatCompletion.mockImplementationOnce(async () => {
      controller.abort();
      return { id: 'late-success' };
    });

    const request = accountCommands.managedChatCompletion(
      { model: 'vlaina-managed/test' },
      controller.signal,
    );

    await expect(request).rejects.toMatchObject({ name: 'AbortError' });
    const requestId = mocks.account.managedChatCompletion.mock.calls[0]?.[1] as string;
    expect(requestId).toMatch(/^managed-json-/);
    expect(mocks.account.cancelManagedChatCompletion).toHaveBeenCalledWith(requestId);
  });

  it('cancels managed image generations when the signal aborts', async () => {
    mocks.account.managedImageGeneration.mockImplementationOnce(() => new Promise(() => {}));

    const controller = new AbortController();
    const request = accountCommands.managedImageGeneration(
      { model: 'vlaina-managed/image', prompt: 'draw' },
      controller.signal,
    );

    controller.abort();

    await expect(request).rejects.toMatchObject({ name: 'AbortError' });
    const requestId = mocks.account.managedImageGeneration.mock.calls[0]?.[1] as string;
    expect(requestId).toMatch(/^managed-image-generation-/);
    expect(mocks.account.cancelManagedImageGeneration).toHaveBeenCalledWith(requestId);
  });

  it('cancels managed image edits when the signal aborts after serialization', async () => {
    mocks.account.managedImageEdit.mockImplementationOnce(() => new Promise(() => {}));

    const controller = new AbortController();
    const request = accountCommands.managedImageEdit(
      new Blob(['multipart-body'], { type: 'multipart/form-data; boundary=test' }),
      { 'Content-Type': 'multipart/form-data; boundary=test' },
      controller.signal,
    );

    while (mocks.account.managedImageEdit.mock.calls.length === 0) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    controller.abort();

    await expect(request).rejects.toMatchObject({ name: 'AbortError' });
    const [payload, requestId] = mocks.account.managedImageEdit.mock.calls[0] as [
      { bodyBase64: string; headers: Record<string, string> },
      string,
    ];
    expect(payload).toEqual({
      bodyBase64: 'bXVsdGlwYXJ0LWJvZHk=',
      headers: { 'Content-Type': 'multipart/form-data; boundary=test' },
    });
    expect(requestId).toMatch(/^managed-image-edit-/);
    expect(mocks.account.cancelManagedImageEdit).toHaveBeenCalledWith(requestId);
  });

  it('rejects promptly when managed image edit Blob serialization is aborted', async () => {
    const controller = new AbortController();
    const blob = new Blob(['multipart-body'], { type: 'multipart/form-data; boundary=test' });
    Object.defineProperty(blob, 'arrayBuffer', {
      configurable: true,
      value: vi.fn(() => new Promise(() => undefined)),
    });

    const request = accountCommands.managedImageEdit(
      blob,
      { 'Content-Type': 'multipart/form-data; boundary=test' },
      controller.signal,
    );
    await Promise.resolve();
    controller.abort();

    await expect(request).rejects.toMatchObject({ name: 'AbortError' });
    expect(mocks.account.managedImageEdit).not.toHaveBeenCalled();
    expect(mocks.account.cancelManagedImageEdit).not.toHaveBeenCalled();
  });

  it('rejects oversized managed image edit Blobs before reading them', async () => {
    const blob = new Blob(['x'], { type: 'multipart/form-data; boundary=test' });
    const arrayBuffer = vi.fn(async () => new ArrayBuffer(1));
    Object.defineProperty(blob, 'size', {
      configurable: true,
      value: MAX_MANAGED_DESKTOP_BODY_BYTES + 1,
    });
    Object.defineProperty(blob, 'arrayBuffer', {
      configurable: true,
      value: arrayBuffer,
    });

    await expect(accountCommands.managedImageEdit(
      blob,
      { 'Content-Type': 'multipart/form-data; boundary=test' },
    )).rejects.toThrow('Managed desktop binary request body is too large.');

    expect(arrayBuffer).not.toHaveBeenCalled();
    expect(mocks.account.managedImageEdit).not.toHaveBeenCalled();
  });

  it('rejects managed image edit Blobs whose read bytes exceed the limit', async () => {
    const blob = new Blob(['x'], { type: 'multipart/form-data; boundary=test' });
    Object.defineProperty(blob, 'size', {
      configurable: true,
      value: 1,
    });
    Object.defineProperty(blob, 'arrayBuffer', {
      configurable: true,
      value: vi.fn(async () => new ArrayBuffer(MAX_MANAGED_DESKTOP_BODY_BYTES + 1)),
    });

    await expect(accountCommands.managedImageEdit(
      blob,
      { 'Content-Type': 'multipart/form-data; boundary=test' },
    )).rejects.toThrow('Managed desktop binary request body is too large.');

    expect(mocks.account.managedImageEdit).not.toHaveBeenCalled();
  });

  it('does not start managed image generation requests when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(accountCommands.managedImageGeneration(
      { model: 'vlaina-managed/image', prompt: 'draw' },
      controller.signal,
    )).rejects.toMatchObject({ name: 'AbortError' });

    expect(mocks.account.managedImageGeneration).not.toHaveBeenCalled();
    expect(mocks.account.cancelManagedImageGeneration).not.toHaveBeenCalled();
  });

  it('cancels managed streams when the signal aborts', async () => {
    const listeners: Record<string, ((payload: any) => void) | undefined> = {};
    mocks.account.onManagedStreamChunk.mockImplementation((_requestId: string, callback: (content: string) => void) => {
      listeners.chunk = callback;
      return vi.fn();
    });
    mocks.account.onManagedStreamDone.mockImplementation((_requestId: string, callback: (payload: { content: string }) => void) => {
      listeners.done = callback;
      return vi.fn();
    });
    mocks.account.onManagedStreamError.mockImplementation((_requestId: string, callback: (payload: { message: string }) => void) => {
      listeners.error = callback;
      return vi.fn();
    });
    mocks.account.startManagedChatCompletionStream.mockImplementationOnce(async () => {
      return new Promise<void>(() => {});
    });

    const controller = new AbortController();
    const streamPromise = accountCommands.managedChatCompletionStream(
      { model: 'vlaina-managed/test' },
      vi.fn(),
      controller.signal,
      'req-abort',
    );

    controller.abort();

    await expect(streamPromise).rejects.toMatchObject({ name: 'AbortError' });
    expect(mocks.account.cancelManagedChatCompletionStream).toHaveBeenCalledWith('req-abort');
  });

  it('preserves managed stream error status and code from the electron bridge', async () => {
    const listeners: Record<string, ((payload: any) => void) | undefined> = {};
    mocks.account.onManagedStreamChunk.mockImplementation((_requestId: string, callback: (content: string) => void) => {
      listeners.chunk = callback;
      return vi.fn();
    });
    mocks.account.onManagedStreamDone.mockImplementation((_requestId: string, callback: (payload: { content: string }) => void) => {
      listeners.done = callback;
      return vi.fn();
    });
    mocks.account.onManagedStreamError.mockImplementation((_requestId: string, callback: (payload: { message: string; statusCode?: number; errorCode?: string }) => void) => {
      listeners.error = callback;
      return vi.fn();
    });
    mocks.account.startManagedChatCompletionStream.mockImplementationOnce(async () => {
      listeners.error?.({
        message: 'Insufficient remaining points',
        statusCode: 403,
        errorCode: 'insufficient_points',
      });
    });

    await expect(accountCommands.managedChatCompletionStream(
      { model: 'vlaina-managed/test' },
      vi.fn(),
      undefined,
      'req-quota',
    )).rejects.toMatchObject({
      message: 'MANAGED_QUOTA_EXHAUSTED',
      statusCode: 403,
      errorCode: 'insufficient_points',
    });
  });

  it('rejects managed streams when bridge listener registration fails', async () => {
    const cleanup = vi.fn();
    mocks.account.onManagedStreamChunk.mockImplementationOnce(() => cleanup);
    mocks.account.onManagedStreamDone.mockImplementationOnce(() => {
      throw new Error('listener registration failed');
    });

    await expect(accountCommands.managedChatCompletionStream(
      { model: 'vlaina-managed/test' },
      vi.fn(),
      undefined,
      'req-listener-failed',
    )).rejects.toThrow('listener registration failed');

    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(mocks.account.startManagedChatCompletionStream).not.toHaveBeenCalled();
  });

  it('does not start managed streams when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(accountCommands.managedChatCompletionStream(
      { model: 'vlaina-managed/test' },
      vi.fn(),
      controller.signal,
      'req-already-aborted',
    )).rejects.toMatchObject({ name: 'AbortError' });

    expect(mocks.account.cancelManagedChatCompletionStream).toHaveBeenCalledWith('req-already-aborted');
    expect(mocks.account.startManagedChatCompletionStream).not.toHaveBeenCalled();
  });

  it('throws a clear error when the electron bridge is unavailable', async () => {
    mocks.getElectronBridge.mockReturnValue(null as never);

    await expect(accountCommands.getAccountSessionStatus()).rejects.toThrow(
      'Electron desktop bridge is not available.',
    );
  });
});
