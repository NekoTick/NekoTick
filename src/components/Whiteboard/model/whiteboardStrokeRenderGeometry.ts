import { themeWhiteboardTokens } from '@/styles/themeTokens';
import { getStrokeWidth, type WhiteboardStroke, type WhiteboardStrokePoint } from './whiteboardModel';
import {
  getStrokePointPigment,
  getStrokePointRadius,
  smoothWhiteboardStrokePoint,
} from './whiteboardStrokeDynamics';
import { getOpenStrokePath, getRoundStrokeCapPath, getStrokeTangent } from './whiteboardStrokePath';
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
    centerPath: segments.map(getOpenStrokePath).join(' '),
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
  return getStrokePointSegments(stroke.points).map(getOpenStrokePath).join(' ');
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
    const tangent = getStrokeTangent(previous, point, next);
    const normalX = -tangent.y;
    const normalY = tangent.x;
    const radius = getStrokeRadius(stroke, point, normalX, normalY, index, points.length, widthScale);
    const renderIndex = getWhiteboardStrokeRenderPointIndex(stroke, index);
    const leftRadius = radius * (1 + getWhiteboardStrokeNoise(strokeSeed, renderIndex, 0) * edgeJitter);
    const rightRadius = radius * (1 + getWhiteboardStrokeNoise(strokeSeed, renderIndex, 1) * edgeJitter);

    left.push({ ...point, x: point.x + normalX * leftRadius, y: point.y + normalY * leftRadius });
    right.push({ ...point, x: point.x - normalX * rightRadius, y: point.y - normalY * rightRadius });
  }

  return getClosedStrokePath(stroke, points, left, right, widthScale);
}

function getClosedStrokePath(
  stroke: WhiteboardStroke,
  points: WhiteboardStrokePoint[],
  left: WhiteboardStrokePoint[],
  right: WhiteboardStrokePoint[],
  widthScale: number,
): string {
  const rightReversed = [...right].reverse();
  const rightPath = getOpenStrokePath(rightReversed).replace(/^M \S+ \S+\s*/, '');
  const end = points.at(-1)!;
  const endTangent = getStrokeTangent(points.at(-2)!, end, end);
  const endCapRadius = getStrokeRadius(
    stroke, end, endTangent.x, endTangent.y, points.length - 1, points.length, widthScale,
  );
  const start = points[0];
  const startTangent = getStrokeTangent(start, start, points[1]);
  const startCapRadius = getStrokeRadius(
    stroke, start, startTangent.x, startTangent.y, 0, points.length, widthScale,
  );
  const capScale = themeWhiteboardTokens.strokeRoundCapControlScale;
  const endCap = stroke.renderTaperEnd === false || stroke.tool === 'marker'
    ? `L ${right.at(-1)!.x} ${right.at(-1)!.y}`
    : getRoundStrokeCapPath(left.at(-1)!, right.at(-1)!, endTangent, endCapRadius * capScale, 1);
  const startCap = stroke.renderTaperStart === false || stroke.tool === 'marker'
    ? `L ${left[0].x} ${left[0].y}`
    : getRoundStrokeCapPath(right[0], left[0], startTangent, startCapRadius * capScale, -1);
  return `${getOpenStrokePath(left)} ${endCap} ${rightPath} ${startCap} Z`;
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
      stroke.renderTaperStart === false ? Infinity : index,
      stroke.renderTaperEnd === false ? Infinity : pointCount - index - 1,
    );
    const taperProgress = Math.min(1, edgeDistance / themeWhiteboardTokens.strokeTaperPointCount);
    radius *= themeWhiteboardTokens.strokeTaperMinScale + (1 - themeWhiteboardTokens.strokeTaperMinScale) * taperProgress;
  }
  return radius;
}

export function getSmoothedStrokePoints(
  points: WhiteboardStrokePoint[],
  tool: WhiteboardStroke['tool'],
): WhiteboardStrokePoint[] {
  if (points.length < 3) return points;
  const smoothing = themeWhiteboardTokens.strokeSmoothing[tool];
  const passAmount = 1 - Math.pow(1 - smoothing, 1 / themeWhiteboardTokens.strokeSmoothingPasses);
  let smoothed = points;
  for (let pass = 0; pass < themeWhiteboardTokens.strokeSmoothingPasses; pass += 1) {
    smoothed = smoothed.map((point, index) => {
      if (index === 0 || index === points.length - 1) return point;
      return smoothWhiteboardStrokePoint(point, smoothed[index - 1], smoothed[index + 1], passAmount);
    });
  }
  return smoothed;
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
  return getOpenStrokePath(points.map((point, index) => {
    const [previous, next] = getWhiteboardStrokePathNeighbors(stroke, segment, points, index);
    const tangent = getStrokeTangent(previous, point, next);
    const halfWidth = getStrokePointRadius(stroke.tool, point, stroke.size, -tangent.y, tangent.x);
    const renderIndex = getWhiteboardStrokeRenderPointIndex(stroke, index + segmentIndex * 4096);
    const noise = getWhiteboardStrokeNoise(strokeSeed, renderIndex, laneIndex + 40);
    const offset = halfWidth * (lanePosition * spread + noise * wander);
    return {
      ...point,
      x: point.x - tangent.y * offset,
      y: point.y + tangent.x * offset,
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
