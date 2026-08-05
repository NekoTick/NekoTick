import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureNativeAccountHttp } from '@/lib/account/capacitorRuntime';
import { webAccountCommands } from '@/lib/account/webCommands';
import capacitorConfig from '../../capacitor.config';

function mockLocation(url: string): void {
  vi.spyOn(window, 'location', 'get').mockReturnValue(new URL(url) as unknown as Location);
}

describe('mobile account authentication', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    configureNativeAccountHttp(null);
    vi.stubGlobal('Capacitor', { isNativePlatform: () => true });
    mockLocation('http://localhost/');
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    configureNativeAccountHttp(null);
    localStorage.clear();
    sessionStorage.clear();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('keeps cookies native without globally replacing fetch', () => {
    expect(capacitorConfig.plugins).toMatchObject({
      CapacitorCookies: { enabled: true },
    });
    expect(capacitorConfig.plugins).not.toHaveProperty('CapacitorHttp');
  });

  it('completes the existing web email-session contract from a native origin', async () => {
    const nativeHttpMock = vi.fn()
      .mockResolvedValueOnce({ data: '', status: 200, headers: {}, url: '' })
      .mockResolvedValueOnce({
        data: {
          success: true,
          provider: 'email',
          username: 'mobile-user',
          primaryEmail: 'mobile-user@example.test',
        },
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        url: '',
      })
      .mockResolvedValueOnce({
        data: {
          success: true,
          connected: true,
          provider: 'email',
          username: 'mobile-user',
          primaryEmail: 'mobile-user@example.test',
        },
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        url: '',
      });
    configureNativeAccountHttp(nativeHttpMock);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(webAccountCommands.requestEmailCode(' MOBILE-USER@example.test ', 'zh-CN')).resolves.toBe(true);
    await expect(webAccountCommands.verifyEmailCode('mobile-user@example.test', ' 123456 ')).resolves.toMatchObject({
      success: true,
      provider: 'email',
      username: 'mobile-user',
    });
    await expect(webAccountCommands.probeStatus()).resolves.toMatchObject({
      connected: true,
      provider: 'email',
      username: 'mobile-user',
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(JSON.parse(nativeHttpMock.mock.calls[0]?.[0].data as string)).toEqual({
      email: 'mobile-user@example.test',
      locale: 'zh-CN',
    });
    expect(JSON.parse(nativeHttpMock.mock.calls[1]?.[0].data as string)).toEqual({
      email: 'mobile-user@example.test',
      code: '123456',
      target: 'web',
    });
  });

  it('rejects native OAuth before starting a network request', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(webAccountCommands.startAuth('google')).rejects.toThrow(
      'OAuth sign-in is unavailable in the native app.',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
