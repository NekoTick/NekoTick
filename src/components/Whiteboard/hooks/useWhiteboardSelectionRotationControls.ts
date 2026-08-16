import { useCallback, useEffect, useRef, type Dispatch, type MutableRefObject, type PointerEvent, type SetStateAction } from 'react';
import { isWhiteboardFullSelection } from '@/components/Whiteboard/model/core/whiteboardCollection';
import type { WhiteboardEraserSpatialIndex } from '@/components/Whiteboard/model/interaction/whiteboardEraser';
import { getWhiteboardSelectedItemMap } from '@/components/Whiteboard/model/interaction/whiteboardIndexedSelectionMap';
import type { WhiteboardDragState } from '@/components/Whiteboard/model/interaction/whiteboardInteractions';
import type { WhiteboardElement, WhiteboardPoint, WhiteboardStroke, WhiteboardTool } from '@/components/Whiteboard/model/core/whiteboardModel';

interface WhiteboardSelectionRotationControlsOptions {
  elements: WhiteboardElement[];
  getBoardPoint: (clientX: number, clientY: number) => WhiteboardPoint;
  interactionLocked?: boolean;
  pushHistory: () => void;
  selectedElementIds: string[];
  selectedStrokeIds: string[];
  setDragState: Dispatch<SetStateAction<WhiteboardDragState | null>>;
  spacePressedRef: MutableRefObject<boolean>;
  spatialIndex: WhiteboardEraserSpatialIndex;
  strokes: WhiteboardStroke[];
  tool: WhiteboardTool;
}

export function useWhiteboardSelectionRotationControls({
  elements,
  getBoardPoint,
  interactionLocked = false,
  pushHistory,
  selectedElementIds,
  selectedStrokeIds,
  setDragState,
  spacePressedRef,
  spatialIndex,
  strokes,
  tool,
}: WhiteboardSelectionRotationControlsOptions) {
  const frameRef = useRef<number | null>(null);
  const pendingRotationRef = useRef<{
    point: WhiteboardPoint;
    state: Extract<WhiteboardDragState, { kind: 'rotate-selection' }>;
  } | null>(null);

  const handleSelectionRotationPointerDown = useCallback((
    event: PointerEvent<SVGCircleElement>, center: WhiteboardPoint,
  ) => {
    if (interactionLocked || tool !== 'select' || event.button !== 0 || spacePressedRef.current) return;
    const originalElementsById = getWhiteboardSelectedItemMap(
      elements,
      selectedElementIds,
      spatialIndex.allElements === elements ? spatialIndex.elementOrder : null,
      isWhiteboardFullSelection(selectedElementIds, elements),
    );
    const originalStrokesById = getWhiteboardSelectedItemMap(
      strokes,
      selectedStrokeIds,
      spatialIndex.allStrokes === strokes ? spatialIndex.strokeOrder : null,
      isWhiteboardFullSelection(selectedStrokeIds, strokes),
    );
    if (originalElementsById.size === 0 && originalStrokesById.size === 0) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = getBoardPoint(event.clientX, event.clientY);
    pushHistory();
    setDragState({
      center,
      currentAngle: 0,
      kind: 'rotate-selection',
      originalElementsById,
      originalStrokesById,
      startAngle: Math.atan2(point.y - center.y, point.x - center.x),
    });
  }, [elements, getBoardPoint, interactionLocked, pushHistory, selectedElementIds, selectedStrokeIds, setDragState, spacePressedRef, spatialIndex, strokes, tool]);

  const publishSelectionRotation = useCallback(() => {
    frameRef.current = null;
    const pending = pendingRotationRef.current;
    pendingRotationRef.current = null;
    if (!pending) return;
    const { point, state } = pending;
    const currentAngle = Math.atan2(point.y - state.center.y, point.x - state.center.x) - state.startAngle;
    setDragState((current) => current === state ? { ...current, currentAngle } : current);
  }, [setDragState]);

  const updateSelectionRotation = useCallback((
    state: Extract<WhiteboardDragState, { kind: 'rotate-selection' }>,
    point: WhiteboardPoint,
  ) => {
    pendingRotationRef.current = { point, state };
    if (frameRef.current === null) frameRef.current = window.requestAnimationFrame(publishSelectionRotation);
  }, [publishSelectionRotation]);

  const cancelPendingSelectionRotation = useCallback(() => {
    if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    pendingRotationRef.current = null;
  }, []);

  useEffect(() => cancelPendingSelectionRotation, [cancelPendingSelectionRotation]);

  return {
    cancelPendingSelectionRotation,
    handleSelectionRotationPointerDown,
    updateSelectionRotation,
  };
}
