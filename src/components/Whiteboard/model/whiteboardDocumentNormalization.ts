import {
  WHITEBOARD_INITIAL_VIEWPORT,
  WHITEBOARD_SEED_ELEMENTS,
  WHITEBOARD_SEED_STROKES,
  clampWhiteboardZoom,
  resizeWhiteboardElement,
  type WhiteboardDrawingTool,
  type WhiteboardElement,
  type WhiteboardPaperStyle,
  type WhiteboardStroke,
  type WhiteboardStrokePoint,
  type WhiteboardViewport,
} from './whiteboardModel';
import type { WhiteboardSnapshot } from './whiteboardDocumentFormat';
import { splitWhiteboardStrokeSegments } from './whiteboardStrokeSegments';

type JsonRecord = Record<string, unknown>;
const paperStyles = new Set<WhiteboardPaperStyle>(['blank', 'dots', 'grid', 'ruled']);
const drawingTools = new Set<WhiteboardDrawingTool>(['pen', 'pencil', 'marker', 'colored-pencil', 'fountain', 'watercolor', 'crayon']);
const WHITEBOARD_ID_MAX_CHARS = 200;
const WHITEBOARD_COLOR_MAX_CHARS = 256;
const WHITEBOARD_ASSET_PATH_MAX_CHARS = 256;

export function normalizeWhiteboardSnapshot(value: unknown): WhiteboardSnapshot {
  return normalizeSnapshot(value, true);
}

export function normalizeStoredWhiteboardSnapshot(value: unknown): WhiteboardSnapshot {
  return normalizeSnapshot(value, false);
}

function normalizeSnapshot(value: unknown, runtimePoints: boolean): WhiteboardSnapshot {
  if (!isRecord(value)) return emptySnapshot();
  return {
    elements: readElements(value.elements, runtimePoints),
    ...(readWhiteboardPaper(value.paper) ? { paper: readWhiteboardPaper(value.paper)! } : {}),
    strokes: readStrokes(value.strokes, runtimePoints),
    viewport: readWhiteboardViewport(value.viewport) ?? { ...WHITEBOARD_INITIAL_VIEWPORT },
  };
}

function emptySnapshot(): WhiteboardSnapshot {
  return { elements: [...WHITEBOARD_SEED_ELEMENTS], strokes: [...WHITEBOARD_SEED_STROKES], viewport: { ...WHITEBOARD_INITIAL_VIEWPORT } };
}

function readElements(value: unknown, runtimeValues: boolean): WhiteboardElement[] {
  if (!Array.isArray(value)) return [...WHITEBOARD_SEED_ELEMENTS];
  const elements: WhiteboardElement[] = [];
  const ids = new Set<string>();
  for (const item of value) {
    const element = readWhiteboardElement(item, runtimeValues);
    if (!element || ids.has(element.id)) continue;
    ids.add(element.id);
    elements.push(element);
  }
  return elements;
}

function readStrokes(value: unknown, runtimePoints: boolean): WhiteboardStroke[] {
  if (!Array.isArray(value)) return [...WHITEBOARD_SEED_STROKES];
  const strokes: WhiteboardStroke[] = [];
  const ids = new Set<string>();
  for (const item of value) {
    const stroke = readWhiteboardStroke(item, runtimePoints);
    if (!stroke || ids.has(stroke.id)) continue;
    ids.add(stroke.id);
    strokes.push(stroke);
  }
  return splitWhiteboardStrokeSegments(strokes);
}

export function readStoredWhiteboardElement(value: unknown): WhiteboardElement | null {
  return readWhiteboardElement(value, false);
}

function readWhiteboardElement(value: unknown, runtimeValues: boolean): WhiteboardElement | null {
  if (!isRecord(value) || value.type !== 'image') return null;
  const id = readString(value.id, WHITEBOARD_ID_MAX_CHARS);
  const x = readFiniteNumber(value.x);
  const y = readFiniteNumber(value.y);
  const width = readPositiveNumber(value.width);
  const height = readPositiveNumber(value.height);
  if (!id || x === null || y === null || width === null || height === null) return null;
  return resizeWhiteboardElement({
    height, id, text: typeof value.text === 'string' ? value.text : '', type: value.type, width, x, y,
    ...(isSafeImageAssetPath(value.imageAssetPath) ? { imageAssetPath: value.imageAssetPath } : {}),
    ...(runtimeValues && typeof value.imageSrc === 'string' ? { imageSrc: value.imageSrc } : {}),
  }, width, height);
}

export function readStoredWhiteboardStroke(value: unknown): WhiteboardStroke | null {
  return readWhiteboardStroke(value, false);
}

function readWhiteboardStroke(value: unknown, runtimePoints: boolean): WhiteboardStroke | null {
  if (!isRecord(value)) return null;
  const id = readString(value.id, WHITEBOARD_ID_MAX_CHARS);
  const tool = typeof value.tool === 'string' && drawingTools.has(value.tool as WhiteboardDrawingTool) ? value.tool as WhiteboardDrawingTool : null;
  const color = readString(value.color, WHITEBOARD_COLOR_MAX_CHARS);
  const size = readPositiveNumber(value.size);
  const points = readStrokePoints(value.points, runtimePoints);
  return id && tool && color && size !== null && points.length > 0 ? { color, id, points, size, tool } : null;
}

function readStrokePoints(value: unknown, runtimePoints: boolean): WhiteboardStrokePoint[] {
  if (!Array.isArray(value)) return [];
  const points: WhiteboardStrokePoint[] = [];
  for (const item of value) {
    if (!Array.isArray(item) && (!runtimePoints || !isRecord(item))) continue;
    const x = readFiniteNumber(Array.isArray(item) ? item[0] : item.x);
    const y = readFiniteNumber(Array.isArray(item) ? item[1] : item.y);
    const pressure = readFiniteNumber(Array.isArray(item) ? item[2] : item.pressure);
    if (x === null || y === null || pressure === null) continue;
    const point = { pressure: Math.min(1, Math.max(0, pressure)), x, y };
    const breakBefore = Array.isArray(item) ? item[3] === true : item.breakBefore === true;
    points.push(breakBefore ? { ...point, breakBefore: true } : point);
  }
  return points;
}

export function readWhiteboardPaper(value: unknown): WhiteboardPaperStyle | null {
  return typeof value === 'string' && paperStyles.has(value as WhiteboardPaperStyle) ? value as WhiteboardPaperStyle : null;
}

export function readWhiteboardViewport(value: unknown): WhiteboardViewport | null {
  if (!isRecord(value)) return null;
  const x = readFiniteNumber(value.x);
  const y = readFiniteNumber(value.y);
  const zoom = readPositiveNumber(value.zoom);
  return x === null || y === null || zoom === null ? null : { x, y, zoom: clampWhiteboardZoom(zoom) };
}

export function isStoredWhiteboardContent(value: unknown): value is JsonRecord {
  return isRecord(value) && Array.isArray(value.elements) && Array.isArray(value.strokes) && isRecord(value.viewport);
}

export function isWhiteboardRecord(value: unknown): value is JsonRecord {
  return isRecord(value);
}

function isSafeImageAssetPath(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > WHITEBOARD_ASSET_PATH_MAX_CHARS || !value.startsWith('assets/')) return false;
  const fileName = value.slice('assets/'.length);
  return fileName.length > 0 && !fileName.includes('/') && !fileName.includes('\\') && fileName !== '.' && fileName !== '..';
}

function readString(value: unknown, maxChars: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= maxChars ? trimmed : null;
}

function readFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readPositiveNumber(value: unknown): number | null {
  const number = readFiniteNumber(value);
  return number !== null && number > 0 ? number : null;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
