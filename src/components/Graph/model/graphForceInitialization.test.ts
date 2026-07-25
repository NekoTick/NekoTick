import { describe, expect, it } from 'vitest';
import { themeGraphTokens } from '@/styles/themeTokens';
import type { GraphForceNode } from './graphForces';
import {
  createGraphForceLayoutStability,
  createInitialGraphForcePositions,
  isGraphForceLayoutStable,
} from './graphForceInitialization';

describe('createInitialGraphForcePositions', () => {
  it('keeps an interrupted drag start ahead of a stale stored override', () => {
    const retainedPositions = { 'Alpha.md': { x: 180, y: 150 } };

    const positions = createInitialGraphForcePositions({
      carriedPositions: retainedPositions,
      interruptedDrag: { id: 'Alpha.md', position: { x: 140, y: 120 } },
      positionOverrides: { 'Alpha.md': { x: 100, y: 100 } },
      retainedPositions,
      useOverrides: true,
    });

    expect(positions['Alpha.md']).toEqual({ x: 140, y: 120 });
    expect(retainedPositions['Alpha.md']).toEqual({ x: 140, y: 120 });
  });

  it('recognizes a stationary initial layout after its first sample', () => {
    const nodes: GraphForceNode[] = [
      { degree: 0, id: 'Alpha.md', x: 600, y: 380, vx: 0, vy: 0 },
      { degree: 0, id: 'Beta.md', x: 800, y: 380, vx: 0, vy: 0 },
    ];
    const stability = createGraphForceLayoutStability(nodes);

    expect(isGraphForceLayoutStable(stability, nodes)).toBe(true);
  });

  it('requires consecutive low-motion samples before declaring a layout stable', () => {
    const node: GraphForceNode = {
      degree: 1,
      id: 'Alpha.md',
      x: 600,
      y: 380,
      vx: themeGraphTokens.forceLabelStableVelocityMaxPxPerFrame / 2,
      vy: 0,
    };
    const stability = createGraphForceLayoutStability([node]);

    for (let index = 1; index < themeGraphTokens.forceLabelStableTickCount; index += 1) {
      node.x += node.vx!;
      expect(isGraphForceLayoutStable(stability, [node])).toBe(false);
    }
    node.x += node.vx!;

    expect(isGraphForceLayoutStable(stability, [node])).toBe(true);
  });
});
