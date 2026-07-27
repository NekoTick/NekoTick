import { TextSelection, type EditorState } from '@milkdown/kit/prose/state';
import { Fragment, type Slice } from '@milkdown/kit/prose/model';
import { CellSelection } from '@milkdown/kit/prose/tables';
import type { Serializer } from '@milkdown/kit/transformer';

import {
  joinSerializedBlocks,
  normalizeSerializedMarkdownBlock,
  normalizeSerializedMarkdownSelection,
} from '@/lib/notes/markdown/markdownSerializationUtils';
import { serializeSliceToText } from './serializer';
import {
  isVisiblePlainTextSlice,
  serializeSliceAsVisiblePlainText,
} from './visibleTextSerialization';
import { serializeLeadingFrontmatterMarkdown } from '../frontmatter/frontmatterMarkdown';
import {
  MAX_CLIPBOARD_SERIALIZATION_NODES,
  consumeClipboardTraversalNode,
  createClipboardTraversalBudget,
  getProseNodeChildren,
} from './clipboardTraversalBudget';
import {
  serializeBoundarySelectedListItemsWithMarkdown,
  serializeSingleListItemWithoutMarker,
} from './selectionSerializationLists';

function serializeSelectionFrontmatterMarkdown(markdown: string): string {
  return serializeLeadingFrontmatterMarkdown(markdown, undefined, {
    removeSerializerPadding: true,
  });
}

function isTextSelectionLike(selection: EditorState['selection']): boolean {
  if (typeof TextSelection === 'function' && selection instanceof TextSelection) {
    return true;
  }

  return selection.constructor?.name === 'TextSelection';
}

function shouldCopyTextSelectionAsPlainText(state: EditorState, slice: Slice): boolean {
  if (!isTextSelectionLike(state.selection)) return false;
  if (state.selection.empty) return false;
  if (hasEmptySelectedTextblock(slice)) return false;

  return isVisiblePlainTextSlice(slice);
}

function hasEmptySelectedTextblock(slice: Slice): boolean {
  const budget = createClipboardTraversalBudget();
  const stack = getProseNodeChildren({ content: slice.content })
    .map((node) => ({ node, depth: 0 }));

  while (stack.length > 0) {
    const { node, depth } = stack.pop()!;
    if (!consumeClipboardTraversalNode(budget, depth)) {
      return true;
    }

    if (node.isTextblock && node.content.size === 0) {
      return true;
    }

    const children = getProseNodeChildren(node);
    for (let index = children.length - 1; index >= 0; index -= 1) {
      stack.push({ node: children[index], depth: depth + 1 });
    }
  }

  return false;
}

function isCellSelectionLike(selection: EditorState['selection']): boolean {
  if (typeof CellSelection === 'function' && selection instanceof CellSelection) {
    return true;
  }

  return selection.constructor?.name === 'CellSelection';
}

function serializeSingleSelectedCellContent(state: EditorState): string | null {
  const selection = state.selection as EditorState['selection'] & {
    $anchorCell?: { pos: number };
    $headCell?: { pos: number };
  };

  if (!isCellSelectionLike(selection)) return null;
  if (!selection.$anchorCell || !selection.$headCell) return null;
  if (selection.$anchorCell.pos !== selection.$headCell.pos) return null;

  const cell = state.doc.nodeAt(selection.$anchorCell.pos);
  if (!cell) return null;

  const cellName = cell?.type?.name;
  if (cellName !== 'table_cell' && cellName !== 'table_header') return null;

  return normalizeSerializedMarkdownSelection(
    serializeSliceToText({ content: cell.content })
  );
}

function serializeSingleCellTableSlice(slice: Slice): string | null {
  const topLevelNodes = getProseNodeChildren({ content: slice.content });
  if (topLevelNodes.length !== 1) return null;

  const table = topLevelNodes[0];
  if (table?.type?.name !== 'table') return null;

  const rows = getProseNodeChildren(table);
  if (rows.length !== 1) return null;

  const cells = getProseNodeChildren(rows[0]);
  if (cells.length !== 1) return null;

  const cell = cells[0];
  const cellName = cell?.type?.name;
  if (cellName !== 'table_cell' && cellName !== 'table_header') return null;

  return normalizeSerializedMarkdownSelection(
    serializeSliceToText({ content: cell.content })
  );
}

function serializeSliceTopLevelBlocks(
  state: EditorState,
  slice: Slice,
  markdownSerializer: Serializer
): string | null {
  const topLevelNodes = getProseNodeChildren({ content: slice.content });
  if (topLevelNodes.length === 0 || topLevelNodes.length > MAX_CLIPBOARD_SERIALIZATION_NODES) {
    return null;
  }

  try {
    const markdownPieces = topLevelNodes.map((node) => {
      const doc = state.schema.topNodeType.createAndFill(undefined, Fragment.from(node));
      if (!doc) {
        throw new Error('unable to create doc for slice node');
      }
      return normalizeSerializedMarkdownBlock(markdownSerializer(doc));
    });

    return joinSerializedBlocks(markdownPieces);
  } catch {
    return null;
  }
}

function isSliceWithinClipboardTraversalBudget(slice: Slice): boolean {
  const budget = createClipboardTraversalBudget();
  const stack = getProseNodeChildren({ content: slice.content })
    .map((node) => ({ node, depth: 0 }));

  while (stack.length > 0) {
    const { node, depth } = stack.pop()!;
    if (!consumeClipboardTraversalNode(budget, depth)) {
      return false;
    }

    const children = getProseNodeChildren(node);
    for (let index = children.length - 1; index >= 0; index -= 1) {
      stack.push({ node: children[index], depth: depth + 1 });
    }
  }

  return true;
}

type SelectionWithContent = EditorState['selection'] & {
  content?: () => Slice;
};

export function getSelectionSlice(state: EditorState): Slice {
  const selection = state.selection as SelectionWithContent;

  if (typeof selection.content === 'function') {
    return selection.content();
  }

  return state.doc.slice(selection.from, selection.to);
}

export function serializeSelectionToClipboardText(
  state: EditorState,
  markdownSerializer?: Serializer | null
): string {
  const selection = state.selection as SelectionWithContent;
  if (typeof selection.content !== 'function' && selection.from === selection.to) {
    return '';
  }

  const slice = getSelectionSlice(state);
  if (slice.content.size === 0) return '';

  const singleCellText = serializeSingleSelectedCellContent(state);
  if (singleCellText !== null) {
    return serializeSelectionFrontmatterMarkdown(singleCellText);
  }

  const singleCellTableSliceText = serializeSingleCellTableSlice(slice);
  if (singleCellTableSliceText !== null) {
    return serializeSelectionFrontmatterMarkdown(singleCellTableSliceText);
  }

  if (shouldCopyTextSelectionAsPlainText(state, slice)) {
    return serializeSliceAsVisiblePlainText(slice);
  }

  const singleListItemText = serializeSingleListItemWithoutMarker(slice);
  if (singleListItemText !== null) {
    return serializeSelectionFrontmatterMarkdown(singleListItemText);
  }

  if (markdownSerializer && isSliceWithinClipboardTraversalBudget(slice)) {
    const selectedListText = serializeBoundarySelectedListItemsWithMarkdown(state, markdownSerializer);
    if (selectedListText !== null) {
      return serializeSelectionFrontmatterMarkdown(selectedListText);
    }

    const topLevelBlockText = serializeSliceTopLevelBlocks(state, slice, markdownSerializer);
    if (topLevelBlockText !== null) {
      return serializeSelectionFrontmatterMarkdown(topLevelBlockText);
    }

    try {
      const doc = state.schema.topNodeType.createAndFill(undefined, slice.content);
      if (doc) {
        return serializeSelectionFrontmatterMarkdown(
          normalizeSerializedMarkdownSelection(markdownSerializer(doc))
        );
      }
    } catch {
    }
  }

  return serializeSelectionFrontmatterMarkdown(
    normalizeSerializedMarkdownSelection(serializeSliceToText(slice))
  );
}
