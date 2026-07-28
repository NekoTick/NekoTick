import type { CSSProperties } from 'react';
import { raisedPillSurfaceClass } from '@/components/ui/surfaceStyles';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import {
  UI_FONT_SIZE_DEFAULT,
  UI_FONT_SIZE_MAX,
  UI_FONT_SIZE_MIN,
} from '@/stores/uiSlice';
import { useAppearanceFontSizeControl } from './useAppearanceFontSizeControl';

function buildFontSizeSliderBackground(progressPercent: string): string {
  return [
    'linear-gradient(to right,',
    'var(--vlaina-sidebar-row-selected-text) 0%,',
    `var(--vlaina-sidebar-row-selected-text) ${progressPercent},`,
    `var(--vlaina-bg-tertiary) ${progressPercent},`,
    'var(--vlaina-bg-tertiary) 100%)',
  ].join(' ');
}

interface AppearanceFontSizeControlProps {
  onPreviewingChange?: (previewing: boolean) => void;
}

export function AppearanceFontSizeControl({ onPreviewingChange }: AppearanceFontSizeControlProps) {
  const { t } = useI18n();
  const {
    committedFontSize,
    displayedFontSize,
    isPreviewingFontSize,
    progressPercent,
    handleFontSizeChange,
    handleFontSizeWheel,
    beginFontSizePreview,
    handleResetFontSize,
  } = useAppearanceFontSizeControl(onPreviewingChange);

  const fontSizeSlider = (
    <input
      type="range"
      spellCheck={false}
      data-settings-control="appearance-font-size"
      aria-label={t('settings.appearance.baseFontSize')}
      min={UI_FONT_SIZE_MIN}
      max={UI_FONT_SIZE_MAX}
      step="1"
      value={displayedFontSize}
      onChange={handleFontSizeChange}
      onWheel={handleFontSizeWheel}
      onPointerDown={beginFontSizePreview}
      onMouseDown={beginFontSizePreview}
      className="appearance-font-size-slider h-1.5 w-full min-w-0 cursor-pointer appearance-none rounded-lg accent-[var(--vlaina-sidebar-row-selected-text)]"
      style={{
        '--vlaina-appearance-font-size-progress': progressPercent,
        '--vlaina-gradient-appearance-font-size-slider': buildFontSizeSliderBackground(progressPercent),
        background: 'var(--vlaina-gradient-appearance-font-size-slider)',
      } as CSSProperties}
    />
  );

  return (
    <>
      <div className={cn(
        "mb-4 flex items-center justify-between px-2",
        isPreviewingFontSize && "pointer-events-none opacity-[var(--vlaina-opacity-0)]",
      )}>
        <span className="text-[var(--vlaina-font-13)] font-medium text-[var(--vlaina-sidebar-notes-text-soft)]">
          {t('settings.appearance.fontSize')}
        </span>
      </div>

      <div
        className={cn(
          "mb-3 flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-[var(--vlaina-ui-radius-group)] px-6 py-4 max-[640px]:px-4",
          isPreviewingFontSize
            ? "border border-transparent !bg-transparent !shadow-[var(--vlaina-shadow-none)] hover:!shadow-[var(--vlaina-shadow-none)]"
            : raisedPillSurfaceClass,
        )}
      >
        <div className={cn(
          "min-w-max flex-[1_1_auto] pr-4 max-[420px]:w-full max-[420px]:pr-0",
          isPreviewingFontSize && "pointer-events-none opacity-[var(--vlaina-opacity-0)]",
        )}>
          <div className="mb-0.5 whitespace-nowrap text-[var(--vlaina-font-sm)] font-semibold text-[var(--vlaina-sidebar-notes-text)]">
            {t('settings.appearance.baseFontSize')}
          </div>
        </div>
        <div className="ml-auto flex min-w-0 flex-shrink-0 items-center gap-4 max-[420px]:ml-0 max-[420px]:w-full max-[420px]:flex-wrap">
          <div className="min-w-[var(--vlaina-size-180px)] flex-1 max-[420px]:min-w-0">
            {fontSizeSlider}
          </div>
          <span className={cn(
            "w-10 text-sm font-medium text-right tabular-nums text-[var(--vlaina-sidebar-notes-text)]",
            isPreviewingFontSize && "pointer-events-none",
          )}>
            {displayedFontSize}px
          </span>
          <button
            type="button"
            data-settings-action="reset-font-size"
            onClick={handleResetFontSize}
            disabled={committedFontSize === UI_FONT_SIZE_DEFAULT}
            className={cn(
              "rounded-full px-3 py-1.5 text-[var(--vlaina-font-xs)] font-medium text-[var(--vlaina-sidebar-row-selected-text)] transition-colors hover:bg-[var(--vlaina-sidebar-row-selected-bg)] disabled:pointer-events-none disabled:text-[var(--vlaina-sidebar-notes-text-soft)] disabled:opacity-[var(--vlaina-opacity-45)]",
              isPreviewingFontSize && "pointer-events-none opacity-[var(--vlaina-opacity-0)]",
            )}
          >
            {t('common.reset')}
          </button>
        </div>
      </div>
    </>
  );
}
