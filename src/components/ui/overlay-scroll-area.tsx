import { forwardRef, useCallback, useEffect, useRef, useState, type HTMLAttributes, type ReactNode, type WheelEvent as ReactWheelEvent } from 'react';
import { cn } from '@/lib/utils';
import { normalizeWheelDelta } from '@/lib/scroll/wheelScroll';
import { OverlayScrollbar } from './OverlayScrollbar';
import {
  SCROLL_EPSILON_PX,
  clamp,
  getScrollMetrics,
  scrollbarVariantClasses,
  type ScrollMetrics,
  type ScrollbarVariant,
} from './overlayScrollAreaUtils';
import {
  useCancelOverlayScrollbarMetricsFrame,
  useOverlayScrollInteraction,
  useOverlayScrollbarDrag,
} from './overlayScrollAreaHooks';

interface OverlayScrollAreaProps extends Omit<HTMLAttributes<HTMLDivElement>, 'className' | 'children'> {
  children?: ReactNode;
  className?: string;
  viewportClassName?: string;
  draggingBodyClassName?: string;
  scrollbarInsetRight?: number;
  scrollbarVariant?: ScrollbarVariant;
}

export const OverlayScrollArea = forwardRef<HTMLDivElement, OverlayScrollAreaProps>(function OverlayScrollArea({
  children,
  className,
  viewportClassName,
  draggingBodyClassName,
  scrollbarInsetRight = 0,
  scrollbarVariant = 'default',
  onScroll,
  onMouseEnter,
  onMouseLeave,
  ...props
}, forwardedRef) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const thumbRef = useRef<HTMLDivElement | null>(null);
  const metricsFrameRef = useRef<number | null>(null);
  const pendingMetricsForceRenderRef = useRef(false);
  const metricsRef = useRef<ScrollMetrics>({
    canScroll: false,
    viewportHeight: 0,
    scrollHeight: 0,
    scrollTop: 0,
    thumbHeight: 0,
    thumbOffset: 0,
  });

  const [metrics, setMetrics] = useState(metricsRef.current);
  const [isHovered, setIsHovered] = useState(false);
  const [isScrollbarHovered, setIsScrollbarHovered] = useState(false);
  const scrollbarClasses = scrollbarVariantClasses[scrollbarVariant];

  const updateThumbStyle = useCallback((nextMetrics: ScrollMetrics) => {
    const thumb = thumbRef.current;
    if (!thumb) {
      return;
    }

    thumb.style.height = `${nextMetrics.thumbHeight}px`;
    thumb.style.transform = `translateY(${nextMetrics.thumbOffset}px)`;
  }, []);

  const setViewportRef = useCallback((node: HTMLDivElement | null) => {
    viewportRef.current = node;
    if (typeof forwardedRef === 'function') {
      forwardedRef(node);
      return;
    }
    if (forwardedRef) {
      forwardedRef.current = node;
    }
  }, [forwardedRef]);

  const updateMetrics = useCallback((options: { forceRenderPosition?: boolean } = {}) => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }

    const nextMetrics = getScrollMetrics(viewport);
    metricsRef.current = nextMetrics;
    updateThumbStyle(nextMetrics);
    setMetrics((previous) => {
      if (
        previous.canScroll === nextMetrics.canScroll &&
        previous.viewportHeight === nextMetrics.viewportHeight &&
        previous.scrollHeight === nextMetrics.scrollHeight &&
        previous.thumbHeight === nextMetrics.thumbHeight &&
        (
          !options.forceRenderPosition ||
          (
            previous.scrollTop === nextMetrics.scrollTop &&
            previous.thumbOffset === nextMetrics.thumbOffset
          )
        )
      ) {
        return previous;
      }
      return nextMetrics;
    });
  }, [updateThumbStyle]);

  const scheduleMetricsUpdate = useCallback((options: { forceRenderPosition?: boolean } = {}) => {
    pendingMetricsForceRenderRef.current ||= Boolean(options.forceRenderPosition);
    if (metricsFrameRef.current !== null) {
      return;
    }

    metricsFrameRef.current = window.requestAnimationFrame(() => {
      metricsFrameRef.current = null;
      const forceRenderPosition = pendingMetricsForceRenderRef.current;
      pendingMetricsForceRenderRef.current = false;
      updateMetrics({ forceRenderPosition });
    });
  }, [updateMetrics]);

  useCancelOverlayScrollbarMetricsFrame(metricsFrameRef, pendingMetricsForceRenderRef);
  const markScrollInteraction = useOverlayScrollInteraction(viewportRef);
  const handleDragEnd = useCallback(() => setIsScrollbarHovered(false), []);
  const { dragStateRef, handleThumbPointerDown, isDragging } = useOverlayScrollbarDrag({
    draggingBodyClassName,
    markScrollInteraction,
    metricsRef,
    onDragEnd: handleDragEnd,
    scheduleMetricsUpdate,
    setMetrics,
    updateMetrics,
    updateThumbStyle,
    viewportRef,
  });

  useEffect(() => {
    scheduleMetricsUpdate();
  }, [children, scheduleMetricsUpdate]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }

    const resizeObserver = new ResizeObserver(() => {
      scheduleMetricsUpdate();
    });

    resizeObserver.observe(viewport);
    Array.from(viewport.children).forEach((child) => {
      if (child instanceof HTMLElement) {
        resizeObserver.observe(child);
      }
    });

    return () => {
      resizeObserver.disconnect();
    };
  }, [children, scheduleMetricsUpdate]);

  const handleWrapperWheel = useCallback((event: ReactWheelEvent<HTMLDivElement>) => {
    const viewport = viewportRef.current;
    const target = event.target;
    if (
      !viewport ||
      event.defaultPrevented ||
      event.ctrlKey ||
      event.metaKey ||
      event.deltaY === 0 ||
      (target instanceof Node && viewport.contains(target))
    ) {
      return;
    }

    const maxScrollTop = Math.max(viewport.scrollHeight - viewport.clientHeight, 0);
    if (maxScrollTop <= 0) {
      return;
    }

    const deltaY = normalizeWheelDelta(event.deltaY, event.deltaMode, viewport.clientHeight);
    const nextScrollTop = clamp(viewport.scrollTop + deltaY, 0, maxScrollTop);
    if (Math.abs(nextScrollTop - viewport.scrollTop) < SCROLL_EPSILON_PX) {
      return;
    }

    event.preventDefault();
    viewport.scrollTop = nextScrollTop;
    markScrollInteraction();
    scheduleMetricsUpdate();
  }, [markScrollInteraction, scheduleMetricsUpdate]);

  const isVisible = metrics.canScroll && (isHovered || isDragging);
  const isScrollbarExpanded = isScrollbarHovered || isDragging;

  return (
    <div
      className={cn('relative flex-1 min-h-0 overflow-hidden', className)}
      onMouseEnter={(event) => {
        updateMetrics({ forceRenderPosition: true });
        setIsHovered(true);
        onMouseEnter?.(event);
      }}
      onMouseLeave={(event) => {
        updateMetrics({ forceRenderPosition: true });
        setIsHovered(false);
        setIsScrollbarHovered(false);
        onMouseLeave?.(event);
      }}
      onWheel={handleWrapperWheel}
    >
      <div
        ref={setViewportRef}
        className={cn(
          'scrollbar-hidden h-full min-h-0 overflow-y-auto overflow-x-hidden',
          viewportClassName,
        )}
        onScroll={(event) => {
          markScrollInteraction();
          if (dragStateRef.current) {
            onScroll?.(event);
            return;
          }
          if (metricsRef.current.canScroll) {
            scheduleMetricsUpdate();
          } else {
            updateMetrics();
          }
          onScroll?.(event);
        }}
        {...props}
      >
        {children}
      </div>

      {metrics.canScroll ? (
        <OverlayScrollbar
          metrics={metrics}
          isVisible={isVisible}
          isScrollbarExpanded={isScrollbarExpanded}
          isDragging={isDragging}
          scrollbarInsetRight={scrollbarInsetRight}
          scrollbarClasses={scrollbarClasses}
          thumbRef={thumbRef}
          onPointerEnter={() => {
            updateMetrics({ forceRenderPosition: true });
            setIsScrollbarHovered(true);
          }}
          onPointerLeave={() => {
            updateMetrics({ forceRenderPosition: true });
            setIsScrollbarHovered(false);
          }}
          onThumbPointerDown={handleThumbPointerDown}
        />
      ) : null}
    </div>
  );
});
