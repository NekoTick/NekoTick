import { isMarkdownImageOnlyLine } from './markdownImageLine';
import {
  parseMarkdownContainerFenceLine,
  parseMarkdownContainerLinePrefix,
} from './markdownFenceProtectedLines';

const LIST_ITEM_MARKER_PATTERN =
  /^(\s*(?:>\s*)*)(?:[-+*]|\d+[.)])(?:\s+(?:\[(?: |x|X)\](?:\s+|$))?|$)/;
const LIST_ITEM_STYLE_PATTERN =
  /^(?:\s*(?:>\s*)*)(?:(\d+)[.)]|[-+*])(?:\s+(\[(?: |x|X)\](?:\s+|$))?|$)/;
const TABLE_DELIMITER_ROW_PATTERN =
  /^\s*\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)+\|?\s*$/;
const TABLE_ROW_PATTERN = /^\s*\|.*\|\s*$/;
const THEMATIC_BREAK_PATTERN = /^(?: {0,3})(?:(?:[-*_][ \t]*){3,})$/;
const HTML_COMMENT_CLOSE_PATTERN = /-->\s*$/;
const HTML_ONE_LINE_BLOCK_PATTERN =
  /^(?: {0,3})(?:<\?.*\?>|<![A-Za-z][^>]*>|<!\[CDATA\[[\s\S]*\]\]>)[ \t]*$/;
const HTML_BLOCK_TAG_PATTERN =
  /^(?: {0,3})<\/?(?:address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h1|h2|h3|h4|h5|h6|head|header|hr|html|iframe|img|legend|li|link|main|menu|menuitem|nav|noframes|ol|optgroup|option|p|param|search|section|source|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul)(?:\s|\/?>|$)/i;
const ALIGNMENT_COMMENT_PATTERN = /^<!--\s*align:(?:left|center|right)\s*-->$/;
const HTML_IMAGE_LINE_PATTERN = /^(?: {0,3})<img(?:\s|\/?>|$)/i;
const REFERENCE_DEFINITION_PATTERN = /^\s{0,3}\[[^\]]+]:\s+\S+/;
const FOOTNOTE_DEFINITION_PATTERN = /^\s{0,3}\[\^[^\]]+]:/;
const DEFINITION_LIST_MARKER_PATTERN = /^\s{0,3}:\s+\S/;

export function isListBoundaryBlankLine(lines: readonly string[], index: number): boolean {
  if (lines[index]?.trim() !== '') return false;

  const previous = findNearestNonBlankLine(lines, index, -1);
  const next = findNearestNonBlankLine(lines, index, 1);
  if (!previous || !next) return false;

  return LIST_ITEM_MARKER_PATTERN.test(previous) || LIST_ITEM_MARKER_PATTERN.test(next);
}

export function isEditableListBoundaryBlankLine(lines: readonly string[], index: number): boolean {
  if (lines[index]?.trim() !== '') return false;

  const previous = findNearestNonBlankLine(lines, index, -1);
  const next = findNearestNonBlankLine(lines, index, 1);
  if (!previous || !next) return false;

  const previousIsListItem = isListItemLine(previous);
  const nextIsListItem = isListItemLine(next);
  if (areDifferentBlockquoteDepths(previous, next)) return true;
  if (previousIsListItem && nextIsListItem) {
    return isDifferentListStyleBoundaryBlankLine(lines, index);
  }
  if (!previousIsListItem && !nextIsListItem) return false;

  const nonListLine = previousIsListItem ? next : previous;
  return !isIndentedListContinuationLine(nonListLine);
}

export function isDifferentListStyleBoundaryBlankLine(
  lines: readonly string[],
  index: number,
): boolean {
  if (lines[index]?.trim() !== '') return false;

  const previous = findNearestNonBlankLine(lines, index, -1);
  const next = findNearestNonBlankLine(lines, index, 1);
  if (areDifferentListStyleLines(previous, next)) return true;
  if (next === null) return false;

  return areDifferentListStyleLines(
    findPreviousListItemAtSameDepth(lines, index, next),
    next,
  );
}

export function areDifferentListStyleLines(
  previous: string | null,
  next: string | null,
): boolean {
  if (!isListItemLine(previous) || !isListItemLine(next)) return false;

  return getListItemPrefix(previous) === getListItemPrefix(next)
    && getListItemStyle(previous) !== getListItemStyle(next);
}

export function findPreviousListItemAtSameDepth(
  lines: readonly string[],
  startIndex: number,
  referenceLine: string,
): string | null {
  const referencePrefix = getListItemPrefix(referenceLine);
  if (referencePrefix === null) return null;

  for (let index = startIndex - 1; index >= 0; index -= 1) {
    const line = lines[index] ?? '';
    if (
      line.trim() === ''
      || /^\s*<!--\s*vlaina-markdown-blank-line\s*-->\s*$/i.test(line)
    ) {
      continue;
    }

    const prefix = getListItemPrefix(line);
    if (prefix === referencePrefix) return line;
    if (prefix !== null && prefix.startsWith(referencePrefix)) continue;
    if (isIndentedListContinuationAtDepth(line, referencePrefix)) continue;
    return null;
  }

  return null;
}

export function isBetweenListItemsBlankLine(lines: readonly string[], index: number): boolean {
  if (lines[index]?.trim() !== '') return false;

  const previous = findNearestNonBlankLine(lines, index, -1);
  const next = findNearestNonBlankLine(lines, index, 1);
  if (!previous || !next) return false;

  const previousListContext = getListItemPrefix(previous);
  const nextListContext = getListItemPrefix(next);
  if (nextListContext === null) return false;
  if (
    previousListContext !== null
    && isNestedListContext(previousListContext, nextListContext)
  ) {
    return true;
  }

  const previousAtSameDepth = previousListContext === nextListContext
    ? previous
    : findPreviousListItemAtSameDepth(lines, index, next);
  return previousAtSameDepth !== null
    && getListItemStyle(previousAtSameDepth) === getListItemStyle(next);
}

export function isIndentedCodeBoundaryBlankLine(lines: readonly string[], index: number): boolean {
  if (lines[index]?.trim() !== '') return false;

  const previous = findNearestNonBlankLine(lines, index, -1);
  const next = findNearestNonBlankLine(lines, index, 1);
  return /^(?: {4,}|\t)/.test(previous ?? '')
    || /^(?: {4,}|\t)/.test(next ?? '');
}

export function isFencedCodeBoundaryBlankLine(lines: readonly string[], index: number): boolean {
  if (lines[index]?.trim() !== '') return false;

  const next = findNearestNonBlankLine(lines, index, 1);
  return isValidFencedCodeOpener(next);
}

export function isTableBoundaryBlankLine(lines: readonly string[], index: number): boolean {
  if (lines[index]?.trim() !== '') return false;

  const previousIndex = findNearestNonBlankLineIndex(lines, index, -1);
  const nextIndex = findNearestNonBlankLineIndex(lines, index, 1);
  return isTableStartAt(lines, nextIndex) || isTableRowInTable(lines, previousIndex);
}

export function isThematicBreakBoundaryBlankLine(lines: readonly string[], index: number): boolean {
  if (lines[index]?.trim() !== '') return false;

  const previous = findNearestNonBlankLine(lines, index, -1);
  const next = findNearestNonBlankLine(lines, index, 1);
  return isThematicBreakLine(previous) || isThematicBreakLine(next);
}

export function isHtmlCommentBoundaryBlankLine(lines: readonly string[], index: number): boolean {
  if (lines[index]?.trim() !== '') return false;

  const previous = findNearestNonBlankLine(lines, index, -1);
  return previous !== null && HTML_COMMENT_CLOSE_PATTERN.test(previous);
}

export function isHtmlBlockBoundaryBlankLine(lines: readonly string[], index: number): boolean {
  if (lines[index]?.trim() !== '') return false;

  const previous = findNearestNonBlankLine(lines, index, -1);
  const next = findNearestNonBlankLine(lines, index, 1);
  return isHtmlBlockLine(previous) || isHtmlBlockLine(next);
}

export function isHtmlImageStructuralBoundaryBlankLine(lines: readonly string[], index: number): boolean {
  if (lines[index]?.trim() !== '') return false;

  const previousIndex = findNearestNonBlankLineIndex(lines, index, -1);
  const nextIndex = findNearestNonBlankLineIndex(lines, index, 1);
  const previous = previousIndex === null ? null : lines[previousIndex] ?? '';
  const next = nextIndex === null ? null : lines[nextIndex] ?? '';

  return (isHtmlImageLine(previous) && isAdjacentBlankToNonBlank(lines, index, previousIndex, 1))
    || (isHtmlImageLine(next) && isAdjacentBlankToNonBlank(lines, index, nextIndex, -1));
}

export function isMarkdownImageStructuralBoundaryBlankLine(lines: readonly string[], index: number): boolean {
  if (lines[index]?.trim() !== '') return false;

  const previousIndex = findNearestNonBlankLineIndex(lines, index, -1);
  const nextIndex = findNearestNonBlankLineIndex(lines, index, 1);
  const previous = previousIndex === null ? null : lines[previousIndex] ?? '';
  const next = nextIndex === null ? null : lines[nextIndex] ?? '';

  return (isMarkdownImageLine(previous) && isAdjacentBlankToNonBlank(lines, index, previousIndex, 1))
    || (isMarkdownImageLine(next) && isAdjacentBlankToNonBlank(lines, index, nextIndex, -1));
}

export function isAlignmentCommentBoundaryBlankLine(lines: readonly string[], index: number): boolean {
  if (lines[index]?.trim() !== '') return false;

  const previous = findNearestNonBlankLine(lines, index, -1);
  const next = findNearestNonBlankLine(lines, index, 1);
  return isAlignmentCommentLine(previous) || isAlignmentCommentLine(next);
}

export function isMarkdownImageBoundaryBlankLine(lines: readonly string[], index: number): boolean {
  if (lines[index]?.trim() !== '') return false;

  const previous = findNearestNonBlankLine(lines, index, -1);
  const next = findNearestNonBlankLine(lines, index, 1);
  return isMarkdownImageLine(previous) || isMarkdownImageLine(next);
}

export function isReferenceDefinitionBoundaryBlankLine(lines: readonly string[], index: number): boolean {
  if (lines[index]?.trim() !== '') return false;

  const previous = findNearestNonBlankLine(lines, index, -1);
  const next = findNearestNonBlankLine(lines, index, 1);
  return isReferenceDefinitionLine(previous) || isReferenceDefinitionLine(next);
}

export function isDefinitionListBoundaryBlankLine(lines: readonly string[], index: number): boolean {
  if (lines[index]?.trim() !== '') return false;

  const next = findNearestNonBlankLine(lines, index, 1);
  return isDefinitionListMarkerLine(next);
}

export function isIndentedContinuationBoundaryBlankLine(lines: readonly string[], index: number): boolean {
  if (lines[index]?.trim() !== '') return false;

  const previous = findNearestNonBlankLine(lines, index, -1);
  const next = findNearestNonBlankLine(lines, index, 1);
  if (next === null || !/^(?: {2,}|\t)/.test(next)) return false;

  return isListItemLine(previous)
    || isFootnoteDefinitionLine(previous)
    || /^(?: {2,}|\t)/.test(previous ?? '');
}

function isTableStartAt(lines: readonly string[], index: number | null): boolean {
  if (index === null) return false;
  return TABLE_ROW_PATTERN.test(lines[index] ?? '')
    && TABLE_DELIMITER_ROW_PATTERN.test(lines[index + 1] ?? '');
}

function isTableRowInTable(lines: readonly string[], index: number | null): boolean {
  if (index === null || !TABLE_ROW_PATTERN.test(lines[index] ?? '')) return false;
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const line = lines[cursor] ?? '';
    if (line.trim() === '') return false;
    if (TABLE_DELIMITER_ROW_PATTERN.test(line)) {
      return cursor > 0 && TABLE_ROW_PATTERN.test(lines[cursor - 1] ?? '');
    }
  }
  return false;
}

function findNearestNonBlankLine(
  lines: readonly string[],
  startIndex: number,
  direction: -1 | 1,
): string | null {
  const index = findNearestNonBlankLineIndex(lines, startIndex, direction);
  return index === null ? null : lines[index] ?? '';
}

function findNearestNonBlankLineIndex(
  lines: readonly string[],
  startIndex: number,
  direction: -1 | 1,
): number | null {
  for (let index = startIndex + direction; index >= 0 && index < lines.length; index += direction) {
    const line = lines[index] ?? '';
    if (line.trim() !== '') return index;
  }
  return null;
}

function getListItemPrefix(line: string): string | null {
  const match = LIST_ITEM_MARKER_PATTERN.exec(line);
  return match ? match[1] ?? '' : null;
}

function getListItemStyle(line: string): 'ordered' | 'ordered-task' | 'unordered' | 'unordered-task' | null {
  const match = LIST_ITEM_STYLE_PATTERN.exec(line);
  if (!match) return null;

  const ordered = match[1] !== undefined;
  const task = match[2] !== undefined;
  return ordered
    ? task ? 'ordered-task' : 'ordered'
    : task ? 'unordered-task' : 'unordered';
}

export function isAlignmentCommentLine(line: string | null): boolean {
  return line !== null && ALIGNMENT_COMMENT_PATTERN.test(line.trim());
}

function isHtmlImageLine(line: string | null): boolean {
  return line !== null && HTML_IMAGE_LINE_PATTERN.test(line);
}

function isMarkdownImageLine(line: string | null): boolean {
  return isMarkdownImageOnlyLine(line);
}

function isReferenceDefinitionLine(line: string | null): boolean {
  return line !== null && REFERENCE_DEFINITION_PATTERN.test(line);
}

function isFootnoteDefinitionLine(line: string | null): boolean {
  return line !== null && FOOTNOTE_DEFINITION_PATTERN.test(line);
}

function isDefinitionListMarkerLine(line: string | null): boolean {
  return line !== null && DEFINITION_LIST_MARKER_PATTERN.test(line);
}

function isListItemLine(line: string | null): line is string {
  return line !== null && LIST_ITEM_MARKER_PATTERN.test(line);
}

function isIndentedListContinuationLine(line: string): boolean {
  return /^(?: {2,}|\t)/.test(line);
}

function areDifferentBlockquoteDepths(left: string, right: string): boolean {
  const leftContainer = parseMarkdownContainerLinePrefix(left);
  const rightContainer = parseMarkdownContainerLinePrefix(right);
  return leftContainer !== null
    && rightContainer !== null
    && leftContainer.blockquoteDepth !== rightContainer.blockquoteDepth;
}

function isNestedListContext(parentPrefix: string, childPrefix: string): boolean {
  if (!childPrefix.startsWith(parentPrefix)) return false;
  return /^(?:[ \t]+)$/.test(childPrefix.slice(parentPrefix.length));
}

function isIndentedListContinuationAtDepth(line: string, prefix: string): boolean {
  if (!line.startsWith(prefix)) return false;
  return /^(?: {2,}|\t)/.test(line.slice(prefix.length));
}

function isAdjacentBlankToNonBlank(
  lines: readonly string[],
  blankIndex: number,
  nonBlankIndex: number | null,
  directionFromNonBlankToBlank: -1 | 1,
): boolean {
  if (nonBlankIndex === null) return false;

  const adjacentIndex = nonBlankIndex + directionFromNonBlankToBlank;
  return adjacentIndex === blankIndex
    && adjacentIndex >= 0
    && adjacentIndex < lines.length
    && (lines[adjacentIndex] ?? '').trim() === '';
}

function isValidFencedCodeOpener(line: string | null): boolean {
  if (line === null) return false;
  const fence = parseMarkdownContainerFenceLine(line);
  return fence !== null
    && (fence.marker !== '`' || line.indexOf('`', fence.infoStart) === -1);
}

function isHtmlBlockLine(line: string | null): boolean {
  return line !== null
    && (HTML_ONE_LINE_BLOCK_PATTERN.test(line) || HTML_BLOCK_TAG_PATTERN.test(line));
}

function isThematicBreakLine(line: string | null): boolean {
  return line !== null && THEMATIC_BREAK_PATTERN.test(line);
}
