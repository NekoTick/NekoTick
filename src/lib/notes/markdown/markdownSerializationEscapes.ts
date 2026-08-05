import { mapMarkdownOutsideProtectedBlocks, mapMarkdownOutsideProtectedSegments, } from './markdownProtectedBlocks';
import { containsAsciiCaseInsensitive } from './markdownSerializationAscii';
import { isUnpairedMarkdownDelimiterRun } from './markdownDelimiterRuns';
import {
  ESCAPED_LESS_THAN_PATTERN,
  ESCAPED_URL_SCHEME_PATTERN,
  EMAIL_ADDRESS_SOURCE,
  FAST_NORMALIZATION_MIN_LENGTH,
  FAST_NORMALIZATION_STRUCTURAL_LINE_PATTERN,
  MARKDOWN_AUTOLINK_LITERAL_PATTERN,
  MARKDOWN_ESCAPE_PATTERN,
  MARKDOWN_SPACE_ENTITY_PATTERN,
  REDUNDANT_PAIRED_MARKER_ESCAPES,
  UTF8_BOM
} from './markdownSerializationShared';
const GFM_EMAIL_TOKEN_PATTERN = new RegExp(EMAIL_ADDRESS_SOURCE, 'i');

export function stripLeadingBom(text: string): string {
  return text.startsWith(UTF8_BOM) ? text.slice(1) : text;
}

export function canUseLargePlainMarkdownNormalizationFastPath(text: string): boolean {
  if (text.length < FAST_NORMALIZATION_MIN_LENGTH) return false;
  if (
    text.includes('\r') ||
    text.includes('\\') ||
    text.includes('<') ||
    text.includes('\u200B') ||
    text.includes('\u200C') ||
    text.includes('\u2800') ||
    text.includes('\u0000VLAINA_') ||
    text.includes('VLAINA_') ||
    text.includes('vlaina-') ||
    text.includes('｜') ||
    text.includes('＞') ||
    text.includes('＃') ||
    text.includes('－') ||
    text.includes('＊') ||
    text.includes('＋') ||
    text.includes('、') ||
    text.includes('．') ||
    text.includes('（') ||
    text.includes('）') ||
    text.includes('［') ||
    text.includes('］') ||
    text.includes('【') ||
    text.includes('】') ||
    text.includes('•') ||
    text.includes('‣') ||
    text.includes('◦') ||
    text.includes('ｘ') ||
    text.includes('Ｘ') ||
    text.includes('✓') ||
    text.includes('✔') ||
    text.includes('√') ||
    containsAsciiCaseInsensitive(text, '](mailto:') ||
    MARKDOWN_SPACE_ENTITY_PATTERN.test(text)
  ) {
    return false;
  }

  let lineStart = 0;
  let previousLineWasPlainText = false;
  for (let index = 0; index <= text.length; index += 1) {
    if (index < text.length && text[index] !== '\n') {
      continue;
    }

    const line = text.slice(lineStart, index);
    const trimmed = line.trim();
    lineStart = index + 1;

    if (trimmed.length === 0) {
      previousLineWasPlainText = false;
      continue;
    }

    if (FAST_NORMALIZATION_STRUCTURAL_LINE_PATTERN.test(line)) {
      return false;
    }

    if (previousLineWasPlainText) {
      return false;
    }
    previousLineWasPlainText = true;
  }

  return true;
}

export function unescapeMarkdownPunctuation(text: string): string {
  if (!text.includes('\\')) return text;

  return mapMarkdownOutsideProtectedBlocks(text, (line) => line.replace(MARKDOWN_ESCAPE_PATTERN, '$1'));
}

export function normalizeRedundantMarkdownEscapes(text: string): string {
  if (!text.includes('\\')) return text;

  return mapMarkdownOutsideProtectedSegments(text, (segment) =>
    normalizeRedundantMarkdownEscapesInSegment(segment)
  );
}

export function normalizeRedundantMarkdownEscapesInSegment(segment: string): string {
  let output = '';
  for (let index = 0; index < segment.length; index += 1) {
    const char = segment[index];
    const escaped = segment[index + 1];
    if (char === '\\' && escaped && isRedundantMarkdownEscape(segment, index, escaped)) {
      output += escaped;
      index += 1;
      continue;
    }
    output += char;
  }
  return output;
}

export function isRedundantMarkdownEscape(segment: string, slashIndex: number, escaped: string): boolean {
  if (escaped === '_') {
    return isRedundantUnderscoreEscape(segment, slashIndex)
      || isUnpairedMarkdownDelimiterRun(segment, slashIndex, escaped);
  }
  if (escaped === '[') {
    if (isEscapedAbbreviationDefinitionBracket(segment, slashIndex)) return false;
    return isRedundantOpeningBracketEscape(segment, slashIndex);
  }
  if (escaped === '#') {
    return isRedundantHeadingMarkerEscape(segment, slashIndex);
  }
  if (escaped === '$') {
    return countMarkerRunsInParagraph(segment, slashIndex, escaped) === 1;
  }
  if (escaped === '&') {
    return isRedundantAmpersandEscape(segment, slashIndex);
  }
  if (escaped === '@') {
    return isRedundantAtSignEscape(segment, slashIndex);
  }
  if (escaped === '`') {
    return countMarkerRunsInParagraph(segment, slashIndex, escaped) === 1;
  }
  if (escaped === '*' && isEscapedAbbreviationDefinitionMarker(segment, slashIndex)) {
    return false;
  }
  if (REDUNDANT_PAIRED_MARKER_ESCAPES.has(escaped)) {
    return isUnpairedMarkdownDelimiterRun(segment, slashIndex, escaped);
  }
  return false;
}

export function isRedundantUnderscoreEscape(segment: string, slashIndex: number): boolean {
  const previous = segment[slashIndex - 1];
  const next = segment[slashIndex + 2];
  return isNonWhitespace(previous)
    && isNonWhitespace(next)
    && (isUnicodeLetterOrNumber(previous) || isUnicodeLetterOrNumber(next));
}

export function isRedundantOpeningBracketEscape(segment: string, slashIndex: number): boolean {
  return isNonWhitespace(segment[slashIndex - 1])
    || segment.indexOf(']', slashIndex + 2) === -1;
}

export function isRedundantAmpersandEscape(segment: string, slashIndex: number): boolean {
  if (isInsideMarkdownLinkDestination(segment, slashIndex)) return false;
  return !/^(?:#[0-9]+;|#[xX][0-9A-Fa-f]+;|[A-Za-z][A-Za-z0-9]+;)/.test(segment.slice(slashIndex + 2));
}

function isInsideMarkdownLinkDestination(segment: string, slashIndex: number): boolean {
  const prefix = segment.slice(segment.lastIndexOf('\n', slashIndex - 1) + 1, slashIndex);
  const destinationStart = prefix.lastIndexOf('](');
  return destinationStart !== -1 && !prefix.slice(destinationStart + 2).includes(')');
}

export function isRedundantAtSignEscape(segment: string, slashIndex: number): boolean {
  const { start, end } = getNonWhitespaceTokenBounds(segment, slashIndex);
  const candidate = `${segment.slice(start, slashIndex)}@${segment.slice(slashIndex + 2, end)}`;
  return !GFM_EMAIL_TOKEN_PATTERN.test(candidate);
}

export function isEscapedAbbreviationDefinitionMarker(segment: string, slashIndex: number): boolean {
  const { line, offset } = getLineAtIndex(segment, slashIndex);
  return /^[ \t]*$/.test(line.slice(0, offset))
    && /^\\\*\\?\[[^\]\n]+]:(?=\s|$)/.test(line.slice(offset));
}

export function isEscapedAbbreviationDefinitionBracket(segment: string, slashIndex: number): boolean {
  const { line, offset } = getLineAtIndex(segment, slashIndex);
  return /^[ \t]*\\\*$/.test(line.slice(0, offset))
    && /^\\\[[^\]\n]+]:(?=\s|$)/.test(line.slice(offset));
}

export function isRedundantHeadingMarkerEscape(segment: string, slashIndex: number): boolean {
  const lineStart = segment.lastIndexOf('\n', slashIndex - 1) + 1;
  if (segment.slice(lineStart, slashIndex).trim().length > 0) return false;

  let markerEnd = slashIndex + 1;
  while (segment[markerEnd] === '#') {
    markerEnd += 1;
  }
  const afterMarker = segment[markerEnd];
  return Boolean(afterMarker && afterMarker !== ' ' && afterMarker !== '\t' && afterMarker !== '\n');
}

export function isSingleMarkerRunInCurrentTextToken(
  segment: string,
  slashIndex: number,
  marker: string
): boolean {
  const { start, end } = getNonWhitespaceTokenBounds(segment, slashIndex);
  return countMarkerRunsInRange(segment, marker, start, end) === 1;
}

export function countMarkerRunsInParagraph(segment: string, index: number, marker: string): number {
  const start = segment.lastIndexOf('\n\n', index - 1) + 1;
  const end = segment.indexOf('\n\n', index);
  return countMarkerRunsInRange(segment, marker, start, end === -1 ? segment.length : end);
}

export function countMarkerRunsInRange(
  segment: string,
  marker: string,
  start: number,
  end: number
): number {
  let inRun = false;
  let runCount = 0;

  for (let index = start; index < end; index += 1) {
    const isEscapedMarker = segment[index] === '\\' && segment[index + 1] === marker;
    const isMarker = isEscapedMarker || segment[index] === marker;
    if (isMarker) {
      if (!inRun) runCount += 1;
      inRun = true;
      if (isEscapedMarker) index += 1;
      continue;
    }
    inRun = false;
  }

  return runCount;
}

export function getNonWhitespaceTokenBounds(segment: string, index: number): { start: number; end: number } {
  let start = index;
  while (start > 0 && isNonWhitespace(segment[start - 1])) {
    start -= 1;
  }

  let end = index;
  while (end < segment.length && isNonWhitespace(segment[end])) {
    end += 1;
  }

  return { start, end };
}

export function getLineAtIndex(segment: string, index: number): { line: string; offset: number } {
  const lineStart = segment.lastIndexOf('\n', index - 1) + 1;
  const nextLineBreak = segment.indexOf('\n', index);
  const lineEnd = nextLineBreak === -1 ? segment.length : nextLineBreak;
  return {
    line: segment.slice(lineStart, lineEnd),
    offset: index - lineStart,
  };
}

export function isNonWhitespace(value: string | undefined): value is string {
  return value !== undefined && !/\s/u.test(value);
}

export function isUnicodeLetterOrNumber(value: string | undefined): boolean {
  return value !== undefined && /[\p{L}\p{N}]/u.test(value);
}

export function normalizeEscapedAngleBracketText(text: string): string {
  if (!text.includes('\\<')) return text;

  return mapMarkdownOutsideProtectedSegments(text, (segment) =>
    segment.replace(ESCAPED_LESS_THAN_PATTERN, '$1<')
  );
}

export function normalizeEscapedUrlSchemes(text: string): string {
  if (!text.includes('\\:')) return text;

  return mapMarkdownOutsideProtectedSegments(text, (segment) =>
    segment.replace(ESCAPED_URL_SCHEME_PATTERN, '$1:')
  );
}

export function normalizeMarkdownAutolinkLiterals(text: string): string {
  if (!text.includes('<') || !text.includes('>')) return text;

  return mapMarkdownOutsideProtectedSegments(text, (segment) =>
    segment.replace(MARKDOWN_AUTOLINK_LITERAL_PATTERN, '$1')
  );
}
