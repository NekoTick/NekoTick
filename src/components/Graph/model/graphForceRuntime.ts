import type { Force } from 'd3-force';
import { themeGraphTokens } from '@/styles/themeTokens';
import {
  createGraphForceLinks,
  createGraphForceSimulation,
  type GraphForceLink,
  type GraphForceNode,
} from './graphForces';
import {
  createGraphForceLayoutStability,
  createInitialGraphForceLayout,
  isGraphForceLayoutStable,
  releaseGraphForceAnchors,
} from './graphForceInitialization';
import { selectRepresentativeGraphEdges } from './graphEdgeSampling';
import { cloneGraphNodePositions } from './graphPositionSnapshot';
import type { PositionedNoteGraph } from './graphLayout';
import type { GraphNodePositions } from '../store/useGraphUIStore';

const GRAPH_FORCE_NAMES = ['charge', 'link', 'collision', 'x', 'y'] as const;

export type GraphForceRegistry = Map<string, Force<GraphForceNode, GraphForceLink>>;

export function createGraphForceInitializationTracker(nodes: ReadonlyMap<string, GraphForceNode>) {
  const stability = createGraphForceLayoutStability(nodes.values());
  return {
    observe: () => isGraphForceLayoutStable(stability, nodes.values()),
  };
}

export function finalizeGraphForceInitialization(args: {
  anchoredNodes: Iterable<GraphForceNode | undefined>;
  onFinalPositions?: (positions: GraphNodePositions) => void;
  onPositionsCommit: (positions: GraphNodePositions) => void;
  onPositionsFrame: (positions: GraphNodePositions, forceEdgeUpdate?: boolean) => void;
  onPositionsInitialized?: (positions: GraphNodePositions) => void;
  readPositions: () => GraphNodePositions;
}) {
  releaseGraphForceAnchors(args.anchoredNodes);
  const positions = args.readPositions();
  args.onPositionsFrame(positions, true);
  args.onFinalPositions?.(positions);
  args.onPositionsInitialized?.(positions);
  args.onPositionsCommit(cloneGraphNodePositions(positions));
  return positions;
}

export interface GraphForceTickRunner {
  cancel: () => void;
  pause: () => void;
  resume: () => void;
}

export function getGraphReducedMotionTickPlan(nodeCount: number, edgeCount: number) {
  const synchronous = nodeCount < themeGraphTokens.forceReducedMotionChunkNodeThreshold
    && edgeCount < themeGraphTokens.forceReducedMotionChunkEdgeThreshold;
  return {
    synchronous,
    tickCount: themeGraphTokens.forceReducedMotionTickCount,
    ticksPerChunk: synchronous
      ? themeGraphTokens.forceReducedMotionTickCount
      : themeGraphTokens.forceReducedMotionTickChunkSize,
  };
}

export function createGraphForceTickRunner(args: {
  onComplete: () => void;
  plan: ReturnType<typeof getGraphReducedMotionTickPlan>;
  simulation: ReturnType<typeof createGraphForceSimulation>;
}): GraphForceTickRunner {
  let cancelled = false;
  let complete = false;
  let frameId: number | null = null;
  let remainingTicks = args.plan.tickCount;
  const runChunk = () => {
    frameId = null;
    if (cancelled || complete) return;
    const tickCount = Math.min(remainingTicks, args.plan.ticksPerChunk);
    args.simulation.tick(tickCount);
    remainingTicks -= tickCount;
    if (remainingTicks <= 0) {
      complete = true;
      args.onComplete();
      return;
    }
    frameId = window.requestAnimationFrame(runChunk);
  };
  return {
    cancel: () => {
      cancelled = true;
      if (frameId !== null) window.cancelAnimationFrame(frameId);
      frameId = null;
    },
    pause: () => {
      if (frameId !== null) window.cancelAnimationFrame(frameId);
      frameId = null;
    },
    resume: () => {
      if (cancelled || complete || frameId !== null) return;
      if (args.plan.synchronous) runChunk();
      else frameId = window.requestAnimationFrame(runChunk);
    },
  };
}

export function createGraphForceRuntime(
  graph: PositionedNoteGraph,
  initialPositions: GraphNodePositions,
  useOverrides: boolean,
) {
  const layout = createInitialGraphForceLayout(graph, initialPositions, useOverrides);
  const nodesById = new Map(layout.nodes.map((node) => [node.id, node]));
  const simulation = createGraphForceSimulation(
    layout.nodes,
    createGraphForceLinks(
      selectRepresentativeGraphEdges(
        graph.edges,
        themeGraphTokens.forceMaxLayoutEdges,
      ).map((edge) => ({
        source: edge.source.id,
        target: edge.target.id,
      })),
    ),
  );
  if (layout.hasCompleteLayout) simulation.alpha(themeGraphTokens.forceMinimumAlpha);
  const forces: GraphForceRegistry = new Map(GRAPH_FORCE_NAMES.flatMap((name) => {
    const force = simulation.force(name);
    return force ? [[name, force]] : [];
  }));
  return { ...layout, forces, nodesById, simulation };
}

export function restoreGraphForces(
  simulation: ReturnType<typeof createGraphForceSimulation>,
  forces: GraphForceRegistry,
) {
  forces.forEach((force, name) => simulation.force(name, force));
}

export function suspendGraphForces(
  simulation: ReturnType<typeof createGraphForceSimulation>,
) {
  GRAPH_FORCE_NAMES.forEach((name) => simulation.force(name, null));
}
