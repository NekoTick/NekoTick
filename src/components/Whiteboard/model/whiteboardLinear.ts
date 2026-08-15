import { themeWhiteboardTokens } from '@/styles/themeTokens';
import type { IconName } from '@/components/ui/icons';
import type { MessageKey } from '@/lib/i18n';
import {
  createStrokePoint,
  isLinearTool,
  type WhiteboardLinearTool,
  type WhiteboardPoint,
  type WhiteboardStroke,
  type WhiteboardStrokePoint,
} from './whiteboardModel';
import {
  getWhiteboardCollisionCurves,
  getWhiteboardAutoShapePath,
  getWhiteboardCurveLength,
  getWhiteboardCurvePointAtLength,
  getWhiteboardRoughLinePath,
  getWhiteboardLinearRoughness,
  getWhiteboardRoughCurveOps,
  getWhiteboardRoughCurvePath,
  hashWhiteboardLinearSeed,
  sampleWhiteboardCurve,
} from './whiteboardLinearCurve';

export { isLinearTool };

export const WHITEBOARD_LINEAR_TOOLS: Array<{
  icon: IconName;
  id: WhiteboardLinearTool;
  imageSrc: string;
  labelKey: MessageKey;
}> = [
  { id: 'line', labelKey: 'whiteboard.tool.line', icon: 'whiteboard.line', imageSrc: '' },
  { id: 'arrow', labelKey: 'whiteboard.tool.arrow', icon: 'whiteboard.arrow', imageSrc: '' },
];

export function createWhiteboardLinearStroke(
  id: string,
  tool: WhiteboardLinearTool,
  start: WhiteboardPoint,
  end: WhiteboardPoint,
  color: string,
  size: number,
  angleLocked = false,
): WhiteboardStroke {
  return {
    color,
    id,
    points: createWhiteboardLinearPoints(start, end, angleLocked),
    size,
    tool,
  };
}

export function createWhiteboardLinearPoints(
  start: WhiteboardPoint,
  end: WhiteboardPoint,
  angleLocked = false,
): WhiteboardStrokePoint[] {
  const nextEnd = angleLocked ? snapWhiteboardLinearPoint(start, end) : end;
  return [createLinearPoint(start), createLinearPoint(nextEnd)];
}

export function snapWhiteboardLinearPoint(start: WhiteboardPoint, point: WhiteboardPoint): WhiteboardPoint {
  const distance = Math.hypot(point.x - start.x, point.y - start.y);
  const angle = Math.atan2(point.y - start.y, point.x - start.x);
  const snappedAngle = Math.round(angle / themeWhiteboardTokens.linearShiftAngleRad)
    * themeWhiteboardTokens.linearShiftAngleRad;
  return {
    x: start.x + Math.cos(snappedAngle) * distance,
    y: start.y + Math.sin(snappedAngle) * distance,
  };
}

export function getWhiteboardLinearPath(points: WhiteboardPoint[]): string {
  if (points.length === 0) return '';
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
}

export function getWhiteboardLinearRenderPath(stroke: WhiteboardStroke): string {
  return getWhiteboardAutoShapePath(stroke) || getWhiteboardRoughCurvePath(stroke) || getWhiteboardLinearPath(stroke.points);
}

export function getWhiteboardLinearMidpoint(
  stroke: WhiteboardStroke,
  segmentIndex: number,
): WhiteboardStrokePoint | null {
  const start = stroke.points[segmentIndex];
  const end = stroke.points[segmentIndex + 1];
  if (!start || !end) return null;
  const curve = getWhiteboardCollisionCurves(stroke)[segmentIndex];
  return createLinearPoint(curve ? getWhiteboardCurvePointAtLength(curve, 0.5) : { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 });
}

export function isWhiteboardLinearSegmentTooShort(
  stroke: WhiteboardStroke,
  segmentIndex: number,
  zoom: number,
): boolean {
  const curve = getWhiteboardCollisionCurves(stroke)[segmentIndex];
  return !curve || getWhiteboardCurveLength(curve) * zoom < themeWhiteboardTokens.linearMidpointMinLengthPx;
}

export function insertWhiteboardLinearMidpoint(
  stroke: WhiteboardStroke,
  segmentIndex: number,
): WhiteboardStroke {
  const midpoint = getWhiteboardLinearMidpoint(stroke, segmentIndex);
  if (!midpoint) return stroke;
  return {
    ...stroke,
    points: [
      ...stroke.points.slice(0, segmentIndex + 1),
      midpoint,
      ...stroke.points.slice(segmentIndex + 1),
    ],
  };
}

export function replaceWhiteboardLinearPoint(
  stroke: WhiteboardStroke,
  pointIndex: number,
  point: WhiteboardPoint,
  angleLocked = false,
): WhiteboardStroke {
  if (!stroke.points[pointIndex]) return stroke;
  const anchorIndex = pointIndex === 0 ? 1 : pointIndex - 1;
  const nextPoint = angleLocked && stroke.points[anchorIndex]
    ? snapWhiteboardLinearPoint(stroke.points[anchorIndex], point)
    : point;
  return {
    ...stroke,
    points: stroke.points.map((current, index) => (
      index === pointIndex ? { ...current, ...nextPoint } : current
    )),
  };
}

export function getWhiteboardLinearStrokeWidth(stroke: Pick<WhiteboardStroke, 'autoShape' | 'size'>): number {
  const baseWidth = stroke.autoShape
    ? themeWhiteboardTokens.autoShapeStrokeWidthPx
    : themeWhiteboardTokens.linearStrokeWidthPx;
  return baseWidth * stroke.size;
}

export function getWhiteboardArrowheadPath(stroke: WhiteboardStroke): string {
  const points = getWhiteboardArrowheadPoints(stroke);
  if (!points) return '';
  const seed = hashWhiteboardLinearSeed(stroke.id);
  const roughness = getWhiteboardLinearRoughness(stroke);
  return `${getWhiteboardRoughLinePath(points[0], points[1], roughness, seed)} ${getWhiteboardRoughLinePath(points[2], points[1], roughness, seed)}`;
}

export function getWhiteboardArrowheadPoints(stroke: WhiteboardStroke): WhiteboardPoint[] | null {
  if (stroke.tool !== 'arrow' || stroke.points.length < 2) return null;
  const ops = getWhiteboardRoughCurveOps(stroke, false);
  const index = ops.length - 1;
  const data = ops[index]?.op === 'bcurveTo' ? ops[index].data : null;
  if (!data || data.length !== 6) return null;
  const p3 = { x: data[4], y: data[5] };
  const p2 = { x: data[2], y: data[3] };
  const p1 = { x: data[0], y: data[1] };
  const previousOp = ops[index - 1];
  const p0 = previousOp?.op === 'bcurveTo'
    ? { x: previousOp.data[4], y: previousOp.data[5] }
    : previousOp?.op === 'move'
      ? { x: previousOp.data[0], y: previousOp.data[1] }
      : { x: 0, y: 0 };
  const t = 0.3;
  const x1 = (1 - t) ** 3 * p3.x + 3 * t * (1 - t) ** 2 * p2.x + 3 * t ** 2 * (1 - t) * p1.x + p0.x * t ** 3;
  const y1 = (1 - t) ** 3 * p3.y + 3 * t * (1 - t) ** 2 * p2.y + 3 * t ** 2 * (1 - t) * p1.y + p0.y * t ** 3;
  const tip = p3;
  const distance = Math.hypot(tip.x - x1, tip.y - y1);
  if (distance === 0) return null;
  const nx = (tip.x - x1) / distance;
  const ny = (tip.y - y1) / distance;
  const previous = stroke.points.at(-2)!;
  const segmentLength = Math.hypot(tip.x - previous.x, tip.y - previous.y);
  const length = Math.min(themeWhiteboardTokens.linearArrowheadSizePx, segmentLength * themeWhiteboardTokens.linearArrowheadSegmentScale);
  const tx = tip.x;
  const ty = tip.y;
  const xs = tx - nx * length;
  const ys = ty - ny * length;
  const angle = themeWhiteboardTokens.linearArrowheadAngleRad;
  const left = rotateAround({ x: xs, y: ys }, tip, -angle);
  const right = rotateAround({ x: xs, y: ys }, tip, angle);
  return [left, tip, right];
}

export function getWhiteboardLinearSegments(stroke: WhiteboardStroke): Array<[WhiteboardPoint, WhiteboardPoint]> {
  if (stroke.autoShape) return stroke.points.slice(1).map((point, index) => [stroke.points[index], point]);
  const segments = getWhiteboardCollisionCurves(stroke).flatMap(sampleWhiteboardCurve);
  const arrowhead = getWhiteboardArrowheadPoints(stroke);
  if (arrowhead) {
    segments.push([arrowhead[0], arrowhead[1]], [arrowhead[1], arrowhead[2]]);
  }
  return segments;
}

export function getWhiteboardLinearVisualPoints(stroke: WhiteboardStroke): WhiteboardPoint[] {
  if (stroke.autoShape) return stroke.points;
  const arrowhead = getWhiteboardArrowheadPoints(stroke);
  const points = getWhiteboardCollisionCurves(stroke).flatMap(sampleWhiteboardCurve).flat();
  return arrowhead ? [...points, arrowhead[0], arrowhead[2]] : points;
}

export function shouldCommitWhiteboardLinearStroke(stroke: WhiteboardStroke, zoom: number): boolean {
  const start = stroke.points[0];
  const end = stroke.points.at(-1);
  return Boolean(start && end && Math.hypot(end.x - start.x, end.y - start.y) * zoom >= themeWhiteboardTokens.linearConfirmThresholdPx);
}

function createLinearPoint(point: WhiteboardPoint): WhiteboardStrokePoint {
  return createStrokePoint(point, themeWhiteboardTokens.defaultPointerPressure);
}

function rotateAround(point: WhiteboardPoint, origin: WhiteboardPoint, angle: number): WhiteboardPoint {
  const x = point.x - origin.x;
  const y = point.y - origin.y;
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return { x: origin.x + x * cosine - y * sine, y: origin.y + x * sine + y * cosine };
}
