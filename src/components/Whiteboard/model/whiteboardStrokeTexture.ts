import { themeWhiteboardTokens } from '@/styles/themeTokens';
import type { WhiteboardStroke } from './whiteboardModel';

export interface WhiteboardStrokeDashStyle {
  dashArray: string;
  dashOffset: number;
}

export interface WhiteboardStrokeGrainGroup {
  laneParity: number;
  path: string;
}

export function groupWhiteboardStrokeGrainPaths(paths: string[]): WhiteboardStrokeGrainGroup[] {
  return [0, 1].flatMap((laneParity) => {
    const path = paths.filter((_, index) => index % 2 === laneParity).join(' ');
    return path ? [{ laneParity, path }] : [];
  });
}

export function getWhiteboardStrokeDashStyle(
  stroke: WhiteboardStroke,
  pattern: string,
  baseOffset: number,
  lane: number,
): WhiteboardStrokeDashStyle {
  const values = pattern.split(/\s+/).map(Number).filter(Number.isFinite);
  const scale = Math.pow(stroke.size, themeWhiteboardTokens.textureDashScaleExponent) *
    (stroke.renderTextureScale ?? 1);
  const period = values.reduce((total, value) => total + value, 0);
  const variation = getWhiteboardStrokeNoise(getWhiteboardStrokeRenderSeed(stroke), 0, lane) * period * themeWhiteboardTokens.textureDashOffsetVariationScale;
  const scaledPeriod = period * scale;
  const dashOffset = (baseOffset + variation) * scale + (stroke.renderPathOffset ?? 0);
  return {
    dashArray: values.map((value) => roundTextureValue(value * scale)).join(' '),
    dashOffset: roundTextureValue(scaledPeriod > 0 ? dashOffset % scaledPeriod : dashOffset),
  };
}

export function getWhiteboardStrokeNoise(seed: number, index: number, lane: number): number {
  let value = seed ^ Math.imul(index + 1, 0x9e3779b1) ^ Math.imul(lane + 1, 0x85ebca6b);
  value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
  value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
  return ((value ^ (value >>> 16)) >>> 0) / 0xffffffff * 2 - 1;
}

export function getWhiteboardStrokeSeed(id: string): number {
  let hash = 2166136261;
  for (let index = 0; index < id.length; index += 1) {
    hash = Math.imul(hash ^ id.charCodeAt(index), 16777619);
  }
  return hash >>> 0;
}

export function getWhiteboardStrokeRenderSeed(stroke: WhiteboardStroke): number {
  return getWhiteboardStrokeSeed(stroke.renderSeed ?? stroke.id);
}

export function getWhiteboardStrokeRenderPointIndex(stroke: WhiteboardStroke, index: number): number {
  return (stroke.renderPointOffset ?? 0) + index;
}

function roundTextureValue(value: number): number {
  return Math.round(value * 1000) / 1000;
}
