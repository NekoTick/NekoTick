import { saveDirtyRegularOpenTabs } from '@/stores/notes/dirtyOpenTabs';
import { flushCurrentEditorSave } from '../Editor/utils/editorSaveRegistry';
import { flushCurrentTitleCommit } from '../Editor/utils/titleCommitRegistry';

export async function saveOpenNotesBeforeGit(): Promise<boolean> {
  await flushCurrentTitleCommit();
  await flushCurrentEditorSave();
  return saveDirtyRegularOpenTabs();
}
