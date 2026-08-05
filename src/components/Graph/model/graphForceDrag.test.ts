import { describe, expect, it } from 'vitest';
import { themeGraphTokens } from '@/styles/themeTokens';
import {
  constrainDistantGraphForceNodes,
  createDistantGraphForceBounds,
} from './graphForceDrag';
import type { PositionedGraphEdge, PositionedGraphNode } from './graphLayout';
import {
  createGraphForceLinks,
  createGraphForceNodes,
  createGraphForceSimulation,
} from './graphForces';

function graphNode(id: string, x: number): PositionedGraphNode {
  return { degree: 1, id, label: id, x, y: 100 };
}

describe('graph force drag', () => {
  it('limits distant motion without fixing nodes in place', () => {
    const positionedNodes = [
      graphNode('dragged', 100),
      graphNode('neighbor', 200),
      graphNode('distant', 300),
    ];
    const nodes = createGraphForceNodes(positionedNodes);
    const nodesById = new Map(nodes.map((node) => [node.id, node]));
    const distant = nodesById.get('distant')!;
    const edges: PositionedGraphEdge[] = [{
      source: positionedNodes[0]!,
      target: positionedNodes[1]!,
    }];

    const boundedNodes = createDistantGraphForceBounds({
      edges,
      id: 'dragged',
      nodesById,
    });
    distant.x += themeGraphTokens.forceDistantDragMaxDisplacementPx * 2;
    distant.vx = 10;

    expect(nodesById.get('dragged')?.fx).toBeUndefined();
    expect(nodesById.get('neighbor')?.fx).toBeUndefined();
    constrainDistantGraphForceNodes(
      boundedNodes,
      themeGraphTokens.forceDistantDragMaxDisplacementPx,
      nodesById,
    );

    expect(distant.x).toBe(300 + themeGraphTokens.forceDistantDragMaxDisplacementPx);
    expect(distant.y).toBe(100);
    expect(distant.vx).toBe(0);
    expect(distant.fx).toBeUndefined();
    expect(distant.fy).toBeUndefined();
  });

  it('keeps two-hop motion subtle while direct neighbors respond freely', () => {
    const positionedNodes = [
      graphNode('dragged', 100),
      graphNode('neighbor', 250),
      graphNode('distant', 400),
    ];
    const nodes = createGraphForceNodes(positionedNodes);
    const nodesById = new Map(nodes.map((node) => [node.id, node]));
    const dragged = nodesById.get('dragged')!;
    const neighbor = nodesById.get('neighbor')!;
    const distant = nodesById.get('distant')!;
    const edges: PositionedGraphEdge[] = [
      { source: positionedNodes[0]!, target: positionedNodes[1]! },
      { source: positionedNodes[1]!, target: positionedNodes[2]! },
    ];
    const simulation = createGraphForceSimulation(nodes, createGraphForceLinks([
      { source: 'dragged', target: 'neighbor' },
      { source: 'neighbor', target: 'distant' },
    ]));
    const neighborStart = { x: neighbor.x, y: neighbor.y };
    const distantStart = { x: distant.x, y: distant.y };
    const boundedNodes = createDistantGraphForceBounds({
      edges,
      id: dragged.id,
      nodesById,
    });
    dragged.fx = 180;
    dragged.fy = 140;

    simulation.alpha(themeGraphTokens.forceDragAlpha);
    for (let index = 0; index < 8; index += 1) {
      simulation.tick();
      constrainDistantGraphForceNodes(
        boundedNodes,
        themeGraphTokens.forceDistantDragMaxDisplacementPx,
        nodesById,
      );
    }

    const distantDisplacement = Math.hypot(
      distant.x - distantStart.x,
      distant.y - distantStart.y,
    );
    expect(distantDisplacement).toBeGreaterThan(0);
    expect(distantDisplacement).toBeLessThanOrEqual(
      themeGraphTokens.forceDistantDragMaxDisplacementPx,
    );
    expect({ x: neighbor.x, y: neighbor.y }).not.toEqual(neighborStart);
    expect(distant.fx).toBeUndefined();
    expect(distant.fy).toBeUndefined();
  });
});
