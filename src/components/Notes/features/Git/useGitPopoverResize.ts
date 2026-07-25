import { useCallback, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { useResizableBox } from '@/components/layout/shell/useResizableBox';
import { themeGitTokens } from '@/styles/themeTokens';

export function useGitPopoverResize() {
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const handleRef = useRef<HTMLDivElement | null>(null);
  const viewportHeight = typeof window === 'undefined'
    ? themeGitTokens.defaultPopoverHeightPx + themeGitTokens.defaultPopoverViewportInsetPx
    : window.innerHeight;
  const [defaultHeight] = useState(() => Math.min(
    themeGitTokens.defaultPopoverHeightPx,
    Math.max(
      themeGitTokens.minPopoverHeightPx,
      viewportHeight - themeGitTokens.defaultPopoverViewportInsetPx,
    ),
  ));
  const [size, setSize] = useState({ width: 0, height: defaultHeight });
  const applyHeight = useCallback((height: number) => {
    const popover = popoverRef.current;
    if (popover) {
      if (height === defaultHeight) popover.style.removeProperty('height');
      else popover.style.height = `${height}px`;
    }
    handleRef.current?.setAttribute('aria-valuenow', String(Math.round(height)));
  }, [defaultHeight]);
  const getMaxSize = useCallback(() => {
    const currentViewportHeight = typeof window === 'undefined'
      ? themeGitTokens.defaultPopoverHeightPx + themeGitTokens.defaultPopoverViewportInsetPx
      : window.innerHeight;
    const top = popoverRef.current?.getBoundingClientRect().top ?? 0;
    return {
      width: 0,
      height: Math.max(
        themeGitTokens.minPopoverHeightPx,
        currentViewportHeight - Math.max(top, 0) - themeGitTokens.viewportInsetPx,
      ),
    };
  }, []);
  const handleLiveSizeChange = useCallback((next: { width: number; height: number }) => {
    applyHeight(next.height);
  }, [applyHeight]);
  const handleCommittedSizeChange = useCallback((next: { width: number; height: number }) => {
    setSize(next);
    applyHeight(next.height);
  }, [applyHeight]);
  const { isDragging, handleResizeStart, resetToDefaultSize } = useResizableBox({
    size,
    minSize: { width: 0, height: themeGitTokens.minPopoverHeightPx },
    maxSize: { width: 0, height: viewportHeight },
    defaultSize: { width: 0, height: defaultHeight },
    getMaxSize,
    onSizeChange: handleLiveSizeChange,
    onSizeCommit: handleCommittedSizeChange,
    liveUpdateMode: 'animation-frame',
    useOverlay: true,
  });
  const handlePointerDown = useCallback((event: PointerEvent<HTMLDivElement>) => {
    handleResizeStart('bottom', event);
  }, [handleResizeStart]);
  const handleKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      return;
    }
    event.preventDefault();
    const maxHeight = getMaxSize().height;
    const nextHeight = event.key === 'Home'
      ? themeGitTokens.minPopoverHeightPx
      : event.key === 'End'
        ? maxHeight
        : size.height + (event.key === 'ArrowDown'
          ? themeGitTokens.keyboardResizeStepPx
          : -themeGitTokens.keyboardResizeStepPx);
    const height = Math.max(themeGitTokens.minPopoverHeightPx, Math.min(maxHeight, nextHeight));
    applyHeight(height);
    setSize((current) => ({ ...current, height }));
  }, [applyHeight, getMaxSize, size.height]);

  return {
    popoverRef,
    handleRef,
    style: size.height === defaultHeight ? undefined : { height: `${size.height}px` },
    isDragging,
    minHeight: themeGitTokens.minPopoverHeightPx,
    maxHeight: getMaxSize().height,
    height: Math.round(size.height),
    handlePointerDown,
    handleKeyDown,
    resetToDefaultSize,
  };
}
