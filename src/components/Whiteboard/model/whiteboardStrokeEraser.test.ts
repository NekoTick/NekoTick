import { describe, expect, it, vi } from 'vitest';
import { getStrokesInLasso } from './whiteboardSelection';
import { eraseWhiteboardStrokes } from './whiteboardStrokeEraser';

describe('whiteboard stroke eraser', () => {
  it('removes only the swept section and preserves both sides', () => {
    const strokes = eraseWhiteboardStrokes([{
      color: '#111111',
      id: 'stroke',
      points: [{ pressure: 0.5, x: 0, y: 0 }, { pressure: 0.5, x: 100, y: 0 }],
      size: 1,
      tool: 'pen',
    }], [
      { point: { x: 50, y: -20 }, size: 1 },
      { point: { x: 50, y: 20 }, size: 1 },
    ]);

    expect(strokes).toHaveLength(2);
    expect(strokes[0].id).toBe('stroke');
    expect(strokes[1].id).not.toBe('stroke');
    expect(strokes[0].points[0].x).toBe(0);
    expect(strokes[1].points.at(-1)?.x).toBe(100);
    expect(strokes.flatMap((stroke) => stroke.points).some((point) => point.breakBefore)).toBe(false);
    expect(strokes.flatMap((stroke) => stroke.points).some((point) => point.x === 50)).toBe(false);
    expect(getStrokesInLasso(strokes, [
      { x: -5, y: -10 }, { x: 40, y: -10 }, { x: 40, y: 10 }, { x: -5, y: 10 },
    ])).toEqual(['stroke']);
  });

  it('returns the original array when the sweep misses', () => {
    const strokes = [{
      color: '#111111',
      id: 'stroke',
      points: [{ pressure: 0.5, x: 0, y: 0 }, { pressure: 0.5, x: 100, y: 0 }],
      size: 1,
      tool: 'pen' as const,
    }];

    expect(eraseWhiteboardStrokes(strokes, [{ point: { x: 50, y: 100 }, size: 1 }])).toBe(strokes);
  });

  it('does not rebuild distant strokes while erasing a nearby stroke', () => {
    const distant = {
      color: '#111111',
      id: 'distant',
      points: [{ pressure: 0.5, x: 1000, y: 1000 }, { pressure: 0.5, x: 1100, y: 1000 }],
      size: 1,
      tool: 'pen' as const,
    };
    const nearby = {
      color: '#111111',
      id: 'nearby',
      points: [{ pressure: 0.5, x: 0, y: 0 }, { pressure: 0.5, x: 100, y: 0 }],
      size: 1,
      tool: 'pen' as const,
    };

    const result = eraseWhiteboardStrokes([nearby, distant], [{ point: { x: 50, y: 0 }, size: 1 }]);

    expect(result.find((stroke) => stroke.id === distant.id)).toBe(distant);
  });

  it('does not traverse distant stroke points outside the indexed candidates', () => {
    const distant = {
      color: '#111111',
      id: 'distant',
      points: [{ pressure: 0.5, x: 1000, y: 1000 }, { pressure: 0.5, x: 1100, y: 1000 }],
      size: 1,
      tool: 'pen' as const,
    };
    const nearby = {
      color: '#111111',
      id: 'nearby',
      points: [{ pressure: 0.5, x: 0, y: 0 }, { pressure: 0.5, x: 100, y: 0 }],
      size: 1,
      tool: 'pen' as const,
    };
    const distantTraversal = vi.spyOn(distant.points, 'forEach');

    eraseWhiteboardStrokes(
      [nearby, distant],
      [{ point: { x: 50, y: 0 }, size: 1 }],
      new Set([nearby.id]),
    );

    expect(distantTraversal).not.toHaveBeenCalled();
  });

  it('keeps segment ids unique across repeated partial erases', () => {
    const initial = [{
      color: '#111111',
      id: 'stroke',
      points: [{ pressure: 0.5, x: 0, y: 0 }, { pressure: 0.5, x: 200, y: 0 }],
      size: 1,
      tool: 'pen' as const,
    }];
    const first = eraseWhiteboardStrokes(initial, [{ point: { x: 100, y: 0 }, size: 1 }]);
    const second = eraseWhiteboardStrokes(first, [{ point: { x: 50, y: 0 }, size: 1 }]);

    expect(second).toHaveLength(3);
    expect(new Set(second.map((stroke) => stroke.id)).size).toBe(3);
  });
});
