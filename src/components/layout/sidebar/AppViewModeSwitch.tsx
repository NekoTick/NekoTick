import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Icon } from '@/components/ui/icons';
import { raisedPillSurfaceClass } from '@/components/ui/surfaceStyles';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useI18n } from '@/lib/i18n';
import { APP_VIEW_MODE_SWITCH_MIN_WIDTH } from '@/lib/layout/sidebarWidth';
import { cn } from '@/lib/utils';
import { useUIStore } from '@/stores/uiSlice';
import { themeIconTokens, themeMotionTokens } from '@/styles/themeTokens';
import {
  fulfillAppViewModeFocus,
  requestAppViewModeFocus,
  subscribeAppViewModeFocusIntent,
  type SwitchableAppViewMode,
} from './appViewModeFocusIntent';

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
  const [optimisticAppViewMode, setOptimisticAppViewMode] = useState<typeof appViewMode | null>(null);
  const [highlightedAppViewMode, setHighlightedAppViewMode] = useState<SwitchableAppViewMode | null>(null);
  const switchRootRef = useRef<HTMLDivElement | null>(null);
  const viewModeButtonRefs = useRef<Partial<Record<SwitchableAppViewMode, HTMLButtonElement | null>>>({});

  useEffect(() => {
    setOptimisticAppViewMode(null);
  }, [appViewMode]);

  const visualAppViewMode = optimisticAppViewMode ?? appViewMode;

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
    if (
      viewMode !== appViewMode
      && switchRootRef.current?.contains(document.activeElement)
    ) {
      requestAppViewModeFocus(viewMode);
    }
    setOptimisticAppViewMode(viewMode);
    setAppViewMode(viewMode);
  }, [appViewMode, setAppViewMode]);

  const handleNavigateViewMode = useCallback((
    currentIndex: number,
    direction: 'next' | 'previous' | 'first' | 'last',
    options: readonly { key: SwitchableAppViewMode }[],
  ) => {
    const nextIndex = direction === 'next'
      ? (currentIndex + 1) % options.length
      : direction === 'previous'
        ? (currentIndex - 1 + options.length) % options.length
        : direction === 'first'
          ? 0
          : options.length - 1;
    const nextKey = options[nextIndex]?.key;
    if (!nextKey) return;
    handleSelectViewMode(nextKey);
    viewModeButtonRefs.current[nextKey]?.focus();
  }, [handleSelectViewMode]);

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
  if (!options.some((option) => option.key === appViewMode)) return null;
  const selectedIndex = Math.max(0, options.findIndex((option) => option.key === visualAppViewMode));
  const collapsedButtonsWidth = Array.from(
    { length: options.length - 1 },
    () => 'var(--vlaina-size-44px)',
  ).join(' - ');

  return (
    <div
      ref={switchRootRef}
      data-app-view-mode-switch="true"
      role="tablist"
      aria-orientation="horizontal"
      aria-label={t('shortcut.action.toggleAppViewMode')}
      className={cn(
        'relative mb-1.5 flex h-14 w-full shrink-0 items-center rounded-[var(--vlaina-ui-radius-group)] p-1.5',
        raisedPillSurfaceClass,
      )}
      style={{ minWidth: APP_VIEW_MODE_SWITCH_MIN_WIDTH }}
    >
      <span
        aria-hidden="true"
        className="absolute inset-y-1.5 left-1.5 rounded-full bg-[var(--vlaina-sidebar-row-selected-bg)] shadow-[var(--vlaina-shadow-selection-soft)] transition-transform duration-[var(--vlaina-duration-300)] ease-[var(--vlaina-ease-feedback)] motion-reduce:transition-none"
        style={{
          width: `calc(100% - var(--vlaina-space-075rem) - ${collapsedButtonsWidth})`,
          transform: `translate3d(${selectedIndex * themeMotionTokens.appViewSwitchCollapsedWidth}px, 0, 0)`,
        }}
      />
      {options.map((option, optionIndex) => {
        const selected = visualAppViewMode === option.key;
        const highlighted = selected || highlightedAppViewMode === option.key;
        return (
          <Tooltip key={option.key}>
            <TooltipTrigger asChild>
              <button
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
                  const direction = event.key === 'ArrowRight'
                    ? 'next'
                    : event.key === 'ArrowLeft'
                      ? 'previous'
                      : event.key === 'Home'
                        ? 'first'
                        : event.key === 'End'
                          ? 'last'
                          : null;
                  if (!direction) return;
                  event.preventDefault();
                  event.stopPropagation();
                  handleNavigateViewMode(optionIndex, direction, options);
                }}
                onPointerEnter={() => setHighlightedAppViewMode(option.key)}
                onPointerLeave={() => setHighlightedAppViewMode(null)}
                onFocus={() => setHighlightedAppViewMode(option.key)}
                onBlur={() => setHighlightedAppViewMode(null)}
                className={cn(
                  'relative z-[var(--vlaina-z-10)] flex h-[var(--vlaina-size-44px)] min-w-[var(--vlaina-size-44px)] basis-[var(--vlaina-size-44px)] shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-full text-[length:var(--vlaina-font-15)] font-medium leading-none transition-[flex-grow,gap,padding] duration-[var(--vlaina-duration-300)] ease-[var(--vlaina-ease-feedback)] motion-reduce:transition-none',
                  selected
                    ? 'gap-2 px-3'
                    : 'gap-0 px-0',
                )}
                style={{
                  flexGrow: selected ? 1 : 0,
                  color: highlighted ? 'var(--vlaina-sidebar-row-selected-text)' : 'var(--vlaina-sidebar-notes-text)',
                }}
              >
                <span className="relative flex size-[var(--vlaina-size-18px)] shrink-0 items-center justify-center leading-none">
                  {option.icon}
                </span>
                <span
                  className={cn(
                    'relative inline-flex min-w-0 items-center truncate whitespace-nowrap leading-none transition-[max-width,opacity,transform] duration-[var(--vlaina-duration-300)] ease-[var(--vlaina-ease-feedback)] motion-reduce:transition-none',
                    selected
                      ? 'max-w-[var(--vlaina-size-128px)] translate-x-0 opacity-[var(--vlaina-opacity-100)]'
                      : 'max-w-0 -translate-x-1 opacity-[var(--vlaina-opacity-0)]',
                  )}
                >
                  {option.label}
                </span>
              </button>
            </TooltipTrigger>
            {!selected ? (
              <TooltipContent side="right" sideOffset={6}>{option.label}</TooltipContent>
            ) : null}
          </Tooltip>
        );
      })}
    </div>
  );
}
