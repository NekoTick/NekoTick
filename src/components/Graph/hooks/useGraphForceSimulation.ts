import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { logDiagnostic } from '@/lib/diagnostics/diagnosticsLog';
import { themeGraphTokens } from '@/styles/themeTokens';
import { createGraphForceSimulation, type GraphForceNode } from '../model/graphForces';
import { setGraphNodePosition } from '../model/graphPositionSnapshot';
import {
  createGraphForceInitializationTracker,
  createGraphForceRuntime,
  restoreGraphForces,
  suspendGraphForces,
  type GraphForceRegistry,
} from '../model/graphForceRuntime';
import {
  finishGraphForceReleaseDiagnostic,
  type GraphForceReleaseDiagnostic,
} from '../model/graphForceReleaseDiagnostics';
import { releaseGraphForceNode } from '../model/graphForceRelease';
import { applyGraphForceOverrides, pinGraphForceNode } from '../model/applyGraphForceOverrides';
import { createInitialGraphForcePositions } from '../model/graphForceInitialization';
import type { PositionedNoteGraph } from '../model/graphLayout';
import { MAX_GRAPH_POSITION_ENTRIES } from '../model/graphPositionPersistence';
import { getGraphTopologyKey } from '../model/graphTopology';
import type { GraphNodePosition, GraphNodePositions } from '../store/useGraphUIStore';
import { useGraphInitialForceLayout } from './useGraphInitialForceLayout';
import { prefersGraphReducedMotion, useGraphSimulationActivity } from './useGraphSimulationActivity';

export function useGraphForceSimulation(args: {
  active: boolean;
  dragPosition: { id: string; position: GraphNodePosition } | null;
  graph: PositionedNoteGraph;
  onPositionsCommit: (positions: GraphNodePositions) => void;
  onDraggedPositionFrame: (id: string, position: GraphNodePosition) => void;
  onPositionsFrame: (positions: GraphNodePositions, forceEdgeUpdate?: boolean) => void;
  onPositionsInitialized: (positions: GraphNodePositions) => void;
  positionOverrides: GraphNodePositions;
}) {
  const positionsRef = useRef<GraphNodePositions>({});
  const retainedPositionsRef = useRef<GraphNodePositions>({});
  const nodesByIdRef = useRef(new Map<string, GraphForceNode>());
  const simulationRef = useRef<ReturnType<typeof createGraphForceSimulation> | null>(null);
  const previousDragIdRef = useRef<string | null>(null);
  const movedDragIdRef = useRef<string | null>(null);
  const releasedDragIdRef = useRef<string | null>(null);
  const forcesRef = useRef<GraphForceRegistry>(new Map());
  const forcesSuspendedRef = useRef(false);
  const releaseDiagnosticRef = useRef<GraphForceReleaseDiagnostic | null>(null);
  const argsRef = useRef(args);
  const dragRef = useRef(args.dragPosition);
  argsRef.current = args;
  dragRef.current = args.dragPosition;

  const graphKey = useMemo(
    () => getGraphTopologyKey(args.graph),
    [args.graph.edges, args.graph.nodes],
  );

  const readPositions = useCallback((): GraphNodePositions => {
    const positions = positionsRef.current;
    const retainedPositions = retainedPositionsRef.current;
    for (const [id, node] of nodesByIdRef.current) {
      setGraphNodePosition(retainedPositions, id, node);
      positions[id] = retainedPositions[id]!;
    }
    return positions;
  }, []);
  const initialLayout = useGraphInitialForceLayout({
    nodesByIdRef,
    onPositionsCommit: args.onPositionsCommit,
    onPositionsFrame: args.onPositionsFrame,
    onPositionsInitialized: args.onPositionsInitialized,
    readPositions,
    simulationRef,
  });

  const initializeSimulation = (
    useOverrides = true,
    carriedPositions: GraphNodePositions = {},
  ) => {
    const interruptedDrag = dragRef.current
      && movedDragIdRef.current === dragRef.current.id
      ? dragRef.current
      : null;
    simulationRef.current?.stop();
    initialLayout.cancel();
    dragRef.current = null;
    movedDragIdRef.current = null;
    const graphIds = argsRef.current.graph.nodes.map((node) => node.id);
    const retainedIds = [
      ...new Set([...graphIds, ...Object.keys(retainedPositionsRef.current)]),
    ];
    for (const id of retainedIds.slice(MAX_GRAPH_POSITION_ENTRIES)) {
      delete retainedPositionsRef.current[id];
    }
    const initialPositions = createInitialGraphForcePositions({
      carriedPositions,
      interruptedDrag,
      positionOverrides: argsRef.current.positionOverrides,
      retainedPositions: retainedPositionsRef.current,
      useOverrides,
    });
    const {
      anchoredNodes,
      forces,
      hasCompleteLayout,
      nodesById,
      simulation,
    } = createGraphForceRuntime(
      argsRef.current.graph,
      initialPositions,
      useOverrides,
    );
    nodesByIdRef.current = nodesById;
    forcesRef.current = forces;
    forcesSuspendedRef.current = false;
    const initializationTracker = createGraphForceInitializationTracker(nodesById);
    const needsInitialSimulation = initialLayout.reset({
      anchoredNodes,
      hasCompleteLayout,
      nodeCount: nodesById.size,
    });
    releasedDragIdRef.current = null;
    releaseDiagnosticRef.current = null;
    simulation.on('tick', () => {
      const positions = readPositions();
      positionsRef.current = positions;
      argsRef.current.onPositionsFrame(positions);
      if (
        initialLayout.pendingRef.current
        && !initialLayout.readyRef.current
        && !dragRef.current
        && initializationTracker.observe()
      ) initialLayout.markReady(positions);
    });
    simulation.on('end', () => {
      if (dragRef.current) return;
      initialLayout.finish(simulation, (positions) => {
        if (!releaseDiagnosticRef.current) return;
        finishGraphForceReleaseDiagnostic(releaseDiagnosticRef.current, positions);
        releaseDiagnosticRef.current = null;
      });
    });
    if (!hasCompleteLayout) {
      for (const node of anchoredNodes) {
        node.fx = node.x;
        node.fy = node.y;
      }
    }
    const positions = readPositions();
    positionsRef.current = positions;
    argsRef.current.onPositionsFrame(positions, true);
    simulationRef.current = simulation;
    if (
      needsInitialSimulation
      && argsRef.current.active
      && document.visibilityState !== 'hidden'
    ) {
      if (prefersGraphReducedMotion()) {
        initialLayout.settle(simulation, nodesById.size, argsRef.current.graph.edges.length);
      }
      else simulation.alpha(1).restart();
    } else if (!needsInitialSimulation) {
      initialLayout.finishImmediate(positions, !hasCompleteLayout);
    }
  };

  useLayoutEffect(() => {
    previousDragIdRef.current = null;
    positionsRef.current = {};
    initializeSimulation(true, retainedPositionsRef.current);
  }, [graphKey]);

  const pauseSimulation = useCallback(() => {
    simulationRef.current?.stop();
    initialLayout.pause();
  }, [initialLayout.pause]);
  const resumeSimulation = useCallback(() => {
    const simulation = simulationRef.current;
    if (!simulation || document.visibilityState === 'hidden') return;
    if (initialLayout.pendingRef.current && prefersGraphReducedMotion()) {
      initialLayout.settle(simulation, nodesByIdRef.current.size, argsRef.current.graph.edges.length);
      return;
    }
    if (
      initialLayout.pendingRef.current
      || releaseDiagnosticRef.current
      || dragRef.current
    ) {
      simulation.restart();
    }
  }, [initialLayout.pendingRef, initialLayout.settle]);
  useGraphSimulationActivity(args.active, pauseSimulation, resumeSimulation);

  const releaseDragPosition = (id: string) => {
    const simulation = simulationRef.current;
    const isCurrentDrag = previousDragIdRef.current === id
      || movedDragIdRef.current === id
      || dragRef.current?.id === id;
    if (!simulation || !isCurrentDrag || releasedDragIdRef.current === id) return;
    const moved = movedDragIdRef.current === id;
    movedDragIdRef.current = null;
    if (moved) {
      suspendGraphForces(simulation);
      forcesSuspendedRef.current = true;
    }
    releaseDiagnosticRef.current = releaseGraphForceNode({
      edges: argsRef.current.graph.edges,
      id,
      keepFixed: initialLayout.pendingRef.current
        && initialLayout.anchoredNodeIdsRef.current.includes(id),
      moved,
      nodesById: nodesByIdRef.current,
      onPositionsCommit: argsRef.current.onPositionsCommit,
      onPositionsFrame: argsRef.current.onPositionsFrame,
      readPositions,
      reducedMotion: prefersGraphReducedMotion(),
      simulation,
    });
    releasedDragIdRef.current = id;
  };

  useEffect(() => {
    const simulation = simulationRef.current;
    if (!simulation) return;
    const drag = args.dragPosition;
    const previousDragId = previousDragIdRef.current;
    if (drag) {
      releasedDragIdRef.current = null;
      if (releaseDiagnosticRef.current) {
        logDiagnostic('graph', 'force-release-interrupted', {
          durationMs: Math.round(performance.now() - releaseDiagnosticRef.current.startedAt),
          id: releaseDiagnosticRef.current.id,
        });
        releaseDiagnosticRef.current = null;
      }
      if (forcesSuspendedRef.current) {
        restoreGraphForces(simulation, forcesRef.current);
        forcesSuspendedRef.current = false;
      }
      const node = nodesByIdRef.current.get(drag.id);
      if (node) {
        node.fx = drag.position.x;
        node.fy = drag.position.y;
      }
      if (argsRef.current.active && document.visibilityState !== 'hidden') {
        simulation
          .alphaDecay(themeGraphTokens.forceAlphaDecay)
          .velocityDecay(themeGraphTokens.forceVelocityDecay);
      }
    } else if (previousDragId) releaseDragPosition(previousDragId);
    previousDragIdRef.current = drag?.id ?? null;
  }, [args.dragPosition]);

  useEffect(() => {
    if (dragRef.current) return;
    if (releaseDiagnosticRef.current) {
      logDiagnostic('graph', 'position-overrides-deferred', {
        id: releaseDiagnosticRef.current.id,
        positionCount: Object.keys(args.positionOverrides).length,
      });
      return;
    }
    if (applyGraphForceOverrides({
      nodesById: nodesByIdRef.current,
      overrides: args.positionOverrides,
      positions: positionsRef.current,
      retainedPositions: retainedPositionsRef.current,
    })) argsRef.current.onPositionsFrame(positionsRef.current, true);
  }, [args.positionOverrides]);

  useEffect(() => () => {
    simulationRef.current?.stop();
  }, []);

  const updateCommittedPosition = useCallback((id: string, position: GraphNodePosition) => {
    pinGraphForceNode({
      id,
      nodesById: nodesByIdRef.current,
      position,
      positions: positionsRef.current,
      retainedPositions: retainedPositionsRef.current,
    });
  }, []);

  const updateDragPosition = useCallback((id: string, position: GraphNodePosition) => {
    const simulation = simulationRef.current;
    if (!simulation || !pinGraphForceNode({
      id,
      nodesById: nodesByIdRef.current,
      position,
      positions: positionsRef.current,
      retainedPositions: retainedPositionsRef.current,
    })) return;
    movedDragIdRef.current = id;
    releasedDragIdRef.current = null;
    argsRef.current.onDraggedPositionFrame(id, position);
    if (argsRef.current.active && document.visibilityState !== 'hidden') {
      if (prefersGraphReducedMotion()) {
        simulation.stop();
        return;
      }
      simulation
        .alpha(Math.max(simulation.alpha(), themeGraphTokens.forceDragAlpha))
        .alphaTarget(themeGraphTokens.forceDragAlphaTarget)
      .restart();
    }
  }, []);
  return { positionsRef, releaseDragPosition, updateCommittedPosition, updateDragPosition };
}
