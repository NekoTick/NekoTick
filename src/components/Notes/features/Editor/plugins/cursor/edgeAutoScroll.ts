export const VERTICAL_EDGE_AUTO_SCROLL_EDGE_PX = 96;
export const VERTICAL_EDGE_AUTO_SCROLL_MAX_STEP_PX = 24;
const VERTICAL_EDGE_AUTO_SCROLL_CURVE_POWER = 1.15;
const NOMINAL_FRAME_DURATION_MS = 1000 / 60;
const MAX_COMPENSATED_FRAME_DURATION_MS = 50;

export interface VerticalEdgeAutoScrollHandle {
  getBounds: () => VerticalScrollViewportBounds | null;
  start: () => void;
  refreshBounds: () => void;
  syncScrollTop: (scrollTop: number) => void;
  stop: () => void;
}

export interface VerticalScrollViewportBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

interface CreateVerticalEdgeAutoScrollOptions {
  scrollRoot: HTMLElement | null;
  getPointerY: () => number | null;
  onScroll?: (scrollTop: number) => void;
  initialBounds?: VerticalScrollViewportBounds | null;
}

export function resolveVerticalEdgeAutoScrollDelta(
  pointerY: number,
  scrollRootRect: Pick<DOMRect, 'top' | 'bottom'>,
): number {
  const distanceFromTop = pointerY - scrollRootRect.top;
  const distanceFromBottom = scrollRootRect.bottom - pointerY;
  if (
    distanceFromTop < VERTICAL_EDGE_AUTO_SCROLL_EDGE_PX &&
    distanceFromTop < distanceFromBottom
  ) {
    const distanceIntoEdge = VERTICAL_EDGE_AUTO_SCROLL_EDGE_PX - distanceFromTop;
    const intensity = Math.min(distanceIntoEdge, VERTICAL_EDGE_AUTO_SCROLL_EDGE_PX) / VERTICAL_EDGE_AUTO_SCROLL_EDGE_PX;
    return -(
      (intensity ** VERTICAL_EDGE_AUTO_SCROLL_CURVE_POWER) * VERTICAL_EDGE_AUTO_SCROLL_MAX_STEP_PX
    );
  }

  if (
    distanceFromBottom < VERTICAL_EDGE_AUTO_SCROLL_EDGE_PX &&
    distanceFromBottom < distanceFromTop
  ) {
    const distanceIntoEdge = VERTICAL_EDGE_AUTO_SCROLL_EDGE_PX - distanceFromBottom;
    const intensity = Math.min(distanceIntoEdge, VERTICAL_EDGE_AUTO_SCROLL_EDGE_PX) / VERTICAL_EDGE_AUTO_SCROLL_EDGE_PX;
    return (
      (intensity ** VERTICAL_EDGE_AUTO_SCROLL_CURVE_POWER) * VERTICAL_EDGE_AUTO_SCROLL_MAX_STEP_PX
    );
  }

  return 0;
}

export function createVerticalEdgeAutoScroll(
  options: CreateVerticalEdgeAutoScrollOptions,
): VerticalEdgeAutoScrollHandle {
  const { scrollRoot, getPointerY, onScroll } = options;
  const ownerWindow = scrollRoot?.ownerDocument.defaultView ?? window;
  let rafId = 0;
  let active = false;
  let scrollRootBounds: VerticalScrollViewportBounds | null = options.initialBounds ?? null;
  let requestedScrollTop = 0;
  let lastFrameTime: number | null = null;
  let fractionalDeltaY = 0;

  const refreshBounds = () => {
    if (!scrollRoot) {
      scrollRootBounds = null;
      return;
    }
    const rect = scrollRoot.getBoundingClientRect();
    scrollRootBounds = {
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
    };
    requestedScrollTop = Math.max(0, scrollRoot.scrollTop);
  };

  const runFrame = (frameTime: number) => {
    rafId = 0;
    if (!active || !scrollRoot) return;
    const elapsedMs = lastFrameTime === null
      ? NOMINAL_FRAME_DURATION_MS
      : Math.min(
        MAX_COMPENSATED_FRAME_DURATION_MS,
        Math.max(0, frameTime - lastFrameTime),
      );
    lastFrameTime = frameTime;

    const pointerY = getPointerY();
    if (pointerY !== null && scrollRootBounds) {
      const nominalDeltaY = resolveVerticalEdgeAutoScrollDelta(
        pointerY,
        scrollRootBounds,
      );
      if (nominalDeltaY !== 0) {
        if (
          fractionalDeltaY !== 0
          && Math.sign(fractionalDeltaY) !== Math.sign(nominalDeltaY)
        ) {
          fractionalDeltaY = 0;
        }
        const preciseDeltaY = (
          nominalDeltaY * elapsedMs / NOMINAL_FRAME_DURATION_MS
        ) + fractionalDeltaY;
        const deltaY = preciseDeltaY > 0
          ? Math.floor(preciseDeltaY)
          : Math.ceil(preciseDeltaY);
        fractionalDeltaY = preciseDeltaY - deltaY;
        const currentScrollTop = scrollRoot.scrollTop;
        if (currentScrollTop !== requestedScrollTop) {
          requestedScrollTop = currentScrollTop;
          fractionalDeltaY = 0;
        }
        const nextScrollTop = Math.max(0, requestedScrollTop + deltaY);
        const appliedDeltaY = nextScrollTop - requestedScrollTop;
        if (appliedDeltaY === 0) {
          rafId = ownerWindow.requestAnimationFrame(runFrame);
          return;
        }
        scrollRoot.scrollTop = nextScrollTop;
        requestedScrollTop = scrollRoot.scrollTop;
        if (requestedScrollTop !== currentScrollTop) {
          onScroll?.(requestedScrollTop);
        }
      } else {
        fractionalDeltaY = 0;
      }
    }

    rafId = ownerWindow.requestAnimationFrame(runFrame);
  };

  return {
    getBounds() {
      return scrollRootBounds;
    },
    start() {
      if (!scrollRoot || active) return;
      active = true;
      if (!scrollRootBounds) refreshBounds();
      requestedScrollTop = Math.max(0, scrollRoot.scrollTop);
      lastFrameTime = null;
      fractionalDeltaY = 0;
      ownerWindow.addEventListener('resize', refreshBounds);
      rafId = ownerWindow.requestAnimationFrame(runFrame);
    },
    refreshBounds,
    syncScrollTop(scrollTop) {
      requestedScrollTop = Math.max(0, scrollTop);
      fractionalDeltaY = 0;
    },
    stop() {
      active = false;
      ownerWindow.removeEventListener('resize', refreshBounds);
      if (rafId !== 0) {
        ownerWindow.cancelAnimationFrame(rafId);
        rafId = 0;
      }
      scrollRootBounds = null;
      requestedScrollTop = 0;
      lastFrameTime = null;
      fractionalDeltaY = 0;
    },
  };
}
