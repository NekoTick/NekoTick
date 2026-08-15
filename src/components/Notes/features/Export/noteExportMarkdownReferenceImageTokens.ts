import { decodeMarkdownHtmlText } from '@/lib/notes/markdown/markdownHtmlText';
import {
  isEscapedMarkdownPunctuation,
  isOffsetInRanges,
  type ContentRange,
} from './noteExportMarkdownRanges';
import type { ExportMarkdownAssetSourceToken } from './noteExportMarkdownAssetTypes';
import {
  findMarkdownLabelEnd,
  normalizeMarkdownImageLookupSrc,
} from './noteExportMarkdownImageTokens';

interface ReferenceImageUsage {
  label: string;
  range: ContentRange;
}

export interface MarkdownReferenceImageScan {
  imageRanges: ContentRange[];
  tokens: ExportMarkdownAssetSourceToken[];
}

function normalizeReferenceLabel(value: string): string {
  return decodeMarkdownHtmlText(value)
    .replace(/\\([!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~])/g, '$1')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function collectReferenceImageUsages(
  content: string,
  ignoredRanges: readonly ContentRange[],
  htmlTagRanges: readonly ContentRange[],
  maxImages: number,
): ReferenceImageUsage[] {
  const usages: ReferenceImageUsage[] = [];
  let cursor = 0;

  while (cursor < content.length && usages.length < maxImages) {
    const imageStart = content.indexOf('![', cursor);
    if (imageStart === -1) break;
    if (
      isOffsetInRanges(imageStart, ignoredRanges)
      || isOffsetInRanges(imageStart, htmlTagRanges)
      || isEscapedMarkdownPunctuation(content, imageStart)
    ) {
      cursor = imageStart + 2;
      continue;
    }

    const altEnd = findMarkdownLabelEnd(content, imageStart + 2, ignoredRanges);
    if (altEnd === null) {
      cursor = imageStart + 2;
      continue;
    }
    const next = content[altEnd + 1];
    if (next === '(') {
      cursor = altEnd + 2;
      continue;
    }

    let rawLabel = content.slice(imageStart + 2, altEnd);
    let imageEnd = altEnd + 1;
    if (next === '[') {
      const referenceEnd = findMarkdownLabelEnd(content, altEnd + 2, ignoredRanges);
      if (referenceEnd === null) {
        cursor = altEnd + 2;
        continue;
      }
      rawLabel = content.slice(altEnd + 2, referenceEnd) || rawLabel;
      imageEnd = referenceEnd + 1;
    }

    const label = normalizeReferenceLabel(rawLabel);
    if (label) {
      usages.push({ label, range: { start: imageStart, end: imageEnd } });
    }
    cursor = imageEnd;
  }

  return usages;
}

function parseDefinitionDestination(
  content: string,
  start: number,
  lineEnd: number,
): ExportMarkdownAssetSourceToken | null {
  let cursor = start;
  while (cursor < lineEnd && (content[cursor] === ' ' || content[cursor] === '\t')) cursor += 1;
  if (cursor >= lineEnd) return null;

  if (content[cursor] === '<') {
    const srcStart = cursor + 1;
    let srcEnd = srcStart;
    while (
      srcEnd < lineEnd
      && (content[srcEnd] !== '>' || isEscapedMarkdownPunctuation(content, srcEnd))
    ) srcEnd += 1;
    if (srcEnd >= lineEnd || srcEnd === srcStart) return null;
    const src = content.slice(srcStart, srcEnd);
    return { start: srcStart, end: srcEnd, src, lookupSrc: normalizeMarkdownImageLookupSrc(src) };
  }

  const srcStart = cursor;
  let parenDepth = 0;
  while (cursor < lineEnd) {
    const char = content[cursor];
    if ((char === ' ' || char === '\t') && parenDepth === 0) break;
    if (char === '\\') {
      cursor += 2;
      continue;
    }
    if (char === '(') parenDepth += 1;
    if (char === ')' && parenDepth > 0) parenDepth -= 1;
    cursor += 1;
  }
  if (cursor === srcStart) return null;
  const src = content.slice(srcStart, cursor);
  return { start: srcStart, end: cursor, src, lookupSrc: normalizeMarkdownImageLookupSrc(src) };
}

function collectReferencedDefinitionTokens(
  content: string,
  labels: ReadonlySet<string>,
  ignoredRanges: readonly ContentRange[],
  maxTokens: number,
): ExportMarkdownAssetSourceToken[] {
  const tokens: ExportMarkdownAssetSourceToken[] = [];
  const matchedLabels = new Set<string>();
  let lineStart = 0;

  while (lineStart < content.length && tokens.length < maxTokens) {
    const newline = content.indexOf('\n', lineStart);
    const lineEnd = newline === -1 ? content.length : newline;
    if (!isOffsetInRanges(lineStart, ignoredRanges)) {
      let cursor = lineStart;
      let spaces = 0;
      while (cursor < lineEnd && content[cursor] === ' ' && spaces < 4) {
        cursor += 1;
        spaces += 1;
      }
      if (spaces <= 3 && content[cursor] === '[') {
        const labelEnd = findMarkdownLabelEnd(content, cursor + 1, ignoredRanges);
        if (labelEnd !== null && labelEnd < lineEnd && content[labelEnd + 1] === ':') {
          const label = normalizeReferenceLabel(content.slice(cursor + 1, labelEnd));
          if (labels.has(label) && !matchedLabels.has(label)) {
            const token = parseDefinitionDestination(content, labelEnd + 2, lineEnd);
            if (token) {
              tokens.push(token);
              matchedLabels.add(label);
            }
          }
        }
      }
    }
    lineStart = newline === -1 ? content.length : newline + 1;
  }

  return tokens;
}

export function findMarkdownReferenceImageSources(
  content: string,
  ignoredRanges: readonly ContentRange[],
  htmlTagRanges: readonly ContentRange[],
  maxTokens: number,
): MarkdownReferenceImageScan {
  const usages = collectReferenceImageUsages(content, ignoredRanges, htmlTagRanges, maxTokens);
  const labels = new Set(usages.map((usage) => usage.label));
  return {
    imageRanges: usages.map((usage) => usage.range),
    tokens: collectReferencedDefinitionTokens(content, labels, ignoredRanges, maxTokens),
  };
}
