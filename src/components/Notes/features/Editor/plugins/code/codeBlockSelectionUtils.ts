import { Selection, type EditorState, type Transaction } from '@milkdown/kit/prose/state';

export function isCursorAtCodeBlockEnd(selection: EditorState['selection']): boolean {
  if (!selection.empty) return false;
  if (selection.$from.parent.type.name !== 'code_block') return false;
  return selection.$from.parentOffset === selection.$from.parent.content.size;
}

export function isSelectionFullyInsideNode(
  selection: { from: number; to: number },
  nodePos: number,
  nodeSize: number,
): boolean {
  const nodeStart = nodePos + 1;
  const nodeEnd = nodePos + nodeSize - 1;
  return selection.from >= nodeStart && selection.to <= nodeEnd;
}

export function moveSelectionAfterNode(
  tr: Transaction,
  nodePos: number,
  nodeSize: number,
): Transaction {
  const afterPos = nodePos + nodeSize;
  const paragraphType = tr.doc.type.schema.nodes.paragraph;

  if (afterPos < tr.doc.content.size) {
    return tr.setSelection(Selection.near(tr.doc.resolve(afterPos), 1));
  }

  if (paragraphType) {
    tr.insert(afterPos, paragraphType.create());
    return tr.setSelection(Selection.near(tr.doc.resolve(afterPos + 1), 1));
  }

  return tr.setSelection(Selection.near(tr.doc.resolve(Math.max(0, nodePos)), -1));
}

export function isClickInBottomBlankSpace(root: HTMLElement, clientY: number): boolean {
  let lastRenderedBlock = root.lastElementChild as HTMLElement | null;
  while (lastRenderedBlock?.matches('.heading-collapsed-content, .editor-collapsed-content')) {
    lastRenderedBlock = lastRenderedBlock.previousElementSibling as HTMLElement | null;
  }
  if (!lastRenderedBlock) return false;
  const lastRect = lastRenderedBlock.getBoundingClientRect();
  return clientY > lastRect.bottom;
}
