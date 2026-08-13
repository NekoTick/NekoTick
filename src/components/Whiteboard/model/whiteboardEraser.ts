import { doesEraserSweepTouchStroke } from './whiteboardStrokeGeometry';
import { distanceBetweenSegments } from './whiteboardSegmentGeometry';
import {
  getEraserRadius,
  type WhiteboardElement,
  type WhiteboardStroke,
} from './whiteboardModel';
import type { WhiteboardEraserSample } from './whiteboardSpatialIndex';

export {
  createWhiteboardEraserSpatialIndex,
  createWhiteboardEraserSpatialIndexAsync,
  getWhiteboardBoundsCandidates,
  getWhiteboardEraserCandidates,
  getWhiteboardIndexedItems,
  updateWhiteboardEraserSpatialIndex,
  tryUpdateWhiteboardEraserSpatialIndex,
} from './whiteboardSpatialIndex';
export type {
  WhiteboardEraserSample,
  WhiteboardEraserSpatialIndex,
  WhiteboardItemOrder,
} from './whiteboardSpatialIndex';

export interface WhiteboardEraserTargets {
  elementIds: string[];
  strokeIds: string[];
}

export interface WhiteboardEraserPreview extends WhiteboardEraserTargets {
  trail: WhiteboardEraserSample[];
}

export interface WhiteboardEraserTrailUpdate {
  backtracked: boolean;
  samples: WhiteboardEraserSample[];
}

interface WhiteboardEraserSweep {
  end: WhiteboardEraserSample;
  radius: number;
  start: WhiteboardEraserSample;
}

export const EMPTY_WHITEBOARD_ERASER_PREVIEW: WhiteboardEraserPreview = {
  elementIds: [],
  strokeIds: [],
  trail: [],
};

export function getWhiteboardEraserTargets(
  elements: WhiteboardElement[],
  strokes: WhiteboardStroke[],
  samples: WhiteboardEraserSample[],
): WhiteboardEraserTargets {
  const sweeps = getEraserSweeps(samples);
  if (sweeps.length === 0) return { elementIds: [], strokeIds: [] };
  return {
    elementIds: elements.filter((element) => sweeps.some((sweep) => eraserSweepTouchesElement(element, sweep))).map((element) => element.id),
    strokeIds: strokes.filter((stroke) => sweeps.some((sweep) => (
      doesEraserSweepTouchStroke(stroke, sweep.start.point, sweep.end.point, Math.max(sweep.start.size, sweep.end.size))
    ))).map((stroke) => stroke.id),
  };
}

export function updateWhiteboardEraserTrail(
  current: WhiteboardEraserSample[],
  pending: WhiteboardEraserSample[],
): WhiteboardEraserTrailUpdate {
  let samples = current;
  let backtracked = false;
  for (const sample of pending) {
    const projection = getBacktrackProjection(samples, sample);
    if (!projection) {
      samples = [...samples, sample];
      continue;
    }
    const prefix = samples.slice(0, projection.segmentIndex + 1);
    const segmentStart = samples[projection.segmentIndex];
    samples = projection.progress === 0
      ? prefix
      : [...prefix, { ...sample, point: projection.point }];
    if (segmentStart.point.x === sample.point.x && segmentStart.point.y === sample.point.y) {
      samples[samples.length - 1] = sample;
    }
    backtracked = true;
  }
  return { backtracked, samples };
}

function getEraserSweeps(samples: WhiteboardEraserSample[]): WhiteboardEraserSweep[] {
  if (samples.length === 0) return [];
  if (samples.length === 1) {
    const sample = samples[0];
    return [{ end: sample, radius: getEraserRadius(sample.size), start: sample }];
  }
  return samples.slice(1).map((end, index) => {
    const start = samples[index];
    return { end, radius: getEraserRadius(Math.max(start.size, end.size)), start };
  });
}

function getBacktrackProjection(
  samples: WhiteboardEraserSample[],
  sample: WhiteboardEraserSample,
): { point: { x: number; y: number }; progress: number; segmentIndex: number } | null {
  if (samples.length < 2) return null;
  const end = samples[samples.length - 1].point;
  const start = samples[samples.length - 2].point;
  const previousX = end.x - start.x;
  const previousY = end.y - start.y;
  const movementX = sample.point.x - end.x;
  const movementY = sample.point.y - end.y;
  if (previousX * movementX + previousY * movementY >= 0) return null;

  let closest: { distance: number; point: { x: number; y: number }; progress: number; segmentIndex: number } | null = null;
  for (let segmentIndex = 0; segmentIndex < samples.length - 1; segmentIndex += 1) {
    const segmentStart = samples[segmentIndex].point;
    const segmentEnd = samples[segmentIndex + 1].point;
    const segmentX = segmentEnd.x - segmentStart.x;
    const segmentY = segmentEnd.y - segmentStart.y;
    const lengthSquared = segmentX * segmentX + segmentY * segmentY;
    const progress = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, (
      (sample.point.x - segmentStart.x) * segmentX + (sample.point.y - segmentStart.y) * segmentY
    ) / lengthSquared));
    const point = {
      x: segmentStart.x + segmentX * progress,
      y: segmentStart.y + segmentY * progress,
    };
    const distance = Math.hypot(sample.point.x - point.x, sample.point.y - point.y);
    if (!closest || distance < closest.distance) closest = { distance, point, progress, segmentIndex };
  }
  if (!closest || closest.distance > getEraserRadius(sample.size)) return null;
  const finalSegmentIndex = samples.length - 2;
  if (closest.segmentIndex === finalSegmentIndex && closest.progress >= 1) return null;
  return closest;
}

function eraserSweepTouchesElement(element: WhiteboardElement, sweep: WhiteboardEraserSweep): boolean {
  const topLeft = { x: element.x, y: element.y };
  const topRight = { x: element.x + element.width, y: element.y };
  const bottomRight = { x: element.x + element.width, y: element.y + element.height };
  const bottomLeft = { x: element.x, y: element.y + element.height };
  if (segmentIntersectsRect(sweep.start.point, sweep.end.point, {
    maxX: bottomRight.x,
    maxY: bottomRight.y,
    minX: topLeft.x,
    minY: topLeft.y,
  })) return true;
  return [[topLeft, topRight], [topRight, bottomRight], [bottomRight, bottomLeft], [bottomLeft, topLeft]]
    .some(([start, end]) => distanceBetweenSegments(sweep.start.point, sweep.end.point, start, end) <= sweep.radius);
}

function segmentIntersectsRect(
  start: { x: number; y: number },
  end: { x: number; y: number },
  rect: { maxX: number; maxY: number; minX: number; minY: number },
): boolean {
  let minProgress = 0;
  let maxProgress = 1;
  for (const [origin, delta, min, max] of [
    [start.x, end.x - start.x, rect.minX, rect.maxX],
    [start.y, end.y - start.y, rect.minY, rect.maxY],
  ] as const) {
    if (delta === 0) {
      if (origin < min || origin > max) return false;
      continue;
    }
    const first = (min - origin) / delta;
    const second = (max - origin) / delta;
    minProgress = Math.max(minProgress, Math.min(first, second));
    maxProgress = Math.min(maxProgress, Math.max(first, second));
    if (minProgress > maxProgress) return false;
  }
  return true;
}
