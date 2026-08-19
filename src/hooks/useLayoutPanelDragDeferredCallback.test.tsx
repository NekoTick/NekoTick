import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useUIStore } from '@/stores/uiSlice';
import { useLayoutPanelDragDeferredCallback } from './useLayoutPanelDragDeferredCallback';

describe('useLayoutPanelDragDeferredCallback', () => {
  beforeEach(() => {
    useUIStore.setState({ layoutPanelDragging: false });
  });

  it('coalesces measurements during a layout drag and flushes once after it ends', () => {
    const callback = vi.fn();
    const { result } = renderHook(() => (
      useLayoutPanelDragDeferredCallback(callback, 'test-layout-work')
    ));

    act(() => useUIStore.getState().setLayoutPanelDragging(true));
    act(() => {
      result.current();
      result.current();
      result.current();
    });
    expect(callback).not.toHaveBeenCalled();

    act(() => useUIStore.getState().setLayoutPanelDragging(false));
    expect(callback).toHaveBeenCalledTimes(1);

    act(() => result.current());
    expect(callback).toHaveBeenCalledTimes(2);
  });
});
