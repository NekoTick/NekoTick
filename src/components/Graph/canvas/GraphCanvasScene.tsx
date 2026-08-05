import {
  memo,
  useMemo,
  type CSSProperties,
  type MouseEvent,
  type PointerEvent,
} from 'react';
import { useI18n } from '@/lib/i18n';
import {
  getGraphViewportOverlayBounds,
  type GraphPoint,
  type GraphViewport,
} from '../model/graphViewport';
import { buildGraphEdgeIndex, type GraphEdgeIndex } from '../model/graphEdgeIndex';
import type { GraphScreenBounds } from '../model/graphLabelGeometry';
import type { GraphNavigationDirection } from '../model/graphKeyboardNavigation';
import { layoutGraphLabels, type GraphLabelPlacement } from '../model/graphLabelLayout';
import type { PositionedGraphEdge, PositionedGraphNode } from '../model/graphLayout';
import type { GraphNodePosition } from '../store/useGraphUIStore';
import { themeGraphTokens } from '@/styles/themeTokens';
import { GraphEdges } from './GraphEdges';
import { GraphNode } from './GraphNode';

export function GraphCanvasScene(props: {
  currentPath: string | null;
  dragPositionId: string | null;
  edges: PositionedGraphEdge[];
  focusablePath: string | null;
  hoveredPath: string | null;
  labelsReady: boolean;
  labelLayoutRevision: number;
  maxVisibleLabels?: number;
  topOverlayVisible?: boolean;
  nodes: PositionedGraphNode[];
  onHoverChange: (path: string | null) => void;
  onHoverStart?: (event: MouseEvent<SVGGElement>, path: string, position: GraphNodePosition) => void;
  onFocusChange: (path: string) => void;
  onNavigate: (path: string, direction: GraphNavigationDirection) => void;
  onOpen: (path: string) => void;
  onPositionNudge: (path: string, delta: GraphNodePosition) => void;
  onSelect: (path: string | null) => void;
  onStartDrag: (event: PointerEvent<SVGGElement>, path: string, position: GraphNodePosition) => void;
  selectedPath: string | null;
  showAllLabels?: boolean;
  viewport: GraphViewport;
  viewportSize: GraphPoint;
}) {
  const { t } = useI18n();
  const edgeIndex = useMemo(() => buildGraphEdgeIndex(props.edges), [props.edges]);
  return (
    <g
      role="listbox"
      aria-label={t('graph.nodesCount', { count: props.nodes.length })}
      transform={`translate(${props.viewport.x} ${props.viewport.y}) scale(${props.viewport.zoom})`}
      style={{
        [themeGraphTokens.inverseZoomProperty]: 1 / props.viewport.zoom,
      } as CSSProperties}
    >
      <GraphSceneContent
        currentPath={props.currentPath}
        dragPositionId={props.dragPositionId}
        edgeIndex={edgeIndex}
        edges={props.edges}
        focusablePath={props.focusablePath}
        hoveredPath={props.hoveredPath}
        labelsReady={props.labelsReady}
        labelLayoutRevision={props.labelLayoutRevision}
        maxVisibleLabels={props.maxVisibleLabels}
        topOverlayVisible={props.topOverlayVisible}
        nodes={props.nodes}
        onHoverChange={props.onHoverChange}
        onHoverStart={props.onHoverStart}
        onFocusChange={props.onFocusChange}
        onNavigate={props.onNavigate}
        onOpen={props.onOpen}
        onPositionNudge={props.onPositionNudge}
        onSelect={props.onSelect}
        onStartDrag={props.onStartDrag}
        selectedPath={props.selectedPath}
        showAllLabels={props.showAllLabels}
        viewport={props.viewport}
        viewportSize={props.viewportSize}
      />
    </g>
  );
}

interface GraphSceneContentProps {
  currentPath: string | null;
  dragPositionId: string | null;
  edgeIndex: GraphEdgeIndex;
  edges: PositionedGraphEdge[];
  focusablePath: string | null;
  hoveredPath: string | null;
  nodes: PositionedGraphNode[];
  labelsReady: boolean;
  labelLayoutRevision: number;
  maxVisibleLabels?: number;
  topOverlayVisible?: boolean;
  onHoverChange: (path: string | null) => void;
  onHoverStart?: (event: MouseEvent<SVGGElement>, path: string, position: GraphNodePosition) => void;
  onFocusChange: (path: string) => void;
  onNavigate: (path: string, direction: GraphNavigationDirection) => void;
  onOpen: (path: string) => void;
  onPositionNudge: (path: string, delta: GraphNodePosition) => void;
  onSelect: (path: string | null) => void;
  onStartDrag: (event: PointerEvent<SVGGElement>, path: string, position: GraphNodePosition) => void;
  selectedPath: string | null;
  showAllLabels?: boolean;
  viewport: GraphViewport;
  viewportSize: GraphPoint;
}

const GraphSceneContent = memo(function GraphSceneContent(props: GraphSceneContentProps) {
  const activePath = props.dragPositionId ?? props.hoveredPath;
  const highlightedPath = activePath ?? props.selectedPath;
  const connectedToHighlighted = highlightedPath
    ? props.edgeIndex.get(highlightedPath)?.neighborIds ?? EMPTY_NEIGHBORS
    : EMPTY_NEIGHBORS;
  const labelPriorityIds = useMemo(
    () => [...new Set([
      activePath,
      props.selectedPath,
      props.currentPath,
      ...(props.showAllLabels ? props.nodes.map((node) => node.id) : []),
    ].filter((id): id is string => Boolean(id)))],
    [activePath, props.currentPath, props.nodes, props.selectedPath, props.showAllLabels],
  );
  const labelCandidates = useMemo(() => highlightedPath
    ? props.nodes.filter((node) => (
      labelPriorityIds.includes(node.id) || connectedToHighlighted.has(node.id)
    ))
    : props.nodes, [
    connectedToHighlighted,
    highlightedPath,
    labelPriorityIds,
    props.nodes,
  ]);
  const labelPlacements = useMemo(
    () => props.labelsReady
      ? layoutGraphLabels(
        labelCandidates,
        props.viewport,
        labelPriorityIds,
        props.viewportSize,
        props.nodes,
        getGraphLabelExclusionBounds(props.viewportSize, props.topOverlayVisible ?? false),
        props.maxVisibleLabels,
      )
      : EMPTY_LABEL_PLACEMENTS,
    [
      labelPriorityIds,
      labelCandidates,
      props.labelsReady,
      props.labelLayoutRevision,
      props.maxVisibleLabels,
      props.nodes,
      props.topOverlayVisible,
      props.viewport.x,
      props.viewport.y,
      props.viewport.zoom,
      props.viewportSize.x,
      props.viewportSize.y,
    ],
  );
  return (
    <g className="vlaina-graph-enter">
      <GraphEdges
        dragging={props.dragPositionId !== null}
        edgeIndex={props.edgeIndex}
        edges={props.edges}
        focused={Boolean(highlightedPath)}
        hoveredPath={highlightedPath}
        zoom={props.viewport.zoom}
      />
      {props.nodes.map((node) => (
        <GraphNode
          key={node.id}
          current={props.currentPath === node.id}
          dragging={props.dragPositionId === node.id}
          focusable={props.focusablePath === node.id}
          hovered={activePath === node.id}
          node={node}
          onHoverChange={props.onHoverChange}
          onHoverStart={props.onHoverStart}
          onFocusChange={props.onFocusChange}
          onNavigate={props.onNavigate}
          onOpen={props.onOpen}
          onPositionNudge={props.onPositionNudge}
          onSelect={props.onSelect}
          onStartDrag={props.onStartDrag}
          related={connectedToHighlighted.has(node.id)}
          selected={props.selectedPath === node.id}
          dimmed={Boolean(
            highlightedPath
            && highlightedPath !== node.id
            && props.selectedPath !== node.id
            && props.currentPath !== node.id
            && !connectedToHighlighted.has(node.id)
          )}
          labelPlacement={labelPlacements.get(node.id) ?? null}
        />
      ))}
    </g>
  );
}, areGraphSceneContentPropsEqual);

// The outer scene applies viewport transforms every frame; keep the node tree
// stable until a settled revision or another visual interaction input changes.
function areGraphSceneContentPropsEqual(
  previous: GraphSceneContentProps,
  next: GraphSceneContentProps,
): boolean {
  return previous.currentPath === next.currentPath
    && previous.dragPositionId === next.dragPositionId
    && previous.edges === next.edges
    && previous.edgeIndex === next.edgeIndex
    && previous.focusablePath === next.focusablePath
    && previous.hoveredPath === next.hoveredPath
    && previous.labelsReady === next.labelsReady
    && previous.labelLayoutRevision === next.labelLayoutRevision
    && previous.maxVisibleLabels === next.maxVisibleLabels
    && previous.topOverlayVisible === next.topOverlayVisible
    && previous.nodes === next.nodes
    && previous.onHoverChange === next.onHoverChange
    && previous.onHoverStart === next.onHoverStart
    && previous.onFocusChange === next.onFocusChange
    && previous.onNavigate === next.onNavigate
    && previous.onOpen === next.onOpen
    && previous.onPositionNudge === next.onPositionNudge
    && previous.onSelect === next.onSelect
    && previous.onStartDrag === next.onStartDrag
    && previous.selectedPath === next.selectedPath
    && previous.showAllLabels === next.showAllLabels
    && previous.viewportSize.x === next.viewportSize.x
    && previous.viewportSize.y === next.viewportSize.y;
}

export function getGraphLabelExclusionBounds(
  viewportSize: GraphPoint,
  topOverlayVisible: boolean,
): readonly GraphScreenBounds[] {
  return getGraphViewportOverlayBounds(viewportSize, topOverlayVisible);
}

const EMPTY_NEIGHBORS = new Set<string>();
const EMPTY_LABEL_PLACEMENTS: ReadonlyMap<string, GraphLabelPlacement> = new Map();
