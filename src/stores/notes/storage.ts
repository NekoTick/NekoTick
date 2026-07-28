import { getStorageAdapter, joinPath } from '@/lib/storage/adapter';
import { WORKSPACE_FILE } from './constants';
import type { FileTreeSortMode } from './types';
import { ensureSystemDirectory, getNotesRootSystemStorePath } from './systemStoragePaths';
import { normalizeWorkspaceState } from './persistenceValidation';
import {
  isReadableBoundedFile,
  MAX_WORKSPACE_STATE_BYTES,
  utf8Encoder,
} from './storageMetadataScan';

export {
  addToRecentNotes,
  loadGlobalNoteIconSize,
  loadRecentNotes,
  persistGlobalNoteIconSize,
  persistRecentNotes,
} from './storagePreferences';
export {
  createEmptyMetadataFile,
  getNoteEntry,
  loadNoteMetadata,
  mergeNoteMetadataWithFileInfo,
  remapMetadataEntries,
  setNoteEntry,
  type MetadataFile,
  type NoteMetadataEntry,
} from './storageMetadata';

export async function safeWriteTextFile(path: string, content: string): Promise<void> {
  const storage = getStorageAdapter();

  await storage.writeFile(path, content);
}

let currentNotesRootPath: string | null = null;

export function setCurrentNotesRootPath(path: string | null): void {
  currentNotesRootPath = path;
}

export function getCurrentNotesRootPath(): string | null {
  return currentNotesRootPath;
}

export async function getNotesBasePath(): Promise<string> {
  if (!currentNotesRootPath) {
    throw new Error('No opened folder selected');
  }
  return currentNotesRootPath;
}

export async function ensureNotesFolder(basePath: string): Promise<void> {
  const storage = getStorageAdapter();

  if (!(await storage.exists(basePath))) {
    await storage.mkdir(basePath, true);
  }
}

export interface WorkspaceState {
  currentNotePath: string | null;
  expandedFolders: string[];
  fileTreeSortMode?: FileTreeSortMode;
}

export async function loadWorkspaceState(notesRootPath: string): Promise<WorkspaceState | null> {
  try {
    const storage = getStorageAdapter();
    const wsPath = await getNotesRootSystemStorePath(notesRootPath, WORKSPACE_FILE);

    if (!(await storage.exists(wsPath))) {
      return null;
    }

    const fileInfo = await storage.stat(wsPath).catch(() => null);
    if (!isReadableBoundedFile(fileInfo, MAX_WORKSPACE_STATE_BYTES)) {
      return null;
    }

    const content = await storage.readFile(wsPath, MAX_WORKSPACE_STATE_BYTES);
    if (utf8Encoder.encode(content).length > MAX_WORKSPACE_STATE_BYTES) {
      return null;
    }
    return normalizeWorkspaceState(JSON.parse(content));
  } catch (error) {
    return null;
  }
}

export async function saveWorkspaceState(notesRootPath: string, state: WorkspaceState): Promise<void> {
  const storePath = await getNotesRootSystemStorePath(notesRootPath);
  await ensureSystemDirectory(storePath);

  const wsPath = await joinPath(storePath, WORKSPACE_FILE);
  const normalizedState = normalizeWorkspaceState(state);
  await safeWriteTextFile(wsPath, JSON.stringify(normalizedState, null, 2));
}
