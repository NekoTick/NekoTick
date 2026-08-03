import { forwardRef, useCallback, type ReactNode } from 'react';
import { Icon } from '@/components/ui/icons';
import { WindowControls } from '@/components/layout/WindowControls';
import { ghostIconButtonClass } from '@/components/ui/surfaceStyles';
import { blurComposerInput, isComposerInputFocused } from '@/lib/ui/composerFocusRegistry';
import { desktopWindow } from '@/lib/desktop/window';
import { isMacOS, shouldRenderMacOSTrafficLightPreview } from '@/lib/desktop/platform';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { useUIStore } from '@/stores/uiSlice';
import { themeDomStyleTokens, themeIconTokens, themeStyleResetTokens } from '@/styles/themeTokens';

interface UnifiedTitleBarProps {
  leftSlot?: ReactNode;
  centerSlot?: ReactNode;
  rightSlot?: ReactNode;
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  onCollapsedSidebarToggleHoverChange?: (hovered: boolean) => void;
  backgroundColor?: string;
  centerOverflowVisible?: boolean;
  showWindowControls?: boolean;
}

function MacOSTrafficLightPreviewControls() {
  const { t } = useI18n();
  const buttonClass =
    'h-3 w-3 rounded-full border border-black/15 shadow-[var(--vlaina-shadow-macos-traffic-light)] transition-transform hover:scale-[var(--vlaina-scale-105)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vlaina-color-accent-focus-ring)]';

  return (
    <div
      data-testid="macos-traffic-light-preview"
      className="app-no-drag absolute left-3 top-0 z-[var(--vlaina-z-60)] flex h-10 items-center gap-2"
    >
      <button
        type="button"
        aria-label={t('common.closeWindow')}
        onClick={() => void desktopWindow.close()}
        className={`${buttonClass} bg-[var(--vlaina-color-macos-close)]`}
      />
      <button
        type="button"
        aria-label={t('common.minimizeWindow')}
        onClick={() => void desktopWindow.minimize()}
        className={`${buttonClass} bg-[var(--vlaina-color-macos-minimize)]`}
      />
      <button
        type="button"
        aria-label={t('common.maximizeWindow')}
        onClick={() => void desktopWindow.toggleMaximize()}
        className={`${buttonClass} bg-[var(--vlaina-color-macos-maximize)]`}
      />
    </div>
  );
}

export const UnifiedTitleBar = forwardRef<HTMLDivElement, UnifiedTitleBarProps>(function UnifiedTitleBar({
  leftSlot,
  centerSlot,
  rightSlot,
  sidebarCollapsed,
  onToggleSidebar,
  onCollapsedSidebarToggleHoverChange,
  backgroundColor = 'transparent',
  centerOverflowVisible = false,
  showWindowControls = true
}, ref) {
  const { t } = useI18n();
  const devPlatformPreview = useUIStore((state) => state.devPlatformPreview);
  const shouldReserveMacTrafficLightSpace = isMacOS(devPlatformPreview);
  const shouldShowTrafficLightPreview = shouldRenderMacOSTrafficLightPreview(devPlatformPreview);
  const handleTitleBarMouseDownCapture = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;

    const target = e.target as Element | null;
    if (target?.closest('button, a, input, textarea, select, [role="button"], .app-no-drag')) {
      return;
    }

    if (!isComposerInputFocused()) {
      return;
    }

    requestAnimationFrame(() => {
      blurComposerInput();
    });
  }, []);

  return (
    <div
      ref={ref}
      className="app-drag-region app-title-bar h-10 flex items-center select-none relative z-[var(--vlaina-z-50)] flex-shrink-0"
      style={{ backgroundColor }}
      onMouseDownCapture={handleTitleBarMouseDownCapture}
    >
      {shouldShowTrafficLightPreview ? <MacOSTrafficLightPreviewControls /> : null}

      {sidebarCollapsed ? (
        <div
          className={`relative z-[var(--vlaina-z-20)] flex items-center h-full pr-3 bg-transparent ${shouldReserveMacTrafficLightSpace ? 'pl-[var(--vlaina-space-76px)]' : 'pl-2'}`}
          onMouseEnter={() => onCollapsedSidebarToggleHoverChange?.(true)}
          onMouseLeave={() => onCollapsedSidebarToggleHoverChange?.(false)}
        >
          <button
            type="button"
            aria-label={t('shortcut.action.toggleSidebar')}
            onClick={onToggleSidebar}
            className={cn(
              "app-no-drag group flex h-8 w-8 cursor-pointer items-center justify-center text-[var(--vlaina-sidebar-chat-text)]",
              ghostIconButtonClass
            )}
          >
            <>
              {/* Sidebar glyph adapted from Lucide Icons (ISC). */}
              <svg
                aria-hidden="true"
                focusable="false"
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="24"
                fill={themeStyleResetTokens.fillNone}
                viewBox={themeIconTokens.viewBoxDefault}
                stroke={themeStyleResetTokens.currentColor}
                strokeWidth={themeIconTokens.strokeDefault}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="lucide lucide-text-align-start-icon lucide-text-align-start size-5 group-hover:hidden"
              >
                <path d="M21 5H3" />
                <path d="M15 12H3" />
                <path d="M17 19H3" />
              </svg>
              <Icon name="nav.expand" size="titlebarToggle" className="hidden group-hover:block" />
            </>
          </button>
        </div>
      ) : (
        <div
          data-shell-titlebar-sidebar-backdrop="true"
          className="h-full flex-shrink-0 z-[var(--vlaina-z-20)] group flex flex-col justify-center bg-[var(--vlaina-color-surface-sidebar-backdrop)] app-drag-region"
          style={{ width: themeDomStyleTokens.shellSidebarWidth }}
        >
          {leftSlot}
        </div>
      )}

      <div
        className="absolute top-0 bottom-0 right-0 bg-transparent"
        style={{ left: sidebarCollapsed ? 0 : themeDomStyleTokens.shellSidebarWidth }}
      />

      <div className={`app-drag-region app-title-bar-center flex-1 flex items-center z-[var(--vlaina-z-20)] min-w-0 h-full relative ${centerOverflowVisible ? 'overflow-visible' : 'overflow-hidden'}`}>
        {centerSlot}
      </div>

      {rightSlot && (
        <div className="relative z-[var(--vlaina-z-20)] flex h-full translate-x-[var(--vlaina-window-resize-compensation-x)] items-center bg-transparent pr-2 app-drag-region">
          {rightSlot}
        </div>
      )}

      {showWindowControls ? <WindowControls className="z-[var(--vlaina-z-50)]" /> : null}
    </div>
  );
});
