import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import * as sidebarResizeDiagnostics from '@/lib/diagnostics/sidebarResizeDiagnostics';
import { useUIStore } from '@/stores/uiSlice';
import { themeDomStyleTokens } from '@/styles/themeTokens';
import { useFrozenMainLayout } from './useFrozenMainLayout';
import { UnifiedSidebarContainer } from './UnifiedSidebarContainer';
import { UnifiedTitleBar } from './UnifiedTitleBar';

const TITLEBAR_SIDEBAR_PEEK_CLOSE_DELAY_MS = 140;

interface AppShellProps {
  children: ReactNode;
  
  sidebarContent?: ReactNode;
  sidebarWidth: number;
  sidebarCollapsed: boolean;
  sidebarHoverPeekEnabled?: boolean;
  onSidebarWidthChange: (width: number) => void;
  onSidebarToggle: () => void;
  
  titleBarLeft?: ReactNode;
  titleBarCenter?: ReactNode;
  titleBarRight?: ReactNode;
  titleBarCenterOverflowVisible?: boolean;
  mainOverlay?: ReactNode;
  
  backgroundColor?: string;
  isDragging?: boolean;
}

export function AppShell({
  children,
  
  sidebarContent,
  sidebarWidth,
  sidebarCollapsed,
  sidebarHoverPeekEnabled = true,
  onSidebarWidthChange,
  onSidebarToggle,
  
  titleBarLeft,
  titleBarCenter,
  titleBarRight,
  titleBarCenterOverflowVisible = false,
  mainOverlay,
  
  backgroundColor = 'transparent',
  isDragging = false
}: AppShellProps) {
  const titleBarWidthScopeRef = useRef<HTMLDivElement>(null);
  const sidebarWidthScopeRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const sidebarReleaseFrameRef = useRef<number | null>(null);
  const previousSidebarCollapsedRef = useRef(sidebarCollapsed);
  const sidebarPeekCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isSidebarDragging, setIsSidebarDragging] = useState(false);
  const [isSidebarPeeking, setIsSidebarPeeking] = useState(false);
  const setLayoutPanelDragging = useUIStore((state) => state.setLayoutPanelDragging);
  const setLayoutPanelTransitioning = useUIStore((state) => state.setLayoutPanelTransitioning);
  const hasSidebar = Boolean(sidebarContent);
  const { freeze: freezeMainLayout, restore: restoreMainLayout } = useFrozenMainLayout(mainRef);

  const clearSidebarPeekCloseTimer = useCallback(() => {
    if (!sidebarPeekCloseTimerRef.current) return;
    clearTimeout(sidebarPeekCloseTimerRef.current);
    sidebarPeekCloseTimerRef.current = null;
  }, []);

  const openSidebarPeek = useCallback(() => {
    clearSidebarPeekCloseTimer();
    if (!sidebarCollapsed || !sidebarHoverPeekEnabled) return;
    setIsSidebarPeeking(true);
  }, [clearSidebarPeekCloseTimer, sidebarCollapsed, sidebarHoverPeekEnabled]);

  const scheduleSidebarPeekClose = useCallback(() => {
    clearSidebarPeekCloseTimer();
    if (!sidebarCollapsed) return;

    sidebarPeekCloseTimerRef.current = setTimeout(() => {
      sidebarPeekCloseTimerRef.current = null;
      setIsSidebarPeeking(false);
    }, TITLEBAR_SIDEBAR_PEEK_CLOSE_DELAY_MS);
  }, [clearSidebarPeekCloseTimer, sidebarCollapsed]);

  const handleSidebarPeekChange = useCallback((peeking: boolean) => {
    clearSidebarPeekCloseTimer();
    setIsSidebarPeeking(sidebarHoverPeekEnabled && peeking);
  }, [clearSidebarPeekCloseTimer, sidebarHoverPeekEnabled]);

  const handleCollapsedSidebarToggleHoverChange = useCallback((hovered: boolean) => {
    if (hovered) {
      openSidebarPeek();
      return;
    }

    scheduleSidebarPeekClose();
  }, [openSidebarPeek, scheduleSidebarPeekClose]);

  const applySidebarWidth = useCallback((width: number) => {
    const sidebarWidthValue = `${width}px`;
    const sidebarContentInnerValue = `calc(${sidebarWidthValue} - var(--vlaina-size-32px))`;

    for (const target of [titleBarWidthScopeRef.current, sidebarWidthScopeRef.current]) {
      if (!target) continue;
      target.style.setProperty('--vlaina-shell-sidebar-width', sidebarWidthValue);
      target.style.setProperty('--vlaina-width-sidebar-content-inner', sidebarContentInnerValue);
    }
  }, []);

  const applyLiveTitleBarWidth = useCallback((width: number) => {
    const target = titleBarWidthScopeRef.current;
    if (target) {
      const sidebarWidthValue = `${width}px`;
      target.style.setProperty('--vlaina-shell-sidebar-width', sidebarWidthValue);
      target.style.setProperty(
        '--vlaina-width-sidebar-content-inner',
        `calc(${sidebarWidthValue} - var(--vlaina-size-32px))`,
      );
    }
  }, []);

  const cancelSidebarRelease = useCallback(() => {
    if (sidebarReleaseFrameRef.current === null) return;
    cancelAnimationFrame(sidebarReleaseFrameRef.current);
    sidebarReleaseFrameRef.current = null;
  }, []);

  const scheduleSidebarRelease = useCallback(() => {
    cancelSidebarRelease();
    sidebarReleaseFrameRef.current = requestAnimationFrame(() => {
      sidebarReleaseFrameRef.current = requestAnimationFrame(() => {
        sidebarResizeDiagnostics.runSidebarResizeDiagnosticWork(
          'shell-main-layout-restore',
          'release',
          restoreMainLayout,
        );
        sidebarReleaseFrameRef.current = requestAnimationFrame(() => {
          sidebarReleaseFrameRef.current = null;
          sidebarResizeDiagnostics.runSidebarResizeDiagnosticWork(
            'shell-deferred-layout-flush',
            'release',
            () => setLayoutPanelDragging(false),
          );
        });
      });
    });
  }, [cancelSidebarRelease, restoreMainLayout, setLayoutPanelDragging]);

  const handleSidebarDragStateChange = useCallback((dragging: boolean) => {
    const stateChangeStartedAt = performance.now();

    if (dragging) {
      cancelSidebarRelease();
      const mainWidth = freezeMainLayout();
      sidebarResizeDiagnostics.beginSidebarResizeDiagnostic({
        mainWidth,
        setupDurationMs: performance.now() - stateChangeStartedAt,
        sidebarWidth,
      });
      setLayoutPanelDragging(true);
    } else {
      scheduleSidebarRelease();
    }

    setIsSidebarDragging(dragging);
    if (!dragging) sidebarResizeDiagnostics.finishSidebarResizeDiagnostic(stateChangeStartedAt);
  }, [cancelSidebarRelease, freezeMainLayout, scheduleSidebarRelease, setLayoutPanelDragging, sidebarWidth]);

  const handleSidebarLayoutAnimationComplete = useCallback(() => {
    setLayoutPanelTransitioning('shell-sidebar', false);
  }, [setLayoutPanelTransitioning]);

  useLayoutEffect(() => {
    applySidebarWidth(sidebarWidth);
  }, [applySidebarWidth, sidebarCollapsed, sidebarWidth]);

  useLayoutEffect(() => {
    if (previousSidebarCollapsedRef.current === sidebarCollapsed) return;
    previousSidebarCollapsedRef.current = sidebarCollapsed;

    // A visible peek docks without a slide animation when the sidebar expands.
    if (!sidebarCollapsed && isSidebarPeeking) return;
    setLayoutPanelTransitioning('shell-sidebar', true);
  }, [isSidebarPeeking, setLayoutPanelTransitioning, sidebarCollapsed]);

  useLayoutEffect(() => {
    if (!sidebarCollapsed || !sidebarHoverPeekEnabled) {
      clearSidebarPeekCloseTimer();
      setIsSidebarPeeking(false);
    }
  }, [clearSidebarPeekCloseTimer, sidebarCollapsed, sidebarHoverPeekEnabled]);

  useLayoutEffect(() => {
    const root = document.documentElement;
    const hasCollapsedSidebar = hasSidebar && sidebarCollapsed;
    const sidebarPeekOpen = hasCollapsedSidebar && sidebarHoverPeekEnabled && isSidebarPeeking;
    root.toggleAttribute('data-shell-sidebar-peek', hasCollapsedSidebar);
    root.toggleAttribute('data-shell-sidebar-peek-open', sidebarPeekOpen);

    return () => {
      root.removeAttribute('data-shell-sidebar-peek');
      root.removeAttribute('data-shell-sidebar-peek-open');
    };
  }, [hasSidebar, isSidebarPeeking, sidebarCollapsed, sidebarHoverPeekEnabled]);

  useEffect(() => clearSidebarPeekCloseTimer, [clearSidebarPeekCloseTimer]);
  useEffect(
    () => () => {
      cancelSidebarRelease();
      restoreMainLayout();
      setLayoutPanelDragging(false);
      setLayoutPanelTransitioning('shell-sidebar', false);
    },
    [cancelSidebarRelease, restoreMainLayout, setLayoutPanelDragging, setLayoutPanelTransitioning],
  );

  return (
    <div
      data-app-shell-root="true"
      data-layout-panel-dragging={isSidebarDragging ? 'true' : undefined}
      className={cn(
        "h-full flex overflow-hidden flex-col",
        (isDragging || isSidebarDragging) && "select-none cursor-col-resize"
      )}
    >
      
      <UnifiedTitleBar
        ref={titleBarWidthScopeRef}
        leftSlot={titleBarLeft}
        centerSlot={titleBarCenter}
        rightSlot={titleBarRight}
        centerOverflowVisible={titleBarCenterOverflowVisible}
        sidebarCollapsed={sidebarCollapsed}
        onToggleSidebar={onSidebarToggle}
        onCollapsedSidebarToggleHoverChange={sidebarHoverPeekEnabled ? handleCollapsedSidebarToggleHoverChange : undefined}
        backgroundColor={backgroundColor}
      />
      
      <div className="flex-1 flex min-h-0 overflow-hidden relative">
        
        {sidebarContent && sidebarCollapsed && sidebarHoverPeekEnabled ? (
          <div
            data-shell-sidebar-peek-layer="true"
            className="pointer-events-none absolute inset-y-0 left-0 z-[var(--vlaina-z-40)]"
          >
            <div
              data-shell-sidebar-peek-hotzone="true"
              className="pointer-events-auto absolute inset-y-0 left-0"
              style={{ width: themeDomStyleTokens.hoverPeekTriggerWidthPx }}
              aria-hidden="true"
              onMouseEnter={openSidebarPeek}
            />
          </div>
        ) : null}

        {sidebarContent ? (
          <UnifiedSidebarContainer
            width={sidebarWidth}
            collapsed={sidebarCollapsed}
            peeking={sidebarHoverPeekEnabled && isSidebarPeeking}
            onPeekChange={handleSidebarPeekChange}
            onWidthChange={onSidebarWidthChange}
            onLiveWidthChange={applyLiveTitleBarWidth}
            onDragStateChange={handleSidebarDragStateChange}
            onLayoutAnimationComplete={handleSidebarLayoutAnimationComplete}
            widthScopeRef={sidebarWidthScopeRef}
          >
            {sidebarContent}
          </UnifiedSidebarContainer>
        ) : null}
        
        <main
          ref={mainRef}
          className="flex-1 flex flex-col min-w-0 relative app-scrollbar"
        >
          {children}
          {mainOverlay}
        </main>
        
      </div>
    </div>
  );
}
