import { useCallback, useEffect, useRef, useState } from 'react';
import type { WhiteboardPoint } from '@/components/Whiteboard/model/core/whiteboardModel';

export function useWhiteboardBrushCursor() {
  const [brushCursorPoint, setBrushCursorPointState] = useState<WhiteboardPoint | null>(null);
  const frameRef = useRef<number | null>(null);
  const pendingPointRef = useRef<WhiteboardPoint | null>(null);

  const publishBrushCursorPoint = useCallback(() => {
    frameRef.current = null;
    setBrushCursorPointState(pendingPointRef.current);
  }, []);

  const setBrushCursorPoint = useCallback((point: WhiteboardPoint | null) => {
    pendingPointRef.current = point;
    if (point === null) {
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      setBrushCursorPointState(null);
      return;
    }
    if (frameRef.current === null) frameRef.current = window.requestAnimationFrame(publishBrushCursorPoint);
  }, [publishBrushCursorPoint]);

  useEffect(() => () => {
    if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
  }, []);

  return { brushCursorPoint, setBrushCursorPoint };
}
