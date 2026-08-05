import { isAbsolutePath } from '@/lib/storage/adapter';
import { hasDraftUnsavedChanges } from '../draftNote';
import { openStoredNotePath } from '../openNotePath';
import { removeCachedNoteContent, setCachedNoteContent } from '../document/noteContentCache';
import { saveNoteDocument } from '../document/noteDocumentPersistence';
import { setNoteTabDirtyState } from '../document/noteTabState';
import { pushRecentlyClosedTab } from '../document/recentlyClosedTabState';
import { createEmptyMetadataFile, setNoteEntry } from '../storage';
import { persistWorkspaceSnapshot } from '../workspacePersistence';
import { buildSortedRootFolder } from '../utils/fs/rootFolderState';
import { flushCurrentPendingEditorMarkdown } from '../pendingEditorMarkdownFlusher';
import type { NotesGet, NotesSet } from './workspaceSliceTypes';
import { clearNoteRecovery } from '../noteRecovery';

type NotesState = ReturnType<NotesGet>;

function getDraftContentSnapshot(state: NotesState, path: string): string {
  return state.currentNote?.path === path
    ? state.currentNote.content
    : state.noteContentsCache.get(path)?.content ?? '';
}

function draftHasUnsavedChanges(state: NotesState, path: string): boolean {
  const draftNote = state.draftNotes[path];
  if (!draftNote) {
    return false;
  }

  return hasDraftUnsavedChanges({
    draftName: draftNote.name,
    content: getDraftContentSnapshot(state, path),
    metadata: state.noteMetadata?.notes[path],
  });
}

export async function closeCurrentNoteTab(set: NotesSet, get: NotesGet): Promise<void> {
  flushCurrentPendingEditorMarkdown();

  const noteBeforeClose = get().currentNote;
  if (!noteBeforeClose) {
    return;
  }

  const path = noteBeforeClose.path;
  const stateAfterFlush = get();
  const draftNote = stateAfterFlush.draftNotes[path];
  const currentTab = stateAfterFlush.openTabs.find((tab) => tab.path === path);

  if (draftNote) {
    if (draftHasUnsavedChanges(stateAfterFlush, path)) {
      set({ pendingDraftDiscardPath: path });
      return;
    }

    stateAfterFlush.discardDraftNote(path, { preserveHistory: false });
    return;
  } else if (stateAfterFlush.isDirty || currentTab?.isDirty) {
    await stateAfterFlush.saveNote();
    const stateAfterSave = get();
    const latestTab = stateAfterSave.openTabs.find((tab) => tab.path === path);
    if (
      (stateAfterSave.currentNote?.path === path && stateAfterSave.isDirty) ||
      latestTab?.isDirty
    ) {
      set({ error: 'Save the note before closing it.' });
      return;
    }
  }

  const { notesPath, rootFolder, fileTreeSortMode } = get();
  if (get().currentNote?.path !== path) {
    return;
  }
  set({
    currentNote: null,
    currentNoteRevision: get().currentNoteRevision + 1,
    isDirty: false,
  });
  persistWorkspaceSnapshot(notesPath, {
    rootFolder,
    currentNotePath: null,
    fileTreeSortMode,
  });
}

export async function closeWorkspaceTab(
  set: NotesSet,
  get: NotesGet,
  path: string
): Promise<void> {
  flushCurrentPendingEditorMarkdown();
  const {
    openTabs,
    currentNote,
    isDirty,
    saveNote,
    notesPath,
    rootFolder,
    fileTreeSortMode,
    draftNotes,
    noteContentsCache,
    noteMetadata,
  } = get();

  const pathIsAbsolute = isAbsolutePath(path);
  const { isNewlyCreated } = get();
  const closingTab = openTabs.find((tab) => tab.path === path);
  const draftNote = draftNotes[path];
  if (draftNote) {
    if (draftHasUnsavedChanges(get(), path)) {
      set({ pendingDraftDiscardPath: path });
    } else {
      get().discardDraftNote(path, { preserveHistory: false });
    }
    return;
  }

  const isEmptyNote =
    !pathIsAbsolute &&
    isNewlyCreated &&
    currentNote?.path === path &&
    (!currentNote.content.trim() ||
      currentNote.content.trim() === '#' ||
      currentNote.content.trim() === '# ' ||
      currentNote.content.trim().length === 0);

  if (isEmptyNote) {
    await get().deleteNote(path);
    return;
  }

  if (currentNote?.path === path && isDirty) {
    await saveNote();
    if (get().isDirty) {
      set({ error: 'Save the note before closing it.' });
      return;
    }
  }

  if (currentNote?.path !== path && closingTab?.isDirty) {
    const cachedContent = noteContentsCache.get(path)?.content;
    if (cachedContent === undefined) {
      set({ error: 'Failed to close dirty tab because its cached content is missing.' });
      return;
    }

    try {
      const { content, metadata, modifiedAt, size } = await saveNoteDocument({
        notesPath,
        currentNote: { path, content: cachedContent },
        cache: noteContentsCache,
      });
      void clearNoteRecovery(notesPath, path, cachedContent);
      const latestState = get();
      if (latestState.notesPath !== notesPath) {
        return;
      }
      const latestCachedContent = latestState.currentNote?.path === path
        ? latestState.currentNote.content
        : latestState.noteContentsCache.get(path)?.content;
      const hasNewerEdit =
        latestCachedContent !== undefined &&
        latestCachedContent !== cachedContent;
      const nextMetadata = setNoteEntry(
        latestState.noteMetadata ?? noteMetadata ?? createEmptyMetadataFile(),
        path,
        metadata,
      );
      const nextRootFolder = buildSortedRootFolder(
        latestState.rootFolder,
        latestState.rootFolder?.children ?? [],
        latestState.fileTreeSortMode,
        nextMetadata,
      );

      set({
        noteMetadata: nextMetadata,
        rootFolder: nextRootFolder,
        noteContentsCache: setCachedNoteContent(
          latestState.noteContentsCache,
          path,
          hasNewerEdit ? latestCachedContent : content,
          modifiedAt,
          hasNewerEdit ? { baselineContent: content, size } : { updateBaseline: true, size },
        ),
        isDirty: latestState.currentNote?.path === path && hasNewerEdit
          ? true
          : latestState.isDirty,
        openTabs: setNoteTabDirtyState(latestState.openTabs, path, hasNewerEdit),
        error: null,
      });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to save dirty tab before closing.' });
      return;
    }
  }

  const latestBeforeClose = get();
  const tabsBeforeClose = latestBeforeClose.openTabs;
  const tabBeforeClose = tabsBeforeClose.find((tab) => tab.path === path);
  if (tabBeforeClose?.isDirty) {
    set({ error: 'Save the note before closing it.' });
    return;
  }
  const updatedTabs = tabsBeforeClose.filter((t) => t.path !== path);
  set({
    openTabs: updatedTabs,
    noteContentsCache: removeCachedNoteContent(latestBeforeClose.noteContentsCache, path),
    recentlyClosedTabs: tabBeforeClose
      ? pushRecentlyClosedTab(
          latestBeforeClose.recentlyClosedTabs,
          tabBeforeClose,
          tabsBeforeClose.findIndex((tab) => tab.path === path)
        )
      : latestBeforeClose.recentlyClosedTabs,
  });

  if (latestBeforeClose.currentNote?.path === path) {
    if (updatedTabs.length > 0) {
      const lastTab = updatedTabs[updatedTabs.length - 1];
      if (lastTab) {
        void openStoredNotePath(lastTab.path, {
          openNote: get().openNote,
          openNoteByAbsolutePath: get().openNoteByAbsolutePath,
        });
      }
    } else {
      set({ currentNote: null, isDirty: false });
      const latestAfterClose = get();
      persistWorkspaceSnapshot(notesPath, {
        rootFolder: latestAfterClose.rootFolder ?? rootFolder,
        currentNotePath: null,
        fileTreeSortMode: latestAfterClose.fileTreeSortMode ?? fileTreeSortMode,
      });
    }
  }
}
