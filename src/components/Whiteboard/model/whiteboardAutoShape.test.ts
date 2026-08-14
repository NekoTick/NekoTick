import { describe, expect, it } from 'vitest';
import type { WhiteboardAutoShape, WhiteboardPoint, WhiteboardStroke } from './whiteboardModel';
import { getWhiteboardAutoShapePoints } from './whiteboardAutoShapeGeometry';
import { finalizeWhiteboardAutoShape, getWhiteboardAutoShapePreview, recognizeWhiteboardShape } from './whiteboardAutoShape';

const edge = (from: WhiteboardPoint, to: WhiteboardPoint, steps: number): WhiteboardPoint[] => (
  Array.from({ length: steps }, (_, index) => ({
    x: from.x + (to.x - from.x) * index / steps,
    y: from.y + (to.y - from.y) * index / steps,
  }))
);

const outline = (corners: WhiteboardPoint[]) => [
  ...corners.flatMap((corner, index) => edge(corner, corners[(index + 1) % corners.length], 18)),
  corners[0],
];

const shapeOutline = (shape: WhiteboardAutoShape, steps = 18): WhiteboardPoint[] => {
  const points = getWhiteboardAutoShapePoints(shape, [0, 0, 200, 140]);
  if (shape === 'ellipse') return points;
  return [
    ...points.slice(0, -1).flatMap((point, index) => edge(point, points[index + 1], steps + index % 3)),
    points[0],
  ];
};

const addJitter = (points: WhiteboardPoint[]): WhiteboardPoint[] => points.map((point, index) => ({
  x: point.x + Math.sin(index * 1.7) * 2,
  y: point.y + Math.cos(index * 1.3) * 2,
}));

const rotate = (points: WhiteboardPoint[], angle: number): WhiteboardPoint[] => points.map(({ x, y }) => ({
  x: 100 + (x - 100) * Math.cos(angle) - (y - 70) * Math.sin(angle),
  y: 70 + (x - 100) * Math.sin(angle) + (y - 70) * Math.cos(angle),
}));

const ellipse = (radiusX: number, radiusY: number, samples = 64): WhiteboardPoint[] => (
  Array.from({ length: samples }, (_, index) => {
    const angle = index / (samples - 1) * Math.PI * 2;
    return { x: Math.cos(angle) * radiusX, y: Math.sin(angle) * radiusY };
  })
);

const arrow = (length: number): WhiteboardPoint[] => {
  const tip = { x: length, y: 0 };
  const left = { x: length - 75, y: -45 };
  const right = { x: length - 75, y: 45 };
  return [
    ...edge({ x: 0, y: 0 }, tip, 24),
    ...edge(tip, left, 8),
    ...edge(left, tip, 8),
    ...edge(tip, right, 8),
  ];
};

const stroke = (points: WhiteboardPoint[]): WhiteboardStroke => ({
  color: '#111111',
  id: 'shape-1',
  points: points.map((point) => ({ ...point, pressure: 0.5 })),
  size: 1,
  tool: 'pen',
});

describe('whiteboard auto shape recognition', () => {
  it.each([
    ['rectangle', outline([{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 120 }, { x: 0, y: 120 }])],
    ['diamond', outline([{ x: 100, y: 0 }, { x: 200, y: 60 }, { x: 100, y: 120 }, { x: 0, y: 60 }])],
    ['ellipse', Array.from({ length: 64 }, (_, index) => ({ x: 100 + Math.cos(index / 63 * Math.PI * 2) * 100, y: 60 + Math.sin(index / 63 * Math.PI * 2) * 60 }))],
    ['line', edge({ x: 0, y: 0 }, { x: 300, y: 30 }, 40)],
    ['arrow', arrow(300)],
  ] as const)('recognizes a %s', (type, points) => {
    expect(recognizeWhiteboardShape(points).type).toBe(type);
  });

  it.each([
    'triangle', 'parallelogram', 'trapezoid', 'pentagon', 'hexagon', 'octagon', 'star', 'cross',
  ] as const)('recognizes a hand-drawn %s', (type) => {
    expect(recognizeWhiteboardShape(addJitter(shapeOutline(type))).type).toBe(type);
  });

  it.each([
    'triangle', 'rectangle', 'diamond', 'parallelogram', 'trapezoid',
    'pentagon', 'hexagon', 'octagon', 'ellipse', 'star', 'cross',
  ] as const)('is stable across pointer sampling rates for a %s', (type) => {
    expect(recognizeWhiteboardShape(shapeOutline(type, 5)).type).toBe(type);
    expect(recognizeWhiteboardShape(shapeOutline(type, 31)).type).toBe(type);
  });

  it.each([
    'triangle', 'parallelogram', 'trapezoid', 'pentagon', 'hexagon', 'octagon', 'star', 'cross',
  ] as const)('recognizes a rotated %s', (type) => {
    expect(recognizeWhiteboardShape(addJitter(rotate(shapeOutline(type), Math.PI / 6))).type).toBe(type);
  });

  it.each([
    ['circle', ellipse(100, 100)],
    ['ellipse', rotate(ellipse(150, 75), Math.PI / 6)],
  ] as const)('recognizes a hand-drawn %s with ordinary pointer wobble', (_name, points) => {
    expect(recognizeWhiteboardShape(addJitter(points)).type).toBe('ellipse');
  });

  it('recognizes a circle drawn at uneven pointer speeds', () => {
    const points = Array.from({ length: 64 }, (_, index) => {
      const progress = index / 63;
      const angle = progress ** 1.6 * Math.PI * 2;
      return { x: Math.cos(angle) * 100, y: Math.sin(angle) * 100 };
    });

    expect(recognizeWhiteboardShape(addJitter(points)).type).toBe('ellipse');
  });

  it('recognizes an imperfect circle with drift and a small closing gap', () => {
    const radius = 100;
    const points = Array.from({ length: 61 }, (_, index) => {
      const progress = index / 60;
      const angle = 0.1 + progress ** 1.35 * (Math.PI * 2 - 0.2);
      const wobble = radius * (Math.sin(angle * 3 + 0.4) * 0.055 + Math.sin(angle * 7) * 0.025);
      return {
        x: Math.sin(angle * 2) * 4 + Math.cos(angle) * (radius + wobble),
        y: Math.sin(angle) * (radius - wobble * 0.55),
      };
    });

    expect(recognizeWhiteboardShape(points).type).toBe('ellipse');
  });

  it('falls back to pen for an unknown open stroke', () => {
    const squiggle = Array.from({ length: 50 }, (_, index) => ({
      x: index * 6,
      y: Math.sin(index / 3) * 45,
    }));

    expect(recognizeWhiteboardShape(squiggle).type).toBe('freedraw');
    expect(finalizeWhiteboardAutoShape(stroke(squiggle), 1)).toMatchObject({ tool: 'pen' });
  });

  it('rejects an ambiguous closed gesture instead of forcing a shape', () => {
    const asymmetricLoop = outline([
      { x: 0, y: 20 }, { x: 85, y: 0 }, { x: 200, y: 35 }, { x: 130, y: 70 },
      { x: 190, y: 140 }, { x: 45, y: 105 }, { x: 0, y: 20 },
    ]);

    expect(recognizeWhiteboardShape(asymmetricLoop).type).toBe('freedraw');
  });

  it('shows only recognized non-linear candidates as pending previews', () => {
    const rectangle = stroke(shapeOutline('rectangle'));
    const line = stroke(edge({ x: 0, y: 0 }, { x: 300, y: 20 }, 40));
    const arrowStroke = stroke(arrow(300));

    expect(getWhiteboardAutoShapePreview(rectangle, 1)).toMatchObject({
      pending: true,
      stroke: { autoShape: 'rectangle', tool: 'line' },
    });
    const linePreview = getWhiteboardAutoShapePreview(line, 1);
    expect(linePreview).toEqual({ pending: false, stroke: line });
    expect(linePreview.stroke).toBe(line);
    expect(getWhiteboardAutoShapePreview(arrowStroke, 1)).toEqual({ pending: false, stroke: arrowStroke });
  });

  it('converts a recognized closed outline into selectable shape geometry', () => {
    const rectangle = stroke(outline([{ x: 10, y: 20 }, { x: 210, y: 20 }, { x: 210, y: 140 }, { x: 10, y: 140 }]));
    const finalized = finalizeWhiteboardAutoShape(rectangle, 1);

    expect(finalized).toMatchObject({ autoShape: 'rectangle', tool: 'line' });
    expect(finalized.points.map(({ x, y }) => ({ x, y }))).toEqual([
      { x: 10, y: 20 }, { x: 210, y: 20 }, { x: 210, y: 140 }, { x: 10, y: 140 }, { x: 10, y: 20 },
    ]);
  });

  it('keeps small gestures as free drawing at the current zoom', () => {
    const tiny = outline([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }]);
    expect(recognizeWhiteboardShape(tiny, 1).type).toBe('freedraw');
    expect(recognizeWhiteboardShape(tiny, 3).type).toBe('rectangle');
  });
});
