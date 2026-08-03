import { themeWhiteboardTokens } from '@/styles/themeTokens';
import {
  resizeWhiteboardElement,
  type WhiteboardElement,
  type WhiteboardPoint,
  type WhiteboardStroke,
} from './whiteboardModel';
import { markWhiteboardSparseUpdate } from './whiteboardCollection';
import type { WhiteboardItemOrder } from './whiteboardSpatialIndex';
import { scaleWhiteboardStrokePointOrientation } from './whiteboardStrokeDynamics';
import {
  cacheTranslatedStrokeBounds,
  getElementBounds,
  type WhiteboardSelectionRect,
} from './whiteboardSelectionGeometry';

export {
  extendSelectedOverlayGeometry,
  getBoundsUnion,
  getElementBounds,
  getSelectedOverlayGeometry,
  getSelectionBounds,
  getStrokeBounds,
} from './whiteboardSelectionGeometry';
export type { WhiteboardSelectedOverlayGeometry, WhiteboardSelectionRect } from './whiteboardSelectionGeometry';

export type WhiteboardResizeHandle = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw';

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
  originalElements: WhiteboardElement[] | ReadonlyMap<string, WhiteboardElement>,
  startBounds: WhiteboardSelectionRect,
  nextBounds: WhiteboardSelectionRect,
  order?: WhiteboardItemOrder | null,
): WhiteboardElement[] {
  const originalById = toElementMap(originalElements);
  if (!Array.isArray(originalElements) && order) {
    const resized = elements.slice();
    const changedItems: WhiteboardElement[] = [];
    for (const original of originalById.values()) {
      const index = order.get(original.id);
      if (index === undefined) continue;
      const element = elements[index];
      if (!element || element.id !== original.id) continue;
      const next = resizeSelectionElement({ ...original, imageSrc: element.imageSrc }, startBounds, nextBounds);
      resized[index] = next;
      changedItems.push(next);
    }
    return markWhiteboardSparseUpdate(elements, resized, changedItems);
  }
  const changedItems: WhiteboardElement[] = [];
  const resized = elements.map((element) => {
    const original = originalById.get(element.id);
    if (!original) return element;
    const next = resizeSelectionElement({ ...original, imageSrc: element.imageSrc }, startBounds, nextBounds);
    changedItems.push(next);
    return next;
  });
  return markWhiteboardSparseUpdate(elements, resized, changedItems);
}

export function resizeSelectionElement(
  element: WhiteboardElement,
  startBounds: WhiteboardSelectionRect,
  nextBounds: WhiteboardSelectionRect,
): WhiteboardElement {
  const scaled = scaleRect(getElementBounds(element), startBounds, nextBounds);
  return resizeWhiteboardElement({
    ...element,
    x: Math.round(scaled.x),
    y: Math.round(scaled.y),
  }, scaled.width, scaled.height);
}

export function resizeSelectionStrokes(
  strokes: WhiteboardStroke[],
  originalStrokes: WhiteboardStroke[] | ReadonlyMap<string, WhiteboardStroke>,
  startBounds: WhiteboardSelectionRect,
  nextBounds: WhiteboardSelectionRect,
  order?: WhiteboardItemOrder | null,
): WhiteboardStroke[] {
  const originalById = toStrokeMap(originalStrokes);
  if (!Array.isArray(originalStrokes) && order) {
    const resized = strokes.slice();
    const changedItems: WhiteboardStroke[] = [];
    for (const original of originalById.values()) {
      const index = order.get(original.id);
      if (index === undefined) continue;
      const stroke = strokes[index];
      if (!stroke || stroke.id !== original.id) continue;
      const next = resizeSelectionStroke(original, startBounds, nextBounds);
      resized[index] = next;
      changedItems.push(next);
    }
    return markWhiteboardSparseUpdate(strokes, resized, changedItems);
  }
  const changedItems: WhiteboardStroke[] = [];
  const resized = strokes.map((stroke) => {
    const original = originalById.get(stroke.id);
    if (!original) return stroke;
    const next = resizeSelectionStroke(original, startBounds, nextBounds);
    changedItems.push(next);
    return next;
  });
  return markWhiteboardSparseUpdate(strokes, resized, changedItems);
}

export function resizeSelectionStroke(
  stroke: WhiteboardStroke,
  startBounds: WhiteboardSelectionRect,
  nextBounds: WhiteboardSelectionRect,
): WhiteboardStroke {
  const scaleX = nextBounds.width / Math.max(1, startBounds.width);
  const scaleY = nextBounds.height / Math.max(1, startBounds.height);
  const widthScale = Math.sqrt(scaleX * scaleY);
  const textureScale = (stroke.renderTextureScale ?? 1) * Math.pow(
    widthScale,
    1 - themeWhiteboardTokens.textureDashScaleExponent,
  );
  return {
    ...stroke,
    points: stroke.points.map((point) => scalePoint(
      scaleWhiteboardStrokePointOrientation(stroke.tool, point, scaleX, scaleY),
      startBounds,
      nextBounds,
    )),
    ...(stroke.renderPathOffset !== undefined
      ? { renderPathOffset: stroke.renderPathOffset * widthScale }
      : {}),
    renderTextureScale: textureScale === 1 ? undefined : textureScale,
    size: stroke.size * widthScale,
  };
}

export function translateStroke(stroke: WhiteboardStroke, dx: number, dy: number): WhiteboardStroke {
  const points = new Array<WhiteboardStroke['points'][number]>(stroke.points.length);
  for (let index = 0; index < stroke.points.length; index += 1) {
    const point = stroke.points[index];
    points[index] = { ...point, x: point.x + dx, y: point.y + dy };
  }
  const translated: WhiteboardStroke = { ...stroke, points };
  cacheTranslatedStrokeBounds(stroke, translated, dx, dy);
  return translated;
}

export function translateStrokesFromOriginals(
  strokes: WhiteboardStroke[],
  originalStrokes: WhiteboardStroke[] | ReadonlyMap<string, WhiteboardStroke>,
  dx: number,
  dy: number,
  order?: WhiteboardItemOrder | null,
): WhiteboardStroke[] {
  const originalById = toStrokeMap(originalStrokes);
  if (!Array.isArray(originalStrokes) && order) {
    const translated = strokes.slice();
    const changedItems: WhiteboardStroke[] = [];
    for (const original of originalById.values()) {
      const index = order.get(original.id);
      if (index === undefined) continue;
      const stroke = strokes[index];
      if (!stroke || stroke.id !== original.id) continue;
      const next = translateStroke(original, dx, dy);
      translated[index] = next;
      changedItems.push(next);
    }
    return markWhiteboardSparseUpdate(strokes, translated, changedItems);
  }
  const translated = new Array<WhiteboardStroke>(strokes.length);
  const changedItems: WhiteboardStroke[] = [];
  for (let index = 0; index < strokes.length; index += 1) {
    const stroke = strokes[index];
    const original = originalById.get(stroke.id);
    const next = original ? translateStroke(original, dx, dy) : stroke;
    translated[index] = next;
    if (original) changedItems.push(next);
  }
  return markWhiteboardSparseUpdate(strokes, translated, changedItems);
}

export function translateElementsFromOriginals(
  elements: WhiteboardElement[],
  originalElements: ReadonlyMap<string, WhiteboardElement>,
  dx: number,
  dy: number,
  order?: WhiteboardItemOrder | null,
): WhiteboardElement[] {
  const translated = order ? elements.slice() : new Array<WhiteboardElement>(elements.length);
  const changedItems: WhiteboardElement[] = [];
  if (order) {
    for (const original of originalElements.values()) {
      const index = order.get(original.id);
      if (index === undefined) continue;
      const element = elements[index];
      if (!element || element.id !== original.id) continue;
      const next = { ...element, x: Math.round(original.x + dx), y: Math.round(original.y + dy) };
      translated[index] = next;
      changedItems.push(next);
    }
  } else {
    for (let index = 0; index < elements.length; index += 1) {
      const element = elements[index];
      const original = originalElements.get(element.id);
      const next = original
        ? { ...element, x: Math.round(original.x + dx), y: Math.round(original.y + dy) }
        : element;
      translated[index] = next;
      if (original) changedItems.push(next);
    }
  }
  return markWhiteboardSparseUpdate(elements, translated, changedItems);
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

const toElementMap = (elements: WhiteboardElement[] | ReadonlyMap<string, WhiteboardElement>) => Array.isArray(elements) ? new Map(elements.map((element) => [element.id, element])) : elements;
const toStrokeMap = (strokes: WhiteboardStroke[] | ReadonlyMap<string, WhiteboardStroke>) => Array.isArray(strokes) ? new Map(strokes.map((stroke) => [stroke.id, stroke])) : strokes;
