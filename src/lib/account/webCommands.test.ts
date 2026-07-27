import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { webAccountCommands } from './webCommands';

const MAX_ACCOUNT_RESPONSE_BODY_BYTES = 64 * 1024;

function mockLocation(url: string) {
  vi.spyOn(window, 'location', 'get').mockReturnValue(new URL(url) as unknown as Location);
}

describe('webAccountCommands', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockLocation('https://vlaina.com/pricing');
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('treats cached metadata as connected until explicit sign-out', () => {
    sessionStorage.setItem(
      'vlaina_account_session',
      JSON.stringify({
        provider: 'google',
        username: 'octocat',
        primaryEmail: 'octocat@example.com',
        avatarUrl: 'https://example.com/avatar.png',
      })
    );

    const status = webAccountCommands.getStatus();

    expect(status.connected).toBe(true);
    expect(status.provider).toBe('google');
    expect(status.username).toBe('octocat');
    expect(status.primaryEmail).toBe('octocat@example.com');
  });

  it('probes the cookie session before reporting a connected status', async () => {
    sessionStorage.setItem(
      'vlaina_account_session',
      JSON.stringify({
        provider: 'google',
        username: 'octocat',
        primaryEmail: 'octocat@example.com',
        avatarUrl: 'https://example.com/avatar.png',
      })
    );

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        success: true,
        connected: true,
        provider: 'google',
        username: 'octocat',
        primaryEmail: 'octocat@example.com',
        avatarUrl: 'https://example.com/avatar.png',
        budget: {
          active: true,
          remainingPercent: 75,
          status: 'active',
        },
      }), { status: 200 })
    );
    vi.stubGlobal('fetch', fetchMock);

    const status = await webAccountCommands.probeStatus();

    expect(status.connected).toBe(true);
    expect(status.provider).toBe('google');
    expect(status.budget).toEqual({
      active: true,
      remainingPercent: 75,
      status: 'active',
    });
    expect(fetchMock).toHaveBeenCalledWith('https://api.vlaina.com/auth/session?include_budget=1', {
      method: 'GET',
      cache: 'no-store',
      credentials: 'include',
      signal: expect.any(AbortSignal),
      headers: {
        Accept: 'application/json',
      },
    });
  });

  it('preserves metadata when the cookie session is unauthorized', async () => {
    sessionStorage.setItem(
      'vlaina_account_session',
      JSON.stringify({ provider: 'google', username: 'octocat', avatarUrl: 'https://example.com/avatar.png' })
    );
    localStorage.setItem(
      'vlaina_account_identity',
      JSON.stringify({ isConnected: true, username: 'octocat', avatarUrl: 'https://example.com/avatar.png' })
    );

    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 401 });
    vi.stubGlobal('fetch', fetchMock);

    const status = await webAccountCommands.probeStatus();

    expect(status.connected).toBe(true);
    expect(status.provider).toBe('google');
    expect(status.username).toBe('octocat');
    expect(sessionStorage.getItem('vlaina_account_session')).not.toBeNull();
    expect(localStorage.getItem('vlaina_account_identity')).not.toBeNull();
  });

  it('skips probing the hosted session API on local development origins', async () => {
    mockLocation('http://127.0.0.1:3000/');
    sessionStorage.setItem(
      'vlaina_account_session',
      JSON.stringify({
        provider: 'google',
        username: 'octocat',
        primaryEmail: 'octocat@example.com',
        avatarUrl: 'https://example.com/avatar.png',
      })
    );

    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const status = await webAccountCommands.probeStatus();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(status.connected).toBe(true);
    expect(status.provider).toBe('google');
    expect(status.username).toBe('octocat');
  });

  it('rejects OAuth sign-in on local development origins before any network request', async () => {
    mockLocation('http://127.0.0.1:3000/');

    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(webAccountCommands.startAuth('google')).rejects.toThrow(
      'Web sign-in is unavailable on local development origins. Use vlaina.com/pricing or the desktop app.'
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects email sign-in on local development origins before any network request', async () => {
    mockLocation('http://127.0.0.1:3000/');

    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(webAccountCommands.requestEmailCode('octocat@example.com')).rejects.toThrow(
      'Web sign-in is unavailable on local development origins. Use vlaina.com/pricing or the desktop app.'
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('retries transient OAuth start body read failures before surfacing an error', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(new ReadableStream({
        start(controller) {
          controller.error(new TypeError('network request failed'));
        },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        authUrl: 'https://accounts.example.com/oauth',
        state: 'state-1',
      }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const request = webAccountCommands.startAuth('google');
    await vi.advanceTimersByTimeAsync(1000);

    await expect(request).resolves.toEqual({
      authUrl: 'https://accounts.example.com/oauth',
      state: 'state-1',
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not replay the one-time web OAuth result request after a network failure', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(webAccountCommands.completeAuth('google', 'state-1')).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining('Failed to fetch'),
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('continues polling web OAuth results only after an explicit pending response', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: false, pending: true }), { status: 202 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        success: true,
        provider: 'google',
        username: 'octocat',
      }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const request = webAccountCommands.completeAuth('google', 'state-1');
    await vi.advanceTimersByTimeAsync(300);

    await expect(request).resolves.toMatchObject({ success: true, username: 'octocat' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('retries transient email-code network failures before surfacing an error', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMock);

    const request = webAccountCommands.requestEmailCode('octocat@example.com');
    await vi.advanceTimersByTimeAsync(1000);

    await expect(request).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('normalizes email code request payloads before sending them to the API', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMock);

    await expect(webAccountCommands.requestEmailCode(' OCTOCAT@example.com ', 'zh-CN')).resolves.toBe(true);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse((fetchMock.mock.calls[0]?.[1] as RequestInit).body as string)).toEqual({
      email: 'octocat@example.com',
      locale: 'zh-CN',
    });
  });

  it('rejects oversized email code request payloads before network access', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      webAccountCommands.requestEmailCode(`${' '.repeat(4097)}octocat@example.com`)
    ).rejects.toThrow('Invalid email address');

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not retry email-code business errors', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'Invalid email address' }), { status: 400 })
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(webAccountCommands.requestEmailCode('octocat@example.com')).rejects.toThrow('Invalid email address');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('normalizes email verification payloads before sending them to the API', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        success: true,
        provider: 'email',
        username: 'octocat',
        primaryEmail: 'octocat@example.com',
      }), { status: 200 })
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(webAccountCommands.verifyEmailCode(' OCTOCAT@example.com ', ' 123456 ')).resolves.toMatchObject({
      success: true,
      provider: 'email',
      username: 'octocat',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse((fetchMock.mock.calls[0]?.[1] as RequestInit).body as string)).toEqual({
      email: 'octocat@example.com',
      code: '123456',
      target: 'web',
    });
  });

  it('does not retry email verification network failures because codes are one-time use', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(webAccountCommands.verifyEmailCode('octocat@example.com', '123456')).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining('Failed to fetch'),
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rejects invalid email verification payloads before network access', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(webAccountCommands.verifyEmailCode('bad', '123456')).resolves.toMatchObject({
      success: false,
      error: 'Invalid email address',
    });
    await expect(webAccountCommands.verifyEmailCode('octocat@example.com', '12345')).resolves.toMatchObject({
      success: false,
      error: 'Invalid verification code',
    });
    await expect(
      webAccountCommands.verifyEmailCode('octocat@example.com', `${'1'.repeat(65)}23456`)
    ).resolves.toMatchObject({
      success: false,
      error: 'Invalid verification code',
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('separates cookie revocation from current-attempt client cleanup', async () => {
    sessionStorage.setItem(
      'vlaina_account_session',
      JSON.stringify({ provider: 'google', username: 'octocat', avatarUrl: 'https://example.com/avatar.png' })
    );

    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMock);

    await webAccountCommands.disconnect();

    expect(fetchMock).toHaveBeenCalledWith('https://api.vlaina.com/auth/session/revoke', {
      method: 'POST',
      cache: 'no-store',
      credentials: 'include',
      signal: expect.any(AbortSignal),
    });
    expect(sessionStorage.getItem('vlaina_account_session')).not.toBeNull();

    webAccountCommands.clearLocalSession();
    expect(sessionStorage.getItem('vlaina_account_session')).toBeNull();
  });

  it('times out account requests when fetch ignores cancellation', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(() => new Promise(() => undefined));
    vi.stubGlobal('fetch', fetchMock);

    const request = webAccountCommands.requestEmailCode('octocat@example.com');
    const expectation = expect(request).rejects.toThrow('Account API request timed out.');
    await vi.advanceTimersByTimeAsync(15_000);

    await expectation;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns cached status when session JSON parsing times out', async () => {
    vi.useFakeTimers();
    sessionStorage.setItem(
      'vlaina_account_session',
      JSON.stringify({ provider: 'google', username: 'octocat', avatarUrl: 'https://example.com/avatar.png' })
    );
    const reader = {
      read: vi.fn(() => new Promise<ReadableStreamReadResult<Uint8Array>>(() => undefined)),
      cancel: vi.fn(async () => undefined),
      releaseLock: vi.fn(),
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: {
        getReader: () => reader,
      },
    });
    vi.stubGlobal('fetch', fetchMock);

    const request = webAccountCommands.probeStatus();
    await vi.advanceTimersByTimeAsync(15_000);
    const status = await request;

    expect(status.connected).toBe(true);
    expect(status.username).toBe('octocat');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(reader.cancel).toHaveBeenCalledTimes(1);
    expect(reader.releaseLock).toHaveBeenCalledTimes(1);
  });

  it('returns cached status when the session response body is oversized', async () => {
    sessionStorage.setItem(
      'vlaina_account_session',
      JSON.stringify({ provider: 'google', username: 'octocat', avatarUrl: 'https://example.com/avatar.png' })
    );
    const cancel = vi.fn();
    const response = new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('x'.repeat(MAX_ACCOUNT_RESPONSE_BODY_BYTES + 1)));
        },
        cancel,
      }),
      { status: 200 }
    );
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));

    const status = await webAccountCommands.probeStatus();

    expect(status.connected).toBe(true);
    expect(status.username).toBe('octocat');
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(() => response.body?.getReader()).not.toThrow();
  });

  it('returns cached status when the declared session response body is oversized', async () => {
    sessionStorage.setItem(
      'vlaina_account_session',
      JSON.stringify({ provider: 'google', username: 'octocat', avatarUrl: 'https://example.com/avatar.png' })
    );
    const cancel = vi.fn();
    const response = new Response(
      new ReadableStream({ cancel }),
      {
        status: 200,
        headers: {
          'content-length': String(MAX_ACCOUNT_RESPONSE_BODY_BYTES + 1),
        },
      }
    );
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));

    const status = await webAccountCommands.probeStatus();

    expect(status.connected).toBe(true);
    expect(status.username).toBe('octocat');
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(() => response.body?.getReader()).not.toThrow();
  });

  it('ignores invalid account content-length syntax', async () => {
    const response = new Response(
      JSON.stringify({
        success: true,
        connected: true,
        provider: 'google',
        username: 'octocat',
      }),
      {
        status: 200,
        headers: {
          'content-length': '1e12',
        },
      }
    );
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));

    const status = await webAccountCommands.probeStatus();

    expect(status.connected).toBe(true);
    expect(status.username).toBe('octocat');
  });

  it('uses the HTTP fallback when account error response bodies are oversized', async () => {
    const cancel = vi.fn();
    const response = new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('x'.repeat(MAX_ACCOUNT_RESPONSE_BODY_BYTES + 1)));
        },
        cancel,
      }),
      { status: 400 }
    );
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));

    await expect(webAccountCommands.requestEmailCode('octocat@example.com')).rejects.toThrow(
      'Failed to send verification code: HTTP 400'
    );

    expect(cancel).toHaveBeenCalledTimes(1);
    expect(() => response.body?.getReader()).not.toThrow();
  });

  it('preserves metadata when revoke fails so logout can be retried', async () => {
    sessionStorage.setItem(
      'vlaina_account_session',
      JSON.stringify({ provider: 'google', username: 'octocat', avatarUrl: 'https://example.com/avatar.png' })
    );

    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    vi.stubGlobal('fetch', fetchMock);

    await expect(webAccountCommands.disconnect()).rejects.toThrow('Failed to revoke session: HTTP 500');
    expect(sessionStorage.getItem('vlaina_account_session')).not.toBeNull();
  });
});
