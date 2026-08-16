import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { PointerEvent } from 'react';
import {
  WHITEBOARD_DEFAULT_BRUSH_COLORS,
  WHITEBOARD_DEFAULT_BRUSH_SIZES,
} from '@/components/Whiteboard/model/core/whiteboardModel';
import { useWhiteboardPointerActions } from './useWhiteboardPointerActions';

type PointerActionOptions = Parameters<typeof useWhiteboardPointerActions>[0];

describe('useWhiteboardPointerActions drawing performance', () => {
  it('creates a Shift-constrained linear draft from the pointer-down origin', () => {
    const options = createOptions(() => ({ left: 0, top: 0 } as DOMRect));
    options.tool = 'arrow';
    const { rerender, result } = renderHook(() => useWhiteboardPointerActions(options));

    act(() => result.current.handleViewportPointerDown(createPointerEvent('mouse', 10, 20)));
    options.dragState = { kind: 'draw-linear', startPoint: { x: 10, y: 20 } };
    rerender();
    act(() => result.current.handlePointerMove({ ...createPointerEvent('mouse', 110, 40), shiftKey: true }));

    expect(options.setDraftStroke).toHaveBeenLastCalledWith(expect.objectContaining({
      id: 'wb-stroke-1', tool: 'arrow', points: [
        expect.objectContaining({ x: 10, y: 20 }),
        expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }),
      ],
    }));
    const stroke = options.setDraftStroke.mock.calls.at(-1)?.[0];
    expect(Math.atan2(stroke.points[1].y - 20, stroke.points[1].x - 10) * 180 / Math.PI).toBeCloseTo(15);
  });
  it('keeps touch panning as the default brush interaction', () => {
    const options = createOptions(() => ({ left: 0, top: 0 } as DOMRect));
    const { result } = renderHook(() => useWhiteboardPointerActions(options));

    act(() => result.current.handleViewportPointerDown(createPointerEvent('touch', 30, 40)));

    expect(options.setDragState).toHaveBeenCalledWith(expect.objectContaining({ kind: 'pan' }));
    expect(options.setDraftStroke).not.toHaveBeenCalled();
  });

  it('draws brush strokes with touch when the presentation enables it', () => {
    const options = createOptions(() => ({ left: 0, top: 0 } as DOMRect));
    options.drawWithTouch = true;
    const { result } = renderHook(() => useWhiteboardPointerActions(options));

    act(() => result.current.handleViewportPointerDown(createPointerEvent('touch', 30, 40)));

    expect(options.setDraftStroke).toHaveBeenCalledWith(expect.objectContaining({ tool: 'pen' }));
    expect(options.setDragState).toHaveBeenCalledWith({ kind: 'draw' });
    expect(options.scheduleViewport).not.toHaveBeenCalled();
  });

  it('starts auto shape input as a pen preview', () => {
    const options = createOptions(() => ({ left: 0, top: 0 } as DOMRect));
    options.tool = 'autoshape';
    const { result } = renderHook(() => useWhiteboardPointerActions(options));

    act(() => result.current.handleViewportPointerDown(createPointerEvent('mouse', 30, 40)));

    expect(options.setDraftStroke).toHaveBeenCalledWith(expect.objectContaining({ tool: 'pen' }));
    expect(options.setDragState).toHaveBeenCalledWith({ kind: 'draw-autoshape' });
  });

  it('starts in-place text editing at the board pointer', () => {
    const options = createOptions(() => ({ left: 10, top: 20 } as DOMRect));
    options.tool = 'text';
    const event = createPointerEvent('mouse', 40, 70);
    const { result } = renderHook(() => useWhiteboardPointerActions(options));

    act(() => result.current.handleViewportPointerDown(event));

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(options.startTextEditing).toHaveBeenCalledWith({ x: 30, y: 50 }, WHITEBOARD_DEFAULT_BRUSH_COLORS.pen);
    expect(options.setDraftStroke).not.toHaveBeenCalled();
  });

  it('reuses the pointer-down bounds and skips touch tracking for pen drawing', () => {
    const rect = { bottom: 500, height: 500, left: 10, right: 510, toJSON: vi.fn(), top: 20, width: 500, x: 10, y: 20 };
    const getBoundingClientRect = vi.fn(() => rect as DOMRect);
    const options = createOptions(getBoundingClientRect);
    const { rerender, result } = renderHook(() => useWhiteboardPointerActions(options));

    act(() => result.current.handleViewportPointerDown(createPointerEvent('pen', 30, 40)));
    options.dragState = { kind: 'draw' };
    rerender();
    act(() => result.current.handlePointerMove(createPointerEvent('pen', 50, 60)));

    expect(getBoundingClientRect).toHaveBeenCalledTimes(1);
    expect(options.addPointer).not.toHaveBeenCalled();
    expect(options.updatePointer).not.toHaveBeenCalled();
    expect(options.appendDraftPoints).toHaveBeenCalledOnce();
  });

  it('reuses the pointer bounds while the brush cursor moves over an idle board', () => {
    const getBoundingClientRect = vi.fn(() => ({ left: 10, top: 20 } as DOMRect));
    const options = createOptions(getBoundingClientRect);
    const { result } = renderHook(() => useWhiteboardPointerActions(options));

    act(() => {
      result.current.handlePointerMove(createPointerEvent('mouse', 50, 60));
      result.current.handlePointerMove(createPointerEvent('mouse', 70, 80));
    });

    expect(getBoundingClientRect).toHaveBeenCalledOnce();
  });

  it('routes the final eraser position through its erase gesture', () => {
    const getBoundingClientRect = vi.fn(() => ({ left: 10, top: 20 } as DOMRect));
    const options = createOptions(getBoundingClientRect);
    options.dragState = { kind: 'draw' };
    options.tool = 'eraser';
    const { result } = renderHook(() => useWhiteboardPointerActions(options));

    act(() => result.current.handlePointerMove(createPointerEvent('mouse', 50, 60)));

    expect(options.eraserActions.update).toHaveBeenCalledWith([{ point: { x: 40, y: 40 }, size: 1 }]);
  });
});

function createOptions(getBoundingClientRect: () => DOMRect): PointerActionOptions {
  return {
    activePenPointerRef: { current: null },
    addPointer: vi.fn(() => ({ x: 0, y: 0 })),
    appendDraftPoints: vi.fn(),
    brushColors: WHITEBOARD_DEFAULT_BRUSH_COLORS,
    brushSizes: WHITEBOARD_DEFAULT_BRUSH_SIZES,
    clearDraftStroke: vi.fn(),
    dragState: null,
    eraserActions: { begin: vi.fn(), update: vi.fn() },
    getBoardPointFromRect: vi.fn((clientX, clientY, rect) => ({ x: clientX - rect.left, y: clientY - rect.top })),
    getPinchMetrics: vi.fn(() => null),
    resizeSelection: vi.fn(),
    scheduleViewport: vi.fn(),
    setBrushCursorPoint: vi.fn(),
    setDragState: vi.fn(),
    setDraftStroke: vi.fn(),
    setSelectedElementId: vi.fn(),
    setSelectedStrokeIds: vi.fn(),
    spacePressedRef: { current: false },
    startStrokeSelection: vi.fn(),
    startTextEditing: vi.fn(),
    strokeIdRef: { current: 1 },
    tool: 'pen',
    updateLinearPoint: vi.fn(),
    updateSelectionRotation: vi.fn(),
    updatePointer: vi.fn(() => null),
    viewport: { x: 0, y: 0, zoom: 1 },
    viewportRef: { current: { getBoundingClientRect } as HTMLDivElement },
  };
}

function createPointerEvent(pointerType: string, clientX: number, clientY: number): PointerEvent<HTMLDivElement> {
  const nativeEvent = {
    clientX,
    clientY,
    getCoalescedEvents: () => [nativeEvent],
    pointerType,
    pressure: 0.5,
    timeStamp: 1,
  };
  return {
    button: 0,
    clientX,
    clientY,
    currentTarget: { setPointerCapture: vi.fn() },
    nativeEvent,
    pointerId: 7,
    pointerType,
    preventDefault: vi.fn(),
  } as unknown as PointerEvent<HTMLDivElement>;
}
