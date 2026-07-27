import type { EditorState } from '@milkdown/kit/prose/state';
import type { Serializer } from '@milkdown/kit/transformer';
import { normalizeSerializedMarkdownBlock } from '@/lib/notes/markdown/markdownSerializationUtils';
import { serializeSliceToText } from '../clipboard/serializer';
import {
  isVisiblePlainTextNode,
  isVisiblePlainTextSlice,
  serializeSliceAsVisiblePlainText,
} from '../clipboard/visibleTextSerialization';
import { serializeLeadingFrontmatterMarkdown } from '../frontmatter/frontmatterMarkdown';
import { normalizeBlockRanges, pruneContainedBlockRanges, type BlockRange } from './blockSelectionUtils';
import {
  ORDERED_LIST_ITEM_MARKER_PATTERN,
  getNodeChildren,
  isNestedListRange,
  renumberOrderedListMarker,
  resolveContainingListItemAtRange,
  resolveListItemNodeAtRangeStart,
  resolveOrderedListItemNumber,
  resolveTopLevelBlockInfo,
  stripOuterListBlockMarkers,
  stripSingleListBlockMarker,
} from './blockSelectionListSerialization';
import {
  collapseCompleteSelectedListContainers,
  isListItemChildRange,
  isWholeListContainerRange,
  isWholeListItemRange,
  joinSerializedBlockRanges,
} from './blockSelectionListRanges';
import {
  normalizeSelectedFencedCodeIndent,
  stripCommonContinuationIndent,
  trimLeadingBlankLines,
} from './blockSelectionFenceIndent';
import {
  coalesceParagraphInlineRanges,
  serializeParagraphInlineRange,
} from './blockSelectionParagraphInlineSerialization';

function serializeSelectionFrontmatterMarkdown(markdown: string): string {
  return serializeLeadingFrontmatterMarkdown(markdown, undefined, {
    removeSerializerPadding: true,
  });
}

interface SerializeSelectedBlocksOptions {
  compactPlainParagraphs?: boolean;
  markdownSerializer?: Serializer | null;
  preserveSingleListBlockMarker?: boolean;
}

export { normalizeSelectedFencedCodeIndent };

function serializeSingleListBlockWithoutMarker(
  state: EditorState,
  range: BlockRange,
  markdownSerializer?: Serializer | null,
): string | null {
  const directListItem = resolveListItemNodeAtRangeStart(state, range);
  const listItem = directListItem ?? resolveContainingListItemAtRange(state, range);
  if (!listItem || listItem.type.name !== 'list_item') {
    return null;
  }

  const directListItemChildren = getNodeChildren(directListItem);
  if (
    directListItem
    && directListItemChildren.length > 0
    && directListItemChildren.every((child) => child?.type?.name === 'paragraph' && isVisiblePlainTextNode(child))
  ) {
    return normalizeSelectedFencedCodeIndent(
      stripSingleListBlockMarker(
        normalizeSerializedMarkdownBlock(
          serializeSliceAsVisiblePlainText({ content: directListItem.content })
        )
      )
    );
  }

  if (markdownSerializer) {
    try {
      const normalized = stripSingleListBlockMarker(
        normalizeSerializedMarkdownBlock(markdownSerializer(state.doc.cut(range.from, range.to)))
      );
      const withoutContinuationIndent = trimLeadingBlankLines(stripCommonContinuationIndent(normalized));
      return normalizeSelectedFencedCodeIndent(withoutContinuationIndent);
    } catch {
    }
  }

  const normalized = stripSingleListBlockMarker(
    normalizeSerializedMarkdownBlock(serializeSliceToText(state.doc.slice(range.from, range.to)))
  );
  const withoutContinuationIndent = trimLeadingBlankLines(stripCommonContinuationIndent(normalized));
  return normalizeSelectedFencedCodeIndent(withoutContinuationIndent);
}

function serializePlainParagraphBlock(
  state: EditorState,
  block: BlockRange,
): string | null {
  let blockInfo: { from: number; to: number; name: string } | null = null;
  try {
    blockInfo = resolveTopLevelBlockInfo(state.doc, block.from);
  } catch {
    return null;
  }

  if (!blockInfo || blockInfo.from !== block.from || blockInfo.to !== block.to || blockInfo.name !== 'paragraph') {
    return null;
  }

  const slice = state.doc.slice(block.from, block.to);
  if (!isVisiblePlainTextSlice(slice)) {
    return null;
  }

  return normalizeSerializedMarkdownBlock(serializeSliceAsVisiblePlainText(slice));
}

function normalizeSerializedSelectedBlockMarkdown(
  state: EditorState,
  block: BlockRange,
  text: string,
): string {
  let normalized = isWholeListContainerRange(state, block) || isWholeListItemRange(state, block)
    ? normalizeSerializedMarkdownBlock(text)
    : normalizeSelectedFencedCodeIndent(normalizeSerializedMarkdownBlock(text));
  normalized = isListItemChildRange(state, block)
    ? stripCommonContinuationIndent(normalized)
    : normalized;
  normalized = isNestedListRange(state, block) ? stripOuterListBlockMarkers(normalized) : normalized;

  const orderedNumber = resolveOrderedListItemNumber(state.doc, block.from);
  if (orderedNumber !== null && ORDERED_LIST_ITEM_MARKER_PATTERN.test(normalized)) {
    return renumberOrderedListMarker(normalized, orderedNumber);
  }

  return normalized;
}

export function serializeSelectedBlocksToText(
  state: EditorState,
  blocks: readonly BlockRange[],
  options: SerializeSelectedBlocksOptions = {},
): string {
  const normalized = collapseCompleteSelectedListContainers(
    state.doc,
    normalizeBlockRanges(blocks),
  );
  const pruned = coalesceParagraphInlineRanges(state.doc, pruneContainedBlockRanges(normalized));
  if (pruned.length === 0) return '';

  if (!options.preserveSingleListBlockMarker && pruned.length === 1 && normalized.length === 1) {
    const singleListText = serializeSingleListBlockWithoutMarker(
      state,
      pruned[0],
      options.markdownSerializer,
    );
    if (singleListText !== null) {
      return serializeSelectionFrontmatterMarkdown(singleListText);
    }
  }

  const { markdownSerializer } = options;
  if (markdownSerializer) {
    try {
      const markdownPieces = pruned
        .map((block) => {
          const inlineParagraphText = serializeParagraphInlineRange(state, block);
          if (inlineParagraphText !== null) {
            return inlineParagraphText;
          }

          const plainParagraphText = serializePlainParagraphBlock(state, block);
          if (plainParagraphText !== null) {
            return plainParagraphText;
          }

          return normalizeSerializedSelectedBlockMarkdown(
            state,
            block,
            markdownSerializer(state.doc.cut(block.from, block.to))
          );
        });
      return serializeSelectionFrontmatterMarkdown(
        joinSerializedBlockRanges(
          state.doc,
          pruned,
          markdownPieces,
          options.compactPlainParagraphs,
        )
      );
    } catch {
    }
  }

  const pieces = pruned
    .map((block) => {
      const inlineParagraphText = serializeParagraphInlineRange(state, block);
      if (inlineParagraphText !== null) {
        return inlineParagraphText;
      }

      return normalizeSerializedSelectedBlockMarkdown(
        state,
        block,
        serializeSliceToText(state.doc.slice(block.from, block.to))
      );
    });

  return serializeSelectionFrontmatterMarkdown(
    joinSerializedBlockRanges(state.doc, pruned, pieces, options.compactPlainParagraphs)
  );
}
