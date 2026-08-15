import { themeWhiteboardTokens } from '@/styles/themeTokens';
import {
  type WhiteboardElement,
  type WhiteboardPoint,
  type WhiteboardStroke,
  type WhiteboardStrokePoint,
} from './whiteboardModel';
import { getStrokePointMaxWidth } from './whiteboardStrokeDynamics';
import { getWhiteboardLinearVisualPoints } from './whiteboardLinear';
import { isLinearTool } from './whiteboardModel';

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
  const points = isLinearTool(stroke.tool) ? getWhiteboardLinearVisualPoints(stroke) : stroke.points;
  for (const point of points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
    maxWidth = Math.max(maxWidth, getStrokePointMaxWidth(stroke.tool, 'pressure' in point ? point as WhiteboardStrokePoint : stroke.points[0], stroke.size));
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
  const corners = getElementCorners(element);
  const minX = Math.min(...corners.map((point) => point.x));
  const minY = Math.min(...corners.map((point) => point.y));
  const maxX = Math.max(...corners.map((point) => point.x));
  const maxY = Math.max(...corners.map((point) => point.y));
  return { height: maxY - minY, width: maxX - minX, x: minX, y: minY };
}

export function getElementContentRect(element: WhiteboardElement): WhiteboardSelectionRect {
  if (element.type !== 'icon' || !element.autoDrawIcon) {
    return { height: element.height, width: element.width, x: element.x, y: element.y };
  }
  const size = Math.min(element.width, element.height);
  return {
    height: size,
    width: size,
    x: element.x + (element.width - size) / 2,
    y: element.y + (element.height - size) / 2,
  };
}

export function getElementCorners(element: WhiteboardElement): WhiteboardPoint[] {
  const rect = getElementContentRect(element);
  const corners = [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.width, y: rect.y },
    { x: rect.x + rect.width, y: rect.y + rect.height },
    { x: rect.x, y: rect.y + rect.height },
  ];
  if (!element.rotation) return corners;
  const center = {
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2,
  };
  const cosine = Math.cos(element.rotation);
  const sine = Math.sin(element.rotation);
  return corners.map((point) => {
    const x = point.x - center.x;
    const y = point.y - center.y;
    return {
      x: center.x + x * cosine - y * sine,
      y: center.y + x * sine + y * cosine,
    };
  });
}

export function getBoundsUnion(bounds: WhiteboardSelectionRect[]): WhiteboardSelectionRect | null {
  if (bounds.length === 0) return null;
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
    height: maxY - minY,
    width: maxX - minX,
    x: minX,
    y: minY,
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
  const selectedBounds = [
    ...elements.flatMap((element) => (selectedElementIds.has(element.id) ? [getElementBounds(element)] : [])),
    ...strokes.flatMap((stroke) => {
      if (!selectedStrokeIds.has(stroke.id)) return [];
      const bounds = getStrokeBounds(stroke);
      return bounds ? [bounds] : [];
    }),
  ];
  if (selectedBounds.length === 0) return null;
  if (selectedBounds.length === 1) return selectedBounds[0];
  return getBoundsUnion(selectedBounds);
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
    accumulator.count = 2;
    accumulator.minX = current.groupBounds.x;
    accumulator.minY = current.groupBounds.y;
    accumulator.maxX = current.groupBounds.x + current.groupBounds.width;
    accumulator.maxY = current.groupBounds.y + current.groupBounds.height;
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
  return {
    groupBounds: {
      height: accumulator.maxY - accumulator.minY,
      width: accumulator.maxX - accumulator.minX,
      x: accumulator.minX,
      y: accumulator.minY,
    },
    singleBounds: null,
    singleStroke: null,
  };
}
