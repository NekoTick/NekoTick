import { describe, expect, it, vi } from 'vitest';
import { getStrokesInLasso } from './whiteboardSelection';
import { eraseWhiteboardStroke, eraseWhiteboardStrokes } from './whiteboardStrokeEraser';
import type { WhiteboardDrawingTool } from './whiteboardModel';

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

  it('erases the visible smoothed path instead of the raw control polygon', () => {
    const stroke = {
      color: '#111111',
      id: 'stroke',
      points: [
        { pressure: 0.5, x: 0, y: 0 },
        { pressure: 0.5, x: 50, y: 100 },
        { pressure: 0.5, x: 100, y: 0 },
      ],
      size: 1,
      tool: 'pen' as const,
    };

    expect(eraseWhiteboardStrokes([stroke], [{ point: { x: 50, y: 40 }, size: 1 }]))
      .not.toEqual([stroke]);
    expect(eraseWhiteboardStrokes([stroke], [{ point: { x: 50, y: 90 }, size: 1 }]))
      .toEqual([stroke]);
  });

  it('uses the same eraser span across different brush widths', () => {
    const createStroke = (tool: 'pen' | 'marker') => ({
      color: '#111111',
      id: tool,
      points: [{ pressure: 0.5, x: 0, y: 0 }, { pressure: 0.5, x: 100, y: 0 }],
      size: 1,
      tool,
    });
    const sample = [{ point: { x: 50, y: 0 }, size: 1 }];
    const pen = eraseWhiteboardStrokes([createStroke('pen')], sample);
    const marker = eraseWhiteboardStrokes([createStroke('marker')], sample);

    expect(marker[0].points.at(-1)?.x).toBe(pen[0].points.at(-1)?.x);
    expect(marker[1].points[0].x).toBe(pen[1].points[0].x);
  });

  it('keeps stroke content outside the visible eraser radius', () => {
    const tools: WhiteboardDrawingTool[] = [
      'pen', 'pencil', 'marker', 'colored-pencil', 'fountain', 'watercolor', 'crayon',
    ];
    for (const tool of tools) {
      const strokes = eraseWhiteboardStrokes([{
        color: '#111111',
        id: tool,
        points: [{ pressure: 0.5, x: 0, y: 0 }, { pressure: 0.5, x: 100, y: 0 }],
        size: 1,
        tool,
      }], [{ point: { x: 50, y: 0 }, size: 1 }]);

      expect(strokes).toHaveLength(2);
      expect(strokes[0].points.at(-1)!.x).toBeGreaterThanOrEqual(40);
      expect(strokes[1].points[0].x).toBeLessThanOrEqual(60);
    }
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

  it('checks only nearby sampled points after indexing a long stroke', () => {
    const stroke = {
      color: '#111111',
      id: 'long-stroke',
      points: Array.from({ length: 10_001 }, (_, x) => ({ pressure: 0.5, x, y: 0 })),
      size: 1,
      tool: 'pen' as const,
    };
    const usedIds = new Set([stroke.id]);
    const initial = eraseWhiteboardStroke(
      stroke,
      null,
      [{ point: { x: 9000, y: 0 }, size: 1 }],
      usedIds,
    )!;
    const sampledPoints = new Proxy(initial.sampledPoints, {
      get(target, property, receiver) {
        if (typeof property === 'string' && /^\d+$/.test(property) && Number(property) > 500) {
          throw new Error('distant sampled points were inspected');
        }
        return Reflect.get(target, property, receiver);
      },
    });

    expect(() => eraseWhiteboardStroke(
      stroke,
      { ...initial, sampledPoints },
      [{ point: { x: 100, y: 0 }, size: 1 }],
      usedIds,
    )).not.toThrow();
  });

  it('preserves untouched source points and material metadata around an erased gap', () => {
    const points = Array.from({ length: 11 }, (_, index) => ({
      azimuth: index / 10,
      pressure: 0.35 + index / 20,
      tilt: index / 20,
      velocity: index / 10,
      x: index * 10,
      y: 0,
    }));
    const source = {
      color: '#663399',
      id: 'textured-stroke',
      points,
      renderPathOffset: 12,
      renderPointOffset: 7,
      renderSeed: 'texture-root',
      renderTextureScale: 1.4,
      size: 1,
      tool: 'crayon' as const,
    };

    const result = eraseWhiteboardStrokes([source], [{ point: { x: 50, y: 0 }, size: 1 }]);

    expect(result).toHaveLength(2);
    expect(result[0].points[0]).toBe(points[0]);
    expect(result[1].points.at(-1)).toBe(points.at(-1));
    expect(result[0]).toMatchObject({ renderSeed: 'texture-root', renderTextureScale: 1.4 });
    expect(result[1]).toMatchObject({ renderSeed: 'texture-root', renderTaperStart: false, renderTextureScale: 1.4 });
    expect(result[0].renderPathOffset).toBe(12);
    expect(result[1].renderPathOffset).toBeGreaterThan(12);
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
