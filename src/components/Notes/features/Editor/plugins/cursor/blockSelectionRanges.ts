import type { EditorState, Transaction } from '@milkdown/kit/prose/state';
import type { BlockRange, BlockRect, RectBounds } from './blockSelectionTypes';

export interface BlockSelectionDisplayRangeInfo {
  range: BlockRange;
  isFullListItem: boolean;
}

const displayBlockRangeCache = new WeakMap<
  EditorState['doc'],
  Map<string, BlockSelectionDisplayRangeInfo>
>();

export function normalizeBlockRanges(ranges: readonly BlockRange[]): BlockRange[] {
  if (ranges.length === 0) return [];

  let isAlreadyNormalized = true;
  for (let index = 0; index < ranges.length; index += 1) {
    const range = ranges[index];
    const previous = ranges[index - 1];
    if (
      range.to <= range.from
      || (previous && (
        range.from < previous.from
        || (range.from === previous.from && range.to <= previous.to)
      ))
    ) {
      isAlreadyNormalized = false;
      break;
    }
  }
  if (isAlreadyNormalized) return [...ranges];

  const sorted = [...ranges]
    .filter((range) => range.to > range.from)
    .sort((a, b) => (a.from === b.from ? a.to - b.to : a.from - b.from));

  const unique: BlockRange[] = [];
  let lastFrom = -1;
  let lastTo = -1;
  for (const range of sorted) {
    if (range.from === lastFrom && range.to === lastTo) continue;
    unique.push(range);
    lastFrom = range.from;
    lastTo = range.to;
  }
  return unique;
}

export function getBlockRangeKey(from: number, to: number): string {
  return `${from}:${to}`;
}

export function pruneContainedBlockRanges(ranges: readonly BlockRange[]): BlockRange[] {
  const normalized = normalizeBlockRanges(ranges);
  if (normalized.length <= 1) return normalized;

  const sorted = [...normalized].sort((a, b) => (
    a.from === b.from ? b.to - a.to : a.from - b.from
  ));

  const pruned: BlockRange[] = [];
  for (const range of sorted) {
    const previous = pruned[pruned.length - 1];
    if (previous && range.from >= previous.from && range.to <= previous.to) {
      continue;
    }
    pruned.push(range);
  }

  return pruned.sort((a, b) => (a.from === b.from ? a.to - b.to : a.from - b.from));
}

export function preferNestedBlockRanges(ranges: readonly BlockRange[]): BlockRange[] {
  const normalized = normalizeBlockRanges(ranges);
  if (normalized.length <= 1) return normalized;

  const deepestFirst = [...normalized].sort((left, right) => (
    left.from === right.from ? left.to - right.to : right.from - left.from
  ));
  const kept: BlockRange[] = [];
  let minNestedTo = Number.POSITIVE_INFINITY;

  for (const range of deepestFirst) {
    if (minNestedTo <= range.to) {
      continue;
    }
    kept.push(range);
    minNestedTo = Math.min(minNestedTo, range.to);
  }

  return normalizeBlockRanges(kept);
}

function findFirstRangeStartingAfter(ranges: readonly BlockRange[], from: number): number {
  let low = 0;
  let high = ranges.length;

  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (ranges[mid].from <= from) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }

  return low;
}

export function preferNestedBlockRangesUnlessHeaderIntersects(
  ranges: readonly BlockRange[],
  blocks: readonly BlockRect[],
  selectionRect: RectBounds,
): BlockRange[] {
  const normalized = normalizeBlockRanges(ranges);
  const nestedPreferred = preferNestedBlockRanges(normalized);
  if (nestedPreferred.length === normalized.length) return nestedPreferred;

  const nestedKeys = new Set(nestedPreferred.map((range) => getBlockRangeKey(range.from, range.to)));
  const candidateParents = normalized.filter((range) => !nestedKeys.has(getBlockRangeKey(range.from, range.to)));
  const selectedChildren = nestedPreferred.sort((left, right) => (
    left.from === right.from ? left.to - right.to : left.from - right.from
  ));
  const blockTopByRange = new Map(blocks.map((block) => [getBlockRangeKey(block.from, block.to), block.top]));

  const preservedParents: BlockRange[] = [];
  for (const parent of candidateParents) {
    let firstChildTop: number | null = null;
    const startIndex = findFirstRangeStartingAfter(selectedChildren, parent.from);
    for (let index = startIndex; index < selectedChildren.length; index += 1) {
      const child = selectedChildren[index];
      if (child.from >= parent.to) break;
      if (child.to > parent.to) continue;

      const childTop = blockTopByRange.get(getBlockRangeKey(child.from, child.to));
      if (childTop === undefined) continue;
      firstChildTop = firstChildTop === null ? childTop : Math.min(firstChildTop, childTop);
    }

    if (firstChildTop !== null && selectionRect.top < firstChildTop) {
      preservedParents.push(parent);
    }
  }

  return preservedParents.length > 0
    ? pruneContainedBlockRanges([...nestedPreferred, ...preservedParents])
    : nestedPreferred;
}

export function getBlockRangesKey(ranges: readonly BlockRange[]): string {
  if (ranges.length === 0) return '';
  return ranges.map((range) => `${range.from}:${range.to}`).join('|');
}

export function resolveStandaloneImageBlockRange(
  doc: EditorState['doc'],
  block: BlockRange,
): BlockRange | null {
  const safeFrom = Math.max(0, Math.min(block.from, doc.content.size));
  const safeTo = Math.max(0, Math.min(block.to, doc.content.size));

  try {
    return resolveStandaloneImageBlockRangeFromNode(
      safeFrom,
      safeTo,
      doc.resolve(safeFrom).nodeAfter,
    );
  } catch {
    return null;
  }
}

function resolveStandaloneImageBlockRangeFromNode(
  safeFrom: number,
  safeTo: number,
  nodeAfter: EditorState['doc'] | null,
): BlockRange | null {
  if (!nodeAfter || nodeAfter.type.name !== 'paragraph') return null;
  if (safeTo !== safeFrom + nodeAfter.nodeSize) return null;
  if (nodeAfter.childCount !== 1 || nodeAfter.firstChild?.type.name !== 'image') return null;

  const imageFrom = safeFrom + 1;
  return {
    from: imageFrom,
    to: imageFrom + nodeAfter.firstChild.nodeSize,
  };
}

export function resolveBlockSelectionDisplayRangeInfo(
  doc: EditorState['doc'],
  block: BlockRange,
): BlockSelectionDisplayRangeInfo {
  const cacheKey = getBlockRangeKey(block.from, block.to);
  let docCache = displayBlockRangeCache.get(doc);
  if (!docCache) {
    docCache = new Map();
    displayBlockRangeCache.set(doc, docCache);
  }
  const cached = docCache.get(cacheKey);
  if (cached) return cached;

  const safeFrom = Math.max(0, Math.min(block.from, doc.content.size));
  const safeTo = Math.max(safeFrom, Math.min(block.to, doc.content.size));
  let from = block.from;
  let to = block.to;
  let isFullListItem = false;

  try {
    const $from = doc.resolve(safeFrom);
    const nodeAfter = $from.nodeAfter;
    if (nodeAfter?.type.name === 'list_item' && to > from) {
      from = safeFrom;
      to = safeFrom + nodeAfter.nodeSize;
      isFullListItem = true;
    } else {
      const imageRange = resolveStandaloneImageBlockRangeFromNode(
        safeFrom,
        safeTo,
        nodeAfter,
      );
      if (imageRange) {
        from = imageRange.from;
        to = imageRange.to;
      }
    }
  } catch {
  }

  const resolved = {
    range: { from, to },
    isFullListItem,
  };
  docCache.set(cacheKey, resolved);
  return resolved;
}

export function resolveBlockSelectionDisplayRange(
  doc: EditorState['doc'],
  block: BlockRange,
): BlockRange {
  return resolveBlockSelectionDisplayRangeInfo(doc, block).range;
}

export function resolveBlockSelectionDisplayRanges(
  doc: EditorState['doc'],
  blocks: readonly BlockRange[],
): BlockRange[] {
  return normalizeBlockRanges(blocks.map((block) => (
    resolveBlockSelectionDisplayRange(doc, block)
  )));
}

export function mapBlockRangesThroughTransaction(blocks: readonly BlockRange[], tr: Transaction): BlockRange[] {
  if (blocks.length === 0) return [];

  const mapped = blocks
    .map((block) => ({
      from: tr.mapping.map(block.from, 1),
      to: tr.mapping.map(block.to, -1),
    }))
    .filter((block) => block.to > block.from);

  return normalizeBlockRanges(mapped);
}
