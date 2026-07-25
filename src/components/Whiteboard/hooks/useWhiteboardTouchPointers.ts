import { useCallback, useRef } from 'react';
import type { WhiteboardPoint } from '../model/whiteboardModel';

interface WhiteboardPinchMetrics {
  center: WhiteboardPoint;
  distance: number;
}

export function useWhiteboardTouchPointers(getViewportPoint: (clientX: number, clientY: number) => WhiteboardPoint) {
  const pointersRef = useRef(new Map<number, WhiteboardPoint>());

  const addPointer = useCallback((pointerId: number, clientX: number, clientY: number) => {
    const point = getViewportPoint(clientX, clientY);
    pointersRef.current.set(pointerId, point);
    return point;
  }, [getViewportPoint]);

  const updatePointer = useCallback((pointerId: number, clientX: number, clientY: number) => {
    if (!pointersRef.current.has(pointerId)) return null;
    const point = getViewportPoint(clientX, clientY);
    pointersRef.current.set(pointerId, point);
    return point;
  }, [getViewportPoint]);

  const deletePointer = useCallback((pointerId: number) => {
    pointersRef.current.delete(pointerId);
  }, []);

  const getPinchMetrics = useCallback((): WhiteboardPinchMetrics | null => {
    const [first, second] = Array.from(pointersRef.current.values());
    if (!first || !second) return null;
    return {
      center: {
        x: (first.x + second.x) / 2,
        y: (first.y + second.y) / 2,
      },
      distance: Math.hypot(first.x - second.x, first.y - second.y),
    };
  }, []);

  return { addPointer, deletePointer, getPinchMetrics, updatePointer };
}
