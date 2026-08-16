import type { WhiteboardElement, WhiteboardStroke } from '@/components/Whiteboard/model/core/whiteboardModel';
import { getElementBounds, getSelectedOverlayGeometry, getStrokeBounds } from './whiteboardSelectionTransform';
import type { WhiteboardEraserSpatialIndex } from './whiteboardSpatialIndex';
import { addWhiteboardItemToCells } from './whiteboardSpatialIndexCells';

const INDEX_BUILD_SLICE_MS = 4;

export function createWhiteboardEraserSpatialIndex(
  elements: WhiteboardElement[],
  strokes: WhiteboardStroke[],
): WhiteboardEraserSpatialIndex {
  const index = createEmptyIndex(elements, strokes);
  indexElements(index, elements, 0, elements.length);
  indexStrokes(index, strokes, 0, strokes.length);
  index.selectionGeometry = getSelectedOverlayGeometry(elements, strokes);
  return index;
}

export async function createWhiteboardEraserSpatialIndexAsync(
  elements: WhiteboardElement[],
  strokes: WhiteboardStroke[],
  isCurrent: () => boolean,
): Promise<WhiteboardEraserSpatialIndex | null> {
  const index = createEmptyIndex(elements, strokes);
  let sliceStartedAt = performance.now();
  for (let start = 0; start < elements.length; start += 256) {
    if (!isCurrent()) return null;
    indexElements(index, elements, start, Math.min(elements.length, start + 256));
    if (performance.now() - sliceStartedAt >= INDEX_BUILD_SLICE_MS) {
      await yieldToMainThread();
      sliceStartedAt = performance.now();
    }
  }
  for (let start = 0; start < strokes.length; start += 256) {
    if (!isCurrent()) return null;
    indexStrokes(index, strokes, start, Math.min(strokes.length, start + 256));
    if (performance.now() - sliceStartedAt >= INDEX_BUILD_SLICE_MS) {
      await yieldToMainThread();
      sliceStartedAt = performance.now();
    }
  }
  if (!isCurrent()) return null;
  index.selectionGeometry = getSelectedOverlayGeometry(elements, strokes);
  return isCurrent() ? index : null;
}

function createEmptyIndex(
  elements: WhiteboardElement[],
  strokes: WhiteboardStroke[],
): WhiteboardEraserSpatialIndex {
  const elementOrder = new Map<string, number>();
  const strokeOrder = new Map<string, number>();
  return {
    allElements: elements,
    allStrokes: strokes,
    baseElementOrder: elementOrder,
    baseIndex: null,
    baseStrokeOrder: strokeOrder,
    elementCells: new Map(),
    elementOrder,
    globalElements: [],
    globalStrokes: [],
    localElementOrder: new Map(),
    localStrokeOrder: new Map(),
    overlayMutationCount: 0,
    selectionGeometry: null,
    strokeCells: new Map(),
    strokeOrder,
  };
}

function indexElements(
  index: WhiteboardEraserSpatialIndex,
  elements: WhiteboardElement[],
  start: number,
  end: number,
): void {
  const order = index.elementOrder as Map<string, number>;
  for (let itemIndex = start; itemIndex < end; itemIndex += 1) {
    const element = elements[itemIndex];
    order.set(element.id, itemIndex);
    if (!addWhiteboardItemToCells(index.elementCells, element, getElementBounds(element))) {
      index.globalElements.push(element);
    }
  }
}

function indexStrokes(
  index: WhiteboardEraserSpatialIndex,
  strokes: WhiteboardStroke[],
  start: number,
  end: number,
): void {
  const order = index.strokeOrder as Map<string, number>;
  for (let itemIndex = start; itemIndex < end; itemIndex += 1) {
    const stroke = strokes[itemIndex];
    order.set(stroke.id, itemIndex);
    const bounds = getStrokeBounds(stroke);
    if (bounds && !addWhiteboardItemToCells(index.strokeCells, stroke, bounds)) {
      index.globalStrokes.push(stroke);
    }
  }
}

function yieldToMainThread(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
