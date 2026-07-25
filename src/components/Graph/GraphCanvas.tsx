import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type WheelEvent as ReactWheelEvent,
} from 'react';
import { WhiteboardZoomControls } from '@/components/Whiteboard/components/toolbar';
import { useI18n } from '@/lib/i18n';
import { themeGraphTokens } from '@/styles/themeTokens';
import { GraphCanvasScene } from './canvas/GraphCanvasScene';
import {
  applyDraggedGraphNodePosition,
  applyGraphPositions,
  clearGraphNodePositionElements,
} from './canvas/applyGraphPositions';
import { useGraphCanvasGeometry } from './hooks/useGraphCanvasGeometry';
import { useGraphCanvasPointerController } from './hooks/useGraphCanvasPointerController';
import { useGraphCanvasSize } from './hooks/useGraphCanvasSize';
import { useGraphForceSimulation } from './hooks/useGraphForceSimulation';
import { useGraphHoverInteractions } from './hooks/useGraphHoverInteractions';
import { useGraphKeyboardNavigation } from './hooks/useGraphKeyboardNavigation';
import { useGraphNodePointerTarget } from './hooks/useGraphNodePointerTarget';
import { useGraphViewportController } from './hooks/useGraphViewportController';
import type { PositionedNoteGraph } from './model/graphLayout';
import { getGraphTopologyKey } from './model/graphTopology';
import type { GraphNodePositions, GraphNodePosition } from './store/useGraphUIStore';

interface GraphCanvasProps {
  active?: boolean;
  currentPath?: string | null;
  graph: PositionedNoteGraph;
  topOverlayVisible?: boolean;
  positionOverrides: GraphNodePositions;
  selectedPath: string | null;
  onOpenPath: (path: string) => void;
  onPositionCommit: (path: string, position: GraphNodePosition) => void;
  onPositionsCommit: (positions: GraphNodePositions) => void;
  onSelectPath: (path: string | null) => void;
}

export function GraphCanvas(props: GraphCanvasProps) {
  const { t } = useI18n();
  const svgRef = useRef<SVGSVGElement | null>(null);
  const canvasSize = useGraphCanvasSize(svgRef);
  const graphTopologyKey = useMemo(
    () => getGraphTopologyKey(props.graph),
    [props.graph.edges, props.graph.nodes],
  );
  const graphRef = useRef(props.graph);
  const graphTopologyKeyRef = useRef(graphTopologyKey);
  const forceFrameRef = useRef(0);
  const userPositionedViewportRef = useRef(false);
  graphRef.current = props.graph;
  useLayoutEffect(() => {
    if (graphTopologyKeyRef.current === graphTopologyKey) return;
    clearGraphNodePositionElements(svgRef.current);
    graphTopologyKeyRef.current = graphTopologyKey;
    forceFrameRef.current = 0;
  }, [graphTopologyKey]);
  const [forceLayoutVersion, setForceLayoutVersion] = useState(0);
  const [labelsReadyGraphKey, setLabelsReadyGraphKey] = useState<string | null>(null);
  const [labelLayoutRevision, setLabelLayoutRevision] = useState(0);
  const [dragPosition, setDragPosition] = useState<{
    id: string;
    position: GraphNodePosition;
  } | null>(null);
  const dragPositionRef = useRef<typeof dragPosition>(null);
  dragPositionRef.current = dragPosition;
  const {
    clearPointerHover,
    handleFocusChange: handleHoverFocusChange,
    handleHoverChange,
    handlePointerLeave,
    handlePointerMove: handleHoverPointerMove,
    visibleHoveredPath,
  } = useGraphHoverInteractions(graphTopologyKey);
  const highlightedPathRef = useRef<string | null>(null);
  highlightedPathRef.current = dragPosition?.id ?? visibleHoveredPath ?? props.selectedPath;
  const handlePositionsFrame = useCallback((positions: GraphNodePositions, forceEdgeUpdate = false) => {
    const edgeFrameInterval = graphRef.current.edges.length >= themeGraphTokens.denseEdgeThreshold
      ? themeGraphTokens.denseEdgeAnimationFrameInterval
      : themeGraphTokens.edgeAnimationFrameInterval;
    const updateAllEdges = forceEdgeUpdate || forceFrameRef.current % edgeFrameInterval === 0;
    const edgeUpdateMode = dragPositionRef.current
      ? 'active'
      : updateAllEdges ? 'all' : highlightedPathRef.current ? 'active' : 'none';
    forceFrameRef.current += 1;
    applyGraphPositions(svgRef.current, positions, edgeUpdateMode);
  }, []);
  const handlePositionsInitialized = useCallback(() => {
    setLabelsReadyGraphKey(graphTopologyKeyRef.current);
    setForceLayoutVersion((current) => current + 1);
  }, []);
  const forceSimulation = useGraphForceSimulation({
    active: props.active !== false,
    dragPosition,
    graph: props.graph,
    onDraggedPositionFrame: (id, position) => {
      applyDraggedGraphNodePosition(svgRef.current, id, position);
    },
    onPositionsCommit: props.onPositionsCommit,
    onPositionsFrame: handlePositionsFrame,
    onPositionsInitialized: handlePositionsInitialized,
    positionOverrides: props.positionOverrides,
  });
  const handlePositionCommit = useCallback((path: string, position: GraphNodePosition) => {
    forceSimulation.updateCommittedPosition(path, position);
    applyGraphPositions(svgRef.current, forceSimulation.positionsRef.current);
    setForceLayoutVersion((current) => current + 1);
    props.onPositionCommit(path, position);
  }, [forceSimulation.positionsRef, forceSimulation.updateCommittedPosition, props.onPositionCommit]);
  const handlePositionNudge = useCallback((path: string, delta: GraphNodePosition) => {
    const current = forceSimulation.positionsRef.current[path];
    if (!current) return;
    userPositionedViewportRef.current = true;
    handlePositionCommit(path, {
      x: current.x + delta.x,
      y: current.y + delta.y,
    });
  }, [forceSimulation.positionsRef, handlePositionCommit]);
  const geometry = useGraphCanvasGeometry({
    dragPosition,
    graph: props.graph,
    positionOverrides: props.positionOverrides,
    simulationPositions: forceSimulation.positionsRef.current,
    simulationVersion: forceLayoutVersion,
  });
  const viewportNodes = useMemo(() => geometry.nodes.map((node) => {
    const position = forceSimulation.positionsRef.current[node.id];
    return position ? { ...node, ...position } : node;
  }), [
    forceLayoutVersion,
    forceSimulation.positionsRef,
    geometry.nodes,
    props.active,
    props.selectedPath,
  ]);
  const viewportActivityKey = props.active === false && !userPositionedViewportRef.current
    ? 'inactive'
    : 'active';
  const handleViewportSettled = useCallback(() => {
    setLabelLayoutRevision((current) => current + 1);
  }, []);
  const viewportController = useGraphViewportController({
    canvasSize,
    nodeKey: `${geometry.nodeKey}\n${forceLayoutVersion}\n${viewportActivityKey}`,
    nodes: viewportNodes,
    onViewportSettled: handleViewportSettled,
    selectedPath: props.selectedPath,
    svgRef,
    active: props.active !== false,
    userPositionedViewportRef,
  });
  const keyboardNavigation = useGraphKeyboardNavigation({
    currentPath: props.currentPath ?? null,
    nodes: viewportNodes,
    onFocusChange: handleHoverFocusChange,
    onSelectPath: props.onSelectPath,
    selectedPath: props.selectedPath,
    svgRef,
  });
  const getNodePosition = useCallback((path: string, fallback: GraphNodePosition) => (
    forceSimulation.positionsRef.current[path] ?? fallback
  ), [forceSimulation.positionsRef]);
  const pointerInteractions = useGraphCanvasPointerController({
    active: props.active !== false,
    clearPointerHover,
    getNodePosition,
    handleHoverPointerMove,
    onDragPosition: forceSimulation.updateDragPosition,
    onOpenPath: props.onOpenPath,
    onPositionCommit: handlePositionCommit,
    onReleaseDrag: forceSimulation.releaseDragPosition,
    onSelectPath: keyboardNavigation.handleSelectPath,
    onViewportSettled: handleViewportSettled,
    setDragPosition,
    svgRef,
    userPositionedViewportRef,
    viewportController,
  });
  const nodePointerTarget = useGraphNodePointerTarget({
    getNodePosition,
    getViewport: viewportController.getViewport,
    graphRef,
    onHoverChange: handleHoverChange,
    onStartNodeDrag: pointerInteractions.startNodeDrag,
    positionsRef: forceSimulation.positionsRef,
    svgRef,
  });
  useLayoutEffect(() => {
    const discardedDrag = pointerInteractions.discardCurrentInteraction();
    if (discardedDrag?.moved) {
      forceSimulation.updateCommittedPosition(
        discardedDrag.id,
        discardedDrag.startPosition,
      );
      applyGraphPositions(svgRef.current, forceSimulation.positionsRef.current);
    }
    setDragPosition(null);
  }, [
    forceSimulation.positionsRef,
    forceSimulation.updateCommittedPosition,
    graphTopologyKey,
    pointerInteractions.discardCurrentInteraction,
  ]);
  useLayoutEffect(() => {
    if (!highlightedPathRef.current) return;
    applyGraphPositions(svgRef.current, forceSimulation.positionsRef.current, 'active');
  }, [
    dragPosition?.id,
    forceSimulation.positionsRef,
    graphTopologyKey,
    props.selectedPath,
    visibleHoveredPath,
  ]);
  const handleWheel = useCallback((event: ReactWheelEvent<SVGSVGElement>) => {
    clearPointerHover(null);
    userPositionedViewportRef.current = true;
    viewportController.cancelPendingFit();
    viewportController.handleWheel(event);
  }, [clearPointerHover, viewportController.cancelPendingFit, viewportController.handleWheel]);
  const markViewportPositioned = useCallback(() => {
    userPositionedViewportRef.current = true;
    viewportController.cancelPendingFit();
  }, [viewportController.cancelPendingFit]);
  const handleFitView = useCallback(() => {
    userPositionedViewportRef.current = false;
    viewportController.fitView();
  }, [viewportController.fitView]);
  const handleResetZoom = useCallback(() => {
    markViewportPositioned();
    viewportController.resetZoom();
  }, [markViewportPositioned, viewportController.resetZoom]);
  const handleZoomIn = useCallback(() => {
    markViewportPositioned();
    viewportController.zoomIn();
  }, [markViewportPositioned, viewportController.zoomIn]);
  const handleZoomOut = useCallback(() => {
    markViewportPositioned();
    viewportController.zoomOut();
  }, [markViewportPositioned, viewportController.zoomOut]);
  const handleZoomChange = useCallback((delta: number) => {
    if (delta > 0) handleZoomIn();
    else if (delta < 0) handleZoomOut();
  }, [handleZoomIn, handleZoomOut]);

  return (
    <div className="relative h-full min-h-0 overflow-hidden">
      <svg
        ref={svgRef}
        role="group"
        aria-label={t('app.viewGraph')}
        className="h-full w-full touch-none cursor-grab select-none active:cursor-grabbing"
        onPointerDown={pointerInteractions.startPan}
        onPointerMove={pointerInteractions.handlePointerMove}
        onPointerUp={pointerInteractions.finishPointerInteraction}
        onPointerCancel={pointerInteractions.cancelPointerInteraction}
        onLostPointerCapture={pointerInteractions.cancelPointerInteraction}
        onPointerLeave={handlePointerLeave}
        onWheel={handleWheel}
      >
        <GraphCanvasScene
          currentPath={props.currentPath ?? null}
          dragPositionId={dragPosition?.id ?? null}
          edges={geometry.edges}
          focusablePath={keyboardNavigation.focusablePath}
          hoveredPath={visibleHoveredPath}
          labelLayoutRevision={labelLayoutRevision}
          topOverlayVisible={props.topOverlayVisible}
          labelsReady={labelsReadyGraphKey === graphTopologyKey}
          nodes={geometry.nodes}
          onHoverChange={handleHoverChange}
          onHoverStart={nodePointerTarget.handleHoverStart}
          onFocusChange={keyboardNavigation.handleFocusChange}
          onNavigate={keyboardNavigation.handleNavigate}
          onOpen={props.onOpenPath}
          onPositionNudge={handlePositionNudge}
          onSelect={keyboardNavigation.handleSelectPath}
          onStartDrag={nodePointerTarget.handleStartDrag}
          selectedPath={props.selectedPath}
          viewport={viewportController.viewport}
          viewportSize={canvasSize}
        />
      </svg>
      <WhiteboardZoomControls
        active={props.active !== false}
        viewport={viewportController.viewport}
        onFitView={handleFitView}
        onResetView={handleResetZoom}
        onZoomChange={handleZoomChange}
      />
    </div>
  );
}
