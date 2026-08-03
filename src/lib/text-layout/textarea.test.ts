import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearPreparedTextCachesForTests,
  getPreparedTextCacheStatsForTests,
  measureTextareaContentHeight,
  PREPARED_TEXT_CACHE_CHAR_BUDGET,
} from './textarea';

describe('measureTextareaContentHeight', () => {
  const options = {
    font: '400 15px sans-serif',
    lineHeight: 24,
    minHeight: 24,
    maxHeight: 320,
  };

  beforeEach(() => {
    clearPreparedTextCachesForTests();
  });

  it('counts a trailing newline as a visible empty textarea line', () => {
    expect(measureTextareaContentHeight('hello\n', 320, options)).toBe(
      measureTextareaContentHeight('hello', 320, options) + options.lineHeight,
    );
  });

  it('counts the final trailing newline after existing blank lines', () => {
    expect(measureTextareaContentHeight('hello\n\n', 320, options)).toBe(
      measureTextareaContentHeight('hello', 320, options) + options.lineHeight * 2,
    );
  });

  it('does not retain prepared layouts larger than the cache character budget', () => {
    measureTextareaContentHeight(
      'x'.repeat(PREPARED_TEXT_CACHE_CHAR_BUDGET + 1),
      320,
      options,
    );

    expect(getPreparedTextCacheStatsForTests().prepared).toEqual({
      entries: 0,
      textChars: 0,
    });
  });

  it('evicts older prepared layouts before the total character budget is exceeded', () => {
    const chunkLength = Math.floor(PREPARED_TEXT_CACHE_CHAR_BUDGET / 4);
    for (let index = 0; index < 5; index += 1) {
      measureTextareaContentHeight(`${index}${'x'.repeat(chunkLength)}`, 320, options);
    }

    const stats = getPreparedTextCacheStatsForTests().prepared;
    expect(stats.entries).toBeLessThan(5);
    expect(stats.textChars).toBeLessThanOrEqual(PREPARED_TEXT_CACHE_CHAR_BUDGET);
  });
});
