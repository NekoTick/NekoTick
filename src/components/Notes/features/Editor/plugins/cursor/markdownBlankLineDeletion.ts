import { NodeSelection, Selection, TextSelection, type EditorState, type Transaction } from '@milkdown/kit/prose/state';
import type { Node as ProseNode } from '@milkdown/kit/prose/model';
import type { EditorView } from '@milkdown/kit/prose/view';
import {
  LIST_CONTAINER_NODE_NAMES,
  STRUCTURAL_EMPTY_PARAGRAPH_DELETE_BLOCK_NAMES,
} from '../shared/blockNodeTypes';
import { blankAreaDragBoxPluginKey, CLEAR_BLOCKS_ACTION } from './blockSelectionPluginState';
import {
  createEditableMarkdownBlankLineParagraphFromState,
  createTextSelectionNearDocumentPosition,
  EDITABLE_MARKDOWN_BLANK_LINE_PLACEHOLDER,
  findTopLevelBlockAfter,
  findTopLevelBlockAt,
  findTopLevelBlockBefore,
  isEditableMarkdownBlankLineNode,
  isMarkdownBlankLinePlaceholderNode,
  replaceBlankLinePlaceholderWithEditableParagraph,
  replaceMarkdownBlankLineBlockInTransactionWithEditableParagraph,
  replaceRangeWithEditableMarkdownBlankLine
} from './markdownBlankLineShared';
import { handleEditableMarkdownBlankLineAfterHeadingDelete } from './markdownBlankLineHeadingDeletion';
import { handleDocumentStartTitleBoundaryDelete } from './markdownBlankLineTitleBoundaryDeletion';

function getPlainDeleteDirection(event: KeyboardEvent): -1 | 1 | null {
  if (event.shiftKey || event.metaKey || event.ctrlKey || event.altKey || event.isComposing) {
    return null;
  }

  if (event.key === 'Backspace') return -1;
  if (event.key === 'Delete') return 1;
  return null;
}

function isEmptyTopLevelParagraphSelection(selection: TextSelection): boolean {
  return selection.empty
    && selection.$from.depth === 1
    && selection.$from.parent.type.name === 'paragraph'
    && selection.$from.parent.content.size === 0;
}

function isEditableMarkdownBlankLineSelection(selection: TextSelection): boolean {
  return selection.empty
    && selection.$from.depth === 1
    && isEditableMarkdownBlankLineNode(selection.$from.parent);
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

function createReplaceSelectedMarkdownBlankLineTransaction(
  state: EditorState,
  selection: NodeSelection,
): Transaction | null {
  const paragraph = createEditableMarkdownBlankLineParagraphFromState(state);
  if (!paragraph) return null;

  let tr = state.tr.replaceWith(selection.from, selection.to, paragraph);
  tr = tr
    .setSelection(TextSelection.create(tr.doc, selection.from + 1 + EDITABLE_MARKDOWN_BLANK_LINE_PLACEHOLDER.length))
    .setMeta(blankAreaDragBoxPluginKey, CLEAR_BLOCKS_ACTION);
  return tr.scrollIntoView();
}

function createDeleteSelectedMarkdownBlankLineTransaction(
  state: EditorState,
  selection: NodeSelection,
): Transaction | null {
  let tr = state.tr.delete(selection.from, selection.to);
  const nextSelection = createTextSelectionNearDocumentPosition(tr.doc, selection.from, 1);
  if (!nextSelection) return null;

  tr = tr
    .setSelection(nextSelection)
    .setMeta(blankAreaDragBoxPluginKey, CLEAR_BLOCKS_ACTION);
  return tr.scrollIntoView();
}

export function appendMarkdownBlankLineNodeSelectionRecoveryTransaction(
  oldState: EditorState,
  newState: EditorState,
): Transaction | null {
  const { selection } = newState;
  if (!(selection instanceof NodeSelection) || !isMarkdownBlankLinePlaceholderNode(selection.node)) {
    return null;
  }

  if (oldState.selection instanceof TextSelection) {
    if (isEditableMarkdownBlankLineSelection(oldState.selection)) {
      return createDeleteSelectedMarkdownBlankLineTransaction(newState, selection)
        ?? createReplaceSelectedMarkdownBlankLineTransaction(newState, selection);
    }
    if (isEmptyTopLevelParagraphSelection(oldState.selection)) {
      return createReplaceSelectedMarkdownBlankLineTransaction(newState, selection);
    }
  }

  if (
    oldState.selection instanceof NodeSelection &&
    isMarkdownBlankLinePlaceholderNode(oldState.selection.node)
  ) {
    return createDeleteSelectedMarkdownBlankLineTransaction(newState, selection)
      ?? createReplaceSelectedMarkdownBlankLineTransaction(newState, selection);
  }

  return createReplaceSelectedMarkdownBlankLineTransaction(newState, selection);
}

function isPlainParagraphTextSelection(doc: EditorState['doc'], selection: TextSelection): boolean {
  const topLevelBlock = findTopLevelBlockAt(doc, selection.from);
  return topLevelBlock?.node.type.name === 'paragraph';
}

function keepSelectionInEditableMarkdownBlankLine(
  view: EditorView,
  blockFrom: number,
  parentOffset: number,
): boolean {
  const cursorPos = blockFrom + 1 + Math.max(
    0,
    Math.min(parentOffset, EDITABLE_MARKDOWN_BLANK_LINE_PLACEHOLDER.length),
  );
  view.dispatch(
    view.state.tr
      .setSelection(TextSelection.create(view.state.doc, cursorPos))
      .setMeta(blankAreaDragBoxPluginKey, CLEAR_BLOCKS_ACTION)
      .scrollIntoView()
  );
  view.focus();
  return true;
}

function handleSelectedMarkdownBlankLineDelete(view: EditorView, direction: -1 | 1): boolean {
  const { selection } = view.state;
  if (!(selection instanceof NodeSelection) || !isMarkdownBlankLinePlaceholderNode(selection.node)) {
    return false;
  }

  const previous = findTopLevelBlockBefore(view.state.doc, selection.from);
  const next = findTopLevelBlockAfter(view.state.doc, selection.to);
  const hasPlainParagraphsOnBothSides = isNonEmptyPlainParagraph(previous?.node)
    && isNonEmptyPlainParagraph(next?.node);

  let tr = view.state.tr.delete(selection.from, selection.to);
  const adjacentBlankLine = direction < 0
    ? findTopLevelBlockBefore(tr.doc, selection.from) ?? findTopLevelBlockAfter(tr.doc, selection.from)
    : findTopLevelBlockAfter(tr.doc, selection.from) ?? findTopLevelBlockBefore(tr.doc, selection.from);
  if (adjacentBlankLine && isMarkdownBlankLinePlaceholderNode(adjacentBlankLine.node)) {
    const editableAdjacentTransaction = replaceMarkdownBlankLineBlockInTransactionWithEditableParagraph(
      view.state,
      tr,
      adjacentBlankLine,
    );
    if (editableAdjacentTransaction) {
      view.dispatch(editableAdjacentTransaction.scrollIntoView());
      view.focus();
      return true;
    }
  }

  if (hasPlainParagraphsOnBothSides && previous) {
    tr = tr
      .setSelection(TextSelection.create(
        tr.doc,
        previous.from + 1 + previous.node.content.size,
      ))
      .setMeta(blankAreaDragBoxPluginKey, CLEAR_BLOCKS_ACTION);
    view.dispatch(tr.scrollIntoView());
    view.focus();
    return true;
  }

  const nextSelection = createTextSelectionNearDocumentPosition(tr.doc, selection.from, direction);
  if (nextSelection && isPlainParagraphTextSelection(tr.doc, nextSelection)) {
    tr = tr
      .setSelection(nextSelection)
      .setMeta(blankAreaDragBoxPluginKey, CLEAR_BLOCKS_ACTION);
    view.dispatch(tr.scrollIntoView());
    view.focus();
    return true;
  }

  return replaceBlankLinePlaceholderWithEditableParagraph(view, {
    from: selection.from,
    to: selection.to,
    node: selection.node,
  });
}

function resolveEditableBlankLineAdjacentBlocks(view: EditorView, direction: -1 | 1) {
  const { selection } = view.state;
  if (!(selection instanceof TextSelection) || !selection.empty) return null;

  const $from = selection.$from;
  if ($from.depth !== 1 || !isEditableMarkdownBlankLineNode($from.parent)) return null;

  const blockFrom = $from.before(1);
  const blockTo = $from.after(1);
  const primaryAdjacent = direction < 0
    ? findTopLevelBlockBefore(view.state.doc, blockFrom)
    : findTopLevelBlockAfter(view.state.doc, blockTo);
  return { $from, blockFrom, blockTo, primaryAdjacent };
}

function handleEditableMarkdownBlankLineDelete(view: EditorView, direction: -1 | 1): boolean {
  const resolved = resolveEditableBlankLineAdjacentBlocks(view, direction);
  if (!resolved) return false;
  const { $from, blockFrom, blockTo, primaryAdjacent } = resolved;
  const adjacent = primaryAdjacent && isMarkdownBlankLinePlaceholderNode(primaryAdjacent.node)
    ? primaryAdjacent
    : direction < 0
      ? findTopLevelBlockAfter(view.state.doc, blockTo)
      : findTopLevelBlockBefore(view.state.doc, blockFrom);
  if (!adjacent || !isMarkdownBlankLinePlaceholderNode(adjacent.node)) return false;

  let tr = view.state.tr.delete(adjacent.from, adjacent.to);
  const mappedBlockFrom = tr.mapping.map(blockFrom, -1);
  tr = tr
    .setSelection(TextSelection.create(
      tr.doc,
      mappedBlockFrom + 1 + Math.max(0, Math.min($from.parentOffset, EDITABLE_MARKDOWN_BLANK_LINE_PLACEHOLDER.length)),
    ))
    .setMeta(blankAreaDragBoxPluginKey, CLEAR_BLOCKS_ACTION);
  view.dispatch(tr.scrollIntoView());
  view.focus();
  return true;
}

function handleEditableMarkdownBlankLineBesideStructuralBlockDelete(view: EditorView, direction: -1 | 1): boolean {
  const resolved = resolveEditableBlankLineAdjacentBlocks(view, direction);
  if (!resolved) return false;
  const { $from, blockFrom, blockTo, primaryAdjacent: adjacent } = resolved;
  if (!adjacent || !STRUCTURAL_EMPTY_PARAGRAPH_DELETE_BLOCK_NAMES.has(adjacent.node.type.name)) return false;

  const cursorTarget = direction < 0
    ? findTopLevelBlockAfter(view.state.doc, blockTo)
    : findTopLevelBlockBefore(view.state.doc, blockFrom);
  if (cursorTarget?.node.type.name !== 'paragraph') {
    if (!cursorTarget || !STRUCTURAL_EMPTY_PARAGRAPH_DELETE_BLOCK_NAMES.has(cursorTarget.node.type.name)) {
      return keepSelectionInEditableMarkdownBlankLine(view, blockFrom, $from.parentOffset);
    }

    let tr = view.state.tr
      .delete(blockFrom, blockTo)
      .setMeta(blankAreaDragBoxPluginKey, CLEAR_BLOCKS_ACTION);
    const mappedBlockFrom = Math.max(0, Math.min(tr.mapping.map(blockFrom), tr.doc.content.size));
    const resolvedPos = tr.doc.resolve(mappedBlockFrom);
    const previous = findTopLevelBlockBefore(view.state.doc, blockFrom);
    const next = findTopLevelBlockAfter(view.state.doc, blockTo);
    const hasHorizontalRuleBeforeList = previous?.node.type.name === 'hr'
      && next
      && LIST_CONTAINER_NODE_NAMES.has(next.node.type.name);
    const horizontalRuleSelection = hasHorizontalRuleBeforeList && direction < 0
      ? TextSelection.create(
        tr.doc,
        tr.mapping.map(previous.from, -1) + 1 + previous.node.content.size,
      )
      : null;
    const followingListSelection = hasHorizontalRuleBeforeList && direction > 0
      ? Selection.findFrom(resolvedPos, 1, true)
      : null;
    const nextSelection = horizontalRuleSelection
      ?? (followingListSelection instanceof TextSelection
        ? TextSelection.create(tr.doc, followingListSelection.$from.end())
        : null)
      ?? Selection.findFrom(resolvedPos, direction, true)
      ?? Selection.findFrom(resolvedPos, direction < 0 ? 1 : -1, true)
      ?? Selection.near(resolvedPos, direction);

    tr = tr.setSelection(nextSelection);
    view.dispatch(tr.scrollIntoView());
    view.focus();
    return true;
  }

  let tr = view.state.tr.delete(blockFrom, blockTo);
  const mappedTargetFrom = tr.mapping.map(cursorTarget.from, direction < 0 ? -1 : 1);
  const cursorPos = direction < 0
    ? mappedTargetFrom + 1
    : mappedTargetFrom + 1 + cursorTarget.node.content.size;

  tr = tr
    .setSelection(TextSelection.create(tr.doc, cursorPos))
    .setMeta(blankAreaDragBoxPluginKey, CLEAR_BLOCKS_ACTION);
  view.dispatch(tr.scrollIntoView());
  view.focus();
  return true;
}

function handleEditableMarkdownBlankLineBesidePlainParagraphDelete(view: EditorView, direction: -1 | 1): boolean {
  const resolved = resolveEditableBlankLineAdjacentBlocks(view, direction);
  if (!resolved) return false;
  const { blockFrom, primaryAdjacent: adjacent } = resolved;
  if (adjacent?.node.type.name !== 'paragraph') return false;

  const previousParagraph = findTopLevelBlockBefore(view.state.doc, blockFrom);
  const nextParagraph = findTopLevelBlockAfter(view.state.doc, resolved.blockTo);
  const hasPlainParagraphsOnBothSides = previousParagraph?.node.type.name === 'paragraph'
    && previousParagraph.node.content.size > 0
    && !isEditableMarkdownBlankLineNode(previousParagraph.node)
    && nextParagraph?.node.type.name === 'paragraph'
    && nextParagraph.node.content.size > 0
    && !isEditableMarkdownBlankLineNode(nextParagraph.node);

  let tr = view.state.tr.delete(resolved.blockFrom, resolved.blockTo);
  const cursorTarget = hasPlainParagraphsOnBothSides
    ? previousParagraph
    : adjacent;
  const cursorPos = cursorTarget.from < blockFrom
    ? cursorTarget.from + 1 + cursorTarget.node.content.size
    : blockFrom + 1;
  tr = tr
    .setSelection(TextSelection.create(tr.doc, cursorPos))
    .setMeta(blankAreaDragBoxPluginKey, CLEAR_BLOCKS_ACTION);
  view.dispatch(tr.scrollIntoView());
  view.focus();
  return true;
}

function handleEditableMarkdownBlankLineTerminalDelete(view: EditorView, direction: -1 | 1): boolean {
  const resolved = resolveEditableBlankLineAdjacentBlocks(view, direction);
  if (!resolved) return false;
  if (resolved.primaryAdjacent) return false;

  return keepSelectionInEditableMarkdownBlankLine(view, resolved.blockFrom, resolved.$from.parentOffset);
}

function handleEmptyParagraphBesideMarkdownBlankLineDelete(view: EditorView, direction: -1 | 1): boolean {
  const { selection } = view.state;
  if (!(selection instanceof TextSelection) || !isEmptyTopLevelParagraphSelection(selection)) return false;

  const $from = selection.$from;
  const blockFrom = $from.before(1);
  const blockTo = $from.after(1);
  if (direction < 0 && $from.parentOffset > 0) return false;
  if (direction > 0 && $from.parentOffset < $from.parent.content.size) return false;

  const primaryAdjacent = direction < 0
    ? findTopLevelBlockBefore(view.state.doc, blockFrom)
    : findTopLevelBlockAfter(view.state.doc, blockTo);
  const adjacent = primaryAdjacent && isMarkdownBlankLinePlaceholderNode(primaryAdjacent.node)
    ? primaryAdjacent
    : direction < 0
      ? findTopLevelBlockAfter(view.state.doc, blockTo)
      : findTopLevelBlockBefore(view.state.doc, blockFrom);
  if (!adjacent || !isMarkdownBlankLinePlaceholderNode(adjacent.node)) return false;

  return replaceRangeWithEditableMarkdownBlankLine(view, Math.min(blockFrom, adjacent.from), Math.max(blockTo, adjacent.to));
}

export function handleMarkdownBlankLineDeletion(view: EditorView, event: KeyboardEvent): boolean {
  const direction = getPlainDeleteDirection(event);
  if (!direction) return false;

  const handled = (
    handleSelectedMarkdownBlankLineDelete(view, direction) ||
    handleDocumentStartTitleBoundaryDelete(view, direction) ||
    handleEditableMarkdownBlankLineAfterHeadingDelete(view) ||
    handleEditableMarkdownBlankLineDelete(view, direction) ||
    handleEditableMarkdownBlankLineBesideStructuralBlockDelete(view, direction) ||
    handleEditableMarkdownBlankLineBesidePlainParagraphDelete(view, direction) ||
    handleEditableMarkdownBlankLineTerminalDelete(view, direction) ||
    handleEmptyParagraphBesideMarkdownBlankLineDelete(view, direction)
  );
  if (!handled) return false;

  event.preventDefault();
  return true;
}
