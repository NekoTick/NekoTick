import { useCallback, useEffect, useRef } from 'react';

interface WindowDragOrigin {
  x: number;
  y: number;
}

interface BeginWindowDragOptions {
  onReleaseWithoutDrag?: () => void;
}

interface UseWindowDragGestureOptions {
  threshold?: number;
  errorLabel?: string;
}

const DEFAULT_WINDOW_DRAG_THRESHOLD = 10;

export function useWindowDragGesture({
  threshold = DEFAULT_WINDOW_DRAG_THRESHOLD,
  errorLabel: _errorLabel,
}: UseWindowDragGestureOptions = {}) {
  const dragTrackingRef = useRef(false);
  const windowDraggingRef = useRef(false);
  const dragStartRef = useRef<WindowDragOrigin>({ x: 0, y: 0 });
  const dragCleanupRef = useRef<(() => void) | null>(null);

  const stopWindowDragTracking = useCallback(() => {
    dragCleanupRef.current?.();
    dragCleanupRef.current = null;
    dragTrackingRef.current = false;
    windowDraggingRef.current = false;
  }, []);

  const beginWindowDragTracking = useCallback((
    origin: WindowDragOrigin,
    options?: BeginWindowDragOptions
  ) => {
    stopWindowDragTracking();

    dragTrackingRef.current = true;
    dragStartRef.current = origin;

    const cleanupListeners = () => {
      window.removeEventListener('mousemove', handleWindowMouseMove);
      window.removeEventListener('mouseup', handleWindowMouseUp);
      window.removeEventListener('blur', handleWindowBlur);
      if (dragCleanupRef.current === cleanupListeners) {
        dragCleanupRef.current = null;
      }
    };

    const handleWindowMouseMove = (moveEvent: MouseEvent) => {
      if (!dragTrackingRef.current) {
        return;
      }
      if ((moveEvent.buttons & 1) === 0) {
        stopWindowDragTracking();
        return;
      }

      const dx = moveEvent.clientX - dragStartRef.current.x;
      const dy = moveEvent.clientY - dragStartRef.current.y;

      if (Math.abs(dx) > threshold || Math.abs(dy) > threshold) {
        windowDraggingRef.current = true;
      }
    };

    const handleWindowMouseUp = () => {
      const releasedWithoutDrag = dragTrackingRef.current && !windowDraggingRef.current;
      cleanupListeners();
      stopWindowDragTracking();
      if (releasedWithoutDrag) {
        options?.onReleaseWithoutDrag?.();
      }
    };

    const handleWindowBlur = () => stopWindowDragTracking();

    dragCleanupRef.current = cleanupListeners;
    window.addEventListener('mousemove', handleWindowMouseMove);
    window.addEventListener('mouseup', handleWindowMouseUp);
    window.addEventListener('blur', handleWindowBlur);
  }, [stopWindowDragTracking, threshold]);

  const isWindowDragActive = useCallback(() => {
    return dragTrackingRef.current || windowDraggingRef.current;
  }, []);

  useEffect(() => {
    return stopWindowDragTracking;
  }, [stopWindowDragTracking]);

  return {
    beginWindowDragTracking,
    isWindowDragActive,
    stopWindowDragTracking,
  };
}
