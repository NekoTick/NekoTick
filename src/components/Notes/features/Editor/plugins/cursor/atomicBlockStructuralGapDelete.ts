import type { Node as ProseNode } from '@milkdown/kit/prose/model';
import { Selection, TextSelection, type Transaction } from '@milkdown/kit/prose/state';
import type { EditorView } from '@milkdown/kit/prose/view';
import type { AdjacentEmptyParagraphDeleteRange } from '../shared/emptyParagraphNearBlockDeletion';
import {
  EDITABLE_MARKDOWN_BLANK_LINE_PLACEHOLDER,
  isMarkdownBlankLinePlaceholderNode,
} from './markdownBlankLineInteraction';
import {
  findTopLevelBlockAfter,
  findTopLevelBlockAt,
  findTopLevelBlockBefore,
  isListContainerNode,
  isNavigableAtomicBlock,
  setTransientInputParagraphSelection,
} from './atomicBlockKeyboardShared';
import { dispatchDefaultStructuralGapDelete } from './atomicBlockDeleteFallback';

function findTextSelectionFromBoundary(
  doc: ProseNode,
  pos: number,
  direction: -1 | 1
): TextSelection | null {
  let searchPos = Math.max(0, Math.min(pos, doc.content.size));
  while (true) {
    const selection = Selection.findFrom(doc.resolve(searchPos), direction, true);
    if (!(selection instanceof TextSelection)) return null;

    const selectedBlock = findTopLevelBlockAt(doc, selection.from);
    if (selectedBlock?.node.type.name === 'hr') {
      const boundary = direction > 0 ? selectedBlock.to : selectedBlock.from;
      if (boundary === searchPos) return null;
      searchPos = boundary;
      continue;
    }
    if (isNavigableAtomicBlock(selectedBlock?.node)) return null;
    return selection;
  }
}

function createSafeSelectionAfterStructuralGapDelete(
  state: EditorView['state'],
  tr: Transaction,
  range: AdjacentEmptyParagraphDeleteRange,
  mappedBlockFrom: number,
  block: ProseNode
): Transaction | null {
  const blockTo = mappedBlockFrom + block.nodeSize;
  const boundaryPos = range.searchDir < 0 ? blockTo : mappedBlockFrom;
  const intoBlockDir = range.searchDir < 0 ? -1 : 1;
  const awayFromBlockDir = range.searchDir < 0 ? 1 : -1;
  const awayTextSelection = findTextSelectionFromBoundary(
    tr.doc,
    boundaryPos,
    awayFromBlockDir,
  );
  const followingList = awayTextSelection
    ? findTopLevelBlockAt(tr.doc, awayTextSelection.from)
    : null;

  const textSelection = (
    isNavigableAtomicBlock(block) || block.type.name === 'hr'
      ? null
      : findTextSelectionFromBoundary(tr.doc, boundaryPos, intoBlockDir)
  )
    ?? (
      block.type.name === 'hr'
      && range.searchDir < 0
      && isListContainerNode(followingList?.node)
      && awayTextSelection
        ? TextSelection.create(tr.doc, awayTextSelection.$from.end())
        : awayTextSelection
    );
  if (textSelection) {
    return tr.setSelection(textSelection);
  }

  return setTransientInputParagraphSelection(state, tr, boundaryPos);
}

function createSafeSelectionAfterHeadingGapDelete(
  state: EditorView['state'],
  tr: Transaction,
  range: AdjacentEmptyParagraphDeleteRange,
  mappedHeadingFrom: number,
  heading: ProseNode
): Transaction | null {
  const headingTo = mappedHeadingFrom + heading.nodeSize;
  const adjacentAwayFromHeading = range.searchDir < 0
    ? findTopLevelBlockAfter(tr.doc, headingTo)
    : findTopLevelBlockBefore(tr.doc, mappedHeadingFrom);

  if (adjacentAwayFromHeading?.node.type.name === 'paragraph') {
    if (range.searchDir < 0) {
      return tr.setSelection(TextSelection.create(tr.doc, headingTo - 1));
    }

    return tr.setSelection(TextSelection.create(
      tr.doc,
      adjacentAwayFromHeading.from + 1 + adjacentAwayFromHeading.node.content.size,
    ));
  }

  if (range.searchDir < 0 && !adjacentAwayFromHeading) {
    return tr.setSelection(TextSelection.create(tr.doc, headingTo - 1));
  }

  const insertPos = range.searchDir < 0 ? headingTo : mappedHeadingFrom;
  return setTransientInputParagraphSelection(state, tr, insertPos);
}

function replaceBlankLinePlaceholderWithParagraph(
  view: EditorView,
  tr: Transaction,
  from: number,
  to: number,
): Transaction | null {
  const paragraphType = view.state.schema.nodes.paragraph;
  if (!paragraphType) return null;
  const paragraph = paragraphType.create(
    null,
    view.state.schema.text(EDITABLE_MARKDOWN_BLANK_LINE_PLACEHOLDER)
  );
  return tr
    .replaceWith(from, to, paragraph)
    .setSelection(TextSelection.create(tr.doc, from + 1 + EDITABLE_MARKDOWN_BLANK_LINE_PLACEHOLDER.length));
}

function mergeAdjacentOrderedListsAcrossDeletedGap(
  tr: Transaction,
  gapFrom: number
): { tr: Transaction; secondListStart: number } | null {
  const previous = findTopLevelBlockBefore(tr.doc, gapFrom);
  const next = findTopLevelBlockAfter(tr.doc, gapFrom);
  if (!previous || !next || previous.node.type.name !== 'ordered_list' || next.node.type.name !== 'ordered_list') {
    return null;
  }

  const secondListStart = previous.from + 1 + previous.node.content.size;
  const children: ProseNode[] = [];
  previous.node.forEach((child) => {
    children.push(child);
  });
  next.node.forEach((child) => {
    children.push(child);
  });
  const mergedList = previous.node.type.create(
    previous.node.attrs,
    children,
    previous.node.marks
  );

  return {
    tr: tr.replaceWith(previous.from, next.to, mergedList),
    secondListStart,
  };
}

function dispatchMergedOrderedListDelete(
  view: EditorView,
  tr: Transaction,
  secondListStart: number,
): void {
  const boundary = Math.max(0, Math.min(secondListStart, tr.doc.content.size));
  const cursorPos = Selection.findFrom(tr.doc.resolve(boundary), -1, true)?.$from.end();
  view.dispatch((cursorPos === undefined
    ? tr
    : tr.setSelection(TextSelection.create(tr.doc, cursorPos))).scrollIntoView());
  view.focus();
}

export function dispatchDeleteEmptyParagraphNearStructuralBlock(
  view: EditorView,
  range: AdjacentEmptyParagraphDeleteRange,
  deleteDirection: -1 | 1
) {
  let tr = view.state.tr.delete(range.from, range.to);
  const mergedOrderedList = mergeAdjacentOrderedListsAcrossDeletedGap(tr, range.from);
  if (mergedOrderedList) {
    dispatchMergedOrderedListDelete(
      view,
      mergedOrderedList.tr,
      mergedOrderedList.secondListStart,
    );
    return;
  }

  const mappedBlockFrom = tr.mapping.map(range.blockFrom, -1);
  const nextNode = tr.doc.nodeAt(mappedBlockFrom);

  if (nextNode && isMarkdownBlankLinePlaceholderNode(nextNode)) {
    const blankLineTr = replaceBlankLinePlaceholderWithParagraph(view, tr, mappedBlockFrom, mappedBlockFrom + nextNode.nodeSize);
    if (blankLineTr) {
      view.dispatch(blankLineTr.scrollIntoView());
      view.focus();
      return;
    }
  }

  if (nextNode?.type.name === 'heading') {
    const safeSelectionTr = createSafeSelectionAfterHeadingGapDelete(view.state, tr, range, mappedBlockFrom, nextNode);
    if (safeSelectionTr) {
      view.dispatch(safeSelectionTr.scrollIntoView());
      view.focus();
      return;
    }
  }

  if (nextNode?.type.name === 'hr') {
    const safeSelectionTr = createSafeSelectionAfterStructuralGapDelete(
      view.state,
      tr,
      range,
      mappedBlockFrom,
      nextNode,
    );
    if (safeSelectionTr) {
      view.dispatch(safeSelectionTr.scrollIntoView());
      view.focus();
      return;
    }
  }

  if (range.blockName === 'code_block' && nextNode?.type.name === 'code_block') {
    dispatchCodeBlockGapDelete(view, tr, range, mappedBlockFrom, nextNode);
    return;
  }

  if (isListContainerNode(nextNode)) {
    dispatchListContainerGapDelete(view, tr, range, mappedBlockFrom, nextNode, deleteDirection);
    return;
  }

  dispatchDefaultStructuralGapDelete(view, tr, range, mappedBlockFrom, nextNode);
}

function dispatchCodeBlockGapDelete(
  view: EditorView,
  tr: Transaction,
  range: AdjacentEmptyParagraphDeleteRange,
  mappedBlockFrom: number,
  nextNode: ProseNode
): void {
  const blockTo = mappedBlockFrom + nextNode.nodeSize;
  const siblingBeforeCode = findTopLevelBlockBefore(tr.doc, mappedBlockFrom)?.node;
  const siblingAfterCode = tr.doc.nodeAt(blockTo);
  const adjacentSelection = range.searchDir < 0
    ? Selection.findFrom(tr.doc.resolve(blockTo), 1, true)
    : Selection.findFrom(tr.doc.resolve(mappedBlockFrom), -1, true);

  if (adjacentSelection) {
    view.dispatch(tr.setSelection(adjacentSelection).scrollIntoView());
    view.focus();
    return;
  }

  if (siblingBeforeCode || siblingAfterCode) {
    const safeSelectionTr = createSafeSelectionAfterStructuralGapDelete(view.state, tr, range, mappedBlockFrom, nextNode);
    if (safeSelectionTr) {
      view.dispatch(safeSelectionTr.scrollIntoView());
      view.focus();
      return;
    }
  }

  const paragraphType = tr.doc.type.schema.nodes.paragraph;
  if (paragraphType) {
    const insertPos = range.searchDir < 0 ? blockTo : mappedBlockFrom;
    tr.insert(insertPos, paragraphType.create());
    tr.setSelection(TextSelection.create(tr.doc, insertPos + 1));
  }

  view.dispatch(tr.scrollIntoView());
  view.focus();
}

function dispatchListContainerGapDelete(
  view: EditorView,
  tr: Transaction,
  range: AdjacentEmptyParagraphDeleteRange,
  mappedBlockFrom: number,
  nextNode: ProseNode,
  deleteDirection: -1 | 1
): void {
  const blockTo = mappedBlockFrom + nextNode.nodeSize;
  const preferPreviousTextTarget = deleteDirection < 0 && range.searchDir > 0;
  const preferNextTextTarget = deleteDirection > 0 && range.searchDir < 0;
  const adjacentSelection = range.searchDir < 0
    ? Selection.findFrom(tr.doc.resolve(blockTo), preferNextTextTarget ? 1 : -1, true)
      ?? Selection.findFrom(tr.doc.resolve(blockTo), preferNextTextTarget ? -1 : 1, true)
    : Selection.findFrom(tr.doc.resolve(mappedBlockFrom), preferPreviousTextTarget ? -1 : 1, true)
      ?? Selection.findFrom(tr.doc.resolve(mappedBlockFrom), preferPreviousTextTarget ? 1 : -1, true);

  view.dispatch((adjacentSelection ? tr.setSelection(adjacentSelection) : tr).scrollIntoView());
  view.focus();
}
