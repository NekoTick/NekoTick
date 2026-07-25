import { AssetEntry, UploadResult } from '@/lib/assets/types';
import type { PendingSystemTrashItem } from './utils/fs/trashOperations';

export interface NoteFile {
  id: string;
  name: string;
  path: string;
  isFolder: false;
  kind?: 'note';
}

export interface ImageFile {
  id: string;
  name: string;
  path: string;
  isFolder: false;
  kind: 'image';
}

export interface FolderNode {
  id: string;
  name: string;
  path: string;
  isFolder: true;
  children: FileTreeNode[];
  expanded: boolean;
  isGitRepository?: boolean;
}

export type FileTreeNode = NoteFile | ImageFile | FolderNode;
export type FileTreeSortMode = 'name-asc' | 'name-desc' | 'updated-desc' | 'created-desc';

export interface NoteCoverMetadata {
  assetPath: string;
  positionX?: number;
  positionY?: number;
  height?: number;
  scale?: number;
}

export interface NoteMetadataEntry {
  icon?: string;
  iconSize?: number;
  cover?: NoteCoverMetadata;
  createdAt?: number;
  updatedAt?: number;
}

export interface MetadataFile {
  version: number;
  notes: Record<string, NoteMetadataEntry>;
}

export type StarredKind = 'note' | 'folder';

export interface StarredEntry {
  id: string;
  kind: StarredKind;
  notesRootPath: string;
  relativePath: string;
  addedAt: number;
}

export interface PendingStarredNavigation {
  notesRootPath: string;
  kind: StarredKind;
  relativePath: string;
  openInNewTab?: boolean;
  skipWorkspaceRestore?: boolean;
}

export interface CurrentNoteState {
  path: string;
  content: string;
}

export interface NoteTabState {
  path: string;
  name: string;
  isDirty: boolean;
}

export interface RecentlyClosedTabState {
  tab: NoteTabState;
  index: number;
  draftNote?: DraftNoteEntry;
  content?: string;
  modifiedAt?: number | null;
}

export interface OpenNoteOptions {
  updateNavigationHistory?: boolean;
  restoredFromWorkspace?: boolean;
}

export interface DraftNoteEntry {
  parentPath: string | null;
  name: string;
  originNotesPath?: string;
  kind?: 'scratch' | 'notesRoot';
}

export interface PendingDeletedItemState extends PendingSystemTrashItem {
  previousCurrentNote: CurrentNoteState | null;
  previousIsDirty: boolean;
  deletedStarredEntries: StarredEntry[];
  deletedMetadata: MetadataFile | null;
}

export interface NoteContentCacheEntry {
  content: string;
  modifiedAt: number | null;
  size?: number | null;
  savedContent?: string;
  freshUntil?: number;
}

export interface ScanAllNotesOptions {
  background?: boolean;
  rejectOnCancel?: boolean;
  signal?: AbortSignal;
  priorityPaths?: readonly string[];
  onPriorityPathsScanned?: () => void;
}

export interface NotesState {
  rootFolder: FolderNode | null;
  rootFolderPath: string | null;
  currentNote: CurrentNoteState | null;
  currentNoteRevision: number;
  currentNoteDiskRevision: number;
  workspaceRestoredNote: { path: string; revision: number } | null;
  notesPath: string;
  isDirty: boolean;
  isLoading: boolean;
  error: string | null;
  saveError: string | null;
  saveErrorPath: string | null;
  recentNotes: string[];
  openTabs: NoteTabState[];
  recentlyClosedTabs: RecentlyClosedTabState[];
  noteNavigationHistory: string[];
  noteNavigationHistoryIndex: number;
  noteContentsCache: Map<string, NoteContentCacheEntry>;
  noteContentsCacheRevision: number;
  draftNotes: Record<string, DraftNoteEntry>;
  starredEntries: StarredEntry[];
  starredNotes: string[];
  starredFolders: string[];
  starredLoaded: boolean;
  pendingStarredNavigation: PendingStarredNavigation | null;
  noteMetadata: MetadataFile | null;
  noteIconSize: number;
  displayNames: Map<string, string>;
  isNewlyCreated: boolean;
  pendingDraftDiscardPath: string | null;
  pendingDeletedItems: PendingDeletedItemState[];
  newlyCreatedFolderPath: string | null;
  assetList: AssetEntry[];
  isLoadingAssets: boolean;
  uploadProgress: number | null;
  fileTreeSortMode: FileTreeSortMode;
}

export interface NotesActions {
  loadFileTree: (skipRestore?: boolean) => Promise<void>;
  toggleFolder: (path: string) => void;
  openNote: (path: string, openInNewTab?: boolean, options?: OpenNoteOptions) => Promise<void>;
  openNoteByAbsolutePath: (absolutePath: string, openInNewTab?: boolean, options?: OpenNoteOptions) => Promise<void>;
  prefetchNote: (path: string) => Promise<void>;
  cancelPrefetchNote: (path: string) => void;
  adoptAbsoluteNoteIntoNotesRoot: (absolutePath: string, nextPath: string) => boolean;
  saveNote: (options?: {
    explicit?: boolean;
    suppressOpenTarget?: boolean;
    throwOnError?: boolean;
  }) => Promise<void>;
  syncCurrentNoteFromDisk: (options?: { force?: boolean; expectedExternalChange?: boolean }) => Promise<'ignored' | 'unchanged' | 'reloaded' | 'conflict' | 'deleted' | 'deleted-conflict'>;
  invalidateNoteCache: (path: string, options?: { includeDescendants?: boolean }) => void;
  applyExternalPathRename: (oldPath: string, newPath: string) => Promise<void>;
  applyExternalPathDeletion: (path: string, options?: { preserveCleanCurrentNote?: boolean }) => Promise<void>;
  createNote: (folderPath?: string, options?: { asDraft?: boolean }) => Promise<string>;
  createNoteWithContent: (folderPath: string | undefined, name: string, content: string) => Promise<string>;
  duplicateNote: (path: string) => Promise<string>;
  deleteNote: (path: string) => Promise<void>;
  deleteImage: (path: string) => Promise<void>;
  renameImage: (path: string, newName: string) => Promise<string | null>;
  restoreLastDeletedItem: () => Promise<string | null>;
  renameNote: (path: string, newName: string) => Promise<void>;
  renameAbsoluteNote: (path: string, newName: string) => Promise<void>;
  renameFolder: (path: string, newName: string) => Promise<void>;
  createFolder: (parentPath: string, name?: string) => Promise<string | null>;
  clearNewlyCreatedFolder: () => void;
  deleteFolder: (path: string) => Promise<void>;
  moveItem: (sourcePath: string, targetFolderPath: string) => Promise<void>;
  updateContent: (content: string) => void;
  updateDraftNoteName: (path: string, name: string) => void;
  discardDraftNote: (path: string, options?: { preserveHistory?: boolean; activateFallback?: boolean }) => void;
  cancelPendingDraftDiscard: () => void;
  confirmPendingDraftDiscard: () => Promise<void>;
  closeNote: () => Promise<void>;
  closeTab: (path: string) => Promise<void>;
  reopenClosedTab: () => Promise<void>;
  navigateBackInNoteHistory: () => Promise<void>;
  navigateForwardInNoteHistory: () => Promise<void>;
  switchTab: (path: string) => void;
  reorderTabs: (fromIndex: number, toIndex: number) => void;
  scanAllNotes: (options?: ScanAllNotesOptions) => Promise<void>;
  cancelNoteContentScan: () => void;
  pruneNoteContentsCacheToOpenNotes: () => void;
  getBacklinks: (notePath: string) => { path: string; name: string; context: string }[];
  getAllTags: () => { tag: string; count: number }[];
  loadStarred: (notesRootPath: string) => Promise<void>;
  loadMetadata: (notesRootPath: string) => Promise<void>;
  toggleStarred: (path: string) => void;
  toggleFolderStarred: (path: string) => void;
  removeStarredEntry: (id: string) => void;
  isStarred: (path: string) => boolean;
  isFolderStarred: (path: string) => boolean;
  setPendingStarredNavigation: (navigation: PendingStarredNavigation | null) => void;
  getNoteIcon: (path: string) => string | undefined;
  getNoteIconSize: (path: string) => number | undefined;
  setNoteIcon: (path: string, emoji: string | null) => void;
  setGlobalIconSize: (size: number) => void;
  setNoteIconSize: (path: string, size: number) => void;
  updateAllIconColors: (newColor: string) => void;
  updateAllEmojiSkinTones: (newTone: number) => Promise<void>;
  syncDisplayName: (path: string, title: string) => void;
  getDisplayName: (path: string) => string;
  revealFolder: (path: string) => void;
  getNoteCover: (path: string) => NoteCoverMetadata | undefined;
  setNoteCover: (path: string, cover: NoteCoverMetadata | null) => void;
  loadAssets: (notesRootPath: string) => Promise<void>;
  uploadAsset: (file: File, currentNotePath?: string) => Promise<UploadResult>;
  deleteAsset: (filename: string) => Promise<void>;
  cleanupAssetTempFiles: () => Promise<void>;
  getAssetList: () => AssetEntry[];
  clearAssetUrlCache: () => void;
  setFileTreeSortMode: (mode: FileTreeSortMode) => Promise<void>;
}

export type NotesStore = NotesState & NotesActions;
