import { normalizeEditorRuntimeMarkdownArtifactsForState } from '@/lib/notes/markdown/markdownSerializationUtils';
import { getNoteTitleFromPath } from '@/lib/notes/displayName';
import { useNotesStore } from '@/stores/useNotesStore';
import { getCachedNoteModifiedAt, setCachedNoteContent } from './document/noteContentCache';
import { setNoteTabDirtyState } from './document/noteTabState';
import { saveNoteDocument } from './document/noteDocumentPersistence';
import { createEmptyMetadataFile, setNoteEntry } from './storage';
import {
  buildSortedRootFolder,
  shouldRebuildRootFolderForMetadataChange,
} from './utils/fs/rootFolderState';
import { isDraftNotePath } from './draftNote';

export {
  flushCurrentPendingEditorMarkdown,
  setPendingEditorMarkdownFlusher,
} from './pendingEditorMarkdownFlusher';

function applyPendingEditorMarkdown(
  notePath: string | null | undefined,
  markdown: string | null,
  options: { markDirty: boolean },
): boolean {
  if (!notePath || markdown === null) {
    return false;
  }

  const normalizedMarkdown = normalizeEditorRuntimeMarkdownArtifactsForState(markdown);
  const state = useNotesStore.getState();
  const isKnownWorkspaceNote =
    state.currentNote?.path === notePath ||
    state.openTabs.some((tab) => tab.path === notePath) ||
    state.noteContentsCache.has(notePath);
  if (!isKnownWorkspaceNote) {
    return false;
  }

  const currentContent =
    state.currentNote?.path === notePath
      ? state.currentNote.content
      : state.noteContentsCache.get(notePath)?.content;

  if (currentContent === normalizedMarkdown) {
    return false;
  }

  const modifiedAt = getCachedNoteModifiedAt(state.noteContentsCache, notePath);
  useNotesStore.setState((latest) => {
    const isCurrentNote = latest.currentNote?.path === notePath;
    const clearsTargetSaveError = options.markDirty && latest.saveErrorPath === notePath;
    const nextCurrentNote = isCurrentNote && latest.currentNote
      ? { path: latest.currentNote.path, content: normalizedMarkdown }
      : latest.currentNote;

    return {
      currentNote: nextCurrentNote,
      currentNoteRevision: isCurrentNote
        ? latest.currentNoteRevision + 1
        : latest.currentNoteRevision,
      isDirty: isCurrentNote ? options.markDirty : latest.isDirty,
      openTabs: options.markDirty
        ? (
            latest.openTabs.some((tab) => tab.path === notePath)
              ? setNoteTabDirtyState(latest.openTabs, notePath, true)
              : [
                  ...latest.openTabs,
                  { path: notePath, name: getNoteTitleFromPath(notePath), isDirty: true },
                ]
          )
        : latest.openTabs,
      saveError: clearsTargetSaveError ? null : latest.saveError,
      saveErrorPath: clearsTargetSaveError ? null : latest.saveErrorPath,
      noteContentsCache: setCachedNoteContent(
        latest.noteContentsCache,
        notePath,
        normalizedMarkdown,
        modifiedAt,
      ),
    };
  });

  return true;
}

export function flushPendingEditorMarkdown(notePath: string | null | undefined, markdown: string | null): boolean {
  return applyPendingEditorMarkdown(notePath, markdown, { markDirty: true });
}

export async function savePendingEditorMarkdown(
  notePath: string | null | undefined,
  markdown: string | null,
  options: { replaceConcurrentContent?: boolean } = {},
): Promise<boolean> {
  if (!notePath || isDraftNotePath(notePath)) {
    return false;
  }
  if (!applyPendingEditorMarkdown(notePath, markdown, { markDirty: false })) {
    return false;
  }

  const state = useNotesStore.getState();
  const content =
    state.currentNote?.path === notePath
      ? state.currentNote.content
      : state.noteContentsCache.get(notePath)?.content;
  if (content === undefined) {
    return false;
  }

  const {
    notesPath,
    noteContentsCache,
    noteMetadata,
    rootFolder,
    fileTreeSortMode,
  } = state;

  try {
    const saved = await saveNoteDocument({
      notesPath,
      currentNote: { path: notePath, content },
      cache: noteContentsCache,
    });

    const latest = useNotesStore.getState();
    if (latest.notesPath !== notesPath) {
      return false;
    }

    const isCurrentNote = latest.currentNote?.path === notePath;
    const tabExists = latest.openTabs.some((tab) => tab.path === notePath);
    if (!isCurrentNote && !tabExists) {
      return false;
    }

    const latestContent =
      isCurrentNote
        ? latest.currentNote?.content
        : latest.noteContentsCache.get(notePath)?.content;
    const hasNewerEdit = latestContent !== undefined && latestContent !== content;
    const keepNewerEdit = hasNewerEdit && !options.replaceConcurrentContent;
    const clearsTargetSaveError = latest.saveErrorPath === notePath;
    const nextContent = keepNewerEdit ? latestContent : saved.content;
    const metadataBase = latest.noteMetadata ?? noteMetadata ?? createEmptyMetadataFile();
    const nextMetadata = setNoteEntry(
      metadataBase,
      notePath,
      saved.metadata,
    );
    const latestSortMode = latest.fileTreeSortMode ?? fileTreeSortMode;
    const latestRootFolder = latest.rootFolder ?? rootFolder;
    const shouldRebuildRootFolder = shouldRebuildRootFolderForMetadataChange(
      latestSortMode,
      metadataBase.notes[notePath],
      nextMetadata.notes[notePath],
    );
    const nextRootFolder = shouldRebuildRootFolder
      ? buildSortedRootFolder(
          latestRootFolder,
          latestRootFolder?.children ?? [],
          latestSortMode,
          nextMetadata,
        )
      : latestRootFolder;

    useNotesStore.setState({
      currentNote: isCurrentNote && latest.currentNote
        ? { path: latest.currentNote.path, content: nextContent }
        : latest.currentNote,
      currentNoteRevision: isCurrentNote && nextContent !== latest.currentNote?.content
        ? latest.currentNoteRevision + 1
        : latest.currentNoteRevision,
      isDirty: isCurrentNote ? keepNewerEdit : latest.isDirty,
      noteMetadata: nextMetadata,
      rootFolder: nextRootFolder,
      noteContentsCache: setCachedNoteContent(
        latest.noteContentsCache,
        notePath,
        nextContent,
        saved.modifiedAt,
        keepNewerEdit
          ? { baselineContent: saved.content, size: saved.size }
          : { updateBaseline: true, size: saved.size },
      ),
      openTabs: setNoteTabDirtyState(latest.openTabs, notePath, keepNewerEdit),
      error: clearsTargetSaveError ? null : latest.error,
      saveError: clearsTargetSaveError ? null : latest.saveError,
      saveErrorPath: clearsTargetSaveError ? null : latest.saveErrorPath,
    });

    return !keepNewerEdit;
  } catch (error) {
    const latest = useNotesStore.getState();
    useNotesStore.setState({
      error: error instanceof Error ? error.message : 'Failed to save note',
      saveError: error instanceof Error ? error.message : 'Failed to save note',
      saveErrorPath: notePath,
      openTabs: setNoteTabDirtyState(latest.openTabs, notePath, true),
      isDirty: latest.currentNote?.path === notePath ? true : latest.isDirty,
    });
    return false;
  }
}
