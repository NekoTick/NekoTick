import { mapMarkdownOutsideProtectedSegments } from './markdownProtectedBlocks';
import { getMarkdownBlockContent } from '@/lib/markdown/markdownHtmlBlockClassification';
import {
  decodeMarkdownHtmlText,
  escapeMarkdownHtmlText,
} from './markdownHtmlText';
import { consumeLeadingCalloutEmoji } from './calloutEmoji';

const LIST_ITEM_MARKER_PATTERN = /^(?:\s*)(?:[-+*]|\d+[.)])\s+(?:\[(?: |x|X)\]\s+)?/;
const BLOCKQUOTE_LIST_ITEM_PATTERN = /^(?: {0,3})>[ \t]*(?:[-+*]|\d+[.)])\s+/;
const STRONG_TRAILING_INLINE_CODE_PATTERN = /(\*\*|__)([^\n`]*?\S)\s+(`[^`\n]+`)\1/g;
const CUSTOM_INLINE_HTML_TEXT_PATTERN =
  /<(sup|sub|u|mark)\b([^>]*)>([\s\S]*?)<\/\1>|<(span|mark)\b([^>]*)\bstyle=(["'])([^"']*)(\6)([^>]*)>([\s\S]*?)<\/\4>/gi;
const GENERIC_INLINE_HTML_TEXT_PATTERN =
  /<(span|kbd)\b([^>]*)>([\s\S]*?)<\/\1>/gi;
const NESTED_HTML_PATTERN = /<\/?[A-Za-z][^>]*>|<!--|<\?/;
const THEMATIC_BREAK_PATTERN = /^(?: {0,3})(?:(?:[-*_][ \t]*){3,})$/;
const FRONTMATTER_SAFE_THEMATIC_BREAK_PATTERN = /^---[ \t]*$/;

function isListItem(line: string): boolean {
  return LIST_ITEM_MARKER_PATTERN.test(getMarkdownBlockContent(line));
}

function isEditableListGapItem(line: string): boolean {
  return LIST_ITEM_MARKER_PATTERN.test(getMarkdownBlockContent(line)) && line.includes('\u2800');
}

function isListStructuralBlankLine(line: string, previous: string, next: string): boolean {
  if (line.trim() === '') return true;
  if (!/^\s*(?:>\s*)+$/.test(line)) return false;

  const depth = countBlockquoteMarkers(line);
  return countBlockquoteMarkers(previous) === depth
    && countBlockquoteMarkers(next) === depth;
}

function countBlockquoteMarkers(line: string): number {
  let count = 0;
  for (const character of line) {
    if (character === '>') count += 1;
  }
  return count;
}

function isStandaloneSerializedHorizontalRule(line: string): boolean {
  return THEMATIC_BREAK_PATTERN.test(line);
}

interface NormalizeCanonicalMarkdownSpacingOptions {
  canonicalizeThematicBreaks?: boolean;
  compactListGaps?: boolean;
  spreadCalloutLists?: boolean;
}

export function normalizeCanonicalMarkdownSpacing(
  text: string,
  options: NormalizeCanonicalMarkdownSpacingOptions = {},
): string {
  const canonicalizeThematicBreaks = options.canonicalizeThematicBreaks ?? true;
  const compactListGaps = options.compactListGaps ?? true;
  const spreadCalloutLists = options.spreadCalloutLists ?? true;
  const normalized = mapMarkdownOutsideProtectedSegments(text, (segment, startIndex) => {
    const lines = segment.split('\n');
    const output: string[] = [];

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index] ?? '';

      if (canonicalizeThematicBreaks && isStandaloneSerializedHorizontalRule(line)) {
        if (startIndex + index === 0 && !FRONTMATTER_SAFE_THEMATIC_BREAK_PATTERN.test(line)) {
          output.push(line);
          continue;
        }
        output.push('---');
        continue;
      }

      if (line.trim() === '' || /^\s*(?:>\s*)+$/.test(line)) {
        const previous = output[output.length - 1] ?? '';
        const next = lines[index + 1] ?? '';
        if (
          compactListGaps
          && isListStructuralBlankLine(line, previous, next)
          && isListItem(previous)
          && isListItem(next)
          && !isEditableListGapItem(previous)
          && !isEditableListGapItem(next)
        ) {
          continue;
        }
      }

      output.push(line);
    }

    return (
      spreadCalloutLists
        ? normalizeCalloutBlockquoteListSpacing(output)
        : output
    ).join('\n');
  });

  return normalizeCustomInlineHtmlText(
    normalizeInlineCodeMarkBoundaries(normalized)
  );
}

export function normalizeCanonicalMarkdownSpacingForPaste(text: string): string {
  return normalizeCanonicalMarkdownSpacing(text, { compactListGaps: true });
}

export function normalizeCanonicalMarkdownSpacingForPersistence(text: string): string {
  return normalizeCanonicalMarkdownSpacing(text, {
    canonicalizeThematicBreaks: false,
    compactListGaps: true,
    spreadCalloutLists: false,
  });
}

export function normalizeInlineHtmlTextForPersistence(text: string): string {
  return normalizeCustomInlineHtmlText(text);
}

function normalizeCalloutBlockquoteListSpacing(lines: string[]): string[] {
  if (!lines.some(isCalloutBlockquoteStartLine)) return lines;

  const output: string[] = [];
  let inCalloutBlockquote = false;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    if (isCalloutBlockquoteStartLine(line)) {
      inCalloutBlockquote = true;
    } else if (inCalloutBlockquote && line.trim() !== '' && !line.trimStart().startsWith('>')) {
      inCalloutBlockquote = false;
    }

    output.push(line);

    const next = lines[index + 1] ?? '';
    if (
      inCalloutBlockquote
      && BLOCKQUOTE_LIST_ITEM_PATTERN.test(line)
      && BLOCKQUOTE_LIST_ITEM_PATTERN.test(next)
    ) {
      output.push('>');
    }
  }

  return output;
}

function isCalloutBlockquoteStartLine(line: string): boolean {
  const match = /^(?: {0,3})>[ \t]*(.*)$/.exec(line);
  return !!match && consumeLeadingCalloutEmoji(match[1] ?? '') !== null;
}

function normalizeInlineCodeMarkBoundaries(markdown: string): string {
  return mapMarkdownOutsideProtectedSegments(markdown, (segment) =>
    segment.replace(STRONG_TRAILING_INLINE_CODE_PATTERN, '$1$2$1 $3')
  );
}

function normalizeCustomInlineHtmlText(markdown: string): string {
  return mapMarkdownOutsideProtectedSegments(markdown, (segment) => normalizeGenericInlineHtmlText(
    segment.replace(
      CUSTOM_INLINE_HTML_TEXT_PATTERN,
      (match, simpleTag, simpleAttrs, simpleText, styledTag, beforeStyle, quote, styleValue, _endQuote, afterStyle, styledText) => {
        const tag = simpleTag || styledTag;
        const text = simpleTag ? simpleText : styledText;
        if (!isSupportedInlineHtmlTag(tag, styleValue)) return match;
        if (NESTED_HTML_PATTERN.test(text)) return match;

        const attrs = simpleTag
          ? simpleAttrs
          : `${beforeStyle}style=${quote}${styleValue}${quote}${afterStyle}`;
        return `<${tag}${attrs}>${escapeMarkdownHtmlText(decodeMarkdownHtmlText(text))}</${tag}>`;
      }
    )
  ));
}

function normalizeGenericInlineHtmlText(markdown: string): string {
  return markdown.replace(
    GENERIC_INLINE_HTML_TEXT_PATTERN,
    (match, tag: string, attrs: string, text: string) => {
      if (NESTED_HTML_PATTERN.test(text)) return match;
      return `<${tag}${attrs}>${escapeMarkdownHtmlText(decodeMarkdownHtmlText(text))}</${tag}>`;
    }
  );
}

function isSupportedInlineHtmlTag(tag: string, styleValue: string | undefined): boolean {
  if (tag === 'sup' || tag === 'sub' || tag === 'u' || tag === 'mark') return true;
  return /(?:^|;)\s*(?:color|background-color)\s*:/i.test(styleValue ?? '');
}
