import { themeWhiteboardTokens } from '@/styles/themeTokens';
import { getStrokeWidth, type WhiteboardStroke, type WhiteboardStrokePoint } from './whiteboardModel';
import { getWhiteboardStrokeNoise, getWhiteboardStrokeSeed } from './whiteboardStrokeTexture';

export interface StrokeRenderGeometry {
  centerPath: string;
  grainPaths: string[];
  heavyPressurePath: string;
  mediumPressurePath: string;
  pressurePath: string;
  renderWidth: number;
}

export interface StrokeDabGeometry {
  angle: number;
  height: number;
  shape: 'circle' | 'ellipse' | 'rect';
  width: number;
}

interface StrokeRenderGeometryCacheEntry {
  geometry: StrokeRenderGeometry;
  pointCount: number;
  size: number;
  tool: WhiteboardStroke['tool'];
}

const strokeRenderGeometryCache = new WeakMap<WhiteboardStrokePoint[], StrokeRenderGeometryCacheEntry>();

export function getStrokeRenderWidth(stroke: WhiteboardStroke): number {
  if (stroke.points.length === 0) return getStrokeWidth(stroke.tool, 1, stroke.size);
  const pressure = stroke.points.reduce((total, point) => total + point.pressure, 0) / stroke.points.length;
  return getStrokeWidth(stroke.tool, pressure, stroke.size);
}

export function getStrokeDabGeometry(tool: WhiteboardStroke['tool'], width: number): StrokeDabGeometry {
  if (tool === 'marker') {
    return {
      angle: themeWhiteboardTokens.markerNibAngleDeg,
      height: width * themeWhiteboardTokens.markerNibMinWidthScale,
      shape: 'rect',
      width,
    };
  }
  if (tool === 'fountain') {
    return {
      angle: themeWhiteboardTokens.fountainNibAngleDeg,
      height: width * themeWhiteboardTokens.fountainNibMinWidthScale,
      shape: 'ellipse',
      width,
    };
  }
  return { angle: 0, height: width, shape: 'circle', width };
}

export function getStrokeRenderGeometry(stroke: WhiteboardStroke): StrokeRenderGeometry {
  const cached = strokeRenderGeometryCache.get(stroke.points);
  if (cached && cached.pointCount === stroke.points.length && cached.tool === stroke.tool && cached.size === stroke.size) {
    return cached.geometry;
  }
  const segments = getStrokePointSegments(stroke.points);
  const hasPressureDetail = stroke.tool === 'pencil' || stroke.tool === 'marker' || stroke.tool === 'watercolor';
  const geometry = {
    centerPath: segments.map(getOpenEdgePath).join(' '),
    grainPaths: getStrokeGrainPaths(stroke, segments),
    heavyPressurePath: hasPressureDetail ? segments.map((segment) => getPressureDetailPath(segment, themeWhiteboardTokens.pressureDetailHeavyThreshold)).join(' ') : '',
    mediumPressurePath: hasPressureDetail ? segments.map((segment) => getPressureDetailPath(segment, themeWhiteboardTokens.pressureDetailMediumThreshold)).join(' ') : '',
    pressurePath: segments.map((segment) => getPressureSegmentPath(stroke, segment)).join(' '),
    renderWidth: getStrokeRenderWidth(stroke),
  };
  strokeRenderGeometryCache.set(stroke.points, {
    geometry,
    pointCount: stroke.points.length,
    size: stroke.size,
    tool: stroke.tool,
  });
  return geometry;
}

function getPressureDetailPath(points: WhiteboardStrokePoint[], threshold: number): string {
  const commands: string[] = [];
  let drawing = false;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const point = points[index];
    if ((previous.pressure + point.pressure) / 2 < threshold) {
      drawing = false;
      continue;
    }
    if (!drawing) commands.push(`M ${previous.x} ${previous.y}`);
    commands.push(`L ${point.x} ${point.y}`);
    drawing = true;
  }
  return commands.join(' ');
}

export function getPressureStrokePath(stroke: WhiteboardStroke): string {
  const cached = strokeRenderGeometryCache.get(stroke.points);
  if (cached && cached.pointCount === stroke.points.length && cached.tool === stroke.tool && cached.size === stroke.size) {
    return cached.geometry.pressurePath;
  }
  return getStrokePointSegments(stroke.points).map((segment) => getPressureSegmentPath(stroke, segment)).join(' ');
}

export function getCenterStrokePath(stroke: WhiteboardStroke): string {
  const cached = strokeRenderGeometryCache.get(stroke.points);
  if (cached && cached.pointCount === stroke.points.length && cached.tool === stroke.tool && cached.size === stroke.size) {
    return cached.geometry.centerPath;
  }
  return getStrokePointSegments(stroke.points).map(getOpenEdgePath).join(' ');
}

export function getStrokePointSegments(points: WhiteboardStrokePoint[]): WhiteboardStrokePoint[][] {
  const segments: WhiteboardStrokePoint[][] = [];
  let current: WhiteboardStrokePoint[] = [];
  for (const point of points) {
    if (point.breakBefore && current.length > 0) {
      segments.push(current);
      current = [];
    }
    current.push(point);
  }
  if (current.length > 0) segments.push(current);
  return segments;
}

function getPressureSegmentPath(stroke: WhiteboardStroke, segment: WhiteboardStrokePoint[]): string {
  const points = getSmoothedStrokePoints(segment, stroke.tool);
  if (points.length < 2) return '';
  const left: WhiteboardStrokePoint[] = [];
  const right: WhiteboardStrokePoint[] = [];
  const edgeJitter = getStrokeEdgeJitter(stroke.tool);
  const strokeSeed = getWhiteboardStrokeSeed(stroke.id);

  for (let index = 0; index < points.length; index += 1) {
    const previous = points[Math.max(0, index - 1)];
    const point = points[index];
    const next = points[Math.min(points.length - 1, index + 1)];
    const dx = next.x - previous.x;
    const dy = next.y - previous.y;
    const length = Math.hypot(dx, dy) || 1;
    const radius = getStrokeRadius(stroke, point, dx, dy, index, points.length);
    const normalX = -dy / length;
    const normalY = dx / length;
    const leftRadius = radius * (1 + getWhiteboardStrokeNoise(strokeSeed, index, 0) * edgeJitter);
    const rightRadius = radius * (1 + getWhiteboardStrokeNoise(strokeSeed, index, 1) * edgeJitter);

    left.push({ ...point, x: point.x + normalX * leftRadius, y: point.y + normalY * leftRadius });
    right.push({ ...point, x: point.x - normalX * rightRadius, y: point.y - normalY * rightRadius });
  }

  return `${getOpenEdgePath(left)} ${getOpenEdgePath([...right].reverse()).replace(/^M /, 'L ')} Z`;
}

function getStrokeRadius(
  stroke: WhiteboardStroke,
  point: WhiteboardStrokePoint,
  dx: number,
  dy: number,
  index: number,
  pointCount: number,
): number {
  let radius = getStrokeWidth(stroke.tool, point.pressure, stroke.size) / 2;
  if (stroke.tool === 'pen' || stroke.tool === 'pencil' || stroke.tool === 'colored-pencil' || stroke.tool === 'fountain') {
    const edgeDistance = Math.min(index + 1, pointCount - index);
    const taperProgress = Math.min(1, edgeDistance / themeWhiteboardTokens.strokeTaperPointCount);
    radius *= themeWhiteboardTokens.strokeTaperMinScale + (1 - themeWhiteboardTokens.strokeTaperMinScale) * taperProgress;
  }
  if (stroke.tool === 'fountain') {
    const direction = Math.atan2(dy, dx);
    const nibAngle = themeWhiteboardTokens.fountainNibAngleDeg * Math.PI / 180;
    const directionScale = Math.abs(Math.sin(direction - nibAngle));
    radius *= themeWhiteboardTokens.fountainNibMinWidthScale +
      (1 - themeWhiteboardTokens.fountainNibMinWidthScale) * directionScale;
  }
  if (stroke.tool === 'marker') {
    const direction = Math.atan2(dy, dx);
    const nibAngle = themeWhiteboardTokens.markerNibAngleDeg * Math.PI / 180;
    const directionScale = Math.abs(Math.sin(direction - nibAngle));
    radius *= themeWhiteboardTokens.markerNibMinWidthScale +
      (1 - themeWhiteboardTokens.markerNibMinWidthScale) * directionScale;
  }
  return radius;
}

function getSmoothedStrokePoints(
  points: WhiteboardStrokePoint[],
  tool: WhiteboardStroke['tool'],
): WhiteboardStrokePoint[] {
  if (points.length < 4) return points;
  const smoothing = themeWhiteboardTokens.strokeSmoothing[tool];
  return points.map((point, index) => {
    if (index === 0 || index === points.length - 1) return point;
    const previous = points[index - 1];
    const next = points[index + 1];
    return {
      pressure: point.pressure + ((previous.pressure + next.pressure) / 2 - point.pressure) * smoothing,
      x: point.x + ((previous.x + next.x) / 2 - point.x) * smoothing,
      y: point.y + ((previous.y + next.y) / 2 - point.y) * smoothing,
    };
  });
}

function getStrokeEdgeJitter(tool: WhiteboardStroke['tool']): number {
  if (tool === 'pencil') return themeWhiteboardTokens.pencilEdgeJitter;
  if (tool === 'colored-pencil') return themeWhiteboardTokens.coloredPencilEdgeJitter;
  if (tool === 'watercolor') return themeWhiteboardTokens.watercolorEdgeJitter;
  if (tool === 'crayon') return themeWhiteboardTokens.crayonEdgeJitter;
  return 0;
}

function getStrokeGrainPaths(
  stroke: WhiteboardStroke,
  segments: WhiteboardStrokePoint[][],
): string[] {
  const material = stroke.tool === 'colored-pencil'
    ? {
        laneCount: themeWhiteboardTokens.coloredPencilGrainLaneCount,
        spread: themeWhiteboardTokens.coloredPencilGrainSpreadScale,
        wander: themeWhiteboardTokens.coloredPencilGrainWanderScale,
      }
    : stroke.tool === 'crayon'
      ? {
          laneCount: themeWhiteboardTokens.crayonGrainLaneCount,
          spread: themeWhiteboardTokens.crayonGrainSpreadScale,
          wander: themeWhiteboardTokens.crayonGrainWanderScale,
        }
      : null;
  if (!material) return [];
  return Array.from({ length: material.laneCount }, (_, laneIndex) => segments.map((segment, segmentIndex) => (
    getStrokeGrainLanePath(stroke, segment, laneIndex, material.laneCount, material.spread, material.wander, segmentIndex)
  )).join(' '));
}

function getStrokeGrainLanePath(
  stroke: WhiteboardStroke,
  segment: WhiteboardStrokePoint[],
  laneIndex: number,
  laneCount: number,
  spread: number,
  wander: number,
  segmentIndex: number,
): string {
  const points = getSmoothedStrokePoints(segment, stroke.tool);
  const strokeSeed = getWhiteboardStrokeSeed(stroke.id);
  const lanePosition = laneCount === 1 ? 0 : laneIndex / (laneCount - 1) * 2 - 1;
  return getOpenEdgePath(points.map((point, index) => {
    const previous = points[Math.max(0, index - 1)];
    const next = points[Math.min(points.length - 1, index + 1)];
    const dx = next.x - previous.x;
    const dy = next.y - previous.y;
    const length = Math.hypot(dx, dy) || 1;
    const halfWidth = getStrokeWidth(stroke.tool, point.pressure, stroke.size) / 2;
    const noise = getWhiteboardStrokeNoise(strokeSeed, index + segmentIndex * 4096, laneIndex + 40);
    const offset = halfWidth * (lanePosition * spread + noise * wander);
    return {
      ...point,
      x: point.x - dy / length * offset,
      y: point.y + dx / length * offset,
    };
  }));
}


function getOpenEdgePath(points: WhiteboardStrokePoint[]): string {
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
