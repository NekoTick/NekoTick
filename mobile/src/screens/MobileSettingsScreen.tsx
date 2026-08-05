import { useCallback, useEffect, useRef, useState } from 'react';
import {
  REQUEST_CLOSE_SETTINGS_EVENT,
  SETTINGS_BEFORE_CLOSE_EVENT,
  SETTINGS_CLOSED_EVENT,
  resolveSettingsOpenTab,
  type SettingsOpenTab,
  type SettingsTab,
} from '@/components/Settings/settingsEvents';
import {
  emptyCommunitySettings,
  loadCommunitySettings,
  type CommunitySettings,
} from '@/components/Settings/tabs/aboutCommunitySettings';
import { Icon, type IconName } from '@/components/ui/icons';
import { useI18n, type MessageKey } from '@/lib/i18n';
import { flushPendingSave } from '@/lib/storage/unifiedStorage';
import { actions as aiActions } from '@/stores/useAIStore';
import { MobileLayer } from '../components/MobileLayer';
import { MobileSettingsContent } from './MobileSettingsContent';

const TABS: ReadonlyArray<{
  id: SettingsTab;
  labelKey: MessageKey;
  icon: IconName;
}> = [
  { id: 'markdown', labelKey: 'settings.tabs.markdown', icon: 'editor.code' },
  { id: 'ai', labelKey: 'settings.tabs.ai', icon: 'common.shootingStar' },
  { id: 'appearance', labelKey: 'settings.tabs.appearance', icon: 'theme.palette' },
  { id: 'language', labelKey: 'settings.tabs.language', icon: 'common.language' },
  { id: 'about', labelKey: 'settings.tabs.about', icon: 'common.info' },
];

interface MobileSettingsScreenProps {
  open: boolean;
  requestedTab?: SettingsOpenTab;
  onClose: () => void;
}

export function MobileSettingsScreen({
  open,
  requestedTab,
  onClose,
}: MobileSettingsScreenProps) {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<SettingsTab | null>(null);
  const [communitySettings, setCommunitySettings] = useState<CommunitySettings>(
    emptyCommunitySettings,
  );
  const closingRef = useRef(false);

  const handleClose = useCallback(async () => {
    if (closingRef.current) return;
    closingRef.current = true;
    window.dispatchEvent(new Event(SETTINGS_BEFORE_CLOSE_EVENT));
    aiActions.deleteIncompleteCustomProviders();
    try {
      await flushPendingSave();
    } catch {
      // Persistence reports its own user-facing error.
    } finally {
      onClose();
      window.dispatchEvent(new Event(SETTINGS_CLOSED_EVENT));
      closingRef.current = false;
    }
  }, [onClose]);

  const handleBack = useCallback(() => {
    if (activeTab) {
      setActiveTab(null);
      return;
    }
    void handleClose();
  }, [activeTab, handleClose]);

  useEffect(() => {
    if (!open) return;
    const nextTab = resolveSettingsOpenTab(requestedTab);
    setActiveTab(nextTab ?? null);
    void loadCommunitySettings().then(setCommunitySettings);
  }, [open, requestedTab]);

  useEffect(() => {
    window.addEventListener(REQUEST_CLOSE_SETTINGS_EVENT, handleBack);
    return () => window.removeEventListener(REQUEST_CLOSE_SETTINGS_EVENT, handleBack);
  }, [handleBack]);

  const activeTabConfig = activeTab
    ? TABS.find((tab) => tab.id === activeTab) ?? null
    : null;

  return (
    <MobileLayer
      open={open}
      title={activeTabConfig ? t(activeTabConfig.labelKey) : t('account.settings')}
      variant="screen"
      onClose={handleBack}
      contentClassName="mobile-settings-screen"
    >
      {activeTab ? (
        <div className="mobile-settings-content">
          <MobileSettingsContent
            activeTab={activeTab}
            communitySettings={communitySettings}
          />
        </div>
      ) : (
        <nav className="mobile-settings-index" aria-label={t('account.settings')}>
          <div className="mobile-settings-index__hero" aria-hidden="true">
            <span><Icon name="common.settings" size="xl" /></span>
            <strong>Vlaina</strong>
          </div>
          <div className="mobile-settings-index__list">
            {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className="mobile-settings-index__item"
              data-mobile-settings-link={tab.id}
              onClick={() => setActiveTab(tab.id)}
            >
              <span className="mobile-settings-index__icon" aria-hidden="true">
                <Icon name={tab.icon} size="lg" />
              </span>
              <span className="mobile-settings-index__label">{t(tab.labelKey)}</span>
              <Icon name="nav.chevronRight" size="md" />
            </button>
            ))}
          </div>
        </nav>
      )}
    </MobileLayer>
  );
}
