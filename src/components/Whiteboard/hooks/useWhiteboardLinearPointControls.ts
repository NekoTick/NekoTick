import { useCallback, useEffect, useRef, type Dispatch, type PointerEvent, type SetStateAction } from 'react';
import type { WhiteboardDragState } from '@/components/Whiteboard/model/interaction/whiteboardInteractions';
import { insertWhiteboardLinearMidpoint, replaceWhiteboardLinearPoint } from '@/components/Whiteboard/model/geometry/whiteboardLinear';
import { themeWhiteboardTokens } from '@/styles/themeTokens';
import type { WhiteboardPoint, WhiteboardStroke, WhiteboardTool } from '@/components/Whiteboard/model/core/whiteboardModel';

interface WhiteboardLinearPointControlsOptions {
  getBoardPoint: (clientX: number, clientY: number) => WhiteboardPoint;
  interactionLocked?: boolean;
  pushHistory: () => void;
  setDragState: Dispatch<SetStateAction<WhiteboardDragState | null>>;
  setStrokes: Dispatch<SetStateAction<WhiteboardStroke[]>>;
  strokes: WhiteboardStroke[];
  tool: WhiteboardTool;
  viewportZoom: number;
}

export function useWhiteboardLinearPointControls({
  getBoardPoint,
  interactionLocked = false,
  pushHistory,
  setDragState,
  setStrokes,
  strokes,
  tool,
  viewportZoom,
}: WhiteboardLinearPointControlsOptions) {
  const frameRef = useRef<number | null>(null);
  const pendingPointRef = useRef<{
    angleLocked: boolean;
    point: WhiteboardPoint;
    state: Extract<WhiteboardDragState, { kind: 'edit-linear-point' }>;
  } | null>(null);

  const handleLinearPointPointerDown = useCallback((
    event: PointerEvent<SVGCircleElement>,
    strokeId: string,
    pointIndex: number,
    midpoint: boolean,
  ) => {
    if (interactionLocked || tool !== 'select' || event.button !== 0) return;
    const stroke = strokes.find((item) => item.id === strokeId);
    if (!stroke) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragState({
      kind: 'edit-linear-point',
      midpoint,
      originalStroke: stroke,
      pointIndex: midpoint ? pointIndex + 1 : pointIndex,
      started: false,
      startPoint: getBoardPoint(event.clientX, event.clientY),
      strokeId,
    });
  }, [getBoardPoint, interactionLocked, setDragState, strokes, tool]);

  const applyLinearPoint = useCallback((
    state: Extract<WhiteboardDragState, { kind: 'edit-linear-point' }>, point: WhiteboardPoint, angleLocked: boolean,
  ) => {
    if (!state.started && Math.hypot(point.x - state.startPoint.x, point.y - state.startPoint.y) * viewportZoom < themeWhiteboardTokens.linearPointDragThresholdPx) return;
    if (!state.started) pushHistory();
    setStrokes((current) => current.map((stroke) => {
      if (stroke.id !== state.strokeId) return stroke;
      const editable = state.midpoint && !state.started
        ? insertWhiteboardLinearMidpoint(stroke, state.pointIndex - 1)
        : stroke;
      return replaceWhiteboardLinearPoint(editable, state.pointIndex, point, angleLocked);
    }));
    if (!state.started) {
      setDragState((current) => current?.kind === 'edit-linear-point' && current.strokeId === state.strokeId
        ? { ...current, started: true }
        : current);
    }
  }, [pushHistory, setDragState, setStrokes, viewportZoom]);

  const flushLinearPoint = useCallback(() => {
    frameRef.current = null;
    const pending = pendingPointRef.current;
    pendingPointRef.current = null;
    if (pending) applyLinearPoint(pending.state, pending.point, pending.angleLocked);
  }, [applyLinearPoint]);

  const updateLinearPoint = useCallback((
    state: Extract<WhiteboardDragState, { kind: 'edit-linear-point' }>, point: WhiteboardPoint, angleLocked: boolean,
  ) => {
    if (!state.started) {
      applyLinearPoint(state, point, angleLocked);
      return;
    }
    pendingPointRef.current = { angleLocked, point, state };
    if (frameRef.current === null) frameRef.current = window.requestAnimationFrame(flushLinearPoint);
  }, [applyLinearPoint, flushLinearPoint]);

  const cancelPendingLinearPoint = useCallback(() => {
    if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    pendingPointRef.current = null;
  }, []);

  useEffect(() => () => {
    if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
  }, []);

  return { cancelPendingLinearPoint, handleLinearPointPointerDown, updateLinearPoint };
}
