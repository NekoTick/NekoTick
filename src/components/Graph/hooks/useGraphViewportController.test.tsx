import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { themeGraphTokens } from '@/styles/themeTokens';
import { useGraphViewportController } from './useGraphViewportController';

describe('useGraphViewportController', () => {
  let frames: Map<number, FrameRequestCallback>;
  let nextFrameId: number;
  let svg: SVGSVGElement;

  const runFrames = (now: number) => {
    const pending = [...frames.values()];
    frames.clear();
    pending.forEach((callback) => callback(now));
  };

  beforeEach(() => {
    frames = new Map();
    nextFrameId = 1;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      const id = nextFrameId;
      nextFrameId += 1;
      frames.set(id, callback);
      return id;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
      frames.delete(id);
    });
    vi.spyOn(performance, 'now').mockReturnValue(1000);
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }));
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    });
    svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
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
  });

  it('eases an offscreen selected node into view', () => {
    const svgRef = { current: svg };
    const nodes = [{ id: 'Alpha.md', label: 'Alpha', degree: 0, x: 400, y: 300 }];
    const hook = renderHook(({ selectedPath }: { selectedPath: string | null }) => useGraphViewportController({
      nodeKey: 'graph',
      nodes,
      selectedPath,
      svgRef,
    }), { initialProps: { selectedPath: null as string | null } });
    act(() => runFrames(1000));
    act(() => hook.result.current.setViewport({ x: -1000, y: 0, zoom: 1 }));

    hook.rerender({ selectedPath: 'Alpha.md' });
    expect(hook.result.current.viewport.x).toBe(-1000);
    act(() => runFrames(1000 + themeGraphTokens.viewportAnimationDurationMs / 2));
    expect(hook.result.current.viewport.x).toBeGreaterThan(-1000);
    expect(hook.result.current.viewport.x).toBeLessThan(0);
    act(() => runFrames(1000 + themeGraphTokens.viewportAnimationDurationMs));
    expect(hook.result.current.viewport.x).toBeCloseTo(0);
  });

  it('cancels a queued graph fit when user interaction takes over', () => {
    const svgRef = { current: svg };
    const nodes = [{ id: 'Alpha.md', label: 'Alpha', degree: 0, x: 1000, y: 800 }];
    const hook = renderHook(() => useGraphViewportController({
      nodeKey: 'graph',
      nodes,
      selectedPath: null,
      svgRef,
    }));
    const fitFrameId = nextFrameId - 1;

    act(() => hook.result.current.cancelPendingFit());

    expect(frames.has(fitFrameId)).toBe(false);
    expect(hook.result.current.viewport).toEqual({ x: 0, y: 0, zoom: 1 });
  });

  it('cancels selected-node easing when wheel zoom takes over', () => {
    const svgRef = { current: svg };
    const nodes = [{ id: 'Alpha.md', label: 'Alpha', degree: 0, x: 400, y: 300 }];
    const hook = renderHook(({ selectedPath }: { selectedPath: string | null }) => useGraphViewportController({
      nodeKey: 'graph',
      nodes,
      selectedPath,
      svgRef,
    }), { initialProps: { selectedPath: null as string | null } });
    act(() => runFrames(1000));
    act(() => hook.result.current.setViewport({ x: -1000, y: 0, zoom: 1 }));
    hook.rerender({ selectedPath: 'Alpha.md' });
    const animationFrameId = nextFrameId - 1;
    const preventDefault = vi.fn();
    act(() => hook.result.current.handleWheel({
      clientX: 400,
      clientY: 300,
      currentTarget: svg,
      deltaY: -120,
      preventDefault,
    } as never));

    expect(preventDefault).toHaveBeenCalled();
    expect(frames.has(animationFrameId)).toBe(false);
    act(() => runFrames(1016));
    expect(hook.result.current.viewport.zoom).toBeGreaterThan(1);
  });

  it('cancels selected-node easing when a pointer interaction takes over', () => {
    const svgRef = { current: svg };
    const nodes = [{ id: 'Alpha.md', label: 'Alpha', degree: 0, x: 400, y: 300 }];
    const hook = renderHook(({ selectedPath }: { selectedPath: string | null }) => useGraphViewportController({
      nodeKey: 'graph',
      nodes,
      selectedPath,
      svgRef,
    }), { initialProps: { selectedPath: null as string | null } });
    act(() => runFrames(1000));
    act(() => hook.result.current.setViewport({ x: -1000, y: 0, zoom: 1 }));
    hook.rerender({ selectedPath: 'Alpha.md' });
    const animationFrameId = nextFrameId - 1;

    act(() => hook.result.current.cancelViewportAnimation());

    expect(frames.has(animationFrameId)).toBe(false);
    act(() => runFrames(1016));
    expect(hook.result.current.viewport.x).toBe(-1000);
  });

  it('cancels selected-node easing when the selection is cleared', () => {
    const svgRef = { current: svg };
    const nodes = [{ id: 'Alpha.md', label: 'Alpha', degree: 0, x: 400, y: 300 }];
    const hook = renderHook(({ selectedPath }: { selectedPath: string | null }) => useGraphViewportController({
      nodeKey: 'graph',
      nodes,
      selectedPath,
      svgRef,
    }), { initialProps: { selectedPath: null as string | null } });
    act(() => runFrames(1000));
    act(() => hook.result.current.setViewport({ x: -1000, y: 0, zoom: 1 }));
    hook.rerender({ selectedPath: 'Alpha.md' });
    const animationFrameId = nextFrameId - 1;

    hook.rerender({ selectedPath: null });

    expect(frames.has(animationFrameId)).toBe(false);
    act(() => runFrames(1016));
    expect(hook.result.current.viewport.x).toBe(-1000);
  });

  it('coalesces wheel events into one layout read per frame', () => {
    const svgRef = { current: svg };
    const nodes = [{ id: 'Alpha.md', label: 'Alpha', degree: 0, x: 400, y: 300 }];
    const hook = renderHook(() => useGraphViewportController({
      nodeKey: 'graph',
      nodes,
      selectedPath: null,
      svgRef,
    }));
    act(() => runFrames(1000));
    const getBoundingClientRect = vi.mocked(svg.getBoundingClientRect);
    getBoundingClientRect.mockClear();
    const wheel = (deltaY: number) => hook.result.current.handleWheel({
      clientX: 400,
      clientY: 300,
      currentTarget: svg,
      deltaMode: 0,
      deltaY,
      preventDefault: vi.fn(),
    } as never);

    act(() => {
      wheel(-40);
      wheel(-40);
      wheel(-40);
    });
    expect(getBoundingClientRect).not.toHaveBeenCalled();
    act(() => runFrames(1016));
    expect(getBoundingClientRect).toHaveBeenCalledOnce();
  });

  it('preserves accumulated wheel intent while coalescing a frame', () => {
    const svgRef = { current: svg };
    const hook = renderHook(() => useGraphViewportController({
      nodeKey: 'graph',
      nodes: [{ id: 'Alpha.md', label: 'Alpha', degree: 0, x: 400, y: 300 }],
      selectedPath: null,
      svgRef,
    }));
    act(() => runFrames(1000));
    act(() => hook.result.current.setViewport({ x: 0, y: 0, zoom: themeGraphTokens.minZoom }));
    const wheel = () => hook.result.current.handleWheel({
      clientX: 400,
      clientY: 300,
      currentTarget: svg,
      deltaMode: 0,
      deltaY: -12,
      preventDefault: vi.fn(),
    } as never);

    act(() => {
      for (let index = 0; index < 80; index += 1) wheel();
      runFrames(1016);
    });

    const targetZoom = themeGraphTokens.minZoom
      * Math.exp(80 * 12 * themeGraphTokens.wheelZoomIntensity);
    expect(hook.result.current.viewport.zoom).toBeGreaterThan(themeGraphTokens.minZoom);
    expect(hook.result.current.viewport.zoom).toBeLessThan(targetZoom);

    for (let now = 1032; frames.size > 0 && now < 2000; now += 16) {
      act(() => runFrames(now));
    }
    expect(hook.result.current.viewport.zoom).toBeCloseTo(targetZoom);
  });

  it('continues a released pan with decaying inertia', () => {
    const onViewportSettled = vi.fn();
    const svgRef = { current: svg };
    const hook = renderHook(() => useGraphViewportController({
      nodeKey: 'graph',
      nodes: [{ id: 'Alpha.md', label: 'Alpha', degree: 0, x: 400, y: 300 }],
      onViewportSettled,
      selectedPath: null,
      svgRef,
    }));
    act(() => runFrames(1000));
    act(() => hook.result.current.setViewport({ x: 20, y: 30, zoom: 1 }));
    onViewportSettled.mockClear();

    let started = false;
    act(() => {
      started = hook.result.current.startPanInertia({ x: 1, y: 0.5 });
      runFrames(1016);
    });

    expect(started).toBe(true);
    expect(hook.result.current.viewport.x).toBeGreaterThan(20);
    expect(hook.result.current.viewport.y).toBeGreaterThan(30);
    expect(onViewportSettled).not.toHaveBeenCalled();

    for (let now = 1032; frames.size > 0 && now < 3000; now += 16) {
      act(() => runFrames(now));
    }
    expect(frames.size).toBe(0);
    expect(onViewportSettled).toHaveBeenCalledOnce();
  });

  it('stops pan inertia when another viewport interaction takes over', () => {
    const svgRef = { current: svg };
    const hook = renderHook(() => useGraphViewportController({
      nodeKey: 'graph',
      nodes: [{ id: 'Alpha.md', label: 'Alpha', degree: 0, x: 400, y: 300 }],
      selectedPath: null,
      svgRef,
    }));
    act(() => runFrames(1000));
    act(() => {
      hook.result.current.setViewport({ x: 20, y: 30, zoom: 1 });
      hook.result.current.startPanInertia({ x: 1, y: 0 });
      runFrames(1016);
    });
    const interruptedViewport = hook.result.current.viewport;

    act(() => hook.result.current.cancelViewportWork());

    expect(frames.size).toBe(0);
    act(() => runFrames(1032));
    expect(hook.result.current.viewport).toEqual(interruptedViewport);
  });

  it('notifies after wheel zoom settles so deferred scene work can catch up once', () => {
    vi.useFakeTimers();
    try {
      const onViewportSettled = vi.fn();
      const svgRef = { current: svg };
      const hook = renderHook(() => useGraphViewportController({
        nodeKey: 'graph',
        nodes: [{ id: 'Alpha.md', label: 'Alpha', degree: 0, x: 400, y: 300 }],
        onViewportSettled,
        selectedPath: null,
        svgRef,
      }));
      act(() => runFrames(1000));
      onViewportSettled.mockClear();

      act(() => hook.result.current.handleWheel({
        clientX: 400,
        clientY: 300,
        currentTarget: svg,
        deltaMode: 0,
        deltaY: -120,
        preventDefault: vi.fn(),
      } as never));
      act(() => runFrames(1016));
      expect(onViewportSettled).not.toHaveBeenCalled();

      for (let now = 1032; frames.size > 0 && now < 2000; now += 16) {
        act(() => runFrames(now));
      }
      expect(frames.size).toBe(0);

      act(() => vi.advanceTimersByTime(themeGraphTokens.wheelSettleDelayMs - 1));
      expect(onViewportSettled).not.toHaveBeenCalled();
      act(() => vi.advanceTimersByTime(1));
      expect(onViewportSettled).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it('centers the selected node immediately for reduced motion', () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true }));
    const svgRef = { current: svg };
    const nodes = [{ id: 'Alpha.md', label: 'Alpha', degree: 0, x: 400, y: 300 }];
    const hook = renderHook(({ selectedPath }: { selectedPath: string | null }) => useGraphViewportController({
      nodeKey: 'graph',
      nodes,
      selectedPath,
      svgRef,
    }), { initialProps: { selectedPath: null as string | null } });
    act(() => runFrames(1000));
    act(() => hook.result.current.setViewport({ x: -1000, y: 0, zoom: 1 }));
    hook.rerender({ selectedPath: 'Alpha.md' });

    expect(hook.result.current.viewport.x).toBeCloseTo(0);
    expect(frames.size).toBe(0);
  });

  it('refits when an untouched canvas is resized', () => {
    const svgRef = { current: svg };
    const userPositionedViewportRef = { current: false };
    const nodes = [{ id: 'Alpha.md', label: 'Alpha', degree: 0, x: 1000, y: 800 }];
    const hook = renderHook(({ canvasSize }) => useGraphViewportController({
      canvasSize,
      nodeKey: 'graph',
      nodes,
      selectedPath: null,
      svgRef,
      userPositionedViewportRef,
    }), { initialProps: { canvasSize: { x: 800, y: 600 } } });
    act(() => runFrames(1000));

    vi.mocked(svg.getBoundingClientRect).mockReturnValue({
      bottom: 700,
      height: 700,
      left: 0,
      right: 1000,
      top: 0,
      width: 1000,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    hook.rerender({ canvasSize: { x: 1000, y: 700 } });
    act(() => runFrames(1016));

    const usableHeight = 700
      - themeGraphTokens.viewportControlsVerticalOffsetPx
      - themeGraphTokens.viewportControlsHeightPx;
    expect(hook.result.current.viewport).toEqual({
      x: -500,
      y: usableHeight / 2 - 800,
      zoom: 1,
    });
  });

  it('preserves the graph coordinate at center after a user-positioned resize', () => {
    const svgRef = { current: svg };
    const userPositionedViewportRef = { current: false };
    const hook = renderHook(({ canvasSize }) => useGraphViewportController({
      canvasSize,
      nodeKey: 'graph',
      nodes: [{ id: 'Alpha.md', label: 'Alpha', degree: 0, x: 400, y: 300 }],
      selectedPath: null,
      svgRef,
      userPositionedViewportRef,
    }), { initialProps: { canvasSize: { x: 800, y: 600 } } });
    act(() => runFrames(1000));
    act(() => hook.result.current.setViewport({ x: 100, y: 50, zoom: 2 }));
    userPositionedViewportRef.current = true;

    hook.rerender({ canvasSize: { x: 1000, y: 700 } });

    expect(hook.result.current.viewport).toEqual({ x: 200, y: 100, zoom: 2 });
    expect((500 - hook.result.current.viewport.x) / 2).toBe(150);
  });

  it('ignores a collapsed canvas between visible resize measurements', () => {
    const svgRef = { current: svg };
    const userPositionedViewportRef = { current: false };
    const hook = renderHook(({ canvasSize }) => useGraphViewportController({
      canvasSize,
      nodeKey: 'graph',
      nodes: [{ id: 'Alpha.md', label: 'Alpha', degree: 0, x: 400, y: 300 }],
      selectedPath: null,
      svgRef,
      userPositionedViewportRef,
    }), { initialProps: { canvasSize: { x: 800, y: 600 } } });
    act(() => runFrames(1000));
    act(() => hook.result.current.setViewport({ x: 100, y: 50, zoom: 2 }));
    userPositionedViewportRef.current = true;

    hook.rerender({ canvasSize: { x: 0, y: 0 } });
    expect(hook.result.current.viewport).toEqual({ x: 100, y: 50, zoom: 2 });

    hook.rerender({ canvasSize: { x: 1000, y: 700 } });
    expect(hook.result.current.viewport).toEqual({ x: 200, y: 100, zoom: 2 });
  });

  it('zooms control actions around the usable canvas center', () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true }));
    const svgRef = { current: svg };
    const hook = renderHook(() => useGraphViewportController({
      nodeKey: 'graph',
      nodes: [{ id: 'Alpha.md', label: 'Alpha', degree: 0, x: 400, y: 300 }],
      selectedPath: null,
      svgRef,
    }));
    act(() => runFrames(1000));
    act(() => hook.result.current.setViewport({ x: 0, y: 0, zoom: 1 }));

    act(() => hook.result.current.zoomIn());

    const usableCenterY = (
      600
      - themeGraphTokens.viewportControlsVerticalOffsetPx
      - themeGraphTokens.viewportControlsHeightPx
    ) / 2;
    expect(hook.result.current.viewport).toEqual({
      x: -100,
      y: usableCenterY * (1 - themeGraphTokens.zoomControlStep),
      zoom: themeGraphTokens.zoomControlStep,
    });
    act(() => hook.result.current.resetZoom());
    expect(hook.result.current.viewport).toEqual({ x: 0, y: 0, zoom: 1 });
  });

  it('reverses a pending control zoom without accumulating animation drift', () => {
    const svgRef = { current: svg };
    const hook = renderHook(() => useGraphViewportController({
      nodeKey: 'graph',
      nodes: [{ id: 'Alpha.md', label: 'Alpha', degree: 0, x: 400, y: 300 }],
      selectedPath: null,
      svgRef,
    }));
    act(() => runFrames(1000));
    act(() => hook.result.current.setViewport({ x: 0, y: 0, zoom: 1 }));

    act(() => {
      hook.result.current.zoomIn();
      hook.result.current.zoomOut();
    });
    act(() => runFrames(1000 + themeGraphTokens.viewportAnimationDurationMs));

    expect(hook.result.current.viewport).toEqual({ x: 0, y: 0, zoom: 1 });
  });

  it('cancels every pending viewport frame when the graph becomes inactive', () => {
    const svgRef = { current: svg };
    const nodes = [{ id: 'Alpha.md', label: 'Alpha', degree: 0, x: 1000, y: 800 }];
    const hook = renderHook(({ active, selectedPath }: {
      active: boolean;
      selectedPath: string | null;
    }) => useGraphViewportController({
      active,
      nodeKey: 'graph',
      nodes,
      selectedPath,
      svgRef,
    }), { initialProps: { active: true, selectedPath: null as string | null } });

    const fitFrameId = nextFrameId - 1;
    expect(frames.has(fitFrameId)).toBe(true);
    hook.rerender({ active: false, selectedPath: null });
    expect(frames.size).toBe(0);

    hook.rerender({ active: true, selectedPath: null });
    act(() => runFrames(1000));
    act(() => hook.result.current.setViewport({ x: -1000, y: 0, zoom: 1 }));
    hook.rerender({ active: true, selectedPath: 'Alpha.md' });
    expect(frames.size).toBeGreaterThan(0);
    hook.rerender({ active: false, selectedPath: 'Alpha.md' });
    expect(frames.size).toBe(0);
  });

  it('refits an untouched viewport after returning from an inactive view', () => {
    const svgRef = { current: svg };
    const userPositionedViewportRef = { current: false };
    const hook = renderHook(({ active }: { active: boolean }) => useGraphViewportController({
      active,
      nodeKey: 'graph',
      nodes: [{ id: 'Alpha.md', label: 'Alpha', degree: 0, x: 1000, y: 800 }],
      selectedPath: null,
      svgRef,
      userPositionedViewportRef,
    }), { initialProps: { active: false } });

    expect(frames.size).toBe(0);
    hook.rerender({ active: true });
    expect(frames.size).toBe(1);
    act(() => runFrames(1000));

    expect(hook.result.current.viewport).not.toEqual({ x: 0, y: 0, zoom: 1 });
  });

  it('cancels pending wheel and easing work when the document is hidden', () => {
    const svgRef = { current: svg };
    const hook = renderHook(({ selectedPath }: { selectedPath: string | null }) => useGraphViewportController({
      nodeKey: 'graph',
      nodes: [{ id: 'Alpha.md', label: 'Alpha', degree: 0, x: 400, y: 300 }],
      selectedPath,
      svgRef,
    }), { initialProps: { selectedPath: null as string | null } });
    act(() => runFrames(1000));
    act(() => hook.result.current.setViewport({ x: -1000, y: 0, zoom: 1 }));
    hook.rerender({ selectedPath: 'Alpha.md' });
    expect(frames.size).toBeGreaterThan(0);

    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    act(() => document.dispatchEvent(new Event('visibilitychange')));

    expect(frames.size).toBe(0);
    const preventDefault = vi.fn();
    act(() => hook.result.current.handleWheel({
      clientX: 400,
      clientY: 300,
      currentTarget: svg,
      deltaMode: 0,
      deltaY: -120,
      preventDefault,
    } as never));
    expect(preventDefault).not.toHaveBeenCalled();
    expect(frames.size).toBe(0);

    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    act(() => document.dispatchEvent(new Event('visibilitychange')));
  });
});
