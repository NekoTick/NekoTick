import { DesktopUpdateBadge } from '@/components/desktop/DesktopUpdateIndicator';
import { Icon, type IconName } from '@/components/ui/icons';
import { useI18n, type MessageKey } from '@/lib/i18n';
import { handleScrollableWheel } from '@/lib/scroll/wheelScroll';
import { cn } from '@/lib/utils';
import type { SettingsTab } from './settingsEvents';

interface SettingsSidebarProps {
  activeTab: SettingsTab;
  isAppearanceFontPreviewing: boolean;
  updateIndicatorVersion: string | null;
  onTabChange: (tab: SettingsTab) => void;
}

interface SidebarItem {
  id: SettingsTab;
  labelKey?: MessageKey;
  label?: string;
  icon: IconName;
}

interface SidebarGroup {
  titleKey: MessageKey;
  items: SidebarItem[];
}

const sidebarGroups: SidebarGroup[] = [
  {
    titleKey: 'settings.general',
    items: [
      { id: 'markdown', labelKey: 'settings.tabs.markdown', icon: 'editor.code' },
      { id: 'ai', labelKey: 'settings.tabs.ai', icon: 'common.shootingStar' },
      { id: 'appearance', labelKey: 'settings.tabs.appearance', icon: 'theme.palette' },
      { id: 'language', labelKey: 'settings.tabs.language', icon: 'common.language' },
      { id: 'about', labelKey: 'settings.tabs.about', icon: 'common.info' },
    ],
  },
];

export function SettingsSidebar({
  activeTab,
  isAppearanceFontPreviewing,
  updateIndicatorVersion,
  onTabChange,
}: SettingsSidebarProps) {
  const { t } = useI18n();

  return (
    <div className={cn(
      "flex w-[var(--vlaina-size-260px)] flex-shrink-0 flex-col border-r border-[var(--vlaina-color-border-shell)] bg-[var(--vlaina-sidebar-notes-surface)] transition-opacity duration-[var(--vlaina-duration-100)] max-[900px]:w-full max-[900px]:border-r-0 max-[900px]:border-b max-[900px]:flex-none",
      isAppearanceFontPreviewing && "pointer-events-none opacity-[var(--vlaina-opacity-0)]",
    )}>
      <div className="flex min-h-0 flex-1 px-4 pb-6 pt-10 max-[900px]:px-3 max-[900px]:pb-3 max-[900px]:pt-12">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div
            className="flex-1 overflow-y-auto app-scrollbar max-[900px]:overflow-x-auto max-[900px]:overflow-y-hidden max-[900px]:scrollbar-hidden"
            data-settings-scroll-root="sidebar"
            onWheel={handleScrollableWheel}
          >
            {sidebarGroups.map((group) => (
              <div key={group.titleKey} className="mb-8 last:mb-0 max-[900px]:mb-0">
                <div className="space-y-[var(--vlaina-space-y-6px)] max-[900px]:flex max-[900px]:gap-2 max-[900px]:space-y-0">
                  {group.items.map((item) => {
                    const isActive = activeTab === item.id;
                    const label = item.label ?? (item.labelKey ? t(item.labelKey) : null) ?? '';
                    const sidebarUpdateVersion = item.id === 'about' ? updateIndicatorVersion : null;
                    const showUpdateIndicator = sidebarUpdateVersion !== null;
                    const updateIndicatorLabel = showUpdateIndicator
                      ? t('settings.updateIndicator')
                      : '';
                    return (
                      <div key={item.id} className="group/chat-sidebar-row flex items-center max-[900px]:shrink-0">
                        <button
                          type="button"
                          aria-current={isActive ? 'page' : undefined}
                          aria-label={showUpdateIndicator ? `${label} ${updateIndicatorLabel}` : undefined}
                          data-settings-tab={item.id}
                          data-active={isActive ? 'true' : undefined}
                          onClick={() => onTabChange(item.id)}
                          className={cn(
                            "group/settings-sidebar-tab flex min-h-[var(--vlaina-size-44px)] w-full items-center gap-3.5 rounded-[var(--vlaina-ui-radius-group)] px-4 py-3 text-sm leading-none transition-all duration-[var(--vlaina-duration-300)] ease-out max-[900px]:w-auto max-[900px]:gap-2.5 max-[900px]:whitespace-nowrap max-[900px]:px-3.5",
                            isActive
                              ? "bg-[var(--vlaina-sidebar-row-selected-bg)] text-[var(--vlaina-sidebar-row-selected-text)] font-[var(--vlaina-font-weight-semibold-plus)] shadow-[var(--vlaina-shadow-selection-soft)]"
                              : "text-[var(--vlaina-sidebar-notes-text)] hover:bg-transparent hover:text-[var(--vlaina-sidebar-row-selected-text)] hover:shadow-[var(--vlaina-shadow-none)] font-medium"
                          )}
                        >
                          <span className="flex size-5 shrink-0 items-center justify-center leading-none">
                            <Icon
                              size="md"
                              name={item.icon}
                              className={cn(
                                "transition-all duration-[var(--vlaina-duration-300)]",
                                isActive
                                  ? "text-[var(--vlaina-sidebar-row-selected-text)] scale-[var(--vlaina-scale-110)]"
                                  : "text-[var(--vlaina-sidebar-notes-text)] group-hover/settings-sidebar-tab:text-[var(--vlaina-sidebar-row-selected-text)]"
                              )}
                            />
                          </span>
                          <span className="inline-flex min-w-0 items-center truncate leading-none tracking-tight">
                            {label}
                          </span>
                          {showUpdateIndicator ? (
                            <DesktopUpdateBadge
                              version={sidebarUpdateVersion}
                              className="ml-auto max-w-[var(--vlaina-size-120px)] max-[900px]:ml-0"
                            />
                          ) : null}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
