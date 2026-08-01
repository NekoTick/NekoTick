import { useCallback, useEffect, useState } from 'react';
import { Icon } from '@/components/ui/icons';
import { useToastStore } from '@/stores/useToastStore';
import { useUnifiedStore } from '@/stores/unified/useUnifiedStore';
import { openPathInFileManager } from '@/lib/desktop/shell';
import { useI18n } from '@/lib/i18n';
import { normalizeUserFacingErrorMessage } from '@/lib/i18n/userFacingErrors';
import {
  ensureImportedMarkdownThemesDirectory,
  listImportedMarkdownThemesFromDirectory,
  syncImportedMarkdownThemesFromDirectory,
} from '@/lib/markdown/theme-compatibility/importedThemeStorage';
import type { ImportedMarkdownThemeMetadata } from '@/lib/markdown/theme-compatibility/types';
import {
  preloadCompiledImportedMarkdownThemeStyles,
  preloadMarkdownThemeCompiler,
} from '@/components/markdown-theme/markdownThemeCompiler';
import { cn } from '@/lib/utils';
import { themeUiFeedbackTokens } from '@/styles/themeTokens';
import { selectMarkdownImportedThemeId } from '@/stores/unified/settings/markdownSettings';
import { dialogActionIconButtonClassName } from '@/components/common/DialogCloseIconButton';
import { SettingsItem, SettingsSectionHeader } from '../components/SettingsControls';
import { AppearanceFontSizeControl } from './appearance/AppearanceFontSizeControl';
import { ThemeAppearanceControl } from './appearance/ThemeAppearanceControl';

interface AppearanceTabProps {
  onFontSizePreviewingChange?: (previewing: boolean) => void;
}

export function AppearanceTab({ onFontSizePreviewingChange }: AppearanceTabProps = {}) {
  const { t } = useI18n();
  const [isFontSizePreviewing, setIsFontSizePreviewing] = useState(false);
  const colorMode = useUnifiedStore((state) => {
    const mode = state.data.settings.ui?.colorMode;
    return mode === 'light' || mode === 'dark' ? mode : 'system';
  });
  const importedThemeId = useUnifiedStore(selectMarkdownImportedThemeId);
  const setColorMode = useUnifiedStore((state) => state.setColorMode);
  const setMarkdownImportedThemeId = useUnifiedStore((state) => state.setMarkdownImportedThemeId);
  const addToast = useToastStore((state) => state.addToast);
  const [importedThemes, setImportedThemes] = useState<ImportedMarkdownThemeMetadata[]>([]);

  const refreshImportedThemes = useCallback(async () => {
    try {
      const result = await syncImportedMarkdownThemesFromDirectory();
      setImportedThemes(result.themes);
    } catch {
      try {
        setImportedThemes(await listImportedMarkdownThemesFromDirectory());
      } catch {
        setImportedThemes([]);
      }
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    void listImportedMarkdownThemesFromDirectory()
      .then((themes) => {
        if (!cancelled) {
          setImportedThemes(themes);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setImportedThemes([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleOpenThemeDirectory = useCallback(async () => {
    try {
      const directoryPath = await ensureImportedMarkdownThemesDirectory();
      await openPathInFileManager(directoryPath);
    } catch (error) {
      const message = normalizeUserFacingErrorMessage(error, 'settings.appearance.openThemeFolderFailed');
      addToast(message, 'error', themeUiFeedbackTokens.errorToastDurationMs);
    }
  }, [addToast, t]);

  const handleThemeWarmup = useCallback(() => {
    preloadMarkdownThemeCompiler();
  }, []);

  const handleThemePreload = useCallback((themeId: string) => {
    preloadCompiledImportedMarkdownThemeStyles(themeId);
  }, []);

  const handleFontSizePreviewingChange = useCallback((previewing: boolean) => {
    setIsFontSizePreviewing(previewing);
    onFontSizePreviewingChange?.(previewing);
  }, [onFontSizePreviewingChange]);

  return (
    <div
      className="max-w-3xl pb-10"
      data-settings-tab-panel="appearance"
    >
      <AppearanceFontSizeControl onPreviewingChange={handleFontSizePreviewingChange} />

      <SettingsSectionHeader className={cn(isFontSizePreviewing && "pointer-events-none opacity-[var(--vlaina-opacity-0)]")}>
        {t('settings.appearance.display')}
      </SettingsSectionHeader>
      <SettingsItem
        data-settings-item="appearance-theme"
        title={t('settings.appearance.theme')}
        className={cn(
          "flex-wrap gap-y-3",
          isFontSizePreviewing && "pointer-events-none opacity-[var(--vlaina-opacity-0)]"
        )}
      >
        <div className="flex min-w-0 flex-wrap items-center justify-end gap-2 max-[420px]:w-full max-[420px]:justify-start">
          <ThemeAppearanceControl
            colorMode={colorMode}
            importedThemeId={importedThemeId}
            importedThemes={importedThemes}
            onColorModeChange={setColorMode}
            onThemeChange={setMarkdownImportedThemeId}
            onThemeRefresh={() => void refreshImportedThemes()}
            onThemeWarmup={handleThemeWarmup}
            onThemePreload={handleThemePreload}
          />
          <button
            type="button"
            aria-label={t('settings.appearance.openThemeFolder')}
            data-settings-action="open-theme-folder"
            onClick={() => void handleOpenThemeDirectory()}
            className={dialogActionIconButtonClassName}
          >
            <Icon name="file.folderOpenArrow" size="md" />
          </button>
        </div>
      </SettingsItem>
    </div>
  );
}
