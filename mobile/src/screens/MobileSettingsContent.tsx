import { AITab } from '@/components/Settings/tabs/AITab';
import { AboutTab } from '@/components/Settings/tabs/AboutTab';
import { AppearanceTab } from '@/components/Settings/tabs/AppearanceTab';
import type { CommunitySettings } from '@/components/Settings/tabs/aboutCommunitySettings';
import { LanguageTab } from '@/components/Settings/tabs/LanguageTab';
import { MarkdownTab } from '@/components/Settings/tabs/MarkdownTab';
import type { SettingsTab } from '@/components/Settings/settingsEvents';

interface MobileSettingsContentProps {
  activeTab: SettingsTab;
  communitySettings: CommunitySettings;
}

export function MobileSettingsContent({
  activeTab,
  communitySettings,
}: MobileSettingsContentProps) {
  return (
    <div
      key={activeTab}
      className="mobile-settings-content__panel"
      data-mobile-settings-panel={activeTab}
    >
      {activeTab === 'markdown' ? <MarkdownTab /> : null}
      {activeTab === 'ai' ? <AITab /> : null}
      {activeTab === 'appearance' ? <AppearanceTab /> : null}
      {activeTab === 'language' ? <LanguageTab /> : null}
      {activeTab === 'about' ? <AboutTab community={communitySettings} /> : null}
    </div>
  );
}
