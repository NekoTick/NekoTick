import type { WhiteboardPoint } from './whiteboardModel';

export interface WhiteboardPrincipalAxes {
  centroid: WhiteboardPoint;
  major: WhiteboardPoint;
  majorVariance: number;
  minorVariance: number;
}

export function getWhiteboardPrincipalAxes(points: readonly WhiteboardPoint[]): WhiteboardPrincipalAxes {
  const centroid = points.reduce((sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y }), { x: 0, y: 0 });
  centroid.x /= points.length;
  centroid.y /= points.length;
  let xx = 0;
  let yy = 0;
  let xy = 0;
  for (const point of points) {
    const dx = point.x - centroid.x;
    const dy = point.y - centroid.y;
    xx += dx * dx;
    yy += dy * dy;
    xy += dx * dy;
  }
  xx /= points.length;
  yy /= points.length;
  xy /= points.length;
  const spread = Math.hypot(xx - yy, 2 * xy);
  const majorVariance = (xx + yy + spread) / 2;
  const minorVariance = (xx + yy - spread) / 2;
  let major = Math.abs(xy) > Number.EPSILON
    ? { x: majorVariance - yy, y: xy }
    : xx >= yy ? { x: 1, y: 0 } : { x: 0, y: 1 };
  const length = Math.hypot(major.x, major.y) || 1;
  major = { x: major.x / length, y: major.y / length };
  const projected = points.map((point) => (point.x - centroid.x) * major.x + (point.y - centroid.y) * major.y);
  if (getWhiteboardStandardizedMoment(projected, 3) > 0) major = { x: -major.x, y: -major.y };
  return { centroid, major, majorVariance, minorVariance };
}

export function getWhiteboardConvexHull(points: readonly WhiteboardPoint[]): WhiteboardPoint[] {
  if (points.length < 3) return [...points];
  const sorted = [...points].sort((a, b) => a.x === b.x ? a.y - b.y : a.x - b.x);
  const cross = (origin: WhiteboardPoint, a: WhiteboardPoint, b: WhiteboardPoint) => (
    (a.x - origin.x) * (b.y - origin.y) - (a.y - origin.y) * (b.x - origin.x)
  );
  const half = (source: WhiteboardPoint[]) => {
    const result: WhiteboardPoint[] = [];
    for (const point of source) {
      while (result.length >= 2 && cross(result[result.length - 2], result[result.length - 1], point) <= 0) result.pop();
      result.push(point);
    }
    result.pop();
    return result;
  };
  const hull = [...half(sorted), ...half([...sorted].reverse())];
  return hull.length >= 3 ? hull : [...points];
}

export function getWhiteboardPolygonArea(points: readonly WhiteboardPoint[]): number {
  let sum = 0;
  for (let index = 0, previous = points.length - 1; index < points.length; previous = index, index += 1) {
    sum += points[previous].x * points[index].y - points[index].x * points[previous].y;
  }
  return Math.abs(sum / 2);
}

export function getWhiteboardStandardizedMoment(values: readonly number[], order: number): number {
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  const moment = values.reduce((sum, value) => sum + (value - mean) ** order, 0) / values.length;
  const deviation = Math.sqrt(variance);
  return deviation > Number.EPSILON ? moment / deviation ** order : 0;
}

export function getWhiteboardDistanceToSegment(point: WhiteboardPoint, start: WhiteboardPoint, end: WhiteboardPoint): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  const progress = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
  return Math.hypot(point.x - (start.x + dx * progress), point.y - (start.y + dy * progress));
}
