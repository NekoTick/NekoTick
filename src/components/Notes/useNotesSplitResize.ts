import {
  useCallback,
  useEffect,
  useRef,
  type Dispatch,
  type SetStateAction,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { requestNativeCaretOverlayRefresh } from '@/hooks/useNativeCaretOverlay';
import { useUIStore } from '@/stores/uiSlice';
import { themeDomStyleTokens, themeRenderingTokens } from '@/styles/themeTokens';
import {
  resizeNotesSplitPaneTree,
  type NotesSplitOrientation,
  type NotesSplitPaneTree,
} from './features/Split/notesSplitLayout';
import type { ActiveNotesSplitResize } from './notesViewSplitTypes';

export function useNotesSplitResize(args: {
  setSplitPaneTree: Dispatch<SetStateAction<NotesSplitPaneTree>>;
}) {
  const { setSplitPaneTree } = args;
  const setLayoutPanelDragging = useUIStore((s) => s.setLayoutPanelDragging);
  const activeSplitResizeRef = useRef<ActiveNotesSplitResize | null>(null);
  const resizeFrameRef = useRef<number | null>(null);
  const resizeFrameScheduledRef = useRef(false);
  const pendingResizePointRef = useRef<{ x: number; y: number } | null>(null);

  const updateSplitResizeRatio = useCallback((clientX: number, clientY: number) => {
    const resize = activeSplitResizeRef.current;
    if (!resize) {
      return;
    }

    const rect = resize.container.getBoundingClientRect();
    const size = resize.orientation === 'horizontal' ? rect.width : rect.height;
    if (size <= 0) {
      return;
    }

    const offset = resize.orientation === 'horizontal'
      ? clientX - rect.left
      : clientY - rect.top;
    setSplitPaneTree((currentTree) => resizeNotesSplitPaneTree(currentTree, resize.splitId, offset / size));
  }, [setSplitPaneTree]);

  const handleSplitResizePointerMove = useCallback((event: PointerEvent) => {
    if (!activeSplitResizeRef.current) {
      return;
    }

    event.preventDefault();
    pendingResizePointRef.current = { x: event.clientX, y: event.clientY };
    if (resizeFrameScheduledRef.current) return;

    resizeFrameScheduledRef.current = true;
    const frameId = requestAnimationFrame(() => {
      resizeFrameRef.current = null;
      resizeFrameScheduledRef.current = false;
      const point = pendingResizePointRef.current;
      pendingResizePointRef.current = null;
      if (point) {
        updateSplitResizeRatio(point.x, point.y);
      }
    });
    if (resizeFrameScheduledRef.current) {
      resizeFrameRef.current = frameId;
    }
  }, [updateSplitResizeRatio]);

  const stopSplitResize = useCallback((event?: PointerEvent) => {
    const resize = activeSplitResizeRef.current;
    if (!resize) {
      return;
    }

    const pendingPoint = pendingResizePointRef.current;
    if (resizeFrameRef.current !== null) {
      cancelAnimationFrame(resizeFrameRef.current);
    }
    resizeFrameRef.current = null;
    resizeFrameScheduledRef.current = false;
    pendingResizePointRef.current = null;
    if (pendingPoint && (event?.type === 'pointerup' || event?.type === 'pointercancel')) {
      const finalPoint = event.type === 'pointerup'
        ? { x: event.clientX, y: event.clientY }
        : pendingPoint;
      updateSplitResizeRatio(finalPoint.x, finalPoint.y);
    }

    document.removeEventListener('pointermove', handleSplitResizePointerMove, true);
    document.removeEventListener('pointerup', stopSplitResize, true);
    document.removeEventListener('pointercancel', stopSplitResize, true);
    document.body.style.cursor = resize.previousBodyCursor;
    document.body.style.userSelect = resize.previousBodyUserSelect;
    activeSplitResizeRef.current = null;
    setLayoutPanelDragging(false);
    requestNativeCaretOverlayRefresh();
  }, [handleSplitResizePointerMove, setLayoutPanelDragging, updateSplitResizeRatio]);

  const beginSplitResize = useCallback((
    splitId: string,
    orientation: NotesSplitOrientation,
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    const container = event.currentTarget.parentElement;
    if (!container) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    if (activeSplitResizeRef.current) {
      stopSplitResize();
    }

    activeSplitResizeRef.current = {
      splitId,
      orientation,
      container,
      previousBodyCursor: document.body.style.cursor,
      previousBodyUserSelect: document.body.style.userSelect,
    };
    document.body.style.cursor = orientation === 'horizontal'
      ? themeDomStyleTokens.cursorColumnResize
      : themeDomStyleTokens.cursorRowResize;
    document.body.style.userSelect = themeRenderingTokens.userSelectNone;
    setLayoutPanelDragging(true);
    updateSplitResizeRatio(event.clientX, event.clientY);
    document.addEventListener('pointermove', handleSplitResizePointerMove, true);
    document.addEventListener('pointerup', stopSplitResize, true);
    document.addEventListener('pointercancel', stopSplitResize, true);
  }, [handleSplitResizePointerMove, setLayoutPanelDragging, stopSplitResize, updateSplitResizeRatio]);

  useEffect(() => {
    return () => {
      stopSplitResize();
    };
  }, [stopSplitResize]);

  return { activeSplitResizeRef, beginSplitResize, stopSplitResize };
}
