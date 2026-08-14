import { act, renderHook } from '@testing-library/react';
import type { PointerEvent } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { createWhiteboardEraserSpatialIndex } from '../model/whiteboardEraser';
import { useWhiteboardStrokeSelection } from './useWhiteboardStrokeSelection';

describe('useWhiteboardStrokeSelection', () => {
  it('moves a lasso selection when dragging the empty area inside its bounds', () => {
    const element = { height: 40, id: 'image-1', text: 'one.png', type: 'image' as const, width: 40, x: 0, y: 0 };
    const stroke = {
      color: '#111111', id: 'stroke-1',
      points: [{ pressure: 0.5, x: 100, y: 0 }, { pressure: 0.5, x: 120, y: 20 }],
      size: 1, tool: 'pen' as const,
    };
    const pushHistory = vi.fn();
    const setDragState = vi.fn();
    const setSelectedElementIds = vi.fn();
    const setSelectedStrokeIds = vi.fn();
    const { result } = renderHook(() => useWhiteboardStrokeSelection({
      elements: [element], pushHistory, selectedElementIds: [element.id], selectedStrokeIds: [stroke.id],
      setDragState, setSelectedElementIds, setSelectedStrokeIds,
      spatialIndex: createWhiteboardEraserSpatialIndex([element], [stroke]), strokes: [stroke], zoom: 1,
    }));

    act(() => result.current({ x: 70, y: 20 }, { shiftKey: false } as PointerEvent<HTMLDivElement>));

    expect(pushHistory).toHaveBeenCalledOnce();
    expect(setSelectedElementIds).not.toHaveBeenCalled();
    expect(setSelectedStrokeIds).not.toHaveBeenCalled();
    expect(setDragState).toHaveBeenCalledWith(expect.objectContaining({
      elementIds: [element.id], kind: 'move-elements', strokeIds: [stroke.id],
    }));
  });

  it('moves the full mixed selection when dragging an already selected stroke', () => {
    const element = { height: 80, id: 'image-1', text: 'one.png', type: 'image' as const, width: 100, x: 0, y: 0 };
    const stroke = {
      color: '#111111', id: 'stroke-1',
      points: [{ pressure: 0.5, x: 120, y: 0 }, { pressure: 0.5, x: 140, y: 20 }],
      size: 1, tool: 'pen' as const,
    };
    const setDragState = vi.fn();
    const setSelectedElementIds = vi.fn();
    const { result } = renderHook(() => useWhiteboardStrokeSelection({
      elements: [element], pushHistory: vi.fn(), selectedElementIds: [element.id], selectedStrokeIds: [stroke.id],
      setDragState, setSelectedElementIds, setSelectedStrokeIds: vi.fn(),
      spatialIndex: createWhiteboardEraserSpatialIndex([element], [stroke]), strokes: [stroke], zoom: 1,
    }));

    act(() => result.current({ x: 130, y: 10 }, { shiftKey: false } as PointerEvent<HTMLDivElement>));

    expect(setSelectedElementIds).not.toHaveBeenCalled();
    expect(setDragState).toHaveBeenCalledWith(expect.objectContaining({
      elementIds: [element.id], kind: 'move-elements', strokeIds: [stroke.id],
    }));
  });

  it('selects the topmost nearby stroke from spatial candidates', () => {
    const lower = {
      color: '#111111', id: 'lower',
      points: [{ pressure: 0.5, x: 0, y: 0 }, { pressure: 0.5, x: 100, y: 100 }],
      size: 1, tool: 'pen' as const,
    };
    const upper = {
      color: '#222222', id: 'upper',
      points: [{ pressure: 0.5, x: 0, y: 0 }, { pressure: 0.5, x: 100_000, y: 100_000 }],
      size: 1, tool: 'pen' as const,
    };
    const strokes = [lower, upper];
    const setSelectedStrokeIds = vi.fn();
    const { result } = renderHook(() => useWhiteboardStrokeSelection({
      elements: [], pushHistory: vi.fn(), selectedElementIds: [], selectedStrokeIds: [],
      setDragState: vi.fn(), setSelectedElementIds: vi.fn(), setSelectedStrokeIds,
      spatialIndex: createWhiteboardEraserSpatialIndex([], strokes), strokes, zoom: 1,
    }));

    act(() => result.current({ x: 20, y: 20 }, { shiftKey: false } as PointerEvent<HTMLDivElement>));

    expect(setSelectedStrokeIds).toHaveBeenCalledWith(['upper']);
  });

  it('does not scan all board items when there is no active selection', () => {
    const elements = Array.from({ length: 1000 }, (_, index) => ({
      height: 40, id: `image-${index}`, text: '', type: 'image' as const, width: 40,
      x: 10_000 + index * 60, y: 10_000,
    }));
    const strokes: never[] = [];
    const spatialIndex = createWhiteboardEraserSpatialIndex(elements, strokes);
    const elementScan = vi.spyOn(elements, 'flatMap');
    const { result } = renderHook(() => useWhiteboardStrokeSelection({
      elements, pushHistory: vi.fn(), selectedElementIds: [], selectedStrokeIds: [],
      setDragState: vi.fn(), setSelectedElementIds: vi.fn(), setSelectedStrokeIds: vi.fn(),
      spatialIndex, strokes, zoom: 1,
    }));

    act(() => result.current({ x: 20, y: 20 }, { shiftKey: false } as PointerEvent<HTMLDivElement>));

    expect(elementScan).not.toHaveBeenCalled();
  });
});
