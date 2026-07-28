import { useUnifiedStore } from '@/stores/unified/useUnifiedStore';
import {
  selectMarkdownBodyLineNumbersEnabled,
  selectCodeBlockLineNumbersEnabled,
  selectMarkdownTypewriterModeEnabled,
} from '@/stores/unified/settings/markdownSettings';
import { ShortcutKeys, SOFT_SHORTCUT_KEY_CLASSNAME } from '@/components/ui/shortcut-keys';
import { cn } from '@/lib/utils';
import { raisedPillSurfaceClass } from '@/components/ui/surfaceStyles';
import { SettingsItem, SettingsSectionHeader } from '../components/SettingsControls';
import { SettingsSwitch } from '../components/SettingsFields';
import { MarkdownCodeBlockSettings } from './markdown/MarkdownCodeBlockSettings';
import { ImagesTab } from './ImagesTab';
import { useI18n } from '@/lib/i18n';

export function MarkdownTab() {
  const { t } = useI18n();
  const typewriterMode = useUnifiedStore(
    selectMarkdownTypewriterModeEnabled
  );
  const showBodyLineNumbers = useUnifiedStore(
    selectMarkdownBodyLineNumbersEnabled
  );
  const showCodeBlockLineNumbers = useUnifiedStore(
    selectCodeBlockLineNumbersEnabled
  );
  const setMarkdownTypewriterMode = useUnifiedStore(
    (state) => state.setMarkdownTypewriterMode
  );
  const setMarkdownBodyLineNumbers = useUnifiedStore(
    (state) => state.setMarkdownBodyLineNumbers
  );
  const setMarkdownCodeBlockLineNumbers = useUnifiedStore(
    (state) => state.setMarkdownCodeBlockLineNumbers
  );

  return (
    <div className="max-w-3xl pb-10" data-settings-tab-panel="markdown">
      <div className={cn('mb-8 flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-[var(--vlaina-ui-radius-group)] px-6 py-3 text-[var(--vlaina-font-13)] text-[var(--vlaina-sidebar-notes-text-soft)] max-[640px]:px-4', raisedPillSurfaceClass)}>
        <span className="min-w-0 flex-1">{t('settings.markdown.shortcutHint')}</span>
        <ShortcutKeys
          keys={['Ctrl', 'Shift', '/']}
          keyClassName={SOFT_SHORTCUT_KEY_CLASSNAME}
        />
      </div>
      <SettingsSectionHeader>{t('settings.markdown.editing')}</SettingsSectionHeader>
      <div className="space-y-1">
        <SettingsItem
          data-settings-item="markdown-typewriter-mode"
          title={t('settings.markdown.typewriterMode')}
          description={t('settings.markdown.typewriterModeDescription')}
        >
          <SettingsSwitch
            data-settings-control="markdown-typewriter-mode"
            checked={typewriterMode}
            aria-label={t('settings.markdown.typewriterMode')}
            onChange={setMarkdownTypewriterMode}
            activeColor="bg-[var(--vlaina-sidebar-row-selected-text)]"
          />
        </SettingsItem>
        <SettingsItem
          data-settings-item="markdown-body-line-numbers"
          title={t('settings.markdown.bodyLineNumbers')}
          description={t('settings.markdown.bodyLineNumbersDescription')}
        >
          <SettingsSwitch
            data-settings-control="markdown-body-line-numbers"
            checked={showBodyLineNumbers}
            aria-label={t('settings.markdown.bodyLineNumbers')}
            onChange={setMarkdownBodyLineNumbers}
            activeColor="bg-[var(--vlaina-sidebar-row-selected-text)]"
          />
        </SettingsItem>
      </div>

      <MarkdownCodeBlockSettings
        showLineNumbers={showCodeBlockLineNumbers}
        onShowLineNumbersChange={setMarkdownCodeBlockLineNumbers}
      />
      <ImagesTab />
    </div>
  );
}
