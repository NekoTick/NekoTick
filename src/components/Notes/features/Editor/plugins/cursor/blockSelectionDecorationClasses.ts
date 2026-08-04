import type { EditorState } from '@milkdown/kit/prose/state';
import { COMPLEX_LIST_ITEM_CHILD_NODE_NAMES } from '../shared/blockNodeTypes';
import type { BlockRange } from './blockSelectionTypes';
import { getBlockRangeKey } from './blockSelectionRanges';

interface ContainedListChildSelection {
  itemFrom: number;
  itemTo: number;
}

export interface BlockSelectionDecorationContext {
  displayRangeKeys: ReadonlySet<string>;
  hasNextDisplayRangeKeys: ReadonlySet<string>;
  hasPreviousDisplayRangeKeys: ReadonlySet<string>;
}

export const LARGE_BLOCK_SELECTION_DECORATION_CLASS = 'editor-block-selected md-focus editor-block-selected-large-item';
export const LARGE_TEXTLIKE_BLOCK_SELECTION_DECORATION_CLASS =
  `${LARGE_BLOCK_SELECTION_DECORATION_CLASS} editor-block-selected-large-textlike`;
export const LARGE_RICH_BLOCK_SELECTION_DECORATION_CLASS =
  `${LARGE_BLOCK_SELECTION_DECORATION_CLASS} editor-block-selected-large-rich`;
export const LARGE_INLINE_LINE_SELECTION_MARKER_CLASS = 'editor-block-selected editor-block-selected-inline-line editor-block-selection-line-marker';

const RICH_BLOCK_SELECTION_NODE_NAMES = new Set([
  'code_block',
  'frontmatter',
  'image',
  'math_block',
  'mermaid',
  'table',
  'video',
]);
const NON_RICH_HTML_BLOCK_VALUES = new Set([
  '<!--vlaina-markdown-blank-line-->',
  '<!--vlaina-rendered-html-boundary-blank-line-->',
  '<!--vlaina-markdown-tight-heading-->',
]);
const NON_RENDERING_HTML_COMMENT_PATTERN = /^<!--(?:(?!-->)[\s\S])*-->$/;
const NON_RENDERING_HTML_PROCESSING_INSTRUCTION_PATTERN = /^<\?(?:(?!\?>)[\s\S])*\?>$/;
const NON_RENDERING_HTML_DECLARATION_PATTERN = /^<![A-Za-z][^>]*>$/;
const NON_RENDERING_HTML_CDATA_PATTERN = /^<!\[CDATA\[(?:(?!\]\]>)[\s\S])*\]\]>$/;

const PARENT_MARKER_SELECTION_NODE_NAMES = new Set([
  'blockquote',
  'list_item',
]);

function nodeHasDirectChildType(node: EditorState['doc'], childTypeName: string): boolean {
  const childCount = typeof node.childCount === 'number' ? node.childCount : 0;
  for (let index = 0; index < childCount; index += 1) {
    if (node.child(index)?.type.name === childTypeName) {
      return true;
    }
  }
  return false;
}

export function getBlockSelectionStructuralClass(
  doc: EditorState['doc'],
  range: BlockRange,
  isNodeRange: boolean,
): string {
  if (!isNodeRange) return '';

  const safeFrom = Math.max(0, Math.min(range.from, doc.content.size));
  try {
    const nodeAfter = doc.resolve(safeFrom).nodeAfter;
    if (!nodeAfter) return '';
    if (nodeAfter.type.name === 'hr') {
      return 'editor-block-selected-hr-wrapper';
    }
    if (nodeAfter.type.name === 'list_item' && nodeHasDirectChildType(nodeAfter, 'code_block')) {
      return 'editor-block-selected-has-direct-code-block';
    }
    if (nodeAfter.type.name === 'paragraph' && nodeHasDirectChildType(nodeAfter, 'image')) {
      return 'editor-block-selected-has-direct-image';
    }
  } catch {
  }

  return '';
}

function resolveContainedListChildSelection(
  doc: EditorState['doc'],
  range: BlockRange,
): ContainedListChildSelection | null {
  const safeFrom = Math.max(0, Math.min(range.from, doc.content.size));

  try {
    const $from = doc.resolve(safeFrom);
    const nodeAfter = $from.nodeAfter;
    if (!nodeAfter || !COMPLEX_LIST_ITEM_CHILD_NODE_NAMES.has(nodeAfter.type.name)) {
      return null;
    }

    for (let depth = $from.depth; depth >= 0; depth -= 1) {
      const node = $from.node(depth);
      if (node.type.name !== 'list_item') continue;

      const itemFrom = $from.before(depth);
      return {
        itemFrom,
        itemTo: itemFrom + node.nodeSize,
      };
    }
  } catch {
  }

  return null;
}

export function getBlockSelectionDecorationClass(
  doc: EditorState['doc'],
  range: BlockRange,
  displayRanges: readonly BlockRange[],
  context?: BlockSelectionDecorationContext,
): string {
  const containedSelection = resolveContainedListChildSelection(doc, range);
  if (!containedSelection) return 'editor-block-selected md-focus';

  const selectedContainerKey = getBlockRangeKey(containedSelection.itemFrom, containedSelection.itemTo);
  const hasSelectedContainer = context
    ? context.displayRangeKeys.has(selectedContainerKey)
    : displayRanges.some((candidate) => getBlockRangeKey(candidate.from, candidate.to) === selectedContainerKey);

  return hasSelectedContainer
    ? 'editor-block-selected md-focus editor-block-selected-contained'
    : 'editor-block-selected md-focus';
}

export function isNodeDecorationRange(doc: EditorState['doc'], range: BlockRange): boolean {
  const safeFrom = Math.max(0, Math.min(range.from, doc.content.size));
  try {
    const nodeAfter = doc.resolve(safeFrom).nodeAfter;
    return Boolean(nodeAfter && !nodeAfter.isText && safeFrom + nodeAfter.nodeSize === range.to);
  } catch {
    return false;
  }
}

export function resolveParentMarkerDecorationRanges(
  doc: EditorState['doc'],
  range: BlockRange,
  selectedRangeKeys: ReadonlySet<string>,
): BlockRange[] {
  const safeFrom = Math.max(0, Math.min(range.from, doc.content.size));
  const result: BlockRange[] = [];

  try {
    const $from = doc.resolve(safeFrom);
    for (let depth = $from.depth; depth > 0; depth -= 1) {
      const node = $from.node(depth);
      if (!PARENT_MARKER_SELECTION_NODE_NAMES.has(node.type.name)) {
        continue;
      }
      if (node.type.name === 'list_item' && !isListItemHeadSelection(node, $from.before(depth), range)) {
        continue;
      }

      const from = $from.before(depth);
      const to = from + node.nodeSize;
      if (selectedRangeKeys.has(getBlockRangeKey(from, to))) {
        continue;
      }
      result.push({ from, to });
    }
  } catch {
  }

  return result;
}

function isListItemHeadSelection(
  listItem: EditorState['doc'],
  itemFrom: number,
  range: BlockRange,
): boolean {
  const firstChild = listItem.firstChild;
  if (!firstChild) return false;

  const firstChildFrom = itemFrom + 1;
  const firstChildTo = firstChildFrom + firstChild.nodeSize;
  return range.from >= firstChildFrom && range.from < firstChildTo;
}

export function isTextLikeDecorationRange(doc: EditorState['doc'], range: BlockRange, isNodeRange: boolean): boolean {
  if (!isNodeRange) return true;

  const safeFrom = Math.max(0, Math.min(range.from, doc.content.size));
  try {
    const nodeAfter = doc.resolve(safeFrom).nodeAfter;
    if (!nodeAfter) return true;
    return !isRichBlockSelectionNode(nodeAfter);
  } catch {
    return true;
  }
}

function isRichBlockSelectionNode(node: EditorState['doc']): boolean {
  if (node.type.name !== 'html_block') {
    return RICH_BLOCK_SELECTION_NODE_NAMES.has(node.type.name);
  }

  const value = typeof node.attrs?.value === 'string'
    ? node.attrs.value
    : node.textContent;
  const trimmed = value.trim();
  if (!trimmed || NON_RICH_HTML_BLOCK_VALUES.has(trimmed)) return false;
  if (NON_RENDERING_HTML_COMMENT_PATTERN.test(trimmed)) return false;
  if (NON_RENDERING_HTML_PROCESSING_INSTRUCTION_PATTERN.test(trimmed)) return false;
  if (NON_RENDERING_HTML_DECLARATION_PATTERN.test(trimmed)) return false;
  if (NON_RENDERING_HTML_CDATA_PATTERN.test(trimmed)) return false;
  return true;
}

function isHardBreakNodeName(name: string): boolean {
  return name === 'hardbreak' || name === 'hard_break';
}

export function trimTrailingHardBreakFromInlineRange(
  doc: EditorState['doc'],
  range: BlockRange,
): BlockRange | null {
  const safeTo = Math.max(0, Math.min(range.to, doc.content.size));
  if (safeTo <= range.from) return range;

  try {
    const nodeBefore = doc.resolve(safeTo).nodeBefore;
    if (!nodeBefore || !isHardBreakNodeName(nodeBefore.type.name)) {
      return range;
    }

    const to = safeTo - nodeBefore.nodeSize;
    if (to <= range.from) return null;
    return { from: range.from, to };
  } catch {
    return range;
  }
}
