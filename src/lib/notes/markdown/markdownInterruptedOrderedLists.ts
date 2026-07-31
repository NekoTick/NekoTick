import { mapMarkdownOutsideProtectedSegments } from './markdownProtectedBlocks';

const ORDERED_LIST_MARKER_PATTERN =
  /^((?: {0,3}>[ \t]?)*)([ ]{0,3})(\d{1,9})(\\?)([.)])(?:[ \t]+|$)/;
const ANY_LIST_MARKER_PATTERN = /^\s*(?:[-+*]|\d{1,9}[.)])(?:[ \t]+|$)/;
const BLOCK_START_PATTERN =
  /^\s{0,3}(?:#{1,6}[ \t]+|[-+*][ \t]+|\d{1,9}[.)][ \t]+|>[ \t]+|```|~~~|\$\$[ \t]*$|\\\[|\[\\|\[[ \t]*$|\[\^[^\]]+\]:|[-*_]{3,}[ \t]*$|\|.+\|)/;

interface OrderedListMarker {
  blockquoteDepth: number;
  delimiter: '.' | ')';
  escaped: boolean;
  indent: string;
  number: number;
  prefix: string;
  slashIndex: number;
}

export function normalizeInterruptedOrderedListsForEditor(text: string): string {
  return normalizeInterruptedOrderedLists(text, false);
}

export function normalizeInterruptedOrderedListsForPaste(text: string): string {
  return normalizeInterruptedOrderedLists(text, true);
}

export function isBlockquoteInterruptedOrderedListBoundary(
  lines: readonly string[],
  index: number,
): boolean {
  const blankPrefix = /^\s*((?:>\s*)+)$/.exec(lines[index] ?? '')?.[1];
  if (!blankPrefix) return false;

  const depth = countBlockquoteMarkers(blankPrefix);
  const nextMarker = parseOrderedListMarker(lines[index + 1] ?? '');
  return nextMarker?.delimiter === '.'
    && nextMarker.number !== 1
    && nextMarker.blockquoteDepth === depth
    && isParagraphContinuationBeforeList(lines[index - 1] ?? '', depth);
}

function normalizeInterruptedOrderedLists(
  text: string,
  includeParenthesizedMarkers: boolean,
): string {
  return mapMarkdownOutsideProtectedSegments(text, (segment) =>
    normalizeInterruptedOrderedListSegment(segment, includeParenthesizedMarkers)
  );
}

function normalizeInterruptedOrderedListSegment(
  segment: string,
  includeParenthesizedMarkers: boolean,
): string {
  const lines = segment.split('\n');
  if (lines.length < 2) return segment;

  const output: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    const marker = parseOrderedListMarker(line);
    const previousLine = output[output.length - 1];

    if (marker?.escaped && marker.delimiter === '.') {
      const runEnd = findSequentialEscapedRunEnd(lines, index, marker);
      if (runEnd > index && !continuesEarlierEscapedRun(previousLine, marker)) {
        if (
          previousLine !== undefined
          && isParagraphContinuationBeforeList(previousLine, marker.blockquoteDepth)
        ) {
          output.push(createContainerBlankLine(marker));
        }
        for (; index <= runEnd; index += 1) {
          output.push(removeOrderedListMarkerEscape(lines[index] ?? ''));
        }
        index -= 1;
        continue;
      }
    }

    if (
      marker
      && !marker.escaped
      && (includeParenthesizedMarkers || marker.delimiter === '.')
      && marker.number > 1
      && previousLine !== undefined
      && isParagraphContinuationBeforeList(previousLine, marker.blockquoteDepth)
      && hasFollowingOrderedListRun(lines, index, marker)
    ) {
      output.push(createContainerBlankLine(marker));
    }

    output.push(line);
  }

  return output.join('\n');
}

function parseOrderedListMarker(line: string): OrderedListMarker | null {
  const match = ORDERED_LIST_MARKER_PATTERN.exec(line);
  if (!match) return null;

  const number = Number(match[3]);
  if (!Number.isSafeInteger(number)) return null;

  const containerPrefix = match[1] ?? '';
  const indent = match[2] ?? '';
  const digits = match[3] ?? '';

  return {
    blockquoteDepth: countBlockquoteMarkers(containerPrefix),
    delimiter: match[5] as '.' | ')',
    escaped: match[4] === '\\',
    indent,
    number,
    prefix: `${containerPrefix}${indent}`,
    slashIndex: containerPrefix.length + indent.length + digits.length,
  };
}

function isParagraphContinuationBeforeList(
  line: string,
  blockquoteDepth: number,
): boolean {
  const content = getBlockquoteContent(line, blockquoteDepth);
  if (content === null || content.trim().length === 0) return false;
  if (ANY_LIST_MARKER_PATTERN.test(content)) return false;
  return !BLOCK_START_PATTERN.test(content);
}

function hasFollowingOrderedListRun(
  lines: readonly string[],
  startIndex: number,
  firstMarker: OrderedListMarker,
): boolean {
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    if (line.trim().length === 0) continue;

    const marker = parseOrderedListMarker(line);
    if (!marker) {
      const content = getBlockquoteContent(line, firstMarker.blockquoteDepth);
      return content !== null && ANY_LIST_MARKER_PATTERN.test(content);
    }
    return !marker.escaped
      && marker.blockquoteDepth === firstMarker.blockquoteDepth
      && marker.indent === firstMarker.indent;
  }

  return false;
}

function findSequentialEscapedRunEnd(
  lines: readonly string[],
  startIndex: number,
  firstMarker: OrderedListMarker,
): number {
  let expectedNumber = firstMarker.number + 1;
  let end = startIndex;

  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const marker = parseOrderedListMarker(lines[index] ?? '');
    if (
      !marker?.escaped
      || marker.blockquoteDepth !== firstMarker.blockquoteDepth
      || marker.indent !== firstMarker.indent
      || marker.delimiter !== firstMarker.delimiter
      || marker.number !== expectedNumber
    ) {
      break;
    }
    end = index;
    expectedNumber += 1;
  }

  return end;
}

function continuesEarlierEscapedRun(
  previousLine: string | undefined,
  marker: OrderedListMarker,
): boolean {
  if (previousLine === undefined) return false;
  const previousMarker = parseOrderedListMarker(previousLine);
  return previousMarker?.escaped === true
    && previousMarker.blockquoteDepth === marker.blockquoteDepth
    && previousMarker.indent === marker.indent;
}

function removeOrderedListMarkerEscape(line: string): string {
  const marker = parseOrderedListMarker(line);
  if (!marker?.escaped) return line;
  return `${line.slice(0, marker.slashIndex)}${line.slice(marker.slashIndex + 1)}`;
}

function createContainerBlankLine(marker: OrderedListMarker): string {
  return marker.blockquoteDepth === 0 ? '' : marker.prefix.trimEnd();
}

function getBlockquoteContent(line: string, expectedDepth: number): string | null {
  const match = /^((?: {0,3}>[ \t]?)*)(.*)$/.exec(line);
  const prefix = match?.[1] ?? '';
  if (countBlockquoteMarkers(prefix) !== expectedDepth) return null;
  return match?.[2] ?? '';
}

function countBlockquoteMarkers(prefix: string): number {
  let count = 0;
  for (const character of prefix) {
    if (character === '>') count += 1;
  }
  return count;
}
