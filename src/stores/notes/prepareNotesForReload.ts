import { saveAutoSaveableDrafts } from './autoSaveableDrafts';
import { saveDirtyRegularOpenTabs } from './dirtyOpenTabs';
import { flushNoteRecovery } from './noteRecovery';
import { flushCurrentPendingEditorMarkdown } from './pendingEditorMarkdownFlusher';

export async function prepareNotesForReload(): Promise<boolean> {
  try {
    flushCurrentPendingEditorMarkdown();
    await flushNoteRecovery();

    const savedDrafts = await saveAutoSaveableDrafts();
    const savedRegularTabs = await saveDirtyRegularOpenTabs();
    await flushNoteRecovery();
    return savedDrafts && savedRegularTabs;
  } catch {
    try {
      await flushNoteRecovery();
    } catch {
    }
    return false;
  }
}
