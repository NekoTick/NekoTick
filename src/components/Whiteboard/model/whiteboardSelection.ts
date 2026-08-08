import { themeWhiteboardTokens } from '@/styles/themeTokens';
import {
  type WhiteboardElement,
  type WhiteboardPoint,
  type WhiteboardStroke,
} from './whiteboardModel';
import { getStrokePointSegments } from './whiteboardStrokeGeometry';
import { getStrokePointMaxWidth } from './whiteboardStrokeDynamics';
import { distanceBetweenSegments } from './whiteboardSegmentGeometry';
import { getElementBounds, getStrokeBounds, type WhiteboardSelectionRect } from './whiteboardSelectionTransform';

export {
  getBoundsUnion,
  extendSelectedOverlayGeometry,
  getElementBounds,
  getResizedSelectionBounds,
  getSelectedOverlayGeometry,
  getSelectionBounds,
  getStrokeBounds,
  resizeSelectionElements,
  resizeSelectionElement,
  resizeSelectionStroke,
  resizeSelectionStrokes,
  translateElementsFromOriginals,
  translateStroke,
  translateStrokesFromOriginals,
} from './whiteboardSelectionTransform';
export type { WhiteboardResizeHandle, WhiteboardSelectedOverlayGeometry, WhiteboardSelectionRect } from './whiteboardSelectionTransform';

export type WhiteboardLassoPath = WhiteboardPoint[];
type WhiteboardLassoSegment = [WhiteboardPoint, WhiteboardPoint];

export interface WhiteboardLassoSelection {
  elementIds: string[];
  strokeIds: string[];
}


export function findStrokeAtPoint(
  strokes: WhiteboardStroke[],
  point: WhiteboardPoint,
  zoom: number,
): WhiteboardStroke | null {
  const tolerance = themeWhiteboardTokens.strokeHitTolerancePx / zoom;
  for (let index = strokes.length - 1; index >= 0; index -= 1) {
    const stroke = strokes[index];
    const bounds = getStrokeBounds(stroke);
    if (!bounds || !pointInRect(point, bounds, tolerance)) continue;
    if (isPointNearStroke(stroke, point, tolerance)) return stroke;
  }
  return null;
}

export function findElementAtPoint(
  elements: WhiteboardElement[],
  point: WhiteboardPoint,
): WhiteboardElement | null {
  for (let index = elements.length - 1; index >= 0; index -= 1) {
    const element = elements[index];
    if (pointInRect(point, getElementBounds(element))) return element;
  }
  return null;
}

export function getLassoBounds(path: WhiteboardLassoPath): WhiteboardSelectionRect | null {
  if (path.length === 0) return null;
  const minX = Math.min(...path.map((point) => point.x));
  const minY = Math.min(...path.map((point) => point.y));
  const maxX = Math.max(...path.map((point) => point.x));
  const maxY = Math.max(...path.map((point) => point.y));
  return { height: maxY - minY, width: maxX - minX, x: minX, y: minY };
}

export function getElementsInLasso(elements: WhiteboardElement[], path: WhiteboardLassoPath): string[] {
  return getItemsInLasso(elements, [], path).elementIds;
}

export function getStrokesInLasso(strokes: WhiteboardStroke[], path: WhiteboardLassoPath): string[] {
  return getItemsInLasso([], strokes, path).strokeIds;
}

export function getItemsInLasso(
  elements: WhiteboardElement[],
  strokes: WhiteboardStroke[],
  path: WhiteboardLassoPath,
): WhiteboardLassoSelection {
  if (!isUsableLasso(path)) return { elementIds: [], strokeIds: [] };
  const lassoBounds = getLassoBounds(path);
  if (!lassoBounds) return { elementIds: [], strokeIds: [] };
  const segments = getLassoSegments(path);
  return {
    elementIds: elements.flatMap((element) => (
      elementIntersectsLasso(element, path, lassoBounds, segments) ? [element.id] : []
    )),
    strokeIds: strokes.flatMap((stroke) => (
      strokeIntersectsLasso(stroke, path, lassoBounds, segments) ? [stroke.id] : []
    )),
  };
}

function isPointNearStroke(stroke: WhiteboardStroke, point: WhiteboardPoint, tolerance: number): boolean {
  if (stroke.points.length === 0) return false;
  if (stroke.points.length === 1) {
    return distance(stroke.points[0], point) <= getStrokeMaxWidth(stroke) / 2 + tolerance;
  }
  return getStrokePointSegments(stroke.points).some((segment) => segment.some((current, index) => {
    const previous = segment[index - 1];
    if (!previous) return false;
    const width = Math.max(
      getStrokePointMaxWidth(stroke.tool, previous, stroke.size),
      getStrokePointMaxWidth(stroke.tool, current, stroke.size),
    );
    return distanceToSegment(point, previous, current) <= width / 2 + tolerance;
  }));
}

function isUsableLasso(path: WhiteboardLassoPath): boolean {
  const bounds = getLassoBounds(path);
  return path.length >= 3 && Boolean(bounds && (bounds.width >= 3 || bounds.height >= 3));
}

function elementIntersectsLasso(
  element: WhiteboardElement,
  path: WhiteboardLassoPath,
  lassoBounds: WhiteboardSelectionRect,
  segments: WhiteboardLassoSegment[],
): boolean {
  const bounds = getElementBounds(element);
  if (!rectsOverlap(bounds, lassoBounds)) return false;
  const points = [
    { x: bounds.x, y: bounds.y },
    { x: bounds.x + bounds.width, y: bounds.y },
    { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
    { x: bounds.x, y: bounds.y + bounds.height },
  ];
  return points.some((point) => pointInPolygon(point, path)) || segments.some(([start, end]) => segmentIntersectsRect(start, end, bounds));
}

function strokeIntersectsLasso(
  stroke: WhiteboardStroke,
  path: WhiteboardLassoPath,
  lassoBounds: WhiteboardSelectionRect,
  lassoSegments: WhiteboardLassoSegment[],
): boolean {
  const bounds = getStrokeBounds(stroke);
  if (!bounds || !rectsOverlap(bounds, lassoBounds)) return false;
  if (stroke.points.some((point) => pointInPolygon(point, path))) return true;
  return getStrokePointSegments(stroke.points).some((segment) => segment.some((current, index) => {
    const previous = segment[index - 1];
    const width = Math.max(
      getStrokePointMaxWidth(stroke.tool, current, stroke.size),
      previous ? getStrokePointMaxWidth(stroke.tool, previous, stroke.size) : 0,
    );
    return lassoSegments.some(([start, end]) => previous
      ? distanceBetweenSegments(previous, current, start, end) <= width / 2
      : distanceToSegment(current, start, end) <= width / 2);
  }));
}

function getStrokeMaxWidth(stroke: WhiteboardStroke): number {
  return stroke.points.reduce(
    (maxWidth, point) => Math.max(maxWidth, getStrokePointMaxWidth(stroke.tool, point, stroke.size)),
    0,
  );
}

function pointInRect(point: WhiteboardPoint, rect: WhiteboardSelectionRect, padding = 0): boolean {
  return point.x >= rect.x - padding && point.x <= rect.x + rect.width + padding
    && point.y >= rect.y - padding && point.y <= rect.y + rect.height + padding;
}

function pointInPolygon(point: WhiteboardPoint, polygon: WhiteboardLassoPath): boolean {
  let inside = false;
  for (let index = 0, previousIndex = polygon.length - 1; index < polygon.length; previousIndex = index, index += 1) {
    const current = polygon[index];
    const previous = polygon[previousIndex];
    const crossesY = current.y > point.y !== previous.y > point.y;
    const xAtY = ((previous.x - current.x) * (point.y - current.y)) / (previous.y - current.y) + current.x;
    if (crossesY && point.x < xAtY) inside = !inside;
  }
  return inside;
}

function getLassoSegments(path: WhiteboardLassoPath): WhiteboardLassoSegment[] {
  return path.map((point, index) => [point, path[(index + 1) % path.length]]);
}

function segmentIntersectsRect(start: WhiteboardPoint, end: WhiteboardPoint, rect: WhiteboardSelectionRect): boolean {
  const topLeft = { x: rect.x, y: rect.y };
  const topRight = { x: rect.x + rect.width, y: rect.y };
  const bottomRight = { x: rect.x + rect.width, y: rect.y + rect.height };
  const bottomLeft = { x: rect.x, y: rect.y + rect.height };
  return [
    [topLeft, topRight],
    [topRight, bottomRight],
    [bottomRight, bottomLeft],
    [bottomLeft, topLeft],
  ].some(([edgeStart, edgeEnd]) => segmentsIntersect(start, end, edgeStart, edgeEnd));
}

function segmentsIntersect(a: WhiteboardPoint, b: WhiteboardPoint, c: WhiteboardPoint, d: WhiteboardPoint): boolean {
  const abC = orientation(a, b, c);
  const abD = orientation(a, b, d);
  const cdA = orientation(c, d, a);
  const cdB = orientation(c, d, b);
  if (abC === 0 && pointOnSegment(c, a, b)) return true;
  if (abD === 0 && pointOnSegment(d, a, b)) return true;
  if (cdA === 0 && pointOnSegment(a, c, d)) return true;
  if (cdB === 0 && pointOnSegment(b, c, d)) return true;
  return abC !== abD && cdA !== cdB;
}

function orientation(a: WhiteboardPoint, b: WhiteboardPoint, c: WhiteboardPoint): number {
  const value = (b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y);
  if (Math.abs(value) < 0.000001) return 0;
  return value > 0 ? 1 : 2;
}

function pointOnSegment(point: WhiteboardPoint, start: WhiteboardPoint, end: WhiteboardPoint): boolean {
  return point.x <= Math.max(start.x, end.x) && point.x >= Math.min(start.x, end.x)
    && point.y <= Math.max(start.y, end.y) && point.y >= Math.min(start.y, end.y);
}

export function rectsOverlap(a: WhiteboardSelectionRect, b: WhiteboardSelectionRect): boolean {
  return a.x <= b.x + b.width && a.x + a.width >= b.x && a.y <= b.y + b.height && a.y + a.height >= b.y;
}

function distance(a: WhiteboardPoint, b: WhiteboardPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function distanceToSegment(point: WhiteboardPoint, start: WhiteboardPoint, end: WhiteboardPoint): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (dx === 0 && dy === 0) return distance(point, start);
  const progress = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(point.x - (start.x + dx * progress), point.y - (start.y + dy * progress));
}
