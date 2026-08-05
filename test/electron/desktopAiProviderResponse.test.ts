import { describe, expect, it } from 'vitest';
import {
  AI_PROVIDER_INVALID_RESPONSE_METADATA_MESSAGE,
  normalizeAiProviderResponseMetadata,
} from '../../electron/desktopAiProviderResponse.mjs';

function responseWithHeaders(entries: Array<[string, string]>) {
  return {
    status: 200,
    statusText: 'OK',
    headers: { entries: () => entries.values() },
  };
}

describe('desktop AI provider response metadata', () => {
  it('normalizes bounded metadata and removes response cookies', () => {
    expect(normalizeAiProviderResponseMetadata(responseWithHeaders([
      ['Content-Type', 'application/json'],
      ['Set-Cookie', 'session=fake-session-token'],
      ['Set-Cookie', 'preference=fake-preference-token'],
      ['X-Request-Id', 'fake-request-id'],
    ]))).toEqual({
      status: 200,
      statusText: 'OK',
      headers: [
        ['content-type', 'application/json'],
        ['x-request-id', 'fake-request-id'],
      ],
    });
  });

  it.each([
    ['invalid status', { ...responseWithHeaders([]), status: 700 }],
    ['oversized status text', { ...responseWithHeaders([]), statusText: 'x'.repeat(257) }],
    ['too many headers', responseWithHeaders(Array.from(
      { length: 129 },
      (_, index) => [`x-header-${index}`, 'value'],
    ))],
    ['invalid header name', responseWithHeaders([['Invalid Header', 'value']])],
    ['oversized header value', responseWithHeaders([['x-test', 'x'.repeat((16 * 1024) + 1)]])],
    ['oversized total metadata', responseWithHeaders(Array.from(
      { length: 5 },
      (_, index) => [`x-header-${index}`, 'x'.repeat(16 * 1024)],
    ))],
  ])('rejects %s', (_label, response) => {
    expect(() => normalizeAiProviderResponseMetadata(response)).toThrow(
      AI_PROVIDER_INVALID_RESPONSE_METADATA_MESSAGE,
    );
  });

  it('does not disclose errors from hostile metadata getters', () => {
    const response = Object.defineProperty(responseWithHeaders([]), 'statusText', {
      get() {
        throw new Error('fake-upstream-getter-secret');
      },
    });

    expect(() => normalizeAiProviderResponseMetadata(response)).toThrow(
      AI_PROVIDER_INVALID_RESPONSE_METADATA_MESSAGE,
    );
    try {
      normalizeAiProviderResponseMetadata(response);
    } catch (error) {
      expect(String(error)).not.toContain('fake-upstream-getter-secret');
    }
  });
});
