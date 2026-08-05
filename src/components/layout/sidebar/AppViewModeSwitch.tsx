import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Icon } from '@/components/ui/icons';
import { useI18n } from '@/lib/i18n';
import { APP_VIEW_MODE_SWITCH_MIN_WIDTH } from '@/lib/layout/sidebarWidth';
import { cn } from '@/lib/utils';
import { useUIStore } from '@/stores/uiSlice';
import { themeAppViewModeSwitchTokens, themeIconTokens } from '@/styles/themeTokens';
import {
  fulfillAppViewModeFocus,
  requestAppViewModeFocus,
  subscribeAppViewModeFocusIntent,
  type SwitchableAppViewMode,
} from './appViewModeFocusIntent';

const APP_VIEW_MODE_VISUAL_CHANGE_EVENT = 'vlaina-app-view-mode-visual-change';

const GlobalSearchDialog = lazy(async () => {
  const mod = await import('./GlobalSearchDialog');
  return { default: mod.GlobalSearchDialog };
});

function isVisibleViewModeButton(
  button: HTMLButtonElement | null | undefined,
): button is HTMLButtonElement {
  return Boolean(
    button
      && !button.disabled
      && !button.closest('[aria-hidden="true"], [hidden], [inert]'),
  );
}

export function AppViewModeSwitch() {
  const { t } = useI18n();
  const appViewMode = useUIStore((state) => state.appViewMode);
  const setAppViewMode = useUIStore((state) => state.setAppViewMode);
  const [visualAppViewMode, setVisualAppViewMode] = useState(appViewMode);
  const [highlightedAppViewMode, setHighlightedAppViewMode] = useState<SwitchableAppViewMode | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const switchRootRef = useRef<HTMLDivElement | null>(null);
  const visualAppViewModeRef = useRef(appViewMode);
  const pendingViewChangeTimerRef = useRef<number | null>(null);
  const viewModeButtonRefs = useRef<Partial<Record<SwitchableAppViewMode, HTMLButtonElement | null>>>({});

  useEffect(() => {
    const handleVisualModeChange = (event: Event) => {
      const viewMode = (event as CustomEvent<SwitchableAppViewMode>).detail;
      visualAppViewModeRef.current = viewMode;
      setVisualAppViewMode(viewMode);
    };
    window.addEventListener(APP_VIEW_MODE_VISUAL_CHANGE_EVENT, handleVisualModeChange);
    return () => {
      window.removeEventListener(APP_VIEW_MODE_VISUAL_CHANGE_EVENT, handleVisualModeChange);
    };
  }, []);

  useEffect(() => () => {
    if (pendingViewChangeTimerRef.current !== null) {
      window.clearTimeout(pendingViewChangeTimerRef.current);
    }
  }, []);

  useEffect(() => {
    if (
      appViewMode !== 'notes'
      && appViewMode !== 'chat'
      && appViewMode !== 'whiteboard'
      && appViewMode !== 'graph'
    ) return;
    if (visualAppViewModeRef.current === appViewMode) return;

    if (pendingViewChangeTimerRef.current !== null) {
      window.clearTimeout(pendingViewChangeTimerRef.current);
      pendingViewChangeTimerRef.current = null;
    }

    const animationFrame = window.requestAnimationFrame(() => {
      visualAppViewModeRef.current = appViewMode;
      setVisualAppViewMode(appViewMode);
    });
    return () => window.cancelAnimationFrame(animationFrame);
  }, [appViewMode]);

  const tryFulfillViewModeFocus = useCallback((viewMode: SwitchableAppViewMode) => {
    if (viewMode !== appViewMode) return false;
    return fulfillAppViewModeFocus(viewMode, () => {
      const button = viewModeButtonRefs.current[viewMode];
      if (!isVisibleViewModeButton(button)) return false;
      button.focus();
      return document.activeElement === button;
    });
  }, [appViewMode]);

  useEffect(() => subscribeAppViewModeFocusIntent((viewMode) => {
    tryFulfillViewModeFocus(viewMode);
  }), [tryFulfillViewModeFocus]);

  useLayoutEffect(() => {
    if (
      appViewMode !== 'notes'
      && appViewMode !== 'chat'
      && appViewMode !== 'whiteboard'
      && appViewMode !== 'graph'
    ) return;
    tryFulfillViewModeFocus(appViewMode);
  }, [appViewMode, tryFulfillViewModeFocus]);

  const handleSelectViewMode = useCallback((viewMode: SwitchableAppViewMode) => {
    if (viewMode === visualAppViewModeRef.current) return;
    if (
      viewMode !== appViewMode
      && switchRootRef.current?.contains(document.activeElement)
    ) {
      requestAppViewModeFocus(viewMode);
    }
    window.dispatchEvent(new CustomEvent(APP_VIEW_MODE_VISUAL_CHANGE_EVENT, { detail: viewMode }));
    if (pendingViewChangeTimerRef.current !== null) {
      window.clearTimeout(pendingViewChangeTimerRef.current);
    }
    pendingViewChangeTimerRef.current = window.setTimeout(() => {
      pendingViewChangeTimerRef.current = null;
      setAppViewMode(viewMode);
    }, themeAppViewModeSwitchTokens.commitDelayMs);
  }, [appViewMode, setAppViewMode]);

  const options = [
    {
      key: 'notes' as const,
      label: t('app.viewNotes'),
      icon: <Icon name="file.text" size={themeIconTokens.sizeCompact} />,
    },
    {
      key: 'graph' as const,
      label: t('app.viewGraph'),
      icon: <Icon name="graph.network" size={themeIconTokens.sizeCompact} />,
    },
    {
      key: 'whiteboard' as const,
      label: t('app.viewWhiteboard'),
      icon: <Icon name="editor.diagram" size={themeIconTokens.sizeCompact} />,
    },
    {
      key: 'chat' as const,
      label: t('app.viewChat'),
      icon: <Icon name="common.shootingStar" size={themeIconTokens.sizeCompact} />,
    },
  ];

  if (
    appViewMode !== 'notes'
    && appViewMode !== 'chat'
    && appViewMode !== 'whiteboard'
    && appViewMode !== 'graph'
  ) return null;

  return (
    <div
      ref={switchRootRef}
      data-app-view-mode-switch="true"
      className="relative mb-1.5 flex h-12 w-full shrink-0 items-center px-1.5"
      style={{ minWidth: APP_VIEW_MODE_SWITCH_MIN_WIDTH }}
    >
      <div
        role="tablist"
        aria-orientation="horizontal"
        aria-label={t('shortcut.action.toggleAppViewMode')}
        className="flex min-w-0 items-center gap-0.5"
      >
        {options.map((option, optionIndex) => {
          const selected = visualAppViewMode === option.key;
          const highlighted = selected || highlightedAppViewMode === option.key;
          return (
            <button
              key={option.key}
              ref={(element) => {
                viewModeButtonRefs.current[option.key] = element;
              }}
              type="button"
              role="tab"
              aria-label={option.label}
              aria-selected={selected}
              tabIndex={selected ? 0 : -1}
              onClick={() => handleSelectViewMode(option.key)}
              onKeyDown={(event) => {
                if (event.altKey || event.ctrlKey || event.metaKey) return;
                const nextIndex = event.key === 'ArrowRight'
                  ? (optionIndex + 1) % options.length
                  : event.key === 'ArrowLeft'
                    ? (optionIndex - 1 + options.length) % options.length
                    : event.key === 'Home'
                      ? 0
                      : event.key === 'End'
                        ? options.length - 1
                        : null;
                if (nextIndex === null) return;
                event.preventDefault();
                event.stopPropagation();
                const nextOption = options[nextIndex];
                if (!nextOption) return;
                handleSelectViewMode(nextOption.key);
                viewModeButtonRefs.current[nextOption.key]?.focus();
              }}
              onPointerEnter={() => setHighlightedAppViewMode(option.key)}
              onPointerLeave={() => setHighlightedAppViewMode(null)}
              onFocus={() => setHighlightedAppViewMode(option.key)}
              onBlur={() => setHighlightedAppViewMode(null)}
              className={cn(
                'relative z-[var(--vlaina-z-10)] flex h-[var(--vlaina-size-36px)] shrink-0 cursor-pointer items-center justify-start overflow-hidden rounded-full text-[length:var(--vlaina-font-sm)] font-medium leading-none transition-[padding,width] duration-[var(--vlaina-duration-200)] ease-[var(--vlaina-ease-in-out)] motion-reduce:transition-none',
                selected
                  ? 'w-auto pr-2 delay-0'
                  : 'w-[var(--vlaina-size-32px)] pr-0 delay-[var(--vlaina-duration-120)]',
              )}
              style={{
                color: highlighted ? 'var(--vlaina-sidebar-row-selected-text)' : 'var(--vlaina-sidebar-notes-text)',
              }}
            >
              <span
                aria-hidden="true"
                data-app-view-mode-surface="true"
                className={cn(
                  'pointer-events-none absolute inset-[var(--vlaina-size-2px)] rounded-full bg-[var(--vlaina-sidebar-row-selected-bg)] shadow-[var(--vlaina-shadow-selection-soft)] transition-opacity duration-[var(--vlaina-duration-200)] ease-[var(--vlaina-ease-in-out)] motion-reduce:transition-none',
                  selected
                    ? 'opacity-[var(--vlaina-opacity-100)] delay-0'
                    : 'opacity-[var(--vlaina-opacity-0)] delay-[var(--vlaina-duration-120)]',
                )}
              />
              <span className="relative flex h-[var(--vlaina-size-18px)] w-[var(--vlaina-size-32px)] shrink-0 items-center justify-center leading-none">
                {option.icon}
              </span>
              <span
                className={cn(
                  'relative inline-flex min-w-0 items-center overflow-hidden whitespace-nowrap leading-none transition-[max-width,opacity] duration-[var(--vlaina-duration-200)] ease-[var(--vlaina-ease-in-out)] motion-reduce:transition-none',
                  selected
                    ? 'max-w-[var(--vlaina-size-128px)] opacity-[var(--vlaina-opacity-100)] delay-0'
                    : 'max-w-0 opacity-[var(--vlaina-opacity-0)] delay-[var(--vlaina-duration-120)]',
                )}
              >
                {option.label}
              </span>
            </button>
          );
        })}
      </div>
      <button
        type="button"
        aria-label={t('sidebar.search')}
        onClick={() => setSearchOpen(true)}
        className="ml-auto flex size-[var(--vlaina-size-32px)] shrink-0 cursor-pointer items-center justify-center rounded-full text-[var(--vlaina-sidebar-notes-text)] transition-[background-color,box-shadow,color] duration-[var(--vlaina-duration-150)] hover:bg-[var(--vlaina-sidebar-row-selected-bg)] hover:text-[var(--vlaina-sidebar-row-selected-text)] hover:shadow-[var(--vlaina-shadow-selection-soft)] motion-reduce:transition-none"
      >
        <Icon name="common.search" size={themeIconTokens.sizeCompact} />
      </button>
      {searchOpen ? (
        <Suspense fallback={null}>
          <GlobalSearchDialog open onOpenChange={setSearchOpen} />
        </Suspense>
      ) : null}
    </div>
  );
}
