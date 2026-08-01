import { getNoteTitleFromPath } from '@/lib/notes/displayName';
import { isSupportedMarkdownPath } from '@/lib/notes/markdownFile';
import { updateDisplayName } from '../displayNameUtils';
import {
  addToRecentNotes,
  createEmptyMetadataFile,
  setNoteEntry,
} from '../storage';
import { loadNoteDocument } from '../document/noteDocumentPersistence';
import {
  getExternalPathMutationRevision,
  wasPathExternallyMutatedSince,
} from '../document/externalPathMutationRegistry';
import { pushNoteNavigationHistory } from '../document/noteNavigationHistory';
import { persistWorkspaceSnapshot } from '../workspacePersistence';
import { flushCurrentPendingEditorMarkdown } from '../pendingEditorMarkdownFlusher';
import { normalizeNotesRootRelativePath } from '../utils/fs/notesRootPathContainment';
import type { NotesGet, NotesSet, WorkspaceSlice } from './workspaceSliceTypes';
import { setNoteTabDirtyState } from '../document/noteTabState';
import { resolveNoteRecovery } from '../noteRecovery';
import {
  awaitStartedOrCancelQueuedNotePrefetch,
  createOpenNoteRequestId,
  getDiscardableCurrentDraftPath,
  isLatestOpenNoteRequestId,
  isInternalWorkspaceNotePath,
  limitWorkspaceNoteContents,
  mergeLoadedNoteCacheEntry,
  mergeLoadedNoteMetadata,
  mergeOpenedTab,
  openDraftNoteFromMemory,
  preserveDirtyCurrentNoteContent,
  resolveLatestOpenedContent,
} from './workspaceOpenNoteSupport';

export function createOpenNoteAction(set: NotesSet, get: NotesGet): Pick<WorkspaceSlice, 'openNote'> {
  return {
    openNote: async (path: string, openInNewTab: boolean = false, options) => {
      flushCurrentPendingEditorMarkdown();
      const openRequestId = createOpenNoteRequestId();
      const shouldUpdateNavigationHistory = options?.updateNavigationHistory !== false;
      const targetIsDraft = Boolean(get().draftNotes[path]);
      if (!targetIsDraft) {
        if (!isSupportedMarkdownPath(path)) {
          set({ error: 'Only Markdown files can be opened as notes.' });
          return;
        }
        const normalizedPath = normalizeNotesRootRelativePath(path);
        if (normalizedPath == null) {
          set({ error: 'Path must stay inside the opened folder.' });
          return;
        }
        if (isInternalWorkspaceNotePath(normalizedPath)) {
          set({ error: 'Path must not be inside an internal notes folder.' });
          return;
        }
        path = normalizedPath;
      }
      const pathMutationRevision = getExternalPathMutationRevision();

      const discardableDraftPath = getDiscardableCurrentDraftPath(get(), path);
      if (discardableDraftPath) {
        get().discardDraftNote(discardableDraftPath, {
          preserveHistory: false,
          activateFallback: false,
        });
      }

      let { notesPath, isDirty, saveNote, recentNotes, currentNote, noteContentsCache, draftNotes } = get();
      let shouldOpenInNewTab = openInNewTab;
      let preservedDirtySaveError: string | null = null;
      if (isDirty && currentNote && draftNotes[currentNote.path]) {
        shouldOpenInNewTab = true;
      }

      if (
        isDirty &&
        currentNote &&
        !draftNotes[currentNote.path] &&
        currentNote.path !== path
      ) {
        await saveNote();
        if (get().notesPath !== notesPath) {
          return;
        }
        if (get().isDirty) {
          shouldOpenInNewTab = true;
          preservedDirtySaveError = get().error;
        }
        ({ notesPath, recentNotes, currentNote, noteContentsCache } = get());
      }

      const stateBeforeOpen = get();
      const preservedCache = preserveDirtyCurrentNoteContent(stateBeforeOpen, path);
      if (preservedCache !== stateBeforeOpen.noteContentsCache) {
        set({ noteContentsCache: preservedCache });
        noteContentsCache = preservedCache;
      }

      if (targetIsDraft && openDraftNoteFromMemory(
        set,
        get,
        path,
        shouldOpenInNewTab,
        shouldUpdateNavigationHistory,
        preservedDirtySaveError,
      )) {
        return;
      }

      try {
        const reusedActivePrefetch = await awaitStartedOrCancelQueuedNotePrefetch(notesPath, path);
        if (reusedActivePrefetch) {
          noteContentsCache = get().noteContentsCache;
        }

        const existingTabIsDirty = Boolean(get().openTabs.find((tab) => tab.path === path)?.isDirty);
        const { content, nextCache: loadedCache, metadata: loadedMetadata } = await loadNoteDocument({
          notesPath,
          path,
          cache: noteContentsCache,
          allowStaleCachedContent: existingTabIsDirty,
        });
        const loadedDiskContent = loadedCache.get(path)?.savedContent ?? content;
        const recovery = await resolveNoteRecovery({
          notesPath,
          notePath: path,
          diskContent: loadedDiskContent,
        });
        if (!isLatestOpenNoteRequestId(openRequestId) || get().notesPath !== notesPath) {
          return;
        }
        if (wasPathExternallyMutatedSince(path, pathMutationRevision)) {
          return;
        }
        const latestState = get();
        const latestOpenTabs = latestState.openTabs;
        const latestCurrentNote = latestState.currentNote;
        const latestExistingTab = latestOpenTabs.find((tab) => tab.path === path);
        const latestOpenedContent = resolveLatestOpenedContent(
          latestState,
          path,
          recovery?.content ?? content,
        );
        const usesRecovery = Boolean(recovery && latestOpenedContent.dirtyContent === undefined);
        const nextMetadata = setNoteEntry(
          latestState.noteMetadata ?? createEmptyMetadataFile(),
          path,
          mergeLoadedNoteMetadata(loadedMetadata, latestState.noteMetadata?.notes[path])
        );
        const fileName = getNoteTitleFromPath(path);
        const tabName = fileName;
        const updatedRecent = addToRecentNotes(path, latestState.recentNotes ?? recentNotes);
        const openedTabs = mergeOpenedTab(
          latestOpenTabs,
          latestCurrentNote,
          path,
          tabName,
          shouldOpenInNewTab,
        );
        const updatedTabs = usesRecovery
          ? setNoteTabDirtyState(openedTabs, path, true)
          : openedTabs;
        const nextCache = mergeLoadedNoteCacheEntry(
          latestState.noteContentsCache,
          loadedCache,
          path,
          usesRecovery ? latestOpenedContent.content : latestOpenedContent.dirtyContent,
        );
        const navigationHistoryUpdate = shouldUpdateNavigationHistory
          ? pushNoteNavigationHistory(latestState, path)
          : null;

        updateDisplayName(set, path, tabName);
        const nextCurrentNoteRevision = latestState.currentNoteRevision + 1;
        set({
          currentNote: { path, content: latestOpenedContent.content },
          currentNoteRevision: nextCurrentNoteRevision,
          workspaceRestoredNote: options?.restoredFromWorkspace
            ? { path, revision: nextCurrentNoteRevision }
            : null,
          isDirty: usesRecovery || (latestExistingTab?.isDirty ?? false),
          error: usesRecovery && recovery?.conflictError
            ? recovery.conflictError
            : preservedDirtySaveError,
          recentNotes: updatedRecent,
          openTabs: updatedTabs,
          isNewlyCreated: false,
          noteContentsCache: limitWorkspaceNoteContents(nextCache, {
            ...get(),
            openTabs: updatedTabs,
            currentNote: { path, content: latestOpenedContent.content },
          }),
          noteMetadata: nextMetadata,
          ...(usesRecovery && recovery?.conflictError
            ? { saveError: recovery.conflictError, saveErrorPath: path }
            : {}),
          ...(navigationHistoryUpdate ?? {}),
        });

        const { rootFolder, fileTreeSortMode } = get();
        persistWorkspaceSnapshot(notesPath, {
          rootFolder,
          currentNotePath: path,
          fileTreeSortMode,
        });
      } catch (error) {
        if (isLatestOpenNoteRequestId(openRequestId) && get().notesPath === notesPath) {
          set({ error: error instanceof Error ? error.message : 'Failed to open note' });
        }
      }
    },
  };
}
