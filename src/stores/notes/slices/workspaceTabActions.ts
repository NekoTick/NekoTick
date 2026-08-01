import { isSupportedMarkdownPath } from '@/lib/notes/markdownFile';
import { getNoteTitleFromPath } from '@/lib/notes/displayName';
import { updateDisplayName } from '../displayNameUtils';
import { resolveDraftNoteTitle } from '../draftNote';
import { isSameExternalPath } from '../document/externalPathSync';
import { openStoredNotePath } from '../openNotePath';
import { removeCachedNoteContent, setCachedNoteContent } from '../document/noteContentCache';
import { pruneNoteNavigationHistoryForExternalDeletion } from '../document/noteNavigationHistory';
import {
  pushRecentlyClosedTab,
  restoreClosedTabOrder,
} from '../document/recentlyClosedTabState';
import { flushCurrentPendingEditorMarkdown } from '../pendingEditorMarkdownFlusher';
import { closeCurrentNoteTab, closeWorkspaceTab } from './workspaceTabCloseActions';
import type { NotesGet, NotesSet, WorkspaceSlice } from './workspaceSliceTypes';
import { clearNoteRecovery, stageNoteRecoveryForPath } from '../noteRecovery';

type NotesState = ReturnType<NotesGet>;

type WorkspaceTabActions = Pick<
  WorkspaceSlice,
  | 'updateDraftNoteName'
  | 'discardDraftNote'
  | 'cancelPendingDraftDiscard'
  | 'confirmPendingDraftDiscard'
  | 'closeNote'
  | 'closeTab'
  | 'reopenClosedTab'
  | 'navigateBackInNoteHistory'
  | 'navigateForwardInNoteHistory'
  | 'switchTab'
  | 'reorderTabs'
  | 'syncDisplayName'
  | 'getDisplayName'
>;

function getKnownClosedTabModifiedAt(modifiedAt: number | null | undefined): number | null {
  return typeof modifiedAt === 'number' && Number.isFinite(modifiedAt)
    ? modifiedAt
    : null;
}

function isOpenableHistoryTarget(state: NotesState, path: string): boolean {
  return Boolean(state.draftNotes[path]) || isSupportedMarkdownPath(path);
}

async function navigateNoteHistory(set: NotesSet, get: NotesGet, delta: -1 | 1): Promise<void> {
  flushCurrentPendingEditorMarkdown();

  let stateBeforeNavigation = get();
  let targetIndex = stateBeforeNavigation.noteNavigationHistoryIndex + delta;
  let targetPath = stateBeforeNavigation.noteNavigationHistory[targetIndex];

  while (targetPath && !isOpenableHistoryTarget(stateBeforeNavigation, targetPath)) {
    set(pruneNoteNavigationHistoryForExternalDeletion(
      stateBeforeNavigation.noteNavigationHistory,
      stateBeforeNavigation.noteNavigationHistoryIndex,
      targetPath,
    ));
    stateBeforeNavigation = get();
    targetIndex = stateBeforeNavigation.noteNavigationHistoryIndex + delta;
    targetPath = stateBeforeNavigation.noteNavigationHistory[targetIndex];
  }

  if (!targetPath) return;

  set({ noteNavigationHistoryIndex: targetIndex });

  await openStoredNotePath(targetPath, {
    openNote: (path, openInNewTab) =>
      get().openNote(path, openInNewTab, { updateNavigationHistory: false }),
    openNoteByAbsolutePath: (path, openInNewTab) =>
      get().openNoteByAbsolutePath(path, openInNewTab, { updateNavigationHistory: false }),
  });

  const latestState = get();
  if (
    latestState.noteNavigationHistoryIndex === targetIndex &&
    (!latestState.currentNote || !isSameExternalPath(latestState.currentNote.path, targetPath))
  ) {
    set({ noteNavigationHistoryIndex: stateBeforeNavigation.noteNavigationHistoryIndex });
  }
}

export function createWorkspaceTabActions(set: NotesSet, get: NotesGet): WorkspaceTabActions {
  return {
    updateDraftNoteName: (path: string, name: string) => {
      const draftEntry = get().draftNotes[path];
      if (!draftEntry) {
        return;
      }

      set({
        draftNotes: {
          ...get().draftNotes,
          [path]: {
            ...draftEntry,
            name,
          },
        },
      });
      stageNoteRecoveryForPath(get(), path);
    },

    discardDraftNote: (path, options) => {
      const {
        draftNotes,
        openTabs,
        currentNote,
        noteContentsCache,
        pendingDraftDiscardPath,
        isDirty,
        recentlyClosedTabs,
      } = get();
      const preserveHistory = options?.preserveHistory ?? true;
      const activateFallback = options?.activateFallback ?? true;
      const draftNote = draftNotes[path];
      if (!draftNote) {
        return;
      }

      const { [path]: _removedDraft, ...nextDraftNotes } = draftNotes;
      const isCurrentDraft = currentNote?.path === path;
      const closedTab = openTabs.find((tab) => tab.path === path);
      const closedTabIndex = openTabs.findIndex((tab) => tab.path === path);
      const updatedTabs = openTabs.filter((tab) => tab.path !== path);
      const contentSnapshot = isCurrentDraft
        ? currentNote.content
        : noteContentsCache.get(path)?.content ?? '';
      const modifiedAtSnapshot = noteContentsCache.get(path)?.modifiedAt ?? null;

      set({
        draftNotes: nextDraftNotes,
        openTabs: updatedTabs,
        recentlyClosedTabs: preserveHistory && closedTab
          ? pushRecentlyClosedTab(recentlyClosedTabs, closedTab, closedTabIndex, {
              draftNote,
              content: contentSnapshot,
              modifiedAt: modifiedAtSnapshot,
            })
          : recentlyClosedTabs,
        currentNote: isCurrentDraft ? null : currentNote,
        currentNoteRevision: isCurrentDraft ? get().currentNoteRevision + 1 : get().currentNoteRevision,
        noteContentsCache: removeCachedNoteContent(noteContentsCache, path),
        isDirty: isCurrentDraft ? false : isDirty,
        pendingDraftDiscardPath: pendingDraftDiscardPath === path ? null : pendingDraftDiscardPath,
        ...pruneNoteNavigationHistoryForExternalDeletion(
          get().noteNavigationHistory,
          get().noteNavigationHistoryIndex,
          path,
        ),
      });
      void clearNoteRecovery(get().notesPath, path);

      if (isCurrentDraft && activateFallback) {
        const lastTab = updatedTabs[updatedTabs.length - 1];
        if (lastTab) {
          void openStoredNotePath(lastTab.path, {
            openNote: get().openNote,
            openNoteByAbsolutePath: get().openNoteByAbsolutePath,
          });
        }
      }
    },

    cancelPendingDraftDiscard: () => {
      set({ pendingDraftDiscardPath: null });
    },

    confirmPendingDraftDiscard: async () => {
      const pendingPath = get().pendingDraftDiscardPath;
      if (!pendingPath) {
        return;
      }

      set({ pendingDraftDiscardPath: null });
      get().discardDraftNote(pendingPath);
    },

    closeNote: () => closeCurrentNoteTab(set, get),

    closeTab: (path: string) => closeWorkspaceTab(set, get, path),

    reopenClosedTab: async () => {
      flushCurrentPendingEditorMarkdown();
      const closedTabs = get().recentlyClosedTabs;
      if (closedTabs.length === 0) {
        return;
      }

      for (let index = 0; index < closedTabs.length; index += 1) {
        const entry = closedTabs[index];
        if (!entry) {
          continue;
        }

        const remainingTabs = closedTabs.slice(index + 1);
        const wasDirty = get().isDirty;
        const previousPath = get().currentNote?.path ?? null;
        const alreadyOpen = get().openTabs.some((tab) => tab.path === entry.tab.path);

        if (entry.draftNote) {
          const nextCache = setCachedNoteContent(
            get().noteContentsCache,
            entry.tab.path,
            entry.content ?? '',
            getKnownClosedTabModifiedAt(entry.modifiedAt),
          );
          const nextTabs = alreadyOpen
            ? get().openTabs
            : restoreClosedTabOrder([...get().openTabs, entry.tab], entry.tab.path, entry.index);

          set({
            currentNote: { path: entry.tab.path, content: entry.content ?? '' },
            currentNoteRevision: get().currentNoteRevision + 1,
            isDirty: entry.tab.isDirty,
            openTabs: nextTabs,
            draftNotes: {
              ...get().draftNotes,
              [entry.tab.path]: entry.draftNote,
            },
            noteContentsCache: nextCache,
            recentlyClosedTabs: remainingTabs,
            error: null,
          });
          return;
        }

        await openStoredNotePath(
          entry.tab.path,
          {
            openNote: get().openNote,
            openNoteByAbsolutePath: get().openNoteByAbsolutePath,
          },
          alreadyOpen ? undefined : { openInNewTab: true },
        );

        const nextState = get();
        const reopened =
          nextState.currentNote?.path === entry.tab.path &&
          nextState.openTabs.some((tab) => tab.path === entry.tab.path);
        if (reopened) {
          set({
            openTabs: alreadyOpen
              ? nextState.openTabs
              : restoreClosedTabOrder(nextState.openTabs, entry.tab.path, entry.index),
            recentlyClosedTabs: remainingTabs,
          });
          return;
        }

        if (wasDirty && nextState.isDirty && nextState.currentNote?.path === previousPath) {
          return;
        }

        set({ recentlyClosedTabs: remainingTabs });
      }
    },

    navigateBackInNoteHistory: () => navigateNoteHistory(set, get, -1),

    navigateForwardInNoteHistory: () => navigateNoteHistory(set, get, 1),

    switchTab: (path: string) => {
      void openStoredNotePath(path, {
        openNote: get().openNote,
        openNoteByAbsolutePath: get().openNoteByAbsolutePath,
      });
    },

    reorderTabs: (fromIndex: number, toIndex: number) => {
      const { openTabs } = get();
      if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return;

      const tabs = [...openTabs];
      const [moved] = tabs.splice(fromIndex, 1);
      if (!moved) return;
      tabs.splice(toIndex, 0, moved);
      set({ openTabs: tabs });
    },

    syncDisplayName: (path: string, title: string) => {
      updateDisplayName(set, path, title);
    },

    getDisplayName: (path: string) => {
      const draftNote = get().draftNotes[path];
      if (draftNote) {
        return resolveDraftNoteTitle(draftNote.name);
      }

      return get().displayNames.get(path) ?? getNoteTitleFromPath(path);
    },
  };
}
