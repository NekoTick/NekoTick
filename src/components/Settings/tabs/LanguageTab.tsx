import {
  APP_LANGUAGES,
  SYSTEM_LANGUAGE_PREFERENCE,
  type AppLanguagePreference,
  useI18n,
  getBrowserLanguages,
  resolveSystemLanguage,
} from '@/lib/i18n';
import { cn } from '@/lib/utils';
import {
  getSidebarLabelClass,
} from '@/components/layout/sidebar/sidebarLabelStyles';
import { SettingsSectionHeader } from '../components/SettingsControls';
import { raisedPillSurfaceClass } from '@/components/ui/surfaceStyles';

const ACTUAL_SYSTEM_LANG_CODE = resolveSystemLanguage(getBrowserLanguages());
const ACTUAL_SYSTEM_LANG_NATIVE_NAME = APP_LANGUAGES.find(
  (option) => option.code === ACTUAL_SYSTEM_LANG_CODE
)?.nativeName;

export function LanguageTab() {
  const { languagePreference, setLanguagePreference, t } = useI18n();

  const options: Array<{
    value: AppLanguagePreference;
    label: string;
    description?: string;
  }> = [
    {
      value: SYSTEM_LANGUAGE_PREFERENCE,
      label: t('common.system'),
      description: ACTUAL_SYSTEM_LANG_NATIVE_NAME,
    },
    ...APP_LANGUAGES.map((option) => ({
      value: option.code,
      label: option.nativeName,
    })),
  ];

  return (
    <div className="max-w-3xl pb-10" data-settings-tab-panel="language">
      <SettingsSectionHeader>{t('account.language')}</SettingsSectionHeader>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,var(--vlaina-size-220px)),1fr))] gap-3">
        {options.map((option) => {
          const selected = languagePreference === option.value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={selected}
              data-settings-language-option={option.value}
              data-selected={selected ? 'true' : undefined}
              onClick={() => setLanguagePreference(option.value)}
              className={cn(
                'group flex min-h-[var(--vlaina-size-56px)] cursor-pointer items-center justify-between gap-4 rounded-[var(--vlaina-ui-radius-group)] px-6 py-3 text-left transition-all duration-[var(--vlaina-duration-200)] border border-transparent',
                selected
                  ? 'bg-[var(--vlaina-sidebar-row-selected-bg)]'
                  : raisedPillSurfaceClass,
              )}
            >
              <div className="flex min-w-0 flex-col">
                <span className={cn('truncate text-[var(--vlaina-font-sm)]', getSidebarLabelClass('notes', { selected }))}>
                  {option.label}
                </span>
                {option.description ? (
                  <span className={cn(
                    'truncate text-[var(--vlaina-font-11)]',
                    selected ? 'text-[var(--vlaina-sidebar-row-selected-text-muted)]' : 'text-[var(--vlaina-sidebar-notes-text-soft)]'
                  )}>
                    {option.description}
                  </span>
                ) : null}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
