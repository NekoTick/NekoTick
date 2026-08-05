import { Icon, type IconName } from '@/components/ui/icons';
import { useI18n, type MessageKey } from '@/lib/i18n';
import type { MobileViewMode } from '../app/mobilePlatform';

interface MobileBottomNavProps {
  activeView: MobileViewMode;
  onViewChange: (view: MobileViewMode) => void;
}

const ITEMS: ReadonlyArray<{
  view: MobileViewMode;
  labelKey: MessageKey;
  icon: IconName;
}> = [
  { view: 'notes', labelKey: 'app.viewNotes', icon: 'file.text' },
  { view: 'chat', labelKey: 'app.viewChat', icon: 'common.shootingStar' },
  { view: 'whiteboard', labelKey: 'app.viewWhiteboard', icon: 'editor.diagram' },
  { view: 'graph', labelKey: 'app.viewGraph', icon: 'graph.network' },
];

export function MobileBottomNav({ activeView, onViewChange }: MobileBottomNavProps) {
  const { t } = useI18n();

  return (
    <nav className="mobile-bottom-nav" aria-label={t('shortcut.action.toggleAppViewMode')}>
      {ITEMS.map((item) => {
        const active = item.view === activeView;
        const label = t(item.labelKey);
        return (
          <button
            key={item.view}
            type="button"
            className="mobile-bottom-nav__item"
            data-mobile-nav-view={item.view}
            data-active={active ? 'true' : undefined}
            aria-current={active ? 'page' : undefined}
            aria-label={label}
            onClick={() => onViewChange(item.view)}
          >
            <span className="mobile-bottom-nav__content">
              <span className="mobile-bottom-nav__icon">
                <Icon name={item.icon} size="lg" />
              </span>
              <span className="mobile-bottom-nav__label">{label}</span>
            </span>
          </button>
        );
      })}
    </nav>
  );
}
