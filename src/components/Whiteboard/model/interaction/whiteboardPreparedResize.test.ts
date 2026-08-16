import { describe, expect, it } from 'vitest';
import type { WhiteboardDragState } from './whiteboardInteractions';
import { prepareWhiteboardResize, shouldPrepareWhiteboardResize } from './whiteboardPreparedResize';

const stroke = {
  color: '#111111',
  id: 'stroke',
  points: [{ pressure: 0.5, x: 10, y: 20 }, { pressure: 0.6, x: 30, y: 40 }],
  size: 1,
  tool: 'pen' as const,
};

describe('whiteboard prepared resize', () => {
  it('keeps small resizes on the immediate path', () => {
    expect(shouldPrepareWhiteboardResize(createState([stroke]))).toBe(false);
  });

  it('prepares large resizes without mutating source strokes', async () => {
    const strokes = Array.from({ length: 1001 }, (_, index) => ({ ...stroke, id: `stroke-${index}` }));
    const state = createState(strokes);

    expect(shouldPrepareWhiteboardResize(state)).toBe(true);
    const prepared = await prepareWhiteboardResize(
      [],
      strokes,
      state,
      { height: 200, width: 200, x: 0, y: 0 },
      () => true,
    );

    expect(prepared?.strokes[0].points).toEqual([
      { pressure: 0.5, x: 20, y: 40 },
      { pressure: 0.6, x: 60, y: 80 },
    ]);
    expect(prepared?.selectionGeometry.groupBounds).not.toBeNull();
    expect(strokes[0].points[0]).toEqual({ pressure: 0.5, x: 10, y: 20 });
  });

  it('abandons preparation when a newer edit supersedes it', async () => {
    await expect(prepareWhiteboardResize(
      [],
      [stroke],
      createState([stroke]),
      { height: 200, width: 200, x: 0, y: 0 },
      () => false,
    )).resolves.toBeNull();
  });
});

function createState(strokes: typeof stroke[]): Extract<WhiteboardDragState, { kind: 'resize-selection' }> {
  return {
    bounds: { height: 100, width: 100, x: 0, y: 0 },
    currentBounds: { height: 100, width: 100, x: 0, y: 0 },
    handle: 'se',
    kind: 'resize-selection',
    originalElementsById: new Map(),
    originalStrokesById: new Map(strokes.map((item) => [item.id, item])),
    preserveAspectRatio: false,
    startPoint: { x: 0, y: 0 },
  };
}
