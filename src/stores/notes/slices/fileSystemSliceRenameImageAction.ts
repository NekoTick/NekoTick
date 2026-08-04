import { isImageFilename } from '@/lib/assets/core/naming';
import { invalidateImageCache } from '@/lib/assets/io/reader';
import { getStorageAdapter } from '@/lib/storage/adapter';
import { updateFileNodePath } from '../fileTreeUtils';
import { saveNoteDocument } from '../document/noteDocumentPersistence';
import { markExpectedExternalChange } from '../document/externalChangeRegistry';
import { emitNotesExternalPathRename } from '../document/externalPathBroadcast';
import { setCachedNoteContent } from '../document/noteContentCache';
import { setNoteTabDirtyState } from '../document/noteTabState';
import { createEmptyMetadataFile, setNoteEntry } from '../storage';
import { persistWorkspaceSnapshot } from '../workspacePersistence';
import { buildSortedRootFolder } from '../utils/fs/rootFolderState';
import { collectImageReferenceContentUpdates } from '../utils/fs/imageReferenceRewrite';
import { getParentPath, resolveUniqueMovedPath, resolveUniqueRenamedAssetPath } from '../utils/fs/pathOperations';
import { resolveNotesRootRelativeFullPath } from '../utils/fs/notesRootPathContainment';
import { flushCurrentPendingEditorMarkdown } from '../pendingEditorMarkdownFlusher';
import { isActiveNotesPath, moveRootFolderChildren } from './fileSystemSliceRenameShared';
import type { FileSystemSliceGet, FileSystemSliceSet } from './fileSystemSliceContracts';

interface ImageRelocationTarget {
  relativePath: string;
  fullPath: string;
  fileName: string;
}

type RootFolderChildren = NonNullable<ReturnType<FileSystemSliceGet>['rootFolder']>['children'];

async function relocateImageAction(
  set: FileSystemSliceSet,
  get: FileSystemSliceGet,
  path: string,
  resolveTarget: (notesPath: string, sourcePath: string) => Promise<ImageRelocationTarget>,
  updateTree: (
    children: RootFolderChildren,
    sourcePath: string,
    target: ImageRelocationTarget,
  ) => RootFolderChildren,
  failureMessage: string,
): Promise<string | null> {
  const initialState = get();
  const notesPath = initialState.notesPath;
  let sourceFullPath = '';
  let targetFullPath = '';
  let sourceRelativePath = '';
  let targetRelativePath = '';
  let imageRenamed = false;
  let savedReferences = 0;

  try {
    if (!isImageFilename(path)) {
      throw new Error('Only image files can be relocated with this action.');
    }
    const source = await resolveNotesRootRelativeFullPath(notesPath, path);
    const target = await resolveTarget(notesPath, source.relativePath);
    if (!isImageFilename(target.relativePath)) {
      throw new Error('The image must keep a supported image extension.');
    }
    if (target.relativePath === source.relativePath) return null;

    sourceFullPath = source.fullPath;
    targetFullPath = target.fullPath;
    sourceRelativePath = source.relativePath;
    targetRelativePath = target.relativePath;
    const referenceUpdates = await collectImageReferenceContentUpdates({
      ...initialState,
      oldImagePath: source.relativePath,
      newImagePath: target.relativePath,
    });

    markExpectedExternalChange(sourceFullPath);
    markExpectedExternalChange(targetFullPath);
    await getStorageAdapter().rename(sourceFullPath, targetFullPath);
    imageRenamed = true;
    emitNotesExternalPathRename({
      notesPath,
      oldPath: source.relativePath,
      newPath: target.relativePath,
    });

    let latestState = get();
    let nextCache = latestState.noteContentsCache;
    let nextMetadata = latestState.noteMetadata ?? createEmptyMetadataFile();
    let nextCurrentNote = latestState.currentNote;
    let nextOpenTabs = latestState.openTabs;
    let currentNoteChanged = false;

    for (const update of referenceUpdates) {
      const documentPath = update.documentPath ?? update.path;
      if (!nextCache.has(documentPath)) {
        nextCache = setCachedNoteContent(
          nextCache,
          documentPath,
          update.baselineContent,
          null,
          { baselineContent: update.baselineContent },
        );
      }
      const result = await saveNoteDocument({
        notesPath,
        currentNote: { path: documentPath, content: update.content },
        cache: nextCache,
      });
      savedReferences += 1;
      nextCache = result.nextCache;
      if (documentPath !== update.path) {
        nextCache = setCachedNoteContent(
          nextCache,
          update.path,
          result.content,
          result.modifiedAt,
          { updateBaseline: true, size: result.size },
        );
      }
      nextMetadata = setNoteEntry(nextMetadata, update.path, result.metadata);
      if (documentPath !== update.path) {
        nextMetadata = setNoteEntry(nextMetadata, documentPath, result.metadata);
      }
      nextOpenTabs = setNoteTabDirtyState(nextOpenTabs, documentPath, false);
      if (nextCurrentNote?.path === documentPath) {
        nextCurrentNote = { ...nextCurrentNote, content: result.content };
        currentNoteChanged = true;
      }
    }

    if (!isActiveNotesPath(get, notesPath)) return target.relativePath;
    latestState = get();
    const rootFolder = latestState.rootFolder ?? initialState.rootFolder;
    const nextRootFolder = rootFolder
      ? buildSortedRootFolder(
          rootFolder,
          updateTree(rootFolder.children, source.relativePath, target),
          latestState.fileTreeSortMode,
          nextMetadata,
        )
      : null;

    invalidateImageCache(sourceFullPath);
    invalidateImageCache(targetFullPath);
    set({
      noteContentsCache: nextCache,
      noteContentsCacheRevision: latestState.noteContentsCacheRevision + 1,
      noteMetadata: nextMetadata,
      openTabs: nextOpenTabs,
      currentNote: nextCurrentNote,
      currentNoteRevision: currentNoteChanged
        ? latestState.currentNoteRevision + 1
        : latestState.currentNoteRevision,
      isDirty: currentNoteChanged ? false : latestState.isDirty,
      ...(nextRootFolder ? { rootFolder: nextRootFolder } : {}),
      error: null,
    });
    persistWorkspaceSnapshot(notesPath, {
      rootFolder: nextRootFolder ?? rootFolder,
      currentNotePath: nextCurrentNote?.path ?? null,
      fileTreeSortMode: latestState.fileTreeSortMode,
    });
    return target.relativePath;
  } catch (error) {
    if (imageRenamed && savedReferences === 0 && sourceFullPath && targetFullPath) {
      markExpectedExternalChange(targetFullPath);
      markExpectedExternalChange(sourceFullPath);
      await getStorageAdapter().rename(targetFullPath, sourceFullPath).then(() => {
        emitNotesExternalPathRename({
          notesPath,
          oldPath: targetRelativePath,
          newPath: sourceRelativePath,
        });
      }).catch(() => undefined);
    }
    if (!notesPath || isActiveNotesPath(get, notesPath)) {
      set({ error: error instanceof Error ? error.message : failureMessage });
    }
    return null;
  }
}

export async function renameImageAction(
  set: FileSystemSliceSet,
  get: FileSystemSliceGet,
  path: string,
  newName: string,
): Promise<string | null> {
  flushCurrentPendingEditorMarkdown();
  return relocateImageAction(
    set,
    get,
    path,
    (notesPath, sourcePath) => resolveUniqueRenamedAssetPath(notesPath, sourcePath, newName),
    (children, sourcePath, target) => updateFileNodePath(
      children,
      sourcePath,
      target.relativePath,
      target.fileName,
    ),
    'Failed to rename image',
  );
}

export async function moveImageAction(
  set: FileSystemSliceSet,
  get: FileSystemSliceGet,
  path: string,
  targetFolderPath: string,
): Promise<string | null> {
  return relocateImageAction(
    set,
    get,
    path,
    (notesPath, sourcePath) => resolveUniqueMovedPath(
      notesPath,
      sourcePath,
      targetFolderPath || undefined,
      false,
    ),
    (children, sourcePath, target) => moveRootFolderChildren(
      children,
      sourcePath,
      target.relativePath,
      getParentPath(target.relativePath),
    ),
    'Failed to move image',
  );
}
