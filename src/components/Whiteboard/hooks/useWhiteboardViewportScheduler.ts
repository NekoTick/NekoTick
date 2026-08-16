import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import type { WhiteboardViewport } from '@/components/Whiteboard/model/core/whiteboardModel';

type ViewportUpdate = SetStateAction<WhiteboardViewport>;

export function applyWhiteboardViewportUpdates(
  viewport: WhiteboardViewport,
  updates: ViewportUpdate[],
): WhiteboardViewport {
  let current = viewport;
  for (const update of updates) {
    current = typeof update === 'function' ? update(current) : update;
  }
  return current;
}

export function useWhiteboardViewportScheduler(
  setViewport: Dispatch<SetStateAction<WhiteboardViewport>>,
) {
  const frameRef = useRef<number | null>(null);
  const pendingUpdatesRef = useRef<ViewportUpdate[]>([]);

  const flush = useCallback(() => {
    frameRef.current = null;
    const updates = pendingUpdatesRef.current;
    pendingUpdatesRef.current = [];
    if (updates.length === 0) return;
    setViewport((current) => applyWhiteboardViewportUpdates(current, updates));
  }, [setViewport]);

  const scheduleViewport = useCallback((update: ViewportUpdate) => {
    pendingUpdatesRef.current.push(update);
    if (frameRef.current === null) frameRef.current = window.requestAnimationFrame(flush);
  }, [flush]);

  useEffect(() => () => {
    if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
  }, []);

  return scheduleViewport;
}
