import { distanceToSegment } from './whiteboardSegmentGeometry';
import { getEraserSampledStrokePoints } from './whiteboardStrokeGeometry';
import {
  getStrokeEraserRadius,
  getStrokeWidth,
  type WhiteboardStroke,
} from './whiteboardModel';
import type { WhiteboardEraserSample } from './whiteboardEraser';
import { getStrokeBounds } from './whiteboardSelectionTransform';
import { splitWhiteboardStrokeSegments } from './whiteboardStrokeSegments';

interface StrokeEraserSweep {
  end: WhiteboardEraserSample;
  radius: number;
  start: WhiteboardEraserSample;
}

export function eraseWhiteboardStrokes(
  strokes: WhiteboardStroke[],
  samples: WhiteboardEraserSample[],
  candidateIds?: ReadonlySet<string>,
  candidateStrokes?: WhiteboardStroke[],
): WhiteboardStroke[] {
  const sweeps = getSweeps(samples);
  if (sweeps.length === 0) return strokes;
  const changedStrokeIds = new Set<string>();
  const changedStrokes = new Map<string, WhiteboardStroke>();
  for (const stroke of candidateStrokes ?? strokes) {
    if (candidateIds && !candidateIds.has(stroke.id)) continue;
    if (!strokeMayIntersectSweep(stroke, sweeps)) continue;
    const erased = eraseStroke(stroke, sweeps);
    if (erased === stroke) continue;
    changedStrokeIds.add(stroke.id);
    changedStrokes.set(stroke.id, erased);
  }
  if (changedStrokes.size === 0) return strokes;
  const next = strokes.flatMap((stroke) => {
    const erased = changedStrokes.get(stroke.id);
    if (!erased) return [stroke];
    return erased.points.length > 0 ? [erased] : [];
  });
  return splitWhiteboardStrokeSegments(next, changedStrokeIds);
}

function strokeMayIntersectSweep(stroke: WhiteboardStroke, sweeps: StrokeEraserSweep[]): boolean {
  const bounds = getStrokeBounds(stroke);
  if (!bounds) return false;
  return sweeps.some((sweep) => {
    const radius = sweep.radius;
    const minX = Math.min(sweep.start.point.x, sweep.end.point.x) - radius;
    const maxX = Math.max(sweep.start.point.x, sweep.end.point.x) + radius;
    const minY = Math.min(sweep.start.point.y, sweep.end.point.y) - radius;
    const maxY = Math.max(sweep.start.point.y, sweep.end.point.y) + radius;
    return bounds.x <= maxX && bounds.x + bounds.width >= minX &&
      bounds.y <= maxY && bounds.y + bounds.height >= minY;
  });
}

function eraseStroke(stroke: WhiteboardStroke, sweeps: StrokeEraserSweep[]): WhiteboardStroke {
  const sampled = getEraserSampledStrokePoints(stroke);
  const points: WhiteboardStroke['points'] = [];
  let changed = false;
  let breakBefore = false;

  for (const point of sampled) {
    if (point.breakBefore) breakBefore = true;
    const width = getStrokeWidth(stroke.tool, point.pressure, stroke.size);
    const erased = sweeps.some((sweep) => (
      distanceToSegment(point, sweep.start.point, sweep.end.point) <= sweep.radius + width / 2
    ));
    if (erased) {
      changed = true;
      breakBefore = true;
      continue;
    }
    points.push({
      ...point,
      ...(breakBefore && points.length > 0 ? { breakBefore: true } : { breakBefore: undefined }),
    });
    breakBefore = false;
  }
  return changed ? { ...stroke, points } : stroke;
}

function getSweeps(samples: WhiteboardEraserSample[]): StrokeEraserSweep[] {
  if (samples.length === 0) return [];
  if (samples.length === 1) {
    const sample = samples[0];
    return [{ end: sample, radius: getStrokeEraserRadius(sample.size), start: sample }];
  }
  return samples.slice(1).map((end, index) => {
    const start = samples[index];
    return { end, radius: getStrokeEraserRadius(Math.max(start.size, end.size)), start };
  });
}
