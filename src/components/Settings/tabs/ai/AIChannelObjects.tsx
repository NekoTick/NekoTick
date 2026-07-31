import { useLayoutEffect, useRef, type DragEvent } from 'react';
import { SettingsSwitch } from '@/components/Settings/components/SettingsFields';
import { raisedPillSurfaceClass } from '@/components/ui/surfaceStyles';
import { Icon } from '@/components/ui/icons';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';

function formatChannelBaseUrl(baseUrl: string) {
  const trimmed = baseUrl.trim();
  if (!trimmed) {
    return '';
  }

  try {
    const normalized = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
      ? trimmed
      : `https://${trimmed}`;
    return new URL(normalized).host.replace(/^www\./i, '');
  } catch {
    return trimmed.replace(/^https?:\/\//i, '').split(/[/?#]/)[0] || trimmed;
  }
}

const CHANNEL_BASE_URL_MIN_FONT_SIZE_PX = 8;
const CHANNEL_BASE_URL_FIT_GUTTER_PX = 1;

function fitChannelBaseUrlTextToWidth(element: HTMLElement) {
  element.style.fontSize = '';

  const availableWidth = element.clientWidth - CHANNEL_BASE_URL_FIT_GUTTER_PX;
  if (availableWidth <= 0) {
    return;
  }

  const computedFontSize = Number.parseFloat(window.getComputedStyle(element).fontSize);
  if (!Number.isFinite(computedFontSize) || computedFontSize <= 0) {
    return;
  }

  const naturalWidth = element.scrollWidth;
  if (naturalWidth <= availableWidth) {
    return;
  }

  const nextFontSize = Math.max(
    CHANNEL_BASE_URL_MIN_FONT_SIZE_PX,
    Math.min(computedFontSize, computedFontSize * (availableWidth / naturalWidth))
  );
  element.style.fontSize = `${nextFontSize}px`;
}

function ChannelBaseUrlLabel({
  label,
  title,
  active,
}: {
  label: string;
  title?: string;
  active?: boolean;
}) {
  const textRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const element = textRef.current;
    if (!element || typeof window === 'undefined') {
      return;
    }

    let animationFrameId = 0;
    let lastObservedWidth = -1;
    const scheduleFit = (observedWidth?: number) => {
      if (typeof observedWidth === 'number') {
        if (Math.abs(observedWidth - lastObservedWidth) < 0.5) {
          return;
        }
        lastObservedWidth = observedWidth;
      }

      window.cancelAnimationFrame(animationFrameId);
      animationFrameId = window.requestAnimationFrame(() => {
        fitChannelBaseUrlTextToWidth(element);
      });
    };

    scheduleFit();

    const resizeObserver = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver((entries) => {
        const observedWidth = entries[0]?.contentRect.width;
        scheduleFit(observedWidth);
      })
      : null;
    const handleWindowResize = () => scheduleFit();

    if (resizeObserver) {
      resizeObserver.observe(element);
    } else {
      window.addEventListener('resize', handleWindowResize);
    }

    return () => {
      window.cancelAnimationFrame(animationFrameId);
      resizeObserver?.disconnect();
      window.removeEventListener('resize', handleWindowResize);
      element.style.fontSize = '';
    };
  }, [label]);

  return (
    <div
      ref={textRef}
      className={cn(
        "mt-1 truncate text-[var(--vlaina-font-xs)]",
        active ? "text-[var(--vlaina-sidebar-row-selected-text-soft)]" : "text-[var(--vlaina-sidebar-notes-text-soft)]"
      )}
      title={title}
    >
      {label}
    </div>
  );
}

export function ChannelObject({
  providerId,
  name,
  baseUrl,
  enabled,
  modelCount,
  active = false,
  dragging = false,
  dragOver = false,
  onClick,
  onMiddleClick,
  onToggleEnabled,
  onDelete,
  onDragStart,
  onDragEnter,
  onDragOver,
  onDrop,
  onDragEnd,
}: {
  providerId: string;
  name: string;
  baseUrl: string;
  enabled: boolean;
  modelCount: number;
  active?: boolean;
  dragging?: boolean;
  dragOver?: boolean;
  onClick?: () => void;
  onMiddleClick?: () => void;
  onToggleEnabled?: (enabled: boolean) => void;
  onDelete?: () => void;
  onDragStart?: (event: DragEvent<HTMLDivElement>) => void;
  onDragEnter?: (event: DragEvent<HTMLDivElement>) => void;
  onDragOver?: (event: DragEvent<HTMLDivElement>) => void;
  onDrop?: (event: DragEvent<HTMLDivElement>) => void;
  onDragEnd?: (event: DragEvent<HTMLDivElement>) => void;
}) {
  const { t } = useI18n();
  const baseUrlLabel = baseUrl ? formatChannelBaseUrl(baseUrl) : t('settings.ai.notConfiguredYet');

  return (
    <div
      role="button"
      tabIndex={0}
      data-settings-ai-channel-card={providerId}
      data-active={active ? 'true' : undefined}
      draggable
      aria-pressed={active}
      aria-grabbed={dragging ? true : undefined}
      onClick={onClick}
      onDragStart={onDragStart}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onClick?.();
        }
      }}
      onMouseDown={(event) => {
        if (event.button !== 1) {
          return;
        }
        event.preventDefault();
      }}
      onMouseUp={(event) => {
        if (event.button !== 1) {
          return;
        }
        onMiddleClick?.();
      }}
      className={cn(
        'group/channel relative min-h-[var(--vlaina-size-112px)] cursor-grab rounded-[var(--vlaina-ui-radius-group)] border transition-all duration-[var(--vlaina-duration-200)] active:cursor-grabbing',
        active
          ? 'bg-[var(--vlaina-sidebar-row-selected-bg)]'
          : raisedPillSurfaceClass,
        dragOver
          ? 'border-[var(--vlaina-sidebar-row-selected-text)] shadow-[var(--vlaina-shadow-md)]'
          : 'border-transparent',
        dragging && 'opacity-[var(--vlaina-opacity-0)]'
      )}
    >
      <div className="block w-full px-5 pb-3 pt-5 text-left">
        <div className="min-w-0 pr-7">
          <div className={cn(
            "truncate text-[var(--vlaina-font-sm)] font-bold",
            active ? "text-[var(--vlaina-sidebar-row-selected-text)]" : "text-[var(--vlaina-sidebar-notes-text)]"
          )}>
            {name}
          </div>
        </div>
        <ChannelBaseUrlLabel
          label={baseUrlLabel}
          title={baseUrl || undefined}
          active={active}
        />
      </div>

      <div className={cn(
        "flex items-center justify-between px-5 pb-5 text-[var(--vlaina-font-11)] font-bold",
        active ? "text-[var(--vlaina-sidebar-row-selected-text-muted)]" : "text-[var(--vlaina-sidebar-notes-text-soft)]"
      )}>
        <span className="shrink-0 whitespace-nowrap leading-none">{t('settings.ai.modelCount', { count: modelCount })}</span>
        <div className="flex h-7 shrink-0 items-center gap-2" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
          <button
            type="button"
            data-settings-ai-action="delete-channel"
            onClick={(event) => {
              event.stopPropagation();
              onDelete?.();
            }}
            aria-label={t('settings.ai.deleteChannelNamed', { name })}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--vlaina-sidebar-notes-text-soft)] opacity-[var(--vlaina-opacity-0)] transition-all duration-[var(--vlaina-duration-200)] hover:bg-transparent hover:text-[var(--vlaina-color-status-danger-fg)] hover:shadow-[var(--vlaina-shadow-none)] group-hover/channel:opacity-[var(--vlaina-opacity-100)] focus-visible:opacity-[var(--vlaina-opacity-100)] dark:hover:bg-transparent"
          >
            <Icon name="common.close" size="xs" />
          </button>
          <SettingsSwitch
            data-settings-control="ai-channel-enabled"
            checked={enabled}
            aria-label={`${t('common.toggleSetting')}: ${name}`}
            onChange={(nextEnabled) => onToggleEnabled?.(nextEnabled)}
            className="origin-right scale-[var(--vlaina-scale-84)]"
            activeColor="bg-[var(--vlaina-sidebar-row-selected-text)]"
          />
        </div>
      </div>
    </div>
  );
}

export function CreateChannelObject({ onClick }: { onClick: () => void }) {
  const { t } = useI18n();

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={t('settings.ai.newChannel')}
      data-settings-ai-action="new-channel"
      className={cn(
        "flex min-h-[var(--vlaina-size-112px)] items-center justify-center rounded-[var(--vlaina-ui-radius-group)] border border-transparent transition-all duration-[var(--vlaina-duration-200)] shadow-[var(--vlaina-shadow-sm)] hover:shadow-[var(--vlaina-shadow-md)] active:scale-[var(--vlaina-scale-98)]",
        raisedPillSurfaceClass
      )}
    >
      <div className="flex flex-col items-center gap-1">
        <div className="text-[var(--vlaina-font-24)] font-light leading-none text-[var(--vlaina-sidebar-notes-text-soft)]">+</div>
        <div className="text-[var(--vlaina-font-10)] font-bold uppercase tracking-widest text-[var(--vlaina-sidebar-notes-text-soft)]">{t('settings.ai.newChannel')}</div>
      </div>
    </button>
  );
}
