import { useEffect, useRef } from 'react';
import { raisedPillSurfaceClass } from '@/components/ui/surfaceStyles';
import {
  clearMarkdownThemePreview,
  setMarkdownThemePreviewId,
} from '@/components/markdown-theme/markdownThemePreview';
import { Icon } from '@/components/ui/icons';
import type { IconName } from '@/components/ui/icons';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import type { ImportedMarkdownThemeMetadata } from '@/lib/markdown/theme-compatibility/types';
import {
  settingsPillDropdownContentClassName,
  settingsPillDropdownItemClassName,
  settingsPillDropdownItemSelectedClassName,
} from '../../styles';

export type ColorMode = 'system' | 'light' | 'dark';
const THEME_PREVIEW_DELAY_MS = 80;

const COLOR_MODE_OPTIONS = [
  {
    value: 'system',
    iconName: 'theme.system' as IconName,
  },
  {
    value: 'light',
    iconName: 'theme.light' as IconName,
  },
  {
    value: 'dark',
    iconName: 'theme.dark' as IconName,
  },
] as const;

interface ColorModeToggleProps {
  colorMode: ColorMode;
  onChange: (mode: ColorMode) => void;
}

function ColorModeToggle({ colorMode, onChange }: ColorModeToggleProps) {
  const { t } = useI18n();
  const colorModeIndex = Math.max(0, COLOR_MODE_OPTIONS.findIndex((option) => option.value === colorMode));

  return (
    <div
      className="relative flex h-8 w-[var(--vlaina-size-126px)] shrink-0 items-center"
      data-settings-color-mode-control="true"
    >
      <span
        aria-hidden="true"
        className="absolute inset-y-0 left-0 w-1/3 rounded-full bg-[var(--vlaina-accent-light)] shadow-[var(--vlaina-shadow-selection-soft)] transition-transform duration-[var(--vlaina-duration-200)] ease-out"
        style={{ transform: `translateX(${colorModeIndex * 100}%)` }}
      />
      {COLOR_MODE_OPTIONS.map((option) => {
        const isActive = colorMode === option.value;
        return (
          <button
            key={option.value}
            type="button"
            aria-label={t(`settings.appearance.${option.value}Mode`)}
            aria-pressed={isActive}
            data-settings-color-mode={option.value}
            onClick={() => onChange(option.value)}
            className={cn(
              "relative z-[var(--vlaina-z-10)] flex h-8 flex-1 items-center justify-center rounded-full transition-colors",
              isActive
                ? "text-[var(--vlaina-accent)]"
                : "text-[var(--vlaina-sidebar-notes-text)] hover:text-[var(--vlaina-accent)]"
            )}
          >
            <Icon name={option.iconName} size="sm" />
          </button>
        );
      })}
    </div>
  );
}

interface ThemeDropdownProps {
  importedThemeId: string | null;
  importedThemes: ImportedMarkdownThemeMetadata[];
  onChange: (themeId: string | null) => void;
  onRefresh: () => void;
  onWarmup: () => void;
  onThemePreload: (themeId: string) => void;
}

function ThemeDropdown({
  importedThemeId,
  importedThemes,
  onChange,
  onRefresh,
  onWarmup,
  onThemePreload,
}: ThemeDropdownProps) {
  const { t } = useI18n();
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeTheme = importedThemeId
    ? importedThemes.find((theme) => theme.id === importedThemeId) ?? null
    : null;
  const activeThemeName = activeTheme?.name ?? t('settings.appearance.theme.default');

  const cancelScheduledPreview = () => {
    if (previewTimerRef.current === null) return;
    clearTimeout(previewTimerRef.current);
    previewTimerRef.current = null;
  };

  const schedulePreview = (themeId: string | null) => {
    cancelScheduledPreview();
    previewTimerRef.current = setTimeout(() => {
      previewTimerRef.current = null;
      if (themeId) onThemePreload(themeId);
      setMarkdownThemePreviewId(themeId);
    }, THEME_PREVIEW_DELAY_MS);
  };

  const clearPreview = () => {
    cancelScheduledPreview();
    clearMarkdownThemePreview();
  };

  useEffect(() => () => {
    if (previewTimerRef.current !== null) {
      clearTimeout(previewTimerRef.current);
    }
    clearMarkdownThemePreview();
  }, []);

  return (
    <DropdownMenu onOpenChange={(open) => {
      if (open) {
        onWarmup();
        onRefresh();
      } else {
        clearPreview();
      }
    }}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex h-8 w-[var(--vlaina-size-132px)] max-w-full min-w-0 items-center justify-between gap-3 rounded-full px-2.5 text-[var(--vlaina-font-13)] font-medium text-[var(--vlaina-sidebar-notes-text)] transition-colors hover:bg-[var(--vlaina-accent-light)] hover:text-[var(--vlaina-accent)]"
        >
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate">{activeThemeName}</span>
          </span>
          <Icon name="nav.chevronDown" size="sm" className="text-[var(--vlaina-sidebar-notes-text-soft)]" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        onPointerLeave={clearPreview}
        className={cn(
          settingsPillDropdownContentClassName,
          "min-w-[var(--vlaina-size-170px)]",
        )}
      >
        <DropdownMenuItem
          onFocus={() => schedulePreview(null)}
          onPointerEnter={() => schedulePreview(null)}
          onSelect={() => {
            clearPreview();
            onChange(null);
          }}
          className={cn(
            settingsPillDropdownItemClassName,
            importedThemeId === null && settingsPillDropdownItemSelectedClassName
          )}
        >
          <span className="truncate">{t('settings.appearance.theme.default')}</span>
        </DropdownMenuItem>
        {importedThemes.map((theme) => (
          <DropdownMenuItem
            key={theme.id}
            onFocus={() => schedulePreview(theme.id)}
            onPointerEnter={() => schedulePreview(theme.id)}
            onSelect={() => {
              clearPreview();
              onChange(theme.id);
            }}
            className={cn(
              settingsPillDropdownItemClassName,
              importedThemeId === theme.id && settingsPillDropdownItemSelectedClassName
            )}
          >
            <span className="min-w-0 flex-1 truncate">{theme.name}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface ThemeAppearanceControlProps {
  colorMode: ColorMode;
  importedThemeId: string | null;
  importedThemes: ImportedMarkdownThemeMetadata[];
  onColorModeChange: (mode: ColorMode) => void;
  onThemeChange: (themeId: string | null) => void;
  onThemeRefresh: () => void;
  onThemeWarmup: () => void;
  onThemePreload: (themeId: string) => void;
}

export function ThemeAppearanceControl({
  colorMode,
  importedThemeId,
  importedThemes,
  onColorModeChange,
  onThemeChange,
  onThemeRefresh,
  onThemeWarmup,
  onThemePreload,
}: ThemeAppearanceControlProps) {
  return (
    <div className={cn(
      "flex h-11 min-w-0 max-w-full items-center rounded-[var(--vlaina-ui-radius-group)] p-1.5 max-[520px]:h-auto max-[520px]:w-full max-[520px]:flex-wrap max-[520px]:gap-1.5",
      raisedPillSurfaceClass,
    )}>
      <ColorModeToggle colorMode={colorMode} onChange={onColorModeChange} />
      <div className="mx-2 h-5 w-px bg-[var(--vlaina-divider)] max-[520px]:hidden" />
      <div className="min-w-0 flex-1 max-[520px]:w-full max-[520px]:flex-none">
        <ThemeDropdown
          importedThemeId={importedThemeId}
          importedThemes={importedThemes}
          onChange={onThemeChange}
          onRefresh={onThemeRefresh}
          onWarmup={onThemeWarmup}
          onThemePreload={onThemePreload}
        />
      </div>
    </div>
  );
}
