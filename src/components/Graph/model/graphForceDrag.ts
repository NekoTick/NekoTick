import type { PositionedGraphEdge } from './graphLayout';
import type { GraphForceNode } from './graphForces';
import type { GraphNodePosition } from '../store/useGraphUIStore';

export type BoundedGraphForceNodes = Map<string, GraphNodePosition>;

export function createDistantGraphForceBounds(args: {
  edges: readonly PositionedGraphEdge[];
  id: string;
  nodesById: ReadonlyMap<string, GraphForceNode>;
}): BoundedGraphForceNodes {
  const localNodeIds = new Set([args.id]);
  for (const edge of args.edges) {
    if (edge.source.id === args.id) localNodeIds.add(edge.target.id);
    if (edge.target.id === args.id) localNodeIds.add(edge.source.id);
  }

  const boundedNodes: BoundedGraphForceNodes = new Map();
  for (const [nodeId, node] of args.nodesById) {
    if (localNodeIds.has(nodeId)) continue;
    boundedNodes.set(nodeId, { x: node.x, y: node.y });
  }
  return boundedNodes;
}

export function constrainDistantGraphForceNodes(
  boundedNodes: BoundedGraphForceNodes,
  maxDisplacement: number,
  nodesById: ReadonlyMap<string, GraphForceNode>,
) {
  for (const [id, origin] of boundedNodes) {
    const node = nodesById.get(id);
    if (!node) continue;
    const deltaX = node.x - origin.x;
    const deltaY = node.y - origin.y;
    const displacement = Math.hypot(deltaX, deltaY);
    if (displacement <= maxDisplacement) continue;
    const scale = maxDisplacement / displacement;
    node.x = origin.x + deltaX * scale;
    node.y = origin.y + deltaY * scale;
    const outwardSpeed = ((node.vx ?? 0) * deltaX + (node.vy ?? 0) * deltaY)
      / displacement;
    if (outwardSpeed <= 0) continue;
    node.vx = (node.vx ?? 0) - outwardSpeed * deltaX / displacement;
    node.vy = (node.vy ?? 0) - outwardSpeed * deltaY / displacement;
  }
}
