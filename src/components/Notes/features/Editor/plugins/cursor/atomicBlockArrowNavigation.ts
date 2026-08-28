import { NodeSelection, Selection, TextSelection, type EditorState, type Transaction } from '@milkdown/kit/prose/state';
import type { EditorView } from '@milkdown/kit/prose/view';
import {
  isEditableBlankLinePlaceholderNode,
  replaceBlankLinePlaceholderWithEditableParagraph,
} from './markdownBlankLineInteraction';
import {
  type Direction,
  type TopLevelBlock,
  atomicBlockKeyboardNavigationPluginKey,
  findTopLevelBlockAfter,
  findTopLevelBlockAt,
  findTopLevelBlockBefore,
  getAdjacentTopLevelBlock,
  getTrackedEmptyGap,
  isNavigableAtomicBlock,
  isSelectionInsideBlock,
  setTransientInputParagraphSelection,
  type TransientGapAction,
} from './atomicBlockKeyboardShared';
import { resolveTextSelectionInsideContainerBlock } from './atomicBlockTextSelection';
import { handleTextContainerSiblingArrow } from './atomicBlockTextContainerNavigation';

function getPlainVerticalDirection(event: KeyboardEvent): Direction | null {
  if (event.shiftKey || event.metaKey || event.ctrlKey || event.altKey || event.isComposing) {
    return null;
  }

  if (event.key === 'ArrowUp') return 'up';
  if (event.key === 'ArrowDown') return 'down';
  return null;
}

function setTextSelectionIntoTextblock(
  tr: Transaction,
  block: TopLevelBlock,
  direction: Direction
): Transaction | null {
  if (!block.node.isTextblock) {
    return null;
  }

  const cursorPos = block.node.type.name === 'hr'
    ? block.from + 1 + block.node.content.size
    : direction === 'up'
      ? block.from + 1 + block.node.content.size
      : block.from + 1;
  return tr.setSelection(TextSelection.create(tr.doc, cursorPos));
}

function setSelectionPastAtomicBlock(
  state: EditorState,
  tr: Transaction,
  block: TopLevelBlock,
  direction: Direction
): Transaction | null {
  if (!isNavigableAtomicBlock(block.node)) {
    return null;
  }

  const adjacent = getAdjacentTopLevelBlock(tr.doc, block, direction);
  if (!adjacent) {
    const insertPos = direction === 'up' ? block.from : block.to;
    return setTransientInputParagraphSelection(state, tr, insertPos);
  }

  const textSelectionTr = setTextSelectionIntoTextblock(tr, adjacent, direction);
  if (textSelectionTr) {
    return textSelectionTr;
  }

  if (isNavigableAtomicBlock(adjacent.node)) {
    const insertPos = direction === 'up' ? block.from : block.to;
    return setTransientInputParagraphSelection(state, tr, insertPos);
  }

  const searchPos = direction === 'up' ? block.from : block.to;
  const selection = Selection.findFrom(
    tr.doc.resolve(Math.max(0, Math.min(searchPos, tr.doc.content.size))),
    direction === 'up' ? -1 : 1,
    true
  );
  if (selection && !(selection instanceof NodeSelection && isNavigableAtomicBlock(selection.node))) {
    return tr.setSelection(selection);
  }

  const insertPos = direction === 'up' ? block.from : block.to;
  return setTransientInputParagraphSelection(state, tr, insertPos);
}

function moveSelectionPastAtomicBlock(view: EditorView, block: TopLevelBlock, direction: Direction): boolean {
  const adjacent = getAdjacentTopLevelBlock(view.state.doc, block, direction);
  if (adjacent && isEditableBlankLinePlaceholderNode(adjacent.node)) {
    return replaceBlankLinePlaceholderWithEditableParagraph(view, adjacent);
  }

  const tr = setSelectionPastAtomicBlock(view.state, view.state.tr, block, direction);
  if (!tr) {
    return false;
  }

  view.dispatch(tr.scrollIntoView());
  view.focus();
  return true;
}

function handleTrackedGapArrow(view: EditorView, direction: Direction): boolean {
  const gap = getTrackedEmptyGap(view.state);
  if (!gap || !isSelectionInsideBlock(view.state.selection, gap)) {
    return false;
  }

  const adjacent = getAdjacentTopLevelBlock(view.state.doc, gap, direction);
  if (!adjacent || !isNavigableAtomicBlock(adjacent.node)) {
    return false;
  }

  const tr = view.state.tr
    .delete(gap.from, gap.to)
    .setMeta(atomicBlockKeyboardNavigationPluginKey, { type: 'clear' } satisfies TransientGapAction);
  const mappedAdjacentFrom = tr.mapping.map(adjacent.from, -1);
  const mappedAdjacent = findTopLevelBlockAt(tr.doc, mappedAdjacentFrom);
  if (!mappedAdjacent || !isNavigableAtomicBlock(mappedAdjacent.node)) {
    return false;
  }

  const movedTr = setSelectionPastAtomicBlock(view.state, tr, mappedAdjacent, direction);
  if (!movedTr) {
    return false;
  }

  view.dispatch(movedTr.scrollIntoView());
  view.focus();
  return true;
}

function handleTextblockBoundaryArrow(view: EditorView, direction: Direction): boolean {
  const { selection } = view.state;
  if (!(selection instanceof TextSelection) || !selection.empty) {
    return false;
  }

  const $from = selection.$from;
  if ($from.depth !== 1 || !$from.parent.isTextblock) {
    return false;
  }

  const blockFrom = $from.before(1);
  const blockTo = blockFrom + $from.parent.nodeSize;
  const contentStart = blockFrom + 1;
  const contentEnd = contentStart + $from.parent.content.size;
  const atBoundary = direction === 'up'
    ? selection.from === contentStart || view.endOfTextblock?.('up')
    : selection.from === contentEnd || view.endOfTextblock?.('down');
  if (!atBoundary) {
    return false;
  }

  const adjacent = direction === 'up'
    ? findTopLevelBlockBefore(view.state.doc, blockFrom)
    : findTopLevelBlockAfter(view.state.doc, blockTo);
  if (!adjacent) {
    return false;
  }

  if (isEditableBlankLinePlaceholderNode(adjacent.node)) {
    return replaceBlankLinePlaceholderWithEditableParagraph(view, adjacent);
  }

  const containerSelection = resolveTextSelectionInsideContainerBlock(view.state, adjacent, direction);
  if (containerSelection) {
    view.dispatch(
      view.state.tr
        .setSelection(containerSelection)
        .scrollIntoView()
    );
    view.focus();
    return true;
  }

  if (adjacent.node.type.name === 'hr') {
    const textSelectionTr = setTextSelectionIntoTextblock(view.state.tr, adjacent, direction);
    if (!textSelectionTr) return false;
    view.dispatch(textSelectionTr.scrollIntoView());
    view.focus();
    return true;
  }

  if (!isNavigableAtomicBlock(adjacent.node)) {
    return false;
  }

  return moveSelectionPastAtomicBlock(view, adjacent, direction);
}

function handleAtomicBlockSelectionArrow(view: EditorView, direction: Direction): boolean {
  const { selection } = view.state;
  if (!(selection instanceof NodeSelection) || !isNavigableAtomicBlock(selection.node)) {
    return false;
  }

  const current = findTopLevelBlockAt(view.state.doc, selection.from);
  if (!current || current.from !== selection.from) {
    return false;
  }

  return moveSelectionPastAtomicBlock(view, current, direction);
}

export function handleAtomicBlockKeyboardNavigation(
  view: EditorView,
  event: KeyboardEvent
): boolean {
  const direction = getPlainVerticalDirection(event);
  if (!direction) {
    return false;
  }

  const handled =
    handleTrackedGapArrow(view, direction)
    || handleAtomicBlockSelectionArrow(view, direction)
    || handleTextContainerSiblingArrow(view, direction)
    || handleTextblockBoundaryArrow(view, direction);

  if (handled) {
    event.preventDefault();
  }

  return handled;
}
