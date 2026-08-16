import { act, renderHook } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { markWhiteboardSparseUpdate } from '@/components/Whiteboard/model/core/whiteboardCollection';
import type { WhiteboardDragState } from '@/components/Whiteboard/model/interaction/whiteboardInteractions';
import type { WhiteboardElement, WhiteboardStroke, WhiteboardTool } from '@/components/Whiteboard/model/core/whiteboardModel';

const mocks = vi.hoisted(() => ({
  createSpatialIndexAsync: vi.fn(),
}));

vi.mock('@/components/Whiteboard/model/interaction/whiteboardEraser', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/Whiteboard/model/interaction/whiteboardEraser')>();
  return {
    ...actual,
    createWhiteboardEraserSpatialIndexAsync: mocks.createSpatialIndexAsync,
  };
});

import { createWhiteboardEraserSpatialIndex } from '@/components/Whiteboard/model/interaction/whiteboardEraser';
import { useWhiteboardSpatialIndex } from './useWhiteboardSpatialIndex';

const initialStrokes: WhiteboardStroke[] = [0, 100].map((x, index) => ({
  color: '#111111',
  id: `stroke-${index}`,
  points: [{ pressure: 0.5, x, y: 0 }, { pressure: 0.5, x: x + 20, y: 20 }],
  size: 1,
  tool: 'pen',
}));

describe('useWhiteboardSpatialIndex', () => {
  beforeEach(() => {
    mocks.createSpatialIndexAsync.mockReset();
  });

  it('keeps full-selection geometry while a sparse index rebuild is pending', async () => {
    let finishRebuild: (() => void) | undefined;
    mocks.createSpatialIndexAsync.mockImplementation((elements, strokes) => new Promise((resolve) => {
      finishRebuild = () => resolve(createWhiteboardEraserSpatialIndex(elements, strokes));
    }));
    const { result } = renderHook(useHarness);
    const initialGeometry = result.current.spatialIndex.selectionGeometry;
    expect(initialGeometry).not.toBeNull();
    const moved = {
      ...initialStrokes[1],
      points: initialStrokes[1].points.map((point) => ({ ...point, x: point.x - 50 })),
    };
    const nextStrokes = markWhiteboardSparseUpdate(
      initialStrokes,
      [initialStrokes[0], moved],
      [moved],
    );

    act(() => result.current.setStrokes(nextStrokes));
    expect(result.current.spatialIndex.selectionGeometry).toBeNull();

    act(() => result.current.selectAll());
    expect(result.current.renderData.selectionGeometry).toBe(initialGeometry);
    expect(result.current.selectedStrokeIds).toEqual(['stroke-0', 'stroke-1']);

    await act(async () => {
      finishRebuild?.();
      await Promise.resolve();
    });

    expect(result.current.renderData.selectionGeometry).toBe(result.current.spatialIndex.selectionGeometry);
    expect(result.current.renderData.selectionGeometry).not.toBe(initialGeometry);
  });
});

function useHarness() {
  const [dragState, setDragState] = useState<WhiteboardDragState | null>(null);
  const [elements, setElements] = useState<WhiteboardElement[]>([]);
  const [selectedElementIds, setSelectedElementIds] = useState<string[]>([]);
  const [selectedStrokeIds, setSelectedStrokeIds] = useState<string[]>([]);
  const [strokes, setStrokes] = useState(initialStrokes);
  const [, setTool] = useState<WhiteboardTool>('select');
  const spatial = useWhiteboardSpatialIndex({
    dragState,
    elements,
    selectedElementIds,
    selectedStrokeIds,
    setDragState,
    setElements,
    setSelectedElementIds,
    setSelectedStrokeIds,
    setStrokes,
    setTool,
    strokes,
  });
  return { ...spatial, selectedStrokeIds, setStrokes };
}
