import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { themeGraphTokens } from '@/styles/themeTokens';
import type { PositionedNoteGraph } from '../model/graphLayout';
import { useGraphForceSimulation } from './useGraphForceSimulation';

const forceMocks = vi.hoisted(() => ({
  createCount: 0,
  handlers: {} as Record<string, () => void>,
  nodes: [] as Array<Record<string, unknown>>,
  simulation: null as null | Record<string, ReturnType<typeof vi.fn>>,
}));

vi.mock('../model/graphForces', () => ({
  createGraphForceLinks: (links: unknown[]) => links,
  createGraphForceNodes: (nodes: Array<Record<string, unknown>>) => nodes.map((node) => ({
    ...node,
    vx: 0,
    vy: 0,
  })),
  createGraphForceSimulation: (nodes: Array<Record<string, unknown>>) => {
    forceMocks.createCount += 1;
    forceMocks.nodes = nodes;
    let alpha = 1;
    let alphaTarget = 0;
    const forces = new Map<string, unknown>(
      ['charge', 'link', 'collision', 'x', 'y'].map((name) => [name, {}]),
    );
    const simulation: Record<string, ReturnType<typeof vi.fn>> = {};
    simulation.alpha = vi.fn((value?: number) => {
      if (value === undefined) return alpha;
      alpha = value;
      return simulation;
    });
    simulation.alphaDecay = vi.fn(() => simulation);
    simulation.alphaMin = vi.fn(() => 0.012);
    simulation.alphaTarget = vi.fn((value?: number) => {
      if (value === undefined) return alphaTarget;
      alphaTarget = value;
      return simulation;
    });
    simulation.force = vi.fn(function force(name: string, value?: unknown) {
      if (arguments.length === 1) return forces.get(name);
      if (value === null) forces.delete(name);
      else forces.set(name, value);
      return simulation;
    });
    simulation.on = vi.fn((event: string, callback: () => void) => {
      forceMocks.handlers[event] = callback;
      return simulation;
    });
    simulation.restart = vi.fn(() => simulation);
    simulation.stop = vi.fn(() => simulation);
    simulation.tick = vi.fn(() => {
      nodes.forEach((node, index) => {
        node.x = node.fx == null ? Number(node.x) + index + 1 : Number(node.fx);
        node.y = node.fy == null ? Number(node.y) + index + 1 : Number(node.fy);
      });
      return simulation;
    });
    simulation.velocityDecay = vi.fn(() => simulation);
    forceMocks.simulation = simulation;
    return simulation;
  },
}));

const graph: PositionedNoteGraph = {
  focusNodeId: 'Alpha.md',
  nodes: [
    { id: 'Alpha.md', label: 'Alpha', degree: 1, x: 100, y: 100 },
    { id: 'Beta.md', label: 'Beta', degree: 1, x: 300, y: 100 },
  ],
  edges: [],
};
graph.edges = [{ source: graph.nodes[0]!, target: graph.nodes[1]! }];

function renderForceSimulation(
  active = true,
  onPositionsInitialized = vi.fn(),
  initialGraph = graph,
) {
  const initialProps: { currentGraph?: PositionedNoteGraph; isActive: boolean } = {
    currentGraph: initialGraph,
    isActive: active,
  };
  return renderHook(({
    currentGraph,
    isActive,
  }: { currentGraph?: PositionedNoteGraph; isActive: boolean }) => useGraphForceSimulation({
    active: isActive,
    dragPosition: null,
    graph: currentGraph ?? graph,
    onDraggedPositionFrame: vi.fn(),
    onPositionsCommit: vi.fn(),
    onPositionsFrame: vi.fn(),
    onPositionsInitialized,
    positionOverrides: {},
  }), { initialProps });
}

describe('useGraphForceSimulation', () => {
  beforeEach(() => {
    forceMocks.createCount = 0;
    forceMocks.handlers = {};
    forceMocks.nodes = [];
    forceMocks.simulation = null;
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }));
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  });

  it('pauses and resumes release motion with the graph visibility', () => {
    const hook = renderForceSimulation();
    act(() => forceMocks.handlers.end?.());
    const simulation = forceMocks.simulation!;
    simulation.stop.mockClear();

    act(() => {
      hook.result.current.updateDragPosition('Alpha.md', { x: 140, y: 120 });
      hook.result.current.releaseDragPosition('Alpha.md');
    });
    simulation.restart.mockClear();
    hook.rerender({ isActive: false });
    expect(simulation.stop).toHaveBeenCalledOnce();

    hook.rerender({ isActive: true });
    expect(simulation.restart).toHaveBeenCalledOnce();
  });

  it('settles an initial layout in one synchronous step for reduced motion', () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true }));

    renderForceSimulation();

    const simulation = forceMocks.simulation!;
    expect(simulation.tick).toHaveBeenCalledOnce();
    expect(simulation.restart).not.toHaveBeenCalled();
  });

  it('makes a single stationary node ready without starting a simulation', () => {
    const onPositionsInitialized = vi.fn();
    const singleNodeGraph: PositionedNoteGraph = {
      edges: [],
      focusNodeId: 'Alpha.md',
      nodes: [{ id: 'Alpha.md', label: 'Alpha', degree: 0, x: 600, y: 380 }],
    };

    renderForceSimulation(true, onPositionsInitialized, singleNodeGraph);

    expect(onPositionsInitialized).toHaveBeenCalledOnce();
    expect(forceMocks.simulation!.restart).not.toHaveBeenCalled();
  });

  it('makes labels ready after stable ticks without waiting for simulation end', () => {
    const onPositionsInitialized = vi.fn();
    renderForceSimulation(true, onPositionsInitialized);
    const movement = themeGraphTokens.forceLabelStableDisplacementMaxPxPerFrame / 2;

    for (let index = 0; index < themeGraphTokens.forceLabelStableTickCount; index += 1) {
      forceMocks.nodes.forEach((node) => {
        node.x = Number(node.x) + movement;
        node.vx = movement;
      });
      act(() => forceMocks.handlers.tick?.());
    }

    expect(onPositionsInitialized).toHaveBeenCalledOnce();
    act(() => forceMocks.handlers.end?.());
    expect(onPositionsInitialized).toHaveBeenCalledOnce();
  });

  it('releases restored node anchors when the initial layout finishes', () => {
    renderHook(() => useGraphForceSimulation({
      active: true,
      dragPosition: null,
      graph,
      onDraggedPositionFrame: vi.fn(),
      onPositionsCommit: vi.fn(),
      onPositionsFrame: vi.fn(),
      onPositionsInitialized: vi.fn(),
      positionOverrides: { 'Alpha.md': { x: 100, y: 100 } },
    }));

    expect(forceMocks.nodes[0]?.fx).toBe(100);
    act(() => forceMocks.handlers.end?.());
    expect(forceMocks.nodes[0]?.fx).toBeNull();
    expect(forceMocks.nodes[0]?.fy).toBeNull();
  });

  it('chunks a large reduced-motion layout outside the layout effect', () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true }));
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frames.push(callback);
      return frames.length;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
    const onPositionsInitialized = vi.fn();
    const nodes = Array.from(
      { length: themeGraphTokens.forceReducedMotionChunkNodeThreshold },
      (_, index) => ({
        id: `Note-${index}.md`,
        label: `Note ${index}`,
        degree: 0,
        x: 600 + index,
        y: 380,
      }),
    );

    renderForceSimulation(true, onPositionsInitialized, {
      edges: [],
      focusNodeId: nodes[0]!.id,
      nodes,
    });

    const simulation = forceMocks.simulation!;
    expect(simulation.tick).not.toHaveBeenCalled();
    expect(onPositionsInitialized).not.toHaveBeenCalled();
    while (frames.length > 0) act(() => frames.shift()!(performance.now()));

    expect(simulation.tick.mock.calls.length).toBeGreaterThan(1);
    expect(simulation.restart).not.toHaveBeenCalled();
    expect(onPositionsInitialized).toHaveBeenCalledOnce();
  });

  it('does not restart spatial force motion while dragging with reduced motion', () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true }));
    const hook = renderForceSimulation();
    const simulation = forceMocks.simulation!;
    simulation.restart.mockClear();

    act(() => hook.result.current.updateDragPosition('Alpha.md', { x: 140, y: 120 }));

    expect(simulation.stop).toHaveBeenCalled();
    expect(simulation.restart).not.toHaveBeenCalled();
  });

  it('keeps a complete saved layout cool until the first drag', () => {
    const hook = renderHook(({
      dragPosition,
    }: { dragPosition: { id: string; position: { x: number; y: number } } | null }) => (
      useGraphForceSimulation({
        active: true,
        dragPosition,
        graph,
        onDraggedPositionFrame: vi.fn(),
        onPositionsCommit: vi.fn(),
        onPositionsFrame: vi.fn(),
        onPositionsInitialized: vi.fn(),
        positionOverrides: {
          'Alpha.md': { x: 100, y: 100 },
          'Beta.md': { x: 300, y: 100 },
        },
      })
    ), { initialProps: {
      dragPosition: null as { id: string; position: { x: number; y: number } } | null,
    } });
    const simulation = forceMocks.simulation!;
    expect(simulation.alpha).toHaveBeenCalledWith(themeGraphTokens.forceMinimumAlpha);
    simulation.alpha.mockClear();

    hook.rerender({
      dragPosition: { id: 'Alpha.md', position: { x: 100, y: 100 } },
    });
    act(() => hook.result.current.updateDragPosition('Alpha.md', { x: 104, y: 100 }));

    expect(simulation.alpha).toHaveBeenLastCalledWith(themeGraphTokens.forceDragAlpha);
  });

  it('bounds distant motion while a dragged neighborhood is reheated', () => {
    const distantNode = { id: 'Gamma.md', label: 'Gamma', degree: 0, x: 500, y: 100 };
    const hook = renderForceSimulation(true, vi.fn(), {
      focusNodeId: 'Alpha.md',
      nodes: [...graph.nodes, distantNode],
      edges: [...graph.edges],
    });
    act(() => forceMocks.handlers.end?.());
    const distantPosition = {
      x: forceMocks.nodes[2]?.x,
      y: forceMocks.nodes[2]?.y,
    };

    act(() => hook.result.current.updateDragPosition('Alpha.md', { x: 140, y: 120 }));

    expect(forceMocks.nodes[1]?.fx).toBeUndefined();
    expect(forceMocks.nodes[2]?.fx).toBeUndefined();
    forceMocks.nodes[2]!.x = Number(distantPosition.x)
      + themeGraphTokens.forceDistantDragMaxDisplacementPx * 2;
    act(() => forceMocks.handlers.tick?.());
    expect(forceMocks.nodes[2]?.x).toBe(
      Number(distantPosition.x) + themeGraphTokens.forceDistantDragMaxDisplacementPx,
    );

    act(() => hook.result.current.releaseDragPosition('Alpha.md'));

    expect(forceMocks.nodes[2]?.fx).toBeUndefined();
    expect(forceMocks.nodes[2]?.fy).toBeUndefined();
  });

  it('does not restart a restored drag position while inactive', () => {
    const hook = renderForceSimulation();
    act(() => forceMocks.handlers.end?.());
    const simulation = forceMocks.simulation!;
    simulation.restart.mockClear();

    hook.rerender({ isActive: false });
    act(() => hook.result.current.updateDragPosition('Alpha.md', { x: 140, y: 120 }));

    expect(simulation.restart).not.toHaveBeenCalled();
  });

  it('does not start a new layout while the document is already hidden', () => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    const hook = renderForceSimulation();
    const simulation = forceMocks.simulation!;

    expect(simulation.restart).not.toHaveBeenCalled();
    act(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(simulation.restart).toHaveBeenCalledOnce();
    hook.unmount();
  });

  it('keeps one simulation when the same topology is reordered around a new focus', () => {
    const hook = renderForceSimulation();
    const reordered: PositionedNoteGraph = {
      focusNodeId: 'Beta.md',
      nodes: [...graph.nodes].reverse(),
      edges: [{ source: graph.nodes[1]!, target: graph.nodes[0]! }],
    };

    hook.rerender({ currentGraph: reordered, isActive: true });

    expect(forceMocks.createCount).toBe(1);
  });

  it('ignores a stale release after initializing a new topology', () => {
    const hook = renderForceSimulation();
    const expandedNode = { id: 'Gamma.md', label: 'Gamma', degree: 0, x: 500, y: 100 };
    const expandedGraph: PositionedNoteGraph = {
      focusNodeId: 'Alpha.md',
      nodes: [...graph.nodes, expandedNode],
      edges: [...graph.edges],
    };

    hook.rerender({ currentGraph: expandedGraph, isActive: true });
    const simulation = forceMocks.simulation!;
    simulation.force.mockClear();
    act(() => hook.result.current.releaseDragPosition('Alpha.md'));

    expect(simulation.force).not.toHaveBeenCalled();
  });

  it('prefers an interrupted drag start over a stale stored override', () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true }));
    const onPositionsCommit = vi.fn();
    const expandedNode = { id: 'Gamma.md', label: 'Gamma', degree: 0, x: 500, y: 100 };
    const expandedGraph: PositionedNoteGraph = {
      focusNodeId: 'Alpha.md',
      nodes: [...graph.nodes, expandedNode],
      edges: [...graph.edges],
    };
    const hook = renderHook(({
      currentGraph,
      dragPosition,
    }: {
      currentGraph: PositionedNoteGraph;
      dragPosition: { id: string; position: { x: number; y: number } } | null;
    }) => useGraphForceSimulation({
      active: true,
      dragPosition,
      graph: currentGraph,
      onDraggedPositionFrame: vi.fn(),
      onPositionsCommit,
      onPositionsFrame: vi.fn(),
      onPositionsInitialized: vi.fn(),
      positionOverrides: { 'Alpha.md': { x: 100, y: 100 } },
    }), { initialProps: {
      currentGraph: graph,
      dragPosition: null as { id: string; position: { x: number; y: number } } | null,
    } });
    const dragStart = { x: 140, y: 120 };
    onPositionsCommit.mockClear();

    hook.rerender({
      currentGraph: graph,
      dragPosition: { id: 'Alpha.md', position: dragStart },
    });
    act(() => hook.result.current.updateDragPosition('Alpha.md', { x: 180, y: 150 }));
    hook.rerender({
      currentGraph: expandedGraph,
      dragPosition: { id: 'Alpha.md', position: dragStart },
    });

    expect(onPositionsCommit).toHaveBeenCalled();
    expect(onPositionsCommit.mock.lastCall?.[0]?.['Alpha.md']).toEqual(dragStart);
  });
});
