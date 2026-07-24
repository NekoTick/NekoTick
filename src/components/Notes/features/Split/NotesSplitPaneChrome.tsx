import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { Icon } from '@/components/ui/icons';
import { useDisplayIcon } from '@/hooks/useTitleSync';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { noteToolbarIconButtonClassName } from '@/components/Notes/features/Editor/noteToolbarStyles';
import { NoteIcon } from '../IconPicker/NoteIcon';

export function NotesSplitPaneChrome({
  actions,
  path,
  sourceLeafId,
  title,
  onDragPointerDown,
  onClose,
}: {
  actions?: ReactNode;
  onDragPointerDown?: (event: ReactPointerEvent<HTMLDivElement>, sourceLeafId: string) => void;
  path?: string;
  sourceLeafId?: string;
  title: string;
  onClose?: () => void;
}) {
  const { t } = useI18n();
  const icon = useDisplayIcon(path);

  return (
    <div
      className="flex h-10 shrink-0 cursor-grab items-center gap-2 border-b border-[var(--vlaina-color-border-shell)] px-3 active:cursor-grabbing"
      data-notes-split-pane-chrome="true"
      data-notes-block-drop-target={path ? 'true' : undefined}
      data-notes-split-leaf-path={path}
      data-notes-split-pane-drag-source={sourceLeafId}
      onClick={(event) => {
        event.stopPropagation();
      }}
      onPointerDown={(event) => {
        if (!sourceLeafId || event.button !== 0) {
          return;
        }
        if (event.target instanceof Element && event.target.closest('button')) {
          return;
        }
        onDragPointerDown?.(event, sourceLeafId);
      }}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {path ? (
          <span
            className="pointer-events-none flex shrink-0 items-center"
            data-notes-split-pane-icon="true"
          >
            {icon ? (
              <NoteIcon icon={icon} notePath={path} size="md" />
            ) : (
              <Icon
                name="file.text"
                className="h-[var(--vlaina-size-18px)] w-[var(--vlaina-size-18px)] text-[var(--vlaina-sidebar-notes-file-icon)]"
              />
            )}
          </span>
        ) : null}
        <div
          className="min-w-0 truncate text-sm font-medium text-[var(--vlaina-text-primary)]"
          data-notes-split-pane-name="true"
        >
          {title}
        </div>
      </div>
      {actions ? (
        <div className="flex shrink-0 items-center gap-1">
          {actions}
        </div>
      ) : null}
      {onClose ? (
        <button
          type="button"
          aria-label={t('common.close')}
          className={cn(
            noteToolbarIconButtonClassName,
            'h-7 w-7 shrink-0 hover:text-[var(--vlaina-color-tab-muted-hover-fg)]',
          )}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onClose();
          }}
        >
          <Icon name="common.close" size="md" />
        </button>
      ) : null}
    </div>
  );
}
