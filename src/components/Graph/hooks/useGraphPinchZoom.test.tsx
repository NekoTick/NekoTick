import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { GraphViewport } from '../model/graphViewport';
import { useGraphPinchZoom } from './useGraphPinchZoom';

describe('useGraphPinchZoom', () => {
  it('zooms around the moving two-finger center and coalesces pointer moves', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const captured = new Set<number>();
    Object.defineProperty(svg, 'setPointerCapture', {
      configurable: true,
      value: (pointerId: number) => captured.add(pointerId),
    });
    Object.defineProperty(svg, 'hasPointerCapture', {
      configurable: true,
      value: (pointerId: number) => captured.has(pointerId),
    });
    Object.defineProperty(svg, 'releasePointerCapture', {
      configurable: true,
      value: (pointerId: number) => captured.delete(pointerId),
    });
    vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue({
      bottom: 600,
      height: 600,
      left: 0,
      right: 800,
      top: 0,
      width: 800,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    let frame: FrameRequestCallback | null = null;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frame = callback;
      return 1;
    });
    let viewport: GraphViewport = { x: 0, y: 0, zoom: 1 };
    const onPinchStart = vi.fn();
    const hook = renderHook(() => useGraphPinchZoom({
      getViewport: () => viewport,
      onPinchStart,
      setViewport: (value) => {
        viewport = typeof value === 'function' ? value(viewport) : value;
      },
      svgRef: { current: svg },
    }));

    expect(hook.result.current.handlePointerDown({
      clientX: 100,
      clientY: 100,
      pointerId: 1,
      pointerType: 'touch',
    } as never)).toBe(false);
    expect(hook.result.current.handlePointerDown({
      clientX: 200,
      clientY: 100,
      pointerId: 2,
      pointerType: 'touch',
    } as never)).toBe(true);
    expect(onPinchStart).toHaveBeenCalledOnce();
    expect(captured).toEqual(new Set([1, 2]));

    act(() => {
      hook.result.current.handlePointerMove({
        clientX: 300,
        clientY: 100,
        pointerId: 2,
      } as never);
      hook.result.current.handlePointerMove({
        clientX: 320,
        clientY: 100,
        pointerId: 2,
      } as never);
    });
    expect(window.requestAnimationFrame).toHaveBeenCalledOnce();
    act(() => frame?.(performance.now()));

    expect(viewport.zoom).toBeCloseTo(2.2);
    expect(viewport.x).toBeCloseTo(-120);
    expect(viewport.y).toBeCloseTo(-120);
    expect(hook.result.current.handlePointerEnd({
      clientX: 320,
      clientY: 100,
      pointerId: 2,
    } as never)).toBe(true);
    expect(captured.size).toBe(0);
  });

  it('cancels a pinch without applying the cancellation coordinates', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const captured = new Set<number>();
    Object.defineProperty(svg, 'setPointerCapture', { configurable: true, value: (id: number) => captured.add(id) });
    Object.defineProperty(svg, 'hasPointerCapture', { configurable: true, value: (id: number) => captured.has(id) });
    Object.defineProperty(svg, 'releasePointerCapture', { configurable: true, value: (id: number) => captured.delete(id) });
    vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue({
      bottom: 600, height: 600, left: 0, right: 800, top: 0, width: 800, x: 0, y: 0,
      toJSON: () => ({}),
    });
    let frame: FrameRequestCallback | null = null;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frame = callback;
      return 2;
    });
    const initial = { x: 0, y: 0, zoom: 1 };
    let viewport = initial;
    const hook = renderHook(() => useGraphPinchZoom({
      getViewport: () => viewport,
      onPinchStart: vi.fn(),
      setViewport: (value) => {
        viewport = typeof value === 'function' ? value(viewport) : value;
      },
      svgRef: { current: svg },
    }));

    hook.result.current.handlePointerDown({ clientX: 100, clientY: 100, pointerId: 1, pointerType: 'touch' } as never);
    hook.result.current.handlePointerDown({ clientX: 200, clientY: 100, pointerId: 2, pointerType: 'touch' } as never);
    hook.result.current.handlePointerMove({ clientX: 300, clientY: 100, pointerId: 2 } as never);
    expect(hook.result.current.handlePointerCancel({
      clientX: 0,
      clientY: 0,
      pointerId: 2,
    } as never)).toBe(true);
    act(() => frame?.(performance.now()));

    expect(viewport).toEqual(initial);
    expect(captured.size).toBe(0);
  });
});
