import { isMarkdownImageOnlyLine } from './markdownImageLine';
import {
  parseMarkdownContainerFenceLine,
  parseMarkdownContainerLinePrefix,
} from './markdownFenceProtectedLines';
import { parseStandaloneMathBlockLine } from './markdownSerializationMathFences';

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
const ABBREVIATION_DEFINITION_PATTERN = /^\s{0,3}\*\[[^\]]+]:\s+\S/;
const ATX_HEADING_PATTERN = /^\s{0,3}#{1,6}(?:\s+|$)/;
const BLOCKQUOTE_PATTERN = /^\s{0,3}>/;
const DISPLAY_MATH_FENCE_PATTERN = /^\s*(?:\${2,}|\\\[|\\\])\s*$/;
const FENCED_CODE_PATTERN = /^\s{0,3}(?:`{3,}|~{3,})/;
const TOC_PATTERN = /^\s*\[TOC\]\s*$/;
const OBSIDIAN_IMAGE_EMBED_PATTERN = /^\s{0,3}!\[\[[^\]\n]+\]\]\s*$/;
const HTML_BLOCK_OPEN_PATTERN = /^\s{0,3}(?:<!--|<\?|<![A-Za-z]|<!\[CDATA\[)/i;
const RAW_TEXT_HTML_BLOCK_BOUNDARY_PATTERN =
  /^\s{0,3}<(?:script|pre|style|textarea)(?:\s|>)/i;
const SETEXT_HEADING_UNDERLINE_PATTERN = /^\s{0,3}(?:=+|-+)\s*$/;

type StableParseBoundarySide = 'after-previous' | 'before-next';

function getStableParseBoundarySide(
  lines: readonly string[],
  previousIndex: number,
  nextIndex: number,
): StableParseBoundarySide | null {
  const previous = lines[previousIndex] ?? '';
  const next = lines[nextIndex] ?? '';
  const previousNeedsParagraphSeparator = isParagraphListItemLine(previous)
    || isTrailingParagraphBlockquoteContent(previous)
    || FOOTNOTE_DEFINITION_PATTERN.test(previous)
    || isTrailingParagraphContainerContent(lines, previousIndex)
    || isTableRowInTable(lines, previousIndex)
    || isDefinitionListMarkerLine(previous)
    || isGeneratedBlockParagraphLine(previous);
  const previousNeedsTableSeparator = isParagraphListItemLine(previous)
    || isTrailingParagraphBlockquoteContent(previous)
    || FOOTNOTE_DEFINITION_PATTERN.test(previous)
    || isTableRowInTable(lines, previousIndex);
  if (
    (
      previousNeedsParagraphSeparator
      && isParagraphLikeBoundaryLine(lines, nextIndex)
    )
    || (
      previousNeedsTableSeparator
      && isTableStartAt(lines, nextIndex)
    )
  ) {
    return 'after-previous';
  }

  if (
    BLOCKQUOTE_PATTERN.test(previous)
    && BLOCKQUOTE_PATTERN.test(next)
  ) {
    return 'after-previous';
  }

  if (RAW_TEXT_HTML_BLOCK_BOUNDARY_PATTERN.test(next)) {
    return 'before-next';
  }

  const nextNeedsSeparator = isNonInterruptingListStartLine(next)
    || isThematicBreakLine(next)
    || beginsDefinitionListAt(lines, nextIndex)
    || isGeneratedBlockParagraphLine(next);
  if (
    isDefinitionListMarkerLine(previous)
    && nextNeedsSeparator
  ) {
    return 'after-previous';
  }
  return isParagraphLikeBoundaryLine(lines, previousIndex)
    && nextNeedsSeparator
    ? 'before-next'
    : null;
}

export function requiresStableParseBoundary(
  lines: readonly string[],
  previousIndex: number,
  nextIndex: number,
): boolean {
  return getStableParseBoundarySide(lines, previousIndex, nextIndex) !== null;
}

export function isStableParseBoundaryBlankLine(lines: readonly string[], index: number): boolean {
  if (lines[index]?.trim() !== '') return false;

  const previousIndex = findNearestNonBlankLineIndex(lines, index, -1);
  const nextIndex = findNearestNonBlankLineIndex(lines, index, 1);
  if (previousIndex === null || nextIndex === null) return false;

  const side = getStableParseBoundarySide(lines, previousIndex, nextIndex);
  return side === 'after-previous'
    ? previousIndex + 1 === index
    : side === 'before-next' && nextIndex - 1 === index;
}

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

function beginsDefinitionListAt(lines: readonly string[], termIndex: number): boolean {
  if (!isParagraphLikeBoundaryLine(lines, termIndex)) return false;
  const descriptionIndex = findNearestNonBlankLineIndex(lines, termIndex, 1);
  return descriptionIndex !== null && isDefinitionListMarkerLine(lines[descriptionIndex] ?? null);
}

function isGeneratedBlockParagraphLine(line: string): boolean {
  return TOC_PATTERN.test(line)
    || isMarkdownImageLine(line)
    || OBSIDIAN_IMAGE_EMBED_PATTERN.test(line);
}

function isNonInterruptingListStartLine(line: string): boolean {
  const match = /^\s{0,3}(?:([-+*])|(\d+)[.)])(?:[ \t]+(.*)|[ \t]*$)/.exec(line);
  if (!match) return false;

  const content = (match[3] ?? '').trim();
  return content.length === 0 || (match[2] !== undefined && Number(match[2]) !== 1);
}

function isParagraphLikeBoundaryLine(lines: readonly string[], index: number): boolean {
  const line = lines[index] ?? '';
  const trimmed = line.trim();
  if (trimmed.length === 0 || /^(?: {2,}|\t)/.test(line)) return false;
  if (isGeneratedBlockParagraphLine(line)) return true;

  return !ATX_HEADING_PATTERN.test(line)
    && !isSetextHeadingAt(lines, index)
    && !BLOCKQUOTE_PATTERN.test(line)
    && !isDisplayMathBlockLine(line)
    && !FENCED_CODE_PATTERN.test(line)
    && !HTML_BLOCK_OPEN_PATTERN.test(line)
    && !HTML_BLOCK_TAG_PATTERN.test(line)
    && !REFERENCE_DEFINITION_PATTERN.test(line)
    && !FOOTNOTE_DEFINITION_PATTERN.test(line)
    && !ABBREVIATION_DEFINITION_PATTERN.test(line)
    && !DEFINITION_LIST_MARKER_PATTERN.test(line)
    && !isListItemLine(line)
    && !isThematicBreakLine(line)
    && !isTableRowInTable(lines, index)
    && !isTableStartAt(lines, index);
}

function isSetextHeadingAt(lines: readonly string[], index: number): boolean {
  return SETEXT_HEADING_UNDERLINE_PATTERN.test(lines[index + 1] ?? '');
}

function isParagraphListItemLine(line: string): boolean {
  if (!isListItemLine(line)) return false;

  const match = /^(?:\s*(?:>\s*)*)(?:[-+*]|\d+[.)])(?:\s+\[(?: |x|X)\])?\s*(.*)$/.exec(line);
  const content = match?.[1] ?? '';
  if (content.length === 0) return true;

  return !ATX_HEADING_PATTERN.test(content)
    && !isDisplayMathBlockLine(content)
    && !FENCED_CODE_PATTERN.test(content)
    && !HTML_BLOCK_OPEN_PATTERN.test(content)
    && !HTML_BLOCK_TAG_PATTERN.test(content)
    && !isThematicBreakLine(content);
}

function isDisplayMathBlockLine(line: string): boolean {
  return DISPLAY_MATH_FENCE_PATTERN.test(line)
    || parseStandaloneMathBlockLine(line) !== null;
}

function isTrailingParagraphBlockquoteContent(line: string): boolean {
  const container = parseMarkdownContainerLinePrefix(line);
  if (!container || container.blockquoteDepth === 0) return false;

  const content = line.slice(container.markerStart);
  if (content.trim().length === 0) return true;
  if (isGeneratedBlockParagraphLine(content)) return true;

  return !ATX_HEADING_PATTERN.test(content)
    && !SETEXT_HEADING_UNDERLINE_PATTERN.test(content)
    && !isDisplayMathBlockLine(content)
    && !FENCED_CODE_PATTERN.test(content)
    && !HTML_BLOCK_OPEN_PATTERN.test(content)
    && !HTML_BLOCK_TAG_PATTERN.test(content)
    && !REFERENCE_DEFINITION_PATTERN.test(content)
    && !FOOTNOTE_DEFINITION_PATTERN.test(content)
    && !ABBREVIATION_DEFINITION_PATTERN.test(content)
    && !DEFINITION_LIST_MARKER_PATTERN.test(content)
    && !isThematicBreakLine(content)
    && !TABLE_ROW_PATTERN.test(content);
}

function isTrailingParagraphContainerContent(lines: readonly string[], startIndex: number): boolean {
  if (!/^(?: {2,}|\t)/.test(lines[startIndex] ?? '')) return false;

  for (let index = startIndex; index >= 0; index -= 1) {
    const line = lines[index] ?? '';
    if (line.trim() === '' || /^(?: {2,}|\t)/.test(line)) continue;
    if (isListItemLine(line)) return isParagraphListItemLine(line);
    return isFootnoteDefinitionLine(line) || isDefinitionListMarkerLine(line);
  }
  return false;
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
