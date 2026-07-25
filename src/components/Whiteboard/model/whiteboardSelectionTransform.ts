import { themeWhiteboardTokens } from '@/styles/themeTokens';
import {
  getStrokeWidth,
  resizeWhiteboardElement,
  type WhiteboardElement,
  type WhiteboardPoint,
  type WhiteboardStroke,
} from './whiteboardModel';

export type WhiteboardResizeHandle = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw';

export interface WhiteboardSelectionRect {
  height: number;
  width: number;
  x: number;
  y: number;
}

const strokeBoundsCache = new WeakMap<WhiteboardStroke, WhiteboardSelectionRect | null>();

export function getStrokeBounds(stroke: WhiteboardStroke): WhiteboardSelectionRect | null {
  const cached = strokeBoundsCache.get(stroke);
  if (cached !== undefined) return cached;
  if (stroke.points.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxWidth = 0;
  for (const point of stroke.points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
    maxWidth = Math.max(maxWidth, getStrokeWidth(stroke.tool, point.pressure, stroke.size));
  }
  const padding = maxWidth / 2 + themeWhiteboardTokens.strokeSelectionPaddingPx;
  const bounds = {
    height: maxY - minY + padding * 2,
    width: maxX - minX + padding * 2,
    x: minX - padding,
    y: minY - padding,
  };
  strokeBoundsCache.set(stroke, bounds);
  return bounds;
}

export function getElementBounds(element: WhiteboardElement): WhiteboardSelectionRect {
  return { height: element.height, width: element.width, x: element.x, y: element.y };
}

export function getBoundsUnion(bounds: WhiteboardSelectionRect[]): WhiteboardSelectionRect | null {
  if (bounds.length === 0) return null;
  const padding = themeWhiteboardTokens.strokeSelectionPaddingPx;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  bounds.forEach((rect) => {
    minX = Math.min(minX, rect.x);
    minY = Math.min(minY, rect.y);
    maxX = Math.max(maxX, rect.x + rect.width);
    maxY = Math.max(maxY, rect.y + rect.height);
  });
  return {
    height: maxY - minY + padding * 2,
    width: maxX - minX + padding * 2,
    x: minX - padding,
    y: minY - padding,
  };
}

export function getSelectionBounds(
  elements: WhiteboardElement[],
  strokes: WhiteboardStroke[],
  elementIds: string[],
  strokeIds: string[],
): WhiteboardSelectionRect | null {
  const selectedElementIds = new Set(elementIds);
  const selectedStrokeIds = new Set(strokeIds);
  return getBoundsUnion([
    ...elements.flatMap((element) => (selectedElementIds.has(element.id) ? [getElementBounds(element)] : [])),
    ...strokes.flatMap((stroke) => {
      if (!selectedStrokeIds.has(stroke.id)) return [];
      const bounds = getStrokeBounds(stroke);
      return bounds ? [bounds] : [];
    }),
  ]);
}

export function getResizedSelectionBounds(
  bounds: WhiteboardSelectionRect,
  startPoint: WhiteboardPoint,
  point: WhiteboardPoint,
  handle: WhiteboardResizeHandle,
  preserveAspectRatio: boolean,
): WhiteboardSelectionRect {
  const dx = point.x - startPoint.x;
  const dy = point.y - startPoint.y;
  const next = { ...bounds };
  if (handle.includes('e')) next.width = bounds.width + dx;
  if (handle.includes('s')) next.height = bounds.height + dy;
  if (handle.includes('w')) {
    next.x = bounds.x + dx;
    next.width = bounds.width - dx;
  }
  if (handle.includes('n')) {
    next.y = bounds.y + dy;
    next.height = bounds.height - dy;
  }
  const resized = preserveAspectRatio && handle.length === 2 ? preserveBoundsAspectRatio(bounds, next, handle) : next;
  return clampResizeBounds(bounds, resized, handle);
}

export function resizeSelectionElements(
  elements: WhiteboardElement[],
  originalElements: WhiteboardElement[] | Map<string, WhiteboardElement>,
  startBounds: WhiteboardSelectionRect,
  nextBounds: WhiteboardSelectionRect,
): WhiteboardElement[] {
  const originalById = toElementMap(originalElements);
  return elements.map((element) => {
    const original = originalById.get(element.id);
    if (!original) return element;
    const scaled = scaleRect(getElementBounds(original), startBounds, nextBounds);
    return resizeWhiteboardElement({
      ...element,
      x: Math.round(scaled.x),
      y: Math.round(scaled.y),
    }, scaled.width, scaled.height);
  });
}

export function resizeSelectionStrokes(
  strokes: WhiteboardStroke[],
  originalStrokes: WhiteboardStroke[] | Map<string, WhiteboardStroke>,
  startBounds: WhiteboardSelectionRect,
  nextBounds: WhiteboardSelectionRect,
): WhiteboardStroke[] {
  const originalById = toStrokeMap(originalStrokes);
  return strokes.map((stroke) => {
    const original = originalById.get(stroke.id);
    if (!original) return stroke;
    return { ...stroke, points: original.points.map((point) => scalePoint(point, startBounds, nextBounds)) };
  });
}

export function translateStroke(stroke: WhiteboardStroke, dx: number, dy: number): WhiteboardStroke {
  return { ...stroke, points: stroke.points.map((point) => ({ ...point, x: point.x + dx, y: point.y + dy })) };
}

export function translateStrokesFromOriginals(
  strokes: WhiteboardStroke[],
  originalStrokes: WhiteboardStroke[] | Map<string, WhiteboardStroke>,
  dx: number,
  dy: number,
): WhiteboardStroke[] {
  const originalById = toStrokeMap(originalStrokes);
  return strokes.map((stroke) => {
    const original = originalById.get(stroke.id);
    return original ? translateStroke(original, dx, dy) : stroke;
  });
}

function preserveBoundsAspectRatio(start: WhiteboardSelectionRect, next: WhiteboardSelectionRect, handle: WhiteboardResizeHandle): WhiteboardSelectionRect {
  const ratio = start.width / Math.max(1, start.height);
  const widthChangedMore = Math.abs(next.width - start.width) >= Math.abs(next.height - start.height);
  const width = widthChangedMore ? next.width : next.height * ratio;
  const height = widthChangedMore ? next.width / ratio : next.height;
  return {
    height,
    width,
    x: handle.includes('w') ? start.x + start.width - width : start.x,
    y: handle.includes('n') ? start.y + start.height - height : start.y,
  };
}

function clampResizeBounds(start: WhiteboardSelectionRect, next: WhiteboardSelectionRect, handle: WhiteboardResizeHandle): WhiteboardSelectionRect {
  const minSize = themeWhiteboardTokens.selectionResizeMinSizePx;
  const width = Math.max(minSize, next.width);
  const height = Math.max(minSize, next.height);
  return {
    height,
    width,
    x: handle.includes('w') ? start.x + start.width - width : next.x,
    y: handle.includes('n') ? start.y + start.height - height : next.y,
  };
}

function scaleRect(rect: WhiteboardSelectionRect, startBounds: WhiteboardSelectionRect, nextBounds: WhiteboardSelectionRect): WhiteboardSelectionRect {
  const scaleX = nextBounds.width / Math.max(1, startBounds.width);
  const scaleY = nextBounds.height / Math.max(1, startBounds.height);
  return {
    height: rect.height * scaleY,
    width: rect.width * scaleX,
    x: nextBounds.x + (rect.x - startBounds.x) * scaleX,
    y: nextBounds.y + (rect.y - startBounds.y) * scaleY,
  };
}

function scalePoint<T extends WhiteboardPoint>(point: T, startBounds: WhiteboardSelectionRect, nextBounds: WhiteboardSelectionRect): T {
  const scaleX = nextBounds.width / Math.max(1, startBounds.width);
  const scaleY = nextBounds.height / Math.max(1, startBounds.height);
  return {
    ...point,
    x: nextBounds.x + (point.x - startBounds.x) * scaleX,
    y: nextBounds.y + (point.y - startBounds.y) * scaleY,
  };
}

const toElementMap = (elements: WhiteboardElement[] | Map<string, WhiteboardElement>) => elements instanceof Map ? elements : new Map(elements.map((element) => [element.id, element]));
const toStrokeMap = (strokes: WhiteboardStroke[] | Map<string, WhiteboardStroke>) => strokes instanceof Map ? strokes : new Map(strokes.map((stroke) => [stroke.id, stroke]));
