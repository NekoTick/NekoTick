import { themeGraphTokens } from '@/styles/themeTokens';
import { createGraphForceNodes, type GraphForceNode } from './graphForces';
import { setGraphNodePosition } from './graphPositionSnapshot';
import type { PositionedNoteGraph } from './graphLayout';
import type { GraphNodePosition, GraphNodePositions } from '../store/useGraphUIStore';

export interface GraphForceLayoutStability {
  positions: Map<string, GraphNodePosition>;
  stableTickCount: number;
}

export function createGraphForceLayoutStability(
  nodes: Iterable<GraphForceNode>,
): GraphForceLayoutStability {
  return {
    positions: new Map([...nodes].map((node) => [node.id, { x: node.x, y: node.y }])),
    stableTickCount: 0,
  };
}

export function isGraphForceLayoutStable(
  stability: GraphForceLayoutStability,
  nodes: Iterable<GraphForceNode>,
): boolean {
  let maxDisplacement = 0;
  let maxVelocity = 0;
  for (const node of nodes) {
    const previous = stability.positions.get(node.id);
    if (previous) {
      maxDisplacement = Math.max(
        maxDisplacement,
        Math.hypot(node.x - previous.x, node.y - previous.y),
      );
    }
    maxVelocity = Math.max(maxVelocity, Math.hypot(node.vx ?? 0, node.vy ?? 0));
    stability.positions.set(node.id, { x: node.x, y: node.y });
  }
  const stationary = maxDisplacement === 0 && maxVelocity === 0;
  if (
    maxDisplacement <= themeGraphTokens.forceLabelStableDisplacementMaxPxPerFrame
    && maxVelocity <= themeGraphTokens.forceLabelStableVelocityMaxPxPerFrame
  ) stability.stableTickCount += 1;
  else stability.stableTickCount = 0;
  return stationary
    || stability.stableTickCount >= themeGraphTokens.forceLabelStableTickCount;
}

export function createInitialGraphForcePositions(args: {
  carriedPositions: GraphNodePositions;
  interruptedDrag: { id: string; position: GraphNodePosition } | null;
  positionOverrides: GraphNodePositions;
  retainedPositions: GraphNodePositions;
  useOverrides: boolean;
}): GraphNodePositions {
  const positions = args.useOverrides
    ? { ...args.carriedPositions, ...args.positionOverrides }
    : {};
  if (!args.interruptedDrag) return positions;
  setGraphNodePosition(
    args.retainedPositions,
    args.interruptedDrag.id,
    args.interruptedDrag.position,
  );
  setGraphNodePosition(
    positions,
    args.interruptedDrag.id,
    args.interruptedDrag.position,
  );
  return positions;
}

export function releaseGraphForceAnchors(nodes: Iterable<GraphForceNode | undefined>) {
  for (const node of nodes) {
    if (!node) continue;
    node.fx = null;
    node.fy = null;
  }
}

export function createInitialGraphForceLayout(
  graph: PositionedNoteGraph,
  initialPositions: GraphNodePositions,
  useOverrides: boolean,
) {
  const nodes = createGraphForceNodes(graph.nodes.map((node) => ({
    ...node,
    ...(useOverrides ? initialPositions[node.id] : null),
  })));
  const hasCompleteLayout = useOverrides && nodes.every((node) => (
    initialPositions[node.id] !== undefined
  ));
  const anchoredNodes = useOverrides
    ? nodes.filter((node) => initialPositions[node.id] !== undefined)
    : [];
  if (nodes.length > 0 && !hasCompleteLayout) {
    const centerX = themeGraphTokens.viewBoxWidthPx / 2;
    const centerY = themeGraphTokens.viewBoxHeightPx / 2;
    for (const node of nodes) {
      if (initialPositions[node.id] !== undefined) continue;
      node.x = centerX + (node.x - centerX) * themeGraphTokens.forceInitialSpreadRatio;
      node.y = centerY + (node.y - centerY) * themeGraphTokens.forceInitialSpreadRatio;
    }
  }
  return { anchoredNodes, hasCompleteLayout, nodes };
}
