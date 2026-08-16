import { act, renderHook } from '@testing-library/react';
import type { PointerEvent } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { WhiteboardDragState } from '@/components/Whiteboard/model/interaction/whiteboardInteractions';
import type { WhiteboardStroke } from '@/components/Whiteboard/model/core/whiteboardModel';
import { useWhiteboardLinearPointControls } from './useWhiteboardLinearPointControls';

describe('useWhiteboardLinearPointControls', () => {
  it('adds a midpoint only after the Excalidraw drag threshold', () => {
    const stroke: WhiteboardStroke = {
      color: '#111111', id: 'line-1',
      points: [{ pressure: 0.5, x: 0, y: 0 }, { pressure: 0.5, x: 100, y: 0 }],
      size: 1, tool: 'line',
    };
    const pushHistory = vi.fn();
    const setDragState = vi.fn();
    const setStrokes = vi.fn();
    const { result } = renderHook(() => useWhiteboardLinearPointControls({
      getBoardPoint: (x, y) => ({ x, y }), pushHistory, setDragState, setStrokes,
      strokes: [stroke], tool: 'select', viewportZoom: 1,
    }));

    act(() => result.current.handleLinearPointPointerDown({
      button: 0, clientX: 50, clientY: 0, currentTarget: { setPointerCapture: vi.fn() },
      pointerId: 1, stopPropagation: vi.fn(),
    } as unknown as PointerEvent<SVGCircleElement>, stroke.id, 0, true));
    const state = setDragState.mock.calls[0][0] as Extract<WhiteboardDragState, { kind: 'edit-linear-point' }>;

    act(() => result.current.updateLinearPoint(state, { x: 59, y: 0 }, false));
    expect(pushHistory).not.toHaveBeenCalled();
    expect(setStrokes).not.toHaveBeenCalled();

    act(() => result.current.updateLinearPoint(state, { x: 61, y: 20 }, false));
    const update = setStrokes.mock.calls[0][0] as (strokes: WhiteboardStroke[]) => WhiteboardStroke[];
    expect(pushHistory).toHaveBeenCalledOnce();
    expect(update([stroke])[0].points.map(({ x, y }) => ({ x, y }))).toEqual([
      { x: 0, y: 0 }, { x: 61, y: 20 }, { x: 100, y: 0 },
    ]);
  });
});
