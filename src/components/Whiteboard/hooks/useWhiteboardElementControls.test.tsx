import type { PointerEvent } from 'react';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createWhiteboardEraserSpatialIndex } from '../model/whiteboardEraser';
import { useWhiteboardElementControls } from './useWhiteboardElementControls';

describe('useWhiteboardElementControls', () => {
  it('selects one image and clears the stroke selection', () => {
    const setSelectedElementIds = vi.fn();
    const setSelectedStrokeIds = vi.fn();
    const { result } = renderHook(() => useWhiteboardElementControls({
      elements: [], getBoardPoint: vi.fn(), pushHistory: vi.fn(), selectedElementIds: [], selectedStrokeIds: ['stroke'],
      setDragState: vi.fn(), setElements: vi.fn(), setSelectedElementIds, setSelectedStrokeIds, setStrokes: vi.fn(), spacePressedRef: { current: false }, spatialIndex: createWhiteboardEraserSpatialIndex([], []), strokes: [], tool: 'select',
    }));

    act(() => result.current.selectElement('image'));

    expect(setSelectedElementIds).toHaveBeenCalledWith(['image']);
    expect(setSelectedStrokeIds).toHaveBeenCalledWith([]);
  });

  it('lets non-selection tools pass image input through to the canvas', () => {
    const stopPropagation = vi.fn();
    const { result } = renderHook(() => useWhiteboardElementControls({
      elements: [], getBoardPoint: vi.fn(), pushHistory: vi.fn(), selectedElementIds: [], selectedStrokeIds: [],
      setDragState: vi.fn(), setElements: vi.fn(), setSelectedElementIds: vi.fn(), setSelectedStrokeIds: vi.fn(), setStrokes: vi.fn(), spacePressedRef: { current: false }, spatialIndex: createWhiteboardEraserSpatialIndex([], []), strokes: [], tool: 'pen',
    }));

    act(() => result.current.handleElementPointerDown({ button: 0, stopPropagation } as unknown as PointerEvent<HTMLDivElement>, {
      height: 80, id: 'image', text: '', type: 'image', width: 160, x: 20, y: 40,
    }));

    expect(stopPropagation).not.toHaveBeenCalled();
  });

  it('lets space-dragging pass through selection interactions to pan the canvas', () => {
    const stopPropagation = vi.fn();
    const setDragState = vi.fn();
    const setPointerCapture = vi.fn();
    const { result } = renderHook(() => useWhiteboardElementControls({
      elements: [{ height: 80, id: 'image', text: '', type: 'image', width: 160, x: 20, y: 40 }],
      getBoardPoint: vi.fn(), pushHistory: vi.fn(), selectedElementIds: ['image'], selectedStrokeIds: [],
      setDragState, setElements: vi.fn(), setSelectedElementIds: vi.fn(), setSelectedStrokeIds: vi.fn(),
      setStrokes: vi.fn(), spacePressedRef: { current: true }, spatialIndex: createWhiteboardEraserSpatialIndex([], []), strokes: [], tool: 'select',
    }));
    const event = { button: 0, currentTarget: { setPointerCapture }, stopPropagation } as unknown as PointerEvent<SVGRectElement>;

    act(() => {
      result.current.handleElementPointerDown(event as unknown as PointerEvent<HTMLDivElement>, {
        height: 80, id: 'image', text: '', type: 'image', width: 160, x: 20, y: 40,
      });
      result.current.handleSelectionMovePointerDown(event);
      result.current.handleSelectionResizePointerDown(event, 'se');
    });

    expect(stopPropagation).not.toHaveBeenCalled();
    expect(setPointerCapture).not.toHaveBeenCalled();
    expect(setDragState).not.toHaveBeenCalled();
  });

  it('starts a mixed selection move from the overlay hit target', () => {
    const element = { height: 80, id: 'image', text: '', type: 'image' as const, width: 160, x: 20, y: 40 };
    const stroke = {
      color: '#111111', id: 'stroke', points: [{ pressure: 0.5, x: 200, y: 40 }],
      size: 1, tool: 'pen' as const,
    };
    const pushHistory = vi.fn();
    const setDragState = vi.fn();
    const stopPropagation = vi.fn();
    const setPointerCapture = vi.fn();
    const { result } = renderHook(() => useWhiteboardElementControls({
      elements: [element], getBoardPoint: vi.fn(() => ({ x: 25, y: 30 })), pushHistory,
      selectedElementIds: [element.id], selectedStrokeIds: [stroke.id], setDragState,
      setElements: vi.fn(), setSelectedElementIds: vi.fn(), setSelectedStrokeIds: vi.fn(),
      setStrokes: vi.fn(), spacePressedRef: { current: false }, spatialIndex: createWhiteboardEraserSpatialIndex([], []), strokes: [stroke], tool: 'select',
    }));

    act(() => result.current.handleSelectionMovePointerDown({
      button: 0, clientX: 250, clientY: 300, currentTarget: { setPointerCapture }, pointerId: 7, stopPropagation,
    } as unknown as PointerEvent<SVGRectElement>));

    expect(stopPropagation).toHaveBeenCalledOnce();
    expect(setPointerCapture).toHaveBeenCalledWith(7);
    expect(pushHistory).toHaveBeenCalledOnce();
    expect(setDragState).toHaveBeenCalledWith(expect.objectContaining({
      currentPoint: { x: 25, y: 30 }, elementIds: [element.id], kind: 'move-elements',
      startPoint: { x: 25, y: 30 }, strokeIds: [stroke.id],
    }));
  });

  it('starts a stroke-only move from a selected split segment', () => {
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
    const setDragState = vi.fn();
    const setPointerCapture = vi.fn();
    const { result } = renderHook(() => useWhiteboardElementControls({
      elements: [], getBoardPoint: vi.fn(() => ({ x: 50, y: 0 })), pushHistory: vi.fn(),
      selectedElementIds: [], selectedStrokeIds: [middle.id], setDragState, setElements: vi.fn(),
      setSelectedElementIds: vi.fn(), setSelectedStrokeIds: vi.fn(), setStrokes: vi.fn(),
      spacePressedRef: { current: false }, spatialIndex: createWhiteboardEraserSpatialIndex([], []), strokes, tool: 'select',
    }));

    act(() => result.current.handleSelectionMovePointerDown({
      button: 0, currentTarget: { setPointerCapture }, pointerId: 7, stopPropagation: vi.fn(),
    } as unknown as PointerEvent<SVGElement>));

    expect(setDragState).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'move-strokes', originalStrokesById: new Map([[middle.id, middle]]), strokeIds: [middle.id],
    }));
  });

  it('resolves a small selection from the spatial index on a large board', () => {
    const elements = Array.from({ length: 1000 }, (_, index) => ({
      height: 40, id: `image-${index}`, text: '', type: 'image' as const, width: 40, x: index * 60, y: 0,
    }));
    const strokes = Array.from({ length: 1000 }, (_, index) => ({
      color: '#111111', id: `stroke-${index}`,
      points: [{ pressure: 0.5, x: index * 60, y: 80 }], size: 1, tool: 'pen' as const,
    }));
    const spatialIndex = createWhiteboardEraserSpatialIndex(elements, strokes);
    const elementScan = vi.spyOn(elements, 'filter');
    const strokeScan = vi.spyOn(strokes, 'filter');
    const setDragState = vi.fn();
    const { result } = renderHook(() => useWhiteboardElementControls({
      elements, getBoardPoint: vi.fn(() => ({ x: 0, y: 0 })), pushHistory: vi.fn(),
      selectedElementIds: ['image-999'], selectedStrokeIds: ['stroke-999'], setDragState,
      setElements: vi.fn(), setSelectedElementIds: vi.fn(), setSelectedStrokeIds: vi.fn(), setStrokes: vi.fn(),
      spacePressedRef: { current: false }, spatialIndex, strokes, tool: 'select',
    }));

    act(() => result.current.handleSelectionMovePointerDown({
      button: 0, currentTarget: { setPointerCapture: vi.fn() }, pointerId: 1, stopPropagation: vi.fn(),
    } as unknown as PointerEvent<SVGElement>));

    expect(elementScan).not.toHaveBeenCalled();
    expect(strokeScan).not.toHaveBeenCalled();
    expect(setDragState).toHaveBeenCalledWith(expect.objectContaining({
      elementIds: ['image-999'], strokeIds: ['stroke-999'],
    }));
  });

  it('publishes resize bounds without rewriting document arrays during the drag', () => {
    let publishFrame: FrameRequestCallback | null = null;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      publishFrame = callback;
      return 1;
    });
    const stroke = {
      color: '#111111', id: 'stroke', points: [{ pressure: 0.5, x: 0, y: 0 }, { pressure: 0.5, x: 100, y: 100 }],
      size: 1, tool: 'pen' as const,
    };
    const setDragState = vi.fn();
    const setElements = vi.fn();
    const setStrokes = vi.fn();
    const { result } = renderHook(() => useWhiteboardElementControls({
      elements: [], getBoardPoint: vi.fn(), pushHistory: vi.fn(), selectedElementIds: [], selectedStrokeIds: [stroke.id],
      setDragState, setElements, setSelectedElementIds: vi.fn(), setSelectedStrokeIds: vi.fn(), setStrokes,
      spacePressedRef: { current: false }, spatialIndex: createWhiteboardEraserSpatialIndex([], [stroke]), strokes: [stroke], tool: 'select',
    }));
    const state = {
      bounds: { height: 100, width: 100, x: 0, y: 0 },
      currentBounds: { height: 100, width: 100, x: 0, y: 0 },
      handle: 'se' as const,
      kind: 'resize-selection' as const,
      originalElementsById: new Map(),
      originalStrokesById: new Map([[stroke.id, stroke]]),
      preserveAspectRatio: false,
      startPoint: { x: 100, y: 100 },
    };

    act(() => result.current.resizeSelection(state, { x: 150, y: 140 }));
    act(() => publishFrame?.(0));

    expect(setElements).not.toHaveBeenCalled();
    expect(setStrokes).not.toHaveBeenCalled();
    expect(setDragState).toHaveBeenCalledOnce();
  });

  it('preserves the aspect ratio when resizing one text element', () => {
    const text = {
      color: '#111111', fontSize: 24, height: 30, id: 'text', lineHeight: 1.25,
      text: 'Hello', type: 'text' as const, width: 80, x: 10, y: 20,
    };
    const setDragState = vi.fn();
    const { result } = renderHook(() => useWhiteboardElementControls({
      elements: [text], getBoardPoint: vi.fn(() => ({ x: 90, y: 50 })), pushHistory: vi.fn(),
      selectedElementIds: [text.id], selectedStrokeIds: [], setDragState, setElements: vi.fn(),
      setSelectedElementIds: vi.fn(), setSelectedStrokeIds: vi.fn(), setStrokes: vi.fn(),
      spacePressedRef: { current: false }, spatialIndex: createWhiteboardEraserSpatialIndex([text], []),
      strokes: [], tool: 'select',
    }));

    act(() => result.current.handleSelectionResizePointerDown({
      button: 0, clientX: 90, clientY: 50, currentTarget: { setPointerCapture: vi.fn() },
      pointerId: 1, shiftKey: false, stopPropagation: vi.fn(),
    } as unknown as PointerEvent<SVGRectElement>, 'se'));

    expect(setDragState).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'resize-selection', preserveAspectRatio: true,
    }));
  });

  it('preserves the aspect ratio when resizing one AutoDraw icon', () => {
    const icon = {
      autoDrawIcon: 'clock' as const, height: 80, id: 'icon', text: 'Clock',
      type: 'icon' as const, width: 80, x: 10, y: 20,
    };
    const setDragState = vi.fn();
    const { result } = renderHook(() => useWhiteboardElementControls({
      elements: [icon], getBoardPoint: vi.fn(() => ({ x: 90, y: 100 })), pushHistory: vi.fn(),
      selectedElementIds: [icon.id], selectedStrokeIds: [], setDragState, setElements: vi.fn(),
      setSelectedElementIds: vi.fn(), setSelectedStrokeIds: vi.fn(), setStrokes: vi.fn(),
      spacePressedRef: { current: false }, spatialIndex: createWhiteboardEraserSpatialIndex([icon], []),
      strokes: [], tool: 'select',
    }));

    act(() => result.current.handleSelectionResizePointerDown({
      button: 0, clientX: 90, clientY: 100, currentTarget: { setPointerCapture: vi.fn() },
      pointerId: 1, shiftKey: false, stopPropagation: vi.fn(),
    } as unknown as PointerEvent<SVGRectElement>, 'se'));

    expect(setDragState).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'resize-selection', preserveAspectRatio: true,
    }));
  });
});
