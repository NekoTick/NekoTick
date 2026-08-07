import { ModelSelector } from '@/components/Chat/features/Input/ModelSelector';
import { AccountAvatarImage } from '@/components/layout/AccountAvatarImage';
import { Icon, type IconName } from '@/components/ui/icons';
import { useUserAvatar } from '@/hooks/useUserAvatar';
import { useI18n, type MessageKey } from '@/lib/i18n';
import { themeIconTokens } from '@/styles/themeTokens';
import type { MobileViewMode } from '../app/mobilePlatform';

const fallbackAvatarUrl = `${import.meta.env.BASE_URL}logo.png?v=20260327`;

const VIEW_LABELS: Record<MobileViewMode, MessageKey> = {
  notes: 'app.viewNotes',
  chat: 'app.viewChat',
  whiteboard: 'app.viewWhiteboard',
  graph: 'app.viewGraph',
};

const VIEW_ICONS: Record<MobileViewMode, IconName> = {
  notes: 'file.text',
  chat: 'common.shootingStar',
  whiteboard: 'editor.diagram',
  graph: 'graph.network',
};

const VIEW_OPTIONS: ReadonlyArray<MobileViewMode> = [
  'notes',
  'graph',
  'whiteboard',
  'chat',
];

interface MobileTopBarProps {
  activeView: MobileViewMode;
  onOpenSidebar: () => void;
  onViewChange: (view: MobileViewMode) => void;
}

export function MobileTopBar({
  activeView,
  onOpenSidebar,
  onViewChange,
}: MobileTopBarProps) {
  const { t } = useI18n();
  const avatar = useUserAvatar();

  return (
    <header className="mobile-top-bar" data-mobile-top-bar-view={activeView}>
      <div className="mobile-top-bar__row">
        <button
          type="button"
          className="mobile-top-bar__avatar"
          aria-label={t('sidebar.mobileTitle')}
          onClick={onOpenSidebar}
        >
          <AccountAvatarImage
            src={avatar}
            fallbackSrc={fallbackAvatarUrl}
            alt=""
          />
        </button>

        <nav
          className="mobile-top-bar__view-nav"
          aria-label={t('shortcut.action.toggleAppViewMode')}
        >
          {VIEW_OPTIONS.map((view) => {
            const active = view === activeView;
            const label = t(VIEW_LABELS[view]);
            return (
              <button
                key={view}
                type="button"
                className="mobile-top-bar__view-item"
                data-mobile-nav-view={view}
                data-active={active ? 'true' : undefined}
                aria-current={active ? 'page' : undefined}
                aria-label={label}
                onClick={() => onViewChange(view)}
              >
                <span className="mobile-top-bar__view-icon" aria-hidden="true">
                  <Icon name={VIEW_ICONS[view]} size={themeIconTokens.sizeCompact} />
                </span>
                <span className="mobile-top-bar__view-label">{label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {activeView === 'chat' ? (
        <div className="mobile-top-bar__context">
          <div className="mobile-top-bar__model-selector">
            <ModelSelector
              dropdownPlacement="bottom"
              dropdownAlign="left"
              isEmbedded
              focusSearchOnOpen={false}
              restoreComposerFocusOnClose={false}
            />
          </div>
        </div>
      ) : null}
    </header>
  );
}
