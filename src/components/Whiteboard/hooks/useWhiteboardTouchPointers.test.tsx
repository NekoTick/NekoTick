import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useWhiteboardTouchPointers } from './useWhiteboardTouchPointers';

describe('useWhiteboardTouchPointers', () => {
  it('ignores hover movement until the pointer is registered by pointer down', () => {
    const getViewportPoint = vi.fn((x: number, y: number) => ({ x, y }));
    const { result } = renderHook(() => useWhiteboardTouchPointers(getViewportPoint));

    act(() => {
      expect(result.current.updatePointer(1, 10, 20)).toBeNull();
    });

    expect(getViewportPoint).not.toHaveBeenCalled();
    expect(result.current.getPinchMetrics()).toBeNull();
  });

  it('updates registered pointers and removes them after pointer up', () => {
    const { result } = renderHook(() => useWhiteboardTouchPointers((x, y) => ({ x, y })));

    act(() => {
      result.current.addPointer(1, 0, 0);
      result.current.addPointer(2, 20, 0);
      result.current.updatePointer(2, 40, 0);
    });
    expect(result.current.getPinchMetrics()).toEqual({ center: { x: 20, y: 0 }, distance: 40 });

    act(() => result.current.deletePointer(1));
    expect(result.current.getPinchMetrics()).toBeNull();
  });
});
