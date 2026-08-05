import { useEffect, useMemo, useState } from 'react';
import { useNotesStore } from '@/stores/useNotesStore';
import { useUIStore } from '@/stores/uiSlice';
import { useNotesRootStore } from '@/stores/useNotesRootStore';
import { useDisplayName } from '@/hooks/useTitleSync';
import { getNoteTitleFromPath } from '@/lib/notes/displayName';
import { getCachedDesktopHomePath, getDesktopHomePath } from '@/lib/desktop/homePath';
import { getParentPath, isAbsolutePath } from '@/lib/storage/adapter';
import { getDraftNoteEntry, isDraftNotePath, resolveDraftNoteTitle } from '@/stores/notes/draftNote';
import { resolveStarredNoteContext } from '@/stores/notes/starred';
import { cn } from '@/lib/utils';
import { scheduleSidebarItemIntoView } from '@/components/Notes/features/common/sidebarScrollIntoView';
import { truncateNoteLabel } from '@/components/Notes/features/common/truncateNoteLabel';
import { useI18n } from '@/lib/i18n';
import {
  buildFolderSegments,
  resolveDisplayPath,
  resolveNotePathWithinDirectory,
} from './NotePathBreadcrumbPaths';

interface NotePathBreadcrumbProps {
  notePath: string;
}

export function NotePathBreadcrumb({ notePath }: NotePathBreadcrumbProps) {
  const notesPath = useNotesStore((s) => s.notesPath);
  const draftNotes = useNotesStore((s) => s.draftNotes);
  const starredEntries = useNotesStore((s) => s.starredEntries);
  const revealFolder = useNotesStore((s) => s.revealFolder);
  const setPendingStarredNavigation = useNotesStore((s) => s.setPendingStarredNavigation);
  const { t } = useI18n();
  const notesRootName = useNotesRootStore((s) => s.currentNotesRoot?.name) ?? t('app.viewNotes');
  const openNotesRoot = useNotesRootStore((s) => s.openNotesRoot);
  const [homePath, setHomePath] = useState(() => getCachedDesktopHomePath());
  const displayName = useDisplayName(notePath);
  const draftNote = getDraftNoteEntry(draftNotes, notePath);
  const breadcrumbPath = draftNote?.parentPath
    ? `${draftNote.parentPath}/${resolveDraftNoteTitle(draftNote.name)}`
    : isDraftNotePath(notePath)
      ? resolveDraftNoteTitle(draftNote?.name)
      : notePath;

  useEffect(() => {
    if (!isAbsolutePath(notePath)) {
      return;
    }

    let cancelled = false;
    void getDesktopHomePath().then((path) => {
      if (!cancelled) {
        setHomePath(path);
      }
    }).catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [notePath]);

  const displayInfo = useMemo(
    () => resolveDisplayPath(breadcrumbPath, notesPath, notesRootName, homePath),
    [breadcrumbPath, homePath, notesPath, notesRootName]
  );
  const displayPath = displayInfo.displayPath;
  const folderSegments = useMemo(
    () => buildFolderSegments(displayPath, displayInfo.isAbsolute, displayInfo.rootPath, homePath),
    [displayInfo.isAbsolute, displayInfo.rootPath, displayPath, homePath]
  );
  const starredNoteContext = useMemo(
    () => displayInfo.isAbsolute ? resolveStarredNoteContext(notePath, starredEntries) : null,
    [displayInfo.isAbsolute, notePath, starredEntries]
  );
  const noteLabel = useMemo(() => {
    if (displayName?.trim()) return displayName.trim();
    return getNoteTitleFromPath(displayPath);
  }, [displayPath, displayName]);
  const isUnsavedDraft = Boolean(draftNote);

  const setNotesSidebarView = useUIStore((s) => s.setNotesSidebarView);

  const openAbsoluteDirectoryInSidebar = async (targetPath: string) => {
    setNotesSidebarView('workspace');

    const navigationNotesRootPath = starredNoteContext?.notesRootPath ?? targetPath;
    const relativeNotePath = starredNoteContext?.relativePath ?? resolveNotePathWithinDirectory(notePath, targetPath);
    if (relativeNotePath) {
      setPendingStarredNavigation({
        notesRootPath: navigationNotesRootPath,
        kind: 'note',
        relativePath: relativeNotePath,
        skipWorkspaceRestore: true,
      });
    }

    const opened = await openNotesRoot(navigationNotesRootPath);
    if (!opened && relativeNotePath) {
      setPendingStarredNavigation(null);
    }
  };

  const handleFolderClick = (targetPath: string) => {
    setNotesSidebarView('workspace');
    if (displayInfo.isAbsolute) {
      void openAbsoluteDirectoryInSidebar(targetPath).catch(() => undefined);
      return;
    }

    revealFolder(targetPath);
    scheduleSidebarItemIntoView(targetPath, 2, 'start');
  };

  const handleRootClick = () => {
    setNotesSidebarView('workspace');
    if (displayInfo.isAbsolute) {
      void openAbsoluteDirectoryInSidebar(displayInfo.rootPath || getParentPath(notePath) || notePath)
        .catch(() => undefined);
      return;
    }

    const revealPath = folderSegments[folderSegments.length - 1]?.fullPath ?? '';
    useNotesStore.getState().revealFolder(revealPath);
    requestAnimationFrame(() => {
      const scrollRoot = document.querySelector<HTMLElement>('[data-notes-sidebar-scroll-root="true"]');
      if (scrollRoot) scrollRoot.scrollTo({ top: 0, behavior: 'auto' });
    });
  };

  const handleNoteClick = () => {
    setNotesSidebarView('workspace');

    if (displayInfo.isAbsolute) {
      const relativeNotePath = notesPath ? resolveNotePathWithinDirectory(notePath, notesPath) : null;
      if (relativeNotePath) {
        revealFolder(relativeNotePath);
        scheduleSidebarItemIntoView(relativeNotePath, 2);
        return;
      }

      const parentPath = getParentPath(notePath);
      if (parentPath) {
        void openAbsoluteDirectoryInSidebar(parentPath).catch(() => undefined);
      }
      return;
    }

    revealFolder(notePath);
    scheduleSidebarItemIntoView(notePath, 2);
  };

  const noteButton = (
    <button
      type="button"
      onClick={handleNoteClick}
      className="max-w-[var(--vlaina-size-360px)] truncate rounded px-1 py-0 text-[var(--vlaina-soft-placeholder)] transition-colors hover:text-[var(--vlaina-sidebar-row-selected-text)]"
    >
      {truncateNoteLabel(noteLabel)}
    </button>
  );

  return (
    <div data-note-path-breadcrumb="true" className="h-4 flex items-center mb-1">
      {!isUnsavedDraft ? (
        <div className="flex flex-wrap items-center gap-x-1 gap-y-0 text-[var(--vlaina-font-xs)] leading-none opacity-[var(--vlaina-opacity-0)] transition-opacity duration-[var(--vlaina-duration-150)] group-hover/note-title:opacity-[var(--vlaina-opacity-100)] group-focus-within/note-title:opacity-[var(--vlaina-opacity-100)]">
          <>
            <button
              type="button"
              onClick={handleRootClick}
              className={cn(
                'rounded px-1 py-0 text-[var(--vlaina-soft-placeholder)] transition-colors hover:text-[var(--vlaina-sidebar-row-selected-text)]'
              )}
            >
              {displayInfo.rootLabel}
            </button>
            <span className="text-[var(--vlaina-soft-placeholder)]">/</span>

            {folderSegments.map((segment, index) => (
              <div key={segment.fullPath} className="inline-flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => handleFolderClick(segment.fullPath)}
                  className={cn(
                    'rounded px-1 py-0 text-[var(--vlaina-soft-placeholder)] transition-colors hover:text-[var(--vlaina-sidebar-row-selected-text)]'
                  )}
                >
                  {segment.label}
                </button>
                <span className="text-[var(--vlaina-soft-placeholder)]">/</span>
                {index === folderSegments.length - 1 && noteButton}
              </div>
            ))}

            {folderSegments.length === 0 && noteButton}
          </>
        </div>
      ) : null}
    </div>
  );
}
