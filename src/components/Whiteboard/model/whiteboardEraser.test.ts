import { describe, expect, it } from 'vitest';
import {
  createWhiteboardEraserSpatialIndex,
  getWhiteboardBoundsCandidates,
  getWhiteboardEraserCandidates,
  getWhiteboardEraserTargets,
  getWhiteboardStrokeEraserCandidates,
} from './whiteboardEraser';

describe('whiteboard object eraser', () => {
  it('hits images and strokes across fast pointer movement', () => {
    const targets = getWhiteboardEraserTargets(
      [{ height: 20, id: 'image', text: '', type: 'image', width: 20, x: 490, y: -10 }],
      [{ color: '#111111', id: 'stroke', points: [{ pressure: 0.5, x: 500, y: -20 }, { pressure: 0.5, x: 500, y: 20 }], size: 1, tool: 'pen' }],
      [{ point: { x: 0, y: 0 }, size: 1 }, { point: { x: 1000, y: 0 }, size: 1 }],
    );
    expect(targets.elementIds).toEqual(['image']);
    expect(targets.strokeIds).toEqual(['stroke']);
  });

  it('leaves distant content untouched', () => {
    const targets = getWhiteboardEraserTargets(
      [{ height: 40, id: 'image', text: '', type: 'image', width: 40, x: 200, y: 200 }],
      [],
      [{ point: { x: 0, y: 0 }, size: 1 }],
    );
    expect(targets).toMatchObject({ elementIds: [], strokeIds: [] });
  });

  it('limits exact hit testing to nearby indexed content', () => {
    const nearby = { height: 40, id: 'nearby', text: '', type: 'image' as const, width: 40, x: 20, y: 20 };
    const distant = Array.from({ length: 1000 }, (_, index) => ({
      height: 40, id: `distant-${index}`, text: '', type: 'image' as const, width: 40,
      x: 10_000 + index * 100, y: 10_000,
    }));
    const index = createWhiteboardEraserSpatialIndex([nearby, ...distant], []);

    const candidates = getWhiteboardEraserCandidates(index, [{ point: { x: 30, y: 30 }, size: 1 }]);

    expect(candidates.elements).toEqual([nearby]);
  });

  it('limits partial erasing to nearby indexed strokes', () => {
    const nearby = {
      color: '#111111', id: 'nearby',
      points: [{ pressure: 0.5, x: 20, y: 20 }, { pressure: 0.5, x: 80, y: 20 }],
      size: 1, tool: 'pen' as const,
    };
    const distant = Array.from({ length: 1000 }, (_, index) => ({
      color: '#111111', id: `distant-${index}`,
      points: [{ pressure: 0.5, x: 10_000 + index * 100, y: 10_000 }],
      size: 1, tool: 'pen' as const,
    }));
    const index = createWhiteboardEraserSpatialIndex([], [nearby, ...distant]);

    const candidates = getWhiteboardStrokeEraserCandidates(index, [{ point: { x: 40, y: 20 }, size: 1 }]);

    expect(candidates).toEqual([nearby]);
  });

  it('keeps oversized content queryable without expanding it into every grid cell', () => {
    const oversized = {
      height: 100_000, id: 'oversized', text: '', type: 'image' as const, width: 100_000, x: 0, y: 0,
    };
    const index = createWhiteboardEraserSpatialIndex([oversized], []);

    const candidates = getWhiteboardEraserCandidates(index, [{ point: { x: 50_000, y: 50_000 }, size: 1 }]);

    expect(index.elementCells.size).toBe(0);
    expect(candidates.elements).toEqual([oversized]);
  });

  it('limits viewport culling to nearby indexed content', () => {
    const visible = { height: 40, id: 'visible', text: '', type: 'image' as const, width: 40, x: 20, y: 20 };
    const distant = Array.from({ length: 1000 }, (_, index) => ({
      height: 40, id: `offscreen-${index}`, text: '', type: 'image' as const, width: 40,
      x: 10_000 + index * 100, y: 10_000,
    }));
    const index = createWhiteboardEraserSpatialIndex([visible, ...distant], []);

    const candidates = getWhiteboardBoundsCandidates(index, { height: 500, width: 500, x: 0, y: 0 });

    expect(candidates.elements).toEqual([visible]);
  });

  it('keeps source stacking order when indexed and oversized strokes share a query', () => {
    const indexed = {
      color: '#111111', id: 'indexed',
      points: [{ pressure: 0.5, x: 20, y: 20 }, { pressure: 0.5, x: 40, y: 40 }],
      size: 1, tool: 'pen' as const,
    };
    const oversized = {
      color: '#222222', id: 'oversized',
      points: [{ pressure: 0.5, x: 20, y: 20 }, { pressure: 0.5, x: 100_000, y: 100_000 }],
      size: 1, tool: 'pen' as const,
    };
    const index = createWhiteboardEraserSpatialIndex([], [indexed, oversized]);

    const candidates = getWhiteboardBoundsCandidates(index, { height: 50, width: 50, x: 0, y: 0 });

    expect(candidates.strokes).toEqual([indexed, oversized]);
  });

  it('falls back to source arrays when a viewport spans too many grid cells', () => {
    const elements = [{ height: 40, id: 'image', text: '', type: 'image' as const, width: 40, x: 20, y: 20 }];
    const index = createWhiteboardEraserSpatialIndex(elements, []);

    const candidates = getWhiteboardBoundsCandidates(index, { height: 1_000_000, width: 1_000_000, x: 0, y: 0 });

    expect(candidates.elements).toBe(elements);
  });
});
