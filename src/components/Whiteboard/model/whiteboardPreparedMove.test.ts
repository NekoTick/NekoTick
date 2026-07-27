import { describe, expect, it } from 'vitest';
import type { WhiteboardMoveDragState } from './whiteboardInteractions';
import { prepareWhiteboardMove, shouldPrepareWhiteboardMove } from './whiteboardPreparedMove';

const stroke = {
  color: '#111111',
  id: 'stroke',
  points: [{ pressure: 0.5, x: 10, y: 20 }, { pressure: 0.6, x: 30, y: 40 }],
  size: 1,
  tool: 'pen' as const,
};

describe('whiteboard prepared move', () => {
  it('keeps small moves on the immediate path', () => {
    const state: WhiteboardMoveDragState = {
      currentPoint: { x: 0, y: 0 },
      kind: 'move-strokes',
      originalStrokesById: new Map([[stroke.id, stroke]]),
      startPoint: { x: 0, y: 0 },
      strokeIds: [stroke.id],
    };

    expect(shouldPrepareWhiteboardMove(state)).toBe(false);
  });

  it('prepares large moves without mutating the source collections', async () => {
    const strokes = Array.from({ length: 1001 }, (_, index) => ({
      ...stroke,
      id: `stroke-${index}`,
    }));
    const state: WhiteboardMoveDragState = {
      currentPoint: { x: 0, y: 0 },
      kind: 'move-strokes',
      originalStrokesById: new Map(strokes.map((item) => [item.id, item])),
      startPoint: { x: 5, y: 10 },
      strokeIds: strokes.map((item) => item.id),
    };

    expect(shouldPrepareWhiteboardMove(state)).toBe(true);
    const prepared = await prepareWhiteboardMove([], strokes, state, { x: 20, y: 30 }, () => true);

    expect(prepared?.strokes[0].points).toEqual([
      { pressure: 0.5, x: 25, y: 40 },
      { pressure: 0.6, x: 45, y: 60 },
    ]);
    expect(prepared?.selectionGeometry.groupBounds).not.toBeNull();
    expect(strokes[0].points[0]).toEqual({ pressure: 0.5, x: 10, y: 20 });
  });

  it('abandons preparation when a newer edit supersedes it', async () => {
    const state: WhiteboardMoveDragState = {
      currentPoint: { x: 0, y: 0 },
      kind: 'move-strokes',
      originalStrokesById: new Map([[stroke.id, stroke]]),
      startPoint: { x: 0, y: 0 },
      strokeIds: [stroke.id],
    };

    await expect(prepareWhiteboardMove([], [stroke], state, { x: 10, y: 10 }, () => false))
      .resolves.toBeNull();
  });
});
