import { ModelSelector } from '@/components/Chat/features/Input/ModelSelector';
import { Icon, type IconName } from '@/components/ui/icons';
import { useI18n, type MessageKey } from '@/lib/i18n';
import type { MobileViewMode } from '../app/mobilePlatform';

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

interface MobileTopBarProps {
  activeView: MobileViewMode;
  onCreateNote: () => void;
  onOpenMore: () => void;
  onOpenSidebar: () => void;
}

export function MobileTopBar({
  activeView,
  onCreateNote,
  onOpenMore,
  onOpenSidebar,
}: MobileTopBarProps) {
  const { t } = useI18n();

  return (
    <header className="mobile-top-bar" data-mobile-top-bar-view={activeView}>
      <button
        type="button"
        className="mobile-icon-button mobile-top-bar__menu"
        aria-label={t('sidebar.mobileTitle')}
        onClick={onOpenSidebar}
      >
        <Icon name="common.menu" size="lg" />
      </button>

      <div className="mobile-top-bar__title-area">
        {activeView === 'chat' ? (
          <div className="mobile-top-bar__model-selector">
            <ModelSelector
              dropdownPlacement="bottom"
              dropdownAlign="left"
              isEmbedded
              focusSearchOnOpen={false}
              restoreComposerFocusOnClose={false}
            />
          </div>
        ) : (
          <div className="mobile-top-bar__heading">
            <span className="mobile-top-bar__section-icon" aria-hidden="true">
              <Icon name={VIEW_ICONS[activeView]} size="md" />
            </span>
            <h1 className="mobile-top-bar__title">{t(VIEW_LABELS[activeView])}</h1>
          </div>
        )}
      </div>

      <div className="mobile-top-bar__actions">
        {activeView === 'notes' ? (
          <button
            type="button"
            className="mobile-icon-button mobile-icon-button--accent"
            aria-label={t('sidebar.newNote')}
            onClick={onCreateNote}
          >
            <Icon name="common.add" size="lg" />
          </button>
        ) : null}
        <button
          type="button"
          className="mobile-icon-button"
          aria-label={t('sidebar.more')}
          onClick={onOpenMore}
        >
          <Icon name="common.more" size="lg" />
        </button>
      </div>
    </header>
  );
}
