import { describe, expect, it } from 'vitest';
import { themeWhiteboardTokens } from '@/styles/themeTokens';
import type { WhiteboardStroke } from './whiteboardModel';
import { appendStrokePointsInPlace, getStrokeDabGeometry, getStrokePointMinDistance, getStrokeRenderGeometry } from './whiteboardStrokeGeometry';

describe('whiteboard stroke point sampling', () => {
  it('keeps stroke point spacing stable in screen pixels across zoom levels', () => {
    const points = [{ pressure: 0.5, x: 0, y: 0 }];

    appendStrokePointsInPlace(points, [
      { pressure: 0.5, x: 2, y: 0 },
      { pressure: 0.5, x: 12, y: 0 },
    ], getStrokePointMinDistance(0.2));

    expect(points).toEqual([
      { pressure: 0.5, x: 0, y: 0 },
      { pressure: 0.5, x: 12, y: 0 },
    ]);
  });
});

describe('whiteboard stroke render geometry', () => {
  it('uses stylus tilt for broad media while keeping the pen tip round', () => {
    const point = { azimuth: 0, pressure: 0.7, tilt: 1, x: 0, y: 0 };

    for (const tool of ['pencil', 'colored-pencil', 'watercolor', 'crayon'] as const) {
      const dab = getStrokeDabGeometry(tool, 10, point);
      expect(dab.width).toBeGreaterThan(dab.height);
    }
    expect(getStrokeDabGeometry('pen', 10, point)).toMatchObject({ height: 10, width: 10 });
  });

  it('updates cached render geometry when draft points are appended in place', () => {
    const stroke: WhiteboardStroke = {
      color: '#111111',
      id: 'stroke',
      points: [
        { pressure: 0.5, x: 0, y: 0 },
        { pressure: 0.5, x: 40, y: 0 },
      ],
      size: 1,
      tool: 'crayon',
    };

    const initial = getStrokeRenderGeometry(stroke);
    appendStrokePointsInPlace(stroke.points, [
      { pressure: 0.5, x: 80, y: 0 },
    ]);
    const updated = getStrokeRenderGeometry(stroke);

    expect(updated).not.toBe(initial);
    expect(updated.centerPath).toContain('80');
    expect(updated.pressurePath).toContain('80');
  });

  it('tapers pen strokes at the beginning and end', () => {
    const stroke: WhiteboardStroke = {
      color: '#111111',
      id: 'pen-stroke',
      points: [0, 10, 20, 30, 40].map((x) => ({ pressure: 1, x, y: 0 })),
      size: 1,
      tool: 'pen',
    };

    const outlinePoints = readPathPoints(getStrokeRenderGeometry(stroke).pressurePath);
    const firstRadius = Math.abs(outlinePoints[0][1]);
    const centerEdge = outlinePoints.find(([x, y]) => x === 20 && y > 0);

    expect(centerEdge).toBeDefined();
    expect(firstRadius).toBeCloseTo(
      (themeWhiteboardTokens.penBaseWidthPx + themeWhiteboardTokens.penPressureWidthPx) / 2
        * themeWhiteboardTokens.strokeTaperMinScale,
    );
    expect(centerEdge![1]).toBeGreaterThan(firstRadius * 2);
  });

  it('rounds pen endpoints instead of closing the pressure outline with flat caps', () => {
    const stroke: WhiteboardStroke = {
      color: '#111111',
      id: 'rounded-pen',
      points: [
        { pressure: 1, x: 0, y: 0 },
        { pressure: 1, x: 10, y: 0 },
      ],
      size: 1,
      tool: 'pen',
    };

    const path = getStrokeRenderGeometry(stroke).pressurePath;
    const capControls = Array.from(path.matchAll(/C (-?\d+(?:\.\d+)?) [^ ]+ (-?\d+(?:\.\d+)?) [^ ]+/g));

    expect(capControls).toHaveLength(2);
    expect(Number(capControls[0]![1])).toBeGreaterThan(10);
    expect(Number(capControls[1]![1])).toBeLessThan(0);
  });

  it('smooths short pen turns before building their pressure outline', () => {
    const stroke: WhiteboardStroke = {
      color: '#111111',
      id: 'smooth-turn',
      points: [
        { pressure: 0.7, x: 0, y: 0 },
        { pressure: 0.7, x: 10, y: 0 },
        { pressure: 0.7, x: 10, y: 10 },
      ],
      size: 1,
      tool: 'pen',
    };

    const path = getStrokeRenderGeometry(stroke).pressurePath;

    expect(path).not.toContain('Q 10 0');
    expect(path.match(/Q /g)).toHaveLength(2);
  });

  it('uses a fixed fountain nib angle for directional line weight', () => {
    const createStroke = (x: number, y: number): WhiteboardStroke => ({
      color: '#111111',
      id: `fountain-${x}-${y}`,
      points: [{ pressure: 1, x: 0, y: 0 }, { pressure: 1, x, y }],
      size: 1,
      tool: 'fountain',
    });
    const horizontalStart = readPathPoints(getStrokeRenderGeometry(createStroke(10, 0)).pressurePath)[0];
    const nibAngle = -42 * Math.PI / 180;
    const alignedStart = readPathPoints(getStrokeRenderGeometry(createStroke(
      Math.cos(nibAngle) * 10,
      Math.sin(nibAngle) * 10,
    )).pressurePath)[0];

    expect(Math.hypot(...horizontalStart)).toBeGreaterThan(Math.hypot(...alignedStart) * 1.8);
  });

  it('uses a fixed marker nib angle for chisel line weight', () => {
    const createStroke = (x: number, y: number): WhiteboardStroke => ({
      color: '#ffaa00',
      id: `marker-${x}-${y}`,
      points: [{ pressure: 0.6, x: 0, y: 0 }, { pressure: 0.6, x, y }],
      size: 1,
      tool: 'marker',
    });
    const perpendicularAngle = Math.PI;
    const alignedAngle = Math.PI / 2;
    const wideStart = readPathPoints(getStrokeRenderGeometry(createStroke(
      Math.cos(perpendicularAngle) * 10,
      Math.sin(perpendicularAngle) * 10,
    )).pressurePath)[0];
    const narrowStart = readPathPoints(getStrokeRenderGeometry(createStroke(
      Math.cos(alignedAngle) * 10,
      Math.sin(alignedAngle) * 10,
    )).pressurePath)[0];

    expect(Math.hypot(...wideStart)).toBeGreaterThan(Math.hypot(...narrowStart) * 1.6);
  });

  it('keeps organic brush edges deterministic but unique per stroke', () => {
    const createStroke = (id: string): WhiteboardStroke => ({
      color: '#cc5500',
      id,
      points: [0, 10, 20, 30].map((x, index) => ({ pressure: 0.6, x, y: index % 2 === 0 ? 0 : 4 })),
      size: 1,
      tool: 'crayon',
    });

    const first = getStrokeRenderGeometry(createStroke('crayon-a')).pressurePath;
    const repeated = getStrokeRenderGeometry(createStroke('crayon-a')).pressurePath;
    const second = getStrokeRenderGeometry(createStroke('crayon-b')).pressurePath;

    expect(repeated).toBe(first);
    expect(second).not.toBe(first);
  });

  it('spreads colored pencil and crayon grain across the stroke width', () => {
    const createStroke = (tool: 'colored-pencil' | 'crayon'): WhiteboardStroke => ({
      color: '#1e96eb',
      id: `${tool}-grain`,
      points: [0, 10, 20, 30].map((x) => ({ pressure: 0.7, x, y: 0 })),
      size: 1,
      tool,
    });
    const coloredPencil = getStrokeRenderGeometry(createStroke('colored-pencil')).grainPaths;
    const crayon = getStrokeRenderGeometry(createStroke('crayon')).grainPaths;
    const readStartY = (path: string) => Number(path.match(/^M [^ ]+ ([^ ]+)/)?.[1]);

    expect(coloredPencil).toHaveLength(themeWhiteboardTokens.coloredPencilGrainLaneCount);
    expect(crayon).toHaveLength(themeWhiteboardTokens.crayonGrainLaneCount);
    expect(Math.min(...coloredPencil.map(readStartY))).toBeLessThan(0);
    expect(Math.max(...coloredPencil.map(readStartY))).toBeGreaterThan(0);
    expect(new Set(crayon).size).toBe(crayon.length);
  });

  it('creates bounded local pigment paths for medium and heavy pressure', () => {
    const stroke: WhiteboardStroke = {
      color: '#334455',
      id: 'pressure-detail',
      points: [
        { pressure: 0.2, x: 0, y: 0 },
        { pressure: 0.7, x: 10, y: 0 },
        { pressure: 0.9, x: 20, y: 0 },
        { pressure: 0.9, x: 30, y: 0 },
        { pressure: 0.3, x: 40, y: 0 },
      ],
      size: 1,
      tool: 'pencil',
    };

    const geometry = getStrokeRenderGeometry(stroke);

    expect(geometry.mediumPressurePath).toContain('M 10 0 L 20 0 L 30 0 L 40 0');
    expect(geometry.heavyPressurePath).toBe('M 10 0 L 20 0 L 30 0');
  });
});

function readPathPoints(path: string): [number, number][] {
  return Array.from(path.matchAll(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g), (match) => [
    Number(match[1]),
    Number(match[2]),
  ]);
}
