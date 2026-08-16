import rough from 'roughjs';
import type { Op } from 'roughjs/bin/core';
import type { WhiteboardPoint, WhiteboardStroke } from '@/components/Whiteboard/model/core/whiteboardModel';

export type WhiteboardCubicCurve = [WhiteboardPoint, WhiteboardPoint, WhiteboardPoint, WhiteboardPoint];
export type WhiteboardRoughOp = { op: 'move' | 'lineTo' | 'bcurveTo'; data: number[] };

const roughGenerator = rough.generator();
const roughOpsCache = new WeakMap<WhiteboardStroke, {
  collision?: WhiteboardRoughOp[];
  render?: WhiteboardRoughOp[];
}>();

export function getWhiteboardAutoShapePath(stroke: WhiteboardStroke): string {
  if (!stroke.autoShape || stroke.points.length === 0) return '';
  const options = { preserveVertices: true, roughness: getWhiteboardLinearRoughness(stroke), seed: hashWhiteboardLinearSeed(stroke.id) };
  const shape = stroke.autoShape === 'ellipse'
    ? roughGenerator.curve(stroke.points.map(({ x, y }) => [x, y]), options)
    : roughGenerator.polygon(stroke.points.slice(0, -1).map(({ x, y }) => [x, y]), options);
  return shape.sets.map((set) => roughGenerator.opsToPath(set)).join(' ');
}

const quadraturePositions = [
  -0.06405689286260563, 0.06405689286260563, -0.1911188674736163, 0.1911188674736163,
  -0.3150426796961634, 0.3150426796961634, -0.43379350762604514, 0.43379350762604514,
  -0.5454214713888396, 0.5454214713888396, -0.6480936519369755, 0.6480936519369755,
  -0.7401241915785544, 0.7401241915785544, -0.8200019859739029, 0.8200019859739029,
  -0.886415527004401, 0.886415527004401, -0.9382745520027328, 0.9382745520027328,
  -0.9747285559713095, 0.9747285559713095, -0.9951872199970214, 0.9951872199970214,
];

const quadratureWeights = [
  0.12793819534675216, 0.12793819534675216, 0.1258374563468283, 0.1258374563468283,
  0.12167047292780339, 0.12167047292780339, 0.1155056680537256, 0.1155056680537256,
  0.10744427011596563, 0.10744427011596563, 0.09761865210411389, 0.09761865210411389,
  0.08619016153195328, 0.08619016153195328, 0.0733464814110803, 0.0733464814110803,
  0.05929858491543678, 0.05929858491543678, 0.04427743881741981, 0.04427743881741981,
  0.028531388628933663, 0.028531388628933663, 0.0123412297999872, 0.0123412297999872,
];

export function getWhiteboardRoughCurveOps(
  stroke: WhiteboardStroke,
  collision: boolean,
): WhiteboardRoughOp[] {
  if (stroke.points.length < 2) return [];
  const cacheKey = collision ? 'collision' : 'render';
  const cached = roughOpsCache.get(stroke)?.[cacheKey];
  if (cached) return cached;
  const roughness = getWhiteboardLinearRoughness(stroke);
  const options = collision
    ? { disableMultiStroke: true, maxRandomnessOffset: 0, preserveVertices: true, roughness: 0, seed: hashWhiteboardLinearSeed(stroke.id) }
    : { preserveVertices: true, roughness, seed: hashWhiteboardLinearSeed(stroke.id) };
  const shape = roughGenerator.curve(stroke.points.map(({ x, y }) => [x, y]), options);
  const ops = shape.sets[0]?.ops ?? [];
  const entry = roughOpsCache.get(stroke) ?? {};
  entry[cacheKey] = ops;
  roughOpsCache.set(stroke, entry);
  return ops;
}

export function getWhiteboardRoughCurvePath(stroke: WhiteboardStroke): string {
  const ops = getWhiteboardRoughCurveOps(stroke, false);
  return ops.length > 0 ? roughGenerator.opsToPath({ type: 'path', ops: ops as Op[] }) : '';
}

export function getWhiteboardRoughLinePath(
  start: WhiteboardPoint,
  end: WhiteboardPoint,
  roughness: number,
  seed: number,
): string {
  const shape = roughGenerator.line(start.x, start.y, end.x, end.y, {
    preserveVertices: true,
    roughness,
    seed,
  });
  return roughGenerator.opsToPath(shape.sets[0]);
}

export function getWhiteboardCollisionCurves(stroke: WhiteboardStroke): WhiteboardCubicCurve[] {
  const curves: WhiteboardCubicCurve[] = [];
  let start: WhiteboardPoint | null = null;
  for (const op of getWhiteboardRoughCurveOps(stroke, true)) {
    if (op.op === 'move') start = { x: op.data[0], y: op.data[1] };
    if (op.op === 'bcurveTo' && start) {
      const end = { x: op.data[4], y: op.data[5] };
      curves.push([start, { x: op.data[0], y: op.data[1] }, { x: op.data[2], y: op.data[3] }, end]);
      start = end;
    }
  }
  return curves;
}

export function getWhiteboardCurvePointAtLength(
  curve: WhiteboardCubicCurve,
  percent: number,
): WhiteboardPoint {
  if (percent <= 0) return getWhiteboardCurvePoint(curve, 0);
  if (percent >= 1) return getWhiteboardCurvePoint(curve, 1);
  const totalLength = getCurveLengthAtParameter(curve, 1);
  const targetLength = totalLength * percent;
  let min = 0;
  let max = 1;
  let parameter = percent;
  for (let iteration = 0; iteration < 20; iteration += 1) {
    const currentLength = getCurveLengthAtParameter(curve, parameter);
    if (Math.abs(currentLength - targetLength) < totalLength * 0.0001) break;
    if (currentLength < targetLength) min = parameter;
    else max = parameter;
    parameter = (min + max) / 2;
  }
  return getWhiteboardCurvePoint(curve, parameter);
}

export function getWhiteboardCurveLength(curve: WhiteboardCubicCurve): number {
  return getCurveLengthAtParameter(curve, 1);
}

export function sampleWhiteboardCurve(
  curve: WhiteboardCubicCurve,
): Array<[WhiteboardPoint, WhiteboardPoint]> {
  const segments: Array<[WhiteboardPoint, WhiteboardPoint]> = [];
  let previous = getWhiteboardCurvePoint(curve, 0);
  for (let index = 1; index <= 24; index += 1) {
    const current = getWhiteboardCurvePoint(curve, index / 24);
    segments.push([previous, current]);
    previous = current;
  }
  return segments;
}

function getWhiteboardCurvePoint(curve: WhiteboardCubicCurve, t: number): WhiteboardPoint {
  const inverse = 1 - t;
  return {
    x: inverse ** 3 * curve[0].x + 3 * inverse ** 2 * t * curve[1].x + 3 * inverse * t ** 2 * curve[2].x + t ** 3 * curve[3].x,
    y: inverse ** 3 * curve[0].y + 3 * inverse ** 2 * t * curve[1].y + 3 * inverse * t ** 2 * curve[2].y + t ** 3 * curve[3].y,
  };
}

function getCurveLengthAtParameter(curve: WhiteboardCubicCurve, maxParameter: number): number {
  const half = maxParameter / 2;
  let sum = 0;
  for (let index = 0; index < quadraturePositions.length; index += 1) {
    const t = half * quadraturePositions[index] + half;
    const inverse = 1 - t;
    const tangentX = 3 * inverse ** 2 * (curve[1].x - curve[0].x)
      + 6 * inverse * t * (curve[2].x - curve[1].x)
      + 3 * t ** 2 * (curve[3].x - curve[2].x);
    const tangentY = 3 * inverse ** 2 * (curve[1].y - curve[0].y)
      + 6 * inverse * t * (curve[2].y - curve[1].y)
      + 3 * t ** 2 * (curve[3].y - curve[2].y);
    sum += quadratureWeights[index] * Math.hypot(tangentX, tangentY);
  }
  return half * sum;
}

export function hashWhiteboardLinearSeed(id: string): number {
  let hash = 2166136261;
  for (let index = 0; index < id.length; index += 1) hash = Math.imul(hash ^ id.charCodeAt(index), 16777619);
  return hash >>> 0;
}

export function getWhiteboardLinearRoughness(stroke: WhiteboardStroke): number {
  return getWhiteboardLinearRoughnessFromPoints(stroke.points);
}

function getWhiteboardLinearRoughnessFromPoints(points: WhiteboardPoint[]): number {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const width = Math.max(...xs) - Math.min(...xs);
  const height = Math.max(...ys) - Math.min(...ys);
  const maxSize = Math.max(width, height);
  const minSize = Math.min(width, height);
  if (minSize >= 15 || maxSize >= 50) return 1;
  return maxSize < 10 ? 1 / 3 : 1 / 2;
}
