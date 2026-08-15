import type { WhiteboardMoveDragState } from './whiteboardInteractions';
import type { WhiteboardElement, WhiteboardPoint, WhiteboardStroke } from './whiteboardModel';
import { markWhiteboardSparseUpdate } from './whiteboardCollection';
import { translateStroke } from './whiteboardSelectionTransform';
import { getElementBounds, getStrokeBounds, type WhiteboardSelectedOverlayGeometry, type WhiteboardSelectionRect } from './whiteboardSelectionTransform';

const ASYNC_MOVE_ITEM_THRESHOLD = 1000;
const ASYNC_MOVE_POINT_THRESHOLD = 20_000;
const MOVE_PREPARATION_SLICE_MS = 4;

export interface PreparedWhiteboardMove {
  elements: WhiteboardElement[];
  selectionGeometry: WhiteboardSelectedOverlayGeometry;
  strokes: WhiteboardStroke[];
}

export function shouldPrepareWhiteboardMove(state: WhiteboardMoveDragState): boolean {
  if (state.originalStrokesById.size + (state.kind === 'move-elements' ? state.originalElementsById.size : 0) > ASYNC_MOVE_ITEM_THRESHOLD) {
    return true;
  }
  let pointCount = 0;
  for (const stroke of state.originalStrokesById.values()) {
    pointCount += stroke.points.length;
    if (pointCount > ASYNC_MOVE_POINT_THRESHOLD) return true;
  }
  return false;
}

export async function prepareWhiteboardMove(
  elements: WhiteboardElement[],
  strokes: WhiteboardStroke[],
  state: WhiteboardMoveDragState,
  point: WhiteboardPoint,
  isCurrent: () => boolean,
): Promise<PreparedWhiteboardMove | null> {
  const dx = point.x - state.startPoint.x;
  const dy = point.y - state.startPoint.y;
  const geometry = createGeometryAccumulator();
  let nextElements = elements;
  let sliceStartedAt = performance.now();
  if (state.kind === 'move-elements' && state.originalElementsById.size > 0) {
    nextElements = new Array<WhiteboardElement>(elements.length);
    for (let index = 0; index < elements.length; index += 1) {
      const element = elements[index];
      const original = state.originalElementsById.get(element.id);
      nextElements[index] = original
        ? { ...element, x: Math.round(original.x + dx), y: Math.round(original.y + dy) }
        : element;
      if (original) includeGeometry(geometry, getElementBounds(nextElements[index]), nextElements[index].id, null);
      if (index % 256 === 255 && performance.now() - sliceStartedAt >= MOVE_PREPARATION_SLICE_MS) {
        if (!isCurrent()) return null;
        await yieldToMainThread();
        sliceStartedAt = performance.now();
      }
    }
  }
  if (!isCurrent()) return null;
  if (state.originalStrokesById.size === 0) {
    return { elements: nextElements, selectionGeometry: finishGeometry(geometry), strokes };
  }

  const nextStrokes = new Array<WhiteboardStroke>(strokes.length);
  const changedStrokes: WhiteboardStroke[] = [];
  for (let index = 0; index < strokes.length; index += 1) {
    const stroke = strokes[index];
    const original = state.originalStrokesById.get(stroke.id);
    const next = original ? translateStroke(original, dx, dy) : stroke;
    nextStrokes[index] = next;
    if (original) {
      changedStrokes.push(next);
      const bounds = getStrokeBounds(next);
      if (bounds) includeGeometry(geometry, bounds, next.id, next);
    }
    if (index % 256 === 255 && performance.now() - sliceStartedAt >= MOVE_PREPARATION_SLICE_MS) {
      if (!isCurrent()) return null;
      await yieldToMainThread();
      sliceStartedAt = performance.now();
    }
  }
  return isCurrent()
    ? {
        elements: nextElements,
        selectionGeometry: finishGeometry(geometry),
        strokes: markWhiteboardSparseUpdate(strokes, nextStrokes, changedStrokes),
      }
    : null;
}

interface GeometryAccumulator {
  count: number;
  maxX: number;
  maxY: number;
  minX: number;
  minY: number;
  singleBounds: WhiteboardSelectedOverlayGeometry['singleBounds'];
  singleStroke: WhiteboardStroke | null;
}

function createGeometryAccumulator(): GeometryAccumulator {
  return { count: 0, maxX: -Infinity, maxY: -Infinity, minX: Infinity, minY: Infinity, singleBounds: null, singleStroke: null };
}

function includeGeometry(
  geometry: GeometryAccumulator,
  bounds: WhiteboardSelectionRect,
  id: string,
  stroke: WhiteboardStroke | null,
): void {
  geometry.count += 1;
  if (geometry.count === 1) {
    geometry.singleBounds = { ...bounds, id };
    geometry.singleStroke = stroke;
  }
  geometry.minX = Math.min(geometry.minX, bounds.x);
  geometry.minY = Math.min(geometry.minY, bounds.y);
  geometry.maxX = Math.max(geometry.maxX, bounds.x + bounds.width);
  geometry.maxY = Math.max(geometry.maxY, bounds.y + bounds.height);
}

function finishGeometry(geometry: GeometryAccumulator): WhiteboardSelectedOverlayGeometry {
  if (geometry.count <= 1) {
    return { groupBounds: null, singleBounds: geometry.singleBounds, singleStroke: geometry.singleStroke };
  }
  return {
    groupBounds: {
      height: geometry.maxY - geometry.minY,
      width: geometry.maxX - geometry.minX,
      x: geometry.minX,
      y: geometry.minY,
    },
    singleBounds: null,
    singleStroke: null,
  };
}

function yieldToMainThread(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
