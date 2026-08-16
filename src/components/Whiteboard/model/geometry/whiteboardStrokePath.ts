import type { WhiteboardPoint, WhiteboardStrokePoint } from '@/components/Whiteboard/model/core/whiteboardModel';
import { interpolateWhiteboardStrokePoint } from './whiteboardStrokeDynamics';

export interface WhiteboardStrokePathSample {
  point: WhiteboardStrokePoint;
  sourcePosition: number;
}

export function getOpenStrokePath(points: WhiteboardStrokePoint[]): string {
  if (points.length === 0) return '';
  const [first] = points;
  if (points.length === 1) return `M ${first.x} ${first.y}`;
  if (points.length === 2) return `M ${first.x} ${first.y} L ${points[1].x} ${points[1].y}`;
  const commands = [`M ${first.x} ${first.y}`];
  for (let index = 1; index < points.length - 1; index += 1) {
    const point = points[index];
    const nextPoint = points[index + 1];
    commands.push(`Q ${point.x} ${point.y} ${(point.x + nextPoint.x) / 2} ${(point.y + nextPoint.y) / 2}`);
  }
  const last = points[points.length - 1];
  commands.push(`L ${last.x} ${last.y}`);
  return commands.join(' ');
}

export function getOpenStrokePathSamples(
  points: WhiteboardStrokePoint[],
  maxStep: number,
): WhiteboardStrokePathSample[] {
  if (points.length === 0) return [];
  const samples: WhiteboardStrokePathSample[] = [{ point: points[0], sourcePosition: 0 }];
  if (points.length === 1) return samples;
  if (points.length === 2) {
    appendLineSamples(samples, points[0], points[1], 0, 1, maxStep);
    return samples;
  }

  let start = points[0];
  let startPosition = 0;
  for (let index = 1; index < points.length - 1; index += 1) {
    const control = points[index];
    const end = interpolateWhiteboardStrokePoint(control, points[index + 1], 0.5);
    const endPosition = index + 0.5;
    const estimatedLength = distance(start, control) + distance(control, end);
    const steps = Math.max(1, Math.ceil(estimatedLength / maxStep));
    for (let step = 1; step <= steps; step += 1) {
      const progress = step / steps;
      const first = interpolateWhiteboardStrokePoint(start, control, progress);
      const second = interpolateWhiteboardStrokePoint(control, end, progress);
      samples.push({
        point: interpolateWhiteboardStrokePoint(first, second, progress),
        sourcePosition: mix(startPosition, endPosition, progress),
      });
    }
    start = end;
    startPosition = endPosition;
  }
  appendLineSamples(samples, start, points.at(-1)!, startPosition, points.length - 1, maxStep);
  return samples;
}

export function getStrokeTangent(
  previous: WhiteboardPoint,
  point: WhiteboardPoint,
  next: WhiteboardPoint,
): WhiteboardPoint {
  const incoming = getUnitVector(point.x - previous.x, point.y - previous.y);
  const outgoing = getUnitVector(next.x - point.x, next.y - point.y);
  if (!incoming) return outgoing ?? { x: 1, y: 0 };
  if (!outgoing) return incoming;
  return getUnitVector(incoming.x + outgoing.x, incoming.y + outgoing.y) ?? outgoing;
}

export function getRoundStrokeCapPath(
  start: WhiteboardPoint,
  end: WhiteboardPoint,
  tangent: WhiteboardPoint,
  controlDistance: number,
  direction: 1 | -1,
): string {
  const offsetX = tangent.x * controlDistance * direction;
  const offsetY = tangent.y * controlDistance * direction;
  return `C ${start.x + offsetX} ${start.y + offsetY} ${end.x + offsetX} ${end.y + offsetY} ${end.x} ${end.y}`;
}

function getUnitVector(x: number, y: number): WhiteboardPoint | null {
  const length = Math.hypot(x, y);
  return length > 1e-6 ? { x: x / length, y: y / length } : null;
}

function appendLineSamples(
  samples: WhiteboardStrokePathSample[],
  start: WhiteboardStrokePoint,
  end: WhiteboardStrokePoint,
  startPosition: number,
  endPosition: number,
  maxStep: number,
): void {
  const steps = Math.max(1, Math.ceil(distance(start, end) / maxStep));
  for (let step = 1; step <= steps; step += 1) {
    const progress = step / steps;
    samples.push({
      point: step === steps ? end : interpolateWhiteboardStrokePoint(start, end, progress),
      sourcePosition: mix(startPosition, endPosition, progress),
    });
  }
}

function distance(start: WhiteboardPoint, end: WhiteboardPoint): number {
  return Math.hypot(end.x - start.x, end.y - start.y);
}

function mix(start: number, end: number, progress: number): number {
  return start + (end - start) * progress;
}
