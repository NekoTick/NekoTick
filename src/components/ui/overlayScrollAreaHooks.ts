import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  type SetStateAction,
} from 'react';
import { themeUiFeedbackTokens } from '@/styles/themeTokens';
import {
  getDraggedScrollMetrics,
  type ScrollbarDragState,
  type ScrollMetrics,
} from './overlayScrollAreaUtils';
import { dispatchOverlayScrollIdle } from './overlayScrollAreaEvents';

type MetricsUpdateOptions = { forceRenderPosition?: boolean };

export function useOverlayScrollInteraction(
  viewportRef: RefObject<HTMLDivElement | null>,
) {
  const settleTimerRef = useRef<number | null>(null);
  const settleDeadlineRef = useRef(0);
  const interactingViewportRef = useRef<HTMLDivElement | null>(null);
  const settleInteraction = useCallback(function settleInteraction() {
    settleTimerRef.current = null;
    const remainingMs = settleDeadlineRef.current - Date.now();
    if (remainingMs > 0) {
      settleTimerRef.current = window.setTimeout(settleInteraction, remainingMs);
      return;
    }

    settleDeadlineRef.current = 0;
    const viewport = interactingViewportRef.current;
    interactingViewportRef.current = null;
    if (!viewport || viewport.dataset.overlayScrollbarInteracting !== 'true') return;
    delete viewport.dataset.overlayScrollbarInteracting;
    dispatchOverlayScrollIdle();
  }, []);
  const markScrollInteraction = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    if (viewport.dataset.overlayScrollbarInteracting !== 'true') {
      viewport.dataset.overlayScrollbarInteracting = 'true';
    }
    interactingViewportRef.current = viewport;
    settleDeadlineRef.current = Date.now()
      + themeUiFeedbackTokens.overlayScrollInteractionSettleMs;
    if (settleTimerRef.current === null) {
      settleTimerRef.current = window.setTimeout(
        settleInteraction,
        themeUiFeedbackTokens.overlayScrollInteractionSettleMs,
      );
    }
  }, [settleInteraction, viewportRef]);

  useEffect(() => () => {
    if (settleTimerRef.current !== null) {
      window.clearTimeout(settleTimerRef.current);
      settleTimerRef.current = null;
    }
    settleDeadlineRef.current = 0;
    const viewport = interactingViewportRef.current;
    interactingViewportRef.current = null;
    if (!viewport || viewport.dataset.overlayScrollbarInteracting !== 'true') return;
    delete viewport.dataset.overlayScrollbarInteracting;
    dispatchOverlayScrollIdle();
  }, [viewportRef]);

  return markScrollInteraction;
}

export function useOverlayScrollbarDrag(args: {
  draggingBodyClassName: string | undefined;
  markScrollInteraction: () => void;
  metricsRef: RefObject<ScrollMetrics>;
  onDragEnd: () => void;
  scheduleMetricsUpdate: (options?: MetricsUpdateOptions) => void;
  setMetrics: Dispatch<SetStateAction<ScrollMetrics>>;
  updateMetrics: (options?: MetricsUpdateOptions) => void;
  updateThumbStyle: (metrics: ScrollMetrics) => void;
  viewportRef: RefObject<HTMLDivElement | null>;
}) {
  const {
    draggingBodyClassName,
    markScrollInteraction,
    metricsRef,
    onDragEnd,
    scheduleMetricsUpdate,
    setMetrics,
    updateMetrics,
    updateThumbStyle,
    viewportRef,
  } = args;
  const dragStateRef = useRef<ScrollbarDragState | null>(null);
  const dragFrameRef = useRef<number | null>(null);
  const pendingDragClientYRef = useRef<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const applyPendingDragPosition = useCallback(() => {
    dragFrameRef.current = null;
    const viewport = viewportRef.current;
    const dragState = dragStateRef.current;
    const clientY = pendingDragClientYRef.current;
    pendingDragClientYRef.current = null;
    if (!viewport || !dragState || clientY === null) return;

    const nextMetrics = getDraggedScrollMetrics(metricsRef.current, dragState, clientY);
    if (!nextMetrics) return;
    viewport.scrollTop = nextMetrics.scrollTop;
    metricsRef.current = nextMetrics;
    updateThumbStyle(nextMetrics);
  }, [metricsRef, updateThumbStyle, viewportRef]);

  const stopDragging = useCallback(() => {
    if (dragFrameRef.current !== null) {
      window.cancelAnimationFrame(dragFrameRef.current);
      dragFrameRef.current = null;
    }
    applyPendingDragPosition();
    dragStateRef.current = null;
    pendingDragClientYRef.current = null;
    setMetrics(metricsRef.current);
    scheduleMetricsUpdate({ forceRenderPosition: true });
    setIsDragging(false);
    onDragEnd();
  }, [applyPendingDragPosition, metricsRef, onDragEnd, scheduleMetricsUpdate, setMetrics]);

  const handleWindowPointerMove = useCallback((event: PointerEvent) => {
    if (!dragStateRef.current) return;
    pendingDragClientYRef.current = event.clientY;
    markScrollInteraction();
    if (dragFrameRef.current === null) {
      dragFrameRef.current = window.requestAnimationFrame(applyPendingDragPosition);
    }
  }, [applyPendingDragPosition, markScrollInteraction]);

  const handleThumbPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const viewport = viewportRef.current;
    if (!viewport || !metricsRef.current.canScroll) return;

    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    updateMetrics({ forceRenderPosition: true });
    dragStateRef.current = {
      pointerStartY: event.clientY,
      scrollTopStart: viewport.scrollTop,
    };
    markScrollInteraction();
    setIsDragging(true);
  }, [markScrollInteraction, metricsRef, updateMetrics, viewportRef]);

  useOverlayScrollbarWindowDrag(isDragging, handleWindowPointerMove, stopDragging);
  useOverlayScrollbarDraggingClass(viewportRef, draggingBodyClassName, isDragging);
  useEffect(() => () => {
    if (dragFrameRef.current !== null) {
      window.cancelAnimationFrame(dragFrameRef.current);
    }
  }, []);

  return { dragStateRef, handleThumbPointerDown, isDragging };
}

export function useOverlayScrollbarWindowDrag(
  isDragging: boolean,
  handleWindowPointerMove: (event: PointerEvent) => void,
  stopDragging: () => void,
): void {
  useEffect(() => {
    if (!isDragging) {
      return;
    }

    window.addEventListener('pointermove', handleWindowPointerMove);
    window.addEventListener('pointerup', stopDragging);
    window.addEventListener('pointercancel', stopDragging);

    return () => {
      window.removeEventListener('pointermove', handleWindowPointerMove);
      window.removeEventListener('pointerup', stopDragging);
      window.removeEventListener('pointercancel', stopDragging);
    };
  }, [handleWindowPointerMove, isDragging, stopDragging]);
}

export function useCancelOverlayScrollbarMetricsFrame(
  metricsFrameRef: RefObject<number | null>,
  pendingMetricsForceRenderRef: RefObject<boolean>,
): void {
  useEffect(() => {
    return () => {
      if (metricsFrameRef.current !== null) {
        window.cancelAnimationFrame(metricsFrameRef.current);
        metricsFrameRef.current = null;
      }
      pendingMetricsForceRenderRef.current = false;
    };
  }, [metricsFrameRef, pendingMetricsForceRenderRef]);
}

export function useOverlayScrollbarDraggingClass(
  viewportRef: RefObject<HTMLDivElement | null>,
  draggingBodyClassName: string | undefined,
  isDragging: boolean,
): void {
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }

    if (isDragging) {
      viewport.dataset.overlayScrollbarDragging = 'true';
      if (draggingBodyClassName) {
        document.body.classList.add(draggingBodyClassName);
      }
      return;
    }

    delete viewport.dataset.overlayScrollbarDragging;
    if (draggingBodyClassName) {
      document.body.classList.remove(draggingBodyClassName);
    }

    return () => {
      delete viewport.dataset.overlayScrollbarDragging;
      if (draggingBodyClassName) {
        document.body.classList.remove(draggingBodyClassName);
      }
    };
  }, [draggingBodyClassName, isDragging, viewportRef]);
}
