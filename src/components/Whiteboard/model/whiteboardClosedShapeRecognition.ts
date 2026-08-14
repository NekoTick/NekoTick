import { getWhiteboardAutoShapePoints } from './whiteboardAutoShapeGeometry';
import type { WhiteboardAutoShape, WhiteboardPoint } from './whiteboardModel';

interface ClosedShapeMatch {
  points: WhiteboardPoint[];
  type: WhiteboardAutoShape;
}

interface ShapeTemplate extends ClosedShapeMatch {
  samples: WhiteboardPoint[];
}

const SAMPLE_COUNT = 64;
const MAX_MATCH_DISTANCE = 0.13;
const MAX_CONFIDENT_MATCH_DISTANCE = 0.015;
const MAX_SMOOTH_ELLIPSE_DISTANCE = 0.04;
const MIN_MATCH_MARGIN = 0.012;
const TURN_WINDOW = 3;
const MIN_SMOOTH_ELLIPSE_TURN_QUARTILE = 0.13;
const BOUNDS: readonly [number, number, number, number] = [0, 0, 1, 1];
const ASPECT_RATIOS = [0.5, 0.7, 1, 1.4, 2];
const SHAPES: WhiteboardAutoShape[] = [
  'triangle', 'rectangle', 'diamond', 'parallelogram', 'trapezoid',
  'pentagon', 'hexagon', 'octagon', 'ellipse', 'star', 'cross',
];

const TEMPLATES = SHAPES.flatMap((type) => getShapeVariants(type).map((points) => ({
  points,
  samples: resampleClosed(points, SAMPLE_COUNT),
  type,
})));

export function recognizeWhiteboardClosedShape(
  points: readonly WhiteboardPoint[],
  bounds: readonly [number, number, number, number],
): ClosedShapeMatch | null {
  const normalized = normalizePoints(points);
  const samples = resampleClosed(normalized, SAMPLE_COUNT);
  const bestByType = new Map<WhiteboardAutoShape, { distance: number; template: ShapeTemplate }>();
  for (const template of TEMPLATES) {
    const distance = getClosedPathDistance(samples, template.samples);
    const current = bestByType.get(template.type);
    if (!current || distance < current.distance) bestByType.set(template.type, { distance, template });
  }
  const matches = [...bestByType.values()].sort((a, b) => a.distance - b.distance);
  const best = matches[0];
  if (!best || best.distance > MAX_MATCH_DISTANCE) return null;
  const confidentMatch = best.distance <= MAX_CONFIDENT_MATCH_DISTANCE;
  const smoothEllipseMatch = best.template.type === 'ellipse'
    && best.distance <= MAX_SMOOTH_ELLIPSE_DISTANCE
    && getLowerTurnQuartile(samples) >= MIN_SMOOTH_ELLIPSE_TURN_QUARTILE;
  if (!confidentMatch && !smoothEllipseMatch && matches[1].distance - best.distance < MIN_MATCH_MARGIN) return null;
  return {
    type: best.template.type,
    points: scalePoints(best.template.points, bounds),
  };
}

function getLowerTurnQuartile(points: readonly WhiteboardPoint[]): number {
  const turns = points.slice(TURN_WINDOW, -TURN_WINDOW).map((point, localIndex) => {
    const index = localIndex + TURN_WINDOW;
    const previous = points[index - TURN_WINDOW];
    const next = points[index + TURN_WINDOW];
    const incoming = { x: point.x - previous.x, y: point.y - previous.y };
    const outgoing = { x: next.x - point.x, y: next.y - point.y };
    return Math.abs(Math.atan2(
      incoming.x * outgoing.y - incoming.y * outgoing.x,
      incoming.x * outgoing.x + incoming.y * outgoing.y,
    ));
  });
  turns.sort((a, b) => a - b);
  return turns[Math.floor(turns.length / 4)] ?? 0;
}

function getShapeVariants(type: WhiteboardAutoShape): WhiteboardPoint[][] {
  const base = normalizePoints(getWhiteboardAutoShapePoints(type, BOUNDS));
  if (type === 'rectangle' || type === 'diamond') return [base];
  const rotations = ASPECT_RATIOS.flatMap((aspectRatio) => {
    const points = getWhiteboardAutoShapePoints(type, [0, 0, aspectRatio, 1]);
    return Array.from({ length: 12 }, (_, index) => rotateAndNormalizePoints(points, Math.PI * index / 12));
  });
  if (type !== 'parallelogram') return rotations;
  return [...rotations, ...rotations.map((points) => points.map(({ x, y }) => ({ x: 1 - x, y })))];
}

function rotateAndNormalizePoints(points: readonly WhiteboardPoint[], angle: number): WhiteboardPoint[] {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const minX = Math.min(...points.map(({ x }) => x));
  const minY = Math.min(...points.map(({ y }) => y));
  const centerX = (minX + Math.max(...points.map(({ x }) => x))) / 2;
  const centerY = (minY + Math.max(...points.map(({ y }) => y))) / 2;
  return normalizePoints(points.map(({ x, y }) => ({
    x: centerX + (x - centerX) * cosine - (y - centerY) * sine,
    y: centerY + (x - centerX) * sine + (y - centerY) * cosine,
  })));
}

function normalizePoints(points: readonly WhiteboardPoint[]): WhiteboardPoint[] {
  const minX = Math.min(...points.map(({ x }) => x));
  const minY = Math.min(...points.map(({ y }) => y));
  const width = Math.max(Number.EPSILON, Math.max(...points.map(({ x }) => x)) - minX);
  const height = Math.max(Number.EPSILON, Math.max(...points.map(({ y }) => y)) - minY);
  return points.map(({ x, y }) => ({ x: (x - minX) / width, y: (y - minY) / height }));
}

function scalePoints(
  points: readonly WhiteboardPoint[],
  bounds: readonly [number, number, number, number],
): WhiteboardPoint[] {
  const [minX, minY, maxX, maxY] = bounds;
  return points.map(({ x, y }) => ({ x: minX + x * (maxX - minX), y: minY + y * (maxY - minY) }));
}

function resampleClosed(points: readonly WhiteboardPoint[], count: number): WhiteboardPoint[] {
  const closed = [...points];
  if (distance(closed[0], closed.at(-1)!) > Number.EPSILON) closed.push(closed[0]);
  else closed[closed.length - 1] = closed[0];
  const segmentLengths = closed.slice(1).map((point, index) => distance(closed[index], point));
  const totalLength = segmentLengths.reduce((sum, length) => sum + length, 0);
  if (totalLength <= Number.EPSILON) return Array.from({ length: count }, () => closed[0]);
  const samples: WhiteboardPoint[] = [];
  let segment = 0;
  let segmentStartLength = 0;
  for (let index = 0; index < count; index += 1) {
    const target = totalLength * index / count;
    while (segment < segmentLengths.length - 1 && segmentStartLength + segmentLengths[segment] < target) {
      segmentStartLength += segmentLengths[segment];
      segment += 1;
    }
    const length = segmentLengths[segment];
    const progress = length > 0 ? (target - segmentStartLength) / length : 0;
    samples.push({
      x: closed[segment].x + (closed[segment + 1].x - closed[segment].x) * progress,
      y: closed[segment].y + (closed[segment + 1].y - closed[segment].y) * progress,
    });
  }
  return samples;
}

function getClosedPathDistance(points: readonly WhiteboardPoint[], template: readonly WhiteboardPoint[]): number {
  let best = Number.POSITIVE_INFINITY;
  let closestOffset = 0;
  for (let offset = 1; offset < template.length; offset += 1) {
    if (distanceSquared(points[0], template[offset]) < distanceSquared(points[0], template[closestOffset])) {
      closestOffset = offset;
    }
  }
  for (let delta = -2; delta <= 2; delta += 1) {
    const offset = (closestOffset + delta + template.length) % template.length;
    let forward = 0;
    let reverse = 0;
    for (let index = 0; index < points.length; index += 1) {
      forward += distanceSquared(points[index], template[(index + offset) % template.length]);
      reverse += distanceSquared(points[index], template[(offset - index + template.length) % template.length]);
    }
    best = Math.min(best, forward, reverse);
  }
  return Math.sqrt(best / points.length);
}

function distance(a: WhiteboardPoint, b: WhiteboardPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function distanceSquared(a: WhiteboardPoint, b: WhiteboardPoint): number {
  return (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
}
