import { distanceToSegment } from './whiteboardSegmentGeometry';
import { getStrokeEraserRadius, type WhiteboardStroke, type WhiteboardStrokePoint } from './whiteboardModel';
import { getPointCellKey, getSweepCellKeys } from './whiteboardSpatialGrid';
import type { WhiteboardEraserSample } from './whiteboardEraser';
import { getStrokeBounds } from './whiteboardSelectionTransform';

export interface WhiteboardStrokeEraserSweep {
  end: WhiteboardEraserSample;
  maxX: number;
  maxY: number;
  minX: number;
  minY: number;
  radius: number;
  start: WhiteboardEraserSample;
}

export interface WhiteboardStrokePointIndex {
  cells: Map<string, number[]>;
}

interface WhiteboardStrokeEraserSweepCache {
  first: WhiteboardEraserSample | undefined;
  last: WhiteboardEraserSample | undefined;
  length: number;
  sweeps: WhiteboardStrokeEraserSweep[];
}

const sweepCache = new WeakMap<WhiteboardEraserSample[], WhiteboardStrokeEraserSweepCache>();

export function getWhiteboardStrokeEraserSweeps(
  samples: WhiteboardEraserSample[],
): WhiteboardStrokeEraserSweep[] {
  const cached = sweepCache.get(samples);
  if (cached && cached.length === samples.length && cached.first === samples[0] && cached.last === samples.at(-1)) {
    return cached.sweeps;
  }
  const sweeps = samples.length === 0
    ? []
    : samples.length === 1
      ? [createSweep(samples[0], samples[0])]
      : samples.slice(1).map((end, index) => createSweep(samples[index], end));
  sweepCache.set(samples, {
    first: samples[0],
    last: samples.at(-1),
    length: samples.length,
    sweeps,
  });
  return sweeps;
}

export function strokeMayIntersectEraserSweeps(
  stroke: WhiteboardStroke,
  sweeps: WhiteboardStrokeEraserSweep[],
): boolean {
  const bounds = getStrokeBounds(stroke);
  if (!bounds) return false;
  return sweeps.some((sweep) => (
    bounds.x <= sweep.maxX && bounds.x + bounds.width >= sweep.minX &&
    bounds.y <= sweep.maxY && bounds.y + bounds.height >= sweep.minY
  ));
}

export function createWhiteboardStrokePointIndex(
  points: WhiteboardStrokePoint[],
): WhiteboardStrokePointIndex {
  const cells = new Map<string, number[]>();
  for (let index = 0; index < points.length; index += 1) {
    const key = getPointCellKey(points[index]);
    const indexes = cells.get(key);
    if (indexes) indexes.push(index);
    else cells.set(key, [index]);
  }
  return { cells };
}

export function eraseWhiteboardStrokeSamplePoints(
  points: WhiteboardStrokePoint[],
  erasedPoints: Uint8Array,
  pointIndex: WhiteboardStrokePointIndex,
  sweeps: WhiteboardStrokeEraserSweep[],
): number[] {
  const changedIndexes: number[] = [];
  for (const sweep of sweeps) {
    const cellKeys = getSweepCellKeys([sweep]);
    if (cellKeys.size === 0) {
      for (let index = 0; index < points.length; index += 1) {
        eraseSamplePoint(index, points, erasedPoints, sweep, changedIndexes);
      }
      continue;
    }
    for (const key of cellKeys) {
      for (const index of pointIndex.cells.get(key) ?? []) {
        eraseSamplePoint(index, points, erasedPoints, sweep, changedIndexes);
      }
    }
  }
  return changedIndexes.sort((first, second) => first - second);
}

function eraseSamplePoint(
  index: number,
  points: WhiteboardStrokePoint[],
  erasedPoints: Uint8Array,
  sweep: WhiteboardStrokeEraserSweep,
  changedIndexes: number[],
): void {
  if (erasedPoints[index] || !sweepTouchesPoint(sweep, points[index])) return;
  erasedPoints[index] = 1;
  changedIndexes.push(index);
}

function sweepTouchesPoint(
  sweep: WhiteboardStrokeEraserSweep,
  point: WhiteboardStrokePoint,
): boolean {
  if (point.x < sweep.minX || point.x > sweep.maxX ||
    point.y < sweep.minY || point.y > sweep.maxY) {
    return false;
  }
  return distanceToSegment(point, sweep.start.point, sweep.end.point) <= sweep.radius;
}

function createSweep(
  start: WhiteboardEraserSample,
  end: WhiteboardEraserSample,
): WhiteboardStrokeEraserSweep {
  const radius = getStrokeEraserRadius(Math.max(start.size, end.size));
  return {
    end,
    maxX: Math.max(start.point.x, end.point.x) + radius,
    maxY: Math.max(start.point.y, end.point.y) + radius,
    minX: Math.min(start.point.x, end.point.x) - radius,
    minY: Math.min(start.point.y, end.point.y) - radius,
    radius,
    start,
  };
}
