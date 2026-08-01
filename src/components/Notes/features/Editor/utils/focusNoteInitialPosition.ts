import { focusCurrentEmptyUntitledDraftTitle } from './emptyUntitledDraftTitleFocus';
import { focusEditorToInitialPosition } from './focusEditor';

export function focusNoteInitialPosition(root: ParentNode = document): void {
  if (!focusCurrentEmptyUntitledDraftTitle(root)) {
    focusEditorToInitialPosition();
  }
}
