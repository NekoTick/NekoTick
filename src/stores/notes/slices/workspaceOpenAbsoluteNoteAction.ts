import { getNoteTitleFromPath } from '@/lib/notes/displayName';
import { isSupportedMarkdownPath } from '@/lib/notes/markdownFile';
import { isAbsolutePath, normalizeAbsolutePath } from '@/lib/storage/adapter';
import { updateDisplayName } from '../displayNameUtils';
import {
  createEmptyMetadataFile,
  setNoteEntry,
} from '../storage';
import { loadNoteDocument } from '../document/noteDocumentPersistence';
import {
  getExternalPathMutationRevision,
  wasPathExternallyMutatedSince,
} from '../document/externalPathMutationRegistry';
import { pushNoteNavigationHistory } from '../document/noteNavigationHistory';
import { flushCurrentPendingEditorMarkdown } from '../pendingEditorMarkdownFlusher';
import type { NotesGet, NotesSet, WorkspaceSlice } from './workspaceSliceTypes';
import { setNoteTabDirtyState } from '../document/noteTabState';
import { resolveNoteRecovery } from '../noteRecovery';
import {
  createOpenNoteRequestId,
  getDiscardableCurrentDraftPath,
  hasUnsafeWorkspaceNotePathSegment,
  isInternalWorkspaceNotePath,
  isLatestOpenNoteRequestId,
  limitWorkspaceNoteContents,
  mergeLoadedNoteCacheEntry,
  mergeLoadedNoteMetadata,
  mergeOpenedTab,
  preserveDirtyCurrentNoteContent,
  resolveLatestOpenedContent,
} from './workspaceOpenNoteSupport';

export function createOpenAbsoluteNoteAction(
  set: NotesSet,
  get: NotesGet,
): Pick<WorkspaceSlice, 'openNoteByAbsolutePath'> {
  return {
    openNoteByAbsolutePath: async (absolutePath: string, openInNewTab: boolean = false, options) => {
      flushCurrentPendingEditorMarkdown();
      const shouldUpdateNavigationHistory = options?.updateNavigationHistory !== false;
      const normalizedAbsolutePath = normalizeAbsolutePath(absolutePath);
      if (!isAbsolutePath(normalizedAbsolutePath)) {
        set({ error: 'Selected file path must be absolute' });
        return;
      }
      if (!isSupportedMarkdownPath(normalizedAbsolutePath)) {
        set({ error: 'Only Markdown files can be opened as notes.' });
        return;
      }
      if (isInternalWorkspaceNotePath(normalizedAbsolutePath)) {
        set({ error: 'Path must not be inside an internal notes folder.' });
        return;
      }
      if (hasUnsafeWorkspaceNotePathSegment(normalizedAbsolutePath)) {
        set({ error: 'Selected file path contains unsupported characters' });
        return;
      }
      const openRequestId = createOpenNoteRequestId();
      const pathMutationRevision = getExternalPathMutationRevision();
      const discardableDraftPath = getDiscardableCurrentDraftPath(get(), normalizedAbsolutePath);
      if (discardableDraftPath) {
        get().discardDraftNote(discardableDraftPath, {
          preserveHistory: false,
          activateFallback: false,
        });
      }

      let { notesPath, isDirty, saveNote, currentNote, noteContentsCache, draftNotes } = get();
      let shouldOpenInNewTab = openInNewTab;
      let preservedDirtySaveError: string | null = null;
      if (isDirty && currentNote && draftNotes[currentNote.path]) {
        shouldOpenInNewTab = true;
      }

      if (
        isDirty &&
        currentNote &&
        !draftNotes[currentNote.path] &&
        currentNote.path !== normalizedAbsolutePath
      ) {
        await saveNote();
        if (get().notesPath !== notesPath) {
          return;
        }
        if (get().isDirty) {
          shouldOpenInNewTab = true;
          preservedDirtySaveError = get().error;
        }
        ({ notesPath, currentNote, noteContentsCache } = get());
      }

      const stateBeforeOpen = get();
      const preservedCache = preserveDirtyCurrentNoteContent(stateBeforeOpen, normalizedAbsolutePath);
      if (preservedCache !== stateBeforeOpen.noteContentsCache) {
        set({ noteContentsCache: preservedCache });
        noteContentsCache = preservedCache;
      }

      try {
        const existingTabIsDirty = Boolean(get().openTabs.find((tab) => tab.path === normalizedAbsolutePath)?.isDirty);
        const { content, nextCache: loadedCache, metadata: loadedMetadata } = await loadNoteDocument({
          notesPath,
          path: normalizedAbsolutePath,
          cache: noteContentsCache,
          allowStaleCachedContent: existingTabIsDirty,
        });
        const loadedDiskContent = loadedCache.get(normalizedAbsolutePath)?.savedContent ?? content;
        const recovery = await resolveNoteRecovery({
          notesPath,
          notePath: normalizedAbsolutePath,
          diskContent: loadedDiskContent,
        });
        if (!isLatestOpenNoteRequestId(openRequestId) || get().notesPath !== notesPath) {
          return;
        }
        if (wasPathExternallyMutatedSince(normalizedAbsolutePath, pathMutationRevision)) {
          return;
        }
        const latestState = get();
        const latestOpenTabs = latestState.openTabs;
        const latestCurrentNote = latestState.currentNote;
        const latestExistingTab = latestOpenTabs.find((tab) => tab.path === normalizedAbsolutePath);
        const latestOpenedContent = resolveLatestOpenedContent(
          latestState,
          normalizedAbsolutePath,
          recovery?.content ?? content,
        );
        const usesRecovery = Boolean(recovery && latestOpenedContent.dirtyContent === undefined);
        const nextMetadata = setNoteEntry(
          latestState.noteMetadata ?? createEmptyMetadataFile(),
          normalizedAbsolutePath,
          mergeLoadedNoteMetadata(loadedMetadata, latestState.noteMetadata?.notes[normalizedAbsolutePath])
        );
        const fileName = getNoteTitleFromPath(normalizedAbsolutePath);
        const tabName = fileName;
        const openedTabs = mergeOpenedTab(
          latestOpenTabs,
          latestCurrentNote,
          normalizedAbsolutePath,
          tabName,
          shouldOpenInNewTab,
        );
        const updatedTabs = usesRecovery
          ? setNoteTabDirtyState(openedTabs, normalizedAbsolutePath, true)
          : openedTabs;
        const nextCache = mergeLoadedNoteCacheEntry(
          latestState.noteContentsCache,
          loadedCache,
          normalizedAbsolutePath,
          usesRecovery ? latestOpenedContent.content : latestOpenedContent.dirtyContent,
        );
        const navigationHistoryUpdate = shouldUpdateNavigationHistory
          ? pushNoteNavigationHistory(latestState, normalizedAbsolutePath)
          : null;

        updateDisplayName(set, normalizedAbsolutePath, tabName);
        const nextCurrentNoteRevision = latestState.currentNoteRevision + 1;
        set({
          currentNote: { path: normalizedAbsolutePath, content: latestOpenedContent.content },
          currentNoteRevision: nextCurrentNoteRevision,
          workspaceRestoredNote: options?.restoredFromWorkspace
            ? { path: normalizedAbsolutePath, revision: nextCurrentNoteRevision }
            : null,
          isDirty: usesRecovery || (latestExistingTab?.isDirty ?? false),
          error: usesRecovery && recovery?.conflictError
            ? recovery.conflictError
            : preservedDirtySaveError,
          openTabs: updatedTabs,
          isNewlyCreated: false,
          noteContentsCache: limitWorkspaceNoteContents(nextCache, {
            ...get(),
            openTabs: updatedTabs,
            currentNote: { path: normalizedAbsolutePath, content: latestOpenedContent.content },
          }),
          noteMetadata: nextMetadata,
          ...(usesRecovery && recovery?.conflictError
            ? {
                saveError: recovery.conflictError,
                saveErrorPath: normalizedAbsolutePath,
              }
            : {}),
          ...(navigationHistoryUpdate ?? {}),
        });
      } catch (error) {
        if (isLatestOpenNoteRequestId(openRequestId) && get().notesPath === notesPath) {
          set({ error: error instanceof Error ? error.message : 'Failed to open note' });
        }
      }
    },
  };
}
