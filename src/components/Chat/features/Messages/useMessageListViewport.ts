import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

const TAIL_ANCHOR_THRESHOLD = 2;
const STREAM_SCROLL_IDLE_MS = 180;

interface UseMessageListViewportOptions {
  active: boolean;
  containerRef: React.RefObject<HTMLDivElement | null>;
  isEmpty: boolean;
  isSessionActive: boolean;
  renderedMessageCount: number;
  useOverlayScrollbar: boolean;
}

export function useMessageListViewport({
  active,
  containerRef,
  isEmpty,
  isSessionActive,
  renderedMessageCount,
  useOverlayScrollbar,
}: UseMessageListViewportOptions) {
  const [viewportHeight, setViewportHeight] = useState(0);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);
  const [isScrollActive, setIsScrollActive] = useState(false);
  const [isTailDetached, setIsTailDetached] = useState(false);
  const viewportMetricsRafRef = useRef<number | null>(null);
  const scrollIdleTimeoutRef = useRef<number | null>(null);
  const scrollIdleDeadlineRef = useRef(0);
  const lastObservedScrollTopRef = useRef<number | null>(null);
  const programmaticScrollTopRef = useRef<number | null>(null);
  const isScrollActiveRef = useRef(isScrollActive);
  const isTailDetachedRef = useRef(isTailDetached);
  const activeRef = useRef(active);

  activeRef.current = active;
  isScrollActiveRef.current = isScrollActive;
  isTailDetachedRef.current = isTailDetached;

  const commitViewportMetrics = useCallback(() => {
    if (!activeRef.current) {
      return;
    }

    const viewport = containerRef.current;
    if (!viewport) {
      return;
    }

    if (viewport.clientHeight <= 0 || viewport.clientWidth <= 0) {
      return;
    }

    setViewportHeight((current) => (
      current === viewport.clientHeight ? current : viewport.clientHeight
    ));
    setViewportWidth((current) => (
      current === viewport.clientWidth ? current : viewport.clientWidth
    ));
    setScrollTop((current) => (
      current === viewport.scrollTop ? current : viewport.scrollTop
    ));
  }, [containerRef]);

  const scheduleViewportMetrics = useCallback(() => {
    if (viewportMetricsRafRef.current !== null) {
      return;
    }

    viewportMetricsRafRef.current = requestAnimationFrame(() => {
      viewportMetricsRafRef.current = null;
      commitViewportMetrics();
    });
  }, [commitViewportMetrics]);

  useLayoutEffect(() => {
    if (!active) {
      return;
    }

    commitViewportMetrics();
    const frameId = requestAnimationFrame(() => {
      commitViewportMetrics();
    });

    return () => {
      cancelAnimationFrame(frameId);
    };
  }, [active, commitViewportMetrics, renderedMessageCount, isEmpty]);

  useEffect(() => {
    if (!active) {
      return;
    }

    const viewport = containerRef.current;
    if (!viewport) {
      return;
    }

    const settleScrollActivity = () => {
      scrollIdleTimeoutRef.current = null;
      const remainingMs = scrollIdleDeadlineRef.current - Date.now();
      if (remainingMs > 0) {
        scrollIdleTimeoutRef.current = window.setTimeout(settleScrollActivity, remainingMs);
        return;
      }

      scrollIdleDeadlineRef.current = 0;
      isScrollActiveRef.current = false;
      setIsScrollActive(false);
    };

    const handleScroll = (event: Event) => {
      const currentScrollTop = viewport.scrollTop;
      const previousScrollTop = lastObservedScrollTopRef.current;
      lastObservedScrollTopRef.current = currentScrollTop;
      scheduleViewportMetrics();
      if (event.type !== 'scroll' || !isSessionActive) {
        if (event.type === 'chat-programmatic-scroll') {
          programmaticScrollTopRef.current = currentScrollTop;
        }
        return;
      }

      if (
        programmaticScrollTopRef.current !== null &&
        Math.abs(currentScrollTop - programmaticScrollTopRef.current) <= 1
      ) {
        programmaticScrollTopRef.current = null;
        return;
      }
      programmaticScrollTopRef.current = null;

      const userScrolledUp =
        previousScrollTop !== null && currentScrollTop < previousScrollTop - 1;
      const distanceToBottom =
        viewport.scrollHeight - (currentScrollTop + viewport.clientHeight);
      if (userScrolledUp && !isTailDetachedRef.current) {
        isTailDetachedRef.current = true;
        setIsTailDetached(true);
      } else if (distanceToBottom <= TAIL_ANCHOR_THRESHOLD && isTailDetachedRef.current) {
        isTailDetachedRef.current = false;
        setIsTailDetached(false);
      }

      if (!isScrollActiveRef.current) {
        isScrollActiveRef.current = true;
        setIsScrollActive(true);
      }
      scrollIdleDeadlineRef.current = Date.now() + STREAM_SCROLL_IDLE_MS;
      if (scrollIdleTimeoutRef.current === null) {
        scrollIdleTimeoutRef.current = window.setTimeout(
          settleScrollActivity,
          STREAM_SCROLL_IDLE_MS,
        );
      }
    };

    commitViewportMetrics();
    viewport.addEventListener('scroll', handleScroll, { passive: true });
    viewport.addEventListener('chat-programmatic-scroll', handleScroll);

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        scheduleViewportMetrics();
      });
      resizeObserver.observe(viewport);
    }

    return () => {
      viewport.removeEventListener('scroll', handleScroll);
      viewport.removeEventListener('chat-programmatic-scroll', handleScroll);
      resizeObserver?.disconnect();
      if (viewportMetricsRafRef.current !== null) {
        cancelAnimationFrame(viewportMetricsRafRef.current);
        viewportMetricsRafRef.current = null;
      }
      if (scrollIdleTimeoutRef.current !== null) {
        window.clearTimeout(scrollIdleTimeoutRef.current);
        scrollIdleTimeoutRef.current = null;
      }
      scrollIdleDeadlineRef.current = 0;
    };
  }, [active, commitViewportMetrics, containerRef, isSessionActive, scheduleViewportMetrics, useOverlayScrollbar]);

  useEffect(() => {
    if (isSessionActive) {
      return;
    }

    if (scrollIdleTimeoutRef.current !== null) {
      window.clearTimeout(scrollIdleTimeoutRef.current);
      scrollIdleTimeoutRef.current = null;
    }
    scrollIdleDeadlineRef.current = 0;
    isScrollActiveRef.current = false;
    isTailDetachedRef.current = false;
    setIsScrollActive(false);
    setIsTailDetached(false);
  }, [isSessionActive]);

  return {
    activeRef,
    isScrollActive,
    isTailDetached,
    scrollTop,
    viewportHeight,
    viewportWidth,
  };
}

export { TAIL_ANCHOR_THRESHOLD };
