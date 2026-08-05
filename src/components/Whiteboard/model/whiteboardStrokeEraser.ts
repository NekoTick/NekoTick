import { distanceToSegment } from './whiteboardSegmentGeometry';
import { getEraserStrokeSamples } from './whiteboardStrokeGeometry';
import {
  getStrokeEraserRadius,
  type WhiteboardStroke,
} from './whiteboardModel';
import { getStrokePointMaxWidth } from './whiteboardStrokeDynamics';
import type { WhiteboardEraserSample } from './whiteboardEraser';
import { getStrokeBounds } from './whiteboardSelectionTransform';
import {
  createWhiteboardStrokeFragment,
  createWhiteboardStrokeSegmentId,
  type WhiteboardMutableIdSet,
} from './whiteboardStrokeSegments';

interface StrokeEraserSweep {
  end: WhiteboardEraserSample;
  maxX: number;
  maxY: number;
  minX: number;
  minY: number;
  radius: number;
  start: WhiteboardEraserSample;
}

export interface WhiteboardStrokeEraserPreview {
  replacements: ReadonlyMap<string, WhiteboardStroke[]>;
}

interface WhiteboardStrokeEraserSegment {
  endIndex: number;
  id: string;
  startIndex: number;
  stroke: WhiteboardStroke;
}

export interface WhiteboardStrokeEraserState {
  erasedPoints: Uint8Array;
  fragments: WhiteboardStroke[];
  halfWidths: Float32Array;
  pathOffsets: Float64Array;
  sampledPoints: WhiteboardStroke['points'];
  segments: WhiteboardStrokeEraserSegment[];
  sourcePositions: Float64Array;
}

export function eraseWhiteboardStrokes(
  strokes: WhiteboardStroke[],
  samples: WhiteboardEraserSample[],
  candidateIds?: ReadonlySet<string>,
  candidateStrokes?: WhiteboardStroke[],
  existingIds?: WhiteboardMutableIdSet,
): WhiteboardStroke[] {
  if (samples.length === 0) return strokes;
  const usedIds = existingIds ?? new Set(strokes.map((stroke) => stroke.id));
  const changedStrokes = new Map<string, WhiteboardStroke[]>();
  for (const stroke of candidateStrokes ?? strokes) {
    if (candidateIds && !candidateIds.has(stroke.id)) continue;
    const erased = eraseWhiteboardStroke(stroke, null, samples, usedIds);
    if (!erased) continue;
    changedStrokes.set(stroke.id, erased.fragments);
  }
  if (changedStrokes.size === 0) return strokes;
  const next = strokes.flatMap((stroke) => {
    const erased = changedStrokes.get(stroke.id);
    if (!erased) return [stroke];
    return erased;
  });
  return next;
}

export function eraseWhiteboardStroke(
  stroke: WhiteboardStroke,
  current: WhiteboardStrokeEraserState | null,
  samples: WhiteboardEraserSample[],
  existingIds: WhiteboardMutableIdSet,
): WhiteboardStrokeEraserState | null {
  const sweeps = getSweeps(samples);
  if (sweeps.length === 0) return current;
  if (current && current.fragments.length === 0) return current;
  if (!strokeMayIntersectSweep(stroke, sweeps)) return current;
  const sampleData = current ? null : getEraserStrokeSamples(stroke);
  const sampledPoints = current?.sampledPoints ?? sampleData!.points;
  const halfWidths = current?.halfWidths ?? Float32Array.from(
    sampledPoints,
    (point) => getStrokePointMaxWidth(stroke.tool, point, stroke.size) / 2,
  );
  const pathOffsets = current?.pathOffsets ?? sampleData!.pathOffsets;
  const sourcePositions = current?.sourcePositions ?? sampleData!.sourcePositions;
  const erasedPoints = current?.erasedPoints ?? new Uint8Array(sampledPoints.length);
  let changed = false;

  const survivingRanges = current?.segments ?? (
    sampledPoints.length > 0 ? [{ startIndex: 0, endIndex: sampledPoints.length - 1 }] : []
  );
  for (const range of survivingRanges) {
    for (let index = range.startIndex; index <= range.endIndex; index += 1) {
      const point = sampledPoints[index];
      const halfWidth = halfWidths[index];
      if (!sweeps.some((sweep) => sweepTouchesPoint(sweep, point, halfWidth))) continue;
      erasedPoints[index] = 1;
      changed = true;
    }
  }

  if (!changed) return current;
  const segments = createSurvivingSegments(
    stroke,
    sampledPoints,
    erasedPoints,
    pathOffsets,
    sourcePositions,
    current?.segments ?? [],
    existingIds,
  );
  return {
    erasedPoints,
    fragments: segments.map((segment) => segment.stroke),
    halfWidths,
    pathOffsets,
    sampledPoints,
    segments,
    sourcePositions,
  };
}

function strokeMayIntersectSweep(stroke: WhiteboardStroke, sweeps: StrokeEraserSweep[]): boolean {
  const bounds = getStrokeBounds(stroke);
  if (!bounds) return false;
  return sweeps.some((sweep) => (
    bounds.x <= sweep.maxX && bounds.x + bounds.width >= sweep.minX &&
    bounds.y <= sweep.maxY && bounds.y + bounds.height >= sweep.minY
  ));
}

function sweepTouchesPoint(
  sweep: StrokeEraserSweep,
  point: WhiteboardStroke['points'][number],
  halfWidth: number,
): boolean {
  if (point.x < sweep.minX - halfWidth || point.x > sweep.maxX + halfWidth ||
    point.y < sweep.minY - halfWidth || point.y > sweep.maxY + halfWidth) {
    return false;
  }
  return distanceToSegment(point, sweep.start.point, sweep.end.point) <= sweep.radius + halfWidth;
}

function createSurvivingSegments(
  source: WhiteboardStroke,
  sampledPoints: WhiteboardStroke['points'],
  erasedPoints: Uint8Array,
  pathOffsets: Float64Array,
  sourcePositions: Float64Array,
  previous: WhiteboardStrokeEraserSegment[],
  existingIds: WhiteboardMutableIdSet,
): WhiteboardStrokeEraserSegment[] {
  const ranges = getSurvivingRanges(sampledPoints, erasedPoints);
  const preservedSegments = matchPreservedSegments(ranges, previous);
  return ranges.map((range, index) => {
    const preserved = preservedSegments.get(index);
    const id = preserved?.id ?? (
      previous.length === 0 && index === 0
        ? source.id
        : createWhiteboardStrokeSegmentId(source.renderSeed ?? source.id, existingIds)
    );
    if (preserved && preserved.startIndex === range.startIndex && preserved.endIndex === range.endIndex) {
      return preserved;
    }
    return {
      ...range,
      id,
      stroke: createWhiteboardStrokeFragment(
        source,
        id,
        getFragmentPoints(source, sampledPoints, sourcePositions, range.startIndex, range.endIndex),
        {
          pathOffset: pathOffsets[range.startIndex],
          pointOffset: Math.floor(sourcePositions[range.startIndex]),
          taperEnd: sourcePositions[range.endIndex] === source.points.length - 1 && source.renderTaperEnd !== false,
          taperStart: sourcePositions[range.startIndex] === 0 && source.renderTaperStart !== false,
        },
      ),
    };
  });
}

function getSurvivingRanges(
  points: WhiteboardStroke['points'],
  erasedPoints: Uint8Array,
): Array<Pick<WhiteboardStrokeEraserSegment, 'endIndex' | 'startIndex'>> {
  const ranges: Array<Pick<WhiteboardStrokeEraserSegment, 'endIndex' | 'startIndex'>> = [];
  let startIndex: number | null = null;
  for (let index = 0; index < points.length; index += 1) {
    const startsNewSourceSegment = Boolean(points[index].breakBefore && startIndex !== null);
    if ((erasedPoints[index] || startsNewSourceSegment) && startIndex !== null) {
      ranges.push({ endIndex: index - 1, startIndex });
      startIndex = null;
    }
    if (!erasedPoints[index] && startIndex === null) startIndex = index;
  }
  if (startIndex !== null) ranges.push({ endIndex: points.length - 1, startIndex });
  return ranges;
}

function matchPreservedSegments(
  ranges: Array<Pick<WhiteboardStrokeEraserSegment, 'endIndex' | 'startIndex'>>,
  previous: WhiteboardStrokeEraserSegment[],
): Map<number, WhiteboardStrokeEraserSegment> {
  const matches = new Map<number, WhiteboardStrokeEraserSegment>();
  for (const segment of previous) {
    let bestRangeIndex = -1;
    let bestOverlap = 0;
    for (let index = 0; index < ranges.length; index += 1) {
      if (matches.has(index)) continue;
      const range = ranges[index];
      const overlap = Math.min(segment.endIndex, range.endIndex) -
        Math.max(segment.startIndex, range.startIndex) + 1;
      if (overlap > bestOverlap) {
        bestOverlap = overlap;
        bestRangeIndex = index;
      }
    }
    if (bestRangeIndex >= 0) matches.set(bestRangeIndex, segment);
  }
  return matches;
}

function getFragmentPoints(
  source: WhiteboardStroke,
  sampledPoints: WhiteboardStroke['points'],
  sourcePositions: Float64Array,
  startIndex: number,
  endIndex: number,
): WhiteboardStroke['points'] {
  const startPosition = sourcePositions[startIndex];
  const endPosition = sourcePositions[endIndex];
  const points = [removeBreakMarker(sampledPoints[startIndex])];
  for (let index = Math.floor(startPosition) + 1; index <= Math.floor(endPosition); index += 1) {
    points.push(removeBreakMarker(source.points[index]));
  }
  if (!Number.isInteger(endPosition) && endIndex !== startIndex) {
    points.push(removeBreakMarker(sampledPoints[endIndex]));
  }
  return points;
}

function removeBreakMarker(point: WhiteboardStroke['points'][number]): WhiteboardStroke['points'][number] {
  if (!point.breakBefore) return point;
  const { breakBefore: _breakBefore, ...cleanPoint } = point;
  return cleanPoint;
}

function getSweeps(samples: WhiteboardEraserSample[]): StrokeEraserSweep[] {
  if (samples.length === 0) return [];
  if (samples.length === 1) {
    const sample = samples[0];
    return [createSweep(sample, sample)];
  }
  return samples.slice(1).map((end, index) => createSweep(samples[index], end));
}

function createSweep(start: WhiteboardEraserSample, end: WhiteboardEraserSample): StrokeEraserSweep {
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
