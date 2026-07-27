import type { WhiteboardDragState } from './whiteboardInteractions';
import type { WhiteboardElement, WhiteboardStroke } from './whiteboardModel';
import { markWhiteboardSparseUpdate } from './whiteboardCollection';
import {
  extendSelectedOverlayGeometry,
  resizeSelectionElement,
  resizeSelectionStroke,
  type WhiteboardSelectedOverlayGeometry,
  type WhiteboardSelectionRect,
} from './whiteboardSelection';

const ASYNC_RESIZE_ITEM_THRESHOLD = 1000;
const ASYNC_RESIZE_POINT_THRESHOLD = 20_000;
const RESIZE_PREPARATION_SLICE_MS = 4;
const EMPTY_SELECTION_GEOMETRY: WhiteboardSelectedOverlayGeometry = {
  groupBounds: null,
  singleBounds: null,
  singleStroke: null,
};

type WhiteboardResizeDragState = Extract<WhiteboardDragState, { kind: 'resize-selection' }>;

export interface PreparedWhiteboardResize {
  elements: WhiteboardElement[];
  selectionGeometry: WhiteboardSelectedOverlayGeometry;
  strokes: WhiteboardStroke[];
}

export function shouldPrepareWhiteboardResize(state: WhiteboardResizeDragState): boolean {
  return shouldPrepareWhiteboardResizeItems(state.originalElementsById, state.originalStrokesById);
}

export function shouldPrepareWhiteboardResizeItems(
  elements: ReadonlyMap<string, WhiteboardElement>,
  strokes: ReadonlyMap<string, WhiteboardStroke>,
): boolean {
  if (elements.size + strokes.size > ASYNC_RESIZE_ITEM_THRESHOLD) {
    return true;
  }
  let pointCount = 0;
  for (const stroke of strokes.values()) {
    pointCount += stroke.points.length;
    if (pointCount > ASYNC_RESIZE_POINT_THRESHOLD) return true;
  }
  return false;
}

export async function prepareWhiteboardResize(
  elements: WhiteboardElement[],
  strokes: WhiteboardStroke[],
  state: WhiteboardResizeDragState,
  nextBounds: WhiteboardSelectionRect,
  isCurrent: () => boolean,
): Promise<PreparedWhiteboardResize | null> {
  let geometry = EMPTY_SELECTION_GEOMETRY;
  let geometryElements: WhiteboardElement[] = [];
  let geometryStrokes: WhiteboardStroke[] = [];
  let sliceStartedAt = performance.now();
  const flushGeometry = () => {
    geometry = extendSelectedOverlayGeometry(geometry, geometryElements, geometryStrokes);
    geometryElements = [];
    geometryStrokes = [];
  };

  let nextElements = elements;
  if (state.originalElementsById.size > 0) {
    nextElements = new Array<WhiteboardElement>(elements.length);
    for (let index = 0; index < elements.length; index += 1) {
      const element = elements[index];
      const original = state.originalElementsById.get(element.id);
      const next = original
        ? resizeSelectionElement({ ...original, imageSrc: element.imageSrc }, state.bounds, nextBounds)
        : element;
      nextElements[index] = next;
      if (original) geometryElements.push(next);
      if (index % 256 === 255) {
        flushGeometry();
        if (performance.now() - sliceStartedAt >= RESIZE_PREPARATION_SLICE_MS) {
          if (!isCurrent()) return null;
          await yieldToMainThread();
          sliceStartedAt = performance.now();
        }
      }
    }
    flushGeometry();
  }
  if (!isCurrent()) return null;

  let nextStrokes = strokes;
  if (state.originalStrokesById.size > 0) {
    nextStrokes = new Array<WhiteboardStroke>(strokes.length);
    const changedStrokes: WhiteboardStroke[] = [];
    for (let index = 0; index < strokes.length; index += 1) {
      const stroke = strokes[index];
      const original = state.originalStrokesById.get(stroke.id);
      const next = original ? resizeSelectionStroke(original, state.bounds, nextBounds) : stroke;
      nextStrokes[index] = next;
      if (original) {
        changedStrokes.push(next);
        geometryStrokes.push(next);
      }
      if (index % 256 === 255) {
        flushGeometry();
        if (performance.now() - sliceStartedAt >= RESIZE_PREPARATION_SLICE_MS) {
          if (!isCurrent()) return null;
          await yieldToMainThread();
          sliceStartedAt = performance.now();
        }
      }
    }
    flushGeometry();
    nextStrokes = markWhiteboardSparseUpdate(strokes, nextStrokes, changedStrokes);
  }
  return isCurrent() ? { elements: nextElements, selectionGeometry: geometry, strokes: nextStrokes } : null;
}

function yieldToMainThread(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
