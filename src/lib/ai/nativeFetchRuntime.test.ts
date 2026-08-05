import { afterEach, describe, expect, it, vi } from 'vitest';
import { aiTransportFetch, configureNativeAIFetch } from './nativeFetchRuntime';

describe('aiTransportFetch', () => {
  afterEach(() => {
    configureNativeAIFetch(null);
    vi.unstubAllGlobals();
  });

  it('uses the configured native transport without replacing global fetch', async () => {
    const response = new Response('native', { status: 200 });
    const nativeFetch = vi.fn(async () => response);
    const webFetch = vi.fn();
    vi.stubGlobal('fetch', webFetch);
    configureNativeAIFetch(nativeFetch);

    await expect(aiTransportFetch('https://api.example.test/v1/models', {
      method: 'GET',
    })).resolves.toBe(response);
    expect(nativeFetch).toHaveBeenCalledWith('https://api.example.test/v1/models', {
      method: 'GET',
    });
    expect(webFetch).not.toHaveBeenCalled();
  });

  it('keeps standard fetch as the web and desktop fallback', async () => {
    const response = new Response('web', { status: 200 });
    const webFetch = vi.fn(async () => response);
    vi.stubGlobal('fetch', webFetch);

    await expect(aiTransportFetch('https://api.example.test/v1/models')).resolves.toBe(response);
    expect(webFetch).toHaveBeenCalledTimes(1);
  });
});
