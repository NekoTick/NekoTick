import {
  getNoteMarkdownExcludedRanges,
  isEscaped,
  isNoteMarkdownIndexExcluded,
  type NoteMarkdownExcludedRange,
} from './tagMarkdownExcludedRanges';

const MAX_NOTE_TAG_TOKEN_CHARS = 128;
const MAX_NOTE_TAG_OCCURRENCES = 2000;
const MAX_NOTE_TAG_MATCHES = 10_000;

const TAG_PATTERN = /(?<![\p{L}\p{N}_/-])#([\p{L}\p{N}_/-][\p{L}\p{N}_/-]{0,127})/gu;
const TAG_BODY_CHARACTER_PATTERN = /^[\p{L}\p{N}_/-]$/u;
const HEX_COLOR_PATTERN = /^(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

export interface NoteTagOccurrence {
  tag: string;
  token: string;
  index: number;
  matchOrdinal: number;
}

export type { NoteMarkdownExcludedRange };
export { getNoteMarkdownExcludedRanges, isNoteMarkdownIndexExcluded };

export function isNoteTagToken(value: string): boolean {
  return !HEX_COLOR_PATTERN.test(value);
}

function isOverlongTagToken(content: string, tokenEnd: number): boolean {
  const nextCharacter = content[tokenEnd] ?? '';
  return nextCharacter.length > 0 && TAG_BODY_CHARACTER_PATTERN.test(nextCharacter);
}

function addTokenPrefixes(prefixCounts: Map<string, number>, normalizedToken: string): void {
  for (let length = 1; length <= normalizedToken.length; length += 1) {
    const prefix = normalizedToken.slice(0, length);
    prefixCounts.set(prefix, (prefixCounts.get(prefix) ?? 0) + 1);
  }
}

export function extractNoteTagOccurrences(
  content: string,
  excludedRanges = getNoteMarkdownExcludedRanges(content),
): NoteTagOccurrence[] {
  const occurrences: NoteTagOccurrence[] = [];
  const tokenPrefixCounts = new Map<string, number>();
  let excludedRangeCursor = 0;
  let visibleMatches = 0;

  TAG_PATTERN.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = TAG_PATTERN.exec(content)) !== null) {
    while (
      excludedRangeCursor < excludedRanges.length &&
      excludedRanges[excludedRangeCursor].to <= match.index
    ) {
      excludedRangeCursor += 1;
    }
    const currentExcludedRange = excludedRanges[excludedRangeCursor];
    if (
      currentExcludedRange &&
      currentExcludedRange.to === content.length &&
      match.index >= currentExcludedRange.from
    ) {
      break;
    }

    const token = match[0];
    if (
      token.length > MAX_NOTE_TAG_TOKEN_CHARS + 1 ||
      isOverlongTagToken(content, match.index + token.length)
    ) {
      continue;
    }

    const excluded = isEscaped(content, match.index)
      || isNoteMarkdownIndexExcluded(match.index, excludedRanges, excludedRangeCursor);
    if (!excluded) {
      visibleMatches += 1;
      if (visibleMatches > MAX_NOTE_TAG_MATCHES || occurrences.length >= MAX_NOTE_TAG_OCCURRENCES) {
        break;
      }
    }

    const normalizedToken = token.toLocaleLowerCase();
    const matchOrdinal = tokenPrefixCounts.get(normalizedToken) ?? 0;
    addTokenPrefixes(tokenPrefixCounts, normalizedToken);

    if (excluded) {
      continue;
    }

    const tag = match[1]?.trim();
    if (tag && isNoteTagToken(tag)) {
      occurrences.push({
        tag: tag.toLocaleLowerCase(),
        token,
        index: match.index,
        matchOrdinal,
      });
    }
  }

  return occurrences;
}

export function extractNoteTags(content: string): string[] {
  const tags = new Set<string>();

  for (const occurrence of extractNoteTagOccurrences(content)) {
    tags.add(occurrence.tag);
  }

  return Array.from(tags);
}
