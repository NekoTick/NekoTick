import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useGraphPointerInteractions } from './useGraphPointerInteractions';

describe('useGraphPointerInteractions', () => {
  it('releases native capture once when an interaction is cancelled without an event', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const captured = new Set<number>();
    const setPointerCapture = vi.fn((pointerId: number) => captured.add(pointerId));
    const releasePointerCapture = vi.fn((pointerId: number) => captured.delete(pointerId));
    Object.defineProperty(svg, 'setPointerCapture', { configurable: true, value: setPointerCapture });
    Object.defineProperty(svg, 'hasPointerCapture', {
      configurable: true,
      value: (pointerId: number) => captured.has(pointerId),
    });
    Object.defineProperty(svg, 'releasePointerCapture', {
      configurable: true,
      value: releasePointerCapture,
    });
    const onReleaseDrag = vi.fn();
    const hook = renderHook(() => useGraphPointerInteractions({
      onDragPosition: vi.fn(),
      onOpenPath: vi.fn(),
      onPositionCommit: vi.fn(),
      onReleaseDrag,
      onSelectPath: vi.fn(),
      setDragPosition: vi.fn(),
      setViewport: vi.fn(),
      svgRef: { current: svg },
      viewport: { x: 0, y: 0, zoom: 1 },
    }));

    act(() => hook.result.current.startNodeDrag({
      button: 0,
      clientX: 100,
      clientY: 100,
      pointerId: 7,
      stopPropagation: vi.fn(),
    } as never, 'Alpha.md', { x: 100, y: 100 }));
    expect(captured.has(7)).toBe(true);

    act(() => hook.result.current.cancelCurrentInteraction());
    act(() => hook.result.current.cancelDrag({
      currentTarget: svg,
      pointerId: 7,
    } as never));

    expect(releasePointerCapture).toHaveBeenCalledOnce();
    expect(onReleaseDrag).toHaveBeenCalledOnce();
  });

  it('discards a stale interaction without mutating graph state', () => {
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
    const onDragPosition = vi.fn();
    const onReleaseDrag = vi.fn();
    const setDragPosition = vi.fn();
    const hook = renderHook(() => useGraphPointerInteractions({
      onDragPosition,
      onOpenPath: vi.fn(),
      onPositionCommit: vi.fn(),
      onReleaseDrag,
      onSelectPath: vi.fn(),
      setDragPosition,
      setViewport: vi.fn(),
      svgRef: { current: svg },
      viewport: { x: 0, y: 0, zoom: 1 },
    }));

    act(() => hook.result.current.startNodeDrag({
      button: 0,
      clientX: 100,
      clientY: 100,
      pointerId: 8,
      stopPropagation: vi.fn(),
    } as never, 'Alpha.md', { x: 100, y: 100 }));
    act(() => hook.result.current.discardCurrentInteraction());

    expect(captured.has(8)).toBe(false);
    expect(onDragPosition).not.toHaveBeenCalled();
    expect(onReleaseDrag).not.toHaveBeenCalled();
    expect(setDragPosition).toHaveBeenCalledOnce();
  });

  it('treats small touch jitter as a tap before starting a drag', () => {
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
    const onPositionCommit = vi.fn();
    const onOpenPath = vi.fn();
    const onSelectPath = vi.fn();
    const hook = renderHook(() => useGraphPointerInteractions({
      onDragPosition: vi.fn(),
      onOpenPath,
      onPositionCommit,
      onReleaseDrag: vi.fn(),
      onSelectPath,
      setDragPosition: vi.fn(),
      setViewport: vi.fn(),
      svgRef: { current: svg },
      viewport: { x: 0, y: 0, zoom: 1 },
    }));

    act(() => hook.result.current.startNodeDrag({
      button: 0,
      clientX: 100,
      clientY: 100,
      pointerId: 9,
      pointerType: 'touch',
      stopPropagation: vi.fn(),
    } as never, 'Alpha.md', { x: 100, y: 100 }));
    act(() => hook.result.current.finishDrag({
      clientX: 107,
      clientY: 100,
      currentTarget: svg,
      pointerId: 9,
    } as never));

    expect(onOpenPath).toHaveBeenCalledWith('Alpha.md');
    expect(onSelectPath).not.toHaveBeenCalled();
    expect(onPositionCommit).not.toHaveBeenCalled();
  });

  it('treats small mouse jitter as a tap before starting a drag', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    Object.defineProperty(svg, 'setPointerCapture', { value: vi.fn() });
    Object.defineProperty(svg, 'hasPointerCapture', { value: vi.fn(() => false) });
    const onPositionCommit = vi.fn();
    const onOpenPath = vi.fn();
    const hook = renderHook(() => useGraphPointerInteractions({
      onDragPosition: vi.fn(),
      onOpenPath,
      onPositionCommit,
      onReleaseDrag: vi.fn(),
      onSelectPath: vi.fn(),
      setDragPosition: vi.fn(),
      setViewport: vi.fn(),
      svgRef: { current: svg },
      viewport: { x: 0, y: 0, zoom: 1 },
    }));

    act(() => hook.result.current.startNodeDrag({
      button: 0,
      clientX: 100,
      clientY: 100,
      pointerId: 10,
      pointerType: 'mouse',
      stopPropagation: vi.fn(),
    } as never, 'Alpha.md', { x: 100, y: 100 }));
    act(() => hook.result.current.finishDrag({
      clientX: 107,
      clientY: 100,
      currentTarget: svg,
      pointerId: 10,
    } as never));

    expect(onOpenPath).toHaveBeenCalledWith('Alpha.md');
    expect(onPositionCommit).not.toHaveBeenCalled();
  });
});
