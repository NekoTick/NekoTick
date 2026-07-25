import { doesEraserSweepTouchStroke } from './whiteboardStrokeGeometry';
import {
  getEraserRadius,
  getStrokeEraserRadius,
  type WhiteboardElement,
  type WhiteboardPoint,
  type WhiteboardStroke,
} from './whiteboardModel';
import { getElementBounds, getStrokeBounds, type WhiteboardSelectionRect } from './whiteboardSelectionTransform';

const ERASER_INDEX_CELL_SIZE = 256;
const ERASER_INDEX_MAX_CELLS_PER_ITEM = 256;
const ERASER_INDEX_MAX_QUERY_CELLS = 4096;

export interface WhiteboardEraserSample {
  point: WhiteboardPoint;
  size: number;
}

export interface WhiteboardEraserTargets {
  elementIds: string[];
  strokeIds: string[];
}

export interface WhiteboardEraserPreview extends WhiteboardEraserTargets {
  trail: WhiteboardEraserSample[];
}

interface WhiteboardEraserSweep {
  end: WhiteboardEraserSample;
  radius: number;
  start: WhiteboardEraserSample;
}

export interface WhiteboardEraserSpatialIndex {
  allElements: WhiteboardElement[];
  allStrokes: WhiteboardStroke[];
  elementCells: Map<string, WhiteboardElement[]>;
  elementOrder: Map<string, number>;
  globalElements: WhiteboardElement[];
  globalStrokes: WhiteboardStroke[];
  strokeCells: Map<string, WhiteboardStroke[]>;
  strokeOrder: Map<string, number>;
}

export const EMPTY_WHITEBOARD_ERASER_PREVIEW: WhiteboardEraserPreview = {
  elementIds: [],
  strokeIds: [],
  trail: [],
};

export function getWhiteboardEraserTargets(
  elements: WhiteboardElement[],
  strokes: WhiteboardStroke[],
  samples: WhiteboardEraserSample[],
): WhiteboardEraserTargets {
  const sweeps = getEraserSweeps(samples);
  if (sweeps.length === 0) return { elementIds: [], strokeIds: [] };
  return {
    elementIds: elements.filter((element) => sweeps.some((sweep) => eraserSweepTouchesElement(element, sweep))).map((element) => element.id),
    strokeIds: strokes.filter((stroke) => sweeps.some((sweep) => (
      doesEraserSweepTouchStroke(stroke, sweep.start.point, sweep.end.point, Math.max(sweep.start.size, sweep.end.size))
    ))).map((stroke) => stroke.id),
  };
}

export function createWhiteboardEraserSpatialIndex(
  elements: WhiteboardElement[],
  strokes: WhiteboardStroke[],
): WhiteboardEraserSpatialIndex {
  const elementCells = new Map<string, WhiteboardElement[]>();
  const strokeCells = new Map<string, WhiteboardStroke[]>();
  const elementOrder = new Map(elements.map((element, order) => [element.id, order]));
  const strokeOrder = new Map(strokes.map((stroke, order) => [stroke.id, order]));
  const globalElements = elements.filter((element) => !addItemToCells(elementCells, element, getElementBounds(element)));
  const globalStrokes: WhiteboardStroke[] = [];
  strokes.forEach((stroke) => {
    const bounds = getStrokeBounds(stroke);
    if (bounds && !addItemToCells(strokeCells, stroke, bounds)) globalStrokes.push(stroke);
  });
  return {
    allElements: elements,
    allStrokes: strokes,
    elementCells,
    elementOrder,
    globalElements,
    globalStrokes,
    strokeCells,
    strokeOrder,
  };
}

export function getWhiteboardEraserCandidates(
  index: WhiteboardEraserSpatialIndex,
  samples: WhiteboardEraserSample[],
): { elements: WhiteboardElement[]; strokes: WhiteboardStroke[] } {
  const cellKeys = getSweepCellKeys(getEraserSweeps(samples));
  const elements = new Set(index.globalElements);
  const strokes = new Set(index.globalStrokes);
  cellKeys.forEach((key) => {
    index.elementCells.get(key)?.forEach((element) => elements.add(element));
    index.strokeCells.get(key)?.forEach((stroke) => strokes.add(stroke));
  });
  return { elements: [...elements], strokes: [...strokes] };
}

function sortBySourceOrder<T extends { id: string }>(items: Set<T>, order: Map<string, number>): T[] {
  return [...items].sort((first, second) => (order.get(first.id) ?? 0) - (order.get(second.id) ?? 0));
}

export function getWhiteboardStrokeEraserCandidates(
  index: WhiteboardEraserSpatialIndex,
  samples: WhiteboardEraserSample[],
): WhiteboardStroke[] {
  const cellKeys = getSweepCellKeys(getEraserSweeps(samples, getStrokeEraserRadius));
  const strokes = new Set(index.globalStrokes);
  cellKeys.forEach((key) => index.strokeCells.get(key)?.forEach((stroke) => strokes.add(stroke)));
  return [...strokes];
}

export function getWhiteboardBoundsCandidates(
  index: WhiteboardEraserSpatialIndex,
  bounds: WhiteboardSelectionRect,
): { elements: WhiteboardElement[]; strokes: WhiteboardStroke[] } {
  const cellKeys = getRectCellKeys(bounds);
  if (!cellKeys) return { elements: index.allElements, strokes: index.allStrokes };
  const elements = new Set(index.globalElements);
  const strokes = new Set(index.globalStrokes);
  cellKeys.forEach((key) => {
    index.elementCells.get(key)?.forEach((element) => elements.add(element));
    index.strokeCells.get(key)?.forEach((stroke) => strokes.add(stroke));
  });
  return {
    elements: sortBySourceOrder(elements, index.elementOrder),
    strokes: sortBySourceOrder(strokes, index.strokeOrder),
  };
}

function getEraserSweeps(
  samples: WhiteboardEraserSample[],
  getRadius = getEraserRadius,
): WhiteboardEraserSweep[] {
  if (samples.length === 0) return [];
  if (samples.length === 1) {
    const sample = samples[0];
    return [{ end: sample, radius: getRadius(sample.size), start: sample }];
  }
  return samples.slice(1).map((end, index) => {
    const start = samples[index];
    return { end, radius: getRadius(Math.max(start.size, end.size)), start };
  });
}

function eraserSweepTouchesElement(element: WhiteboardElement, sweep: WhiteboardEraserSweep): boolean {
  return segmentIntersectsRect(sweep.start.point, sweep.end.point, {
    maxX: element.x + element.width + sweep.radius,
    maxY: element.y + element.height + sweep.radius,
    minX: element.x - sweep.radius,
    minY: element.y - sweep.radius,
  });
}

function addItemToCells<T>(cells: Map<string, T[]>, item: T, bounds: WhiteboardSelectionRect): boolean {
  const minCellX = Math.floor(bounds.x / ERASER_INDEX_CELL_SIZE);
  const maxCellX = Math.floor((bounds.x + bounds.width) / ERASER_INDEX_CELL_SIZE);
  const minCellY = Math.floor(bounds.y / ERASER_INDEX_CELL_SIZE);
  const maxCellY = Math.floor((bounds.y + bounds.height) / ERASER_INDEX_CELL_SIZE);
  const cellCount = (maxCellX - minCellX + 1) * (maxCellY - minCellY + 1);
  if (cellCount > ERASER_INDEX_MAX_CELLS_PER_ITEM) return false;
  for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
    for (let cellY = minCellY; cellY <= maxCellY; cellY += 1) {
      const key = getCellKey(cellX, cellY);
      const items = cells.get(key);
      if (items) items.push(item);
      else cells.set(key, [item]);
    }
  }
  return true;
}

function getSweepCellKeys(sweeps: WhiteboardEraserSweep[]): Set<string> {
  const keys = new Set<string>();
  sweeps.forEach((sweep) => {
    const minCellX = Math.floor((Math.min(sweep.start.point.x, sweep.end.point.x) - sweep.radius) / ERASER_INDEX_CELL_SIZE);
    const maxCellX = Math.floor((Math.max(sweep.start.point.x, sweep.end.point.x) + sweep.radius) / ERASER_INDEX_CELL_SIZE);
    const minCellY = Math.floor((Math.min(sweep.start.point.y, sweep.end.point.y) - sweep.radius) / ERASER_INDEX_CELL_SIZE);
    const maxCellY = Math.floor((Math.max(sweep.start.point.y, sweep.end.point.y) + sweep.radius) / ERASER_INDEX_CELL_SIZE);
    for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
      for (let cellY = minCellY; cellY <= maxCellY; cellY += 1) keys.add(getCellKey(cellX, cellY));
    }
  });
  return keys;
}

function getRectCellKeys(bounds: WhiteboardSelectionRect): Set<string> | null {
  const minCellX = Math.floor(bounds.x / ERASER_INDEX_CELL_SIZE);
  const maxCellX = Math.floor((bounds.x + bounds.width) / ERASER_INDEX_CELL_SIZE);
  const minCellY = Math.floor(bounds.y / ERASER_INDEX_CELL_SIZE);
  const maxCellY = Math.floor((bounds.y + bounds.height) / ERASER_INDEX_CELL_SIZE);
  const cellCount = (maxCellX - minCellX + 1) * (maxCellY - minCellY + 1);
  if (cellCount > ERASER_INDEX_MAX_QUERY_CELLS) return null;
  const keys = new Set<string>();
  for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
    for (let cellY = minCellY; cellY <= maxCellY; cellY += 1) keys.add(getCellKey(cellX, cellY));
  }
  return keys;
}

function getCellKey(cellX: number, cellY: number): string {
  return `${cellX}:${cellY}`;
}

function segmentIntersectsRect(
  start: WhiteboardPoint,
  end: WhiteboardPoint,
  rect: { maxX: number; maxY: number; minX: number; minY: number },
): boolean {
  let minProgress = 0;
  let maxProgress = 1;
  for (const [origin, delta, min, max] of [
    [start.x, end.x - start.x, rect.minX, rect.maxX],
    [start.y, end.y - start.y, rect.minY, rect.maxY],
  ] as const) {
    if (delta === 0) {
      if (origin < min || origin > max) return false;
      continue;
    }
    const first = (min - origin) / delta;
    const second = (max - origin) / delta;
    minProgress = Math.max(minProgress, Math.min(first, second));
    maxProgress = Math.min(maxProgress, Math.max(first, second));
    if (minProgress > maxProgress) return false;
  }
  return true;
}
