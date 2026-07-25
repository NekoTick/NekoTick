import type { PositionedGraphNode } from './graphLayout';

export type GraphNavigationDirection = 'left' | 'right' | 'up' | 'down';

const DIRECTION_VECTOR: Record<GraphNavigationDirection, { x: number; y: number }> = {
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
};

export function findGraphNodeInDirection(
  nodes: readonly PositionedGraphNode[],
  currentId: string,
  direction: GraphNavigationDirection,
): PositionedGraphNode | null {
  const current = nodes.find((node) => node.id === currentId);
  if (!current) return null;
  const vector = DIRECTION_VECTOR[direction];
  let best: { node: PositionedGraphNode; score: number; distance: number } | null = null;

  for (const node of nodes) {
    if (node.id === current.id) continue;
    const deltaX = node.x - current.x;
    const deltaY = node.y - current.y;
    const forward = deltaX * vector.x + deltaY * vector.y;
    if (forward <= 0) continue;
    const perpendicular = Math.abs(deltaX * vector.y - deltaY * vector.x);
    const distance = Math.hypot(deltaX, deltaY);
    const score = forward + perpendicular * 2;
    if (!best || score < best.score || (score === best.score && distance < best.distance)) {
      best = { node, score, distance };
    }
  }

  return best?.node ?? null;
}
