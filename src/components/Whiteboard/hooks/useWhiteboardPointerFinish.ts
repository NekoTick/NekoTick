import { useCallback, type Dispatch, type MutableRefObject, type PointerEvent, type SetStateAction } from 'react';
import { isWhiteboardMoveDragState, type WhiteboardDragState } from '../model/whiteboardInteractions';
import { isLinearTool, type WhiteboardElement, type WhiteboardPoint, type WhiteboardStroke, type WhiteboardTool } from '../model/whiteboardModel';
import {
  getItemsInLasso,
  getLassoBounds,
  findElementAtPoint,
  getResizedSelectionBounds,
  resizeSelectionElements,
  resizeSelectionStrokes,
  rotateSelectionElements,
  rotateSelectionStrokes,
  translateElementsFromOriginals,
  translateStrokesFromOriginals,
} from '../model/whiteboardSelection';
import { getWhiteboardBoundsCandidates, type WhiteboardEraserSpatialIndex } from '../model/whiteboardEraser';
import { appendWhiteboardItems } from '../model/whiteboardCollection';
import { insertWhiteboardLinearMidpoint, replaceWhiteboardLinearPoint, shouldCommitWhiteboardLinearStroke } from '../model/whiteboardLinear';
import { themeWhiteboardTokens } from '@/styles/themeTokens';
import { finalizeWhiteboardAutoShape } from '../model/whiteboardAutoShape';

interface WhiteboardPointerFinishOptions {
  activePenPointerRef: MutableRefObject<number | null>;
  applyFinalDrawSample?: (event: PointerEvent<HTMLDivElement>) => void;
  clearDraftStroke: () => void;
  deletePointer: (pointerId: number) => void;
  dragState: WhiteboardDragState | null;
  elements: WhiteboardElement[];
  finishEraserGesture: (cancelled?: boolean) => void;
  cancelPendingLinearPoint?: () => void;
  cancelPendingSelectionRotation?: () => void;
  flushResizeDrags: () => void;
  getBoardPoint: (clientX: number, clientY: number) => WhiteboardPoint;
  getDraftStroke: () => WhiteboardStroke | null;
  onAutoDrawStrokeCommit?: (stroke: WhiteboardStroke) => void;
  prepareMoveCommit?: (state: Extract<WhiteboardDragState, { kind: 'move-elements' | 'move-strokes' }>, point: WhiteboardPoint) => boolean;
  prepareResizeCommit?: (state: Extract<WhiteboardDragState, { kind: 'resize-selection' }>, bounds: ReturnType<typeof getResizedSelectionBounds>) => boolean;
  pushHistory: () => void;
  setDragState: Dispatch<SetStateAction<WhiteboardDragState | null>>;
  setElements: Dispatch<SetStateAction<WhiteboardElement[]>>;
  setSelectedElementIds: Dispatch<SetStateAction<string[]>>;
  setSelectedStrokeIds: Dispatch<SetStateAction<string[]>>;
  setStrokes: Dispatch<SetStateAction<WhiteboardStroke[]>>;
  setTool?: Dispatch<SetStateAction<WhiteboardTool>>;
  spatialIndex: WhiteboardEraserSpatialIndex;
  strokeIdRef: MutableRefObject<number>;
  strokes: WhiteboardStroke[];
  viewportZoom?: number;
}

export function useWhiteboardPointerFinish({
  activePenPointerRef,
  applyFinalDrawSample,
  clearDraftStroke,
  deletePointer,
  dragState,
  elements,
  finishEraserGesture,
  cancelPendingLinearPoint,
  cancelPendingSelectionRotation,
  flushResizeDrags,
  getBoardPoint,
  getDraftStroke,
  onAutoDrawStrokeCommit,
  prepareMoveCommit,
  prepareResizeCommit,
  pushHistory,
  setDragState,
  setElements,
  setSelectedElementIds,
  setSelectedStrokeIds,
  setStrokes,
  setTool,
  spatialIndex,
  strokeIdRef,
  strokes,
  viewportZoom = 1,
}: WhiteboardPointerFinishOptions) {
  return useCallback((event?: PointerEvent<HTMLDivElement>) => {
    const drawing = dragState?.kind === 'draw' || dragState?.kind === 'draw-autoshape' || dragState?.kind === 'draw-linear';
    const finalRotationPoint = event && event.type !== 'pointercancel' && dragState?.kind === 'rotate-selection'
      ? getBoardPoint(event.clientX, event.clientY)
      : null;
    const finalRotationAngle = finalRotationPoint && dragState?.kind === 'rotate-selection'
      ? Math.atan2(
          finalRotationPoint.y - dragState.center.y,
          finalRotationPoint.x - dragState.center.x,
        ) - dragState.startAngle
      : dragState?.kind === 'rotate-selection' ? dragState.currentAngle : 0;
    if (event?.type !== 'pointercancel' && drawing) {
      if (event) applyFinalDrawSample?.(event);
    }
    if (event) deletePointer(event.pointerId);
    finishEraserGesture(event?.type === 'pointercancel');
    cancelPendingLinearPoint?.();
    cancelPendingSelectionRotation?.();
    flushResizeDrags();
    if (event?.pointerId === activePenPointerRef.current) activePenPointerRef.current = null;
    const currentDraft = getDraftStroke();
    const finalizedDraft = currentDraft && dragState?.kind === 'draw-autoshape'
      ? finalizeWhiteboardAutoShape(currentDraft, viewportZoom)
      : currentDraft;
    const commitDraft = finalizedDraft && finalizedDraft.points.length > 0
      && (Boolean(finalizedDraft.autoShape) || !isLinearTool(finalizedDraft.tool) || shouldCommitWhiteboardLinearStroke(finalizedDraft, viewportZoom));
    if (event?.type !== 'pointercancel' && drawing && commitDraft && finalizedDraft) {
      pushHistory();
      setStrokes((current) => appendWhiteboardItems(current, [{ ...finalizedDraft }]));
      if (dragState?.kind === 'draw-autoshape') {
        if (finalizedDraft.tool === 'pen') {
          onAutoDrawStrokeCommit?.(finalizedDraft);
        } else {
          setSelectedElementIds([]);
          setSelectedStrokeIds([finalizedDraft.id]);
          setTool?.('select');
        }
      }
      if (dragState?.kind === 'draw-linear') {
        setSelectedElementIds([]);
        setSelectedStrokeIds([finalizedDraft.id]);
        setTool?.('select');
      }
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
    if (dragState?.kind === 'edit-linear-point') {
      const point = event && event.type !== 'pointercancel'
        ? getBoardPoint(event.clientX, event.clientY)
        : null;
      const startsNow = !dragState.started && Boolean(point
        && Math.hypot(point.x - dragState.startPoint.x, point.y - dragState.startPoint.y) * viewportZoom >= themeWhiteboardTokens.linearPointDragThresholdPx);
      if (startsNow) pushHistory();
      if (dragState.started || startsNow || event?.type === 'pointercancel') {
        setStrokes((current) => current.map((stroke) => {
          if (stroke.id !== dragState.strokeId) return stroke;
          if (event?.type === 'pointercancel') return dragState.originalStroke;
          if (!point) return stroke;
          const editable = startsNow && dragState.midpoint
            ? insertWhiteboardLinearMidpoint(stroke, dragState.pointIndex - 1)
            : stroke;
          return replaceWhiteboardLinearPoint(editable, dragState.pointIndex, point, event?.shiftKey ?? false);
        }));
      }
    }
    if (event?.type !== 'pointercancel' && dragState?.kind === 'rotate-selection') {
      if (dragState.originalElementsById.size > 0) {
        setElements((current) => rotateSelectionElements(
          current,
          dragState.originalElementsById,
          dragState.center,
          finalRotationAngle,
          spatialIndex.allElements === current ? spatialIndex.elementOrder : null,
        ));
      }
      if (dragState.originalStrokesById.size > 0) {
        setStrokes((current) => rotateSelectionStrokes(
          current,
          dragState.originalStrokesById,
          dragState.center,
          finalRotationAngle,
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
    cancelPendingLinearPoint, cancelPendingSelectionRotation, elements, finishEraserGesture, flushResizeDrags, getBoardPoint,
    getDraftStroke, onAutoDrawStrokeCommit, prepareMoveCommit, prepareResizeCommit, pushHistory, setDragState, setElements, setSelectedElementIds,
    setSelectedStrokeIds, setStrokes, setTool, strokeIdRef, strokes,
    spatialIndex,
    viewportZoom,
  ]);
}
