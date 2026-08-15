import {
  getRangeEndAtOffset,
  isEscapedMarkdownPunctuation,
  isOffsetInRanges,
  type ContentRange,
} from './noteExportMarkdownRanges';
import { decodeMarkdownHtmlText } from '@/lib/notes/markdown/markdownHtmlText';
import type { ExportMarkdownAssetSourceToken } from './noteExportMarkdownAssetTypes';

const MARKDOWN_LINK_DESTINATION_ESCAPE_PATTERN = /\\([!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~])/g;

export const MAX_EXPORT_MARKDOWN_IMAGE_PART_SCAN_CHARS = 1024 * 1024;

export interface MarkdownImageSourceMatch {
  token: ExportMarkdownAssetSourceToken;
  imageRange: ContentRange;
}

interface ParsedMarkdownImageTarget extends ExportMarkdownAssetSourceToken {
  tokenEnd: number;
}

function unescapeMarkdownLinkDestination(value: string): string {
  return value.replace(MARKDOWN_LINK_DESTINATION_ESCAPE_PATTERN, '$1');
}

export function normalizeMarkdownImageLookupSrc(value: string): string {
  return decodeMarkdownHtmlText(unescapeMarkdownLinkDestination(value));
}

export function findMarkdownLabelEnd(
  content: string,
  start: number,
  ignoredRanges: readonly ContentRange[],
): number | null {
  let cursor = start;
  const scanEnd = Math.min(content.length, start + MAX_EXPORT_MARKDOWN_IMAGE_PART_SCAN_CHARS);
  let bracketDepth = 0;

  while (cursor < scanEnd) {
    const ignoredEnd = getRangeEndAtOffset(cursor, ignoredRanges);
    if (ignoredEnd !== null) {
      cursor = ignoredEnd;
      continue;
    }

    const char = content[cursor];
    if (char === '[' && !isEscapedMarkdownPunctuation(content, cursor)) {
      bracketDepth += 1;
      cursor += 1;
      continue;
    }
    if (char === ']' && !isEscapedMarkdownPunctuation(content, cursor)) {
      if (bracketDepth === 0) {
        return cursor;
      }
      bracketDepth -= 1;
      cursor += 1;
      continue;
    }

    cursor += 1;
  }

  return null;
}

function findMarkdownTargetClose(content: string, start: number): number | null {
  let cursor = start;
  const scanEnd = Math.min(content.length, start + MAX_EXPORT_MARKDOWN_IMAGE_PART_SCAN_CHARS);
  let quote: string | null = null;
  let parenDepth = 0;

  while (cursor < scanEnd) {
    const char = content[cursor];
    if (quote) {
      if (char === quote && !isEscapedMarkdownPunctuation(content, cursor)) {
        quote = null;
      }
      cursor += 1;
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      cursor += 1;
      continue;
    }
    if (char === '\\') {
      cursor += 2;
      continue;
    }
    if (char === '(') {
      parenDepth += 1;
      cursor += 1;
      continue;
    }
    if (char === ')') {
      if (parenDepth === 0) {
        return cursor + 1;
      }
      parenDepth -= 1;
    }
    cursor += 1;
  }

  return null;
}

function parseMarkdownImageTarget(
  content: string,
  start: number,
): ParsedMarkdownImageTarget | null {
  let cursor = start;
  const scanEnd = Math.min(content.length, start + MAX_EXPORT_MARKDOWN_IMAGE_PART_SCAN_CHARS);
  while (cursor < scanEnd && /\s/.test(content[cursor])) {
    cursor += 1;
  }
  if (cursor >= scanEnd) {
    return null;
  }

  if (content[cursor] === '<') {
    const srcStart = cursor + 1;
    let srcEnd = srcStart;
    while (
      srcEnd < scanEnd
      && content[srcEnd] !== '\n'
      && (content[srcEnd] !== '>' || isEscapedMarkdownPunctuation(content, srcEnd))
    ) {
      srcEnd += 1;
    }
    if (srcEnd >= scanEnd || content[srcEnd] !== '>') {
      return null;
    }
    const tokenEnd = findMarkdownTargetClose(content, srcEnd + 1);
    const src = content.slice(srcStart, srcEnd).trim();
    const lookupSrc = normalizeMarkdownImageLookupSrc(src);
    return tokenEnd && src ? { start: srcStart, end: srcEnd, src, lookupSrc, tokenEnd } : null;
  }

  const srcStart = cursor;
  let parenDepth = 0;
  while (cursor < scanEnd) {
    const char = content[cursor];
    if (/\s/.test(char)) {
      const tokenEnd = findMarkdownTargetClose(content, cursor);
      const src = content.slice(srcStart, cursor).trim();
      const lookupSrc = normalizeMarkdownImageLookupSrc(src);
      return tokenEnd && src ? { start: srcStart, end: cursor, src, lookupSrc, tokenEnd } : null;
    }
    if (char === '\\') {
      cursor += 2;
      continue;
    }
    if (char === '(') {
      parenDepth += 1;
      cursor += 1;
      continue;
    }
    if (char === ')') {
      if (parenDepth === 0) {
        const src = content.slice(srcStart, cursor).trim();
        const lookupSrc = normalizeMarkdownImageLookupSrc(src);
        return src ? { start: srcStart, end: cursor, src, lookupSrc, tokenEnd: cursor + 1 } : null;
      }
      parenDepth -= 1;
    }
    cursor += 1;
  }

  return null;
}

export function findMarkdownImageSourceMatches(
  content: string,
  ignoredRanges: readonly ContentRange[],
  htmlTagRanges: readonly ContentRange[],
  maxTokens = Number.POSITIVE_INFINITY,
): MarkdownImageSourceMatch[] {
  const matches: MarkdownImageSourceMatch[] = [];
  let cursor = 0;

  while (cursor < content.length && matches.length < maxTokens) {
    const imageStart = content.indexOf('![', cursor);
    if (imageStart === -1) {
      break;
    }
    if (
      isOffsetInRanges(imageStart, ignoredRanges) ||
      isOffsetInRanges(imageStart, htmlTagRanges) ||
      isEscapedMarkdownPunctuation(content, imageStart)
    ) {
      cursor = imageStart + 2;
      continue;
    }

    const labelEnd = findMarkdownLabelEnd(content, imageStart + 2, ignoredRanges);
    if (labelEnd === null || content[labelEnd + 1] !== '(') {
      cursor = imageStart + 2;
      continue;
    }

    const parsed = parseMarkdownImageTarget(content, labelEnd + 2);
    if (!parsed) {
      cursor = labelEnd + 2;
      continue;
    }
    const { tokenEnd, ...token } = parsed;
    matches.push({ token, imageRange: { start: imageStart, end: tokenEnd } });
    cursor = tokenEnd;
  }

  return matches;
}
