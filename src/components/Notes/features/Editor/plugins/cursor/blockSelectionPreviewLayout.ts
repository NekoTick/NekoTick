import type { EditorState } from '@milkdown/kit/prose/state';
import {
  getBlockRangeKey,
  normalizeBlockRanges,
  resolveBlockSelectionDisplayRangeInfo,
} from './blockSelectionRanges';
import type { BlockRange, BlockRect, RectBounds } from './blockSelectionTypes';
import {
  createRoundedBlockSelectionPreviewPath,
  resolveBlockSelectionPreviewRects,
  type BlockSelectionPreviewMetrics,
} from './blockSelectionPreviewGeometry';

export interface BlockSelectionPreviewLayout {
  blocks: BlockRect[];
  rects: RectBounds[];
  pathData: string;
}

interface ResolveBlockSelectionPreviewLayoutOptions {
  doc: EditorState['doc'];
  selectedBlocks: readonly BlockRange[];
  sourceBlocks: readonly BlockRect[];
  allSourceBlocks?: readonly BlockRect[];
  metrics: BlockSelectionPreviewMetrics;
}

function mergePreviewBlockRects(range: BlockRange, blocks: readonly BlockRect[]): BlockRect | null {
  if (blocks.length === 0) return null;

  let left = Number.POSITIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;
  for (const block of blocks) {
    left = Math.min(left, block.left);
    top = Math.min(top, block.top);
    right = Math.max(right, block.right);
    bottom = Math.max(bottom, block.bottom);
  }

  return {
    from: range.from,
    to: range.to,
    left,
    top,
    right,
    bottom,
  };
}

function findFirstBlockStartingAtOrAfter(blocks: readonly BlockRect[], from: number): number {
  let low = 0;
  let high = blocks.length;

  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (blocks[middle].from < from) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }

  return low;
}

export function resolveBlockSelectionPreviewBlocks(
  doc: EditorState['doc'],
  selectedBlocks: readonly BlockRange[],
  sourceBlocks: readonly BlockRect[],
  allSourceBlocks: readonly BlockRect[] = sourceBlocks,
): BlockRect[] {
  const normalizedSelectedBlocks = normalizeBlockRanges(selectedBlocks);
  const sourceBlocksAreAligned = sourceBlocks.length === normalizedSelectedBlocks.length
    && sourceBlocks.every((block, index) => {
      const range = normalizedSelectedBlocks[index];
      return Boolean(range && block.from === range.from && block.to === range.to);
    });
  const sourceBlocksByRange = sourceBlocksAreAligned
    ? null
    : new Map(sourceBlocks.map((block) => [getBlockRangeKey(block.from, block.to), block]));
  const visualEntries: Array<{
    range: BlockRange;
    geometryBlocks: BlockRect[];
    isFullListItem: boolean;
  }> = [];
  let containingListItemTo = -1;
  let currentEntry: (typeof visualEntries)[number] | null = null;

  for (let index = 0; index < normalizedSelectedBlocks.length; index += 1) {
    const selectedRange = normalizedSelectedBlocks[index];
    if (!selectedRange) continue;
    const displayInfo = resolveBlockSelectionDisplayRangeInfo(doc, selectedRange);
    const displayRange = displayInfo.range;
    const displayKey = getBlockRangeKey(displayRange.from, displayRange.to);
    const isFullListItem = displayInfo.isFullListItem;
    const sourceBlock = sourceBlocksAreAligned
      ? sourceBlocks[index]
      : sourceBlocksByRange?.get(getBlockRangeKey(selectedRange.from, selectedRange.to));

    if (currentEntry && getBlockRangeKey(currentEntry.range.from, currentEntry.range.to) === displayKey) {
      if (sourceBlock) currentEntry.geometryBlocks.push(sourceBlock);
      continue;
    }
    if (displayRange.from < containingListItemTo && displayRange.to <= containingListItemTo) {
      continue;
    }
    if (displayRange.to > containingListItemTo) containingListItemTo = -1;

    currentEntry = {
      range: displayRange,
      geometryBlocks: sourceBlock ? [sourceBlock] : [],
      isFullListItem,
    };
    visualEntries.push(currentEntry);
    if (isFullListItem) containingListItemTo = displayRange.to;
  }

  return visualEntries.flatMap(({ range, geometryBlocks, isFullListItem }) => {
    if (isFullListItem) {
      const firstContainedIndex = findFirstBlockStartingAtOrAfter(allSourceBlocks, range.from);
      for (let index = firstContainedIndex; index < allSourceBlocks.length; index += 1) {
        const block = allSourceBlocks[index];
        if (block.from >= range.to) break;
        if (
          block.to <= range.to
          && (block.from !== range.from || block.to !== range.to)
        ) {
          geometryBlocks.push(block);
        }
      }
    }
    const mergedBlock = mergePreviewBlockRects(range, geometryBlocks);
    return mergedBlock ? [mergedBlock] : [];
  });
}

export function resolveBlockSelectionPreviewLayout(
  options: ResolveBlockSelectionPreviewLayoutOptions,
): BlockSelectionPreviewLayout {
  const blocks = resolveBlockSelectionPreviewBlocks(
    options.doc,
    options.selectedBlocks,
    options.sourceBlocks,
    options.allSourceBlocks,
  );
  const rects = resolveBlockSelectionPreviewRects(options.doc, blocks, options.metrics);
  return {
    blocks,
    rects,
    pathData: createRoundedBlockSelectionPreviewPath(rects, options.metrics.radiusPx),
  };
}
