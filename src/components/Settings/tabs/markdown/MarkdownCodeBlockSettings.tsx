import { SettingsItem, SettingsSectionHeader } from '../../components/SettingsControls';
import { SettingsSwitch } from '../../components/SettingsFields';
import { useI18n } from '@/lib/i18n';

interface MarkdownCodeBlockSettingsProps {
  showLineNumbers: boolean;
  onShowLineNumbersChange: (checked: boolean) => void;
}

export function MarkdownCodeBlockSettings({
  showLineNumbers,
  onShowLineNumbersChange,
}: MarkdownCodeBlockSettingsProps) {
  const { t } = useI18n();

  return (
    <>
      <SettingsSectionHeader>{t('settings.markdown.codeBlock')}</SettingsSectionHeader>

      <div className="space-y-1">
        <SettingsItem
          data-settings-item="markdown-code-block-line-numbers"
          title={t('settings.markdown.showLineNumbers')}
        >
          <SettingsSwitch
            data-settings-control="markdown-code-block-line-numbers"
            checked={showLineNumbers}
            aria-label={t('settings.markdown.showLineNumbers')}
            onChange={onShowLineNumbersChange}
            activeColor="bg-[var(--vlaina-sidebar-row-selected-text)]"
          />
        </SettingsItem>
      </div>
    </>
  );
}
