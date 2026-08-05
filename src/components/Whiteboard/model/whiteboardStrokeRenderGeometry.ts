import { themeWhiteboardTokens } from '@/styles/themeTokens';
import { getStrokeWidth, type WhiteboardStroke, type WhiteboardStrokePoint } from './whiteboardModel';
import {
  getStrokePointPigment,
  getStrokePointRadius,
  smoothWhiteboardStrokePoint,
} from './whiteboardStrokeDynamics';
import { getWhiteboardStrokeNoise, getWhiteboardStrokeRenderPointIndex, getWhiteboardStrokeRenderSeed } from './whiteboardStrokeTexture';
import { getWhiteboardStrokePathNeighbors } from './whiteboardStrokeRenderChunks';

export interface StrokeRenderGeometry {
  centerPath: string;
  grainPaths: string[];
  heavyPressurePath: string;
  mediumPressurePath: string;
  pressurePath: string;
  renderWidth: number;
  watercolorOuterPath: string;
  watercolorWashPath: string;
}

interface StrokeRenderGeometryCacheEntry {
  geometry: StrokeRenderGeometry;
  pointCount: number;
  renderPointOffset: number;
  renderSeed: string;
  size: number;
  taperEnd: boolean;
  taperStart: boolean;
  tool: WhiteboardStroke['tool'];
}

const strokeRenderGeometryCache = new WeakMap<WhiteboardStrokePoint[], StrokeRenderGeometryCacheEntry>();
export function invalidateWhiteboardStrokeRenderGeometry(points: WhiteboardStrokePoint[]): void {
  strokeRenderGeometryCache.delete(points);
}
export function getStrokeRenderWidth(stroke: WhiteboardStroke): number {
  if (stroke.points.length === 0) return getStrokeWidth(stroke.tool, 1, stroke.size);
  return getStrokeWidth(stroke.tool, stroke.points[0].pressure, stroke.size);
}
export function getStrokeRenderGeometry(stroke: WhiteboardStroke): StrokeRenderGeometry {
  const cached = strokeRenderGeometryCache.get(stroke.points);
  if (hasSameRenderGeometryInput(cached, stroke)) {
    return cached.geometry;
  }
  const segments = getStrokePointSegments(stroke.points);
  const hasPressureDetail = stroke.tool !== 'pen';
  const geometry = {
    centerPath: segments.map(getOpenEdgePath).join(' '),
    grainPaths: getStrokeGrainPaths(stroke, segments),
    heavyPressurePath: hasPressureDetail ? segments.map((segment) => getPressureDetailPath(stroke, segment, themeWhiteboardTokens.pressureDetailHeavyThreshold)).join(' ') : '',
    mediumPressurePath: hasPressureDetail ? segments.map((segment) => getPressureDetailPath(stroke, segment, themeWhiteboardTokens.pressureDetailMediumThreshold)).join(' ') : '',
    pressurePath: segments.map((segment) => getPressureSegmentPath(stroke, segment)).join(' '),
    renderWidth: getStrokeWidth(stroke.tool, themeWhiteboardTokens.defaultPointerPressure, stroke.size),
    watercolorOuterPath: stroke.tool === 'watercolor'
      ? segments.map((segment) => getPressureSegmentPath(stroke, segment, themeWhiteboardTokens.watercolorOuterWidthScale)).join(' ')
      : '',
    watercolorWashPath: stroke.tool === 'watercolor'
      ? segments.map((segment) => getPressureSegmentPath(stroke, segment, themeWhiteboardTokens.watercolorWashWidthScale)).join(' ')
      : '',
  };
  strokeRenderGeometryCache.set(stroke.points, {
    geometry,
    pointCount: stroke.points.length,
    renderPointOffset: stroke.renderPointOffset ?? 0,
    renderSeed: stroke.renderSeed ?? stroke.id,
    size: stroke.size,
    taperEnd: stroke.renderTaperEnd !== false,
    taperStart: stroke.renderTaperStart !== false,
    tool: stroke.tool,
  });
  return geometry;
}

function getPressureDetailPath(
  stroke: WhiteboardStroke,
  points: WhiteboardStrokePoint[],
  threshold: number,
): string {
  const commands: string[] = [];
  let drawing = false;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const point = points[index];
    if ((getStrokePointPigment(stroke.tool, previous) + getStrokePointPigment(stroke.tool, point)) / 2 < threshold) {
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
  if (hasSameRenderGeometryInput(cached, stroke)) {
    return cached.geometry.pressurePath;
  }
  return getStrokePointSegments(stroke.points).map((segment) => getPressureSegmentPath(stroke, segment)).join(' ');
}
export function getCenterStrokePath(stroke: WhiteboardStroke): string {
  const cached = strokeRenderGeometryCache.get(stroke.points);
  if (hasSameRenderGeometryInput(cached, stroke)) {
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

function getPressureSegmentPath(
  stroke: WhiteboardStroke,
  segment: WhiteboardStrokePoint[],
  widthScale = 1,
): string {
  const points = getSmoothedStrokePoints(segment, stroke.tool);
  if (points.length < 2) return '';
  const left: WhiteboardStrokePoint[] = [];
  const right: WhiteboardStrokePoint[] = [];
  const edgeJitter = getStrokeEdgeJitter(stroke.tool);
  const strokeSeed = getWhiteboardStrokeRenderSeed(stroke);

  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    const [previous, next] = getWhiteboardStrokePathNeighbors(stroke, segment, points, index);
    const dx = next.x - previous.x;
    const dy = next.y - previous.y;
    const length = Math.hypot(dx, dy) || 1;
    const normalX = -dy / length;
    const normalY = dx / length;
    const radius = getStrokeRadius(stroke, point, normalX, normalY, index, points.length, widthScale);
    const renderIndex = getWhiteboardStrokeRenderPointIndex(stroke, index);
    const leftRadius = radius * (1 + getWhiteboardStrokeNoise(strokeSeed, renderIndex, 0) * edgeJitter);
    const rightRadius = radius * (1 + getWhiteboardStrokeNoise(strokeSeed, renderIndex, 1) * edgeJitter);

    left.push({ ...point, x: point.x + normalX * leftRadius, y: point.y + normalY * leftRadius });
    right.push({ ...point, x: point.x - normalX * rightRadius, y: point.y - normalY * rightRadius });
  }

  return `${getOpenEdgePath(left)} ${getOpenEdgePath([...right].reverse()).replace(/^M /, 'L ')} Z`;
}

function getStrokeRadius(
  stroke: WhiteboardStroke,
  point: WhiteboardStrokePoint,
  normalX: number,
  normalY: number,
  index: number,
  pointCount: number,
  widthScale: number,
): number {
  let radius = getStrokePointRadius(stroke.tool, point, stroke.size, normalX, normalY) * widthScale;
  if (stroke.tool === 'pen' || stroke.tool === 'pencil' || stroke.tool === 'colored-pencil' || stroke.tool === 'fountain') {
    const edgeDistance = Math.min(
      stroke.renderTaperStart === false ? Infinity : index + 1,
      stroke.renderTaperEnd === false ? Infinity : pointCount - index,
    );
    const taperProgress = Math.min(1, edgeDistance / themeWhiteboardTokens.strokeTaperPointCount);
    radius *= themeWhiteboardTokens.strokeTaperMinScale + (1 - themeWhiteboardTokens.strokeTaperMinScale) * taperProgress;
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
    return smoothWhiteboardStrokePoint(point, previous, next, smoothing);
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
  const strokeSeed = getWhiteboardStrokeRenderSeed(stroke);
  const lanePosition = laneCount === 1 ? 0 : laneIndex / (laneCount - 1) * 2 - 1;
  return getOpenEdgePath(points.map((point, index) => {
    const [previous, next] = getWhiteboardStrokePathNeighbors(stroke, segment, points, index);
    const dx = next.x - previous.x;
    const dy = next.y - previous.y;
    const length = Math.hypot(dx, dy) || 1;
    const halfWidth = getStrokePointRadius(stroke.tool, point, stroke.size, -dy, dx);
    const renderIndex = getWhiteboardStrokeRenderPointIndex(stroke, index + segmentIndex * 4096);
    const noise = getWhiteboardStrokeNoise(strokeSeed, renderIndex, laneIndex + 40);
    const offset = halfWidth * (lanePosition * spread + noise * wander);
    return {
      ...point,
      x: point.x - dy / length * offset,
      y: point.y + dx / length * offset,
    };
  }));
}

function hasSameRenderGeometryInput(
  cached: StrokeRenderGeometryCacheEntry | undefined,
  stroke: WhiteboardStroke,
): cached is StrokeRenderGeometryCacheEntry {
  return cached !== undefined &&
    cached.pointCount === stroke.points.length &&
    cached.renderPointOffset === (stroke.renderPointOffset ?? 0) &&
    cached.renderSeed === (stroke.renderSeed ?? stroke.id) &&
    cached.size === stroke.size &&
    cached.taperEnd === (stroke.renderTaperEnd !== false) &&
    cached.taperStart === (stroke.renderTaperStart !== false) &&
    cached.tool === stroke.tool;
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
