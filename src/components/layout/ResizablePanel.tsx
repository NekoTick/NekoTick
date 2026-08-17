import { useState, useEffect, useCallback, useLayoutEffect } from 'react';
import { cn } from '@/lib/utils';
import { useResizableDivider } from './shell/useResizableDivider';
import { ResizeHandle } from './shell/ResizeHandle';

const MAX_STORED_PANEL_WIDTH_CHARS = 16;
const STORED_PANEL_WIDTH_PATTERN = /^(?:\d+(?:\.\d+)?|\.\d+)$/;

interface ResizablePanelProps {
  children: React.ReactNode;
  defaultWidth?: number;
  minWidth?: number;
  maxWidth?: number;
  getMaxWidth?: () => number;
  storageKey?: string;
  className?: string;
  onWidthChange?: (width: number) => void;
  onDragStateChange?: (dragging: boolean) => void;
}

function clampPanelWidth(width: number, minWidth: number, maxWidth: number): number {
  return Math.max(minWidth, Math.min(maxWidth, width));
}

function resolvePanelMaxWidth(
  minWidth: number,
  maxWidth: number,
  getMaxWidth: (() => number) | undefined,
): number {
  const dynamicMaxWidth = getMaxWidth?.() ?? maxWidth;
  return Math.max(minWidth, Math.min(maxWidth, dynamicMaxWidth));
}

function parseStoredPanelWidth(value: string | null, minWidth: number, maxWidth: number): number | null {
  if (!value || value.length > MAX_STORED_PANEL_WIDTH_CHARS) {
    return null;
  }

  const trimmed = value.trim();
  if (!STORED_PANEL_WIDTH_PATTERN.test(trimmed)) {
    return null;
  }

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return clampPanelWidth(parsed, minWidth, maxWidth);
}

export function ResizablePanel({
  children,
  defaultWidth = 320,
  minWidth = 280,
  maxWidth = 800,
  getMaxWidth,
  storageKey,
  className,
  onWidthChange,
  onDragStateChange,
}: ResizablePanelProps) {
  const [width, setWidth] = useState(() => {
    const effectiveMaxWidth = resolvePanelMaxWidth(minWidth, maxWidth, getMaxWidth);
    if (storageKey) {
      try {
        const saved = parseStoredPanelWidth(localStorage.getItem(storageKey), minWidth, effectiveMaxWidth);
        if (saved !== null) return saved;
      } catch (e) {
      }
    }
    return clampPanelWidth(defaultWidth, minWidth, effectiveMaxWidth);
  });

  const handleWidthChange = useCallback((nextWidth: number) => {
    const effectiveMaxWidth = resolvePanelMaxWidth(minWidth, maxWidth, getMaxWidth);
    const clampedWidth = clampPanelWidth(nextWidth, minWidth, effectiveMaxWidth);
    setWidth(clampedWidth);
    onWidthChange?.(clampedWidth);
  }, [getMaxWidth, maxWidth, minWidth, onWidthChange]);

  const { isDragging, handleDragStart, handleDoubleClick } = useResizableDivider({
    width,
    minWidth,
    maxWidth,
    getMaxWidth,
    defaultWidth,
    onWidthChange: handleWidthChange,
    onDragStateChange,
    direction: 'reverse',
    liveUpdateMode: 'animation-frame',
    useOverlay: true,
  });

  useLayoutEffect(() => {
    const effectiveMaxWidth = resolvePanelMaxWidth(minWidth, maxWidth, getMaxWidth);
    const clampedWidth = clampPanelWidth(width, minWidth, effectiveMaxWidth);
    if (clampedWidth !== width) {
      setWidth(clampedWidth);
      onWidthChange?.(clampedWidth);
    }
  }, [getMaxWidth, maxWidth, minWidth, onWidthChange, width]);

  useEffect(() => {
    if (storageKey && !isDragging) {
      try {
        localStorage.setItem(storageKey, String(width));
      } catch {
      }
    }
  }, [width, isDragging, storageKey]);

  useEffect(() => {
    if (!storageKey || typeof window === 'undefined') {
      return;
    }

    const handleStorage = (event: StorageEvent) => {
      if (event.storageArea !== localStorage || event.key !== storageKey) {
        return;
      }

      const effectiveMaxWidth = resolvePanelMaxWidth(minWidth, maxWidth, getMaxWidth);
      const nextWidth = parseStoredPanelWidth(event.newValue, minWidth, effectiveMaxWidth);
      if (nextWidth === null) {
        return;
      }

      setWidth(nextWidth);
      onWidthChange?.(nextWidth);
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [getMaxWidth, maxWidth, minWidth, onWidthChange, storageKey]);

  return (
    <aside
      className={cn(
        "relative flex flex-col bg-[var(--vlaina-color-setting-content)] backdrop-blur-[var(--vlaina-backdrop-blur-md)] overflow-hidden",
        isDragging && "will-change-[width]",
        !isDragging && "transition-[width] duration-[var(--vlaina-duration-100)] ease-out",
        className
      )}
      style={{ width }}
    >
      <ResizeHandle
        onMouseDown={handleDragStart}
        onDoubleClick={handleDoubleClick}
        isDragging={isDragging}
        position="absolute"
        zIndexClassName="z-[var(--vlaina-z-100)]"
        positionStyle={{
          left: 0,
        }}
      />
      {children}
    </aside>
  );
}
