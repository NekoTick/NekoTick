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

  it('preserves the draft stroke ID when the state update is deferred', () => {
    const draft = {
      color: '#ef4444', id: 'wb-stroke-1',
      points: [{ pressure: 0.5, x: 0, y: 0 }, { pressure: 0.6, x: 20, y: 10 }],
      size: 1, tool: 'crayon' as const,
    };
    const setStrokes = vi.fn();
    const strokeIdRef = { current: 1 };
    const { result } = renderHook(() => useWhiteboardPointerFinish({
      activePenPointerRef: { current: 7 as number | null }, clearDraftStroke: vi.fn(), deletePointer: vi.fn(), dragState: { kind: 'draw' }, elements: [],
      finishEraserGesture: vi.fn(), finishStrokeEraserGesture: vi.fn(), flushResizeDrags: vi.fn(),
      getBoardPoint: vi.fn(() => ({ x: 0, y: 0 })), getDraftStroke: vi.fn(() => draft), pushHistory: vi.fn(),
      setDragState: vi.fn(), setElements: vi.fn(), setSelectedElementIds: vi.fn(), setSelectedStrokeIds: vi.fn(), setStrokes,
      spatialIndex: createWhiteboardEraserSpatialIndex([], []), strokeIdRef, strokes: [],
    }));

    act(() => result.current({ pointerId: 7, type: 'pointerup' } as PointerEvent<HTMLDivElement>));

    expect(strokeIdRef.current).toBe(2);
    const update = setStrokes.mock.calls[0][0] as (strokes: typeof draft[]) => typeof draft[];
    expect(update([])[0].id).toBe(draft.id);
  });

  it('applies the pointer-up sample before committing a stroke', () => {
    const draft = {
      color: '#111111', id: 'draft',
      points: [{ pressure: 0.5, x: 0, y: 0 }], size: 1, tool: 'pen' as const,
    };
    const applyFinalDrawSample = vi.fn(() => {
      draft.points.push({ pressure: 0.5, x: 20, y: 10 });
    });
    const setStrokes = vi.fn();
    const { result } = renderHook(() => useWhiteboardPointerFinish({
      activePenPointerRef: { current: null as number | null }, applyFinalDrawSample,
      clearDraftStroke: vi.fn(), deletePointer: vi.fn(), dragState: { kind: 'draw' }, elements: [],
      finishEraserGesture: vi.fn(), finishStrokeEraserGesture: vi.fn(), flushResizeDrags: vi.fn(),
      getBoardPoint: vi.fn(() => ({ x: 20, y: 10 })), getDraftStroke: vi.fn(() => draft), pushHistory: vi.fn(),
      setDragState: vi.fn(), setElements: vi.fn(), setSelectedElementIds: vi.fn(), setSelectedStrokeIds: vi.fn(), setStrokes,
      spatialIndex: createWhiteboardEraserSpatialIndex([], []), strokeIdRef: { current: 1 }, strokes: [],
    }));

    act(() => result.current({ clientX: 20, clientY: 10, pointerId: 7, type: 'pointerup' } as PointerEvent<HTMLDivElement>));

    expect(applyFinalDrawSample).toHaveBeenCalledOnce();
    const update = setStrokes.mock.calls[0][0] as (strokes: typeof draft[]) => typeof draft[];
    expect(update([])[0].points.at(-1)).toMatchObject({ x: 20, y: 10 });
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

  it('selects an image on a click after starting a lasso gesture', () => {
    const element = { height: 100, id: 'image', text: '', type: 'image' as const, width: 100, x: 0, y: 0 };
    const setSelectedElementIds = vi.fn();
    const { result } = renderHook(() => useWhiteboardPointerFinish({
      activePenPointerRef: { current: null }, clearDraftStroke: vi.fn(), deletePointer: vi.fn(),
      dragState: { kind: 'lasso', points: [{ x: 40, y: 40 }] }, elements: [element],
      finishEraserGesture: vi.fn(), finishStrokeEraserGesture: vi.fn(), flushResizeDrags: vi.fn(),
      getBoardPoint: vi.fn(() => ({ x: 40, y: 40 })), getDraftStroke: vi.fn(() => null), pushHistory: vi.fn(),
      setDragState: vi.fn(), setElements: vi.fn(), setSelectedElementIds, setSelectedStrokeIds: vi.fn(), setStrokes: vi.fn(),
      spatialIndex: createWhiteboardEraserSpatialIndex([element], []), strokeIdRef: { current: 1 }, strokes: [],
    }));

    act(() => result.current({ clientX: 40, clientY: 40, pointerId: 7, type: 'pointerup' } as PointerEvent<HTMLDivElement>));

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

  it('updates a small stroke selection by index instead of scanning every stroke', () => {
    const strokes = Array.from({ length: 1000 }, (_, index) => ({
      color: '#111111', id: `stroke-${index}`,
      points: [{ pressure: 0.5, x: index * 100, y: 0 }], size: 1, tool: 'pen' as const,
    }));
    const selected = new Map([[strokes[500].id, strokes[500]]]);
    const lookup = vi.spyOn(selected, 'get');
    const setStrokes = vi.fn();
    const spatialIndex = createWhiteboardEraserSpatialIndex([], strokes);
    const { result } = renderHook(() => useWhiteboardPointerFinish({
      activePenPointerRef: { current: null as number | null }, clearDraftStroke: vi.fn(), deletePointer: vi.fn(),
      dragState: {
        currentPoint: { x: 0, y: 0 }, kind: 'move-strokes', originalStrokesById: selected,
        startPoint: { x: 0, y: 0 }, strokeIds: [strokes[500].id],
      },
      elements: [], finishEraserGesture: vi.fn(), finishStrokeEraserGesture: vi.fn(), flushResizeDrags: vi.fn(),
      getBoardPoint: vi.fn(() => ({ x: 15, y: 5 })), getDraftStroke: vi.fn(() => null), pushHistory: vi.fn(),
      setDragState: vi.fn(), setElements: vi.fn(), setSelectedElementIds: vi.fn(), setSelectedStrokeIds: vi.fn(), setStrokes,
      spatialIndex, strokeIdRef: { current: 1 }, strokes,
    }));

    act(() => result.current({ clientX: 15, clientY: 5, pointerId: 7, type: 'pointerup' } as PointerEvent<HTMLDivElement>));
    const update = setStrokes.mock.calls[0][0] as (current: typeof strokes) => typeof strokes;
    const translated = update(strokes);

    expect(lookup).not.toHaveBeenCalled();
    expect(translated[499]).toBe(strokes[499]);
    expect(translated[500].points[0]).toMatchObject({ x: 50_015, y: 5 });
    expect(translated[501]).toBe(strokes[501]);
  });

  it('keeps the move preview while a large move is prepared asynchronously', () => {
    const stroke = {
      color: '#111111', id: 'stroke', points: [{ pressure: 0.5, x: 0, y: 0 }], size: 1, tool: 'pen' as const,
    };
    const dragState = {
      currentPoint: { x: 0, y: 0 }, kind: 'move-strokes' as const,
      originalStrokesById: new Map([[stroke.id, stroke]]), startPoint: { x: 0, y: 0 }, strokeIds: [stroke.id],
    };
    const prepareMoveCommit = vi.fn(() => true);
    const setDragState = vi.fn();
    const setStrokes = vi.fn();
    const { result } = renderHook(() => useWhiteboardPointerFinish({
      activePenPointerRef: { current: null as number | null }, clearDraftStroke: vi.fn(), deletePointer: vi.fn(),
      dragState, elements: [], finishEraserGesture: vi.fn(), finishStrokeEraserGesture: vi.fn(), flushResizeDrags: vi.fn(),
      getBoardPoint: vi.fn(() => ({ x: 15, y: 5 })), getDraftStroke: vi.fn(() => null), prepareMoveCommit,
      pushHistory: vi.fn(), setDragState, setElements: vi.fn(), setSelectedElementIds: vi.fn(), setSelectedStrokeIds: vi.fn(),
      setStrokes, spatialIndex: createWhiteboardEraserSpatialIndex([], [stroke]), strokeIdRef: { current: 1 }, strokes: [stroke],
    }));

    act(() => result.current({ clientX: 15, clientY: 5, pointerId: 7, type: 'pointerup' } as PointerEvent<HTMLDivElement>));

    expect(prepareMoveCommit).toHaveBeenCalledWith(dragState, { x: 15, y: 5 });
    expect(setStrokes).not.toHaveBeenCalled();
    expect(setDragState).not.toHaveBeenCalled();
  });

  it('commits a selection resize once at the final pointer position', () => {
    const stroke = {
      color: '#111111', id: 'stroke', points: [{ pressure: 0.5, x: 0, y: 0 }, { pressure: 0.5, x: 100, y: 100 }],
      size: 1, tool: 'pen' as const,
    };
    const setElements = vi.fn();
    const setStrokes = vi.fn();
    const { result } = renderHook(() => useWhiteboardPointerFinish({
      activePenPointerRef: { current: null as number | null }, clearDraftStroke: vi.fn(), deletePointer: vi.fn(),
      dragState: {
        bounds: { height: 100, width: 100, x: 0, y: 0 },
        currentBounds: { height: 140, width: 140, x: 0, y: 0 },
        handle: 'se', kind: 'resize-selection', originalElementsById: new Map(),
        originalStrokesById: new Map([[stroke.id, stroke]]), preserveAspectRatio: false,
        startPoint: { x: 100, y: 100 },
      },
      elements: [], finishEraserGesture: vi.fn(), finishStrokeEraserGesture: vi.fn(), flushResizeDrags: vi.fn(),
      getBoardPoint: vi.fn(() => ({ x: 150, y: 160 })), getDraftStroke: vi.fn(() => null), pushHistory: vi.fn(),
      setDragState: vi.fn(), setElements, setSelectedElementIds: vi.fn(), setSelectedStrokeIds: vi.fn(), setStrokes,
      spatialIndex: createWhiteboardEraserSpatialIndex([], [stroke]), strokeIdRef: { current: 1 }, strokes: [stroke],
    }));

    act(() => result.current({ clientX: 150, clientY: 160, pointerId: 7, type: 'pointerup' } as PointerEvent<HTMLDivElement>));

    const update = setStrokes.mock.calls[0][0] as (current: typeof stroke[]) => typeof stroke[];
    expect(update([stroke])[0].points.at(-1)).toMatchObject({ x: 150, y: 160 });
    expect(setElements).not.toHaveBeenCalled();
  });

  it('does not replace strokes when resizing only an element', () => {
    const element = { height: 100, id: 'image', text: '', type: 'image' as const, width: 100, x: 0, y: 0 };
    const setElements = vi.fn();
    const setStrokes = vi.fn();
    const { result } = renderHook(() => useWhiteboardPointerFinish({
      activePenPointerRef: { current: null as number | null }, clearDraftStroke: vi.fn(), deletePointer: vi.fn(),
      dragState: {
        bounds: { height: 100, width: 100, x: 0, y: 0 },
        currentBounds: { height: 140, width: 140, x: 0, y: 0 },
        handle: 'se', kind: 'resize-selection', originalElementsById: new Map([[element.id, element]]),
        originalStrokesById: new Map(), preserveAspectRatio: false, startPoint: { x: 100, y: 100 },
      },
      elements: [element], finishEraserGesture: vi.fn(), finishStrokeEraserGesture: vi.fn(), flushResizeDrags: vi.fn(),
      getBoardPoint: vi.fn(() => ({ x: 150, y: 160 })), getDraftStroke: vi.fn(() => null), pushHistory: vi.fn(),
      setDragState: vi.fn(), setElements, setSelectedElementIds: vi.fn(), setSelectedStrokeIds: vi.fn(), setStrokes,
      spatialIndex: createWhiteboardEraserSpatialIndex([element], []), strokeIdRef: { current: 1 }, strokes: [],
    }));

    act(() => result.current({ clientX: 150, clientY: 160, pointerId: 7, type: 'pointerup' } as PointerEvent<HTMLDivElement>));

    const update = setElements.mock.calls[0][0] as (current: typeof element[]) => typeof element[];
    expect(update([element])[0]).toMatchObject({ height: 160, width: 150 });
    expect(setStrokes).not.toHaveBeenCalled();
  });

  it('does not commit a selection resize when the pointer is cancelled', () => {
    const stroke = {
      color: '#111111', id: 'stroke', points: [{ pressure: 0.5, x: 0, y: 0 }, { pressure: 0.5, x: 100, y: 100 }],
      size: 1, tool: 'pen' as const,
    };
    const pushHistory = vi.fn();
    const setElements = vi.fn();
    const setStrokes = vi.fn();
    const { result } = renderHook(() => useWhiteboardPointerFinish({
      activePenPointerRef: { current: null as number | null }, clearDraftStroke: vi.fn(), deletePointer: vi.fn(),
      dragState: {
        bounds: { height: 100, width: 100, x: 0, y: 0 },
        currentBounds: { height: 140, width: 140, x: 0, y: 0 },
        handle: 'se', kind: 'resize-selection', originalElementsById: new Map(),
        originalStrokesById: new Map([[stroke.id, stroke]]), preserveAspectRatio: false,
        startPoint: { x: 100, y: 100 },
      },
      elements: [], finishEraserGesture: vi.fn(), finishStrokeEraserGesture: vi.fn(), flushResizeDrags: vi.fn(),
      getBoardPoint: vi.fn(() => ({ x: 150, y: 160 })), getDraftStroke: vi.fn(() => null), pushHistory,
      setDragState: vi.fn(), setElements, setSelectedElementIds: vi.fn(), setSelectedStrokeIds: vi.fn(), setStrokes,
      spatialIndex: createWhiteboardEraserSpatialIndex([], [stroke]), strokeIdRef: { current: 1 }, strokes: [stroke],
    }));

    act(() => result.current({ clientX: 150, clientY: 160, pointerId: 7, type: 'pointercancel' } as PointerEvent<HTMLDivElement>));

    expect(pushHistory).not.toHaveBeenCalled();
    expect(setElements).not.toHaveBeenCalled();
    expect(setStrokes).not.toHaveBeenCalled();
  });
});
