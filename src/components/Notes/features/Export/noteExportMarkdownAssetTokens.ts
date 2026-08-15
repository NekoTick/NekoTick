import {
  collectIgnoredInlineRanges,
  collectMarkdownHtmlBlockRanges,
  normalizeContentRanges,
  type ContentRange,
} from './noteExportMarkdownRanges';
import {
  collectHtmlTagRanges,
  findHtmlImageSourceTokens,
  type HtmlTagRangeScan,
} from './noteExportMarkdownHtmlTokens';
import { getNonExcludedContentRanges } from '@/lib/markdown/contentRangeExclusion';
import type { ExportMarkdownAssetSourceToken } from './noteExportMarkdownAssetTypes';
import { findMarkdownImageSourceMatches } from './noteExportMarkdownImageTokens';
import { findMarkdownReferenceImageSources } from './noteExportMarkdownReferenceImageTokens';
export { MAX_EXPORT_MARKDOWN_IMAGE_PART_SCAN_CHARS } from './noteExportMarkdownImageTokens';

export interface ExportMarkdownAssetTokenOptions {
  ignoredRanges?: readonly ContentRange[];
  maxTokens?: number;
}

export const MAX_EXPORT_MARKDOWN_ASSET_TOKENS = 2000;
export const MAX_EXPORT_HTML_TAG_SCAN_RANGES = 8000;
export const MAX_EXPORT_IGNORED_INLINE_RANGES = 8000;
export const MAX_EXPORT_MARKDOWN_HTML_BLOCK_RANGES = 4000;

function getMaxTokens(options?: ExportMarkdownAssetTokenOptions): number {
  const value = options?.maxTokens;
  if (value === undefined) return Number.POSITIVE_INFINITY;
  if (!Number.isFinite(value)) return value === Number.POSITIVE_INFINITY ? value : 0;
  return Math.max(0, Math.floor(value));
}

function collectVisibleHtmlTagRanges(
  content: string,
  ignoredRanges: readonly ContentRange[],
  maxRanges: number,
): HtmlTagRangeScan {
  const ranges: ContentRange[] = [];
  const protectedRanges: ContentRange[] = [];
  const visibleRanges = getNonExcludedContentRanges({ start: 0, end: content.length }, ignoredRanges);

  for (const visibleRange of visibleRanges) {
    const scan = collectHtmlTagRanges(content, maxRanges - ranges.length - protectedRanges.length, visibleRange);
    ranges.push(...scan.ranges);
    protectedRanges.push(...scan.protectedRanges);
    if (scan.exhaustedAt !== null) {
      return { ranges, protectedRanges, exhaustedAt: scan.exhaustedAt };
    }
  }

  return { ranges, protectedRanges, exhaustedAt: null };
}

export function findExportMarkdownAssetSourceTokens(content: string): ExportMarkdownAssetSourceToken[] {
  return findExportMarkdownAssetSourceTokensWithOptions(content);
}

export function findExportMarkdownAssetSourceTokensWithOptions(
  content: string,
  options?: ExportMarkdownAssetTokenOptions,
): ExportMarkdownAssetSourceToken[] {
  const maxTokens = getMaxTokens(options);
  if (maxTokens <= 0) {
    return [];
  }

  const ignoredInlineScan = collectIgnoredInlineRanges(
    content,
    Number.isFinite(maxTokens) ? MAX_EXPORT_IGNORED_INLINE_RANGES : Number.POSITIVE_INFINITY,
  );
  const ignoredRanges = ignoredInlineScan.exhaustedAt === null
    ? normalizeContentRanges([
        ...ignoredInlineScan.ranges,
        ...(options?.ignoredRanges ?? []),
      ])
    : normalizeContentRanges([
        ...ignoredInlineScan.ranges,
        ...(options?.ignoredRanges ?? []),
        { start: ignoredInlineScan.exhaustedAt, end: content.length },
      ]);
  const htmlBlockScan = collectMarkdownHtmlBlockRanges(
    content,
    Number.isFinite(maxTokens) ? MAX_EXPORT_MARKDOWN_HTML_BLOCK_RANGES : Number.POSITIVE_INFINITY,
  );
  const htmlBlockRemainderRanges = htmlBlockScan.exhaustedAt === null
    ? []
    : [{ start: htmlBlockScan.exhaustedAt, end: content.length }];
  const ignoredHtmlRanges = normalizeContentRanges([
    ...ignoredRanges,
    ...htmlBlockRemainderRanges,
  ]);
  const htmlTagScan = collectVisibleHtmlTagRanges(
    content,
    ignoredHtmlRanges,
    Number.isFinite(maxTokens) ? MAX_EXPORT_HTML_TAG_SCAN_RANGES : Number.POSITIVE_INFINITY,
  );
  const htmlTagRanges = htmlTagScan.ranges;
  const htmlProtectedRanges = htmlTagScan.protectedRanges;
  const htmlScanRemainderRanges = htmlTagScan.exhaustedAt === null
    ? []
    : [{ start: htmlTagScan.exhaustedAt, end: content.length }];
  const ignoredMarkdownRanges = normalizeContentRanges([
    ...ignoredHtmlRanges,
    ...htmlBlockScan.ranges,
    ...htmlProtectedRanges,
    ...htmlScanRemainderRanges,
  ]);
  const markdownMatches = findMarkdownImageSourceMatches(
    content,
    ignoredMarkdownRanges,
    htmlTagRanges,
    maxTokens,
  );
  const referenceImageScan = findMarkdownReferenceImageSources(
    content,
    ignoredMarkdownRanges,
    htmlTagRanges,
    maxTokens - markdownMatches.length,
  );
  return [
    ...markdownMatches.map((match) => match.token),
    ...referenceImageScan.tokens,
    ...findHtmlImageSourceTokens(
      content,
      normalizeContentRanges([
        ...ignoredRanges,
        ...markdownMatches.map((match) => match.imageRange),
        ...referenceImageScan.imageRanges,
      ]),
      htmlTagRanges,
      maxTokens,
    ),
  ].sort((left, right) => left.start - right.start).slice(0, maxTokens);
}
