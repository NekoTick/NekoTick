import { TextSelection, type Transaction } from '@milkdown/kit/prose/state';
import type { EditorView } from '@milkdown/kit/prose/view';

function findFirstTextblockEndInFirstBlock(tr: Transaction): number | null {
  const firstBlock = tr.doc.firstChild;
  if (!firstBlock) return null;

  let textblockEnd: number | null = null;
  tr.doc.descendants((node, pos) => {
    if (textblockEnd !== null || pos >= firstBlock.nodeSize) return false;
    if (!node.isTextblock || !node.inlineContent) return true;
    textblockEnd = pos + 1 + node.content.size;
    return false;
  });
  return textblockEnd;
}

export function handleLeadingEmptyParagraphBackspace(
  view: EditorView,
  event: KeyboardEvent,
): boolean {
  if (
    event.key !== 'Backspace'
    || event.shiftKey
    || event.metaKey
    || event.ctrlKey
    || event.altKey
    || event.isComposing
    || view.composing
  ) return false;

  const { $cursor } = view.state.selection;
  if (
    !$cursor
    || $cursor.depth !== 1
    || $cursor.before(1) !== 0
    || $cursor.parentOffset !== 0
    || $cursor.parent.type.name !== 'paragraph'
    || $cursor.parent.content.size !== 0
    || view.state.doc.childCount < 2
  ) return false;

  const tr = view.state.tr.delete(0, $cursor.parent.nodeSize);
  const cursorPos = findFirstTextblockEndInFirstBlock(tr);
  if (cursorPos === null) return false;

  tr.setSelection(TextSelection.create(tr.doc, cursorPos));
  view.dispatch(tr.scrollIntoView());
  event.preventDefault();
  event.stopPropagation();
  return true;
}
