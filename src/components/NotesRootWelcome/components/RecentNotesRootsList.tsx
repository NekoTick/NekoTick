import { Icon } from '@/components/ui/icons';
import { useNotesRootStore, type NotesRootInfo } from '@/stores/useNotesRootStore';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useI18n } from '@/lib/i18n';

function formatPath(path: string): string {
  const normalized = path.replace(/\\/g, '/');
  const home = normalized.includes('/Users/')
    ? normalized.replace(/.*\/Users\/[^/]+/, '~')
    : normalized.replace(/^[A-Z]:/, '');

  if (home.length > 35) {
    const parts = home.split('/');
    if (parts.length > 3) {
      return `${parts[0]}/.../${parts.slice(-2).join('/')}`;
    }
  }
  return home;
}

interface RecentNotesRootsListProps {
  notesRoots: NotesRootInfo[];
  onOpen: (path: string) => void;
}

export function RecentNotesRootsList({ notesRoots, onOpen }: RecentNotesRootsListProps) {
  const { t } = useI18n();
  const removeFromRecent = useNotesRootStore((state) => state.removeFromRecent);

  const handleRemove = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    void removeFromRecent(id).catch(() => undefined);
  };

  return (
    <div className="notes-root-recent">
      <h2 className="notes-root-recent__title">{t('notesRoot.recent')}</h2>
      <div className="notes-root-recent__list">
        {notesRoots.map((notesRoot) => (
          <Tooltip key={notesRoot.id}>
            <TooltipTrigger asChild>
              <div
                className="notes-root-item"
                role="button"
                tabIndex={0}
                onClick={() => onOpen(notesRoot.path)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onOpen(notesRoot.path);
                  }
                }}
              >
                <span className="notes-root-item__name">{notesRoot.name}</span>
                <span className="notes-root-item__path">{formatPath(notesRoot.path)}</span>
                <button
                  className="notes-root-item__remove"
                  onClick={(e) => handleRemove(e, notesRoot.id)}
                >
                  <Icon name="common.close" size="md" />
                </button>
              </div>
            </TooltipTrigger>
            <TooltipContent side="top" sideOffset={10} showArrow={false}>
              <p className="max-w-[var(--vlaina-size-300px)] break-all">{notesRoot.path}</p>
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
    </div>
  );
}
