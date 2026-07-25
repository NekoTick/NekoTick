import { themeWhiteboardTokens } from '@/styles/themeTokens';
import type { WhiteboardElement, WhiteboardPoint, WhiteboardStroke, WhiteboardViewport } from './whiteboardModel';
import { getStrokeBounds, type WhiteboardSelectionRect } from './whiteboardSelection';
import { WHITEBOARD_INITIAL_VIEWPORT, clampWhiteboardZoom } from './whiteboardModel';

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
