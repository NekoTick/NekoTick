import { themeWhiteboardTokens } from '@/styles/themeTokens';
import type { WhiteboardElement, WhiteboardPoint, WhiteboardStroke, WhiteboardViewport } from './whiteboardModel';
import { getStrokeBounds, type WhiteboardSelectionRect } from './whiteboardSelection';
import { WHITEBOARD_INITIAL_VIEWPORT, clampWhiteboardZoom } from './whiteboardModel';

export interface WhiteboardCullingWindow {
  rect: WhiteboardSelectionRect | null;
  zoom: number;
}

export function fitViewportToContent(
  elements: WhiteboardElement[],
  strokes: WhiteboardStroke[],
  viewportSize: WhiteboardPoint,
): WhiteboardViewport {
  const bounds = getContentBounds(elements, strokes);
  if (!bounds) return WHITEBOARD_INITIAL_VIEWPORT;
  const zoom = clampWhiteboardZoom(Math.min(
    viewportSize.x / Math.max(1, bounds.width + themeWhiteboardTokens.fitViewPaddingPx * 2),
    viewportSize.y / Math.max(1, bounds.height + themeWhiteboardTokens.fitViewPaddingPx * 2),
  ));
  return {
    x: Math.round((viewportSize.x - bounds.width * zoom) / 2 - bounds.x * zoom),
    y: Math.round((viewportSize.y - bounds.height * zoom) / 2 - bounds.y * zoom),
    zoom,
  };
}

export function getVisibleBoardRect(
  viewport: WhiteboardViewport,
  viewportSize: WhiteboardPoint,
): WhiteboardSelectionRect | null {
  if (viewportSize.x <= 0 || viewportSize.y <= 0) return null;
  const overscan = themeWhiteboardTokens.viewportCullingOverscanPx / viewport.zoom;
  return {
    height: viewportSize.y / viewport.zoom + overscan * 2,
    width: viewportSize.x / viewport.zoom + overscan * 2,
    x: -viewport.x / viewport.zoom - overscan,
    y: -viewport.y / viewport.zoom - overscan,
  };
}

export function getWhiteboardCullingWindow(
  current: WhiteboardCullingWindow | null,
  viewport: WhiteboardViewport,
  viewportSize: WhiteboardPoint,
): WhiteboardCullingWindow {
  const viewportRect = getViewportBoardRect(viewport, viewportSize);
  if (!viewportRect) return current?.rect === null ? current : { rect: null, zoom: viewport.zoom };
  const zoomRatio = current ? Math.max(current.zoom / viewport.zoom, viewport.zoom / current.zoom) : Infinity;
  if (
    current?.rect &&
    zoomRatio < themeWhiteboardTokens.viewportCullingZoomRatio &&
    rectContains(current.rect, viewportRect)
  ) return current;
  return { rect: getVisibleBoardRect(viewport, viewportSize), zoom: viewport.zoom };
}

function getViewportBoardRect(
  viewport: WhiteboardViewport,
  viewportSize: WhiteboardPoint,
): WhiteboardSelectionRect | null {
  if (viewportSize.x <= 0 || viewportSize.y <= 0) return null;
  return {
    height: viewportSize.y / viewport.zoom,
    width: viewportSize.x / viewport.zoom,
    x: -viewport.x / viewport.zoom,
    y: -viewport.y / viewport.zoom,
  };
}

function rectContains(outer: WhiteboardSelectionRect, inner: WhiteboardSelectionRect): boolean {
  return inner.x >= outer.x && inner.y >= outer.y
    && inner.x + inner.width <= outer.x + outer.width
    && inner.y + inner.height <= outer.y + outer.height;
}

function getContentBounds(elements: WhiteboardElement[], strokes: WhiteboardStroke[]): WhiteboardSelectionRect | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const includeBounds = (x: number, y: number, width: number, height: number) => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + width);
    maxY = Math.max(maxY, y + height);
  };
  elements.forEach((element) => includeBounds(element.x, element.y, element.width, element.height));
  strokes.forEach((stroke) => {
    const bounds = getStrokeBounds(stroke);
    if (bounds) includeBounds(bounds.x, bounds.y, bounds.width, bounds.height);
  });
  if (!Number.isFinite(minX)) return null;
  return { height: maxY - minY, width: maxX - minX, x: minX, y: minY };
}
