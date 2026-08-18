import { stripMarkdownInline } from '@/components/common/markdown/plainText';
import {
  collectHtmlTagRanges,
  type ContentRange,
} from '@/lib/markdown/markdownHtmlRanges';
import { getHtmlCommentRanges } from '@/lib/markdown/markdownRanges';
import { decodeMarkdownHtmlText } from '@/lib/notes/markdown/markdownHtmlText';
import { getSkippedRangesForContentSearch } from './notesSidebarContentSkipRanges';
import { MAX_CONTENT_SEARCH_SCANNED_CHARS } from './notesSidebarContentSearchLimits';

export {
  MAX_CONTENT_SEARCH_HTML_RANGES,
  MAX_CONTENT_SEARCH_SCANNED_CHARS,
} from './notesSidebarContentSearchLimits';

const CONTENT_SNIPPET_RADIUS = 36;
const MAX_CONTENT_MATCHES_PER_NOTE = 5;
const MAX_CONTENT_SEARCH_LINE_CHARS = 64 * 1024;

export interface NotesSidebarContentMatch {
  matchIndex: number;
  snippet: string;
  ordinal: number;
}

function normalizeContentForSearch(content: string): string {
  return content.replace(/\s+/g, ' ').trim();
}

function normalizeSearchTextWithOffsets(value: string): {
  text: string;
  startOffsets: number[];
  endOffsets: number[];
} {
  let text = '';
  const startOffsets: number[] = [];
  const endOffsets: number[] = [0];

  for (let index = 0; index < value.length;) {
    const codePoint = value.codePointAt(index);
    const source = codePoint === undefined ? value[index] : String.fromCodePoint(codePoint);
    const sourceLength = source.length;
    const sourceEnd = index + sourceLength;
    const normalized = source.toLocaleLowerCase();
    const normalizedStart = text.length;

    for (let offset = 0; offset < normalized.length; offset += 1) {
      startOffsets[normalizedStart + offset] = index;
      endOffsets[normalizedStart + offset + 1] = sourceEnd;
    }

    text += normalized;
    index = sourceEnd;
  }

  startOffsets[text.length] = value.length;
  endOffsets[text.length] = value.length;

  return { text, startOffsets, endOffsets };
}

function stripInlineHtmlTags(line: string): string {
  if (!line.includes('<')) {
    return line;
  }

  const htmlTagScan = collectHtmlTagRanges(line, { start: 0, end: line.length });
  const ranges = [
    ...getHtmlCommentRanges(line, { start: 0, end: line.length }),
    ...htmlTagScan.ranges,
    ...htmlTagScan.protectedRanges,
  ].sort((left, right) => left.start - right.start || left.end - right.end);
  if (ranges.length === 0) {
    return line;
  }

  const parts: string[] = [];
  let cursor = 0;
  for (const range of ranges) {
    if (range.start < cursor) {
      cursor = Math.max(cursor, range.end);
      continue;
    }
    parts.push(line.slice(cursor, range.start));
    cursor = range.end;
  }
  parts.push(line.slice(cursor));
  return parts.join('');
}

function needsMarkdownPlainTextConversion(line: string): boolean {
  return line.includes('\\')
    || line.includes('`')
    || line.includes('*')
    || line.includes('_')
    || line.includes('~')
    || line.includes('^')
    || line.includes('==')
    || line.includes('++')
    || line.includes('<')
    || line.includes('>')
    || line.includes('&')
    || line.includes('[')
    || line.includes('#')
    || line.includes('|')
    || /^\s*(?:[-+]\s|\d+\.\s)/u.test(line);
}

function toPlainTextLine(line: string): string {
  if (!needsMarkdownPlainTextConversion(line)) {
    return line.replace(/\s+/g, ' ').trim();
  }

  return decodeMarkdownHtmlText(stripMarkdownInline(stripInlineHtmlTags(line), { preserveImageAlt: false }))
    .replace(/\[\[([^|\]]+)\|([^\]]+)\]\]/g, '$2')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/^\s*>\s*/g, '')
    .replace(/^\s*#{1,6}\s+/g, '')
    .replace(/^\s*[-*+]\s+\[(?: |x|X)\]\s+/g, '')
    .replace(/^\s*(?:[-*+]|\d+\.)\s+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

interface ContentSearchLine {
  end: number;
  nextStart: number;
  start: number;
  text: string;
}

interface PreparedContentSearchLine {
  lowerContent: string;
  normalizedContent: string;
}

export interface PreparedNotesSidebarContentSearch {
  content: string;
  lines?: PreparedContentSearchLine[];
  lowerContent?: string;
}

const preparedContentSearchByIdentity = new WeakMap<
  object,
  PreparedNotesSidebarContentSearch
>();

function* iterateLines(content: string): Iterable<ContentSearchLine> {
  let start = 0;
  for (let index = 0; index < content.length; index += 1) {
    const charCode = content.charCodeAt(index);
    if (charCode !== 10 && charCode !== 13) {
      continue;
    }

    yield {
      end: index,
      nextStart: charCode === 13 && content.charCodeAt(index + 1) === 10 ? index + 2 : index + 1,
      start,
      text: content.slice(start, index),
    };

    if (charCode === 13 && content.charCodeAt(index + 1) === 10) {
      index += 1;
    }
    start = index + 1;
  }

  yield {
    end: content.length,
    nextStart: content.length,
    start,
    text: content.slice(start),
  };
}

function advanceRangeIndex(ranges: readonly ContentRange[], lineStart: number, rangeIndex: number): number {
  let nextIndex = rangeIndex;
  while (nextIndex < ranges.length && ranges[nextIndex].end <= lineStart) {
    nextIndex += 1;
  }
  return nextIndex;
}

function isLineInRange(line: ContentSearchLine, range: ContentRange | undefined): boolean {
  if (!range) {
    return false;
  }

  const lineEnd = Math.max(line.end, line.start + 1);
  return range.start < lineEnd && range.end > line.start;
}

function normalizeSearchText(value: string): string {
  let text = '';
  for (const source of value) {
    text += source.toLocaleLowerCase();
  }
  return text;
}

function prepareContentSearchLines(content: string): PreparedContentSearchLine[] {
  const lines: PreparedContentSearchLine[] = [];
  const skippedRanges = getSkippedRangesForContentSearch(content);
  let skippedRangeIndex = 0;
  let scannedChars = 0;

  for (const line of iterateLines(content)) {
    if (scannedChars >= MAX_CONTENT_SEARCH_SCANNED_CHARS) {
      break;
    }

    const rawLine = line.text;
    scannedChars += Math.max(1, line.nextStart - line.start);
    if (rawLine.length > MAX_CONTENT_SEARCH_LINE_CHARS) {
      continue;
    }
    skippedRangeIndex = advanceRangeIndex(skippedRanges, line.start, skippedRangeIndex);
    if (isLineInRange(line, skippedRanges[skippedRangeIndex])) {
      continue;
    }

    const normalizedContent = normalizeContentForSearch(toPlainTextLine(rawLine));
    if (!normalizedContent) {
      continue;
    }
    lines.push({
      lowerContent: normalizeSearchText(normalizedContent),
      normalizedContent,
    });
  }

  return lines;
}

export function prepareNotesSidebarContentSearch(
  content: string,
  contentIdentity?: object,
): PreparedNotesSidebarContentSearch {
  if (!contentIdentity) {
    return { content };
  }

  const cached = preparedContentSearchByIdentity.get(contentIdentity);
  if (cached?.content === content) {
    return cached;
  }

  const prepared = { content };
  preparedContentSearchByIdentity.set(contentIdentity, prepared);
  return prepared;
}

export function getNotesSidebarContentMatches(
  content: string | undefined,
  lowerQuery: string,
  contentIdentity?: object,
): NotesSidebarContentMatch[] {
  if (!content || !lowerQuery) {
    return [];
  }
  const prepared = prepareNotesSidebarContentSearch(content, contentIdentity);
  prepared.lowerContent ??= content.toLocaleLowerCase();
  if (!content.includes('&') && !prepared.lowerContent.includes(lowerQuery)) {
    return [];
  }

  const matches: NotesSidebarContentMatch[] = [];
  prepared.lines ??= prepareContentSearchLines(content);
  let ordinal = 0;
  for (const line of prepared.lines) {
    const { lowerContent, normalizedContent } = line;
    let normalizedSearchContent: ReturnType<typeof normalizeSearchTextWithOffsets> | null = null;
    let searchFrom = 0;

    while (searchFrom <= lowerContent.length - lowerQuery.length) {
      const matchIndex = lowerContent.indexOf(lowerQuery, searchFrom);
      if (matchIndex === -1) {
        break;
      }

      normalizedSearchContent ??= normalizeSearchTextWithOffsets(normalizedContent);
      const sourceMatchIndex = normalizedSearchContent.startOffsets[matchIndex] ?? matchIndex;
      const sourceMatchEnd = normalizedSearchContent.endOffsets[matchIndex + lowerQuery.length] ?? normalizedContent.length;
      const start = Math.max(0, sourceMatchIndex - CONTENT_SNIPPET_RADIUS);
      const end = Math.min(
        normalizedContent.length,
        sourceMatchEnd + CONTENT_SNIPPET_RADIUS,
      );
      const snippet = normalizedContent.slice(start, end).trim();

      matches.push({
        matchIndex: sourceMatchIndex,
        snippet: `${start > 0 ? '…' : ''}${snippet}${end < normalizedContent.length ? '…' : ''}`,
        ordinal,
      });

      ordinal += 1;
      if (matches.length >= MAX_CONTENT_MATCHES_PER_NOTE) {
        return matches;
      }
      searchFrom = matchIndex + Math.max(lowerQuery.length, 1);
    }
  }

  return matches;
}
