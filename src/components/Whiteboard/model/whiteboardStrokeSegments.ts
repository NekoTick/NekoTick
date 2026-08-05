import type { WhiteboardStroke, WhiteboardStrokePoint } from './whiteboardModel';

export interface WhiteboardMutableIdSet {
  add: (id: string) => void;
  has: (id: string) => boolean;
}

interface WhiteboardStrokeFragmentOptions {
  pathOffset?: number;
  pointOffset: number;
  taperEnd?: boolean;
  taperStart?: boolean;
}

export function splitWhiteboardStrokeSegments(
  strokes: WhiteboardStroke[],
  candidateIds?: ReadonlySet<string>,
  existingIds?: WhiteboardMutableIdSet,
): WhiteboardStroke[] {
  const usedIds = existingIds ?? new Set(strokes.map((stroke) => stroke.id));
  let changed = false;
  const result = strokes.flatMap((stroke) => {
    if (candidateIds && !candidateIds.has(stroke.id)) return [stroke];
    if (!stroke.points.some((point) => point.breakBefore)) return [stroke];
    const segments = splitStrokePoints(stroke.points);
    changed = true;
    return segments.map(({ pointOffset, points }, index) => createWhiteboardStrokeFragment(
      stroke,
      index === 0 ? stroke.id : createWhiteboardStrokeSegmentId(stroke.renderSeed ?? stroke.id, usedIds),
      points,
      {
        pointOffset,
        taperEnd: index === segments.length - 1 && stroke.renderTaperEnd !== false,
        taperStart: index === 0 && stroke.renderTaperStart !== false,
      },
    ));
  });
  return changed ? result : strokes;
}

function splitStrokePoints(points: WhiteboardStrokePoint[]): Array<{ pointOffset: number; points: WhiteboardStrokePoint[] }> {
  const segments: Array<{ pointOffset: number; points: WhiteboardStrokePoint[] }> = [];
  let current: WhiteboardStrokePoint[] = [];
  let pointOffset = 0;
  points.forEach((point, index) => {
    if (point.breakBefore && current.length > 0) {
      segments.push({ pointOffset, points: current });
      current = [];
      pointOffset = index;
    }
    current.push(removeBreakMarker(point));
  });
  if (current.length > 0) segments.push({ pointOffset, points: current });
  return segments;
}

function removeBreakMarker(point: WhiteboardStrokePoint): WhiteboardStrokePoint {
  if (!point.breakBefore) return point;
  const { breakBefore: _breakBefore, ...cleanPoint } = point;
  return cleanPoint;
}

export function createWhiteboardStrokeSegmentId(baseId: string, usedIds: WhiteboardMutableIdSet): string {
  let index = 2;
  let id = `${baseId}-part-${index}`;
  while (usedIds.has(id)) {
    index += 1;
    id = `${baseId}-part-${index}`;
  }
  usedIds.add(id);
  return id;
}

export function createWhiteboardStrokeFragment(
  source: WhiteboardStroke,
  id: string,
  points: WhiteboardStrokePoint[],
  options: WhiteboardStrokeFragmentOptions,
): WhiteboardStroke {
  const fragment: WhiteboardStroke = {
    ...source,
    id,
    points,
    renderPathOffset: (source.renderPathOffset ?? 0) + (options.pathOffset ?? 0),
    renderPointOffset: (source.renderPointOffset ?? 0) + options.pointOffset,
    renderSeed: source.renderSeed ?? source.id,
    renderTaperEnd: options.taperEnd ?? source.renderTaperEnd,
    renderTaperStart: options.taperStart ?? source.renderTaperStart,
  };
  if (fragment.renderPathOffset === 0) delete fragment.renderPathOffset;
  if (fragment.renderPointOffset === 0) delete fragment.renderPointOffset;
  if (fragment.renderSeed === fragment.id) delete fragment.renderSeed;
  if (fragment.renderTaperEnd !== false) delete fragment.renderTaperEnd;
  if (fragment.renderTaperStart !== false) delete fragment.renderTaperStart;
  return fragment;
}
