import { useEffect, useRef, type FocusEvent, type ReactNode, type Ref } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { SIDEBAR_SLIDE_TRANSITION, SIDEBAR_SLIDE_VARIANTS } from '@/lib/animations';
import { useShellSidebarResize } from './useShellSidebarResize';
import { RESIZE_HANDLE_HALF_WIDTH } from './ResizeDividerVisual';
import { ResizeHandle } from './ResizeHandle';

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
  const sidebarPointerInsideRef = useRef(false);

  useEffect(() => {
    if (!collapsed) sidebarPointerInsideRef.current = false;
  }, [collapsed]);
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
    onWidthChange: onLiveWidthChange ?? onWidthChange,
    onWidthCommit: onLiveWidthChange ? onWidthChange : undefined,
    onDragStateChange,
  });

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
            'absolute inset-y-0 left-0 flex min-h-0 flex-col overflow-hidden bg-[var(--vlaina-color-surface-sidebar-backdrop)] select-none app-scrollbar transform-gpu will-change-transform',
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
