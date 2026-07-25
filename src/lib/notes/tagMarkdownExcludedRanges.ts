import {
  collectHtmlTagRanges as collectMarkdownHtmlTagRanges,
  getRawTextHtmlRanges,
} from '../markdown/markdownHtmlRanges';
import { getHtmlCommentRanges, getMarkdownHtmlBlockRanges } from '../markdown/markdownRanges';
import {
  collectAutolinkRanges,
  collectFencedCodeRanges,
  collectInlineCodeRanges,
} from './tagMarkdownCodeRanges';
import { collectMarkdownLinkTargetRanges } from './tagMarkdownLinkTargets';
import {
  MAX_EXCLUDED_RANGES,
  MAX_FRONTMATTER_CHARS,
  MAX_FRONTMATTER_DELIMITER_LINE_CHARS,
  MAX_FRONTMATTER_LINES,
} from './tagMarkdownRangeLimits';

const UTF8_BOM = '\uFEFF';
const FRONTMATTER_DELIMITER_PATTERN = /^---[ \t]*$/;

export interface NoteMarkdownExcludedRange {
  from: number;
  to: number;
}

interface ReadLineResult {
  line: string;
  contentEnd: number;
  nextStart: number;
  truncated: boolean;
}

export function getNoteMarkdownExcludedRanges(
  content: string,
  options: { excludeFrontmatter?: boolean } = {},
): NoteMarkdownExcludedRange[] {
  const ranges: NoteMarkdownExcludedRange[] = [];
  if (options.excludeFrontmatter !== false) {
    const frontmatterEnd = getLeadingFrontmatterEnd(content);
    if (frontmatterEnd !== null) {
      ranges.push({ from: 0, to: frontmatterEnd });
    }
  }

  // Each scanner is independent; avoid a full pass when its opening marker is absent.
  if (content.includes('```') || content.includes('~~~')) {
    collectFencedCodeRanges(content, ranges);
  }
  if (content.includes('`')) {
    collectInlineCodeRanges(content, ranges);
  }
  if (content.includes('<')) {
    collectAutolinkRanges(content, ranges);
    collectRawTextHtmlRanges(content, ranges);
    collectMarkdownHtmlBlockRanges(content, ranges);
    collectHtmlTagRanges(content, ranges);
  }
  if (content.includes('](')) {
    collectMarkdownLinkTargetRanges(content, ranges);
  }

  ranges.sort((a, b) => a.from - b.from || a.to - b.to);

  if (ranges.length >= MAX_EXCLUDED_RANGES) {
    const lastRange = ranges[ranges.length - 1];
    if (lastRange) {
      lastRange.to = content.length;
    }
  }

  return ranges;
}

function readLine(value: string, start: number, maxContentEnd = value.length): ReadLineResult {
  let index = start;
  while (
    index < value.length &&
    index < maxContentEnd &&
    value[index] !== '\n' &&
    value[index] !== '\r'
  ) {
    index += 1;
  }

  let nextStart = index;
  const truncated = index >= maxContentEnd && index < value.length && value[index] !== '\n' && value[index] !== '\r';
  if (!truncated && index < value.length) {
    nextStart = value[index] === '\r' && value[index + 1] === '\n'
      ? index + 2
      : index + 1;
  }

  return {
    line: value.slice(start, index),
    contentEnd: index,
    nextStart,
    truncated,
  };
}

function getLeadingFrontmatterEnd(content: string): number | null {
  const firstLine = readLine(content, 0, MAX_FRONTMATTER_DELIMITER_LINE_CHARS + 1);
  const firstLineText = firstLine.line.startsWith(UTF8_BOM) ? firstLine.line.slice(1) : firstLine.line;
  if (firstLine.truncated || !FRONTMATTER_DELIMITER_PATTERN.test(firstLineText)) {
    return null;
  }

  let cursor = firstLine.nextStart;
  let lineCount = 0;
  const frontmatterBudgetEnd = firstLine.nextStart + MAX_FRONTMATTER_CHARS + 1;

  while (cursor < content.length && lineCount < MAX_FRONTMATTER_LINES) {
    const line = readLine(content, cursor, frontmatterBudgetEnd);
    if (line.truncated || line.contentEnd - firstLine.nextStart > MAX_FRONTMATTER_CHARS) {
      break;
    }

    if (FRONTMATTER_DELIMITER_PATTERN.test(line.line)) {
      return line.contentEnd;
    }

    lineCount += 1;
    cursor = line.nextStart;
  }

  return null;
}

export function pushExcludedRange(ranges: NoteMarkdownExcludedRange[], range: NoteMarkdownExcludedRange): void {
  if (ranges.length >= MAX_EXCLUDED_RANGES) {
    return;
  }
  ranges.push(range);
}

function collectRawTextHtmlRanges(content: string, ranges: NoteMarkdownExcludedRange[]): void {
  const remainingRanges = MAX_EXCLUDED_RANGES - ranges.length;
  if (remainingRanges <= 0) {
    return;
  }

  for (const range of getRawTextHtmlRanges(content, { start: 0, end: content.length }, remainingRanges)) {
    pushExcludedRange(ranges, { from: range.start, to: range.end });
    if (ranges.length >= MAX_EXCLUDED_RANGES) {
      return;
    }
  }
}

function collectMarkdownHtmlBlockRanges(content: string, ranges: NoteMarkdownExcludedRange[]): void {
  const remainingRanges = MAX_EXCLUDED_RANGES - ranges.length;
  if (remainingRanges <= 0) {
    return;
  }

  for (const range of getMarkdownHtmlBlockRanges(
    content,
    { start: 0, end: content.length },
    remainingRanges,
  )) {
    pushExcludedRange(ranges, { from: range.start, to: range.end });
    if (ranges.length >= MAX_EXCLUDED_RANGES) {
      return;
    }
  }
}

function collectHtmlTagRanges(content: string, ranges: NoteMarkdownExcludedRange[]): void {
  let remainingRanges = MAX_EXCLUDED_RANGES - ranges.length;
  if (remainingRanges <= 0) {
    return;
  }

  for (const range of getHtmlCommentRanges(content, { start: 0, end: content.length }, remainingRanges)) {
    pushExcludedRange(ranges, { from: range.start, to: range.end });
    if (ranges.length >= MAX_EXCLUDED_RANGES) {
      return;
    }
  }

  remainingRanges = MAX_EXCLUDED_RANGES - ranges.length;
  if (remainingRanges <= 0) {
    return;
  }

  const htmlTagScan = collectMarkdownHtmlTagRanges(content, { start: 0, end: content.length }, remainingRanges);
  const htmlTagRanges = [...htmlTagScan.ranges, ...htmlTagScan.protectedRanges]
    .sort((left, right) => left.start - right.start || left.end - right.end);
  for (const range of htmlTagRanges) {
    pushExcludedRange(ranges, { from: range.start, to: range.end });
    if (ranges.length >= MAX_EXCLUDED_RANGES) {
      return;
    }
  }
}

export function isEscaped(content: string, index: number): boolean {
  let slashCount = 0;
  for (let cursor = index - 1; cursor >= 0 && content[cursor] === '\\'; cursor -= 1) {
    slashCount += 1;
  }
  return slashCount % 2 === 1;
}

export function isNoteMarkdownIndexExcluded(index: number, ranges: readonly NoteMarkdownExcludedRange[], startAt = 0): boolean {
  for (let rangeIndex = startAt; rangeIndex < ranges.length; rangeIndex += 1) {
    const range = ranges[rangeIndex];
    if (index < range.from) {
      return false;
    }
    if (index < range.to) {
      return true;
    }
  }

  return false;
}
