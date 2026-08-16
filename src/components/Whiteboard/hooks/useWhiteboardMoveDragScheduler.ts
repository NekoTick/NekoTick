import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import { isWhiteboardMoveDragState, type WhiteboardDragState } from '@/components/Whiteboard/model/interaction/whiteboardInteractions';
import type { WhiteboardPoint } from '@/components/Whiteboard/model/core/whiteboardModel';

const LASSO_POINT_SPACING_SCREEN_PX = 6;
const LASSO_MAX_POINTS = 420;

export function useWhiteboardMoveDragScheduler(
  setDragState: Dispatch<SetStateAction<WhiteboardDragState | null>>,
) {
  const frameRef = useRef<number | null>(null);
  const pendingPointRef = useRef<WhiteboardPoint | null>(null);

  const flush = useCallback(() => {
    frameRef.current = null;
    const point = pendingPointRef.current;
    pendingPointRef.current = null;
    if (!point) return;
    setDragState((current) => (isWhiteboardMoveDragState(current) ? { ...current, currentPoint: point } : current));
  }, [setDragState]);

  const scheduleMoveDragPoint = useCallback((point: WhiteboardPoint) => {
    pendingPointRef.current = point;
    if (frameRef.current === null) frameRef.current = window.requestAnimationFrame(flush);
  }, [flush]);

  useEffect(() => () => {
    if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
  }, []);

  return scheduleMoveDragPoint;
}

export function useWhiteboardLassoDragScheduler(
  setDragState: Dispatch<SetStateAction<WhiteboardDragState | null>>,
) {
  const frameRef = useRef<number | null>(null);
  const pendingPointRef = useRef<{ point: WhiteboardPoint; zoom: number } | null>(null);

  const flush = useCallback(() => {
    frameRef.current = null;
    const pending = pendingPointRef.current;
    pendingPointRef.current = null;
    if (!pending) return;
    setDragState((current) => current?.kind === 'lasso'
      ? { ...current, points: appendLassoPoint(current.points, pending.point, pending.zoom) }
      : current);
  }, [setDragState]);

  const scheduleLassoPoint = useCallback((point: WhiteboardPoint, zoom: number) => {
    pendingPointRef.current = { point, zoom };
    if (frameRef.current === null) frameRef.current = window.requestAnimationFrame(flush);
  }, [flush]);

  useEffect(() => () => {
    if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
  }, []);

  return scheduleLassoPoint;
}

function appendLassoPoint(points: WhiteboardPoint[], point: WhiteboardPoint, zoom: number): WhiteboardPoint[] {
  const lastPoint = points[points.length - 1];
  const minDistance = LASSO_POINT_SPACING_SCREEN_PX / Math.max(zoom, 0.1);
  if (lastPoint && Math.hypot(point.x - lastPoint.x, point.y - lastPoint.y) < minDistance) return points;
  if (points.length >= LASSO_MAX_POINTS) return [...points.slice(0, -1), point];
  return [...points, point];
}
