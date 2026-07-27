import { getMarkdownBlockContent } from '@/lib/markdown/markdownHtmlBlockClassification';
import {
  areDifferentListStyleLines,
  findPreviousListItemAtSameDepth,
} from './markdownBlankLineBoundaries';
import { isMarkdownImageOnlyLine } from './markdownImageLine';
import { mapMarkdownOutsideProtectedSegments } from './markdownProtectedBlocks';
import { containsAsciiCaseInsensitive } from './markdownSerializationAscii';
import {
  HTML_CLOSING_RENDERED_BLOCK_PATTERN,
  HTML_COMMENT_CLOSE_PATTERN,
  HTML_COMMENT_OPEN_PATTERN,
  HTML_IMAGE_LINE_PATTERN,
  HTML_ONE_LINE_RENDERED_BLOCK_PATTERN, HTML_ONE_LINE_RENDERED_VOID_BLOCK_PATTERN,
  INTERNAL_MARKDOWN_BLANK_LINE_COMMENT_PATTERN,
  INTERNAL_TIGHT_HEADING_COMMENT_PATTERN,
  LIST_GAP_SENTINEL,
  BLANK_TERMINATED_NON_EDITABLE_HTML_TAG_NAMES,
  NON_EDITABLE_HTML_BOUNDARY_TAG_NAMES,
  RENDERED_HTML_BOUNDARY_BLANK_LINE_COMMENT_PATTERN
} from './markdownSerializationShared';

const BLOCKQUOTE_INTERNAL_MARKDOWN_BLANK_LINE_COMMENT_PATTERN =
  /^(\s*(?:>\s*)+)<!--\s*vlaina-markdown-blank-line\s*-->\s*$/i;

export function normalizeInternalMarkdownBlankLineComments(text: string): string {
  if (
    !containsAsciiCaseInsensitive(text, 'vlaina-markdown-blank-line')
    && !containsAsciiCaseInsensitive(text, 'vlaina-rendered-html-boundary-blank-line')
  ) return text;

  const afterRenderedHtmlBoundaryHelpers = normalizeRenderedHtmlBoundaryHelperComments(text);
  return mapMarkdownOutsideProtectedSegments(
    afterRenderedHtmlBoundaryHelpers,
    (segment, startIndex, lines) =>
      normalizeInternalMarkdownBlankLineCommentSegment(segment, startIndex, lines),
    { protectHtmlComments: false },
  );
}

export function normalizeRenderedHtmlBoundaryHelperComments(text: string): string {
  if (!containsAsciiCaseInsensitive(text, 'vlaina-rendered-html-boundary-blank-line')) return text;

  return mapMarkdownOutsideProtectedSegments(
    text,
    (segment, startIndex, lines) =>
      normalizeRenderedHtmlBoundaryHelperCommentSegment(segment, startIndex, lines),
    { protectHtmlBlocks: false, protectHtmlComments: false },
  );
}

export function normalizeRenderedHtmlBoundaryHelperCommentSegment(
  text: string,
  startIndex: number,
  allLines: readonly string[],
): string {
  const lines = text.split('\n');
  let changed = false;
  const output: string[] = [];
  let activeHtmlComment = false;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    if (activeHtmlComment || isMultiLineHtmlCommentOpenLine(line)) {
      output.push(line);
      activeHtmlComment = shouldKeepHtmlCommentProtectionActive(activeHtmlComment, line);
      continue;
    }

    if (!RENDERED_HTML_BOUNDARY_BLANK_LINE_COMMENT_PATTERN.test(line)) {
      output.push(line);
      continue;
    }

    const previousBoundaryLine =
      findNearestPreviousNonBlankOutputLine(output)
      ?? findNearestPreviousNonBlankInputLine(allLines, startIndex + index - 1);
    if (isRenderedHtmlBlockBoundaryLine(previousBoundaryLine)) {
      changed = true;
      const hadLocalBlankBeforeHelper = output.length > 0 && output[output.length - 1]?.trim() === '';
      const hadInputBlankBeforeHelper = (allLines[startIndex + index - 1] ?? '').trim() === '';
      while (output.length > 0 && output[output.length - 1]?.trim() === '') {
        output.pop();
      }
      if (hadLocalBlankBeforeHelper || !hadInputBlankBeforeHelper) {
        output.push('');
      }
    } else {
      output.push(line);
      continue;
    }

    while (index + 1 < lines.length && (lines[index + 1] ?? '').trim() === '') {
      index += 1;
    }
  }

  return changed ? output.join('\n') : text;
}

export function findNearestPreviousNonBlankInputLine(lines: readonly string[], startIndex: number): string | null {
  for (let index = startIndex; index >= 0; index -= 1) {
    const line = lines[index] ?? '';
    if (line.trim() !== '') return line;
  }
  return null;
}

export function findNearestPreviousNonBlankOutputLine(lines: readonly string[]): string | null {
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index] ?? '';
    if (line.trim() !== '') return line;
  }
  return null;
}

export function isRenderedHtmlBlockBoundaryLine(line: string | null): boolean {
  if (line === null) return false;
  const boundaryLine = line.replace(/^(\s*)\\(?=<\/)/, '$1');

  const match = HTML_ONE_LINE_RENDERED_BLOCK_PATTERN.exec(boundaryLine)
    ?? HTML_ONE_LINE_RENDERED_VOID_BLOCK_PATTERN.exec(boundaryLine);
  const closingTagName = HTML_CLOSING_RENDERED_BLOCK_PATTERN.exec(boundaryLine)?.[1]?.toLowerCase();
  const tagName = match?.[1]?.toLowerCase() ?? closingTagName ?? getHtmlStartTagName(boundaryLine);
  return Boolean(tagName && !NON_EDITABLE_HTML_BOUNDARY_TAG_NAMES.has(tagName));
}

export function getHtmlStartTagName(line: string): string | null {
  const match = /^(?: {0,3})<([A-Za-z][A-Za-z0-9-]*)(?:\s|>|\/>)/.exec(line);
  return match?.[1]?.toLowerCase() ?? null;
}

export function normalizeInternalMarkdownBlankLineCommentSegment(
  segment: string,
  startIndex = 0,
  allLines: readonly string[] = segment.split('\n'),
): string {
  const lines = segment.split('\n');
  const output: string[] = [];
  let previousWasInternalBlankLine = false;
  let activeHtmlComment = false;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    const blockquoteInternalBlankLineMatch =
      BLOCKQUOTE_INTERNAL_MARKDOWN_BLANK_LINE_COMMENT_PATTERN.exec(line);
    if (blockquoteInternalBlankLineMatch) {
      const prefix = (blockquoteInternalBlankLineMatch[1] ?? '>').trimEnd();
      const depth = countBlockquoteMarkers(prefix);
      if (!previousWasInternalBlankLine) {
        while (
          output.length > 0
          && isSerializerBlankAroundBlockquoteComment(output[output.length - 1] ?? '', depth)
        ) {
          output.pop();
        }
      }
      output.push(prefix);
      previousWasInternalBlankLine = true;
      while (
        index + 1 < lines.length
        && isSerializerBlankAroundBlockquoteComment(lines[index + 1] ?? '', depth)
      ) {
        index += 1;
      }
      continue;
    }

    if (activeHtmlComment || isMultiLineHtmlCommentOpenLine(line)) {
      output.push(line);
      activeHtmlComment = shouldKeepHtmlCommentProtectionActive(activeHtmlComment, line);
      continue;
    }

    if (!INTERNAL_MARKDOWN_BLANK_LINE_COMMENT_PATTERN.test(line)) {
      output.push(line);
      if (line.trim() !== '') {
        previousWasInternalBlankLine = false;
      }
      continue;
    }

    if (!previousWasInternalBlankLine && !hasStructuralBlankAfterImage(output)) {
      const previousBoundaryLine = findNearestPreviousNonBlankOutputLine(output)
        ?? findNearestPreviousNonBlankInputLine(allLines, startIndex + index - 1);
      const closingTagName = previousBoundaryLine === null
        ? null
        : HTML_CLOSING_RENDERED_BLOCK_PATTERN.exec(previousBoundaryLine)?.[1]?.toLowerCase();
      if (!closingTagName || !BLANK_TERMINATED_NON_EDITABLE_HTML_TAG_NAMES.has(closingTagName)) {
        while (output.length > 0 && output[output.length - 1]?.trim() === '') {
          output.pop();
        }
      }
    }

    const nextBoundaryLine = findNearestNonInternalBlankLine(lines, index, 1);
    const previousBoundaryLine = nextBoundaryLine === null
      ? findNearestNonInternalBlankLine(lines, index, -1)
      : findPreviousListItemAtSameDepth(lines, index, nextBoundaryLine)
        ?? findNearestNonInternalBlankLine(lines, index, -1);
    output.push(
      areDifferentListStyleLines(previousBoundaryLine, nextBoundaryLine)
        ? LIST_GAP_SENTINEL
        : ''
    );
    previousWasInternalBlankLine = true;

    while (index + 1 < lines.length && (lines[index + 1] ?? '').trim() === '') {
      index += 1;
    }
  }

  return output.join('\n');
}

function isSerializerBlankAroundBlockquoteComment(line: string, depth: number): boolean {
  if (line.trim() === '') return true;
  if (!/^\s*(?:>\s*)+$/.test(line)) return false;
  return countBlockquoteMarkers(line) === depth;
}

function countBlockquoteMarkers(line: string): number {
  let count = 0;
  for (const character of line) {
    if (character === '>') count += 1;
  }
  return count;
}

function findNearestNonInternalBlankLine(
  lines: readonly string[],
  startIndex: number,
  direction: -1 | 1,
): string | null {
  for (let index = startIndex + direction; index >= 0 && index < lines.length; index += direction) {
    const line = lines[index] ?? '';
    if (line.trim() === '' || INTERNAL_MARKDOWN_BLANK_LINE_COMMENT_PATTERN.test(line)) continue;
    return line;
  }
  return null;
}

export function hasStructuralBlankAfterImage(lines: readonly string[]): boolean {
  if ((lines[lines.length - 1] ?? '').trim() !== '') return false;

  for (let index = lines.length - 2; index >= 0; index -= 1) {
    const line = lines[index] ?? '';
    if (line.trim() === '') continue;
    return HTML_IMAGE_LINE_PATTERN.test(line) || isMarkdownImageOnlyLine(line);
  }

  return false;
}

export function isMultiLineHtmlCommentOpenLine(line: string): boolean {
  return isHtmlCommentOpenLine(line) && !isHtmlCommentCloseLine(line);
}

export function isHtmlCommentOpenLine(line: string): boolean {
  return HTML_COMMENT_OPEN_PATTERN.test(getMarkdownBlockContent(line));
}

export function isHtmlCommentCloseLine(line: string): boolean {
  return HTML_COMMENT_CLOSE_PATTERN.test(getMarkdownBlockContent(line));
}

export function shouldKeepHtmlCommentProtectionActive(wasActive: boolean, line: string): boolean {
  if (wasActive && isInternalEditorCommentLine(line)) {
    return true;
  }
  return !isHtmlCommentCloseLine(line);
}

export function isInternalEditorCommentLine(line: string): boolean {
  return INTERNAL_MARKDOWN_BLANK_LINE_COMMENT_PATTERN.test(line)
    || RENDERED_HTML_BOUNDARY_BLANK_LINE_COMMENT_PATTERN.test(line)
    || INTERNAL_TIGHT_HEADING_COMMENT_PATTERN.test(line);
}
