import { useLayoutEffect } from 'react';

interface UseCoverContainerObserverOptions {
  containerRef: React.RefObject<HTMLDivElement | null>;
  isManualResizingRef: React.MutableRefObject<boolean>;
  setContainerSize: React.Dispatch<React.SetStateAction<{ width: number; height: number } | null>>;
  setIsContainerResizing?: (resizing: boolean) => void;
  observeKey?: string | null;
  suspended?: boolean;
}

export function useCoverContainerObserver({
  containerRef,
  isManualResizingRef,
  setContainerSize,
  setIsContainerResizing,
  observeKey,
  suspended = false,
}: UseCoverContainerObserverOptions) {
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    if (suspended) {
      setIsContainerResizing?.(false);
      return;
    }

    let resizeIdleTimer: number | null = null;
    let resizeFrame: number | null = null;
    let resizeActive = false;
    let lastObservedWidth = 0;
    let lastObservedHeight = 0;
    let pendingObservedSize: { width: number; height: number } | null = null;

    const clearResizeIdleTimer = () => {
      if (resizeIdleTimer === null) return;
      window.clearTimeout(resizeIdleTimer);
      resizeIdleTimer = null;
    };

    const scheduleResizeSettled = () => {
      if (!setIsContainerResizing) return;
      if (!resizeActive) {
        resizeActive = true;
        setIsContainerResizing(true);
      }
      clearResizeIdleTimer();
      resizeIdleTimer = window.setTimeout(() => {
        resizeActive = false;
        setIsContainerResizing(false);
        resizeIdleTimer = null;
      }, 96);
    };

    const commitContainerSize = (width: number, height: number) => {
      setContainerSize((prev) => {
        if (prev?.width === width && prev?.height === height) {
          return prev;
        }
        return { width, height };
      });
    };

    const updateContainerSize = (width: number, height: number, syncState = true) => {
      if (width <= 0 || height <= 0) return false;

      if (lastObservedWidth === width && lastObservedHeight === height) {
        return false;
      }

      lastObservedWidth = width;
      lastObservedHeight = height;

      if (!syncState) {
        return true;
      }

      commitContainerSize(width, height);
      return true;
    };

    const scheduleContainerSizeCommit = (width: number, height: number) => {
      pendingObservedSize = { width, height };
      if (resizeFrame !== null) {
        return;
      }

      resizeFrame = window.requestAnimationFrame(() => {
        resizeFrame = null;
        const nextSize = pendingObservedSize;
        pendingObservedSize = null;
        if (!nextSize) {
          return;
        }
        commitContainerSize(nextSize.width, nextSize.height);
      });
    };

    const syncContainerSize = () => {
      if (isManualResizingRef.current) return;

      const rect = el.getBoundingClientRect();
      updateContainerSize(Math.round(rect.width), Math.round(rect.height), true);
    };

    const observer = new ResizeObserver((entries) => {
      if (isManualResizingRef.current) return;

      const entry = entries[entries.length - 1];
      if (!entry) return;

      const roundedWidth = Math.round(entry.contentRect.width);
      const roundedHeight = Math.round(entry.contentRect.height);
      const changed = updateContainerSize(roundedWidth, roundedHeight, false);

      if (!changed) {
        return;
      }

      scheduleResizeSettled();
      scheduleContainerSizeCommit(roundedWidth, roundedHeight);
    });

    syncContainerSize();
    observer.observe(el);
    return () => {
      observer.disconnect();
      clearResizeIdleTimer();
      if (resizeFrame !== null) {
        window.cancelAnimationFrame(resizeFrame);
        resizeFrame = null;
      }
      pendingObservedSize = null;
      resizeActive = false;
      setIsContainerResizing?.(false);
    };
  }, [containerRef, isManualResizingRef, observeKey, setContainerSize, setIsContainerResizing, suspended]);
}
