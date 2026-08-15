import { themeWhiteboardTokens } from '@/styles/themeTokens';
import { createStrokePoint, type WhiteboardAutoShape, type WhiteboardPoint, type WhiteboardStroke } from './whiteboardModel';
import { recognizeWhiteboardClosedShape } from './whiteboardClosedShapeRecognition';
import {
  getWhiteboardDistanceToSegment,
  getWhiteboardPrincipalAxes,
  getWhiteboardStandardizedMoment,
} from './whiteboardAutoShapeMath';

export type WhiteboardRecognizedShape = WhiteboardAutoShape | 'line' | 'arrow' | 'freedraw';

export interface WhiteboardShapeRecognitionResult {
  bounds: readonly [number, number, number, number];
  points?: WhiteboardPoint[];
  type: WhiteboardRecognizedShape;
}

export interface WhiteboardAutoShapePreview {
  pending: boolean;
  stroke: WhiteboardStroke;
}

const RESAMPLE_COUNT = 64;
const MIN_SCREEN_SIZE = 25;
const CLOSED_GAP_MAX_RATIO = 0.15;
const LINEAR_MAX_ELONGATION = 0.25;
const ARROWHEAD_ZONE_RATIO = 0.5;
const LINEAR_MAX_SHAFT_DEVIATION = 0.15;
const ARROW_MIN_SKEW = 0.3;

export function recognizeWhiteboardShape(
  points: readonly WhiteboardPoint[],
  zoom = 1,
): WhiteboardShapeRecognitionResult {
  const bounds = getBounds(points);
  const maxDimension = Math.max(bounds[2] - bounds[0], bounds[3] - bounds[1]);
  if (points.length < 3 || maxDimension * zoom < MIN_SCREEN_SIZE) return { bounds, type: 'freedraw' };
  const resampled = resample(points, RESAMPLE_COUNT);
  const pathLength = getPathLength(resampled);
  const gapRatio = pathLength > 0 ? distance(resampled[0], resampled.at(-1)!) / pathLength : 0;
  const axes = getWhiteboardPrincipalAxes(resampled);
  const majorProjection = resampled.map((point) => (
    (point.x - axes.centroid.x) * axes.major.x + (point.y - axes.centroid.y) * axes.major.y
  ));
  const features = {
    elongation: axes.majorVariance > 0 ? axes.minorVariance / axes.majorVariance : 1,
    majorSkew: getWhiteboardStandardizedMoment(majorProjection, 3),
    shaftDeviationRatio: getShaftDeviationRatio(resampled),
  };
  if (gapRatio > CLOSED_GAP_MAX_RATIO) {
    const straight = features.elongation <= LINEAR_MAX_ELONGATION
      && features.shaftDeviationRatio <= LINEAR_MAX_SHAFT_DEVIATION;
    return { bounds, type: straight ? Math.abs(features.majorSkew) >= ARROW_MIN_SKEW ? 'arrow' : 'line' : 'freedraw' };
  }
  const closed = recognizeWhiteboardClosedShape(resampled, bounds);
  return closed ? { bounds, points: closed.points, type: closed.type } : { bounds, type: 'freedraw' };
}

export function finalizeWhiteboardAutoShape(stroke: WhiteboardStroke, zoom: number): WhiteboardStroke {
  const recognition = recognizeWhiteboardShape(stroke.points, zoom);
  if (recognition.type === 'freedraw') return { ...stroke, tool: 'pen' };
  if (recognition.type === 'line') {
    return { ...stroke, points: [toStrokePoint(stroke.points[0]), toStrokePoint(stroke.points.at(-1)!)], tool: 'line' };
  }
  if (recognition.type === 'arrow') {
    const end = getArrowEndpoint(stroke.points, recognition.bounds);
    const length = distance(stroke.points[0], end);
    return {
      ...stroke,
      points: [toStrokePoint(stroke.points[0]), toStrokePoint(end)],
      tool: length < 60 ? 'line' : 'arrow',
    };
  }
  return {
    ...stroke,
    autoShape: recognition.type,
    points: recognition.points!.map(toStrokePoint),
    tool: 'line',
  };
}

export function getWhiteboardAutoShapePreview(
  stroke: WhiteboardStroke,
  zoom: number,
  recognition = recognizeWhiteboardShape(stroke.points, zoom),
): WhiteboardAutoShapePreview {
  if (recognition.type === 'freedraw' || recognition.type === 'line' || recognition.type === 'arrow') {
    return { pending: false, stroke };
  }
  return {
    pending: true,
    stroke: { ...stroke, autoShape: recognition.type, points: recognition.points!.map(toStrokePoint), tool: 'line' },
  };
}

function resample(points: readonly WhiteboardPoint[], count: number): WhiteboardPoint[] {
  const totalLength = getPathLength(points);
  const interval = totalLength / (count - 1);
  let accumulated = 0;
  const result = [points[0]];
  let previous = points[0];
  for (let index = 1; index < points.length; index += 1) {
    const current = points[index];
    const segmentLength = distance(previous, current);
    if (accumulated + segmentLength >= interval) {
      let remaining = interval - accumulated;
      while (remaining <= segmentLength + 1e-10) {
        const progress = remaining / segmentLength;
        const point = { x: previous.x + progress * (current.x - previous.x), y: previous.y + progress * (current.y - previous.y) };
        result.push(point);
        if (result.length === count) return result;
        previous = point;
        accumulated = 0;
        remaining += interval;
      }
      accumulated = segmentLength - (remaining - interval);
    } else accumulated += segmentLength;
    previous = current;
  }
  while (result.length < count) result.push(points.at(-1)!);
  return result;
}

function getShaftDeviationRatio(points: readonly WhiteboardPoint[]): number {
  const start = points[0];
  let tip = start;
  let tipDistanceSquared = 0;
  for (const point of points) {
    const pointDistanceSquared = distanceSquared(start, point);
    if (pointDistanceSquared > tipDistanceSquared) {
      tip = point;
      tipDistanceSquared = pointDistanceSquared;
    }
  }
  const tipDistance = Math.sqrt(tipDistanceSquared);
  if (tipDistance === 0) return 0;
  let maximum = 0;
  for (const point of points) {
    if (distance(point, tip) <= ARROWHEAD_ZONE_RATIO * tipDistance) continue;
    maximum = Math.max(maximum, getWhiteboardDistanceToSegment(point, start, tip));
  }
  return maximum / tipDistance;
}

function getArrowEndpoint(points: readonly WhiteboardPoint[], bounds: readonly [number, number, number, number]): WhiteboardPoint {
  const [minX, minY, maxX, maxY] = bounds;
  const perimeter = [
    { x: minX, y: minY }, { x: (minX + maxX) / 2, y: minY }, { x: maxX, y: minY }, { x: maxX, y: (minY + maxY) / 2 },
    { x: maxX, y: maxY }, { x: (minX + maxX) / 2, y: maxY }, { x: minX, y: maxY }, { x: minX, y: (minY + maxY) / 2 },
  ];
  const ideal = perimeter.reduce((best, point) => distanceSquared(points[0], point) > distanceSquared(points[0], best) ? point : best);
  return points.reduce((best, point) => distanceSquared(ideal, point) < distanceSquared(ideal, best) ? point : best);
}

function getBounds(points: readonly WhiteboardPoint[]): readonly [number, number, number, number] {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  return [minX, minY, maxX, maxY];
}

function getPathLength(points: readonly WhiteboardPoint[]): number {
  let length = 0;
  for (let index = 1; index < points.length; index += 1) {
    length += distance(points[index - 1], points[index]);
  }
  return length;
}

function toStrokePoint(point: WhiteboardPoint) {
  return createStrokePoint(point, themeWhiteboardTokens.defaultPointerPressure);
}

function distance(a: WhiteboardPoint, b: WhiteboardPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function distanceSquared(a: WhiteboardPoint, b: WhiteboardPoint): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}
