import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const readStoredAccountCredentials = vi.fn();
  const writeStoredAccountCredentials = vi.fn();
  const writeStoredAccountCredentialsIfCurrent = vi.fn();
  const clearStoredAccountCredentials = vi.fn();
  const clearStoredAccountCredentialsIfCurrent = vi.fn();
  const rotateStoredSessionToken = vi.fn();
  const fetchDesktopJson = vi.fn();
  const fetchWithStoredSession = vi.fn();
  const getDesktopAccountSessionStatus = vi.fn();
  const readDesktopSessionIdentity = vi.fn();
  const readJsonResponse = vi.fn();
  const persistDesktopAuthResult = vi.fn();
  const bindDesktopAuthLoopbackServer = vi.fn();
  const openExternal = vi.fn();

  return {
    readStoredAccountCredentials,
    writeStoredAccountCredentials,
    writeStoredAccountCredentialsIfCurrent,
    clearStoredAccountCredentials,
    clearStoredAccountCredentialsIfCurrent,
    rotateStoredSessionToken,
    fetchDesktopJson,
    fetchWithStoredSession,
    getDesktopAccountSessionStatus,
    readDesktopSessionIdentity,
    readJsonResponse,
    persistDesktopAuthResult,
    bindDesktopAuthLoopbackServer,
    openExternal,
  };
});

vi.mock('electron', () => ({
  default: {
    shell: {
      openExternal: mocks.openExternal,
    },
  },
}));

vi.mock('../../electron/accountCredentialStore.mjs', () => ({
  createAccountCredentialStore: vi.fn(() => ({
    readStoredAccountCredentials: mocks.readStoredAccountCredentials,
    writeStoredAccountCredentials: mocks.writeStoredAccountCredentials,
    writeStoredAccountCredentialsIfCurrent: mocks.writeStoredAccountCredentialsIfCurrent,
    clearStoredAccountCredentials: mocks.clearStoredAccountCredentials,
    clearStoredAccountCredentialsIfCurrent: mocks.clearStoredAccountCredentialsIfCurrent,
    rotateStoredSessionToken: mocks.rotateStoredSessionToken,
  })),
  isSupportedAccountProvider: vi.fn((provider: string) => provider === 'google' || provider === 'email'),
}));

vi.mock('../../electron/accountAuthPersistence.mjs', () => ({
  createDesktopAuthPersistence: vi.fn(() => ({
    persistDesktopAuthResult: mocks.persistDesktopAuthResult,
  })),
}));

vi.mock('../../electron/accountLoopbackServer.mjs', () => ({
  bindDesktopAuthLoopbackServer: mocks.bindDesktopAuthLoopbackServer,
}));

vi.mock('../../electron/accountSessionClient.mjs', () => ({
  createDesktopAccountSessionClient: vi.fn(() => ({
    fetchDesktopJson: mocks.fetchDesktopJson,
    fetchWithStoredSession: mocks.fetchWithStoredSession,
    getDesktopAccountSessionStatus: mocks.getDesktopAccountSessionStatus,
    readDesktopSessionIdentity: mocks.readDesktopSessionIdentity,
    readJsonResponse: mocks.readJsonResponse,
  })),
}));

import { createDesktopAccountService } from '../../electron/accountAuthFlow.mjs';

function registerHarness(options: { fetchImpl?: typeof fetch } = {}) {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  const service = createDesktopAccountService({
    apiBaseUrl: 'https://api.example.com',
    ...options,
  });
  service.registerAccountIpc({
    handleIpc: (name: string, handler: (...args: unknown[]) => unknown) => {
      handlers.set(name, handler);
    },
  });
  return { handlers };
}

describe('desktop account auth flow', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    for (const mock of Object.values(mocks)) {
      mock.mockReset();
    }
    mocks.openExternal.mockResolvedValue(undefined);
    mocks.persistDesktopAuthResult.mockResolvedValue({
      success: true,
      provider: 'google',
      username: 'alice',
      primaryEmail: 'alice@example.com',
      avatarUrl: null,
      error: null,
    });
    mocks.clearStoredAccountCredentialsIfCurrent.mockResolvedValue(true);
    mocks.writeStoredAccountCredentialsIfCurrent.mockResolvedValue(true);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('rejects object OAuth providers without coercion', async () => {
    const { handlers } = registerHarness();
    let stringReads = 0;
    const throwingProvider = {
      toString() {
        stringReads += 1;
        throw new Error('Unexpected provider coercion');
      },
    };

    await expect(handlers.get('desktop:account:start-auth')?.({}, throwingProvider)).resolves.toMatchObject({
      success: false,
      error: 'Unsupported desktop sign-in provider',
    });
    expect(stringReads).toBe(0);
    expect(mocks.bindDesktopAuthLoopbackServer).not.toHaveBeenCalled();
  });

  it('stops OAuth result polling when the active flow is cancelled', async () => {
    const { handlers } = registerHarness();
    let resolveCallback!: (value: { state: string; resultToken: string; error: null }) => void;
    const callbackPromise = new Promise<{ state: string; resultToken: string; error: null }>((resolve) => {
      resolveCallback = resolve;
    });
    const loopback = {
      callbackUrl: 'http://127.0.0.1:45000/oauth/callback',
      waitForCallback: vi.fn(() => callbackPromise),
      close: vi.fn(),
      cancel: vi.fn(),
    };
    mocks.bindDesktopAuthLoopbackServer.mockResolvedValue(loopback);

    let resultPolls = 0;
    mocks.fetchDesktopJson.mockImplementation(async (url: string, init: RequestInit) => {
      if (url === 'https://api.example.com/auth/google/desktop/start') {
        return {
          data: {
            success: true,
            state: 'state-1',
            authUrl: 'https://accounts.example.com/oauth',
            expiresInSeconds: 300,
          },
        };
      }

      if (url === 'https://api.example.com/auth/google/desktop/result') {
        resultPolls += 1;
        expect(init.signal).toBeInstanceOf(AbortSignal);
        return {
          data: {
            success: false,
            pending: true,
          },
        };
      }

      throw new Error(`Unexpected URL ${url}`);
    });

    const authPromise = handlers.get('desktop:account:start-auth')?.({}, 'google') as Promise<unknown>;
    await vi.waitFor(() => {
      expect(mocks.openExternal).toHaveBeenCalledWith('https://accounts.example.com/oauth');
    });

    resolveCallback({ state: 'state-1', resultToken: 'result-1', error: null });
    await vi.waitFor(() => {
      expect(resultPolls).toBe(1);
    });

    await expect(handlers.get('desktop:account:cancel-auth')?.({})).resolves.toBe(true);
    await expect(authPromise).resolves.toMatchObject({
      success: false,
      error: 'Authorization cancelled',
    });

    expect(resultPolls).toBe(1);
    expect(loopback.cancel).toHaveBeenCalledWith('Authorization cancelled');
    expect(mocks.persistDesktopAuthResult).not.toHaveBeenCalled();
  });

  it('starts a new OAuth flow when sign-in is clicked again', async () => {
    const { handlers } = registerHarness();
    let rejectFirstCallback!: (error: Error) => void;
    const firstCallbackPromise = new Promise<never>((_resolve, reject) => {
      rejectFirstCallback = reject;
    });
    const firstLoopback = {
      callbackUrl: 'http://127.0.0.1:45000/oauth/callback',
      waitForCallback: vi.fn(() => firstCallbackPromise),
      close: vi.fn(),
      cancel: vi.fn((reason = 'Authorization cancelled') => {
        rejectFirstCallback(new Error(reason));
      }),
    };
    const secondLoopback = {
      callbackUrl: 'http://127.0.0.1:45001/oauth/callback',
      waitForCallback: vi.fn(() =>
        Promise.resolve({ state: 'state-2', resultToken: 'result-2', error: null })
      ),
      close: vi.fn(),
      cancel: vi.fn(),
    };
    mocks.bindDesktopAuthLoopbackServer
      .mockResolvedValueOnce(firstLoopback)
      .mockResolvedValueOnce(secondLoopback);

    let startCalls = 0;
    mocks.fetchDesktopJson.mockImplementation(async (url: string) => {
      if (url === 'https://api.example.com/auth/google/desktop/start') {
        startCalls += 1;
        return {
          data: {
            success: true,
            state: `state-${startCalls}`,
            authUrl: `https://accounts.example.com/oauth-${startCalls}`,
            expiresInSeconds: 300,
          },
        };
      }

      if (url === 'https://api.example.com/auth/google/desktop/result') {
        return {
          data: {
            success: true,
            username: 'alice',
          },
        };
      }

      throw new Error(`Unexpected URL ${url}`);
    });

    const firstAuthPromise = handlers.get('desktop:account:start-auth')?.({}, 'google') as Promise<unknown>;
    await vi.waitFor(() => {
      expect(mocks.openExternal).toHaveBeenCalledWith('https://accounts.example.com/oauth-1');
    });

    const secondAuthPromise = handlers.get('desktop:account:start-auth')?.({}, 'google') as Promise<unknown>;
    await vi.waitFor(() => {
      expect(mocks.openExternal).toHaveBeenCalledWith('https://accounts.example.com/oauth-2');
    });

    await expect(firstAuthPromise).resolves.toMatchObject({
      success: false,
      error: 'Authorization cancelled',
    });
    await expect(secondAuthPromise).resolves.toMatchObject({
      success: true,
      provider: 'google',
    });

    expect(firstLoopback.cancel).toHaveBeenCalledWith('Authorization cancelled');
    expect(mocks.bindDesktopAuthLoopbackServer).toHaveBeenCalledTimes(2);
    expect(mocks.openExternal).toHaveBeenCalledTimes(2);
    expect(mocks.persistDesktopAuthResult).toHaveBeenCalledTimes(1);
  });

  it('does not replay the one-time desktop OAuth result request after a network failure', async () => {
    const { handlers } = registerHarness();
    const loopback = {
      callbackUrl: 'http://127.0.0.1:45000/oauth/callback',
      waitForCallback: vi.fn(() =>
        Promise.resolve({ state: 'state-1', resultToken: 'result-1', error: null })
      ),
      close: vi.fn(),
      cancel: vi.fn(),
    };
    mocks.bindDesktopAuthLoopbackServer.mockResolvedValue(loopback);
    let resultCalls = 0;
    mocks.fetchDesktopJson.mockImplementation(async (url: string) => {
      if (url === 'https://api.example.com/auth/google/desktop/start') {
        return {
          data: {
            success: true,
            state: 'state-1',
            authUrl: 'https://accounts.example.com/oauth',
            expiresInSeconds: 300,
          },
        };
      }
      if (url === 'https://api.example.com/auth/google/desktop/result') {
        resultCalls += 1;
        throw new TypeError('Failed to fetch');
      }
      throw new Error(`Unexpected URL ${url}`);
    });

    await expect(handlers.get('desktop:account:start-auth')?.({}, 'google')).resolves.toMatchObject({
      success: false,
    });

    expect(resultCalls).toBe(1);
    expect(mocks.persistDesktopAuthResult).not.toHaveBeenCalled();
  });

  it('rejects unsafe OAuth authorization URLs before opening them in the system browser', async () => {
    const { handlers } = registerHarness();
    const loopback = {
      callbackUrl: 'http://127.0.0.1:45000/oauth/callback',
      waitForCallback: vi.fn(),
      close: vi.fn(),
      cancel: vi.fn(),
    };
    mocks.bindDesktopAuthLoopbackServer.mockResolvedValue(loopback);
    mocks.fetchDesktopJson.mockResolvedValue({
      data: {
        success: true,
        state: 'state-1',
        authUrl: 'http://127.0.0.1:3000/oauth',
        expiresInSeconds: 300,
      },
    });

    await expect(handlers.get('desktop:account:start-auth')?.({}, 'google')).resolves.toMatchObject({
      success: false,
      error: 'Sign-in start response contains unsupported auth URL',
    });

    expect(mocks.openExternal).not.toHaveBeenCalled();
    expect(loopback.waitForCallback).not.toHaveBeenCalled();
    expect(loopback.close).toHaveBeenCalledTimes(1);
  });

  it('rejects oversized OAuth authorization URLs before trimming them', async () => {
    const { handlers } = registerHarness();
    const loopback = {
      callbackUrl: 'http://127.0.0.1:45000/oauth/callback',
      waitForCallback: vi.fn(),
      close: vi.fn(),
      cancel: vi.fn(),
    };
    mocks.bindDesktopAuthLoopbackServer.mockResolvedValue(loopback);
    mocks.fetchDesktopJson.mockResolvedValue({
      data: {
        success: true,
        state: 'state-1',
        authUrl: `${' '.repeat(4097)}https://accounts.example.com/oauth`,
        expiresInSeconds: 300,
      },
    });

    await expect(handlers.get('desktop:account:start-auth')?.({}, 'google')).resolves.toMatchObject({
      success: false,
      error: 'Sign-in start response contains unsupported auth URL',
    });

    expect(mocks.openExternal).not.toHaveBeenCalled();
    expect(loopback.waitForCallback).not.toHaveBeenCalled();
    expect(loopback.close).toHaveBeenCalledTimes(1);
  });

  it('rejects oversized OAuth state values before opening the system browser', async () => {
    const { handlers } = registerHarness();
    const loopback = {
      callbackUrl: 'http://127.0.0.1:45000/oauth/callback',
      waitForCallback: vi.fn(),
      close: vi.fn(),
      cancel: vi.fn(),
    };
    mocks.bindDesktopAuthLoopbackServer.mockResolvedValue(loopback);
    mocks.fetchDesktopJson.mockResolvedValue({
      data: {
        success: true,
        state: `${' '.repeat(4097)}state-1`,
        authUrl: 'https://accounts.example.com/oauth',
        expiresInSeconds: 300,
      },
    });

    await expect(handlers.get('desktop:account:start-auth')?.({}, 'google')).resolves.toMatchObject({
      success: false,
      error: 'Sign-in start response is missing auth URL or state',
    });

    expect(mocks.openExternal).not.toHaveBeenCalled();
    expect(loopback.waitForCallback).not.toHaveBeenCalled();
    expect(loopback.close).toHaveBeenCalledTimes(1);
  });

  it('normalizes desktop email code requests before sending them to the API', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    const { handlers } = registerHarness({ fetchImpl: fetchMock });
    mocks.readJsonResponse.mockResolvedValue({});

    await expect(handlers.get('desktop:account:request-email-code')?.({}, ' VLA@example.com ')).resolves.toBe(true);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string)).toEqual({
      email: 'vla@example.com',
      locale: null,
    });
    expect(fetchMock.mock.calls[0]?.[1]?.redirect).toBe('error');
  });

  it('uses the injected Electron fetch implementation for desktop email requests', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    const globalFetch = vi.fn();
    vi.stubGlobal('fetch', globalFetch);
    const { handlers } = registerHarness({ fetchImpl });
    mocks.readJsonResponse.mockResolvedValue({});

    await expect(handlers.get('desktop:account:request-email-code')?.({}, 'vla@example.com')).resolves.toBe(true);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(globalFetch).not.toHaveBeenCalled();
  });

  it('retries transient desktop email code request failures before surfacing an error', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));
    const { handlers } = registerHarness({ fetchImpl: fetchMock });
    mocks.readJsonResponse.mockResolvedValue({});

    const request = handlers.get('desktop:account:request-email-code')?.({}, 'vla@example.com');
    await vi.advanceTimersByTimeAsync(1000);

    await expect(request).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('retries transient Electron proxy failures for desktop email code requests', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error('net::ERR_PROXY_CONNECTION_FAILED'))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));
    const { handlers } = registerHarness({ fetchImpl: fetchMock });
    mocks.readJsonResponse.mockResolvedValue({});

    const request = handlers.get('desktop:account:request-email-code')?.({}, 'vla@example.com');
    await vi.advanceTimersByTimeAsync(1000);

    await expect(request).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('rejects invalid desktop email code requests before network access', async () => {
    const { handlers } = registerHarness();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      handlers.get('desktop:account:request-email-code')?.({}, `${' '.repeat(4097)}vla@example.com`)
    ).rejects.toThrow('Invalid email address');

    expect(fetchMock).not.toHaveBeenCalled();
    expect(mocks.readJsonResponse).not.toHaveBeenCalled();
  });

  it('normalizes desktop email verification payloads before sending them to the API', async () => {
    const { handlers } = registerHarness();
    mocks.fetchDesktopJson.mockResolvedValue({
      data: {
        success: true,
        username: 'vla',
      },
    });

    await expect(
      handlers.get('desktop:account:verify-email-code')?.({}, ' VLA@example.com ', ' 123456 ')
    ).resolves.toMatchObject({ success: true });

    expect(mocks.fetchDesktopJson).toHaveBeenCalledTimes(1);
    expect(JSON.parse(mocks.fetchDesktopJson.mock.calls[0]?.[1]?.body as string)).toEqual({
      email: 'vla@example.com',
      code: '123456',
      target: 'desktop',
    });
  });

  it('coalesces matching email verification IPC calls across renderer windows', async () => {
    const { handlers } = registerHarness();
    let resolveVerification!: (value: { data: Record<string, unknown> }) => void;
    mocks.fetchDesktopJson.mockReturnValue(
      new Promise((resolve) => {
        resolveVerification = resolve;
      })
    );
    const verify = handlers.get('desktop:account:verify-email-code')!;

    const first = verify({}, ' VLA@example.com ', ' 123456 ');
    const second = verify({}, 'vla@example.com', '123456');

    expect(mocks.fetchDesktopJson).toHaveBeenCalledTimes(1);
    resolveVerification({
      data: {
        success: true,
        provider: 'email',
        username: 'vla',
        primaryEmail: 'vla@example.com',
        sessionToken: 'nts_test_session',
      },
    });

    await expect(Promise.all([first, second])).resolves.toEqual([
      expect.objectContaining({ success: true }),
      expect.objectContaining({ success: true }),
    ]);
    expect(mocks.fetchDesktopJson).toHaveBeenCalledTimes(1);
    expect(mocks.persistDesktopAuthResult).toHaveBeenCalledTimes(1);
  });

  it('does not retry desktop email verification network failures because codes are one-time use', async () => {
    const { handlers } = registerHarness();
    mocks.fetchDesktopJson.mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(
      handlers.get('desktop:account:verify-email-code')?.({}, 'vla@example.com', '123456')
    ).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining('Failed to fetch'),
    });

    expect(mocks.fetchDesktopJson).toHaveBeenCalledTimes(1);
  });

  it('does not let an older disconnect clear credentials written by a newer sign-in', async () => {
    const oldCredentials = { appSessionToken: 'nts_old_session' };
    const newCredentials = { appSessionToken: 'nts_new_session' };
    mocks.readStoredAccountCredentials
      .mockResolvedValueOnce(oldCredentials)
      .mockResolvedValueOnce(newCredentials);
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    const { handlers } = registerHarness({ fetchImpl: fetchMock });

    await expect(handlers.get('desktop:account:disconnect')?.({})).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[1]?.redirect).toBe('error');
    expect(mocks.clearStoredAccountCredentialsIfCurrent).toHaveBeenCalledWith('nts_old_session');
    expect(mocks.clearStoredAccountCredentials).not.toHaveBeenCalled();
  });

  it('rejects invalid desktop email verification payloads before network access', async () => {
    const { handlers } = registerHarness();

    await expect(
      handlers.get('desktop:account:verify-email-code')?.({}, 'bad', '123456')
    ).resolves.toMatchObject({
      success: false,
      error: 'Invalid email address',
    });
    await expect(
      handlers.get('desktop:account:verify-email-code')?.({}, 'vla@example.com', '12345')
    ).resolves.toMatchObject({
      success: false,
      error: 'Invalid verification code',
    });
    await expect(
      handlers.get('desktop:account:verify-email-code')?.({}, 'vla@example.com', `${'1'.repeat(65)}23456`)
    ).resolves.toMatchObject({
      success: false,
      error: 'Invalid verification code',
    });

    expect(mocks.fetchDesktopJson).not.toHaveBeenCalled();
    expect(mocks.persistDesktopAuthResult).not.toHaveBeenCalled();
  });
});
