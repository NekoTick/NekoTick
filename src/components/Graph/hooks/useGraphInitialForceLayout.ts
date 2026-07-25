import { useCallback, useEffect, useRef, type RefObject } from 'react';
import {
  createGraphForceTickRunner,
  finalizeGraphForceInitialization,
  getGraphReducedMotionTickPlan,
  type GraphForceTickRunner,
} from '../model/graphForceRuntime';
import { cloneGraphNodePositions } from '../model/graphPositionSnapshot';
import type { GraphForceNode, createGraphForceSimulation } from '../model/graphForces';
import type { GraphNodePositions } from '../store/useGraphUIStore';

interface GraphInitialForceLayoutCallbacks {
  onPositionsCommit: (positions: GraphNodePositions) => void;
  onPositionsFrame: (positions: GraphNodePositions, forceEdgeUpdate?: boolean) => void;
  onPositionsInitialized: (positions: GraphNodePositions) => void;
}

export function useGraphInitialForceLayout(args: GraphInitialForceLayoutCallbacks & {
  nodesByIdRef: RefObject<Map<string, GraphForceNode>>;
  readPositions: () => GraphNodePositions;
  simulationRef: RefObject<ReturnType<typeof createGraphForceSimulation> | null>;
}) {
  const callbacksRef = useRef(args);
  const anchoredNodesRef = useRef<GraphForceNode[]>([]);
  const anchoredNodeIdsRef = useRef<string[]>([]);
  const pendingRef = useRef(false);
  const readyRef = useRef(false);
  const runnerRef = useRef<GraphForceTickRunner | null>(null);
  callbacksRef.current = args;

  const cancel = useCallback(() => {
    runnerRef.current?.cancel();
    runnerRef.current = null;
  }, []);

  const reset = useCallback((options: {
    anchoredNodes: GraphForceNode[];
    hasCompleteLayout: boolean;
    nodeCount: number;
  }) => {
    cancel();
    anchoredNodesRef.current = options.anchoredNodes;
    anchoredNodeIdsRef.current = options.anchoredNodes.map((node) => node.id);
    pendingRef.current = !options.hasCompleteLayout && options.nodeCount > 1;
    readyRef.current = options.hasCompleteLayout || options.nodeCount <= 1;
    return pendingRef.current;
  }, [cancel]);

  const markReady = useCallback((positions: GraphNodePositions) => {
    if (readyRef.current) return;
    readyRef.current = true;
    callbacksRef.current.onPositionsInitialized(positions);
  }, []);

  const finish = useCallback((
    simulation: ReturnType<typeof createGraphForceSimulation>,
    onFinalPositions?: (positions: GraphNodePositions) => void,
  ) => {
    if (callbacksRef.current.simulationRef.current !== simulation) return;
    cancel();
    const wasInitialSimulation = pendingRef.current;
    const anchoredNodes = anchoredNodesRef.current;
    pendingRef.current = false;
    anchoredNodeIdsRef.current = [];
    const current = callbacksRef.current;
    finalizeGraphForceInitialization({
      anchoredNodes,
      onFinalPositions,
      onPositionsCommit: current.onPositionsCommit,
      onPositionsFrame: current.onPositionsFrame,
      onPositionsInitialized: wasInitialSimulation && !readyRef.current
        ? markReady
        : undefined,
      readPositions: current.readPositions,
    });
    anchoredNodesRef.current = [];
  }, [cancel, markReady]);

  const settle = useCallback((
    simulation: ReturnType<typeof createGraphForceSimulation>,
    nodeCount: number,
    edgeCount: number,
  ) => {
    if (!pendingRef.current) return;
    simulation.stop();
    if (runnerRef.current) {
      runnerRef.current.resume();
      return;
    }
    const runner = createGraphForceTickRunner({
      onComplete: () => finish(simulation),
      plan: getGraphReducedMotionTickPlan(nodeCount, edgeCount),
      simulation,
    });
    runnerRef.current = runner;
    runner.resume();
  }, [finish]);

  const finishImmediate = useCallback((positions: GraphNodePositions, commit: boolean) => {
    callbacksRef.current.onPositionsInitialized(positions);
    if (commit) {
      callbacksRef.current.onPositionsCommit(cloneGraphNodePositions(positions));
    }
  }, []);

  const pause = useCallback(() => runnerRef.current?.pause(), []);
  useEffect(() => cancel, [cancel]);

  return {
    anchoredNodeIdsRef,
    cancel,
    finish,
    finishImmediate,
    markReady,
    pause,
    pendingRef,
    readyRef,
    reset,
    settle,
  };
}
