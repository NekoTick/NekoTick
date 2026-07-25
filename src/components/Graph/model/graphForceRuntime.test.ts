import { afterEach, describe, expect, it, vi } from 'vitest';
import { themeGraphTokens } from '@/styles/themeTokens';
import type { createGraphForceSimulation } from './graphForces';
import {
  createGraphForceRuntime,
  createGraphForceTickRunner,
  getGraphReducedMotionTickPlan,
} from './graphForceRuntime';

describe('graph force runtime', () => {
  afterEach(() => vi.restoreAllMocks());

  it('keeps small reduced-motion layouts synchronous', () => {
    expect(getGraphReducedMotionTickPlan(20, 40)).toEqual({
      synchronous: true,
      tickCount: themeGraphTokens.forceReducedMotionTickCount,
      ticksPerChunk: themeGraphTokens.forceReducedMotionTickCount,
    });
  });

  it('chunks node-heavy and edge-heavy reduced-motion layouts', () => {
    const nodeHeavy = getGraphReducedMotionTickPlan(
      themeGraphTokens.forceReducedMotionChunkNodeThreshold,
      0,
    );
    const edgeHeavy = getGraphReducedMotionTickPlan(
      2,
      themeGraphTokens.forceReducedMotionChunkEdgeThreshold,
    );

    expect(nodeHeavy).toMatchObject({
      synchronous: false,
      tickCount: themeGraphTokens.forceReducedMotionTickCount,
      ticksPerChunk: themeGraphTokens.forceReducedMotionTickChunkSize,
    });
    expect(edgeHeavy.synchronous).toBe(false);
  });

  it('bounds force layout links while retaining the full graph for rendering', () => {
    const nodes = Array.from({ length: 100 }, (_, index) => ({
      id: `Node-${index}.md`,
      label: `Node ${index}`,
      degree: 20,
      x: index * 10,
      y: 0,
    }));
    const edges = Array.from({ length: 2_000 }, (_, index) => ({
      source: nodes[index % nodes.length]!,
      target: nodes[(index + 1) % nodes.length]!,
    }));
    const runtime = createGraphForceRuntime({
      focusNodeId: nodes[0]!.id,
      nodes,
      edges,
    }, {}, false);
    const links = runtime.simulation.force('link') as unknown as {
      links: () => readonly unknown[];
    };

    expect(links.links()).toHaveLength(themeGraphTokens.forceMaxLayoutEdges);
    expect(runtime.nodesById.size).toBe(nodes.length);
  });

  it('pauses and resumes a chunked layout without losing remaining ticks', () => {
    let nextFrameId = 1;
    const frames = new Map<number, FrameRequestCallback>();
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      const frameId = nextFrameId;
      nextFrameId += 1;
      frames.set(frameId, callback);
      return frameId;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((frameId) => {
      frames.delete(frameId);
    });
    const tick = vi.fn((_iterations?: number) => undefined);
    const simulation = { tick } as unknown as ReturnType<typeof createGraphForceSimulation>;
    const onComplete = vi.fn();
    const runner = createGraphForceTickRunner({
      onComplete,
      plan: getGraphReducedMotionTickPlan(
        themeGraphTokens.forceReducedMotionChunkNodeThreshold,
        0,
      ),
      simulation,
    });

    runner.resume();
    const firstFrame = frames.entries().next().value!;
    frames.delete(firstFrame[0]);
    firstFrame[1](0);
    runner.pause();
    expect(frames.size).toBe(0);
    runner.resume();
    while (frames.size > 0) {
      const frame = frames.entries().next().value!;
      frames.delete(frame[0]);
      frame[1](0);
    }

    const totalTicks = tick.mock.calls
      .reduce((sum, [tickCount]) => sum + Number(tickCount), 0);
    expect(totalTicks).toBe(themeGraphTokens.forceReducedMotionTickCount);
    expect(onComplete).toHaveBeenCalledOnce();
  });
});
