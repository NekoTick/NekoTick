import { useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { raisedPillSurfaceClass } from '@/components/ui/surfaceStyles';
import { Icon } from '@/components/ui/icons';
import { cn } from '@/lib/utils';
import { themeIconTokens, themeSidebarTokens } from '@/styles/themeTokens';
import {
  getSidebarLabelClass,
  getSidebarSoftTextClass,
} from '@/components/layout/sidebar/sidebarLabelStyles';
import type { NotesRootInfo } from '@/stores/useNotesRootStore';
import { NotesSidebarRow } from './NotesSidebarRow';
import { NotesSidebarPillEmptyHint } from './NotesSidebarPrimitives';

interface SidebarEmptyWorkspacePanelProps {
  folderLabel: string;
  openFileLabel: string;
  openFolderLabel: string;
  recentNotesRoots: NotesRootInfo[];
  onOpenFile: () => void;
  onOpenFolder: () => void;
  onOpenRecentNotesRoot: (path: string) => void;
}

interface ActiveRecentNotesRootHint {
  path: string;
  left: number;
  top: number;
  placement: 'top' | 'bottom';
}

export const EMPTY_WORKSPACE_RECENT_NOTES_ROOT_DISPLAY_LIMIT = 8;

export function getEmptyWorkspaceRecentNotesRoots(
  recentNotesRoots: NotesRootInfo[],
  currentNotesRootPath: string | null | undefined,
) {
  return recentNotesRoots
    .filter((notesRoot) => notesRoot.path !== currentNotesRootPath)
    .slice(0, EMPTY_WORKSPACE_RECENT_NOTES_ROOT_DISPLAY_LIMIT);
}

export function SidebarEmptyWorkspacePanel({
  folderLabel,
  openFileLabel,
  openFolderLabel,
  recentNotesRoots,
  onOpenFile,
  onOpenFolder,
  onOpenRecentNotesRoot,
}: SidebarEmptyWorkspacePanelProps) {
  const [activeRecentNotesRootHint, setActiveRecentNotesRootHint] = useState<ActiveRecentNotesRootHint | null>(null);

  const handleRowKeyDown = (event: KeyboardEvent<HTMLDivElement>, action: () => void) => {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    action();
  };

  const showRecentNotesRootHint = (notesRoot: NotesRootInfo, element: HTMLElement) => {
    const rect = element.getBoundingClientRect();
    const hasRoomBelow =
      window.innerHeight - rect.bottom >=
      themeSidebarTokens.recentNotesRootPathHintEstimatedHeightPx + themeSidebarTokens.recentNotesRootPathHintGapPx;

    setActiveRecentNotesRootHint({
      path: notesRoot.path,
      left:
        rect.left +
        themeSidebarTokens.recentNotesRootPathHintTextLeftOffsetPx -
        themeSidebarTokens.recentNotesRootPathHintHorizontalPaddingPx,
      top: hasRoomBelow
        ? rect.bottom + themeSidebarTokens.recentNotesRootPathHintGapPx
        : rect.top -
          themeSidebarTokens.recentNotesRootPathHintEstimatedHeightPx -
          themeSidebarTokens.recentNotesRootPathHintGapPx,
      placement: hasRoomBelow ? 'bottom' : 'top',
    });
  };

  return (
    <div data-testid="empty-workspace-panel" className="pointer-events-auto flex w-full flex-col gap-3 px-1 py-3">
      <div data-notes-workspace-actions="true">
        <NotesSidebarPillEmptyHint
          actions={[
            { label: openFileLabel, onAction: onOpenFile },
            { label: openFolderLabel, onAction: onOpenFolder },
          ]}
        />
      </div>
      {recentNotesRoots.length > 0 ? (
        <div className="flex min-w-0 flex-col">
          {recentNotesRoots.map((notesRoot) => (
            <div
              key={notesRoot.id}
              className="min-w-0"
              onMouseEnter={(event) => showRecentNotesRootHint(notesRoot, event.currentTarget)}
              onMouseLeave={() => setActiveRecentNotesRootHint(null)}
              onFocus={(event) => showRecentNotesRootHint(notesRoot, event.currentTarget)}
              onBlur={(event) => {
                const nextTarget = event.relatedTarget;
                if (!(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)) {
                  setActiveRecentNotesRootHint(null);
                }
              }}
            >
              <NotesSidebarRow
                role="button"
                tabIndex={0}
                leading={
                  <Icon
                    name="file.folderOpen"
                    size={themeIconTokens.sizeRow}
                    className="text-[var(--vlaina-sidebar-notes-folder-icon)] group-hover/sidebar-row:text-[var(--vlaina-sidebar-row-selected-text)] group-focus-within/sidebar-row:text-[var(--vlaina-sidebar-row-selected-text)]"
                  />
                }
                main={(
                  <span className={`block truncate ${getSidebarLabelClass('notes')}`}>
                    {notesRoot.name || folderLabel}
                  </span>
                )}
                trailing={
                  <Icon
                    name="nav.chevronRight"
                    size="xs"
                    className={`${getSidebarSoftTextClass('notes')} group-hover/sidebar-row:text-[var(--vlaina-sidebar-row-selected-text)] group-focus-within/sidebar-row:text-[var(--vlaina-sidebar-row-selected-text)]`}
                  />
                }
                onClick={() => onOpenRecentNotesRoot(notesRoot.path)}
                onKeyDown={(event) => handleRowKeyDown(event, () => onOpenRecentNotesRoot(notesRoot.path))}
              />
            </div>
          ))}
        </div>
      ) : null}
      {activeRecentNotesRootHint
        ? createPortal(
            <div
              className="pointer-events-none fixed z-[var(--vlaina-z-max)]"
              data-recent-notes-root-path-hint={activeRecentNotesRootHint.placement}
              style={{
                left: activeRecentNotesRootHint.left,
                top: activeRecentNotesRootHint.top,
              }}
            >
              <span
                className={cn(
                  'inline-flex max-w-[var(--vlaina-size-300px)] items-center rounded-[var(--vlaina-notes-ui-radius-tooltip)] px-3 py-2 text-xs text-[var(--vlaina-sidebar-chat-text)]',
                  raisedPillSurfaceClass,
                )}
              >
                <span className="break-all">{activeRecentNotesRootHint.path}</span>
              </span>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
