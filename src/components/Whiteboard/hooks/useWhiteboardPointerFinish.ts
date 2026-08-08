import { useCallback, type Dispatch, type MutableRefObject, type PointerEvent, type SetStateAction } from 'react';
import { isWhiteboardMoveDragState, type WhiteboardDragState } from '../model/whiteboardInteractions';
import type { WhiteboardElement, WhiteboardPoint, WhiteboardStroke } from '../model/whiteboardModel';
import {
  getItemsInLasso,
  getLassoBounds,
  findElementAtPoint,
  getResizedSelectionBounds,
  resizeSelectionElements,
  resizeSelectionStrokes,
  translateElementsFromOriginals,
  translateStrokesFromOriginals,
} from '../model/whiteboardSelection';
import { getWhiteboardBoundsCandidates, type WhiteboardEraserSpatialIndex } from '../model/whiteboardEraser';
import { appendWhiteboardItems } from '../model/whiteboardCollection';

interface WhiteboardPointerFinishOptions {
  activePenPointerRef: MutableRefObject<number | null>;
  applyFinalDrawSample?: (event: PointerEvent<HTMLDivElement>) => void;
  clearDraftStroke: () => void;
  deletePointer: (pointerId: number) => void;
  dragState: WhiteboardDragState | null;
  elements: WhiteboardElement[];
  finishEraserGesture: (cancelled?: boolean) => void;
  finishStrokeEraserGesture: (cancelled?: boolean) => void;
  flushResizeDrags: () => void;
  getBoardPoint: (clientX: number, clientY: number) => WhiteboardPoint;
  getDraftStroke: () => WhiteboardStroke | null;
  prepareMoveCommit?: (state: Extract<WhiteboardDragState, { kind: 'move-elements' | 'move-strokes' }>, point: WhiteboardPoint) => boolean;
  prepareResizeCommit?: (state: Extract<WhiteboardDragState, { kind: 'resize-selection' }>, bounds: ReturnType<typeof getResizedSelectionBounds>) => boolean;
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
  applyFinalDrawSample,
  clearDraftStroke,
  deletePointer,
  dragState,
  elements,
  finishEraserGesture,
  finishStrokeEraserGesture,
  flushResizeDrags,
  getBoardPoint,
  getDraftStroke,
  prepareMoveCommit,
  prepareResizeCommit,
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
    if (event?.type !== 'pointercancel' && dragState?.kind === 'draw') {
      applyFinalDrawSample?.(event);
    }
    if (event) deletePointer(event.pointerId);
    finishEraserGesture(event?.type === 'pointercancel');
    finishStrokeEraserGesture(event?.type === 'pointercancel');
    flushResizeDrags();
    if (event?.pointerId === activePenPointerRef.current) activePenPointerRef.current = null;
    const currentDraft = getDraftStroke();
    if (event?.type !== 'pointercancel' && dragState?.kind === 'draw' && currentDraft && currentDraft.points.length > 0) {
      pushHistory();
      setStrokes((current) => appendWhiteboardItems(current, [{ ...currentDraft }]));
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
      const clickedElement = lassoBounds && lassoBounds.width < 3 && lassoBounds.height < 3
        ? findElementAtPoint(candidates?.elements ?? elements, finalPoint ?? path[0])
        : null;
      setSelectedElementIds(clickedElement ? [clickedElement.id] : selection.elementIds);
      setSelectedStrokeIds(selection.strokeIds);
    }
    if (event?.type !== 'pointercancel' && dragState?.kind === 'resize-selection') {
      const nextBounds = event
        ? getResizedSelectionBounds(
            dragState.bounds,
            dragState.startPoint,
            getBoardPoint(event.clientX, event.clientY),
            dragState.handle,
            dragState.preserveAspectRatio,
          )
        : dragState.currentBounds;
      if (event?.type !== 'pointercancel' && prepareResizeCommit?.(dragState, nextBounds)) {
        clearDraftStroke();
        return;
      }
      if (dragState.originalElementsById.size > 0) {
        setElements((current) => resizeSelectionElements(
          current,
          dragState.originalElementsById,
          dragState.bounds,
          nextBounds,
          spatialIndex.allElements === current ? spatialIndex.elementOrder : null,
        ));
      }
      if (dragState.originalStrokesById.size > 0) {
        setStrokes((current) => resizeSelectionStrokes(
          current,
          dragState.originalStrokesById,
          dragState.bounds,
          nextBounds,
          spatialIndex.allStrokes === current ? spatialIndex.strokeOrder : null,
        ));
      }
    }
    if (isWhiteboardMoveDragState(dragState)) {
      const point = event && event.type !== 'pointercancel'
        ? getBoardPoint(event.clientX, event.clientY)
        : dragState.currentPoint;
      const dx = point.x - dragState.startPoint.x;
      const dy = point.y - dragState.startPoint.y;
      if (event?.type !== 'pointercancel' && prepareMoveCommit?.(dragState, point)) {
        clearDraftStroke();
        return;
      }
      if (dragState.kind === 'move-strokes' || dragState.originalStrokesById.size > 0) {
        setStrokes((current) => translateStrokesFromOriginals(
          current,
          dragState.originalStrokesById,
          dx,
          dy,
          spatialIndex.allStrokes === current ? spatialIndex.strokeOrder : null,
        ));
      }
      if (dragState.kind === 'move-elements') {
        setElements((current) => translateElementsFromOriginals(
          current,
          dragState.originalElementsById,
          dx,
          dy,
          spatialIndex.allElements === current ? spatialIndex.elementOrder : null,
        ));
      }
    }
    clearDraftStroke();
    setDragState(null);
  }, [
    activePenPointerRef, applyFinalDrawSample, clearDraftStroke, deletePointer, dragState,
    elements, finishEraserGesture, finishStrokeEraserGesture, flushResizeDrags, getBoardPoint,
    getDraftStroke, prepareMoveCommit, prepareResizeCommit, pushHistory, setDragState, setElements, setSelectedElementIds,
    setSelectedStrokeIds, setStrokes, strokeIdRef, strokes,
    spatialIndex,
  ]);
}
