import {
  useCallback,
  useEffect,
  useRef,
  type MouseEvent,
} from 'react';
import { focusNoteInitialPosition } from '../utils/focusNoteInitialPosition';

export function useMarkdownEditorFocus({
  active,
  hasActiveNote,
}: {
  active: boolean;
  hasActiveNote: boolean;
}) {
  const previousActiveRef = useRef(active);

  useEffect(() => {
    const wasActive = previousActiveRef.current;
    previousActiveRef.current = active;
    if (!hasActiveNote || wasActive) return;

    let cancelled = false;
    let nextFrameId: number | null = null;
    const frameId = window.requestAnimationFrame(() => {
      nextFrameId = window.requestAnimationFrame(() => {
        if (!cancelled) {
          focusNoteInitialPosition();
        }
      });
    });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frameId);
      if (nextFrameId !== null) {
        window.cancelAnimationFrame(nextFrameId);
      }
    };
  }, [active, hasActiveNote]);

  return useCallback((event: MouseEvent<HTMLDivElement>) => {
    if (hasActiveNote && event.target === event.currentTarget) {
      focusNoteInitialPosition(event.currentTarget);
    }
  }, [hasActiveNote]);
}
