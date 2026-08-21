import { Selection, TextSelection } from '@milkdown/kit/prose/state';
import type { Node as ProseNode } from '@milkdown/kit/prose/model';
import type { EditorView } from '@milkdown/kit/prose/view';
import {
  findAdjacentEmptyParagraphNearBlockDeleteRange,
  type AdjacentEmptyParagraphDeleteRange,
} from '../shared/emptyParagraphNearBlockDeletion';
import { STRUCTURAL_EMPTY_PARAGRAPH_DELETE_BLOCK_NAMES } from '../shared/blockNodeTypes';
import { isMarkdownBlankLinePlaceholderNode } from './markdownBlankLineInteraction';
import {
  findTopLevelBlockAfter,
  findTopLevelBlockBefore,
  isHeadingNodeName,
  isListContainerNodeName,
  isNavigableAtomicBlock,
  setTransientInputParagraphSelection,
} from './atomicBlockKeyboardShared';
import { dispatchDeleteEmptyParagraphNearStructuralBlock } from './atomicBlockStructuralGapDelete';

function getPlainDeleteDirection(event: KeyboardEvent): -1 | 1 | null {
  if (event.shiftKey || event.metaKey || event.ctrlKey || event.altKey || event.isComposing) {
    return null;
  }

  if (event.key === 'Backspace') return -1;
  if (event.key === 'Delete') return 1;
  return null;
}

function isNonEmptyPlainParagraph(node: ProseNode | null | undefined): node is ProseNode {
  if (!node || node.type.name !== 'paragraph' || node.content.size === 0) {
    return false;
  }

  let containsOnlyText = true;
  node.forEach((child) => {
    if (!child.isText) containsOnlyText = false;
  });
  return containsOnlyText;
}

export function handleEmptyParagraphBetweenPlainParagraphsDelete(
  view: EditorView,
  event: KeyboardEvent,
): boolean {
  if (getPlainDeleteDirection(event) === null) return false;

  const { selection, doc } = view.state;
  if (!(selection instanceof TextSelection) || !selection.empty) return false;

  const { $from } = selection;
  if (
    $from.depth !== 1
    || $from.parent.type.name !== 'paragraph'
    || $from.parent.content.size !== 0
  ) {
    return false;
  }

  const blockFrom = $from.before(1);
  const blockTo = $from.after(1);
  const previous = findTopLevelBlockBefore(doc, blockFrom);
  const next = findTopLevelBlockAfter(doc, blockTo);
  if (
    !previous
    || !next
    || !isNonEmptyPlainParagraph(previous.node)
    || !isNonEmptyPlainParagraph(next.node)
  ) {
    return false;
  }

  const tr = view.state.tr.delete(blockFrom, blockTo);
  tr.setSelection(TextSelection.create(
    tr.doc,
    previous.from + 1 + previous.node.content.size,
  ));

  event.preventDefault();
  view.dispatch(tr.scrollIntoView());
  view.focus();
  return true;
}

export function shouldPreserveParagraphAfterCodeBlockOnBackspace(view: EditorView, event: KeyboardEvent): boolean {
  if (event.isComposing || event.key !== 'Backspace') {
    return false;
  }

  const { selection } = view.state;
  if (!(selection instanceof TextSelection) || !selection.empty) {
    return false;
  }

  const { $from } = selection;
  if ($from.depth !== 1 || $from.parent.type.name !== 'paragraph' || $from.parentOffset !== 0) {
    return false;
  }

  const paragraphIndex = $from.index(0);
  if (paragraphIndex <= 0) {
    return false;
  }

  const previousNode = $from.node(0).child(paragraphIndex - 1);
  return previousNode.type.name === 'code_block' && $from.parent.content.size > 0;
}

export function handleEmptyParagraphNearStructuralBlockDelete(
  view: EditorView,
  event: KeyboardEvent
): boolean {
  const primarySearchDir = getPlainDeleteDirection(event);
  if (primarySearchDir === null) {
    return false;
  }

  const primaryRange = findAdjacentEmptyParagraphNearBlockDeleteRange(
    view.state,
    primarySearchDir,
    STRUCTURAL_EMPTY_PARAGRAPH_DELETE_BLOCK_NAMES
  );
  const fallbackSearchDir = primarySearchDir === -1 ? 1 : -1;
  const fallbackRange = primaryRange
    ? null
    : findAdjacentEmptyParagraphNearBlockDeleteRange(
      view.state,
      fallbackSearchDir,
      STRUCTURAL_EMPTY_PARAGRAPH_DELETE_BLOCK_NAMES
    );
  const oppositeRange = primaryRange
    ? findAdjacentEmptyParagraphNearBlockDeleteRange(
      view.state,
      fallbackSearchDir,
      STRUCTURAL_EMPTY_PARAGRAPH_DELETE_BLOCK_NAMES
    )
    : null;
  const range = primaryRange && oppositeRange && isHeadingNodeName(oppositeRange.blockName)
    ? oppositeRange
    : primaryRange && oppositeRange && isListContainerNodeName(primaryRange.blockName) && !isListContainerNodeName(oppositeRange.blockName)
      ? oppositeRange
      : primaryRange ?? fallbackRange;

  if (!range) {
    return false;
  }

  event.preventDefault();
  dispatchDeleteEmptyParagraphNearStructuralBlock(view, range, primarySearchDir);
  return true;
}

export function handleBackspaceAtParagraphStartAfterStructuralGap(
  view: EditorView,
  event: KeyboardEvent
): boolean {
  if (getPlainDeleteDirection(event) !== -1) {
    return false;
  }

  const { selection, doc } = view.state;
  if (!(selection instanceof TextSelection) || !selection.empty) {
    return false;
  }

  const { $from } = selection;
  if ($from.depth !== 1 || !$from.parent.isTextblock || $from.parentOffset !== 0) {
    return false;
  }

  const currentBlockFrom = $from.before(1);
  const gapBlock = findTopLevelBlockBefore(doc, currentBlockFrom);
  if (!gapBlock || !(gapBlock.node.type.name === 'paragraph' && gapBlock.node.content.size === 0) && !isMarkdownBlankLinePlaceholderNode(gapBlock.node)) {
    return false;
  }

  const structuralBlock = findTopLevelBlockBefore(doc, gapBlock.from);
  if (
    !structuralBlock ||
    !STRUCTURAL_EMPTY_PARAGRAPH_DELETE_BLOCK_NAMES.has(structuralBlock.node.type.name)
  ) {
    return false;
  }

  const range: AdjacentEmptyParagraphDeleteRange = {
    from: gapBlock.from,
    to: gapBlock.to,
    searchDir: -1,
    blockFrom: structuralBlock.from,
    blockTo: structuralBlock.to,
    blockName: structuralBlock.node.type.name,
  };

  event.preventDefault();
  dispatchDeleteEmptyParagraphNearStructuralBlock(view, range, -1);
  return true;
}

export function handleDocumentBoundaryAtomicBlockDelete(view: EditorView, event: KeyboardEvent): boolean {
  if (getPlainDeleteDirection(event) === null) {
    return false;
  }

  const { selection, doc } = view.state;
  if (!selection.empty || (selection instanceof TextSelection && selection.$from.parent.isTextblock)) {
    return false;
  }

  const cursorPos = Math.max(0, Math.min(selection.from, doc.content.size));
  const blockAfter = findTopLevelBlockAfter(doc, cursorPos);
  const blockBefore = findTopLevelBlockBefore(doc, cursorPos);
  const insertPos = blockAfter?.from === cursorPos && isNavigableAtomicBlock(blockAfter.node)
    ? blockAfter.from
    : blockBefore?.to === cursorPos && isNavigableAtomicBlock(blockBefore.node)
      ? blockBefore.to
      : null;

  if (insertPos === null) {
    return false;
  }

  const tr = setTransientInputParagraphSelection(view.state, view.state.tr, insertPos);
  if (!tr) {
    return false;
  }

  event.preventDefault();
  view.dispatch(tr.scrollIntoView());
  view.focus();
  return true;
}

export function handleEmptyCodeBlockDelete(view: EditorView, event: KeyboardEvent): boolean {
  const deleteDirection = getPlainDeleteDirection(event);
  if (deleteDirection === null) {
    return false;
  }

  const { selection } = view.state;
  if (!(selection instanceof TextSelection) || !selection.empty) {
    return false;
  }

  const { $from } = selection;
  if ($from.parent.type.name !== 'code_block' || $from.parent.content.size > 0) {
    return false;
  }

  const codeBlockFrom = $from.before($from.depth);
  const codeBlockTo = $from.after($from.depth);
  let tr = view.state.tr.delete(codeBlockFrom, codeBlockTo);
  const safePos = Math.max(0, Math.min(codeBlockFrom, tr.doc.content.size));
  const resolved = tr.doc.resolve(safePos);
  const adjacentSelection = Selection.findFrom(resolved, deleteDirection > 0 ? 1 : -1, true)
    ?? Selection.findFrom(resolved, deleteDirection > 0 ? -1 : 1, true);

  if (adjacentSelection) {
    tr = tr.setSelection(adjacentSelection);
  }

  event.preventDefault();
  view.dispatch(tr.scrollIntoView());
  view.focus();
  return true;
}
