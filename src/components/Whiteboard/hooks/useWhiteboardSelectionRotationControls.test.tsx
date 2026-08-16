import { act, renderHook } from '@testing-library/react';
import type { PointerEvent } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { createWhiteboardEraserSpatialIndex } from '@/components/Whiteboard/model/interaction/whiteboardEraser';
import type { WhiteboardDragState } from '@/components/Whiteboard/model/interaction/whiteboardInteractions';
import { useWhiteboardSelectionRotationControls } from './useWhiteboardSelectionRotationControls';

describe('useWhiteboardSelectionRotationControls', () => {
  it('starts one shared rotation and publishes pointer moves once per frame', () => {
    let frame: FrameRequestCallback | null = null;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frame = callback;
      return 1;
    });
    const element = { height: 20, id: 'image', text: '', type: 'image' as const, width: 40, x: 80, y: 40 };
    const stroke = {
      color: '#111111', id: 'stroke', points: [{ pressure: 0.5, x: 50, y: 0 }], size: 1, tool: 'pen' as const,
    };
    const setDragState = vi.fn();
    const pushHistory = vi.fn();
    const { result } = renderHook(() => useWhiteboardSelectionRotationControls({
      elements: [element], getBoardPoint: (x, y) => ({ x, y }), pushHistory,
      selectedElementIds: [element.id], selectedStrokeIds: [stroke.id], setDragState,
      spacePressedRef: { current: false }, spatialIndex: createWhiteboardEraserSpatialIndex([element], [stroke]),
      strokes: [stroke], tool: 'select',
    }));

    act(() => result.current.handleSelectionRotationPointerDown({
      button: 0, clientX: 50, clientY: 0, currentTarget: { setPointerCapture: vi.fn() },
      pointerId: 7, stopPropagation: vi.fn(),
    } as unknown as PointerEvent<SVGCircleElement>, { x: 50, y: 50 }));
    const state = setDragState.mock.calls[0][0] as Extract<WhiteboardDragState, { kind: 'rotate-selection' }>;

    act(() => result.current.updateSelectionRotation(state, { x: 100, y: 50 }));
    expect(setDragState).toHaveBeenCalledOnce();
    act(() => frame?.(0));

    expect(pushHistory).toHaveBeenCalledOnce();
    expect(state.originalElementsById.get(element.id)).toBe(element);
    expect(state.originalStrokesById.get(stroke.id)).toBe(stroke);
    expect(setDragState).toHaveBeenCalledTimes(2);
  });
});
