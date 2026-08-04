import { lazy, Suspense, useEffect, useLayoutEffect, useState } from 'react';
import { Icon } from '@/components/ui/icons';
import { cn } from '@/lib/utils';
import {
  requestFileTreePointerDragDropTargetUpdate,
  useIsFileTreePointerDragActive,
  useIsFileTreePointerStarredDropTarget,
} from '../FileTree/hooks/fileTreePointerDragState';
import { useExternalFileTreeDropState } from '../FileTree/hooks/externalFileTreeDropState';
import { NotesSidebarSection } from '../Sidebar/NotesSidebarPrimitives';
import { ExternalStarredEntryRow } from './ExternalStarredEntryRow';
import { useStarredSectionEntries } from './useStarredSectionEntries';
import { useExternalStarredRenameSync } from './useExternalStarredRenameSync';
import { useI18n } from '@/lib/i18n';

const FolderItem = lazy(async () => {
  const mod = await import('../FileTree/FolderItem');
  return { default: mod.FolderItem };
});

interface StarredSectionProps {
  nested?: boolean;
  showTitle?: boolean;
}

export function StarredSection({
  nested = false,
  showTitle = true,
}: StarredSectionProps = {}) {
  const { t } = useI18n();
  useExternalStarredRenameSync();
  const { starredLoaded, hasEntries, entries: entryViewModels } = useStarredSectionEntries();
  const isInternalDragActive = useIsFileTreePointerDragActive();
  const isInternalDragOver = useIsFileTreePointerStarredDropTarget();
  const isExternalDragActive = useExternalFileTreeDropState((state) => state.active);
  const isExternalDragOver = useExternalFileTreeDropState((state) => state.dropTargetKind === 'starred');
  const [expanded, setExpanded] = useState(false);
  const hasActiveDrag = isInternalDragActive || isExternalDragActive;
  const isDragOver = isInternalDragOver || isExternalDragOver;
  const isExpanded = expanded || (!hasEntries && hasActiveDrag);

  useEffect(() => {
    if (starredLoaded && hasEntries) {
      setExpanded(true);
    }
  }, [hasEntries, starredLoaded]);

  useLayoutEffect(() => {
    if (!hasEntries && isInternalDragActive) {
      requestFileTreePointerDragDropTargetUpdate();
    }
  }, [hasEntries, isExpanded, isInternalDragActive]);

  if (!starredLoaded && !hasEntries && !hasActiveDrag) {
    return null;
  }

  if (!hasEntries && !hasActiveDrag) {
    return null;
  }

  const content = (
    <div
      data-file-tree-starred-drop-target="true"
      data-file-tree-starred-section="true"
      className={cn(
        'w-full rounded-md transition-colors',
        !showTitle && hasEntries && 'mb-1',
        isDragOver && 'bg-[var(--vlaina-sidebar-notes-row-drag)] ring-1 ring-[var(--vlaina-accent)]',
      )}
    >
      {!hasEntries ? (
        <div
          data-file-tree-starred-drop-target="true"
          className="flex min-h-8 w-full items-center gap-2 rounded-md px-2 text-[var(--vlaina-font-xs)] text-[var(--vlaina-sidebar-notes-text-soft)]"
        >
          <Icon name="misc.star" size="sm" className="fill-[var(--vlaina-color-favorite-fg)] text-[var(--vlaina-color-favorite-fg)]" />
          <span>{t('notes.starred')}</span>
        </div>
      ) : (
        entryViewModels.map(({ entry, isCurrentNotesRootEntry, isActive, treeNode, onOpen, onRemove }) => {
          if (isCurrentNotesRootEntry && treeNode?.isFolder) {
            return (
              <Suspense key={entry.id} fallback={null}>
                <FolderItem
                  node={treeNode}
                  depth={0}
                  dragEnabled={false}
                />
              </Suspense>
            );
          }

          return (
            <ExternalStarredEntryRow
              key={entry.id}
              entry={entry}
              isCurrentNotesRootEntry={isCurrentNotesRootEntry}
              isActive={isActive}
              onOpen={onOpen}
              onRemove={onRemove}
            />
          );
        })
      )}
    </div>
  );

  if (!showTitle) {
    return content;
  }

  return (
    <NotesSidebarSection
      title={t('notes.starred')}
      expanded={isExpanded}
      onToggle={() => setExpanded((value) => !value)}
      animated={false}
      nested={nested}
      headerClassName={nested ? 'px-2' : undefined}
      data-file-tree-starred-drop-target="true"
      className={cn(isDragOver && 'rounded-md bg-[var(--vlaina-sidebar-notes-row-drag)]')}
    >
      {content}
    </NotesSidebarSection>
  );
}
