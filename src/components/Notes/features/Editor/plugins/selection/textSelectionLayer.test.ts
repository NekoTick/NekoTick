import { describe, expect, it } from 'vitest';
import { mergeTextSelectionLayerRects } from './textSelectionLayerRects';

describe('mergeTextSelectionLayerRects', () => {
  it('merges touching fragments on the same visual line', () => {
    expect(mergeTextSelectionLayerRects([
      { bottom: 30, left: 40, right: 70, top: 10 },
      { bottom: 30, left: 10, right: 40.5, top: 10 },
      { bottom: 50, left: 10, right: 20, top: 30 },
    ])).toEqual([
      { bottom: 30, left: 10, right: 70, top: 10 },
      { bottom: 50, left: 10, right: 20, top: 30 },
    ]);
  });

  it('keeps real horizontal gaps and different line boxes separate', () => {
    expect(mergeTextSelectionLayerRects([
      { bottom: 30, left: 10, right: 20, top: 10 },
      { bottom: 30, left: 21, right: 30, top: 10 },
      { bottom: 31, left: 30, right: 40, top: 10 },
    ])).toHaveLength(3);
  });
});
