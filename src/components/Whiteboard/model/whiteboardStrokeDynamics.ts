import { themeWhiteboardTokens } from '@/styles/themeTokens';
import {
  getStrokeWidth,
  type WhiteboardDrawingTool,
  type WhiteboardStrokePoint,
} from './whiteboardModel';

export interface WhiteboardStrokeFootprint {
  angle: number;
  majorRadius: number;
  minorRadius: number;
}

export interface StrokeDabGeometry {
  angle: number;
  height: number;
  shape: 'circle' | 'ellipse' | 'rect';
  width: number;
}

export function getStrokePointFootprint(
  tool: WhiteboardDrawingTool,
  point: WhiteboardStrokePoint,
  size: number,
): WhiteboardStrokeFootprint {
  return getStrokeFootprintForWidth(tool, point, getStrokeWidth(tool, point.pressure, size));
}

export function getStrokePointMaxWidth(
  tool: WhiteboardDrawingTool,
  point: WhiteboardStrokePoint,
  size: number,
): number {
  const footprint = getStrokePointFootprint(tool, point, size);
  const visibleScale = tool === 'watercolor' ? themeWhiteboardTokens.watercolorWashWidthScale : 1;
  const radius = tool === 'marker'
    ? Math.hypot(footprint.majorRadius, footprint.minorRadius)
    : Math.max(footprint.majorRadius, footprint.minorRadius);
  return radius * 2 * visibleScale;
}

export function getStrokePointRadius(
  tool: WhiteboardDrawingTool,
  point: WhiteboardStrokePoint,
  size: number,
  directionX: number,
  directionY: number,
): number {
  const footprint = getStrokePointFootprint(tool, point, size);
  const length = Math.hypot(directionX, directionY);
  if (length === 0) return Math.max(footprint.majorRadius, footprint.minorRadius);
  const unitX = directionX / length;
  const unitY = directionY / length;
  const axisX = Math.cos(footprint.angle);
  const axisY = Math.sin(footprint.angle);
  const majorProjection = unitX * axisX + unitY * axisY;
  const minorProjection = -unitX * axisY + unitY * axisX;
  if (tool === 'marker') {
    return footprint.majorRadius * Math.abs(majorProjection) +
      footprint.minorRadius * Math.abs(minorProjection);
  }
  return Math.hypot(
    footprint.majorRadius * majorProjection,
    footprint.minorRadius * minorProjection,
  );
}

export function getStrokePointPigment(
  tool: WhiteboardDrawingTool,
  point: WhiteboardStrokePoint,
): number {
  const pressure = clampUnit(point.pressure);
  if (point.velocity === undefined && point.tilt === undefined) return pressure;
  const response = themeWhiteboardTokens.strokePigmentResponse[tool];
  return clampUnit(
    pressure * response.pressure +
    getSlowFactor(point) * response.slow +
    (point.tilt ?? 0) * response.tilt,
  );
}

export function getStrokeDabGeometry(
  tool: WhiteboardDrawingTool,
  width: number,
  point?: WhiteboardStrokePoint,
): StrokeDabGeometry {
  const footprint = getStrokeFootprintForWidth(tool, point, width);
  const geometry = {
    angle: footprint.angle * 180 / Math.PI,
    height: footprint.minorRadius * 2,
    width: footprint.majorRadius * 2,
  };
  if (tool === 'marker') return { ...geometry, shape: 'rect' };
  if (tool === 'fountain' || Math.abs(geometry.width - geometry.height) > 1e-6) {
    return { ...geometry, shape: 'ellipse' };
  }
  return { ...geometry, shape: 'circle' };
}

export function interpolateWhiteboardStrokePoint(
  start: WhiteboardStrokePoint,
  end: WhiteboardStrokePoint,
  progress: number,
): WhiteboardStrokePoint {
  const point: WhiteboardStrokePoint = {
    pressure: mix(start.pressure, end.pressure, progress),
    x: mix(start.x, end.x, progress),
    y: mix(start.y, end.y, progress),
  };
  assignOptional(point, 'azimuth', mixOptionalAngle(start.azimuth, end.azimuth, progress));
  assignOptional(point, 'rotation', mixOptionalAngle(start.rotation, end.rotation, progress));
  assignOptional(point, 'tilt', mixOptional(start.tilt, end.tilt, progress));
  assignOptional(point, 'velocity', mixOptional(start.velocity, end.velocity, progress));
  return point;
}

export function smoothWhiteboardStrokePoint(
  point: WhiteboardStrokePoint,
  previous: WhiteboardStrokePoint,
  next: WhiteboardStrokePoint,
  amount: number,
): WhiteboardStrokePoint {
  const neighbor = interpolateWhiteboardStrokePoint(previous, next, 0.5);
  const smoothed = {
    ...point,
    pressure: mix(point.pressure, neighbor.pressure, amount),
    x: mix(point.x, neighbor.x, amount),
    y: mix(point.y, neighbor.y, amount),
  };
  assignOptional(smoothed, 'azimuth', mixOptionalAngle(point.azimuth, neighbor.azimuth, amount));
  assignOptional(smoothed, 'rotation', mixOptionalAngle(point.rotation, neighbor.rotation, amount));
  assignOptional(smoothed, 'tilt', mixOptional(point.tilt, neighbor.tilt, amount));
  assignOptional(smoothed, 'velocity', mixOptional(point.velocity, neighbor.velocity, amount));
  return smoothed;
}

export function scaleWhiteboardStrokePointOrientation(
  tool: WhiteboardDrawingTool,
  point: WhiteboardStrokePoint,
  scaleX: number,
  scaleY: number,
): WhiteboardStrokePoint {
  if (tool !== 'marker' && tool !== 'fountain') {
    return point.azimuth === undefined
      ? point
      : { ...point, azimuth: scaleAngle(point.azimuth, scaleX, scaleY) };
  }
  const fallback = (tool === 'marker'
    ? themeWhiteboardTokens.markerNibAngleDeg
    : themeWhiteboardTokens.fountainNibAngleDeg) * Math.PI / 180;
  const angle = (point.azimuth ?? fallback) + (point.rotation ?? 0);
  const oriented = { ...point, azimuth: scaleAngle(angle, scaleX, scaleY) };
  delete oriented.rotation;
  return oriented;
}

function getStrokeFootprintForWidth(
  tool: WhiteboardDrawingTool,
  point: WhiteboardStrokePoint | undefined,
  width: number,
): WhiteboardStrokeFootprint {
  const response = themeWhiteboardTokens.strokeFootprintResponse[tool];
  const radius = width / 2 * (1 + getSlowFactor(point) * response.slowWidth);
  if (tool === 'marker' || tool === 'fountain') {
    const defaultAngle = (tool === 'marker'
      ? themeWhiteboardTokens.markerNibAngleDeg
      : themeWhiteboardTokens.fountainNibAngleDeg) * Math.PI / 180;
    const minScale = tool === 'marker'
      ? themeWhiteboardTokens.markerNibMinWidthScale
      : themeWhiteboardTokens.fountainNibMinWidthScale;
    return {
      angle: getNibAngle(point, defaultAngle),
      majorRadius: radius,
      minorRadius: radius * minScale,
    };
  }
  const tilt = point?.tilt ?? 0;
  return {
    angle: point?.azimuth ?? 0,
    majorRadius: radius * (1 + tilt * response.tiltMajor),
    minorRadius: radius * (1 + tilt * response.tiltMinor),
  };
}

function getNibAngle(point: WhiteboardStrokePoint | undefined, fallback: number): number {
  if (point?.azimuth !== undefined) return normalizeAngle(point.azimuth + (point.rotation ?? 0));
  if (point?.rotation !== undefined) return normalizeAngle(fallback + point.rotation);
  return fallback;
}

function getSlowFactor(point: WhiteboardStrokePoint | undefined): number {
  if (point?.velocity === undefined) return 0;
  return 1 - clampUnit(point.velocity / themeWhiteboardTokens.mousePressureSpeedPxPerMs);
}

function mix(start: number, end: number, progress: number): number {
  return start + (end - start) * progress;
}

function mixOptional(start: number | undefined, end: number | undefined, progress: number): number | undefined {
  if (start === undefined && end === undefined) return undefined;
  return mix(start ?? end!, end ?? start!, progress);
}

function mixOptionalAngle(start: number | undefined, end: number | undefined, progress: number): number | undefined {
  if (start === undefined && end === undefined) return undefined;
  const first = start ?? end!;
  const second = end ?? start!;
  const delta = Math.atan2(Math.sin(second - first), Math.cos(second - first));
  return normalizeAngle(first + delta * progress);
}

function assignOptional<K extends 'azimuth' | 'rotation' | 'tilt' | 'velocity'>(
  point: WhiteboardStrokePoint,
  key: K,
  value: WhiteboardStrokePoint[K],
): void {
  if (value !== undefined) point[key] = value;
  else delete point[key];
}

function normalizeAngle(angle: number): number {
  const fullTurn = Math.PI * 2;
  return (angle % fullTurn + fullTurn) % fullTurn;
}

function scaleAngle(angle: number, scaleX: number, scaleY: number): number {
  return normalizeAngle(Math.atan2(Math.sin(angle) * scaleY, Math.cos(angle) * scaleX));
}

function clampUnit(value: number): number {
  return Math.min(1, Math.max(0, value));
}
