import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { useRef, useState } from 'react';
import { useCoverContainerObserver } from './useCoverContainerObserver';

type ResizeCb = ResizeObserverCallback;

const resizeObserverState = vi.hoisted(() => {
  let callback: ResizeCb | null = null;
  const observe = vi.fn();
  const disconnect = vi.fn();
  return {
    setCallback: (cb: ResizeCb) => {
      callback = cb;
    },
    emit: (width: number, height: number) => {
      if (!callback) return;
      callback(
        [{ contentRect: { width, height } } as ResizeObserverEntry],
        {} as ResizeObserver
      );
    },
    observe,
    disconnect,
    reset: () => {
      callback = null;
      observe.mockReset();
      disconnect.mockReset();
    },
  };
});

class MockResizeObserver {
  constructor(cb: ResizeCb) {
    resizeObserverState.setCallback(cb);
  }
  observe = resizeObserverState.observe;
  disconnect = resizeObserverState.disconnect;
}

describe('useCoverContainerObserver', () => {
  const originalResizeObserver = globalThis.ResizeObserver;
  const originalRaf = globalThis.requestAnimationFrame;
  const originalCancelRaf = globalThis.cancelAnimationFrame;

  beforeEach(() => {
    resizeObserverState.reset();
    (globalThis as unknown as { ResizeObserver: typeof ResizeObserver }).ResizeObserver =
      MockResizeObserver as unknown as typeof ResizeObserver;
    globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    }) as typeof requestAnimationFrame;
    globalThis.cancelAnimationFrame = vi.fn();
  });

  afterEach(() => {
    (globalThis as unknown as { ResizeObserver: typeof ResizeObserver }).ResizeObserver = originalResizeObserver;
    globalThis.requestAnimationFrame = originalRaf;
    globalThis.cancelAnimationFrame = originalCancelRaf;
    resizeObserverState.reset();
  });

  it('captures container size immediately on mount before resize observer emits', () => {
    const el = document.createElement('div');
    vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
      width: 640,
      height: 240,
      top: 0,
      left: 0,
      right: 640,
      bottom: 240,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });

    const { result } = renderHook(() => {
      const containerRef = useRef<HTMLDivElement | null>(el);
      const isManualResizingRef = useRef(false);
      const [size, setSize] = useState<{ width: number; height: number } | null>(null);
      useCoverContainerObserver({ containerRef, isManualResizingRef, setContainerSize: setSize });
      return size;
    });

    expect(result.current).toEqual({ width: 640, height: 240 });
  });

  it('ignores zero-sized resize entries and keeps previous size', () => {
    const { result } = renderHook(() => {
      const containerRef = useRef<HTMLDivElement>(document.createElement('div'));
      const isManualResizingRef = useRef(false);
      const [size, setSize] = useState<{ width: number; height: number } | null>(null);
      useCoverContainerObserver({ containerRef, isManualResizingRef, setContainerSize: setSize });
      return size;
    });

    act(() => {
      resizeObserverState.emit(0, 200);
    });
    expect(result.current).toBeNull();

    act(() => {
      resizeObserverState.emit(757, 200);
    });
    expect(result.current).toEqual({ width: 757, height: 200 });

    act(() => {
      resizeObserverState.emit(0, 200);
    });
    expect(result.current).toEqual({ width: 757, height: 200 });
  });

  it('does not mark container resizing when observer reports the same size after rebinding', () => {
    const el = document.createElement('div');
    vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
      width: 640,
      height: 240,
      top: 0,
      left: 0,
      right: 640,
      bottom: 240,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });

    const { result } = renderHook(() => {
      const containerRef = useRef<HTMLDivElement | null>(el);
      const isManualResizingRef = useRef(false);
      const [size, setSize] = useState<{ width: number; height: number } | null>(null);
      const [isContainerResizing, setIsContainerResizing] = useState(false);
      useCoverContainerObserver({
        containerRef,
        isManualResizingRef,
        setContainerSize: setSize,
        setIsContainerResizing,
        observeKey: 'same-size',
      });
      return { size, isContainerResizing };
    });

    expect(result.current.size).toEqual({ width: 640, height: 240 });
    expect(result.current.isContainerResizing).toBe(false);

    act(() => {
      resizeObserverState.emit(640, 240);
    });

    expect(result.current.size).toEqual({ width: 640, height: 240 });
    expect(result.current.isContainerResizing).toBe(false);
  });

  it('does not update size while manual resizing flag is active', () => {
    const { result } = renderHook(() => {
      const containerRef = useRef<HTMLDivElement>(document.createElement('div'));
      const isManualResizingRef = useRef(false);
      const [size, setSize] = useState<{ width: number; height: number } | null>(null);
      useCoverContainerObserver({
        containerRef,
        isManualResizingRef,
        setContainerSize: setSize,
      });
      return { size, isManualResizingRef };
    });

    act(() => {
      resizeObserverState.emit(500, 220);
    });
    expect(result.current.size).toEqual({ width: 500, height: 220 });

    result.current.isManualResizingRef.current = true;
    act(() => {
      resizeObserverState.emit(700, 260);
    });
    expect(result.current.size).toEqual({ width: 500, height: 220 });
  });

  it('defers measurement until suspended layout work finishes', () => {
    const el = document.createElement('div');
    vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
      width: 720,
      height: 240,
      top: 0,
      left: 0,
      right: 720,
      bottom: 240,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });

    const { result, rerender } = renderHook(
      ({ suspended }: { suspended: boolean }) => {
        const containerRef = useRef<HTMLDivElement | null>(el);
        const isManualResizingRef = useRef(false);
        const [size, setSize] = useState<{ width: number; height: number } | null>(null);
        useCoverContainerObserver({
          containerRef,
          isManualResizingRef,
          setContainerSize: setSize,
          suspended,
        });
        return size;
      },
      { initialProps: { suspended: true } }
    );

    expect(result.current).toBeNull();
    expect(resizeObserverState.observe).not.toHaveBeenCalled();

    rerender({ suspended: false });

    expect(result.current).toEqual({ width: 720, height: 240 });
    expect(resizeObserverState.observe).toHaveBeenCalledWith(el);
  });

  it('rebinds observer when observe key changes to a new container node', () => {
    const firstEl = document.createElement('div');
    const secondEl = document.createElement('div');

    const { rerender, unmount } = renderHook(
      ({ observeKey, el }: { observeKey: string; el: HTMLDivElement | null }) => {
        const containerRef = useRef<HTMLDivElement | null>(el);
        const isManualResizingRef = useRef(false);
        const [, setSize] = useState<{ width: number; height: number } | null>(null);

        containerRef.current = el;
        useCoverContainerObserver({
          containerRef,
          isManualResizingRef,
          setContainerSize: setSize,
          observeKey,
        });
      },
      { initialProps: { observeKey: 'first', el: firstEl } }
    );

    expect(resizeObserverState.observe).toHaveBeenCalledWith(firstEl);

    rerender({ observeKey: 'second', el: secondEl });
    expect(resizeObserverState.disconnect).toHaveBeenCalledTimes(1);
    expect(resizeObserverState.observe).toHaveBeenLastCalledWith(secondEl);

    unmount();
    expect(resizeObserverState.disconnect).toHaveBeenCalledTimes(2);
  });

  it('coalesces rapid observer size changes into one frame commit', () => {
    let pendingFrame: FrameRequestCallback | null = null;
    globalThis.requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
      pendingFrame = callback;
      return 9;
    }) as typeof requestAnimationFrame;
    globalThis.cancelAnimationFrame = vi.fn();

    const setIsContainerResizing = vi.fn();
    const { result } = renderHook(() => {
      const containerRef = useRef<HTMLDivElement>(document.createElement('div'));
      const isManualResizingRef = useRef(false);
      const [size, setSize] = useState<{ width: number; height: number } | null>(null);
      useCoverContainerObserver({
        containerRef,
        isManualResizingRef,
        setContainerSize: setSize,
        setIsContainerResizing,
      });
      return size;
    });

    act(() => {
      resizeObserverState.emit(500, 210);
      resizeObserverState.emit(520, 220);
      resizeObserverState.emit(540, 230);
    });

    expect(globalThis.requestAnimationFrame).toHaveBeenCalledTimes(1);
    expect(setIsContainerResizing).toHaveBeenCalledTimes(1);
    expect(setIsContainerResizing).toHaveBeenCalledWith(true);
    expect(result.current).toBeNull();

    act(() => {
      pendingFrame?.(16);
    });

    expect(result.current).toEqual({ width: 540, height: 230 });
  });
});
