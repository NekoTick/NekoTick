import { useCallback, useEffect, useRef } from 'react';

interface PointerPoint {
  clientX: number;
  clientY: number;
}

export function useFramePointerUpdate(
  onUpdate: (clientX: number, clientY: number) => void,
) {
  const frameRef = useRef<number | null>(null);
  const pendingPointRef = useRef<PointerPoint | null>(null);
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  const applyPendingUpdate = useCallback(() => {
    frameRef.current = null;
    const point = pendingPointRef.current;
    pendingPointRef.current = null;
    if (point) onUpdateRef.current(point.clientX, point.clientY);
  }, []);

  const flushPointerUpdate = useCallback(() => {
    if (frameRef.current !== null) {
      window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    applyPendingUpdate();
  }, [applyPendingUpdate]);

  const schedulePointerUpdate = useCallback((clientX: number, clientY: number) => {
    pendingPointRef.current = { clientX, clientY };
    if (frameRef.current !== null) return;
    frameRef.current = window.requestAnimationFrame(applyPendingUpdate);
  }, [applyPendingUpdate]);

  const updatePointerNow = useCallback((clientX: number, clientY: number) => {
    if (frameRef.current !== null) {
      window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    pendingPointRef.current = null;
    onUpdateRef.current(clientX, clientY);
  }, []);

  useEffect(() => () => {
    if (frameRef.current !== null) {
      window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    pendingPointRef.current = null;
  }, []);

  return { flushPointerUpdate, schedulePointerUpdate, updatePointerNow };
}
