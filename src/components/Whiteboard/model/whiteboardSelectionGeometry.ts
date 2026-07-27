import { themeWhiteboardTokens } from '@/styles/themeTokens';
import {
  getStrokeWidth,
  type WhiteboardElement,
  type WhiteboardStroke,
} from './whiteboardModel';

export interface WhiteboardSelectionRect {
  height: number;
  width: number;
  x: number;
  y: number;
}

export interface WhiteboardSelectedOverlayGeometry {
  groupBounds: WhiteboardSelectionRect | null;
  singleBounds: (WhiteboardSelectionRect & { id: string }) | null;
  singleStroke: WhiteboardStroke | null;
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

export function cacheTranslatedStrokeBounds(
  source: WhiteboardStroke,
  translated: WhiteboardStroke,
  dx: number,
  dy: number,
): void {
  const bounds = strokeBoundsCache.get(source);
  if (bounds) strokeBoundsCache.set(translated, { ...bounds, x: bounds.x + dx, y: bounds.y + dy });
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
  for (const rect of bounds) {
    minX = Math.min(minX, rect.x);
    minY = Math.min(minY, rect.y);
    maxX = Math.max(maxX, rect.x + rect.width);
    maxY = Math.max(maxY, rect.y + rect.height);
  }
  return {
    height: maxY - minY + padding * 2,
    width: maxX - minX + padding * 2,
    x: minX - padding,
    y: minY - padding,
  };
}

export function getSelectedOverlayGeometry(
  elements: WhiteboardElement[],
  strokes: WhiteboardStroke[],
): WhiteboardSelectedOverlayGeometry {
  const accumulator = createSelectedOverlayAccumulator();
  includeSelectedOverlayItems(accumulator, elements, strokes);
  return finishSelectedOverlayGeometry(accumulator);
}

export function extendSelectedOverlayGeometry(
  current: WhiteboardSelectedOverlayGeometry,
  elements: WhiteboardElement[],
  strokes: WhiteboardStroke[],
): WhiteboardSelectedOverlayGeometry {
  if (elements.length === 0 && strokes.length === 0) return current;
  const accumulator = createSelectedOverlayAccumulator(current);
  includeSelectedOverlayItems(accumulator, elements, strokes);
  return finishSelectedOverlayGeometry(accumulator);
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

interface SelectedOverlayAccumulator {
  count: number;
  maxX: number;
  maxY: number;
  minX: number;
  minY: number;
  singleBounds: WhiteboardSelectedOverlayGeometry['singleBounds'];
  singleStroke: WhiteboardStroke | null;
}

function createSelectedOverlayAccumulator(
  current?: WhiteboardSelectedOverlayGeometry,
): SelectedOverlayAccumulator {
  const accumulator: SelectedOverlayAccumulator = {
    count: 0,
    maxX: -Infinity,
    maxY: -Infinity,
    minX: Infinity,
    minY: Infinity,
    singleBounds: null,
    singleStroke: null,
  };
  if (current?.groupBounds) {
    const padding = themeWhiteboardTokens.strokeSelectionPaddingPx;
    accumulator.count = 2;
    accumulator.minX = current.groupBounds.x + padding;
    accumulator.minY = current.groupBounds.y + padding;
    accumulator.maxX = current.groupBounds.x + current.groupBounds.width - padding;
    accumulator.maxY = current.groupBounds.y + current.groupBounds.height - padding;
  } else if (current?.singleBounds) {
    includeSelectedOverlayBounds(accumulator, current.singleBounds, current.singleBounds.id, current.singleStroke);
  }
  return accumulator;
}

function includeSelectedOverlayItems(
  accumulator: SelectedOverlayAccumulator,
  elements: WhiteboardElement[],
  strokes: WhiteboardStroke[],
): void {
  for (const element of elements) {
    includeSelectedOverlayBounds(accumulator, getElementBounds(element), element.id, null);
  }
  for (const stroke of strokes) {
    const bounds = getStrokeBounds(stroke);
    if (bounds) includeSelectedOverlayBounds(accumulator, bounds, stroke.id, stroke);
  }
}

function includeSelectedOverlayBounds(
  accumulator: SelectedOverlayAccumulator,
  bounds: WhiteboardSelectionRect,
  id: string,
  stroke: WhiteboardStroke | null,
): void {
  accumulator.count += 1;
  if (accumulator.count === 1) {
    accumulator.singleBounds = { ...bounds, id };
    accumulator.singleStroke = stroke;
  }
  accumulator.minX = Math.min(accumulator.minX, bounds.x);
  accumulator.minY = Math.min(accumulator.minY, bounds.y);
  accumulator.maxX = Math.max(accumulator.maxX, bounds.x + bounds.width);
  accumulator.maxY = Math.max(accumulator.maxY, bounds.y + bounds.height);
}

function finishSelectedOverlayGeometry(
  accumulator: SelectedOverlayAccumulator,
): WhiteboardSelectedOverlayGeometry {
  if (accumulator.count <= 1) {
    return {
      groupBounds: null,
      singleBounds: accumulator.singleBounds,
      singleStroke: accumulator.singleStroke,
    };
  }
  const padding = themeWhiteboardTokens.strokeSelectionPaddingPx;
  return {
    groupBounds: {
      height: accumulator.maxY - accumulator.minY + padding * 2,
      width: accumulator.maxX - accumulator.minX + padding * 2,
      x: accumulator.minX - padding,
      y: accumulator.minY - padding,
    },
    singleBounds: null,
    singleStroke: null,
  };
}
