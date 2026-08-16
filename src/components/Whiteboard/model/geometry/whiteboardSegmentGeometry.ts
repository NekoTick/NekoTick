import type { WhiteboardPoint } from '@/components/Whiteboard/model/core/whiteboardModel';

const GEOMETRY_EPSILON = 1e-9;

export function distanceBetweenSegments(
  firstStart: WhiteboardPoint,
  firstEnd: WhiteboardPoint,
  secondStart: WhiteboardPoint,
  secondEnd: WhiteboardPoint,
): number {
  if (segmentsIntersect(firstStart, firstEnd, secondStart, secondEnd)) return 0;
  return Math.min(
    distanceToSegment(firstStart, secondStart, secondEnd),
    distanceToSegment(firstEnd, secondStart, secondEnd),
    distanceToSegment(secondStart, firstStart, firstEnd),
    distanceToSegment(secondEnd, firstStart, firstEnd),
  );
}

export function distanceToSegment(point: WhiteboardPoint, start: WhiteboardPoint, end: WhiteboardPoint): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(point.x - start.x, point.y - start.y);
  const progress = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
  return Math.hypot(point.x - start.x - dx * progress, point.y - start.y - dy * progress);
}

function segmentsIntersect(
  firstStart: WhiteboardPoint,
  firstEnd: WhiteboardPoint,
  secondStart: WhiteboardPoint,
  secondEnd: WhiteboardPoint,
): boolean {
  if (
    Math.max(firstStart.x, firstEnd.x) + GEOMETRY_EPSILON < Math.min(secondStart.x, secondEnd.x) ||
    Math.max(secondStart.x, secondEnd.x) + GEOMETRY_EPSILON < Math.min(firstStart.x, firstEnd.x) ||
    Math.max(firstStart.y, firstEnd.y) + GEOMETRY_EPSILON < Math.min(secondStart.y, secondEnd.y) ||
    Math.max(secondStart.y, secondEnd.y) + GEOMETRY_EPSILON < Math.min(firstStart.y, firstEnd.y)
  ) return false;
  return cross(firstStart, firstEnd, secondStart) * cross(firstStart, firstEnd, secondEnd) <= GEOMETRY_EPSILON &&
    cross(secondStart, secondEnd, firstStart) * cross(secondStart, secondEnd, firstEnd) <= GEOMETRY_EPSILON;
}

function cross(start: WhiteboardPoint, end: WhiteboardPoint, point: WhiteboardPoint): number {
  return (end.x - start.x) * (point.y - start.y) - (end.y - start.y) * (point.x - start.x);
}
