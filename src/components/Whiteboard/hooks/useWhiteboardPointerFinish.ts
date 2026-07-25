import { useCallback, type Dispatch, type MutableRefObject, type PointerEvent, type SetStateAction } from 'react';
import { isWhiteboardMoveDragState, type WhiteboardDragState } from '../model/whiteboardInteractions';
import type { WhiteboardElement, WhiteboardPoint, WhiteboardStroke } from '../model/whiteboardModel';
import { getItemsInLasso, getLassoBounds, translateStrokesFromOriginals } from '../model/whiteboardSelection';
import { getWhiteboardBoundsCandidates, type WhiteboardEraserSpatialIndex } from '../model/whiteboardEraser';

interface WhiteboardPointerFinishOptions {
  activePenPointerRef: MutableRefObject<number | null>;
  clearDraftStroke: () => void;
  deletePointer: (pointerId: number) => void;
  dragState: WhiteboardDragState | null;
  elements: WhiteboardElement[];
  finishEraserGesture: (cancelled?: boolean) => void;
  finishStrokeEraserGesture: (cancelled?: boolean) => void;
  flushResizeDrags: () => void;
  getBoardPoint: (clientX: number, clientY: number) => WhiteboardPoint;
  getDraftStroke: () => WhiteboardStroke | null;
  pushHistory: () => void;
  setDragState: Dispatch<SetStateAction<WhiteboardDragState | null>>;
  setElements: Dispatch<SetStateAction<WhiteboardElement[]>>;
  setSelectedElementIds: Dispatch<SetStateAction<string[]>>;
  setSelectedStrokeIds: Dispatch<SetStateAction<string[]>>;
  setStrokes: Dispatch<SetStateAction<WhiteboardStroke[]>>;
  spatialIndex: WhiteboardEraserSpatialIndex;
  strokeIdRef: MutableRefObject<number>;
  strokes: WhiteboardStroke[];
}

export function useWhiteboardPointerFinish({
  activePenPointerRef,
  clearDraftStroke,
  deletePointer,
  dragState,
  elements,
  finishEraserGesture,
  finishStrokeEraserGesture,
  flushResizeDrags,
  getBoardPoint,
  getDraftStroke,
  pushHistory,
  setDragState,
  setElements,
  setSelectedElementIds,
  setSelectedStrokeIds,
  setStrokes,
  spatialIndex,
  strokeIdRef,
  strokes,
}: WhiteboardPointerFinishOptions) {
  return useCallback((event?: PointerEvent<HTMLDivElement>) => {
    if (event) deletePointer(event.pointerId);
    finishEraserGesture(event?.type === 'pointercancel');
    finishStrokeEraserGesture(event?.type === 'pointercancel');
    flushResizeDrags();
    if (event?.pointerId === activePenPointerRef.current) activePenPointerRef.current = null;
    const currentDraft = getDraftStroke();
    if (event?.type !== 'pointercancel' && dragState?.kind === 'draw' && currentDraft && currentDraft.points.length > 0) {
      pushHistory();
      setStrokes((current) => [...current, { ...currentDraft, id: `wb-stroke-${strokeIdRef.current}` }]);
      strokeIdRef.current += 1;
    }
    if (event?.type !== 'pointercancel' && dragState?.kind === 'lasso') {
      const finalPoint = event ? getBoardPoint(event.clientX, event.clientY) : null;
      const path = finalPoint ? [...dragState.points, finalPoint] : dragState.points;
      const lassoBounds = getLassoBounds(path);
      const candidates = lassoBounds ? getWhiteboardBoundsCandidates(spatialIndex, lassoBounds) : null;
      const selection = getItemsInLasso(
        spatialIndex.allElements === elements ? candidates?.elements ?? elements : elements,
        spatialIndex.allStrokes === strokes ? candidates?.strokes ?? strokes : strokes,
        path,
      );
      setSelectedElementIds(selection.elementIds);
      setSelectedStrokeIds(selection.strokeIds);
    }
    if (isWhiteboardMoveDragState(dragState)) {
      const point = event && event.type !== 'pointercancel'
        ? getBoardPoint(event.clientX, event.clientY)
        : dragState.currentPoint;
      const dx = point.x - dragState.startPoint.x;
      const dy = point.y - dragState.startPoint.y;
      if (dragState.kind === 'move-strokes' || dragState.originalStrokesById.size > 0) {
        setStrokes((current) => translateStrokesFromOriginals(current, dragState.originalStrokesById, dx, dy));
      }
      if (dragState.kind === 'move-elements') {
        setElements((current) => current.map((element) => {
          const original = dragState.originalElementsById.get(element.id);
          return original ? { ...element, x: Math.round(original.x + dx), y: Math.round(original.y + dy) } : element;
        }));
      }
    }
    clearDraftStroke();
    setDragState(null);
  }, [
    activePenPointerRef, clearDraftStroke, deletePointer, dragState,
    elements, finishEraserGesture, finishStrokeEraserGesture, flushResizeDrags, getBoardPoint,
    getDraftStroke, pushHistory, setDragState, setElements, setSelectedElementIds,
    setSelectedStrokeIds, setStrokes, strokeIdRef, strokes,
    spatialIndex,
  ]);
}
