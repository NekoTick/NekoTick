import { themeGraphTokens } from '@/styles/themeTokens';

export interface GraphPoint {
  x: number;
  y: number;
}

export interface GraphViewport extends GraphPoint {
  zoom: number;
}

export interface GraphViewportBounds {
  bottom: number;
  left: number;
  right: number;
  top: number;
}

export const GRAPH_INITIAL_VIEWPORT: GraphViewport = {
  x: 0,
  y: 0,
  zoom: themeGraphTokens.defaultZoom,
};

export function clampGraphZoom(zoom: number): number {
  return Math.min(themeGraphTokens.maxZoom, Math.max(themeGraphTokens.minZoom, zoom));
}

export function clientPointToGraphPoint(
  clientPoint: GraphPoint,
  viewportRect: Pick<DOMRectReadOnly, 'left' | 'top'>,
  viewport: GraphViewport,
): GraphPoint {
  return {
    x: (clientPoint.x - viewportRect.left - viewport.x) / viewport.zoom,
    y: (clientPoint.y - viewportRect.top - viewport.y) / viewport.zoom,
  };
}

export function zoomGraphViewportAtPoint(
  viewport: GraphViewport,
  screenPoint: GraphPoint,
  nextZoom: number,
): GraphViewport {
  const zoom = clampGraphZoom(nextZoom);
  const graphPoint = {
    x: (screenPoint.x - viewport.x) / viewport.zoom,
    y: (screenPoint.y - viewport.y) / viewport.zoom,
  };
  return {
    x: screenPoint.x - graphPoint.x * zoom,
    y: screenPoint.y - graphPoint.y * zoom,
    zoom,
  };
}

export function getGraphViewportOverlayBounds(
  viewportSize: GraphPoint,
  topOverlayVisible: boolean,
): readonly GraphViewportBounds[] {
  if (viewportSize.x <= 0 || viewportSize.y <= 0) return [];
  const controlsLeft = themeGraphTokens.viewportControlsHorizontalOffsetPx;
  const controlsRight = Math.min(
    viewportSize.x,
    controlsLeft + themeGraphTokens.viewportControlsWidthPx,
  );
  const bounds: GraphViewportBounds[] = [{
    bottom: viewportSize.y - themeGraphTokens.viewportControlsVerticalOffsetPx,
    left: controlsLeft,
    right: controlsRight,
    top: Math.max(
      0,
      viewportSize.y
        - themeGraphTokens.viewportControlsVerticalOffsetPx
        - themeGraphTokens.viewportControlsHeightPx,
    ),
  }];
  if (topOverlayVisible) {
    bounds.push({
      bottom: Math.min(viewportSize.y, themeGraphTokens.statusOverlayReservedHeightPx),
      left: 0,
      right: viewportSize.x,
      top: 0,
    });
  }
  return bounds;
}

export function getGraphViewportContentBounds(
  viewportSize: GraphPoint,
  topOverlayVisible: boolean,
): GraphViewportBounds {
  const overlays = getGraphViewportOverlayBounds(viewportSize, topOverlayVisible);
  const controls = overlays[0];
  const status = overlays[1];
  return {
    bottom: controls?.top ?? viewportSize.y,
    left: 0,
    right: viewportSize.x,
    top: status?.bottom ?? 0,
  };
}

export function fitGraphViewportToNodes(
  nodes: readonly GraphPoint[],
  viewportSize: GraphPoint,
  contentBounds?: GraphViewportBounds,
): GraphViewport {
  if (nodes.length === 0 || viewportSize.x <= 0 || viewportSize.y <= 0) {
    return GRAPH_INITIAL_VIEWPORT;
  }

  const radius = themeGraphTokens.activeNodeRadiusPx;
  const minX = Math.min(...nodes.map((node) => node.x)) - radius;
  const minY = Math.min(...nodes.map((node) => node.y)) - radius;
  const maxX = Math.max(...nodes.map((node) => node.x)) + radius;
  const maxY = Math.max(...nodes.map((node) => node.y)) + radius;
  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxY - minY);
  const contentLeft = contentBounds?.left ?? 0;
  const contentTop = contentBounds?.top ?? 0;
  const contentWidth = Math.max(
    1,
    (contentBounds?.right ?? viewportSize.x) - contentLeft,
  );
  const contentHeight = Math.max(
    1,
    (contentBounds?.bottom ?? viewportSize.y) - contentTop,
  );
  const availableWidth = Math.max(1, contentWidth - themeGraphTokens.fitViewPaddingPx * 2);
  const availableHeight = Math.max(1, contentHeight - themeGraphTokens.fitViewPaddingPx * 2);
  const zoom = clampGraphZoom(Math.min(
    themeGraphTokens.defaultZoom,
    availableWidth / width,
    availableHeight / height,
  ));

  return {
    x: contentLeft + (contentWidth - width * zoom) / 2 - minX * zoom,
    y: contentTop + (contentHeight - height * zoom) / 2 - minY * zoom,
    zoom,
  };
}
