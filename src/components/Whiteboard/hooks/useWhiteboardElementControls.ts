import { useCallback, useEffect, useRef, type Dispatch, type MutableRefObject, type PointerEvent, type SetStateAction } from 'react';
import type { WhiteboardDragState } from '../model/whiteboardInteractions';
import type { WhiteboardEraserSpatialIndex, WhiteboardItemOrder } from '../model/whiteboardEraser';
import { isWhiteboardFullSelection } from '../model/whiteboardCollection';
import { createWhiteboardIndexedSelectionMap } from '../model/whiteboardIndexedSelectionMap';
import {
  type WhiteboardElement,
  type WhiteboardPoint,
  type WhiteboardStroke,
  type WhiteboardTool,
} from '../model/whiteboardModel';
import {
  getResizedSelectionBounds,
  getSelectionBounds,
  type WhiteboardResizeHandle,
} from '../model/whiteboardSelection';

interface WhiteboardElementControlsOptions {
  elements: WhiteboardElement[];
  getBoardPoint: (clientX: number, clientY: number) => WhiteboardPoint;
  interactionLocked?: boolean;
  pushHistory: () => void;
  selectedElementIds: string[];
  selectedStrokeIds: string[];
  selectionBounds?: ReturnType<typeof getSelectionBounds>;
  setDragState: Dispatch<SetStateAction<WhiteboardDragState | null>>;
  setElements: Dispatch<SetStateAction<WhiteboardElement[]>>;
  setSelectedElementIds: Dispatch<SetStateAction<string[]>>;
  setSelectedStrokeIds: Dispatch<SetStateAction<string[]>>;
  setStrokes: Dispatch<SetStateAction<WhiteboardStroke[]>>;
  spacePressedRef: MutableRefObject<boolean>;
  spatialIndex: WhiteboardEraserSpatialIndex;
  strokes: WhiteboardStroke[];
  tool: WhiteboardTool;
}

export function useWhiteboardElementControls({
  elements,
  getBoardPoint,
  interactionLocked = false,
  pushHistory,
  selectedElementIds,
  selectedStrokeIds,
  selectionBounds = null,
  setDragState,
  setSelectedElementIds,
  setSelectedStrokeIds,
  spacePressedRef,
  spatialIndex,
  strokes,
  tool,
}: WhiteboardElementControlsOptions) {
  const selectionResizeFrameRef = useRef<number | null>(null);
  const pendingSelectionResizeRef = useRef<{ point: WhiteboardPoint; state: Extract<WhiteboardDragState, { kind: 'resize-selection' }> } | null>(null);

  const selectElement = useCallback((id: string) => {
    setSelectedElementIds([id]);
    setSelectedStrokeIds([]);
  }, [setSelectedElementIds, setSelectedStrokeIds]);

  const handleElementPointerDown = useCallback((event: PointerEvent<HTMLDivElement>, element: WhiteboardElement) => {
    if (interactionLocked || tool !== 'select' || event.button !== 0 || spacePressedRef.current) return;
    event.stopPropagation();
    const point = getBoardPoint(event.clientX, event.clientY);
    event.currentTarget.setPointerCapture(event.pointerId);
    const keepStrokeSelection = event.shiftKey || selectedElementIds.includes(element.id);
    const nextIds = getNextElementSelection(selectedElementIds, element.id, event.shiftKey);
    setSelectedElementIds(nextIds);
    if (!keepStrokeSelection) setSelectedStrokeIds([]);
    if (event.shiftKey) return;
    if (nextIds.length === 0) return;
    pushHistory();
    const movingStrokeIds = keepStrokeSelection ? selectedStrokeIds : [];
    const originalElementsById = getSelectedItemMap(elements, nextIds, spatialIndex.allElements === elements ? spatialIndex.elementOrder : null);
    const originalStrokesById = getSelectedItemMap(strokes, movingStrokeIds, spatialIndex.allStrokes === strokes ? spatialIndex.strokeOrder : null);
    setDragState({
      kind: 'move-elements',
      elementIds: nextIds,
      currentPoint: point,
      originalElementsById,
      originalStrokesById,
      startPoint: point,
      strokeIds: movingStrokeIds,
    });
  }, [elements, getBoardPoint, interactionLocked, pushHistory, selectedElementIds, selectedStrokeIds, setDragState, setSelectedElementIds, setSelectedStrokeIds, spacePressedRef, spatialIndex, strokes, tool]);

  const handleSelectionResizePointerDown = useCallback((event: PointerEvent<SVGRectElement>, handle: WhiteboardResizeHandle) => {
    if (interactionLocked || tool !== 'select' || event.button !== 0 || spacePressedRef.current) return;
    event.stopPropagation();
    const originalElementsById = getSelectedItemMap(elements, selectedElementIds, spatialIndex.allElements === elements ? spatialIndex.elementOrder : null);
    const originalStrokesById = getSelectedItemMap(strokes, selectedStrokeIds, spatialIndex.allStrokes === strokes ? spatialIndex.strokeOrder : null);
    const bounds = selectionBounds ?? getSelectionBounds(
      [...originalElementsById.values()],
      [...originalStrokesById.values()],
      selectedElementIds,
      selectedStrokeIds,
    );
    if (!bounds) return;
    const point = getBoardPoint(event.clientX, event.clientY);
    event.currentTarget.setPointerCapture(event.pointerId);
    pushHistory();
    setDragState({
      bounds,
      currentBounds: bounds,
      handle,
      kind: 'resize-selection',
      originalElementsById,
      originalStrokesById,
      preserveAspectRatio: event.shiftKey,
      startPoint: point,
    });
  }, [elements, getBoardPoint, interactionLocked, pushHistory, selectedElementIds, selectedStrokeIds, selectionBounds, setDragState, spacePressedRef, spatialIndex, strokes, tool]);

  const handleSelectionMovePointerDown = useCallback((event: PointerEvent<SVGElement>) => {
    if (interactionLocked || tool !== 'select' || event.button !== 0 || spacePressedRef.current) return;
    event.stopPropagation();
    const point = getBoardPoint(event.clientX, event.clientY);
    event.currentTarget.setPointerCapture(event.pointerId);
    const originalElementsById = getSelectedItemMap(elements, selectedElementIds, spatialIndex.allElements === elements ? spatialIndex.elementOrder : null);
    const originalStrokesById = getSelectedItemMap(strokes, selectedStrokeIds, spatialIndex.allStrokes === strokes ? spatialIndex.strokeOrder : null);
    if (originalElementsById.size === 0 && originalStrokesById.size === 0) return;
    pushHistory();
    setDragState(originalElementsById.size > 0 ? {
      kind: 'move-elements',
      currentPoint: point,
      elementIds: selectedElementIds,
      originalElementsById,
      originalStrokesById,
      startPoint: point,
      strokeIds: selectedStrokeIds,
    } : {
      kind: 'move-strokes',
      currentPoint: point,
      originalStrokesById,
      startPoint: point,
      strokeIds: selectedStrokeIds,
    });
  }, [elements, getBoardPoint, interactionLocked, pushHistory, selectedElementIds, selectedStrokeIds, setDragState, spacePressedRef, spatialIndex, strokes, tool]);

  const applyPendingSelectionResize = useCallback(() => {
    const pending = pendingSelectionResizeRef.current;
    pendingSelectionResizeRef.current = null;
    if (!pending) return;
    const { point, state } = pending;
    const nextBounds = getResizedSelectionBounds(state.bounds, state.startPoint, point, state.handle, state.preserveAspectRatio);
    setDragState((current) => (
      current?.kind === 'resize-selection' && current.originalStrokesById === state.originalStrokesById
        ? { ...current, currentBounds: nextBounds }
        : current
    ));
  }, [setDragState]);

  const publishSelectionResize = useCallback(() => {
    selectionResizeFrameRef.current = null;
    applyPendingSelectionResize();
  }, [applyPendingSelectionResize]);

  const scheduleSelectionResize = useCallback((state: Extract<WhiteboardDragState, { kind: 'resize-selection' }>, point: WhiteboardPoint) => {
    pendingSelectionResizeRef.current = { point, state };
    if (selectionResizeFrameRef.current === null) selectionResizeFrameRef.current = window.requestAnimationFrame(publishSelectionResize);
  }, [publishSelectionResize]);

  const flushResizeDrags = useCallback(() => {
    if (selectionResizeFrameRef.current !== null) window.cancelAnimationFrame(selectionResizeFrameRef.current);
    selectionResizeFrameRef.current = null;
    applyPendingSelectionResize();
  }, [applyPendingSelectionResize]);

  useEffect(() => () => {
    if (selectionResizeFrameRef.current !== null) window.cancelAnimationFrame(selectionResizeFrameRef.current);
  }, []);

  return {
    flushResizeDrags,
    handleElementPointerDown,
    handleSelectionMovePointerDown,
    handleSelectionResizePointerDown,
    resizeSelection: scheduleSelectionResize,
    selectElement,
  };
}

function getSelectedItemMap<T extends { id: string }>(
  items: T[],
  ids: string[],
  order: WhiteboardItemOrder | null,
): ReadonlyMap<string, T> {
  if (ids.length === 0) return new Map();
  if (order) {
    return createWhiteboardIndexedSelectionMap(
      items,
      ids,
      order,
      isWhiteboardFullSelection(ids, items),
    );
  }
  const selectedIds = new Set(ids);
  const selectedItems = new Map<string, T>();
  for (const item of items) {
    if (selectedIds.has(item.id)) selectedItems.set(item.id, item);
  }
  return selectedItems;
}

function getNextElementSelection(selectedIds: string[], id: string, additive: boolean): string[] {
  if (!additive) return selectedIds.includes(id) ? selectedIds : [id];
  return selectedIds.includes(id) ? selectedIds.filter((selectedId) => selectedId !== id) : [...selectedIds, id];
}
