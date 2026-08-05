import { afterEach, describe, expect, it, vi } from 'vitest';
import { requestManagedWebJson } from './managed/webRequests';
import { configureNativeAIFetch } from './nativeFetchRuntime';
import { providerFetch } from './providerHttp';

describe('native AI fetch integration', () => {
  afterEach(() => {
    configureNativeAIFetch(null);
    vi.unstubAllGlobals();
  });

  it('routes provider requests through native transport without managed cookies', async () => {
    const nativeFetch = vi.fn(async () => new Response('{}', { status: 200 }));
    const webFetch = vi.fn();
    configureNativeAIFetch(nativeFetch);
    vi.stubGlobal('fetch', webFetch);

    await expect(providerFetch('https://provider.example.test/v1/models', {
      method: 'GET',
      headers: { Authorization: 'Bearer test-token' },
    })).resolves.toMatchObject({ status: 200 });

    expect(nativeFetch).toHaveBeenCalledWith(
      'https://provider.example.test/v1/models',
      expect.not.objectContaining({ credentials: 'include' }),
    );
    expect(webFetch).not.toHaveBeenCalled();
  });

  it('routes managed requests through native transport with session cookies', async () => {
    const nativeFetch = vi.fn(async () => new Response('{"ok":true}', { status: 200 }));
    configureNativeAIFetch(nativeFetch);

    await expect(requestManagedWebJson<{ ok: boolean }>('/models', {
      method: 'POST',
      body: '{}',
    })).resolves.toEqual({ ok: true });

    expect(nativeFetch).toHaveBeenCalledWith(
      'https://api.vlaina.com/v1/models',
      expect.objectContaining({ method: 'POST', credentials: 'include' }),
    );
  });

  it('does not retry native provider or managed POST failures', async () => {
    const networkError = new TypeError('native network failed');
    const nativeFetch = vi.fn().mockRejectedValue(networkError);
    configureNativeAIFetch(nativeFetch);

    await expect(providerFetch('https://provider.example.test/v1/chat/completions', {
      method: 'POST',
      body: '{}',
    })).rejects.toThrow('AI_PROVIDER_CONNECTION_FAILED');
    await expect(requestManagedWebJson('/chat/completions', {
      method: 'POST',
      body: '{}',
    })).rejects.toBe(networkError);

    expect(nativeFetch).toHaveBeenCalledTimes(2);
  });
});
