import { pointsOnPath, type Point } from 'points-on-path';
import { WHITEBOARD_AUTODRAW_CATALOG } from './whiteboardAutoDrawCatalog';
import { getWhiteboardAutoShapePoints } from '@/components/Whiteboard/model/geometry/whiteboardAutoShapeGeometry';
import type { WhiteboardAutoDrawIcon } from './whiteboardAutoDrawTypes';
import type { WhiteboardAutoShape, WhiteboardPoint, WhiteboardStroke } from '@/components/Whiteboard/model/core/whiteboardModel';

export type WhiteboardAutoDrawSuggestion =
  | { kind: 'icon'; icon: WhiteboardAutoDrawIcon; label: string; score: number }
  | { kind: 'shape'; label: string; score: number; shape: WhiteboardAutoShape };

interface RasterizedTemplate {
  aspectRatio: number;
  cells: WhiteboardPoint[];
  distances: number[];
}

const GRID_SIZE = 24;
const MIN_DRAWING_SIZE = 25;
const GRID_CELLS = Array.from({ length: GRID_SIZE * GRID_SIZE }, (_, index) => ({
  x: index % GRID_SIZE,
  y: Math.floor(index / GRID_SIZE),
}));
const SHAPES: Array<[WhiteboardAutoShape, string]> = [
  ['triangle', 'Triangle'],
  ['rectangle', 'Rectangle'],
  ['diamond', 'Diamond'],
  ['parallelogram', 'Parallelogram'],
  ['trapezoid', 'Trapezoid'],
  ['pentagon', 'Pentagon'],
  ['hexagon', 'Hexagon'],
  ['octagon', 'Octagon'],
  ['ellipse', 'Ellipse'],
  ['star', 'Star'],
  ['cross', 'Cross'],
];

const iconTemplates = WHITEBOARD_AUTODRAW_CATALOG.map((entry) => ({
  ...entry,
  template: rasterize(getIconSegments(entry.nodes)),
}));

const shapeTemplates = SHAPES.map(([shape, label]) => ({
  label,
  shape,
  template: rasterize([getWhiteboardAutoShapePoints(shape, [0, 0, 24, 24])]),
}));

export function getWhiteboardAutoDrawSuggestions(
  strokes: readonly WhiteboardStroke[],
  limit = 12,
): WhiteboardAutoDrawSuggestion[] {
  const segments = strokes.flatMap((stroke) => splitStrokeSegments(stroke.points));
  const bounds = getSegmentBounds(segments);
  if (!bounds || Math.max(bounds.width, bounds.height) < MIN_DRAWING_SIZE) return [];
  const sketch = rasterize(segments);
  const suggestions: WhiteboardAutoDrawSuggestion[] = [
    ...shapeTemplates.map(({ label, shape, template }) => ({
      kind: 'shape' as const,
      label,
      score: templateDistance(sketch, template),
      shape,
    })),
    ...iconTemplates.map(({ icon, label, template }) => ({
      icon,
      kind: 'icon' as const,
      label,
      score: templateDistance(sketch, template),
    })),
  ];
  return suggestions.sort((a, b) => a.score - b.score).slice(0, Math.max(1, limit));
}

function getIconSegments(nodes: ReadonlyArray<[string, Record<string, string>]>): WhiteboardPoint[][] {
  return nodes.flatMap(([element, attributes]) => {
    if (element === 'path' && attributes.d) {
      return pointsOnPath(attributes.d, 0.2, 0.35).map(toWhiteboardPoints);
    }
    if (element === 'circle') {
      return [ellipsePoints(number(attributes.cx), number(attributes.cy), number(attributes.r), number(attributes.r))];
    }
    if (element === 'ellipse') {
      return [ellipsePoints(number(attributes.cx), number(attributes.cy), number(attributes.rx), number(attributes.ry))];
    }
    if (element === 'line') {
      return [[
        { x: number(attributes.x1), y: number(attributes.y1) },
        { x: number(attributes.x2), y: number(attributes.y2) },
      ]];
    }
    if (element === 'polyline' || element === 'polygon') {
      const points = parsePoints(attributes.points);
      return points.length > 0 ? [element === 'polygon' ? [...points, points[0]] : points] : [];
    }
    if (element === 'rect') {
      const x = number(attributes.x);
      const y = number(attributes.y);
      const width = number(attributes.width);
      const height = number(attributes.height);
      return [[
        { x, y }, { x: x + width, y }, { x: x + width, y: y + height },
        { x, y: y + height }, { x, y },
      ]];
    }
    return [];
  });
}

function rasterize(segments: readonly WhiteboardPoint[][]): RasterizedTemplate {
  const bounds = getSegmentBounds(segments) ?? { height: 1, width: 1, x: 0, y: 0 };
  const maxDimension = Math.max(1, bounds.width, bounds.height);
  const offsetX = (1 - bounds.width / maxDimension) / 2;
  const offsetY = (1 - bounds.height / maxDimension) / 2;
  const normalize = (point: WhiteboardPoint): WhiteboardPoint => ({
    x: ((point.x - bounds.x) / maxDimension + offsetX) * (GRID_SIZE - 1),
    y: ((point.y - bounds.y) / maxDimension + offsetY) * (GRID_SIZE - 1),
  });
  const occupied = new Set<number>();
  for (const segment of segments) {
    for (let index = 0; index < segment.length; index += 1) {
      const start = normalize(segment[index]);
      const end = normalize(segment[index + 1] ?? segment[index]);
      const steps = Math.max(1, Math.ceil(Math.hypot(end.x - start.x, end.y - start.y) * 2));
      for (let step = 0; step <= steps; step += 1) {
        const x = Math.round(start.x + (end.x - start.x) * step / steps);
        const y = Math.round(start.y + (end.y - start.y) * step / steps);
        occupied.add(y * GRID_SIZE + x);
      }
    }
  }
  const occupiedCells = [...occupied];
  return {
    aspectRatio: bounds.width / Math.max(1, bounds.height),
    cells: occupiedCells.map((cell) => GRID_CELLS[cell]),
    distances: GRID_CELLS.map(({ x, y }) => {
      let nearestSquared = Infinity;
      for (const occupiedCell of occupiedCells) {
        const occupiedPoint = GRID_CELLS[occupiedCell];
        const dx = x - occupiedPoint.x;
        const dy = y - occupiedPoint.y;
        nearestSquared = Math.min(nearestSquared, dx * dx + dy * dy);
      }
      return Math.sqrt(nearestSquared);
    }),
  };
}

function templateDistance(first: RasterizedTemplate, second: RasterizedTemplate): number {
  const distance = (from: WhiteboardPoint[], to: number[]) => from.reduce((sum, point) => {
    return sum + to[point.y * GRID_SIZE + point.x] / GRID_SIZE;
  }, 0) / Math.max(1, from.length);
  const shapeDistance = (distance(first.cells, second.distances) + distance(second.cells, first.distances)) / 2;
  const aspectDistance = Math.abs(Math.log(Math.max(0.05, first.aspectRatio) / Math.max(0.05, second.aspectRatio)));
  return shapeDistance + aspectDistance * 0.08;
}

function splitStrokeSegments(points: readonly WhiteboardPoint[]): WhiteboardPoint[][] {
  const segments: WhiteboardPoint[][] = [];
  let current: WhiteboardPoint[] = [];
  for (const point of points) {
    if ('breakBefore' in point && point.breakBefore && current.length > 0) {
      segments.push(current);
      current = [];
    }
    current.push(point);
  }
  if (current.length > 0) segments.push(current);
  return segments;
}

function getSegmentBounds(segments: readonly WhiteboardPoint[][]): { height: number; width: number; x: number; y: number } | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const segment of segments) {
    for (const point of segment) {
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    }
  }
  if (!Number.isFinite(minX)) return null;
  return { height: maxY - minY, width: maxX - minX, x: minX, y: minY };
}

function ellipsePoints(cx: number, cy: number, rx: number, ry: number): WhiteboardPoint[] {
  return Array.from({ length: 33 }, (_, index) => {
    const angle = Math.PI * 2 * index / 32;
    return { x: cx + Math.cos(angle) * rx, y: cy + Math.sin(angle) * ry };
  });
}

function parsePoints(value = ''): WhiteboardPoint[] {
  const values = value.trim().split(/[ ,]+/).map(Number).filter(Number.isFinite);
  return Array.from({ length: Math.floor(values.length / 2) }, (_, index) => ({
    x: values[index * 2],
    y: values[index * 2 + 1],
  }));
}

function toWhiteboardPoints(points: Point[]): WhiteboardPoint[] {
  return points.map(([x, y]) => ({ x, y }));
}

function number(value: string | undefined): number {
  return Number(value ?? 0);
}
