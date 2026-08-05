import { describe, expect, it } from 'vitest';
import {
  combineMobileAbortSignals,
  createMobileRandomUUID,
} from './mobileWebApiPolyfills';

describe('mobile Web API compatibility', () => {
  it('creates RFC 4122 version 4 UUIDs from Web Crypto', () => {
    expect(createMobileRandomUUID()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('aborts a combined signal with the first source reason', () => {
    const first = new AbortController();
    const second = new AbortController();
    const combined = combineMobileAbortSignals([first.signal, second.signal]);

    second.abort('stop');
    first.abort('late');

    expect(combined.aborted).toBe(true);
    expect(combined.reason).toBe('stop');
  });

  it('returns an already aborted signal when a source was cancelled', () => {
    const source = new AbortController();
    source.abort('already-stopped');

    const combined = combineMobileAbortSignals([source.signal]);

    expect(combined.aborted).toBe(true);
    expect(combined.reason).toBe('already-stopped');
  });
});
