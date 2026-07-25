import type { GraphForceNode } from './graphForces';
import { setGraphNodePosition } from './graphPositionSnapshot';
import type { GraphNodePosition, GraphNodePositions } from '../store/useGraphUIStore';

export function pinGraphForceNode(args: {
  id: string;
  nodesById: ReadonlyMap<string, GraphForceNode>;
  position: GraphNodePosition;
  positions: GraphNodePositions;
  retainedPositions: GraphNodePositions;
}): boolean {
  const node = args.nodesById.get(args.id);
  if (!node) return false;
  node.x = args.position.x;
  node.y = args.position.y;
  node.fx = args.position.x;
  node.fy = args.position.y;
  node.vx = 0;
  node.vy = 0;
  setGraphNodePosition(args.positions, args.id, args.position);
  setGraphNodePosition(args.retainedPositions, args.id, args.position);
  return true;
}

export function applyGraphForceOverrides(args: {
  nodesById: ReadonlyMap<string, GraphForceNode>;
  overrides: GraphNodePositions;
  positions: GraphNodePositions;
  retainedPositions: GraphNodePositions;
}): boolean {
  let changed = false;
  for (const [id, position] of Object.entries(args.overrides)) {
    const node = args.nodesById.get(id);
    if (!node || (node.x === position.x && node.y === position.y)) continue;
    node.x = position.x;
    node.y = position.y;
    if (node.fx !== null && node.fx !== undefined) node.fx = position.x;
    if (node.fy !== null && node.fy !== undefined) node.fy = position.y;
    node.vx = 0;
    node.vy = 0;
    setGraphNodePosition(args.positions, id, position);
    setGraphNodePosition(args.retainedPositions, id, position);
    changed = true;
  }
  return changed;
}
