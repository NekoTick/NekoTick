import { describe, expect, it } from 'vitest';
import { setCacheEntry, touchCacheEntry } from './lru';

describe('LRU cache helpers', () => {
  it('refreshes a cached entry before evicting the oldest entry', () => {
    const cache = new Map([
      ['alpha', 1],
      ['beta', 2],
    ]);

    expect(touchCacheEntry(cache, 'alpha')).toBe(1);
    setCacheEntry(cache, 'gamma', 3, 2);

    expect(Array.from(cache.entries())).toEqual([
      ['alpha', 1],
      ['gamma', 3],
    ]);
  });

  it('replaces an existing entry without evicting another key', () => {
    const cache = new Map([
      ['alpha', 1],
      ['beta', 2],
    ]);

    setCacheEntry(cache, 'alpha', 3, 2);

    expect(Array.from(cache.entries())).toEqual([
      ['beta', 2],
      ['alpha', 3],
    ]);
  });
});
