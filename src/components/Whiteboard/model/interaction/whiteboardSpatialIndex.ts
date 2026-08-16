import {
  getEraserRadius,
  type WhiteboardElement,
  type WhiteboardPoint,
  type WhiteboardStroke,
} from '@/components/Whiteboard/model/core/whiteboardModel';
import {
  extendSelectedOverlayGeometry,
  getElementBounds,
  getStrokeBounds,
  type WhiteboardSelectedOverlayGeometry,
  type WhiteboardSelectionRect,
} from './whiteboardSelectionTransform';
import { getRectCellKeys, getSweepCellKeys } from './whiteboardSpatialGrid';
import {
  collectWhiteboardCellItems,
  collectWhiteboardGlobalItems,
  getCurrentWhiteboardItems,
  sortWhiteboardItemsBySourceOrder,
} from './whiteboardSpatialIndexQuery';
import {
  getWhiteboardSparseCollectionUpdate,
  type WhiteboardSparseCollectionUpdate,
} from './whiteboardSpatialIndexUpdate';
import { getWhiteboardAppendStart } from '@/components/Whiteboard/model/core/whiteboardCollection';
import { addWhiteboardItemToOverlayCells } from './whiteboardSpatialIndexCells';
import {
  createWhiteboardEraserSpatialIndex,
  createWhiteboardEraserSpatialIndexAsync,
} from './whiteboardSpatialIndexBuild';

export { getWhiteboardIndexedItems } from './whiteboardSpatialIndexQuery';
export { createWhiteboardEraserSpatialIndex, createWhiteboardEraserSpatialIndexAsync };
const INDEX_MAX_OVERLAY_MUTATIONS = 256;

export interface WhiteboardEraserSample {
  point: WhiteboardPoint;
  size: number;
}

export interface WhiteboardItemOrder {
  get: (id: string) => number | undefined;
}

export interface WhiteboardEraserSpatialIndex {
  allElements: WhiteboardElement[];
  allStrokes: WhiteboardStroke[];
  baseElementOrder: WhiteboardItemOrder;
  baseIndex: WhiteboardEraserSpatialIndex | null;
  baseStrokeOrder: WhiteboardItemOrder;
  elementCells: Map<string, WhiteboardElement[]>;
  elementOrder: WhiteboardItemOrder;
  globalElements: WhiteboardElement[];
  globalStrokes: WhiteboardStroke[];
  localElementOrder: Map<string, number>;
  localStrokeOrder: Map<string, number>;
  overlayMutationCount: number;
  selectionGeometry: WhiteboardSelectedOverlayGeometry | null;
  strokeCells: Map<string, WhiteboardStroke[]>;
  strokeOrder: WhiteboardItemOrder;
}

export function updateWhiteboardEraserSpatialIndex(
  current: WhiteboardEraserSpatialIndex,
  elements: WhiteboardElement[],
  strokes: WhiteboardStroke[],
): WhiteboardEraserSpatialIndex {
  return tryUpdateWhiteboardEraserSpatialIndex(current, elements, strokes)
    ?? createWhiteboardEraserSpatialIndex(elements, strokes);
}

export function tryUpdateWhiteboardEraserSpatialIndex(
  current: WhiteboardEraserSpatialIndex,
  elements: WhiteboardElement[],
  strokes: WhiteboardStroke[],
): WhiteboardEraserSpatialIndex | null {
  if (current.allElements === elements && current.allStrokes === strokes) return current;
  const elementStart = getAppendStart(current.allElements, elements);
  const strokeStart = getAppendStart(current.allStrokes, strokes);
  if (elementStart !== null && strokeStart !== null) {
    const mutationCount = elements.length - elementStart + strokes.length - strokeStart;
    if (current.overlayMutationCount + mutationCount > INDEX_MAX_OVERLAY_MUTATIONS) {
      return null;
    }
    return appendWhiteboardSpatialIndex(current, elements, strokes, elementStart, strokeStart, mutationCount);
  }
  const elementUpdate = current.allElements === elements ? null : getWhiteboardSparseCollectionUpdate(
    current.allElements, elements, current.elementOrder, INDEX_MAX_OVERLAY_MUTATIONS,
  );
  if (current.allElements !== elements && !elementUpdate) return null;
  const strokeUpdate = current.allStrokes === strokes ? null : getWhiteboardSparseCollectionUpdate(
    current.allStrokes, strokes, current.strokeOrder, INDEX_MAX_OVERLAY_MUTATIONS,
  );
  if (current.allStrokes !== strokes && !strokeUpdate) return null;
  const mutationCount = (elementUpdate?.mutationCount ?? 0) + (strokeUpdate?.mutationCount ?? 0);
  const changedItemCount = (elementUpdate?.changedItems.length ?? 0) + (strokeUpdate?.changedItems.length ?? 0);
  const canPatchBulkDeletion = current.overlayMutationCount === 0 &&
    mutationCount > INDEX_MAX_OVERLAY_MUTATIONS &&
    changedItemCount <= INDEX_MAX_OVERLAY_MUTATIONS;
  if (current.overlayMutationCount + mutationCount > INDEX_MAX_OVERLAY_MUTATIONS && !canPatchBulkDeletion) {
    return null;
  }
  return patchWhiteboardSpatialIndex(current, elements, strokes, elementUpdate, strokeUpdate, mutationCount);
}

export function getWhiteboardEraserCandidates(
  index: WhiteboardEraserSpatialIndex,
  samples: WhiteboardEraserSample[],
): { elements: WhiteboardElement[]; strokes: WhiteboardStroke[] } {
  const cellKeys = getSweepCellKeys(getEraserSweeps(samples));
  const elements = new Set<WhiteboardElement>();
  const strokes = new Set<WhiteboardStroke>();
  collectWhiteboardGlobalItems(index, elements, strokes);
  for (const key of cellKeys) collectWhiteboardCellItems(index, key, elements, strokes);
  return {
    elements: getCurrentWhiteboardItems(elements, index.allElements, index.elementOrder, Boolean(index.baseIndex)),
    strokes: getCurrentWhiteboardItems(strokes, index.allStrokes, index.strokeOrder, Boolean(index.baseIndex)),
  };
}

export function getWhiteboardBoundsCandidates(
  index: WhiteboardEraserSpatialIndex,
  bounds: WhiteboardSelectionRect,
): { elements: WhiteboardElement[]; strokes: WhiteboardStroke[] } {
  const cellKeys = getRectCellKeys(bounds);
  if (!cellKeys) return { elements: index.allElements, strokes: index.allStrokes };
  const elements = new Set<WhiteboardElement>();
  const strokes = new Set<WhiteboardStroke>();
  collectWhiteboardGlobalItems(index, elements, strokes);
  for (const key of cellKeys) collectWhiteboardCellItems(index, key, elements, strokes);
  return {
    elements: sortWhiteboardItemsBySourceOrder(elements, index.allElements, index.elementOrder, Boolean(index.baseIndex)),
    strokes: sortWhiteboardItemsBySourceOrder(strokes, index.allStrokes, index.strokeOrder, Boolean(index.baseIndex)),
  };
}

function appendWhiteboardSpatialIndex(
  current: WhiteboardEraserSpatialIndex,
  elements: WhiteboardElement[],
  strokes: WhiteboardStroke[],
  elementStart: number,
  strokeStart: number,
  mutationCount: number,
): WhiteboardEraserSpatialIndex {
  const baseIndex = current.baseIndex ?? current;
  const previousOverlay = current.baseIndex ? current : null;
  const elementCells = elementStart < elements.length
    ? new Map(previousOverlay?.elementCells)
    : previousOverlay?.elementCells ?? new Map<string, WhiteboardElement[]>();
  const strokeCells = strokeStart < strokes.length
    ? new Map(previousOverlay?.strokeCells)
    : previousOverlay?.strokeCells ?? new Map<string, WhiteboardStroke[]>();
  const localElementOrder = elementStart < elements.length
    ? new Map(previousOverlay?.localElementOrder)
    : previousOverlay?.localElementOrder ?? new Map<string, number>();
  const localStrokeOrder = strokeStart < strokes.length
    ? new Map(previousOverlay?.localStrokeOrder)
    : previousOverlay?.localStrokeOrder ?? new Map<string, number>();
  const globalElements = elementStart < elements.length
    ? [...(previousOverlay?.globalElements ?? [])]
    : previousOverlay?.globalElements ?? [];
  const globalStrokes = strokeStart < strokes.length
    ? [...(previousOverlay?.globalStrokes ?? [])]
    : previousOverlay?.globalStrokes ?? [];

  for (let order = elementStart; order < elements.length; order += 1) {
    const element = elements[order];
    localElementOrder.set(element.id, order);
    if (!addWhiteboardItemToOverlayCells(elementCells, element, getElementBounds(element))) globalElements.push(element);
  }
  for (let order = strokeStart; order < strokes.length; order += 1) {
    const stroke = strokes[order];
    localStrokeOrder.set(stroke.id, order);
    const bounds = getStrokeBounds(stroke);
    if (bounds && !addWhiteboardItemToOverlayCells(strokeCells, stroke, bounds)) globalStrokes.push(stroke);
  }
  const selectionGeometry = current.selectionGeometry
    ? extendSelectedOverlayGeometry(
        current.selectionGeometry,
        elements.slice(elementStart),
        strokes.slice(strokeStart),
      )
    : null;
  return {
    allElements: elements,
    allStrokes: strokes,
    baseElementOrder: current.baseElementOrder,
    baseIndex,
    baseStrokeOrder: current.baseStrokeOrder,
    elementCells,
    elementOrder: elementStart < elements.length
      ? createItemOrder(localElementOrder, current.baseElementOrder)
      : current.elementOrder,
    globalElements,
    globalStrokes,
    localElementOrder,
    localStrokeOrder,
    overlayMutationCount: current.overlayMutationCount + mutationCount,
    selectionGeometry,
    strokeCells,
    strokeOrder: strokeStart < strokes.length
      ? createItemOrder(localStrokeOrder, current.baseStrokeOrder)
      : current.strokeOrder,
  };
}

function patchWhiteboardSpatialIndex(
  current: WhiteboardEraserSpatialIndex,
  elements: WhiteboardElement[],
  strokes: WhiteboardStroke[],
  elementUpdate: WhiteboardSparseCollectionUpdate<WhiteboardElement> | null,
  strokeUpdate: WhiteboardSparseCollectionUpdate<WhiteboardStroke> | null,
  mutationCount: number,
): WhiteboardEraserSpatialIndex {
  const baseIndex = current.baseIndex ?? current;
  const previousOverlay = current.baseIndex ? current : null;
  const elementCells = elementUpdate?.changedItems.length
    ? new Map(previousOverlay?.elementCells)
    : previousOverlay?.elementCells ?? new Map<string, WhiteboardElement[]>();
  const strokeCells = strokeUpdate?.changedItems.length
    ? new Map(previousOverlay?.strokeCells)
    : previousOverlay?.strokeCells ?? new Map<string, WhiteboardStroke[]>();
  const globalElements = elementUpdate?.changedItems.length
    ? [...(previousOverlay?.globalElements ?? [])]
    : previousOverlay?.globalElements ?? [];
  const globalStrokes = strokeUpdate?.changedItems.length
    ? [...(previousOverlay?.globalStrokes ?? [])]
    : previousOverlay?.globalStrokes ?? [];
  for (const element of elementUpdate?.changedItems ?? []) {
    if (!addWhiteboardItemToOverlayCells(elementCells, element, getElementBounds(element))) globalElements.push(element);
  }
  for (const stroke of strokeUpdate?.changedItems ?? []) {
    const bounds = getStrokeBounds(stroke);
    if (bounds && !addWhiteboardItemToOverlayCells(strokeCells, stroke, bounds)) globalStrokes.push(stroke);
  }
  return {
    allElements: elements,
    allStrokes: strokes,
    baseElementOrder: elementUpdate?.order ?? current.baseElementOrder,
    baseIndex,
    baseStrokeOrder: strokeUpdate?.order ?? current.baseStrokeOrder,
    elementCells,
    elementOrder: elementUpdate?.order ?? current.elementOrder,
    globalElements,
    globalStrokes,
    localElementOrder: elementUpdate ? new Map() : current.localElementOrder,
    localStrokeOrder: strokeUpdate ? new Map() : current.localStrokeOrder,
    overlayMutationCount: current.overlayMutationCount + mutationCount,
    selectionGeometry: null,
    strokeCells,
    strokeOrder: strokeUpdate?.order ?? current.strokeOrder,
  };
}

function createItemOrder(local: Map<string, number>, base: WhiteboardItemOrder): WhiteboardItemOrder {
  if (local.size === 0) return base;
  return {
    get: (id) => local.get(id) ?? base.get(id),
  };
}

function getAppendStart<T>(current: T[], next: T[]): number | null {
  if (next.length < current.length) return null;
  const knownStart = getWhiteboardAppendStart(current, next);
  if (knownStart !== null) return knownStart;
  for (let index = 0; index < current.length; index += 1) {
    if (current[index] !== next[index]) return null;
  }
  return current.length;
}

function getEraserSweeps(
  samples: WhiteboardEraserSample[],
): Array<{ end: WhiteboardEraserSample; radius: number; start: WhiteboardEraserSample }> {
  if (samples.length === 0) return [];
  if (samples.length === 1) {
    const sample = samples[0];
    return [{ end: sample, radius: getEraserRadius(sample.size), start: sample }];
  }
  return samples.slice(1).map((end, index) => {
    const start = samples[index];
    return { end, radius: getEraserRadius(Math.max(start.size, end.size)), start };
  });
}
