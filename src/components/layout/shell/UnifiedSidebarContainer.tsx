import { useCallback, useEffect, useLayoutEffect, useRef, type FocusEvent, type ReactNode, type Ref } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { SIDEBAR_SLIDE_TRANSITION, SIDEBAR_SLIDE_VARIANTS } from '@/lib/animations';
import {
  isSidebarResizeDiagnosticActive,
  recordSidebarResizeWidthUpdate,
  runSidebarResizeDiagnosticWork,
} from '@/lib/diagnostics/sidebarResizeDiagnostics';
import { useShellSidebarResize } from './useShellSidebarResize';
import { RESIZE_HANDLE_HALF_WIDTH } from './ResizeDividerVisual';
import { ResizeHandle } from './ResizeHandle';
import { requestNativeCaretOverlayRefresh } from '@/hooks/useNativeCaretOverlay';

interface UnifiedSidebarContainerProps {
  children: ReactNode;
  width: number;
  collapsed: boolean;
  peeking?: boolean;
  onPeekChange?: (peeking: boolean) => void;
  onWidthChange: (width: number) => void;
  onLiveWidthChange?: (width: number) => void;
  onDragStateChange?: (isDragging: boolean) => void;
  onLayoutAnimationComplete?: () => void;
  widthScopeRef?: Ref<HTMLDivElement>;
}

interface FrozenScrollRoot {
  element: HTMLElement;
  maxWidth: string;
  minWidth: string;
  width: string;
}

export function UnifiedSidebarContainer({
  children,
  width,
  collapsed,
  peeking = false,
  onPeekChange,
  onWidthChange,
  onLiveWidthChange,
  onDragStateChange,
  onLayoutAnimationComplete,
  widthScopeRef,
}: UnifiedSidebarContainerProps) {
  const sidebarRef = useRef<HTMLElement>(null);
  const sidebarLayoutRef = useRef<HTMLDivElement>(null);
  const resizeHandleRef = useRef<HTMLDivElement>(null);
  const sidebarPointerInsideRef = useRef(false);
  const frozenScrollRootsRef = useRef<FrozenScrollRoot[]>([]);
  const restoreLiveGeometryFrameRef = useRef<number | null>(null);
  const restoreScrollRootsFrameRef = useRef<number | null>(null);
  const liveWidthRef = useRef<number | null>(null);

  const restoreLiveGeometry = useCallback(() => {
    if (restoreLiveGeometryFrameRef.current !== null) {
      cancelAnimationFrame(restoreLiveGeometryFrameRef.current);
      restoreLiveGeometryFrameRef.current = null;
    }
    if (liveWidthRef.current === null) return;
    if (sidebarLayoutRef.current) {
      sidebarLayoutRef.current.style.width = collapsed
        ? '0px'
        : 'var(--vlaina-shell-sidebar-width)';
    }
    if (sidebarRef.current) {
      sidebarRef.current.style.width = 'var(--vlaina-shell-sidebar-width)';
    }
    if (resizeHandleRef.current) {
      resizeHandleRef.current.style.left = `calc(var(--vlaina-shell-sidebar-width) - ${RESIZE_HANDLE_HALF_WIDTH}px)`;
    }
    liveWidthRef.current = null;
  }, [collapsed]);

  const scheduleLiveGeometryRestore = useCallback(() => {
    if (restoreLiveGeometryFrameRef.current !== null) return;
    restoreLiveGeometryFrameRef.current = requestAnimationFrame(() => {
      restoreLiveGeometryFrameRef.current = null;
      runSidebarResizeDiagnosticWork(
        'shell-sidebar-geometry-restore',
        'release',
        restoreLiveGeometry,
      );
    });
  }, [restoreLiveGeometry]);

  const restoreScrollRootLayouts = useCallback(() => {
    if (restoreScrollRootsFrameRef.current !== null) {
      cancelAnimationFrame(restoreScrollRootsFrameRef.current);
      restoreScrollRootsFrameRef.current = null;
    }
    for (const frozen of frozenScrollRootsRef.current) {
      frozen.element.style.width = frozen.width;
      frozen.element.style.minWidth = frozen.minWidth;
      frozen.element.style.maxWidth = frozen.maxWidth;
    }
    frozenScrollRootsRef.current = [];
  }, []);

  const handleDragStateChange = useCallback((dragging: boolean) => {
    if (dragging) {
      restoreScrollRootLayouts();
      const scrollRoots = Array.from(
        sidebarRef.current?.querySelectorAll<HTMLElement>('[data-sidebar-scroll-root="true"]') ?? [],
      );
      frozenScrollRootsRef.current = scrollRoots.flatMap((element) => {
        const width = element.clientWidth;
        if (width <= 0) return [];
        const frozen = {
          element,
          maxWidth: element.style.maxWidth,
          minWidth: element.style.minWidth,
          width: element.style.width,
        };
        const widthValue = `${width}px`;
        element.style.width = widthValue;
        element.style.minWidth = widthValue;
        element.style.maxWidth = widthValue;
        return [frozen];
      });
    }
    onDragStateChange?.(dragging);
    if (!dragging && frozenScrollRootsRef.current.length > 0) {
      restoreScrollRootsFrameRef.current = requestAnimationFrame(() => {
        restoreScrollRootsFrameRef.current = null;
        runSidebarResizeDiagnosticWork(
          'shell-sidebar-scroll-root-restore',
          'release',
          restoreScrollRootLayouts,
        );
      });
    }
  }, [onDragStateChange, restoreScrollRootLayouts]);

  const handleLiveWidthChange = useCallback((nextWidth: number) => {
    const diagnosticStartedAt = isSidebarResizeDiagnosticActive() ? performance.now() : null;
    const widthValue = `${nextWidth}px`;
    liveWidthRef.current = nextWidth;
    if (sidebarLayoutRef.current) sidebarLayoutRef.current.style.width = widthValue;
    if (sidebarRef.current) sidebarRef.current.style.width = widthValue;
    if (resizeHandleRef.current) {
      resizeHandleRef.current.style.left = `${nextWidth - RESIZE_HANDLE_HALF_WIDTH}px`;
    }
    onLiveWidthChange?.(nextWidth);
    if (diagnosticStartedAt !== null) {
      recordSidebarResizeWidthUpdate(nextWidth, performance.now() - diagnosticStartedAt);
    }
  }, [onLiveWidthChange]);

  const handleWidthCommit = useCallback((nextWidth: number) => {
    onWidthChange(nextWidth);
    scheduleLiveGeometryRestore();
  }, [onWidthChange, scheduleLiveGeometryRestore]);

  useEffect(() => {
    if (!collapsed) sidebarPointerInsideRef.current = false;
  }, [collapsed]);
  useEffect(() => () => {
    restoreLiveGeometry();
    restoreScrollRootLayouts();
  }, [restoreLiveGeometry, restoreScrollRootLayouts]);
  useEffect(() => {
    if (!collapsed || !peeking) return;

    const closeSidebarPeek = () => {
      sidebarPointerInsideRef.current = false;
      onPeekChange?.(false);
    };
    const handleWindowMouseOut = (event: MouseEvent) => {
      if (
        event.relatedTarget === null
        && !document.documentElement.matches(':hover')
      ) {
        closeSidebarPeek();
      }
    };

    window.addEventListener('mouseleave', closeSidebarPeek);
    window.addEventListener('mouseout', handleWindowMouseOut, true);
    window.addEventListener('blur', closeSidebarPeek);
    return () => {
      window.removeEventListener('mouseleave', closeSidebarPeek);
      window.removeEventListener('mouseout', handleWindowMouseOut, true);
      window.removeEventListener('blur', closeSidebarPeek);
    };
  }, [collapsed, onPeekChange, peeking]);
  const { isDragging, handleDragStart, handleDoubleClick } = useShellSidebarResize({
    width,
    onWidthChange: onLiveWidthChange ? handleLiveWidthChange : onWidthChange,
    onWidthCommit: onLiveWidthChange ? handleWidthCommit : undefined,
    onDragStateChange: handleDragStateChange,
  });

  useLayoutEffect(() => {
    if (liveWidthRef.current === width) restoreLiveGeometry();
  }, [restoreLiveGeometry, width]);

  const handleMouseLeave = () => {
    sidebarPointerInsideRef.current = false;

    const activeElement = document.activeElement;
    if (
      activeElement instanceof HTMLElement
      && sidebarRef.current?.contains(activeElement)
      && activeElement.matches('input, textarea, select, [contenteditable="true"]')
    ) {
      return;
    }

    onPeekChange?.(false);
  };

  const handleFocusOut = (event: FocusEvent<HTMLElement>) => {
    if (!document.hasFocus()) return;

    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return;
    if (sidebarPointerInsideRef.current) return;
    onPeekChange?.(false);
  };

  const handleMouseEnter = () => {
    sidebarPointerInsideRef.current = true;
    onPeekChange?.(true);
  };

  return (
    <div
      className="contents"
      ref={widthScopeRef}
      data-shell-sidebar-width-scope="true"
    >
      <div
        ref={sidebarLayoutRef}
        data-shell-sidebar-layout="true"
        className="relative min-h-0 flex-shrink-0"
        style={{ width: collapsed ? 0 : 'var(--vlaina-shell-sidebar-width)' }}
      >
        <motion.aside
          ref={sidebarRef}
          data-shell-sidebar-peek={collapsed ? 'true' : undefined}
          data-shell-sidebar-docked={!collapsed ? 'true' : undefined}
          data-open={collapsed ? (peeking ? 'true' : 'false') : undefined}
          aria-hidden={collapsed ? !peeking : undefined}
          className={cn(
            'absolute inset-y-0 left-0 flex min-h-0 flex-col overflow-hidden bg-[var(--vlaina-color-surface-sidebar-backdrop)] select-none app-scrollbar',
            collapsed && 'transform-gpu will-change-transform',
            collapsed ? 'z-[var(--vlaina-z-40)]' : 'z-[var(--vlaina-z-20)]',
            collapsed && !peeking ? 'pointer-events-none' : 'pointer-events-auto',
          )}
          style={{
            width: 'var(--vlaina-shell-sidebar-width)',
          }}
          variants={SIDEBAR_SLIDE_VARIANTS}
          initial={false}
          animate={collapsed && !peeking ? 'hidden' : 'visible'}
          transition={SIDEBAR_SLIDE_TRANSITION}
          onUpdate={() => queueMicrotask(requestNativeCaretOverlayRefresh)}
          onAnimationComplete={onLayoutAnimationComplete}
          onMouseEnter={collapsed ? handleMouseEnter : undefined}
          onMouseLeave={collapsed ? handleMouseLeave : undefined}
          onBlur={collapsed ? handleFocusOut : undefined}
        >
          {children}
        </motion.aside>
      </div>

      {!collapsed && (
        <ResizeHandle
          ref={resizeHandleRef}
          dataResizeHandleScope="shell-sidebar"
          onMouseDown={handleDragStart}
          onDoubleClick={handleDoubleClick}
          isDragging={isDragging}
          positionStyle={{
            left: `calc(var(--vlaina-shell-sidebar-width) - ${RESIZE_HANDLE_HALF_WIDTH}px)`,
            pointerEvents: 'auto',
          }}
        />
      )}
    </div>
  );
}
