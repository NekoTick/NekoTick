import { getParentPath } from '@/lib/storage/adapter';
import { getNoteTitleFromPath } from '@/lib/notes/displayName';
import { dispatchOpenMarkdownTargetEvent } from '@/components/Notes/features/OpenTarget/openTargetEvents';
import { addNodeToTree, findNode } from '../fileTreeUtils';
import { chooseDraftSavePath, resolveDraftSaveLocation } from '../draftNoteSave';
import { canAutoSaveDraftNote, hasDraftUnsavedChanges } from '../draftNote';
import {
  addToRecentNotes,
  createEmptyMetadataFile,
  persistRecentNotes,
  remapMetadataEntries,
  setNoteEntry,
} from '../storage';
import { removeCachedNoteContent, setCachedNoteContent } from '../document/noteContentCache';
import { remapNoteNavigationHistoryForExternalRename } from '../document/noteNavigationHistory';
import { saveNoteDocument } from '../document/noteDocumentPersistence';
import { flushCurrentPendingEditorMarkdown } from '../pendingEditorMarkdownFlusher';
import { persistWorkspaceSnapshot } from '../workspacePersistence';
import { buildSortedRootFolder } from '../utils/fs/rootFolderState';
import { resolveUniquePath } from '../utils/fs/pathOperations';
import { invalidatePendingFileTreeLoads } from './fileSystemSliceTreeActions';
import type { NotesGet, NotesSet, WorkspaceSlice } from './workspaceSliceTypes';
import { migrateDraftNoteRecovery } from '../noteRecovery';

type SaveNoteOptions = Parameters<WorkspaceSlice['saveNote']>[0];

interface SaveDraftNoteInput {
  set: NotesSet;
  get: NotesGet;
  options: SaveNoteOptions;
  notePathAtSaveStart: string;
  contentAtSaveStart: string;
}

function isCurrentSaveTarget(get: NotesGet, notesPath: string, notePath: string) {
  const state = get();
  return state.notesPath === notesPath && state.currentNote?.path === notePath;
}

export async function saveDraftNote({
  set,
  get,
  options,
  notePathAtSaveStart,
  contentAtSaveStart,
}: SaveDraftNoteInput): Promise<boolean> {
  const {
    currentNote,
    notesPath,
    noteContentsCache,
    noteMetadata,
    rootFolder,
    fileTreeSortMode,
    draftNotes,
    recentNotes,
    displayNames,
  } = get();
  if (!currentNote) return false;

  const draftNote = draftNotes[currentNote.path];
  if (!draftNote) return false;
  if (!isCurrentSaveTarget(get, notesPath, notePathAtSaveStart)) return true;
  if (
    !options?.explicit &&
    !hasDraftUnsavedChanges({
      draftName: draftNote.name,
      content: contentAtSaveStart,
      metadata: noteMetadata?.notes[currentNote.path],
    })
  ) {
    return true;
  }

  const canAutoSaveDraftIntoCurrentNotesRoot = canAutoSaveDraftNote(notesPath, draftNote);
  const draftSaveLocation = canAutoSaveDraftIntoCurrentNotesRoot
    ? await resolveUniquePath(
        notesPath,
        draftNote.parentPath ?? undefined,
        draftNote.name || 'Untitled',
        false,
      )
    : null;
  if (!draftSaveLocation && !options?.explicit) {
    return true;
  }

  const selectedPath = draftSaveLocation?.fullPath ?? await chooseDraftSavePath(notesPath, draftNote);
  if (!selectedPath) {
    return true;
  }
  if (!isCurrentSaveTarget(get, notesPath, notePathAtSaveStart)) return true;

  const { absolutePath, relativePath } = draftSaveLocation
    ? {
        absolutePath: draftSaveLocation.fullPath,
        relativePath: draftSaveLocation.relativePath,
      }
    : resolveDraftSaveLocation(selectedPath, notesPath);
  const savedPath = relativePath ?? absolutePath;
  const { content, metadata, modifiedAt, size } = await saveNoteDocument({
    notesPath,
    currentNote: { path: savedPath, content: currentNote.content },
    cache: noteContentsCache,
  });

  flushCurrentPendingEditorMarkdown();
  const latestState = get();
  if (latestState.notesPath !== notesPath) return true;
  const latestCurrentNote = latestState.currentNote;
  const draftStillCurrent = latestCurrentNote?.path === currentNote.path;
  const draftTabExists = latestState.openTabs.some((tab) => tab.path === currentNote.path);
  if (!draftStillCurrent && !draftTabExists) {
    return true;
  }
  const latestDraftContent = draftStillCurrent
    ? latestCurrentNote.content
    : latestState.noteContentsCache.get(currentNote.path)?.content;
  const hasNewerDraftEdit =
    latestDraftContent !== undefined &&
    latestDraftContent !== contentAtSaveStart;
  const nextContent = hasNewerDraftEdit ? latestDraftContent : content;
  const tabName = getNoteTitleFromPath(savedPath);
  const nextTabs = latestState.openTabs
    .map((tab) =>
      tab.path === currentNote.path
        ? { path: savedPath, name: tabName, isDirty: hasNewerDraftEdit }
        : tab,
    )
    .filter((tab, index, tabs) => tabs.findIndex((candidate) => candidate.path === tab.path) === index);

  const nextDisplayNames = new Map(latestState.displayNames ?? displayNames);
  nextDisplayNames.delete(currentNote.path);
  nextDisplayNames.set(savedPath, tabName);

  const nextDraftNotes = { ...(latestState.draftNotes ?? draftNotes) };
  delete nextDraftNotes[currentNote.path];

  let nextMetadata = remapMetadataEntries(latestState.noteMetadata ?? noteMetadata ?? createEmptyMetadataFile(), (path) => {
    if (path === currentNote.path) return relativePath ?? null;
    return path;
  }) ?? createEmptyMetadataFile();

  nextMetadata = setNoteEntry(nextMetadata, savedPath, metadata);

  const nextCacheWithSavedNote = setCachedNoteContent(
    removeCachedNoteContent(latestState.noteContentsCache, currentNote.path),
    savedPath,
    nextContent,
    modifiedAt,
    hasNewerDraftEdit ? { baselineContent: content, size } : { updateBaseline: true, size },
  );
  const latestRecentNotes = latestState.recentNotes ?? recentNotes;
  const nextRecentNotes = relativePath ? addToRecentNotes(relativePath, latestRecentNotes) : latestRecentNotes;
  if (nextRecentNotes !== latestRecentNotes) {
    persistRecentNotes(nextRecentNotes);
  }

  const latestRootFolder = latestState.rootFolder ?? rootFolder;
  const latestSortMode = latestState.fileTreeSortMode ?? fileTreeSortMode;
  let nextRootFolder = latestRootFolder;
  if (relativePath && latestRootFolder && !findNode(latestRootFolder.children, relativePath)) {
    nextRootFolder = buildSortedRootFolder(
      latestRootFolder,
      addNodeToTree(latestRootFolder.children, getParentPath(relativePath), {
        id: relativePath,
        name: tabName,
        path: relativePath,
        isFolder: false as const,
      }),
      latestSortMode,
      nextMetadata,
    );
  } else if (relativePath) {
    nextRootFolder = buildSortedRootFolder(
      latestRootFolder,
      latestRootFolder?.children ?? [],
      latestSortMode,
      nextMetadata,
    );
  }

  invalidatePendingFileTreeLoads();
  set({
    currentNote: draftStillCurrent
      ? { path: savedPath, content: nextContent }
      : latestState.currentNote,
    currentNoteRevision: draftStillCurrent
      ? get().currentNoteRevision + 1
      : get().currentNoteRevision,
    isDirty: draftStillCurrent ? hasNewerDraftEdit : latestState.isDirty,
    isNewlyCreated: draftStillCurrent ? false : latestState.isNewlyCreated,
    noteMetadata: nextMetadata,
    rootFolder: nextRootFolder,
    noteContentsCache: nextCacheWithSavedNote,
    openTabs: nextTabs,
    recentNotes: nextRecentNotes,
    displayNames: nextDisplayNames,
    draftNotes: nextDraftNotes,
    ...remapNoteNavigationHistoryForExternalRename(
      latestState.noteNavigationHistory,
      latestState.noteNavigationHistoryIndex,
      currentNote.path,
      savedPath,
    ),
    pendingDraftDiscardPath:
      latestState.pendingDraftDiscardPath === currentNote.path
        ? null
        : latestState.pendingDraftDiscardPath,
    error: null,
    saveError: null,
    saveErrorPath: null,
  });

  void migrateDraftNoteRecovery({
    notesPath,
    draftPath: currentNote.path,
    savedPath,
    sourceContent: contentAtSaveStart,
    savedContent: content,
    latestContent: nextContent,
    state: get(),
  });

  persistWorkspaceSnapshot(notesPath, {
    rootFolder: nextRootFolder,
    currentNotePath: draftStillCurrent ? relativePath ?? null : latestState.currentNote?.path ?? null,
    fileTreeSortMode: latestSortMode,
  });

  if (!relativePath && !options?.suppressOpenTarget) {
    dispatchOpenMarkdownTargetEvent(absolutePath);
  }

  return true;
}
