import { describe, expect, it, vi } from 'vitest';
import {
  fetchAiProviderRequestWithRetry,
  normalizeAiProviderRequest,
} from '../../electron/desktopAiProviderRequest.mjs';

describe('desktop AI provider request validation', () => {
  it('uses the injected fetch implementation', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 204 }));
    const request = normalizeAiProviderRequest({
      url: 'https://api.example.com/v1/models',
      method: 'GET',
    });

    const response = await fetchAiProviderRequestWithRetry(
      request,
      new AbortController().signal,
      fetchImpl,
    );

    expect(response.status).toBe(204);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.example.com/v1/models',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it.each([
    'http://0.0.0.0:11434/v1/models',
    'http://[::]:11434/v1/models',
  ])('rejects unspecified-address HTTP providers: %s', (url) => {
    expect(() => normalizeAiProviderRequest({ url, method: 'GET' }))
      .toThrow('AI provider request URL must use HTTPS unless it targets the local computer.');
  });
});
