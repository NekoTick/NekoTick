import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { themeGraphTokens } from '@/styles/themeTokens';
import type { GraphEdgeIndex } from '../model/graphEdgeIndex';
import { selectRepresentativeGraphEdges } from '../model/graphEdgeSampling';
import type { PositionedGraphEdge } from '../model/graphLayout';
import { registerGraphEdgeLayer } from './applyGraphPositions';
import { createGraphEdgePath } from './graphEdgePath';

function getEdgeDefinitions(edges: readonly PositionedGraphEdge[]) {
  return edges.map((edge) => ({
    sourceId: edge.source.id,
    targetId: edge.target.id,
  }));
}

export function getGraphBaseEdgeRenderCount(
  edgeCount: number,
  zoom: number = themeGraphTokens.defaultZoom,
): number {
  if (edgeCount <= themeGraphTokens.denseEdgeThreshold) return edgeCount;
  const zoomRange = Math.max(0.001, themeGraphTokens.defaultZoom - themeGraphTokens.minZoom);
  const zoomProgress = clamp(
    (zoom - themeGraphTokens.minZoom) / zoomRange,
    0,
    1,
  );
  const renderRatio = themeGraphTokens.denseEdgeMinimumRenderRatio
    + zoomProgress * (1 - themeGraphTokens.denseEdgeMinimumRenderRatio);
  return Math.min(
    edgeCount,
    Math.max(
      themeGraphTokens.denseEdgeThreshold,
      Math.ceil(edgeCount * renderRatio),
    ),
  );
}

export function selectGraphBaseEdges(
  edges: readonly PositionedGraphEdge[],
  zoom: number = themeGraphTokens.defaultZoom,
): readonly PositionedGraphEdge[] {
  const renderCount = getGraphBaseEdgeRenderCount(edges.length, zoom);
  return selectRepresentativeGraphEdges(edges, renderCount);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function getGraphBaseEdgeOpacity(
  edgeCount: number,
  zoom: number = themeGraphTokens.defaultZoom,
  focused = false,
): number {
  const densityRange = Math.max(
    1,
    themeGraphTokens.denseEdgeThreshold - themeGraphTokens.edgeDensityStartCount,
  );
  const density = clamp(
    (edgeCount - themeGraphTokens.edgeDensityStartCount) / densityRange,
    0,
    1,
  );
  const densityFactor = 1 - density * (1 - themeGraphTokens.denseEdgeOpacityFactor);
  const zoomRange = Math.max(0.001, themeGraphTokens.defaultZoom - themeGraphTokens.minZoom);
  const zoomProgress = clamp((zoom - themeGraphTokens.minZoom) / zoomRange, 0, 1);
  const zoomFactor = themeGraphTokens.edgeZoomMinimumOpacity
    + zoomProgress * (1 - themeGraphTokens.edgeZoomMinimumOpacity);
  const baseOpacity = focused
    ? themeGraphTokens.focusedEdgeOpacity
    : themeGraphTokens.edgeOpacity;
  return Math.round(baseOpacity * densityFactor * zoomFactor * 1_000) / 1_000;
}

export const GraphEdges = memo(function GraphEdges(props: {
  dragging?: boolean;
  edgeIndex: GraphEdgeIndex;
  edges: PositionedGraphEdge[];
  focused?: boolean;
  hoveredPath: string | null;
  zoom?: number;
}) {
  const [lastHoveredPath, setLastHoveredPath] = useState(props.hoveredPath);
  const activeHoveredPath = props.hoveredPath ?? lastHoveredPath;
  const baseEdges = useMemo(
    () => selectGraphBaseEdges(props.edges, props.zoom),
    [props.edges, props.zoom],
  );
  const baseDefinitions = useMemo(() => getEdgeDefinitions(baseEdges), [baseEdges]);
  const basePath = useMemo(() => createGraphEdgePath(baseEdges), [baseEdges]);
  const highlightedEdges = useMemo(
    () => activeHoveredPath ? props.edgeIndex.get(activeHoveredPath)?.edges ?? [] : [],
    [activeHoveredPath, props.edgeIndex],
  );
  const activeDefinitions = useMemo(
    () => getEdgeDefinitions(highlightedEdges),
    [highlightedEdges],
  );
  const hasActiveEdges = activeDefinitions.length > 0;
  const activePath = useMemo(() => createGraphEdgePath(highlightedEdges), [highlightedEdges]);
  const registerBaseLayer = useCallback((element: SVGPathElement | null) => {
    registerGraphEdgeLayer(element, 'base', baseDefinitions);
  }, [baseDefinitions]);
  const registerActiveLayer = useCallback((element: SVGPathElement | null) => {
    registerGraphEdgeLayer(element, 'active', activeDefinitions);
  }, [activeDefinitions]);

  useEffect(() => {
    if (props.hoveredPath) {
      setLastHoveredPath(props.hoveredPath);
      return;
    }
    if (!lastHoveredPath) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setLastHoveredPath(null);
      return;
    }
    const timeout = window.setTimeout(
      () => setLastHoveredPath(null),
      themeGraphTokens.edgeHighlightFadeDurationMs,
    );
    return () => window.clearTimeout(timeout);
  }, [lastHoveredPath, props.hoveredPath]);

  return (
    <g aria-hidden="true" className="pointer-events-none">
      <path
        ref={registerBaseLayer}
        data-graph-edge-count={props.edges.length}
        data-graph-edge-rendered-count={baseEdges.length}
        data-graph-edge-layer="base"
        className={`vlaina-graph-edge-base${props.dragging ? ' is-dragging' : ''}`}
        d={basePath}
        fill={themeGraphTokens.edgeFill}
        stroke="var(--vlaina-color-graph-edge)"
        strokeOpacity={props.dragging
          ? 0
          : getGraphBaseEdgeOpacity(props.edges.length, props.zoom, props.focused)}
        strokeWidth={themeGraphTokens.edgeWidthPx}
        vectorEffect="non-scaling-stroke"
      />
      <path
        ref={registerActiveLayer}
        data-graph-edge-layer="active"
        className="vlaina-graph-edge-active"
        d={activePath}
        fill={themeGraphTokens.edgeFill}
        opacity={props.hoveredPath && hasActiveEdges ? 1 : 0}
        stroke="var(--vlaina-color-graph-edge-active)"
        strokeOpacity={themeGraphTokens.activeEdgeOpacity}
        strokeWidth={themeGraphTokens.activeEdgeWidthPx}
        vectorEffect="non-scaling-stroke"
      />
    </g>
  );
});
