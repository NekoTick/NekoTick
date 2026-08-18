import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useMessageListViewport } from './useMessageListViewport';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('useMessageListViewport', () => {
  it('does not treat the native scroll event after an automatic scroll as user activity', () => {
    vi.useFakeTimers();
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
    const viewport = document.createElement('div');
    let scrollTop = 200;
    Object.defineProperties(viewport, {
      clientHeight: { configurable: true, get: () => 500 },
      clientWidth: { configurable: true, get: () => 800 },
      scrollHeight: { configurable: true, get: () => 900 },
      scrollTop: {
        configurable: true,
        get: () => scrollTop,
        set: (value: number) => { scrollTop = value; },
      },
    });
    const containerRef = { current: viewport };
    const { result } = renderHook(() => useMessageListViewport({
      active: true,
      containerRef,
      isEmpty: false,
      isSessionActive: true,
      renderedMessageCount: 2,
      useOverlayScrollbar: true,
    }));

    act(() => {
      viewport.dispatchEvent(new Event('chat-programmatic-scroll'));
      viewport.dispatchEvent(new Event('scroll'));
    });

    expect(result.current.isScrollActive).toBe(false);

    act(() => {
      scrollTop = 150;
      viewport.dispatchEvent(new Event('scroll'));
    });

    expect(result.current.isScrollActive).toBe(true);
  });

  it('reuses one idle timer while scroll events extend the active period', () => {
    vi.useFakeTimers();
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
    const viewport = document.createElement('div');
    let scrollTop = 200;
    Object.defineProperties(viewport, {
      clientHeight: { configurable: true, get: () => 500 },
      clientWidth: { configurable: true, get: () => 800 },
      scrollHeight: { configurable: true, get: () => 700 },
      scrollTop: {
        configurable: true,
        get: () => scrollTop,
        set: (value: number) => { scrollTop = value; },
      },
    });
    const containerRef = { current: viewport };
    const { result, unmount } = renderHook(() => useMessageListViewport({
      active: true,
      containerRef,
      isEmpty: false,
      isSessionActive: true,
      renderedMessageCount: 2,
      useOverlayScrollbar: true,
    }));
    const setTimeoutSpy = vi.spyOn(window, 'setTimeout');

    act(() => {
      viewport.dispatchEvent(new Event('scroll'));
      vi.advanceTimersByTime(100);
      scrollTop = 201;
      viewport.dispatchEvent(new Event('scroll'));
      viewport.dispatchEvent(new Event('scroll'));
      viewport.dispatchEvent(new Event('scroll'));
    });

    expect(result.current.isScrollActive).toBe(true);
    expect(setTimeoutSpy).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(80);
    });
    expect(result.current.isScrollActive).toBe(true);
    expect(setTimeoutSpy).toHaveBeenCalledTimes(2);

    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(result.current.isScrollActive).toBe(false);
    unmount();
  });
});
