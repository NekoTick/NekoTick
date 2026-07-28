import { isAbsolutePath } from '@/lib/storage/adapter';
import {
  findStarredEntryByPath,
  getStarredEntryAbsolutePath,
} from '@/stores/notes/starred';
import {
  flushPendingDeletedItemsToSystemTrash,
  flushStalePendingTrashForNotesRoot,
} from '@/stores/notes/utils/fs/trashOperations';
import { hasDraftUnsavedChanges, isDraftNotePath } from '@/stores/notes/draftNote';
import type { MetadataFile, NotesStore } from '@/stores/notes/types';
import { useNotesStore } from './useNotesStore';
import { normalizeNotesRootPath } from './notesRootConfig';

type PreservedDraftWorkspace = Pick<
  NotesStore,
  | 'currentNote'
  | 'currentNoteRevision'
  | 'isDirty'
  | 'openTabs'
  | 'draftNotes'
  | 'pendingDraftDiscardPath'
  | 'noteContentsCache'
  | 'noteMetadata'
> | null;

type PreservedExternalWorkspace = Pick<
  NotesStore,
  | 'currentNote'
  | 'currentNoteRevision'
  | 'isDirty'
  | 'openTabs'
  | 'noteContentsCache'
  | 'noteMetadata'
  | 'displayNames'
> | null;

function collectDraftWorkspaceForNotesRootTransition(): PreservedDraftWorkspace {
  const state = useNotesStore.getState();
  const candidateDraftPaths = new Set(Object.keys(state.draftNotes));
  state.openTabs.forEach((tab) => {
    if (isDraftNotePath(tab.path)) candidateDraftPaths.add(tab.path);
  });
  if (isDraftNotePath(state.currentNote?.path)) {
    candidateDraftPaths.add(state.currentNote.path);
  }

  const draftPaths = new Set<string>();
  candidateDraftPaths.forEach((draftPath) => {
    const draftEntry = state.draftNotes[draftPath];
    const draftContent = state.currentNote?.path === draftPath
      ? state.currentNote.content
      : state.noteContentsCache.get(draftPath)?.content ?? '';
    const draftMetadata = state.noteMetadata?.notes[draftPath];

    if (hasDraftUnsavedChanges({
      draftName: draftEntry?.name,
      content: draftContent,
      metadata: draftMetadata,
    })) {
      draftPaths.add(draftPath);
    }
  });

  if (draftPaths.size === 0) {
    return null;
  }

  const openTabs = state.openTabs.filter((tab) => draftPaths.has(tab.path));
  const currentNote = state.currentNote && draftPaths.has(state.currentNote.path)
    ? state.currentNote
    : null;
  const draftNotes = Object.fromEntries(
    Object.entries(state.draftNotes)
      .filter(([path]) => draftPaths.has(path))
      .map(([path, draftNote]) => [
        path,
        {
          ...draftNote,
          originNotesPath: draftNote.originNotesPath ?? state.notesPath,
        },
      ]),
  );
  const noteContentsCache = new Map(
    [...state.noteContentsCache.entries()].filter(([path]) => draftPaths.has(path)),
  );
  const draftMetadataEntries = Object.entries(state.noteMetadata?.notes ?? {})
    .filter(([path]) => draftPaths.has(path));
  const noteMetadata: MetadataFile | null = draftMetadataEntries.length > 0
    ? { version: 1, notes: Object.fromEntries(draftMetadataEntries) }
    : null;

  return {
    currentNote,
    currentNoteRevision: currentNote ? state.currentNoteRevision : 0,
    isDirty: currentNote ? state.isDirty : false,
    openTabs,
    draftNotes,
    pendingDraftDiscardPath:
      state.pendingDraftDiscardPath && draftPaths.has(state.pendingDraftDiscardPath)
        ? state.pendingDraftDiscardPath
        : null,
    noteContentsCache,
    noteMetadata,
  };
}

function isExternalAbsoluteNotePath(path: string | null | undefined, notesPath: string) {
  if (!path || !isAbsolutePath(path)) {
    return false;
  }

  const normalizedPath = normalizeNotesRootPath(path);
  const normalizedNotesPath = normalizeNotesRootPath(notesPath);
  if (normalizedNotesPath === '/') {
    return false;
  }

  const normalizedNotesPathPrefix = normalizedNotesPath.replace(/\/+$/, '');
  return !normalizedNotesPath || (
    normalizedPath !== normalizedNotesPathPrefix &&
    !normalizedPath.startsWith(`${normalizedNotesPathPrefix}/`)
  );
}

function collectExternalWorkspaceForNotesRootClose(): PreservedExternalWorkspace {
  const state = useNotesStore.getState();
  const preservedPathByOriginalPath = new Map<string, string>();
  const addPreservedPath = (path: string | null | undefined) => {
    if (!path) {
      return;
    }

    if (isExternalAbsoluteNotePath(path, state.notesPath)) {
      preservedPathByOriginalPath.set(path, path);
      return;
    }

    const starredEntry = findStarredEntryByPath(
      state.starredEntries,
      'note',
      path,
      state.notesPath,
    );
    const absoluteStarredPath = starredEntry
      ? getStarredEntryAbsolutePath(starredEntry)
      : null;
    if (absoluteStarredPath) {
      preservedPathByOriginalPath.set(path, absoluteStarredPath);
    }
  };

  state.openTabs.forEach((tab) => addPreservedPath(tab.path));
  addPreservedPath(state.currentNote?.path);

  if (preservedPathByOriginalPath.size === 0) {
    return null;
  }

  const currentNote = state.currentNote && preservedPathByOriginalPath.has(state.currentNote.path)
    ? {
        ...state.currentNote,
        path: preservedPathByOriginalPath.get(state.currentNote.path) ?? state.currentNote.path,
      }
    : null;
  const noteMetadataEntries = Object.entries(state.noteMetadata?.notes ?? {})
    .flatMap(([path, metadata]) => {
      const preservedPath = preservedPathByOriginalPath.get(path);
      return preservedPath ? [[preservedPath, metadata] as const] : [];
    });

  return {
    currentNote,
    currentNoteRevision: currentNote ? state.currentNoteRevision : 0,
    isDirty: currentNote ? state.isDirty : false,
    openTabs: state.openTabs.flatMap((tab) => {
      const preservedPath = preservedPathByOriginalPath.get(tab.path);
      return preservedPath ? [{ ...tab, path: preservedPath }] : [];
    }),
    noteContentsCache: new Map(
      [...state.noteContentsCache.entries()].flatMap(([path, cacheEntry]) => {
        const preservedPath = preservedPathByOriginalPath.get(path);
        return preservedPath ? [[preservedPath, cacheEntry] as const] : [];
      }),
    ),
    noteMetadata: noteMetadataEntries.length > 0
      ? { version: 1, notes: Object.fromEntries(noteMetadataEntries) }
      : null,
    displayNames: new Map(
      [...state.displayNames.entries()].flatMap(([path, displayName]) => {
        const preservedPath = preservedPathByOriginalPath.get(path);
        return preservedPath ? [[preservedPath, displayName] as const] : [];
      }),
    ),
  };
}

export function resetNotesWorkspaceForNotesRootTransition(
  notesPath = '',
  options: {
    preserveDrafts?: boolean;
    preserveExternalNotes?: boolean;
    preserveSidebarTree?: boolean;
  } = {},
) {
  const preservedDraftWorkspace = options.preserveDrafts
    ? collectDraftWorkspaceForNotesRootTransition()
    : null;
  const preservedExternalWorkspace = !preservedDraftWorkspace && options.preserveExternalNotes
    ? collectExternalWorkspaceForNotesRootClose()
    : null;
  const preservedWorkspace = preservedDraftWorkspace ?? preservedExternalWorkspace;

  useNotesStore.getState().clearAssetUrlCache();
  const currentNotesState = useNotesStore.getState();
  void Promise.resolve(flushPendingDeletedItemsToSystemTrash(currentNotesState.pendingDeletedItems))
    .catch(() => undefined);
  const transitionRootFolder: NotesStore['rootFolder'] = options.preserveSidebarTree
    ? currentNotesState.rootFolder ?? {
        id: '',
        name: 'Notes',
        path: '',
        isFolder: true,
        children: [],
        expanded: true,
      }
    : null;
  const transitionRootFolderPath = options.preserveSidebarTree && currentNotesState.rootFolder
    ? currentNotesState.rootFolderPath
    : null;
  useNotesStore.setState({
    currentNote: preservedWorkspace?.currentNote ?? null,
    currentNoteRevision: preservedWorkspace?.currentNoteRevision ?? 0,
    currentNoteDiskRevision: 0,
    isDirty: preservedWorkspace?.isDirty ?? false,
    openTabs: preservedWorkspace?.openTabs ?? [],
    recentlyClosedTabs: [],
    noteNavigationHistory: [],
    noteNavigationHistoryIndex: -1,
    rootFolder: transitionRootFolder,
    rootFolderPath: transitionRootFolderPath,
    notesPath,
    draftNotes: preservedDraftWorkspace?.draftNotes ?? {},
    pendingDraftDiscardPath: preservedDraftWorkspace?.pendingDraftDiscardPath ?? null,
    pendingDeletedItems: [],
    noteMetadata: preservedWorkspace?.noteMetadata ?? null,
    displayNames: preservedExternalWorkspace?.displayNames ?? new Map(),
    noteContentsCache: preservedWorkspace?.noteContentsCache ?? new Map(),
    noteContentsCacheRevision: (currentNotesState.noteContentsCacheRevision ?? 0) + 1,
    isNewlyCreated: false,
    newlyCreatedFolderPath: null,
    assetList: [],
    isLoadingAssets: false,
    assetLoadError: null,
    uploadProgress: null,
  });
  void flushStalePendingTrashForNotesRoot(notesPath).catch(() => undefined);
}
