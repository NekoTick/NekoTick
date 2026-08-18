import { describe, expect, it } from 'vitest';
import { getGraphemeOffsets, iterateGraphemes } from './text-segmentation';

describe('text segmentation', () => {
  it('reuses grapheme boundaries for compound emoji', () => {
    const value = 'A\ud83d\udc68\u200d\ud83d\udc69\u200d\ud83d\udc67\u200d\ud83d\udc66B';

    expect(Array.from(iterateGraphemes(value))).toEqual([
      'A',
      '\ud83d\udc68\u200d\ud83d\udc69\u200d\ud83d\udc67\u200d\ud83d\udc66',
      'B',
    ]);
    expect(getGraphemeOffsets(value)).toEqual([0, 1, 12, 13]);
  });
});
