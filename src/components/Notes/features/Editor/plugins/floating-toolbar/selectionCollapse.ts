import { Selection, TextSelection } from '@milkdown/kit/prose/state';
import type { EditorView } from '@milkdown/kit/prose/view';

function getTextBlockEnd(
  $pos: EditorView['state']['selection']['$from'] | null | undefined,
): number | null {
  if (!$pos || typeof $pos.node !== 'function' || typeof $pos.end !== 'function') {
    return null;
  }

  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    const node = $pos.node(depth);
    if (node?.isTextblock) {
      return $pos.end(depth);
    }
  }

  return null;
}

function getTextBlockEndAtPos(view: EditorView, pos: number): number | null {
  try {
    const maxPos = view.state.doc.content.size;
    const $pos = view.state.doc.resolve(Math.max(0, Math.min(pos, maxPos)));
    return getTextBlockEnd($pos);
  } catch {
    return null;
  }
}

export function collapseSelectionAfterToolbarApply(
  view: EditorView,
  toolbarSelectionRange: { from: number; to: number } | null = null,
): void {
  const { selection } = view.state;
  const savedTextRange = toolbarSelectionRange
    && toolbarSelectionRange.from < toolbarSelectionRange.to
    ? toolbarSelectionRange
    : null;
  const savedTextBlockEnd = savedTextRange
    ? getTextBlockEndAtPos(
        view,
        Math.max(savedTextRange.from, savedTextRange.to - 1),
      )
    : null;
  const collapsePos = savedTextRange
    ? savedTextBlockEnd ?? (selection.empty ? getTextBlockEnd(selection.$from) : selection.to)
    : selection.empty ? null : selection.to;

  if (collapsePos === null) {
    view.focus();
    return;
  }

  const tr = view.state.tr;
  const clampedPos = Math.max(0, Math.min(collapsePos, tr.doc.content.size));
  const $pos = tr.doc.resolve(clampedPos);

  if ($pos.parent.inlineContent) {
    tr.setSelection(TextSelection.create(tr.doc, clampedPos));
  } else {
    tr.setSelection(Selection.near($pos, -1));
  }

  view.dispatch(tr.setMeta('addToHistory', false));
  view.focus();
}
