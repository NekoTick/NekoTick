import { NodeSelection, Selection, TextSelection } from '@milkdown/kit/prose/state';
import type { EditorView } from '@milkdown/kit/prose/view';
import { blankAreaDragBoxPluginKey, CLEAR_BLOCKS_ACTION } from './blockSelectionPluginState';
import { isNavigableAtomicBlockNode } from '../shared/blockNodeTypes';
import {
  Direction,
  TopLevelBlock,
  findTopLevelBlockAfter,
  findTopLevelBlockBefore,
  isEditableMarkdownBlankLineNode,
  isMarkdownBlankLinePlaceholderNode,
  replaceMarkdownBlankLineWithEditableParagraph,
} from './markdownBlankLineShared';

function getPlainNavigationDirection(event: KeyboardEvent): Direction | null {
  if (event.shiftKey || event.metaKey || event.ctrlKey || event.altKey || event.isComposing) {
    return null;
  }

  if (event.key === 'ArrowUp') return 'up';
  if (event.key === 'ArrowDown') return 'down';
  if (event.key === 'ArrowLeft') return 'left';
  if (event.key === 'ArrowRight') return 'right';
  return null;
}

function isBackwardDirection(direction: Direction): boolean {
  return direction === 'up' || direction === 'left';
}

function isSelectionAtTopLevelBoundary(
  view: EditorView,
  selection: TextSelection,
  direction: Direction,
  topLevelBlock: TopLevelBlock,
): boolean {
  const { doc } = view.state;
  const boundarySelection = Selection.findFrom(
    doc.resolve(isBackwardDirection(direction) ? topLevelBlock.from : topLevelBlock.to),
    isBackwardDirection(direction) ? 1 : -1,
    true,
  );
  if (!(boundarySelection instanceof TextSelection) || !boundarySelection.empty) {
    return false;
  }

  if (selection.from === boundarySelection.from) return true;
  if (direction === 'left' || direction === 'right') return false;

  return selection.$from.parent === boundarySelection.$from.parent && Boolean(view.endOfTextblock?.(direction));
}

function resolveAdjacentMarkdownBlankLineFromTextSelection(view: EditorView, direction: Direction): TopLevelBlock | null {
  const { selection } = view.state;
  if (!(selection instanceof TextSelection) || !selection.empty) return null;

  const $from = selection.$from;
  if ($from.depth < 1 || !$from.parent.isTextblock) return null;

  const blockFrom = $from.before(1);
  const blockTo = $from.after(1);
  const topLevelNode = view.state.doc.nodeAt(blockFrom);
  if (!topLevelNode) return null;

  const topLevelBlock: TopLevelBlock = { from: blockFrom, to: blockTo, node: topLevelNode };
  if (!isSelectionAtTopLevelBoundary(view, selection, direction, topLevelBlock)) return null;

  const adjacent = isBackwardDirection(direction)
    ? findTopLevelBlockBefore(view.state.doc, blockFrom)
    : findTopLevelBlockAfter(view.state.doc, blockTo);

  return adjacent && isMarkdownBlankLinePlaceholderNode(adjacent.node) ? adjacent : null;
}

function resolveAdjacentBlockFromEditableBlankLine(view: EditorView, direction: Direction): TopLevelBlock | null {
  const { selection } = view.state;
  if (!(selection instanceof TextSelection) || !selection.empty) return null;

  const $from = selection.$from;
  if ($from.depth !== 1 || !isEditableMarkdownBlankLineNode($from.parent)) return null;

  const blockFrom = $from.before(1);
  const blockTo = $from.after(1);
  return isBackwardDirection(direction)
    ? findTopLevelBlockBefore(view.state.doc, blockFrom)
    : findTopLevelBlockAfter(view.state.doc, blockTo);
}

function resolveTextSelectionInAdjacentBlock(
  view: EditorView,
  adjacent: TopLevelBlock,
  direction: Direction,
): TextSelection | null {
  if (isMarkdownBlankLinePlaceholderNode(adjacent.node)) return null;

  if (adjacent.node.isTextblock) {
    const cursorPos = adjacent.node.type.name === 'hr'
      ? adjacent.from + 1 + adjacent.node.content.size
      : isBackwardDirection(direction)
        ? adjacent.from + 1 + adjacent.node.content.size
        : adjacent.from + 1;
    return TextSelection.create(view.state.doc, cursorPos);
  }

  const boundaryPos = isBackwardDirection(direction) ? adjacent.to : adjacent.from;
  const resolvedPos = view.state.doc.resolve(
    Math.max(0, Math.min(boundaryPos, view.state.doc.content.size))
  );
  const adjacentSelection = Selection.findFrom(
    resolvedPos,
    isBackwardDirection(direction) ? -1 : 1,
    true,
  );
  return adjacentSelection instanceof TextSelection ? adjacentSelection : null;
}

function resolveNodeSelectionForAdjacentAtomicBlock(view: EditorView, adjacent: TopLevelBlock): NodeSelection | null {
  if (!isNavigableAtomicBlockNode(adjacent.node)) return null;
  return NodeSelection.create(view.state.doc, adjacent.from);
}

function moveSelectionOutOfEditableBlankLine(view: EditorView, direction: Direction): boolean {
  const adjacent = resolveAdjacentBlockFromEditableBlankLine(view, direction);
  if (!adjacent) return false;

  if (isMarkdownBlankLinePlaceholderNode(adjacent.node)) {
    return replaceMarkdownBlankLineWithEditableParagraph(view, adjacent);
  }

  const atomicSelection = resolveNodeSelectionForAdjacentAtomicBlock(view, adjacent);
  if (atomicSelection) {
    view.dispatch(
      view.state.tr
        .setSelection(atomicSelection)
        .setMeta(blankAreaDragBoxPluginKey, CLEAR_BLOCKS_ACTION)
        .scrollIntoView()
    );
    view.focus();
    return true;
  }

  const adjacentSelection = resolveTextSelectionInAdjacentBlock(view, adjacent, direction);
  if (!adjacentSelection) return false;

  view.dispatch(
    view.state.tr
      .setSelection(adjacentSelection)
      .setMeta(blankAreaDragBoxPluginKey, CLEAR_BLOCKS_ACTION)
      .scrollIntoView()
  );
  view.focus();
  return true;
}

export function handleMarkdownBlankLineKeyboardNavigation(view: EditorView, event: KeyboardEvent): boolean {
  const direction = getPlainNavigationDirection(event);
  if (!direction) return false;

  const { selection } = view.state;
  if (selection instanceof NodeSelection && isMarkdownBlankLinePlaceholderNode(selection.node)) {
    event.preventDefault();
    return replaceMarkdownBlankLineWithEditableParagraph(view, {
      from: selection.from,
      to: selection.to,
      node: selection.node,
    });
  }

  if (moveSelectionOutOfEditableBlankLine(view, direction)) {
    event.preventDefault();
    return true;
  }

  const adjacent = resolveAdjacentMarkdownBlankLineFromTextSelection(view, direction);
  if (!adjacent) return false;

  event.preventDefault();
  return replaceMarkdownBlankLineWithEditableParagraph(view, adjacent);
}
