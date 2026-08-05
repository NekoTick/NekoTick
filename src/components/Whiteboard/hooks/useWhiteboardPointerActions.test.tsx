import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { PointerEvent } from 'react';
import {
  WHITEBOARD_DEFAULT_BRUSH_COLORS,
  WHITEBOARD_DEFAULT_BRUSH_SIZES,
} from '../model/whiteboardModel';
import { useWhiteboardPointerActions } from './useWhiteboardPointerActions';

type PointerActionOptions = Parameters<typeof useWhiteboardPointerActions>[0];

describe('useWhiteboardPointerActions drawing performance', () => {
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
    strokeEraserActions: { begin: vi.fn(), update: vi.fn() },
    strokeIdRef: { current: 1 },
    tool: 'pen',
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
  } as unknown as PointerEvent<HTMLDivElement>;
}
