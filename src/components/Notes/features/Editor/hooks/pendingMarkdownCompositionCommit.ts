import type { EditorView } from '@milkdown/kit/prose/view';

import type { CompositionStartSelection } from './pendingMarkdownAutosaveTypes';
import {
  collapseCommittedCompositionSelection,
  replaceRecentCompositionText,
  replaceSelectedTextWithCommittedComposition,
} from './pendingMarkdownCompositionRepair';
import { replaceCompositionStartSelectionWithCommittedText } from './pendingMarkdownCompositionSelection';

export function finalizeCompositionCommit(
  view: EditorView,
  staleCompositionData: string | null,
  committedCompositionData: string,
  startSelection: CompositionStartSelection | null,
): boolean {
  const repaired = replaceRecentCompositionText(view, staleCompositionData, committedCompositionData);
  const replacedStartSelection = repaired
    ? false
    : replaceCompositionStartSelectionWithCommittedText(view, startSelection, committedCompositionData);
  const replacedSelection = repaired || replacedStartSelection
    ? false
    : replaceSelectedTextWithCommittedComposition(view, committedCompositionData);
  const collapsedSelection = !repaired && !replacedStartSelection && !replacedSelection
    ? collapseCommittedCompositionSelection(view, committedCompositionData)
    : false;
  return repaired || replacedStartSelection || replacedSelection || collapsedSelection;
}

export function scheduleCompositionCommitFinalization(
  view: EditorView,
  staleCompositionData: string | null,
  committedCompositionData: string,
  startSelection: CompositionStartSelection | null,
  isCurrentComposition: () => boolean,
): void {
  let finalized = false;
  const finalize = () => {
    if (finalized || !isCurrentComposition()) {
      return;
    }
    finalized = finalizeCompositionCommit(
      view,
      staleCompositionData,
      committedCompositionData,
      startSelection,
    );
  };

  // The marker runs during document capture, before ProseMirror handles compositionend.
  setTimeout(finalize, 0);
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => {
      requestAnimationFrame(finalize);
    });
  }
  setTimeout(finalize, 80);
}
