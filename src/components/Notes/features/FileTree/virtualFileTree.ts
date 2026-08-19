import type { FileTreeNode } from '@/stores/useNotesStore';
import { themeFileTreeTokens } from '@/styles/themeTokens';

export interface VirtualFileTreeRow {
  node: FileTreeNode;
  depth: number;
  parentFolderPath: string;
}

export const VIRTUAL_FILE_TREE_ROW_HEIGHT = 38;
export const VIRTUAL_FILE_TREE_ROW_LINE_HEIGHT = 20;
export const VIRTUAL_FILE_TREE_ROW_BASE_VISIBLE_CHARS = 8;
export const VIRTUAL_FILE_TREE_OVERSCAN_ROWS = 10;
export const VIRTUAL_FILE_TREE_MIN_ROWS = 180;
const MAX_DERIVED_FILE_TREE_ROWS = 20_000;
const visibleCharacterCountCache = new WeakMap<
  FileTreeNode,
  { name: string; count: number }
>();

function getVisibleCharacterCount(node: FileTreeNode): number {
  const cached = visibleCharacterCountCache.get(node);
  if (cached?.name === node.name) {
    return cached.count;
  }

  const count = Array.from(node.name).length;
  visibleCharacterCountCache.set(node, { name: node.name, count });
  return count;
}

export function estimateVirtualFileTreeRowHeight(
  row: VirtualFileTreeRow,
  availableWidth?: number,
): number {
  const availableCharactersPerLine = availableWidth && availableWidth > 0
    ? Math.max(
        4,
        Math.floor(
          (
            availableWidth
            - themeFileTreeTokens.virtualRowHorizontalChromePx
            - row.depth * themeFileTreeTokens.virtualRowDepthIndentPx
          ) / themeFileTreeTokens.virtualRowAverageCharacterWidthPx,
        ),
      )
    : Math.max(4, VIRTUAL_FILE_TREE_ROW_BASE_VISIBLE_CHARS - row.depth * 2);
  const lineCount = Math.max(
    1,
    Math.ceil(getVisibleCharacterCount(row.node) / availableCharactersPerLine),
  );

  return VIRTUAL_FILE_TREE_ROW_HEIGHT + (lineCount - 1) * VIRTUAL_FILE_TREE_ROW_LINE_HEIGHT;
}

export function buildVirtualFileTreeRowOffsets(rowHeights: readonly number[]): number[] {
  const offsets: number[] = [0];
  for (let index = 0; index < rowHeights.length; index += 1) {
    offsets[index + 1] = offsets[index] + rowHeights[index];
  }

  return offsets;
}

function findFirstRowEndingAfter(
  offsets: readonly number[],
  rowHeights: readonly number[],
  rowCount: number,
  target: number,
  fallbackRowHeight: number,
) {
  let low = 0;
  let high = rowCount;

  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    const height = rowHeights[mid] ?? fallbackRowHeight;
    if ((offsets[mid] ?? 0) + height > target) {
      high = mid;
    } else {
      low = mid + 1;
    }
  }

  return low;
}

function findFirstOffsetAtOrAfter(
  offsets: readonly number[],
  rowCount: number,
  target: number,
) {
  let low = 0;
  let high = rowCount;

  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if ((offsets[mid] ?? 0) >= target) {
      high = mid;
    } else {
      low = mid + 1;
    }
  }

  return low;
}

export function flattenVisibleFileTreeRows(
  nodes: FileTreeNode[],
  startDepth = 0,
  parentFolderPath = '',
): VirtualFileTreeRow[] {
  const rows: VirtualFileTreeRow[] = [];
  const stack: Array<{ depth: number; node: FileTreeNode; parentPath: string }> = [];

  for (let index = nodes.length - 1; index >= 0; index -= 1) {
    stack.push({ depth: startDepth, node: nodes[index], parentPath: parentFolderPath });
  }

  while (stack.length > 0 && rows.length < MAX_DERIVED_FILE_TREE_ROWS) {
    const { depth, node, parentPath } = stack.pop()!;
    rows.push({
      node,
      depth,
      parentFolderPath: parentPath,
    });

    if (node.isFolder && node.expanded && node.children.length > 0) {
      for (let index = node.children.length - 1; index >= 0; index -= 1) {
        stack.push({ depth: depth + 1, node: node.children[index], parentPath: node.path });
      }
    }
  }

  return rows;
}

export function countVisibleFileTreeRows(nodes: FileTreeNode[]): number {
  let count = 0;
  const stack = [...nodes].reverse();

  while (stack.length > 0 && count < MAX_DERIVED_FILE_TREE_ROWS) {
    const node = stack.pop()!;
    count += 1;

    if (node.isFolder && node.expanded && node.children.length > 0) {
      for (let index = node.children.length - 1; index >= 0; index -= 1) {
        stack.push(node.children[index]);
      }
    }
  }

  return count;
}

export function getVirtualFileTreeWindow(input: {
  rowCount: number;
  rowHeight: number;
  rowHeights?: readonly number[];
  rowOffsets?: readonly number[];
  viewportStart: number;
  viewportHeight: number;
  overscanRows: number;
}) {
  const normalizedViewportStart = Math.max(0, input.viewportStart);
  const rowHeights = input.rowHeights;
  const offsets = input.rowOffsets;
  if (rowHeights?.length === input.rowCount && offsets?.length === input.rowCount + 1) {
    const viewportEnd = normalizedViewportStart + input.viewportHeight;
    const visibleStartIndex = findFirstRowEndingAfter(
      offsets,
      rowHeights,
      input.rowCount,
      normalizedViewportStart,
      input.rowHeight,
    );
    const visibleEndIndex = findFirstOffsetAtOrAfter(offsets, input.rowCount, viewportEnd);
    const startIndex = Math.max(0, visibleStartIndex - input.overscanRows);
    const endIndex = Math.min(input.rowCount, visibleEndIndex + input.overscanRows);

    return {
      startIndex,
      endIndex,
      offsetTop: offsets[startIndex] ?? 0,
      totalHeight: offsets[input.rowCount] ?? 0,
    };
  }

  const visibleStartIndex = Math.floor(normalizedViewportStart / input.rowHeight);
  const visibleEndIndex = Math.ceil((normalizedViewportStart + input.viewportHeight) / input.rowHeight);
  const startIndex = Math.max(0, visibleStartIndex - input.overscanRows);
  const endIndex = Math.min(input.rowCount, visibleEndIndex + input.overscanRows);

  return {
    startIndex,
    endIndex,
    offsetTop: startIndex * input.rowHeight,
    totalHeight: input.rowCount * input.rowHeight,
  };
}
