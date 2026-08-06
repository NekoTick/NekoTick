import { describe, expect, it, vi } from 'vitest';
import {
  createWhiteboardEraserSpatialIndex,
  getWhiteboardBoundsCandidates,
  getWhiteboardEraserCandidates,
  getWhiteboardEraserTargets,
  getWhiteboardIndexedItems,
  getWhiteboardStrokeEraserCandidates,
  tryUpdateWhiteboardEraserSpatialIndex,
  updateWhiteboardEraserSpatialIndex,
} from './whiteboardEraser';
import { markWhiteboardSpliceUpdate, removeWhiteboardItems } from './whiteboardCollection';

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

  it('matches the visible object eraser trail width', () => {
    const targets = getWhiteboardEraserTargets(
      [{ height: 2, id: 'image', text: '', type: 'image', width: 2, x: 6, y: -1 }],
      [],
      [{ point: { x: 0, y: 0 }, size: 1 }],
    );

    expect(targets.elementIds).toEqual(['image']);
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

  it('extends the spatial index when strokes are only appended', () => {
    const first = {
      color: '#111111', id: 'first',
      points: [{ pressure: 0.5, x: 20, y: 20 }], size: 1, tool: 'pen' as const,
    };
    const appended = {
      color: '#222222', id: 'appended',
      points: [{ pressure: 0.5, x: 520, y: 20 }], size: 1, tool: 'pen' as const,
    };
    const elements: never[] = [];
    const initial = createWhiteboardEraserSpatialIndex(elements, [first]);

    const updated = updateWhiteboardEraserSpatialIndex(initial, elements, [first, appended]);

    expect(updated.strokeCells).not.toBe(initial.strokeCells);
    expect(getWhiteboardBoundsCandidates(initial, { height: 80, width: 80, x: 480, y: 0 }).strokes).toEqual([]);
    expect(getWhiteboardBoundsCandidates(updated, { height: 80, width: 80, x: 480, y: 0 }).strokes)
      .toEqual([appended]);
  });

  it('does not copy historical index maps when a stroke is appended', () => {
    const strokes = Array.from({ length: 1000 }, (_, index) => ({
      color: '#111111', id: `stroke-${index}`,
      points: [{ pressure: 0.5, x: index * 300, y: 20 }], size: 1, tool: 'pen' as const,
    }));
    const initial = createWhiteboardEraserSpatialIndex([], strokes);
    const iterateCells = vi.spyOn(initial.strokeCells, Symbol.iterator);
    const iterateOrder = vi.spyOn(initial.strokeOrder as Map<string, number>, Symbol.iterator);
    const appended = {
      color: '#222222', id: 'appended',
      points: [{ pressure: 0.5, x: 20, y: 520 }], size: 1, tool: 'pen' as const,
    };

    const updated = updateWhiteboardEraserSpatialIndex(initial, [], [...strokes, appended]);

    expect(iterateCells).not.toHaveBeenCalled();
    expect(iterateOrder).not.toHaveBeenCalled();
    expect(getWhiteboardBoundsCandidates(updated, { height: 80, width: 80, x: 0, y: 480 }).strokes)
      .toEqual([appended]);
  });

  it('promotes a bulk load before later strokes are appended', () => {
    const strokes = Array.from({ length: 1000 }, (_, index) => ({
      color: '#111111', id: `loaded-${index}`,
      points: [{ pressure: 0.5, x: index * 300, y: 20 }], size: 1, tool: 'pen' as const,
    }));
    const bulk = updateWhiteboardEraserSpatialIndex(
      createWhiteboardEraserSpatialIndex([], []),
      [],
      strokes,
    );
    const iterateCells = vi.spyOn(bulk.strokeCells, Symbol.iterator);

    updateWhiteboardEraserSpatialIndex(bulk, [], [...strokes, {
      color: '#222222', id: 'next',
      points: [{ pressure: 0.5, x: 20, y: 520 }], size: 1, tool: 'pen' as const,
    }]);

    expect(iterateCells).not.toHaveBeenCalled();
  });

  it('updates the spatial index when an existing stroke changes', () => {
    const original = {
      color: '#111111', id: 'stroke',
      points: [{ pressure: 0.5, x: 20, y: 20 }], size: 1, tool: 'pen' as const,
    };
    const moved = { ...original, points: [{ pressure: 0.5, x: 520, y: 20 }] };
    const elements: never[] = [];
    const initial = createWhiteboardEraserSpatialIndex(elements, [original]);

    const updated = updateWhiteboardEraserSpatialIndex(initial, elements, [moved]);

    expect(updated.strokeCells).not.toBe(initial.strokeCells);
    expect(getWhiteboardBoundsCandidates(updated, { height: 80, width: 80, x: 0, y: 0 }).strokes).toEqual([]);
    expect(getWhiteboardBoundsCandidates(updated, { height: 80, width: 80, x: 480, y: 0 }).strokes)
      .toEqual([moved]);
  });

  it('reuses indexed cells for sparse deletions while updating source order', () => {
    const strokes = Array.from({ length: 3 }, (_, index) => ({
      color: '#111111', id: `stroke-${index}`,
      points: [{ pressure: 0.5, x: 20 + index * 500, y: 20 }], size: 1, tool: 'pen' as const,
    }));
    const initial = createWhiteboardEraserSpatialIndex([], strokes);
    const remaining = removeWhiteboardItems(strokes, new Set([strokes[1].id]));

    const updated = updateWhiteboardEraserSpatialIndex(initial, [], remaining);

    expect(updated.baseIndex).toBe(initial);
    expect(getWhiteboardBoundsCandidates(updated, { height: 80, width: 80, x: 480, y: 0 }).strokes)
      .toEqual([]);
    expect(getWhiteboardBoundsCandidates(updated, { height: 80, width: 80, x: 980, y: 0 }).strokes)
      .toEqual([strokes[2]]);
    expect(getWhiteboardIndexedItems(remaining, updated.strokeOrder, [strokes[2].id]))
      .toEqual([strokes[2]]);
  });

  it('keeps sparse updates when a later stroke is appended', () => {
    const strokes = Array.from({ length: 3 }, (_, index) => ({
      color: '#111111', id: `stroke-${index}`,
      points: [{ pressure: 0.5, x: 20 + index * 500, y: 20 }], size: 1, tool: 'pen' as const,
    }));
    const initial = createWhiteboardEraserSpatialIndex([], strokes);
    const remaining = [strokes[0], strokes[2]];
    const sparse = updateWhiteboardEraserSpatialIndex(initial, [], remaining);
    const iterateOrder = vi.spyOn(sparse.strokeOrder as Map<string, number>, Symbol.iterator);
    const appended = { ...strokes[0], id: 'appended', points: [{ pressure: 0.5, x: 1520, y: 20 }] };

    const updated = updateWhiteboardEraserSpatialIndex(sparse, [], [...remaining, appended]);

    expect(iterateOrder).not.toHaveBeenCalled();
    expect(getWhiteboardBoundsCandidates(updated, { height: 80, width: 80, x: 480, y: 0 }).strokes)
      .toEqual([]);
    expect(getWhiteboardBoundsCandidates(updated, { height: 80, width: 80, x: 1480, y: 0 }).strokes)
      .toEqual([appended]);
  });

  it('filters stale overlay items after a sparse replacement', () => {
    const first = {
      color: '#111111', id: 'first',
      points: [{ pressure: 0.5, x: 20, y: 20 }], size: 1, tool: 'pen' as const,
    };
    const appended = { ...first, id: 'appended', points: [{ pressure: 0.5, x: 520, y: 20 }] };
    const initial = createWhiteboardEraserSpatialIndex([], [first]);
    const withAppend = updateWhiteboardEraserSpatialIndex(initial, [], [first, appended]);
    const moved = { ...appended, points: [{ pressure: 0.5, x: 1020, y: 20 }] };

    const updated = updateWhiteboardEraserSpatialIndex(withAppend, [], [first, moved]);

    expect(getWhiteboardBoundsCandidates(updated, { height: 80, width: 80, x: 480, y: 0 }).strokes)
      .toEqual([]);
    expect(getWhiteboardBoundsCandidates(updated, { height: 80, width: 80, x: 980, y: 0 }).strokes)
      .toEqual([moved]);
  });

  it('compacts accumulated sparse updates before overlay cells grow without bound', () => {
    const original = {
      color: '#111111', id: 'stroke',
      points: [{ pressure: 0.5, x: 20, y: 20 }], size: 1, tool: 'pen' as const,
    };
    const initial = createWhiteboardEraserSpatialIndex([], [original]);
    let current = [original];
    let updated = initial;

    for (let update = 0; update < 300; update += 1) {
      current = [{ ...current[0], points: [{ pressure: 0.5, x: 20 + update / 1000, y: 20 }] }];
      updated = updateWhiteboardEraserSpatialIndex(updated, [], current);
    }

    const largestOverlayCell = Math.max(0, ...Array.from(updated.strokeCells.values(), (items) => items.length));
    expect(largestOverlayCell).toBeLessThanOrEqual(256);
    expect(updated.baseIndex).not.toBe(initial);
    expect(getWhiteboardBoundsCandidates(updated, { height: 80, width: 80, x: 0, y: 0 }).strokes)
      .toEqual(current);
  });

  it('stops inspecting an unknown bulk replacement once it exceeds the overlay budget', () => {
    const strokes = Array.from({ length: 1000 }, (_, index) => ({
      color: '#111111', id: `stroke-${index}`,
      points: [{ pressure: 0.5, x: index * 300, y: 20 }], size: 1, tool: 'pen' as const,
    }));
    const initial = createWhiteboardEraserSpatialIndex([], strokes);
    const orderLookup = vi.spyOn(initial.strokeOrder as Map<string, number>, 'get');
    const replacements = strokes.map((stroke) => ({ ...stroke, color: '#222222' }));

    const updated = tryUpdateWhiteboardEraserSpatialIndex(initial, [], replacements);

    expect(updated).toBeNull();
    expect(orderLookup.mock.calls.length).toBeLessThan(strokes.length);
  });

  it('updates a split stroke without rebuilding the unchanged source order', () => {
    const strokes = Array.from({ length: 1000 }, (_, index) => ({
      color: '#111111', id: `stroke-${index}`,
      points: [{ pressure: 0.5, x: index * 300, y: 20 }], size: 1, tool: 'pen' as const,
    }));
    const initial = createWhiteboardEraserSpatialIndex([], strokes);
    const firstFragment = { ...strokes[500], points: [{ pressure: 0.5, x: 150_000, y: 10 }] };
    const secondFragment = { ...strokes[500], id: 'stroke-500-part-2', points: [{ pressure: 0.5, x: 150_000, y: 30 }] };
    const next = markWhiteboardSpliceUpdate(
      strokes,
      [...strokes.slice(0, 500), firstFragment, secondFragment, ...strokes.slice(501)],
      [{ index: 500, items: [firstFragment, secondFragment] }],
    );
    const orderLookup = vi.spyOn(initial.strokeOrder as Map<string, number>, 'get');

    const updated = tryUpdateWhiteboardEraserSpatialIndex(initial, [], next);

    expect(updated).not.toBeNull();
    expect(orderLookup).not.toHaveBeenCalled();
    expect(getWhiteboardIndexedItems(next, updated!.strokeOrder, [secondFragment.id, strokes[501].id]))
      .toEqual([secondFragment, strokes[501]]);
  });
});
