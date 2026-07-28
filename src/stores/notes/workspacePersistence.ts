import { isAbsolutePath } from '@/lib/storage/adapter';
import { collectExpandedPaths } from './fileTreeUtils';
import { normalizeWorkspaceState } from './persistenceValidation';
import { saveWorkspaceState, type WorkspaceState } from './storage';
import type { NotesStore } from './types';
import { translate } from '@/lib/i18n/runtime';
import { useToastStore } from '@/stores/useToastStore';
import { themeUiFeedbackTokens } from '@/styles/themeTokens';

interface WorkspaceSnapshotInput {
  rootFolder: NotesStore['rootFolder'];
  currentNotePath: string | null | undefined;
  fileTreeSortMode: NotesStore['fileTreeSortMode'];
  expandedFolders?: string[];
}

export const WORKSPACE_SNAPSHOT_PERSIST_DELAY_MS = 200;
const pendingWorkspaceSnapshots = new Map<string, {
  input: WorkspaceSnapshotInput;
  timer: ReturnType<typeof setTimeout>;
}>();
const workspaceSaveChains = new Map<string, Promise<void>>();

function reportWorkspacePersistenceError(): void {
  const message = translate('storage.workspaceStateSaveFailed');
  const toastState = useToastStore.getState();
  if (toastState.toasts.some((toast) => toast.type === 'error' && toast.message === message)) {
    return;
  }
  toastState.addToast(message, 'error', themeUiFeedbackTokens.errorToastDurationMs);
}

export function createWorkspaceSnapshot({
  rootFolder,
  currentNotePath,
  fileTreeSortMode,
  expandedFolders,
}: WorkspaceSnapshotInput): WorkspaceState {
  const nextExpandedFolders =
    expandedFolders ?? (rootFolder ? Array.from(collectExpandedPaths(rootFolder.children)) : []);

  return normalizeWorkspaceState({
    currentNotePath:
      currentNotePath && !isAbsolutePath(currentNotePath) ? currentNotePath : null,
    expandedFolders: nextExpandedFolders,
    fileTreeSortMode,
  }) ?? {
    currentNotePath: null,
    expandedFolders: [],
    fileTreeSortMode,
  };
}

export function persistWorkspaceSnapshot(
  notesPath: string,
  input: WorkspaceSnapshotInput
): void {
  if (!notesPath) return;

  const pending = pendingWorkspaceSnapshots.get(notesPath);
  if (pending) clearTimeout(pending.timer);

  const timer = setTimeout(() => {
    const latest = pendingWorkspaceSnapshots.get(notesPath);
    if (!latest || latest.timer !== timer) return;
    pendingWorkspaceSnapshots.delete(notesPath);
    void saveWorkspaceSnapshot(notesPath, latest.input).catch(() => undefined);
  }, WORKSPACE_SNAPSHOT_PERSIST_DELAY_MS);
  pendingWorkspaceSnapshots.set(notesPath, { input, timer });
}

export async function saveWorkspaceSnapshot(
  notesPath: string,
  input: WorkspaceSnapshotInput
): Promise<void> {
  if (!notesPath) {
    return;
  }

  const pending = pendingWorkspaceSnapshots.get(notesPath);
  if (pending) {
    clearTimeout(pending.timer);
    pendingWorkspaceSnapshots.delete(notesPath);
  }

  const snapshot = createWorkspaceSnapshot(input);
  const previousSave = workspaceSaveChains.get(notesPath) ?? Promise.resolve();
  const save = previousSave
    .catch(() => undefined)
    .then(() => saveWorkspaceState(notesPath, snapshot));
  workspaceSaveChains.set(notesPath, save);

  try {
    await save;
  } catch (error) {
    reportWorkspacePersistenceError();
    throw error;
  } finally {
    if (workspaceSaveChains.get(notesPath) === save) {
      workspaceSaveChains.delete(notesPath);
    }
  }
}
