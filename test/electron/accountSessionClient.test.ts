import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  default: {
    app: {
      getPath: vi.fn(() => '/tmp/vlaina-account-session-client-test'),
    },
    safeStorage: {
      isEncryptionAvailable: vi.fn(() => false),
    },
  },
}));

import { createDesktopAccountSessionClient } from '../../electron/accountSessionClient.mjs';

const credentials = {
  appSessionToken: 'nts_example',
  provider: 'google',
  username: 'alice',
  primaryEmail: 'alice@example.com',
  avatarUrl: null,
  authenticatedAt: Date.now(),
};

function createHarness(overrides: Partial<Parameters<typeof createDesktopAccountSessionClient>[0]> = {}) {
  const options = {
    apiBaseUrl: 'https://api.example.com',
    readStoredAccountCredentials: vi.fn(async () => credentials),
    clearStoredAccountCredentials: vi.fn(async () => undefined),
    clearStoredAccountCredentialsIfCurrent: vi.fn(async () => true),
    rotateStoredSessionToken: vi.fn(async () => undefined),
    writeStoredAccountCredentials: vi.fn(async () => undefined),
    writeStoredAccountCredentialsIfCurrent: vi.fn(async () => true),
    getDesktopDeviceId: vi.fn(async () => `vld_${'11'.repeat(16)}`),
    ...overrides,
  };
  return {
    client: createDesktopAccountSessionClient(options),
    options,
  };
}

describe('desktop account session client', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('does not start stored-session requests when already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { client, options } = createHarness();

    await expect(client.fetchWithStoredSession('https://api.example.com/managed', {
      signal: controller.signal,
    })).rejects.toMatchObject({ name: 'AbortError' });

    expect(options.readStoredAccountCredentials).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects stored-session requests promptly when fetch ignores abort', async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn(() => new Promise(() => undefined));
    vi.stubGlobal('fetch', fetchMock);
    const { client, options } = createHarness();

    const request = client.fetchWithStoredSession('https://api.example.com/managed', {
      signal: controller.signal,
    });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    controller.abort();

    await expect(request).rejects.toMatchObject({ name: 'AbortError' });
    expect(options.rotateStoredSessionToken).not.toHaveBeenCalled();
  });

  it('rejects optional public requests promptly when fetch ignores abort', async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn(() => new Promise(() => undefined));
    vi.stubGlobal('fetch', fetchMock);
    const { client } = createHarness({
      readStoredAccountCredentials: vi.fn(async () => null),
    });

    const request = client.fetchWithOptionalStoredSession('https://api.example.com/public', {
      signal: controller.signal,
    });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    controller.abort();

    await expect(request).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('prevents request headers from overriding stored session credentials', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const { client } = createHarness({
      readStoredAccountCredentials: vi.fn(async () => ({
        ...credentials,
        appSessionToken: 'legacy_session_token',
      })),
    });

    await client.fetchWithStoredSession('https://api.example.com/managed', {
      headers: {
        Authorization: 'Bearer attacker',
        'x-app-session-token': 'attacker',
        'x-vlaina-device-id': 'attacker',
      },
    });

    const headers = fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer legacy_session_token');
    expect(headers['x-app-session-token']).toBe('legacy_session_token');
    expect(headers['x-vlaina-device-id']).toBe(`vld_${'11'.repeat(16)}`);
  });

  it('clears an evicted session immediately and preserves the device-limit reason until sign-in', async () => {
    let storedCredentials: typeof credentials | null = credentials;
    const readStoredAccountCredentials = vi.fn(async () => storedCredentials);
    const clearStoredAccountCredentialsIfCurrent = vi.fn(async (expectedToken: string) => {
      if (storedCredentials?.appSessionToken !== expectedToken) return false;
      storedCredentials = null;
      return true;
    });
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      success: false,
      error: 'Session signed out because device limit was reached',
      errorCode: 'session_device_limit',
    }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);
    const { client } = createHarness({
      readStoredAccountCredentials,
      clearStoredAccountCredentialsIfCurrent,
    });

    await expect(client.fetchWithStoredSession('https://api.example.com/managed')).rejects.toMatchObject({
      statusCode: 401,
      errorCode: 'session_device_limit',
    });
    await expect(client.getDesktopAccountSessionStatus()).resolves.toMatchObject({
      connected: false,
      sessionInvalidated: true,
      sessionInvalidationReason: 'device_limit',
    });
    await expect(client.getDesktopAccountSessionStatus()).resolves.toMatchObject({
      sessionInvalidationReason: 'device_limit',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(clearStoredAccountCredentialsIfCurrent).toHaveBeenCalledWith(credentials.appSessionToken);
  });

  it('does not retry a device-limit response during the post-login grace period', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      success: false,
      errorCode: 'session_device_limit',
    }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);
    const { client, options } = createHarness();

    await expect(client.getDesktopAccountSessionStatus()).resolves.toMatchObject({
      connected: false,
      sessionInvalidationReason: 'device_limit',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(options.clearStoredAccountCredentialsIfCurrent).toHaveBeenCalledWith(credentials.appSessionToken);
  });

  it('cancels 401 activation retry delays before retrying', async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn(async () => new Response('', { status: 401 }));
    vi.stubGlobal('fetch', fetchMock);
    const { client, options } = createHarness({
      readStoredAccountCredentials: vi.fn(async () => ({
        ...credentials,
        authenticatedAt: Date.now(),
      })),
    });

    const request = client.fetchWithStoredSession('https://api.example.com/managed', {
      signal: controller.signal,
    });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await Promise.resolve();
    controller.abort();

    await expect(request).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(options.rotateStoredSessionToken).not.toHaveBeenCalled();
  });

  it('requests budget data during desktop session status probes', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      connected: true,
      provider: 'google',
      username: 'alice',
      primaryEmail: 'alice@example.com',
      avatarUrl: null,
      membershipTier: 'pro',
      membershipName: 'Pro',
      budget: {
        active: true,
        remainingPercent: 75,
        status: 'active',
      },
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const { client } = createHarness();

    await expect(client.getDesktopAccountSessionStatus()).resolves.toMatchObject({
      connected: true,
      username: 'alice',
      budget: {
        active: true,
        remainingPercent: 75,
        status: 'active',
      },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://api.example.com/auth/session?include_budget=1');
  });

  it('ignores an older session probe after newer credentials are stored', async () => {
    const newerCredentials = {
      ...credentials,
      appSessionToken: 'nts_new_session',
      username: 'new-user',
      primaryEmail: 'new@example.com',
    };
    const readStoredAccountCredentials = vi.fn()
      .mockResolvedValueOnce(credentials)
      .mockResolvedValue(newerCredentials);
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      connected: true,
      provider: 'google',
      username: 'old-user',
      primaryEmail: 'old@example.com',
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const { client, options } = createHarness({ readStoredAccountCredentials });

    await expect(client.getDesktopAccountSessionStatus()).resolves.toMatchObject({
      connected: true,
      username: 'new-user',
      primaryEmail: 'new@example.com',
    });

    expect(options.rotateStoredSessionToken).not.toHaveBeenCalled();
    expect(options.writeStoredAccountCredentialsIfCurrent).not.toHaveBeenCalled();
    expect(options.clearStoredAccountCredentialsIfCurrent).not.toHaveBeenCalled();
  });

  it('uses current credentials when an older session probe fails', async () => {
    const newerCredentials = {
      ...credentials,
      appSessionToken: 'nts_new_session',
      username: 'new-user',
      primaryEmail: 'new@example.com',
    };
    const readStoredAccountCredentials = vi.fn()
      .mockResolvedValueOnce(credentials)
      .mockResolvedValue(newerCredentials);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    const { client } = createHarness({ readStoredAccountCredentials });

    await expect(client.getDesktopAccountSessionStatus()).resolves.toMatchObject({
      connected: true,
      username: 'new-user',
      primaryEmail: 'new@example.com',
    });
  });

  it('uses the injected Electron fetch implementation for session probes', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      connected: true,
      provider: 'google',
      username: 'alice',
      primaryEmail: 'alice@example.com',
      avatarUrl: null,
    }), { status: 200 }));
    const globalFetch = vi.fn();
    vi.stubGlobal('fetch', globalFetch);
    const { client } = createHarness({ fetchImpl });

    await expect(client.getDesktopAccountSessionStatus()).resolves.toMatchObject({
      connected: true,
      username: 'alice',
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(globalFetch).not.toHaveBeenCalled();
  });

  it('normalizes desktop session identity payloads', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      connected: true,
      provider: 'google',
      username: ' alice ',
      primaryEmail: ' alice@example.com ',
      avatarUrl: 'http://127.0.0.1/avatar.png',
      membershipTier: 'pro',
      membershipName: 'P'.repeat(129),
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const { client } = createHarness();

    await expect(client.readDesktopSessionIdentity('nts_session')).resolves.toEqual({
      provider: 'google',
      username: 'alice',
      primaryEmail: 'alice@example.com',
      avatarUrl: null,
      membershipTier: 'pro',
      membershipName: null,
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://api.example.com/auth/session');
  });
});
