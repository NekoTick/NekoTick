import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useWindowDragGesture } from './useWindowDragGesture';

describe('useWindowDragGesture', () => {
  it('clears tracking when movement reports that the mouse button was released', () => {
    const onReleaseWithoutDrag = vi.fn();
    const { result } = renderHook(() => useWindowDragGesture());

    act(() => {
      result.current.beginWindowDragTracking(
        { x: 10, y: 10 },
        { onReleaseWithoutDrag },
      );
    });
    expect(result.current.isWindowDragActive()).toBe(true);

    act(() => {
      window.dispatchEvent(new MouseEvent('mousemove', {
        buttons: 0,
        clientX: 80,
        clientY: 80,
      }));
    });

    expect(result.current.isWindowDragActive()).toBe(false);
    expect(onReleaseWithoutDrag).not.toHaveBeenCalled();
  });

  it('clears tracking when the window loses focus', () => {
    const { result } = renderHook(() => useWindowDragGesture());

    act(() => {
      result.current.beginWindowDragTracking({ x: 10, y: 10 });
      window.dispatchEvent(new Event('blur'));
    });

    expect(result.current.isWindowDragActive()).toBe(false);
  });
});
