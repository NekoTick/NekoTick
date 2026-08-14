import { themeWhiteboardTokens } from '@/styles/themeTokens';
import {
  getEraserRadius,
  isLinearTool,
  type WhiteboardPoint,
  type WhiteboardStroke,
  type WhiteboardStrokePoint,
} from './whiteboardModel';
import { getStrokePointMaxWidth, interpolateWhiteboardStrokePoint } from './whiteboardStrokeDynamics';
import { invalidateWhiteboardStrokeRenderChunks } from './whiteboardStrokeRenderChunks';
import { invalidateWhiteboardStrokeRenderGeometry } from './whiteboardStrokeRenderGeometry';
import { distanceBetweenSegments, distanceToSegment } from './whiteboardSegmentGeometry';
import { getSmoothedStrokePoints } from './whiteboardStrokeRenderGeometry';
import { getOpenStrokePathSamples } from './whiteboardStrokePath';
import { getWhiteboardLinearSegments } from './whiteboardLinear';

export {
  getCenterStrokePath,
  getPressureStrokePath,
  getStrokePointSegments,
  getStrokeRenderGeometry,
  getStrokeRenderWidth,
  type StrokeRenderGeometry,
} from './whiteboardStrokeRenderGeometry';
export { getStrokeDabGeometry, type StrokeDabGeometry } from './whiteboardStrokeDynamics';

interface EraserBounds {
  maxWidth: number;
  maxX: number;
  maxY: number;
  minX: number;
  minY: number;
}

export interface WhiteboardEraserStrokeSamples {
  pathOffsets: Float64Array;
  points: WhiteboardStrokePoint[];
  ranges: WhiteboardEraserStrokeRange[];
  sourcePoints: WhiteboardStrokePoint[];
  sourcePositions: Float64Array;
}

export interface WhiteboardEraserStrokeRange {
  endIndex: number;
  startIndex: number;
}

const eraserBoundsCache = new WeakMap<WhiteboardStroke, EraserBounds | null>();
const eraserSampleCache = new WeakMap<WhiteboardStroke, WhiteboardEraserStrokeSamples>();

export function appendStrokePoints(
  currentPoints: WhiteboardStrokePoint[],
  nextPoints: WhiteboardStrokePoint[],
): WhiteboardStrokePoint[] {
  const points = [...currentPoints];
  appendStrokePointsInPlace(points, nextPoints);
  return points;
}

export function appendStrokePointsInPlace(
  points: WhiteboardStrokePoint[],
  nextPoints: WhiteboardStrokePoint[],
  minDistance: number = themeWhiteboardTokens.strokePointMinDistancePx,
): void {
  for (const point of nextPoints) {
    const previous = points.at(-1);
    if (point.breakBefore || !previous || distance(previous, point) >= minDistance) {
      points.push(point);
    } else if (!hasSameStrokeDynamics(previous, point)) {
      points[points.length - 1] = {
        ...point,
        ...(previous.breakBefore ? { breakBefore: true } : {}),
        x: previous.x,
        y: previous.y,
      };
      invalidateWhiteboardStrokeRenderChunks(points);
      invalidateWhiteboardStrokeRenderGeometry(points);
    }
  }
}

export function getStrokePointMinDistance(zoom: number): number {
  return themeWhiteboardTokens.strokePointMinDistancePx / Math.max(zoom, 0.1);
}

export function doesEraserSweepTouchStroke(
  stroke: WhiteboardStroke,
  start: WhiteboardPoint,
  end: WhiteboardPoint,
  eraserSize: number,
): boolean {
  const radius = getEraserRadius(eraserSize);
  if (!canEraserSweepTouchStroke(stroke, start, end, radius)) return false;
  if (isLinearTool(stroke.tool)) {
    const width = getStrokePointMaxWidth(stroke.tool, stroke.points[0], stroke.size);
    return getWhiteboardLinearSegments(stroke).some(([segmentStart, segmentEnd]) => (
      distanceBetweenSegments(start, end, segmentStart, segmentEnd) <= radius + width / 2
    ));
  }
  const points = getEraserSampledStrokePoints(stroke);
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const width = getStrokePointMaxWidth(stroke.tool, current, stroke.size);
    const previous = points[index - 1];
    if (!previous || current.breakBefore) {
      if (distanceToSegment(current, start, end) <= radius + width / 2) return true;
      continue;
    }
    const previousWidth = getStrokePointMaxWidth(stroke.tool, previous, stroke.size);
    if (distanceBetweenSegments(start, end, previous, current) <= radius + Math.max(width, previousWidth) / 2) return true;
  }
  return false;
}

function canEraserSweepTouchStroke(
  stroke: WhiteboardStroke,
  start: WhiteboardPoint,
  end: WhiteboardPoint,
  radius: number,
): boolean {
  const bounds = getEraserBounds(stroke);
  if (!bounds) return false;
  const padding = radius + bounds.maxWidth / 2;
  return Math.max(start.x, end.x) >= bounds.minX - padding &&
    Math.min(start.x, end.x) <= bounds.maxX + padding &&
    Math.max(start.y, end.y) >= bounds.minY - padding &&
    Math.min(start.y, end.y) <= bounds.maxY + padding;
}

function getEraserBounds(stroke: WhiteboardStroke): EraserBounds | null {
  const cached = eraserBoundsCache.get(stroke);
  if (cached !== undefined) return cached;
  if (stroke.points.length === 0) {
    eraserBoundsCache.set(stroke, null);
    return null;
  }
  const bounds = stroke.points.reduce<EraserBounds>((current, point) => ({
    maxWidth: Math.max(current.maxWidth, getStrokePointMaxWidth(stroke.tool, point, stroke.size)),
    maxX: Math.max(current.maxX, point.x),
    maxY: Math.max(current.maxY, point.y),
    minX: Math.min(current.minX, point.x),
    minY: Math.min(current.minY, point.y),
  }), { maxWidth: 0, maxX: -Infinity, maxY: -Infinity, minX: Infinity, minY: Infinity });
  eraserBoundsCache.set(stroke, bounds);
  return bounds;
}

export function getEraserSampledStrokePoints(stroke: WhiteboardStroke): WhiteboardStrokePoint[] {
  return getEraserStrokeSamples(stroke).points;
}

export function getEraserStrokeSamples(stroke: WhiteboardStroke): WhiteboardEraserStrokeSamples {
  const cached = eraserSampleCache.get(stroke);
  if (cached) return cached;
  const points: WhiteboardStrokePoint[] = [];
  const pathOffsets: number[] = [];
  const ranges: WhiteboardEraserStrokeRange[] = [];
  const sourcePoints: WhiteboardStrokePoint[] = [];
  const sourcePositions: number[] = [];
  let segmentStart = 0;
  for (let index = 1; index <= stroke.points.length; index += 1) {
    if (index < stroke.points.length && !stroke.points[index].breakBefore) continue;
    appendEraserStrokeSegment(
      stroke.points.slice(segmentStart, index),
      stroke.tool,
      segmentStart,
      points,
      sourcePoints,
      pathOffsets,
      sourcePositions,
      ranges,
    );
    segmentStart = index;
  }

  const sampled: WhiteboardEraserStrokeSamples = {
    pathOffsets: Float64Array.from(pathOffsets),
    points,
    ranges,
    sourcePoints,
    sourcePositions: Float64Array.from(sourcePositions),
  };
  eraserSampleCache.set(stroke, sampled);
  return sampled;
}

function appendEraserStrokeSegment(
  source: WhiteboardStrokePoint[],
  tool: WhiteboardStroke['tool'],
  sourceOffset: number,
  points: WhiteboardStrokePoint[],
  sourcePoints: WhiteboardStrokePoint[],
  pathOffsets: number[],
  sourcePositions: number[],
  ranges: WhiteboardEraserStrokeRange[],
): void {
  if (source.length === 0) return;
  const startIndex = points.length;
  const rendered = getOpenStrokePathSamples(
    getSmoothedStrokePoints(source, tool),
    themeWhiteboardTokens.eraserSampleStepPx,
  );
  let pathOffset = 0;
  let previousSourcePoint: WhiteboardStrokePoint | null = null;
  for (const sample of rendered) {
    const localStart = Math.floor(sample.sourcePosition);
    const localEnd = Math.ceil(sample.sourcePosition);
    const progress = sample.sourcePosition - localStart;
    const sourcePoint = progress === 0
      ? source[localStart]
      : interpolateWhiteboardStrokePoint(source[localStart], source[localEnd], progress);
    if (previousSourcePoint) pathOffset += distance(previousSourcePoint, sourcePoint);
    const startsSegment = points.length === startIndex && startIndex > 0;
    points.push(startsSegment ? { ...sample.point, breakBefore: true } : sample.point);
    sourcePoints.push(startsSegment ? { ...sourcePoint, breakBefore: true } : sourcePoint);
    pathOffsets.push(pathOffset);
    sourcePositions.push(sourceOffset + sample.sourcePosition);
    previousSourcePoint = sourcePoint;
  }
  ranges.push({ endIndex: points.length - 1, startIndex });
}

function distance(a: WhiteboardPoint, b: WhiteboardPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function hasSameStrokeDynamics(first: WhiteboardStrokePoint, second: WhiteboardStrokePoint): boolean {
  return first.azimuth === second.azimuth
    && first.pressure === second.pressure
    && first.rotation === second.rotation
    && first.tilt === second.tilt
    && first.velocity === second.velocity;
}
