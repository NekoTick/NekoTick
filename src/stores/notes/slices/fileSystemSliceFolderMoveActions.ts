import { isImageFilename } from '@/lib/assets/core/naming';
import { getStorageAdapter } from '@/lib/storage/adapter';
import {
  updateFolderNode,
} from '../fileTreeUtils';
import { isInvalidMoveTarget } from '../utils/fs/moveValidation';
import { resolveUniqueRenamedPath } from '../utils/fs/pathOperations';
import { resolveNotesRootRelativeFullPath } from '../utils/fs/notesRootPathContainment';
import { moveItemImpl } from '../utils/fs/renameOperations';
import { buildSortedRootFolder } from '../utils/fs/rootFolderState';
import { markExpectedExternalChange } from '../document/externalChangeRegistry';
import { emitNotesExternalPathRename } from '../document/externalPathBroadcast';
import { assertValidFileName } from '../noteUtils';
import {
  remapCurrentNoteForExternalRename,
  remapOpenTabsForExternalRename,
} from '../document/externalPathSync';
import { remapNoteNavigationHistoryForExternalRename } from '../document/noteNavigationHistory';
import { persistWorkspaceSnapshot } from '../workspacePersistence';
import { applyPathRenameState } from './fileSystemSliceHelpers';
import { flushCurrentPendingEditorMarkdown } from '../pendingEditorMarkdownFlusher';
import { moveImageAction } from './fileSystemSliceRenameImageAction';
import {
  isActiveNotesPath,
  moveRootFolderChildren,
  remapMetadataForRename,
  remapStarredForPathRename,
} from './fileSystemSliceRenameShared';
import type { FileSystemSliceGet, FileSystemSliceSet } from './fileSystemSliceContracts';

export async function renameFolderAction(
  set: FileSystemSliceSet,
  get: FileSystemSliceGet,
  path: string,
  newName: string,
): Promise<void> {
  flushCurrentPendingEditorMarkdown();
  const {
    notesPath,
    noteMetadata,
  } = get();
  const storage = getStorageAdapter();

  try {
    assertValidFileName(newName);
    const { relativePath: safePath, fullPath } = await resolveNotesRootRelativeFullPath(notesPath, path);
    const {
      relativePath: newPath,
      fullPath: newFullPath,
      fileName,
    } = await resolveUniqueRenamedPath(notesPath, safePath, newName, true);
    if (newPath === safePath) {
      return;
    }

    markExpectedExternalChange(fullPath, true);
    markExpectedExternalChange(newFullPath, true);
    await storage.rename(fullPath, newFullPath);
    if (!isActiveNotesPath(get, notesPath)) {
      return;
    }
    emitNotesExternalPathRename({ notesPath, oldPath: safePath, newPath });

    const latestState = get();
    const updatedMetadata = remapMetadataForRename(
      latestState.noteMetadata ?? noteMetadata,
      safePath,
      newPath,
    );
    const updatedCurrentNote = remapCurrentNoteForExternalRename(
      latestState.currentNote,
      safePath,
      newPath,
    );
    const { nextRecentNotes, nextDisplayNames, nextNoteContentsCache } = applyPathRenameState({
      oldPath: safePath,
      newPath,
      recentNotes: latestState.recentNotes,
      displayNames: latestState.displayNames,
      noteContentsCache: latestState.noteContentsCache,
    });
    const updatedStarred = remapStarredForPathRename(
      latestState.starredEntries,
      notesPath,
      safePath,
      newPath,
    );

    if (!latestState.rootFolder) {
      set({
        starredEntries: updatedStarred.entries,
        starredFolders: updatedStarred.folders,
        starredNotes: updatedStarred.notes,
        noteMetadata: updatedMetadata,
        recentNotes: nextRecentNotes,
        displayNames: nextDisplayNames,
        noteContentsCache: nextNoteContentsCache,
        openTabs: remapOpenTabsForExternalRename(latestState.openTabs, safePath, newPath),
        currentNote: updatedCurrentNote,
        currentNoteRevision:
          latestState.currentNote?.path !== updatedCurrentNote?.path
            ? latestState.currentNoteRevision + 1
            : latestState.currentNoteRevision,
        ...remapNoteNavigationHistoryForExternalRename(
          latestState.noteNavigationHistory,
          latestState.noteNavigationHistoryIndex,
          safePath,
          newPath,
        ),
      });
      return;
    }

    const nextRootFolder = buildSortedRootFolder(
      latestState.rootFolder,
      updateFolderNode(latestState.rootFolder.children, safePath, fileName, newPath),
      latestState.fileTreeSortMode,
      updatedMetadata,
    );

    set({
      starredEntries: updatedStarred.entries,
      starredFolders: updatedStarred.folders,
      starredNotes: updatedStarred.notes,
      noteMetadata: updatedMetadata,
      recentNotes: nextRecentNotes,
      displayNames: nextDisplayNames,
      noteContentsCache: nextNoteContentsCache,
      rootFolder: nextRootFolder,
      openTabs: remapOpenTabsForExternalRename(latestState.openTabs, safePath, newPath),
      currentNote: updatedCurrentNote,
      currentNoteRevision:
        latestState.currentNote?.path !== updatedCurrentNote?.path
          ? latestState.currentNoteRevision + 1
          : latestState.currentNoteRevision,
      ...remapNoteNavigationHistoryForExternalRename(
        latestState.noteNavigationHistory,
        latestState.noteNavigationHistoryIndex,
        safePath,
        newPath,
      ),
    });

    persistWorkspaceSnapshot(notesPath, {
      rootFolder: nextRootFolder,
      currentNotePath: updatedCurrentNote?.path ?? null,
      fileTreeSortMode: latestState.fileTreeSortMode,
    });
  } catch (error) {
    if (notesPath && !isActiveNotesPath(get, notesPath)) {
      return;
    }
    set({ error: error instanceof Error ? error.message : 'Failed to rename folder' });
  }
}

export async function moveItemAction(
  set: FileSystemSliceSet,
  get: FileSystemSliceGet,
  sourcePath: string,
  targetFolderPath: string,
): Promise<void> {
  flushCurrentPendingEditorMarkdown();
  const {
    notesPath,
    rootFolder,
    currentNote,
    openTabs,
    starredEntries,
    fileTreeSortMode,
    noteMetadata,
  } = get();

  try {
    if (isInvalidMoveTarget(sourcePath, targetFolderPath)) {
      return;
    }

    if (isImageFilename(sourcePath)) {
      await moveImageAction(set, get, sourcePath, targetFolderPath);
      return;
    }

    const result = await moveItemImpl(notesPath, sourcePath, targetFolderPath, {
      rootFolder,
      currentNote,
      openTabs,
      starredEntries,
      noteMetadata,
    });
    if (!isActiveNotesPath(get, notesPath)) {
      return;
    }
    const latestState = get();
    const updatedMetadata = remapMetadataForRename(
      latestState.noteMetadata ?? noteMetadata,
      result.sourcePath,
      result.newPath,
    );
    const nextCurrentNote = remapCurrentNoteForExternalRename(
      latestState.currentNote,
      result.sourcePath,
      result.newPath,
    );
    const { nextRecentNotes, nextDisplayNames, nextNoteContentsCache } = applyPathRenameState({
      oldPath: result.sourcePath,
      newPath: result.newPath,
      recentNotes: latestState.recentNotes,
      displayNames: latestState.displayNames,
      noteContentsCache: latestState.noteContentsCache,
    });
    const latestRootFolder = latestState.rootFolder ?? rootFolder;
    const nextRootFolder = buildSortedRootFolder(
      latestRootFolder,
      latestRootFolder
        ? moveRootFolderChildren(
            latestRootFolder.children,
            result.sourcePath,
            result.newPath,
            result.targetFolderPath,
          )
        : [],
      latestState.fileTreeSortMode ?? fileTreeSortMode,
      updatedMetadata,
    );
    const updatedStarred = remapStarredForPathRename(
      latestState.starredEntries,
      notesPath,
      result.sourcePath,
      result.newPath,
    );

    set({
      starredEntries: updatedStarred.entries,
      starredNotes: updatedStarred.notes,
      starredFolders: updatedStarred.folders,
      noteMetadata: updatedMetadata,
      openTabs: remapOpenTabsForExternalRename(latestState.openTabs, result.sourcePath, result.newPath),
      currentNote: nextCurrentNote,
      currentNoteRevision:
        latestState.currentNote?.path !== nextCurrentNote?.path
          ? latestState.currentNoteRevision + 1
          : latestState.currentNoteRevision,
      recentNotes: nextRecentNotes,
      displayNames: nextDisplayNames,
      noteContentsCache: nextNoteContentsCache,
      ...remapNoteNavigationHistoryForExternalRename(
        latestState.noteNavigationHistory,
        latestState.noteNavigationHistoryIndex,
        result.sourcePath,
        result.newPath,
      ),
      ...(nextRootFolder ? { rootFolder: nextRootFolder } : {}),
    });

    persistWorkspaceSnapshot(notesPath, {
      rootFolder: nextRootFolder ?? rootFolder,
      currentNotePath: nextCurrentNote?.path ?? null,
      fileTreeSortMode: latestState.fileTreeSortMode ?? fileTreeSortMode,
    });
  } catch (error) {
    if (notesPath && !isActiveNotesPath(get, notesPath)) {
      return;
    }
    set({ error: error instanceof Error ? error.message : 'Failed to move item' });
  }
}
