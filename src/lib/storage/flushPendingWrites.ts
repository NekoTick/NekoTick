import { flushWhiteboardStorage } from '@/components/Whiteboard/storage';
import { flushCurrentTitleCommit } from '@/components/Notes/features/Editor/utils/titleCommitRegistry';
import { flushPendingSessionJsonSaves } from '@/lib/storage/chatStorage';
import { flushPendingSave } from '@/lib/storage/unifiedStorage';
import { getAutoSaveableDraftPaths, saveAutoSaveableDrafts } from '@/stores/notes/autoSaveableDrafts';
import { isDraftNotePath } from '@/stores/notes/draftNote';
import { saveDirtyRegularOpenTabs } from '@/stores/notes/dirtyOpenTabs';
import { flushCurrentPendingEditorMarkdown } from '@/stores/notes/pendingEditorMarkdownFlusher';
import { flushStarredRegistry } from '@/stores/notes/starred';
import { saveWorkspaceSnapshot } from '@/stores/notes/workspacePersistence';
import { useNotesStore } from '@/stores/useNotesStore';

function hasDirtyRegularNotes(): boolean {
  const notesState = useNotesStore.getState();
  return notesState.openTabs.some((tab) => tab.isDirty && !isDraftNotePath(tab.path))
    || Boolean(notesState.isDirty && !isDraftNotePath(notesState.currentNote?.path));
}

async function flushNotes(): Promise<void> {
  if (getAutoSaveableDraftPaths().length > 0 && !(await saveAutoSaveableDrafts())) {
    throw new Error('Auto-saveable drafts still pending after save attempt');
  }

  if (!hasDirtyRegularNotes()) return;
  if (!(await saveDirtyRegularOpenTabs()) || hasDirtyRegularNotes()) {
    throw new Error('Notes still dirty after save attempt');
  }
}

async function runFlushPendingWrites(): Promise<boolean> {
  await flushCurrentTitleCommit();
  flushCurrentPendingEditorMarkdown();

  const hadNotesWork = getAutoSaveableDraftPaths().length > 0 || hasDirtyRegularNotes();
  const tasks: Promise<unknown>[] = [
    flushPendingSave(),
    flushPendingSessionJsonSaves(),
    flushStarredRegistry(),
    flushWhiteboardStorage(),
  ];
  if (hadNotesWork) tasks.push(flushNotes());

  const results = await Promise.allSettled(tasks);
  let failed = results.some((result) => result.status === 'rejected');
  if (!failed && !hasDirtyRegularNotes()) {
    const notesState = useNotesStore.getState();
    if (notesState.notesPath) {
      await saveWorkspaceSnapshot(notesState.notesPath, {
        rootFolder: notesState.rootFolder,
        currentNotePath: notesState.currentNote?.path ?? null,
        fileTreeSortMode: notesState.fileTreeSortMode,
      }).catch(() => {
        failed = true;
      });
    }
  }

  return !failed && !hasDirtyRegularNotes();
}

export function flushPendingWrites(): Promise<boolean> {
  return runFlushPendingWrites();
}
