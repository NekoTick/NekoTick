import { themeWhiteboardTokens } from '@/styles/themeTokens';
import {
  isLinearTool,
  type WhiteboardElement,
  type WhiteboardPoint,
  type WhiteboardStroke,
} from '@/components/Whiteboard/model/core/whiteboardModel';
import { markWhiteboardSparseUpdate } from '@/components/Whiteboard/model/core/whiteboardCollection';
import type { WhiteboardItemOrder } from './whiteboardSpatialIndex';
import { scaleWhiteboardStrokePointOrientation } from '@/components/Whiteboard/model/geometry/whiteboardStrokeDynamics';
import { getElementBounds, type WhiteboardSelectionRect } from './whiteboardSelectionGeometry';

export {
  extendSelectedOverlayGeometry,
  getBoundsUnion,
  getElementBounds,
  getElementContentRect,
  getElementCorners,
  getSelectedOverlayGeometry,
  getSelectionBounds,
  getStrokeBounds,
} from './whiteboardSelectionGeometry';
export type { WhiteboardSelectedOverlayGeometry, WhiteboardSelectionRect } from './whiteboardSelectionGeometry';
export {
  rotateSelectionElement,
  rotateSelectionElements,
  rotateSelectionStroke,
  rotateSelectionStrokes,
} from './whiteboardSelectionRotation';
export {
  translateElementsFromOriginals,
  translateStroke,
  translateStrokesFromOriginals,
} from './whiteboardSelectionTranslation';

export type WhiteboardResizeHandle = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw';

export function getWhiteboardResizeScale(nextSize: number, startSize: number): number {
  return nextSize / Math.max(themeWhiteboardTokens.selectionResizeMinSizePx, Math.abs(startSize));
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
  return keepResizeBoundsNonZero(resized);
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
  const elementBounds = getElementBounds(element);
  const scaled = scaleRect(elementBounds, startBounds, nextBounds);
  const normalized = normalizeWhiteboardSelectionRect(scaled);
  const isText = element.type === 'text';
  const scaleX = getWhiteboardResizeScale(nextBounds.width, startBounds.width);
  const scaleY = getWhiteboardResizeScale(nextBounds.height, startBounds.height);
  const scaledCenter = scalePoint({
    x: element.x + element.width / 2,
    y: element.y + element.height / 2,
  }, startBounds, nextBounds);
  const minSize = themeWhiteboardTokens.selectionResizeMinSizePx;
  const textWidth = Math.max(minSize, element.width * Math.abs(scaleX));
  const textHeight = Math.max(minSize, element.height * Math.abs(scaleY));
  const resized: WhiteboardElement = {
    ...element,
    flipX: toggleFlip(element.flipX, scaleX < 0),
    flipY: toggleFlip(element.flipY, scaleY < 0),
    ...(element.rotation && (scaleX < 0) !== (scaleY < 0)
      ? { rotation: -element.rotation }
      : {}),
    ...(isText ? {
      fontSize: (element.fontSize ?? themeWhiteboardTokens.whiteboardTextFontSizePx)
        * Math.abs(scaleX),
      height: textHeight,
      width: textWidth,
      x: scaledCenter.x - textWidth / 2,
      y: scaledCenter.y - textHeight / 2,
    } : {
      height: Math.max(1, Math.round(normalized.height)),
      width: Math.max(1, Math.round(normalized.width)),
      x: Math.round(normalized.x),
      y: Math.round(normalized.y),
    }),
  };
  if (!resized.flipX) delete resized.flipX;
  if (!resized.flipY) delete resized.flipY;
  return resized;
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
  const scaleX = getWhiteboardResizeScale(nextBounds.width, startBounds.width);
  const scaleY = getWhiteboardResizeScale(nextBounds.height, startBounds.height);
  const widthScale = Math.sqrt(Math.abs(scaleX * scaleY));
  const textureScale = (stroke.renderTextureScale ?? 1) * Math.pow(
    widthScale,
    1 - themeWhiteboardTokens.textureDashScaleExponent,
  );
  if (isLinearTool(stroke.tool)) {
    return {
      ...stroke,
      points: stroke.points.map((point) => scalePoint(point, startBounds, nextBounds)),
    };
  }
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

function preserveBoundsAspectRatio(start: WhiteboardSelectionRect, next: WhiteboardSelectionRect, handle: WhiteboardResizeHandle): WhiteboardSelectionRect {
  const minSize = themeWhiteboardTokens.selectionResizeMinSizePx;
  const scale = Math.max(
    Math.abs(getWhiteboardResizeScale(next.width, start.width)),
    Math.abs(getWhiteboardResizeScale(next.height, start.height)),
    minSize / Math.max(minSize, start.width),
    minSize / Math.max(minSize, start.height),
  );
  const width = start.width * scale * Math.sign(next.width || 1);
  const height = start.height * scale * Math.sign(next.height || 1);
  return {
    height,
    width,
    x: handle.includes('w') ? start.x + start.width - width : start.x,
    y: handle.includes('n') ? start.y + start.height - height : start.y,
  };
}

export function normalizeWhiteboardSelectionRect(rect: WhiteboardSelectionRect): WhiteboardSelectionRect {
  return {
    height: Math.abs(rect.height),
    width: Math.abs(rect.width),
    x: rect.width < 0 ? rect.x + rect.width : rect.x,
    y: rect.height < 0 ? rect.y + rect.height : rect.y,
  };
}

function keepResizeBoundsNonZero(rect: WhiteboardSelectionRect): WhiteboardSelectionRect {
  const minSize = themeWhiteboardTokens.selectionResizeMinSizePx;
  return {
    ...rect,
    height: Math.sign(rect.height || 1) * Math.max(minSize, Math.abs(rect.height)),
    width: Math.sign(rect.width || 1) * Math.max(minSize, Math.abs(rect.width)),
  };
}

function scaleRect(rect: WhiteboardSelectionRect, startBounds: WhiteboardSelectionRect, nextBounds: WhiteboardSelectionRect): WhiteboardSelectionRect {
  const scaleX = getWhiteboardResizeScale(nextBounds.width, startBounds.width);
  const scaleY = getWhiteboardResizeScale(nextBounds.height, startBounds.height);
  return {
    height: rect.height * scaleY,
    width: rect.width * scaleX,
    x: nextBounds.x + (rect.x - startBounds.x) * scaleX,
    y: nextBounds.y + (rect.y - startBounds.y) * scaleY,
  };
}

function scalePoint<T extends WhiteboardPoint>(point: T, startBounds: WhiteboardSelectionRect, nextBounds: WhiteboardSelectionRect): T {
  const scaleX = getWhiteboardResizeScale(nextBounds.width, startBounds.width);
  const scaleY = getWhiteboardResizeScale(nextBounds.height, startBounds.height);
  return {
    ...point,
    x: nextBounds.x + (point.x - startBounds.x) * scaleX,
    y: nextBounds.y + (point.y - startBounds.y) * scaleY,
  };
}

function toggleFlip(value: boolean | undefined, shouldFlip: boolean): boolean | undefined {
  const flipped = Boolean(value) !== shouldFlip;
  return flipped ? true : undefined;
}

const toElementMap = (elements: WhiteboardElement[] | ReadonlyMap<string, WhiteboardElement>) => Array.isArray(elements) ? new Map(elements.map((element) => [element.id, element])) : elements;
const toStrokeMap = (strokes: WhiteboardStroke[] | ReadonlyMap<string, WhiteboardStroke>) => Array.isArray(strokes) ? new Map(strokes.map((stroke) => [stroke.id, stroke])) : strokes;
