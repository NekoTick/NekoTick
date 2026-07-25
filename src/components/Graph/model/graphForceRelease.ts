import { themeGraphTokens } from '@/styles/themeTokens';
import type { PositionedGraphEdge } from './graphLayout';
import type { GraphForceNode, createGraphForceSimulation } from './graphForces';
import {
  beginGraphForceReleaseDiagnostic,
  type GraphForceReleaseDiagnostic,
} from './graphForceReleaseDiagnostics';
import { cloneGraphNodePositions } from './graphPositionSnapshot';
import type { GraphNodePositions } from '../store/useGraphUIStore';

export function releaseGraphForceNode(args: {
  edges: readonly PositionedGraphEdge[];
  id: string;
  keepFixed: boolean;
  moved: boolean;
  nodesById: ReadonlyMap<string, GraphForceNode>;
  onPositionsCommit: (positions: GraphNodePositions) => void;
  onPositionsFrame: (positions: GraphNodePositions, forceEdgeUpdate?: boolean) => void;
  readPositions: () => GraphNodePositions;
  reducedMotion: boolean;
  simulation: ReturnType<typeof createGraphForceSimulation>;
}): GraphForceReleaseDiagnostic | null {
  const node = args.nodesById.get(args.id);
  if (!args.moved) {
    if (node && !args.keepFixed) {
      node.fx = null;
      node.fy = null;
    }
    args.simulation.alphaTarget(0);
    return null;
  }
  if (node) {
    node.fx = node.x;
    node.fy = node.y;
  }
  const releasedNodeIds = new Set<string>([args.id]);
  for (const edge of args.edges) {
    if (edge.source.id === args.id) releasedNodeIds.add(edge.target.id);
    if (edge.target.id === args.id) releasedNodeIds.add(edge.source.id);
  }
  for (const [nodeId, forceNode] of args.nodesById) {
    if (!releasedNodeIds.has(nodeId) || nodeId === args.id) {
      forceNode.vx = 0;
      forceNode.vy = 0;
      continue;
    }
    const speed = Math.hypot(forceNode.vx ?? 0, forceNode.vy ?? 0);
    if (speed <= themeGraphTokens.forceReleaseVelocityMaxPxPerFrame) continue;
    const scale = themeGraphTokens.forceReleaseVelocityMaxPxPerFrame / speed;
    forceNode.vx = (forceNode.vx ?? 0) * scale;
    forceNode.vy = (forceNode.vy ?? 0) * scale;
  }
  args.simulation
    .alphaDecay(themeGraphTokens.forceReleaseAlphaDecay)
    .velocityDecay(themeGraphTokens.forceReleaseVelocityDecay)
    .alphaTarget(0);
  if (args.reducedMotion) {
    for (const forceNode of args.nodesById.values()) {
      forceNode.vx = 0;
      forceNode.vy = 0;
    }
    args.simulation.stop();
    const positions = args.readPositions();
    args.onPositionsFrame(positions, true);
    args.onPositionsCommit(cloneGraphNodePositions(positions));
    return null;
  }
  return beginGraphForceReleaseDiagnostic({
    alpha: args.simulation.alpha(),
    id: args.id,
    nodeIds: releasedNodeIds,
    nodesById: args.nodesById,
  });
}
