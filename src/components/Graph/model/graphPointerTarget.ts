import { themeGraphTokens } from '@/styles/themeTokens';
import type { PositionedGraphNode } from './graphLayout';
import type { GraphPoint, GraphViewport } from './graphViewport';
import type { GraphNodePosition, GraphNodePositions } from '../store/useGraphUIStore';

export function resolveClosestGraphPointerNode(args: {
  fallbackId: string;
  fallbackPosition: GraphNodePosition;
  nodes: readonly PositionedGraphNode[];
  positions: GraphNodePositions;
  screenPoint: GraphPoint;
  viewport: GraphViewport;
}): { id: string; position: GraphNodePosition } {
  let closest = { id: args.fallbackId, position: args.fallbackPosition };
  let closestDistance = Number.POSITIVE_INFINITY;

  for (const node of args.nodes) {
    const position = args.positions[node.id] ?? node;
    const deltaX = args.viewport.x + position.x * args.viewport.zoom - args.screenPoint.x;
    const deltaY = args.viewport.y + position.y * args.viewport.zoom - args.screenPoint.y;
    const distance = deltaX * deltaX + deltaY * deltaY;
    if (distance >= closestDistance) continue;
    closest = { id: node.id, position };
    closestDistance = distance;
  }

  return closestDistance <= themeGraphTokens.nodeHitRadiusPx ** 2
    ? closest
    : { id: args.fallbackId, position: args.fallbackPosition };
}
