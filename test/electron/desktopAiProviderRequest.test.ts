import { describe, expect, it } from 'vitest';
import { normalizeAiProviderRequest } from '../../electron/desktopAiProviderRequest.mjs';

describe('desktop AI provider request validation', () => {
  it.each([
    'http://0.0.0.0:11434/v1/models',
    'http://[::]:11434/v1/models',
  ])('rejects unspecified-address HTTP providers: %s', (url) => {
    expect(() => normalizeAiProviderRequest({ url, method: 'GET' }))
      .toThrow('AI provider request URL must use HTTPS unless it targets the local computer.');
  });
});
