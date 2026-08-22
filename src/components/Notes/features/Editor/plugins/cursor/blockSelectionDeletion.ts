import { Selection, TextSelection, type Transaction } from '@milkdown/kit/prose/state';
import type { ResolvedPos } from '@milkdown/kit/prose/model';
import type { EditorView } from '@milkdown/kit/prose/view';
import { buildDeleteRangesForBlockSelection } from './listBlockUtils';
import { normalizeBlockRanges, type BlockRange } from './blockSelectionUtils';
import {
  EDITABLE_MARKDOWN_BLANK_LINE_PLACEHOLDER,
  isMarkdownBlankLinePlaceholderNode,
} from './markdownBlankLineInteraction';
import { markEditorUserInput } from '../shared/userInputEvents';

function isCursorTextblock(node: { isTextblock: boolean; type: { name: string } } | null | undefined): boolean {
  return Boolean(
    node?.isTextblock
    && node.type.name !== 'code_block'
    && node.type.name !== 'hr'
  );
}

function isInsideTable($pos: ResolvedPos): boolean {
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    const nodeName = $pos.node(depth).type.name;
    if (nodeName === 'table' || nodeName === 'table_row' || nodeName === 'table_cell' || nodeName === 'table_header') {
      return true;
    }
  }
  return false;
}

function findCursorTextSelectionFrom($pos: ResolvedPos, dir: 1 | -1): Selection | null {
  let searchPos = $pos;
  while (true) {
    const selection = Selection.findFrom(searchPos, dir, true);
    if (!(selection instanceof TextSelection)) return null;
    if (isCursorTextblock(selection.$from.parent) && !isInsideTable(selection.$from)) {
      return selection;
    }
    if (selection.$from.depth !== 1 || selection.$from.parent.type.name !== 'hr') {
      return null;
    }

    const boundary = dir > 0 ? selection.$from.after(1) : selection.$from.before(1);
    if (boundary === searchPos.pos || boundary < 0 || boundary > searchPos.doc.content.size) {
      return null;
    }
    searchPos = searchPos.doc.resolve(boundary);
  }
}

function isInSameTopLevelBlock(left: ResolvedPos, right: ResolvedPos): boolean {
  return left.depth > 0 && right.depth > 0 && left.before(1) === right.before(1);
}

function setTextSelectionAtBlockTail(tr: Transaction, selection: TextSelection): Transaction {
  return tr.setSelection(TextSelection.create(tr.doc, selection.$from.end()));
}

function findFollowingMarkdownBlankLineBlock(
  tr: Transaction,
  pos: number,
): Array<{ from: number; to: number }> {
  const blankLines: Array<{ from: number; to: number }> = [];
  let offset = 0;
  for (let index = 0; index < tr.doc.childCount; index += 1) {
    const node = tr.doc.child(index);
    const from = offset;
    const to = from + node.nodeSize;
    offset = to;

    if (to <= pos) continue;
    if (from < pos) continue;
    if (blankLines.length === 0 && node.type.name === 'hr') continue;

    if (isMarkdownBlankLinePlaceholderNode(node)) {
      blankLines.push({ from, to });
      continue;
    }

    return blankLines;
  }
  return blankLines;
}

function setSelectionAtMarkdownBlankLine(tr: Transaction, pos: number): Transaction | null {
  const blankLines = findFollowingMarkdownBlankLineBlock(tr, pos);
  if (blankLines.length === 0) return null;

  const paragraphType = tr.doc.type.schema.nodes.paragraph;
  if (!paragraphType) return null;

  for (let index = blankLines.length - 1; index >= 0; index -= 1) {
    const blankLine = blankLines[index]!;
    const paragraph = paragraphType.create(
      null,
      tr.doc.type.schema.text(EDITABLE_MARKDOWN_BLANK_LINE_PLACEHOLDER),
    );
    tr = tr.replaceWith(blankLine.from, blankLine.to, paragraph);
  }

  const firstBlankLine = blankLines[0]!;
  return tr.setSelection(
    TextSelection.create(tr.doc, firstBlankLine.from + 1 + EDITABLE_MARKDOWN_BLANK_LINE_PLACEHOLDER.length),
  );
}

function setSelectionAfterBlockDeletion(tr: Transaction, targetPos: number): Transaction {
  const docSize = tr.doc.content.size;
  const safePos = Math.max(0, Math.min(targetPos, docSize));
  const $pos = tr.doc.resolve(safePos);
  const paragraphType = tr.doc.type.schema.nodes.paragraph;
  const nodeAfter = $pos.nodeAfter;
  const nodeBefore = $pos.nodeBefore;

  if (isCursorTextblock($pos.parent)) {
    return tr.setSelection(TextSelection.create(tr.doc, safePos));
  }

  if (nodeAfter && isCursorTextblock(nodeAfter)) {
    return tr.setSelection(TextSelection.create(tr.doc, safePos + 1 + nodeAfter.content.size));
  }

  const nextSelection = findCursorTextSelectionFrom($pos, 1);
  if (
    nextSelection instanceof TextSelection
    && isInSameTopLevelBlock($pos, nextSelection.$from)
  ) {
    return setTextSelectionAtBlockTail(tr, nextSelection);
  }

  const markdownBlankLineSelection = setSelectionAtMarkdownBlankLine(tr, safePos);
  if (markdownBlankLineSelection) {
    return markdownBlankLineSelection;
  }

  if (nextSelection instanceof TextSelection) {
    return setTextSelectionAtBlockTail(tr, nextSelection);
  }

  if (isCursorTextblock(nodeBefore)) {
    return tr.setSelection(Selection.near($pos, -1));
  }

  const previousSelection = findCursorTextSelectionFrom($pos, -1);
  if (previousSelection) {
    return setTextSelectionAtBlockTail(tr, previousSelection);
  }

  if (paragraphType) {
    tr = tr.insert(safePos, paragraphType.create());
    return tr.setSelection(TextSelection.create(tr.doc, safePos + 1));
  }

  return tr.setSelection(Selection.near($pos, 1));
}

export function deleteSelectedBlocks(
  view: EditorView,
  blocks: readonly BlockRange[],
  applyClearSelectionMeta: (tr: Transaction) => Transaction,
): boolean {
  const normalized = normalizeBlockRanges(blocks);
  if (normalized.length === 0) return false;

  const deleteRanges = buildDeleteRangesForBlockSelection(view.state, normalized);
  if (deleteRanges.length === 0) return false;

  const anchorHint = deleteRanges[0].from;
  let tr = view.state.tr;
  for (let i = deleteRanges.length - 1; i >= 0; i -= 1) {
    tr = tr.delete(deleteRanges[i].from, deleteRanges[i].to);
  }

  if (tr.doc.content.size === 0) {
    const paragraphType = tr.doc.type.schema.nodes.paragraph;
    if (paragraphType) {
      tr = tr.insert(0, paragraphType.create());
    }
  }

  const targetPos = Math.max(0, Math.min(anchorHint, tr.doc.content.size));
  tr = setSelectionAfterBlockDeletion(tr, targetPos);
  tr = applyClearSelectionMeta(tr);
  markEditorUserInput(view);
  view.dispatch(tr.scrollIntoView());
  view.focus();
  return true;
}
