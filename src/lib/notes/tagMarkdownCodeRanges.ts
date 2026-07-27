import { MAX_EXCLUDED_RANGES } from './tagMarkdownRangeLimits';
import type { NoteMarkdownExcludedRange } from './tagMarkdownExcludedRanges';
import {
  isMarkdownLineInContainer,
  parseMarkdownContainerFenceCloseLine,
  parseMarkdownContainerFenceLine,
} from './markdown/markdownFenceProtectedLines';

interface ReadLineResult {
  line: string;
  contentEnd: number;
  nextStart: number;
  truncated: boolean;
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

function pushExcludedRange(ranges: NoteMarkdownExcludedRange[], range: NoteMarkdownExcludedRange): void {
  if (ranges.length >= MAX_EXCLUDED_RANGES) {
    return;
  }
  ranges.push(range);
}

export function collectFencedCodeRanges(content: string, ranges: NoteMarkdownExcludedRange[]): void {
  let lineStart = 0;

  while (lineStart < content.length && ranges.length < MAX_EXCLUDED_RANGES) {
    const openerLine = readLine(content, lineStart);
    const opener = parseFenceOpener(openerLine.line);
    if (!opener) {
      lineStart = openerLine.nextStart;
      continue;
    }

    const blockStart = lineStart;
    let blockEnd = openerLine.nextStart;
    lineStart = openerLine.nextStart;

    while (lineStart < content.length) {
      const currentLineStart = lineStart;
      const line = readLine(content, lineStart);
      if (!isMarkdownLineInContainer(line.line, opener)) {
        blockEnd = currentLineStart;
        break;
      }
      blockEnd = line.nextStart;
      lineStart = line.nextStart;
      if (parseMarkdownContainerFenceCloseLine(line.line, opener)) {
        break;
      }
    }

    pushExcludedRange(ranges, {
      from: blockStart,
      to: blockEnd,
    });
  }
}

function parseFenceOpener(line: string) {
  const fence = parseMarkdownContainerFenceLine(line);
  if (!fence || (fence.marker === '`' && line.indexOf('`', fence.infoStart) !== -1)) {
    return null;
  }
  return fence;
}

export function collectInlineCodeRanges(content: string, ranges: NoteMarkdownExcludedRange[]): void {
  let searchStart = 0;
  while (searchStart < content.length && ranges.length < MAX_EXCLUDED_RANGES) {
    const index = content.indexOf('`', searchStart);
    if (index < 0) break;
    const markerEnd = scanRepeatedChar(content, index, '`');
    const markerLength = markerEnd - index;
    searchStart = markerEnd;
    if (markerLength === 1 && content[index + 1] === '`') {
      continue;
    }
    const closeIndex = findClosingInlineCodeMarker(content, markerEnd, markerLength);
    if (closeIndex === -1 || rangeContainsNewline(content, markerEnd, closeIndex)) {
      continue;
    }
    pushExcludedRange(ranges, { from: index, to: closeIndex + markerLength });
    searchStart = closeIndex + markerLength;
  }
}

function findClosingInlineCodeMarker(content: string, start: number, markerLength: number): number {
  let searchStart = start;
  while (searchStart < content.length) {
    const index = content.indexOf('`', searchStart);
    if (index < 0) return -1;
    const markerEnd = scanRepeatedChar(content, index, '`');
    if (markerEnd - index === markerLength) {
      return index;
    }
    searchStart = markerEnd;
  }

  return -1;
}

function rangeContainsNewline(content: string, from: number, to: number): boolean {
  const newlineIndex = content.indexOf('\n', from);
  return newlineIndex >= 0 && newlineIndex < to;
}

export function collectAutolinkRanges(content: string, ranges: NoteMarkdownExcludedRange[]): void {
  const pattern = /<(?:(?:https?:|mailto:)[^<>\s]*|[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+)>/g;
  let match: RegExpExecArray | null;
  while (ranges.length < MAX_EXCLUDED_RANGES && (match = pattern.exec(content)) !== null) {
    pushExcludedRange(ranges, { from: match.index, to: match.index + match[0].length });
  }
}

function scanRepeatedChar(content: string, start: number, character: string): number {
  let index = start;
  while (content[index] === character) {
    index += 1;
  }
  return index;
}
