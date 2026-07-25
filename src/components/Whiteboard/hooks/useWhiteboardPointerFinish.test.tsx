import { act, renderHook } from '@testing-library/react';
import type { PointerEvent } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { createWhiteboardEraserSpatialIndex } from '../model/whiteboardEraser';
import { useWhiteboardPointerFinish } from './useWhiteboardPointerFinish';

describe('useWhiteboardPointerFinish', () => {
  it('cancels an erase gesture when the active pointer is cancelled', () => {
    const finishEraserGesture = vi.fn();
    const finishStrokeEraserGesture = vi.fn();
    const pushHistory = vi.fn();
    const { result } = renderHook(() => useWhiteboardPointerFinish({
      activePenPointerRef: { current: null as number | null }, clearDraftStroke: vi.fn(), deletePointer: vi.fn(), dragState: { kind: 'draw' }, elements: [],
      finishEraserGesture, finishStrokeEraserGesture, flushResizeDrags: vi.fn(),
      getBoardPoint: vi.fn(() => ({ x: 0, y: 0 })), getDraftStroke: vi.fn(() => null), pushHistory,
      setDragState: vi.fn(), setElements: vi.fn(), setSelectedElementIds: vi.fn(), setSelectedStrokeIds: vi.fn(), setStrokes: vi.fn(),
      spatialIndex: createWhiteboardEraserSpatialIndex([], []), strokeIdRef: { current: 1 }, strokes: [],
    }));

    act(() => result.current({ pointerId: 7, type: 'pointercancel' } as PointerEvent<HTMLDivElement>));
    expect(finishEraserGesture).toHaveBeenCalledWith(true);
    expect(finishStrokeEraserGesture).toHaveBeenCalledWith(true);
    expect(pushHistory).not.toHaveBeenCalled();
  });

  it('does not commit an unfinished stroke when the pointer is cancelled', () => {
    const pushHistory = vi.fn();
    const setStrokes = vi.fn();
    const { result } = renderHook(() => useWhiteboardPointerFinish({
      activePenPointerRef: { current: 7 as number | null }, clearDraftStroke: vi.fn(), deletePointer: vi.fn(), dragState: { kind: 'draw' }, elements: [],
      finishEraserGesture: vi.fn(), finishStrokeEraserGesture: vi.fn(), flushResizeDrags: vi.fn(),
      getBoardPoint: vi.fn(() => ({ x: 0, y: 0 })), getDraftStroke: vi.fn(() => ({
        color: '#111111', id: 'draft', points: [{ pressure: 0.5, x: 0, y: 0 }], size: 1, tool: 'pen' as const,
      })), pushHistory,
      setDragState: vi.fn(), setElements: vi.fn(), setSelectedElementIds: vi.fn(), setSelectedStrokeIds: vi.fn(), setStrokes,
      spatialIndex: createWhiteboardEraserSpatialIndex([], []), strokeIdRef: { current: 1 }, strokes: [],
    }));

    act(() => result.current({ pointerId: 7, type: 'pointercancel' } as PointerEvent<HTMLDivElement>));

    expect(pushHistory).not.toHaveBeenCalled();
    expect(setStrokes).not.toHaveBeenCalled();
  });

  it('keeps the last valid move position when pointer cancellation coordinates are invalid', () => {
    const element = { height: 10, id: 'image', text: '', type: 'image' as const, width: 10, x: 5, y: 5 };
    const setElements = vi.fn();
    const { result } = renderHook(() => useWhiteboardPointerFinish({
      activePenPointerRef: { current: null as number | null }, clearDraftStroke: vi.fn(), deletePointer: vi.fn(),
      dragState: {
        currentPoint: { x: 20, y: 30 }, elementIds: ['image'], kind: 'move-elements',
        originalElementsById: new Map([['image', element]]), originalStrokesById: new Map(),
        startPoint: { x: 0, y: 0 }, strokeIds: [],
      },
      elements: [element], finishEraserGesture: vi.fn(), finishStrokeEraserGesture: vi.fn(), flushResizeDrags: vi.fn(),
      getBoardPoint: vi.fn(() => ({ x: 999, y: 999 })), getDraftStroke: vi.fn(() => null), pushHistory: vi.fn(),
      setDragState: vi.fn(), setElements, setSelectedElementIds: vi.fn(), setSelectedStrokeIds: vi.fn(), setStrokes: vi.fn(),
      spatialIndex: createWhiteboardEraserSpatialIndex([element], []), strokeIdRef: { current: 1 }, strokes: [],
    }));

    act(() => result.current({ clientX: 999, clientY: 999, pointerId: 7, type: 'pointercancel' } as PointerEvent<HTMLDivElement>));

    const update = setElements.mock.calls[0][0] as (elements: typeof element[]) => typeof element[];
    expect(update([element])[0]).toMatchObject({ x: 25, y: 35 });
  });

  it('includes the pointer-up position when completing a lasso selection', () => {
    const setSelectedElementIds = vi.fn();
    const { result } = renderHook(() => useWhiteboardPointerFinish({
      activePenPointerRef: { current: null as number | null }, clearDraftStroke: vi.fn(), deletePointer: vi.fn(),
      dragState: { kind: 'lasso', points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }] },
      elements: [{ height: 10, id: 'image', text: '', type: 'image', width: 10, x: 10, y: 80 }],
      finishEraserGesture: vi.fn(), finishStrokeEraserGesture: vi.fn(), flushResizeDrags: vi.fn(),
      getBoardPoint: vi.fn(() => ({ x: 0, y: 100 })), getDraftStroke: vi.fn(() => null), pushHistory: vi.fn(),
      setDragState: vi.fn(), setElements: vi.fn(), setSelectedElementIds, setSelectedStrokeIds: vi.fn(), setStrokes: vi.fn(),
      spatialIndex: createWhiteboardEraserSpatialIndex(
        [{ height: 10, id: 'image', text: '', type: 'image', width: 10, x: 10, y: 80 }],
        [],
      ),
      strokeIdRef: { current: 1 }, strokes: [],
    }));

    act(() => result.current({ clientX: 0, clientY: 100, pointerId: 7, type: 'pointerup' } as PointerEvent<HTMLDivElement>));

    expect(setSelectedElementIds).toHaveBeenCalledWith(['image']);
  });

  it('limits lasso hit testing to nearby spatial candidates', () => {
    const nearby = {
      color: '#111111', id: 'nearby',
      points: [{ pressure: 0.5, x: 20, y: 20 }, { pressure: 0.5, x: 80, y: 80 }],
      size: 1, tool: 'pen' as const,
    };
    const distant = Array.from({ length: 1000 }, (_, index) => ({
      color: '#111111', id: `distant-${index}`,
      points: [{ pressure: 0.5, x: 10_000 + index * 100, y: 10_000 }],
      size: 1, tool: 'pen' as const,
    }));
    const strokes = [nearby, ...distant];
    const sourceFlatMap = vi.spyOn(strokes, 'flatMap');
    const setSelectedStrokeIds = vi.fn();
    const { result } = renderHook(() => useWhiteboardPointerFinish({
      activePenPointerRef: { current: null as number | null }, clearDraftStroke: vi.fn(), deletePointer: vi.fn(),
      dragState: { kind: 'lasso', points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }] },
      elements: [], finishEraserGesture: vi.fn(), finishStrokeEraserGesture: vi.fn(), flushResizeDrags: vi.fn(),
      getBoardPoint: vi.fn(() => ({ x: 0, y: 100 })), getDraftStroke: vi.fn(() => null), pushHistory: vi.fn(),
      setDragState: vi.fn(), setElements: vi.fn(), setSelectedElementIds: vi.fn(), setSelectedStrokeIds, setStrokes: vi.fn(),
      spatialIndex: createWhiteboardEraserSpatialIndex([], strokes), strokeIdRef: { current: 1 }, strokes,
    }));

    act(() => result.current({ clientX: 0, clientY: 100, pointerId: 7, type: 'pointerup' } as PointerEvent<HTMLDivElement>));

    expect(setSelectedStrokeIds).toHaveBeenCalledWith(['nearby']);
    expect(sourceFlatMap).not.toHaveBeenCalled();
  });

  it('commits movement for the selected middle segment of a split stroke', () => {
    const lower = {
      color: '#111111', id: 'stroke', points: [{ pressure: 0.5, x: 0, y: 0 }, { pressure: 0.5, x: 20, y: 0 }],
      size: 1, tool: 'pen' as const,
    };
    const middle = {
      color: '#111111', id: 'stroke-part-2', points: [{ pressure: 0.5, x: 40, y: 0 }, { pressure: 0.5, x: 60, y: 0 }],
      size: 1, tool: 'pen' as const,
    };
    const upper = {
      color: '#111111', id: 'stroke-part-3', points: [{ pressure: 0.5, x: 80, y: 0 }, { pressure: 0.5, x: 100, y: 0 }],
      size: 1, tool: 'pen' as const,
    };
    const strokes = [lower, middle, upper];
    const setStrokes = vi.fn();
    const { result } = renderHook(() => useWhiteboardPointerFinish({
      activePenPointerRef: { current: null as number | null }, clearDraftStroke: vi.fn(), deletePointer: vi.fn(),
      dragState: {
        currentPoint: { x: 0, y: 0 }, kind: 'move-strokes',
        originalStrokesById: new Map([[middle.id, middle]]), startPoint: { x: 0, y: 0 }, strokeIds: [middle.id],
      },
      elements: [], finishEraserGesture: vi.fn(), finishStrokeEraserGesture: vi.fn(), flushResizeDrags: vi.fn(),
      getBoardPoint: vi.fn(() => ({ x: 15, y: 5 })), getDraftStroke: vi.fn(() => null), pushHistory: vi.fn(),
      setDragState: vi.fn(), setElements: vi.fn(), setSelectedElementIds: vi.fn(), setSelectedStrokeIds: vi.fn(), setStrokes,
      spatialIndex: createWhiteboardEraserSpatialIndex([], strokes), strokeIdRef: { current: 1 }, strokes,
    }));

    act(() => result.current({ clientX: 15, clientY: 5, pointerId: 7, type: 'pointerup' } as PointerEvent<HTMLDivElement>));

    const update = setStrokes.mock.calls[0][0] as (current: typeof strokes) => typeof strokes;
    const translated = update(strokes);
    expect(translated[0]).toBe(lower);
    expect(translated[1].points).toEqual([
      { pressure: 0.5, x: 55, y: 5 }, { pressure: 0.5, x: 75, y: 5 },
    ]);
    expect(translated[2]).toBe(upper);
  });
});
