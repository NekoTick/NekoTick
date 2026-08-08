import { getEraserStrokeSamples, type WhiteboardEraserStrokeRange } from './whiteboardStrokeGeometry';
import { type WhiteboardStroke } from './whiteboardModel';
import type { WhiteboardEraserSample } from './whiteboardEraser';
import {
  createWhiteboardStrokePointIndex,
  eraseWhiteboardStrokeSamplePoints,
  getWhiteboardStrokeEraserSweeps,
  strokeMayIntersectEraserSweeps,
  type WhiteboardStrokePointIndex,
} from './whiteboardStrokeEraserGeometry';
import {
  createWhiteboardStrokeFragment,
  createWhiteboardStrokeSegmentId,
  type WhiteboardMutableIdSet,
} from './whiteboardStrokeSegments';

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
  pathOffsets: Float64Array;
  pointIndex: WhiteboardStrokePointIndex;
  sampledPoints: WhiteboardStroke['points'];
  segments: WhiteboardStrokeEraserSegment[];
  sourcePoints: WhiteboardStroke['points'];
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
  const sweeps = getWhiteboardStrokeEraserSweeps(samples);
  if (sweeps.length === 0) return current;
  if (current && current.fragments.length === 0) return current;
  if (!strokeMayIntersectEraserSweeps(stroke, sweeps)) return current;
  const sampleData = current ? null : getEraserStrokeSamples(stroke);
  const sampledPoints = current?.sampledPoints ?? sampleData!.points;
  const sourcePoints = current?.sourcePoints ?? sampleData!.sourcePoints;
  const pathOffsets = current?.pathOffsets ?? sampleData!.pathOffsets;
  const sourcePositions = current?.sourcePositions ?? sampleData!.sourcePositions;
  const erasedPoints = current?.erasedPoints ?? new Uint8Array(sampledPoints.length);
  const pointIndex = current?.pointIndex ?? createWhiteboardStrokePointIndex(sampledPoints);
  const changedIndexes = eraseWhiteboardStrokeSamplePoints(
    sampledPoints,
    erasedPoints,
    pointIndex,
    sweeps,
  );
  if (changedIndexes.length === 0) return current;
  const ranges = splitSurvivingRanges(current?.segments ?? sampleData!.ranges, changedIndexes);
  const segments = createSurvivingSegments(
    stroke,
    erasedPoints,
    sourcePoints,
    pathOffsets,
    sourcePositions,
    ranges,
    current?.segments ?? [],
    existingIds,
  );
  return {
    erasedPoints,
    fragments: segments.map((segment) => segment.stroke),
    pathOffsets,
    pointIndex,
    sampledPoints,
    segments,
    sourcePoints,
    sourcePositions,
  };
}

function createSurvivingSegments(
  source: WhiteboardStroke,
  erasedPoints: Uint8Array,
  sourcePoints: WhiteboardStroke['points'],
  pathOffsets: Float64Array,
  sourcePositions: Float64Array,
  ranges: WhiteboardEraserStrokeRange[],
  previous: WhiteboardStrokeEraserSegment[],
  existingIds: WhiteboardMutableIdSet,
): WhiteboardStrokeEraserSegment[] {
  const preservedSegments = matchPreservedSegments(ranges, previous);
  return ranges.map((range, index) => {
    const preserved = preservedSegments.get(index);
    const renderStartIndex = range.startIndex > 0 && erasedPoints[range.startIndex - 1] && !sourcePoints[range.startIndex].breakBefore
      ? range.startIndex - 1
      : range.startIndex;
    const renderEndIndex = range.endIndex + 1 < erasedPoints.length &&
      erasedPoints[range.endIndex + 1] && !sourcePoints[range.endIndex + 1].breakBefore
      ? range.endIndex + 1
      : range.endIndex;
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
        getFragmentPoints(source, sourcePoints, sourcePositions, renderStartIndex, renderEndIndex),
        {
          pathOffset: pathOffsets[renderStartIndex],
          pointOffset: Math.floor(sourcePositions[renderStartIndex]),
          taperEnd: sourcePositions[renderEndIndex] === source.points.length - 1 && source.renderTaperEnd !== false,
          taperStart: sourcePositions[renderStartIndex] === 0 && source.renderTaperStart !== false,
        },
      ),
    };
  });
}

function splitSurvivingRanges(
  current: WhiteboardEraserStrokeRange[],
  erasedIndexes: number[],
): WhiteboardEraserStrokeRange[] {
  const ranges: WhiteboardEraserStrokeRange[] = [];
  let erasedIndex = 0;
  for (const range of current) {
    while (erasedIndexes[erasedIndex] < range.startIndex) erasedIndex += 1;
    let startIndex = range.startIndex;
    while (erasedIndexes[erasedIndex] <= range.endIndex) {
      const erased = erasedIndexes[erasedIndex];
      if (erased > startIndex) ranges.push({ endIndex: erased - 1, startIndex });
      startIndex = erased + 1;
      erasedIndex += 1;
    }
    if (startIndex <= range.endIndex) ranges.push({ endIndex: range.endIndex, startIndex });
  }
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
  const points = [removeBreakMarker(sampledPoints[startIndex]), ...source.points.slice(
    Math.floor(startPosition) + 1,
    Math.floor(endPosition) + 1,
  )];
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
