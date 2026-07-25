import { useCallback, useEffect, useRef, type Dispatch, type MutableRefObject, type PointerEvent, type SetStateAction } from 'react';
import type { WhiteboardDragState } from '../model/whiteboardInteractions';
import {
  type WhiteboardElement,
  type WhiteboardPoint,
  type WhiteboardStroke,
  type WhiteboardTool,
} from '../model/whiteboardModel';
import {
  getResizedSelectionBounds,
  getSelectionBounds,
  resizeSelectionElements,
  resizeSelectionStrokes,
  type WhiteboardResizeHandle,
} from '../model/whiteboardSelection';

interface WhiteboardElementControlsOptions {
  elements: WhiteboardElement[];
  getBoardPoint: (clientX: number, clientY: number) => WhiteboardPoint;
  pushHistory: () => void;
  selectedElementIds: string[];
  selectedStrokeIds: string[];
  setDragState: Dispatch<SetStateAction<WhiteboardDragState | null>>;
  setElements: Dispatch<SetStateAction<WhiteboardElement[]>>;
  setSelectedElementIds: Dispatch<SetStateAction<string[]>>;
  setSelectedStrokeIds: Dispatch<SetStateAction<string[]>>;
  setStrokes: Dispatch<SetStateAction<WhiteboardStroke[]>>;
  spacePressedRef: MutableRefObject<boolean>;
  strokes: WhiteboardStroke[];
  tool: WhiteboardTool;
}

export function useWhiteboardElementControls({
  elements,
  getBoardPoint,
  pushHistory,
  selectedElementIds,
  selectedStrokeIds,
  setDragState,
  setElements,
  setSelectedElementIds,
  setSelectedStrokeIds,
  setStrokes,
  spacePressedRef,
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
    if (tool !== 'select' || event.button !== 0 || spacePressedRef.current) return;
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
    const originalElements = elements.filter((item) => nextIds.includes(item.id));
    const originalStrokes = strokes.filter((stroke) => movingStrokeIds.includes(stroke.id));
    setDragState({
      kind: 'move-elements',
      elementIds: nextIds,
      currentPoint: point,
      originalElementsById: new Map(originalElements.map((item) => [item.id, item])),
      originalStrokesById: new Map(originalStrokes.map((stroke) => [stroke.id, stroke])),
      startPoint: point,
      strokeIds: movingStrokeIds,
    });
  }, [elements, getBoardPoint, pushHistory, selectedElementIds, selectedStrokeIds, setDragState, setSelectedElementIds, setSelectedStrokeIds, spacePressedRef, strokes, tool]);

  const handleSelectionResizePointerDown = useCallback((event: PointerEvent<SVGRectElement>, handle: WhiteboardResizeHandle) => {
    if (tool !== 'select' || event.button !== 0 || spacePressedRef.current) return;
    event.stopPropagation();
    const bounds = getSelectionBounds(elements, strokes, selectedElementIds, selectedStrokeIds);
    if (!bounds) return;
    const point = getBoardPoint(event.clientX, event.clientY);
    event.currentTarget.setPointerCapture(event.pointerId);
    pushHistory();
    const originalElements = elements.filter((item) => selectedElementIds.includes(item.id));
    const originalStrokes = strokes.filter((stroke) => selectedStrokeIds.includes(stroke.id));
    setDragState({
      bounds,
      handle,
      kind: 'resize-selection',
      originalElementsById: new Map(originalElements.map((item) => [item.id, item])),
      originalStrokesById: new Map(originalStrokes.map((stroke) => [stroke.id, stroke])),
      preserveAspectRatio: event.shiftKey,
      startPoint: point,
    });
  }, [elements, getBoardPoint, pushHistory, selectedElementIds, selectedStrokeIds, setDragState, spacePressedRef, strokes, tool]);

  const handleSelectionMovePointerDown = useCallback((event: PointerEvent<SVGElement>) => {
    if (tool !== 'select' || event.button !== 0 || spacePressedRef.current) return;
    event.stopPropagation();
    const point = getBoardPoint(event.clientX, event.clientY);
    event.currentTarget.setPointerCapture(event.pointerId);
    const originalElements = elements.filter((element) => selectedElementIds.includes(element.id));
    const originalStrokes = strokes.filter((stroke) => selectedStrokeIds.includes(stroke.id));
    if (originalElements.length === 0 && originalStrokes.length === 0) return;
    pushHistory();
    setDragState(originalElements.length > 0 ? {
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
  }, [elements, getBoardPoint, pushHistory, selectedElementIds, selectedStrokeIds, setDragState, spacePressedRef, strokes, tool]);

  const applyPendingSelectionResize = useCallback(() => {
    const pending = pendingSelectionResizeRef.current;
    pendingSelectionResizeRef.current = null;
    if (!pending) return;
    const { point, state } = pending;
    const nextBounds = getResizedSelectionBounds(state.bounds, state.startPoint, point, state.handle, state.preserveAspectRatio);
    setElements((current) => resizeSelectionElements(current, state.originalElementsById, state.bounds, nextBounds));
    setStrokes((current) => resizeSelectionStrokes(current, state.originalStrokesById, state.bounds, nextBounds));
  }, [setElements, setStrokes]);

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

function getNextElementSelection(selectedIds: string[], id: string, additive: boolean): string[] {
  if (!additive) return selectedIds.includes(id) ? selectedIds : [id];
  return selectedIds.includes(id) ? selectedIds.filter((selectedId) => selectedId !== id) : [...selectedIds, id];
}
