import { useCallback, type Dispatch, type PointerEvent, type SetStateAction } from 'react';
import { themeWhiteboardTokens } from '@/styles/themeTokens';
import type { WhiteboardDragState } from '@/components/Whiteboard/model/interaction/whiteboardInteractions';
import type { WhiteboardElement, WhiteboardPoint, WhiteboardStroke } from '@/components/Whiteboard/model/core/whiteboardModel';
import { findElementAtPoint, findStrokeAtPoint, getSelectionBounds } from '@/components/Whiteboard/model/interaction/whiteboardSelection';
import { getWhiteboardBoundsCandidates, getWhiteboardIndexedItems, type WhiteboardEraserSpatialIndex, type WhiteboardItemOrder } from '@/components/Whiteboard/model/interaction/whiteboardEraser';

interface WhiteboardStrokeSelectionOptions {
  elements: WhiteboardElement[];
  pushHistory: () => void;
  selectedElementIds: string[];
  selectedStrokeIds: string[];
  setDragState: Dispatch<SetStateAction<WhiteboardDragState | null>>;
  setSelectedElementIds: Dispatch<SetStateAction<string[]>>;
  setSelectedStrokeIds: Dispatch<SetStateAction<string[]>>;
  spatialIndex: WhiteboardEraserSpatialIndex;
  strokes: WhiteboardStroke[];
  zoom: number;
}

export function useWhiteboardStrokeSelection({
  elements,
  pushHistory,
  selectedElementIds,
  selectedStrokeIds,
  setDragState,
  setSelectedElementIds,
  setSelectedStrokeIds,
  spatialIndex,
  strokes,
  zoom,
}: WhiteboardStrokeSelectionOptions) {
  return useCallback((point: WhiteboardPoint, event: PointerEvent<HTMLDivElement>) => {
    const originalElements = getSelectedItems(
      elements,
      selectedElementIds,
      spatialIndex.allElements === elements ? spatialIndex.elementOrder : null,
    );
    const originalStrokes = getSelectedItems(
      strokes,
      selectedStrokeIds,
      spatialIndex.allStrokes === strokes ? spatialIndex.strokeOrder : null,
    );
    const selectionBounds = selectedElementIds.length + selectedStrokeIds.length > 0
      ? getSelectionBounds(originalElements, originalStrokes, selectedElementIds, selectedStrokeIds)
      : null;
    const hitTolerance = themeWhiteboardTokens.strokeHitTolerancePx / zoom;
    const candidates = spatialIndex.allStrokes === strokes || spatialIndex.allElements === elements
      ? getWhiteboardBoundsCandidates(spatialIndex, {
        height: hitTolerance * 2,
        width: hitTolerance * 2,
        x: point.x - hitTolerance,
        y: point.y - hitTolerance,
      })
      : null;
    const candidateElements = spatialIndex.allElements === elements
      ? candidates?.elements ?? elements
      : elements;
    const candidateStrokes = spatialIndex.allStrokes === strokes
      ? candidates?.strokes ?? strokes
      : strokes;
    const hitElement = findElementAtPoint(candidateElements, point);
    const hitStroke = findStrokeAtPoint(candidateStrokes, point, zoom);
    if (hitElement) {
      const hitSelected = selectedElementIds.includes(hitElement.id);
      const nextIds = hitSelected && event.shiftKey
        ? selectedElementIds.filter((id) => id !== hitElement.id)
        : Array.from(new Set(event.shiftKey || hitSelected ? [...selectedElementIds, hitElement.id] : [hitElement.id]));
      const keepStrokeSelection = event.shiftKey || hitSelected;
      setSelectedElementIds(nextIds);
      if (!keepStrokeSelection) setSelectedStrokeIds([]);
      if (event.shiftKey || nextIds.length === 0) return;
      pushHistory();
      const nextElements = getSelectedItems(
        elements, nextIds, spatialIndex.allElements === elements ? spatialIndex.elementOrder : null,
      );
      setDragState({
        kind: 'move-elements',
        currentPoint: point,
        elementIds: nextIds,
        originalElementsById: new Map(nextElements.map((element) => [element.id, element])),
        originalStrokesById: new Map(keepStrokeSelection ? originalStrokes.map((stroke) => [stroke.id, stroke]) : []),
        startPoint: point,
        strokeIds: keepStrokeSelection ? selectedStrokeIds : [],
      });
      return;
    }
    if (!hitStroke) {
      if (!event.shiftKey && selectionBounds && pointIsInsideRect(point, selectionBounds)) {
        pushHistory();
        setDragState(selectedElementIds.length > 0 ? {
          kind: 'move-elements',
          currentPoint: point,
          elementIds: selectedElementIds,
          originalElementsById: new Map(originalElements.map((element) => [element.id, element])),
          originalStrokesById: new Map(originalStrokes.map((stroke) => [stroke.id, stroke])),
          startPoint: point,
          strokeIds: selectedStrokeIds,
        } : {
          kind: 'move-strokes',
          currentPoint: point,
          originalStrokesById: new Map(originalStrokes.map((stroke) => [stroke.id, stroke])),
          startPoint: point,
          strokeIds: selectedStrokeIds,
        });
        return;
      }
      setSelectedElementIds([]);
      setSelectedStrokeIds([]);
      setDragState({ kind: 'lasso', points: [point] });
      return;
    }
    const hitSelected = selectedStrokeIds.includes(hitStroke.id);
    const nextIds = hitSelected && event.shiftKey
      ? selectedStrokeIds.filter((id) => id !== hitStroke.id)
      : Array.from(new Set(event.shiftKey || hitSelected ? [...selectedStrokeIds, hitStroke.id] : [hitStroke.id]));
    const keepElementSelection = event.shiftKey || hitSelected;
    if (!keepElementSelection) setSelectedElementIds([]);
    setSelectedStrokeIds(nextIds);
    if (event.shiftKey || nextIds.length === 0) return;
    pushHistory();
    const nextStrokes = getSelectedItems(
      strokes,
      nextIds,
      spatialIndex.allStrokes === strokes ? spatialIndex.strokeOrder : null,
    );
    if (selectedElementIds.length > 0 && keepElementSelection) {
      setDragState({
        kind: 'move-elements',
        currentPoint: point,
        elementIds: selectedElementIds,
        originalElementsById: new Map(originalElements.map((element) => [element.id, element])),
        originalStrokesById: new Map(nextStrokes.map((stroke) => [stroke.id, stroke])),
        startPoint: point,
        strokeIds: nextIds,
      });
      return;
    }
    setDragState({
      kind: 'move-strokes',
      currentPoint: point,
      originalStrokesById: new Map(nextStrokes.map((stroke) => [stroke.id, stroke])),
      startPoint: point,
      strokeIds: nextIds,
    });
  }, [elements, pushHistory, selectedElementIds, selectedStrokeIds, setDragState, setSelectedElementIds, setSelectedStrokeIds, spatialIndex, strokes, zoom]);
}

function getSelectedItems<T extends { id: string }>(
  items: T[],
  ids: string[],
  order: WhiteboardItemOrder | null,
): T[] {
  if (ids.length === 0) return [];
  if (order) return getWhiteboardIndexedItems(items, order, ids);
  const selectedIds = new Set(ids);
  return items.filter((item) => selectedIds.has(item.id));
}

function pointIsInsideRect(point: WhiteboardPoint, rect: { height: number; width: number; x: number; y: number }) {
  return point.x >= rect.x && point.x <= rect.x + rect.width
    && point.y >= rect.y && point.y <= rect.y + rect.height;
}
