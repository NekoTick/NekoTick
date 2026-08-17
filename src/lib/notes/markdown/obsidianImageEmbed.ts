import { sanitizeNoteMediaSrc } from './urlSecurity';

const MAX_OBSIDIAN_IMAGE_TARGET_CHARS = 4096;
const OBSIDIAN_IMAGE_EMBED_PATTERN = /!\[\[([^\]\n]{1,4096})\]\]/g;
const IMAGE_TARGET_PATTERN = /\.(?:avif|bmp|gif|ico|jpe?g|png|svg|webp)$/i;
const DATA_IMAGE_PATTERN = /^data:image\/(?:avif|bmp|gif|jpeg|png|webp);/i;
const SIZE_ALIAS_PATTERN = /^([1-9]\d{0,4})(?:x([1-9]\d{0,4}))?$/i;

export interface ObsidianImageEmbedMetadata {
  alias: string;
  height: number | null;
  size: string | null;
  src: string;
  width: string | null;
}

export interface ParsedObsidianImageEmbedTarget {
  alt: string;
  obsidianEmbed: ObsidianImageEmbedMetadata;
  src: string;
  title: null;
}

export interface ObsidianImageEmbedSourceToken {
  embedEnd: number;
  embedStart: number;
  source: string;
  sourceEnd: number;
  sourceStart: number;
  target: ParsedObsidianImageEmbedTarget;
}

interface ContentRange {
  end: number;
  start: number;
}

function splitObsidianImageTarget(rawTarget: string): {
  alias: string;
  rawSrc: string;
} {
  const aliasSeparator = rawTarget.indexOf('|');
  if (aliasSeparator < 0) {
    return { alias: '', rawSrc: rawTarget };
  }

  let slashCount = 0;
  for (let cursor = aliasSeparator - 1; cursor >= 0 && rawTarget[cursor] === '\\'; cursor -= 1) {
    slashCount += 1;
  }
  const escapedSeparator = slashCount % 2 === 1;
  return {
    alias: rawTarget.slice(aliasSeparator + 1).trim(),
    rawSrc: rawTarget.slice(0, aliasSeparator - (escapedSeparator ? 1 : 0)),
  };
}

function getImageTargetBase(src: string): string {
  const withoutHash = src.split('#')[0] ?? '';
  return withoutHash.split('?')[0] ?? '';
}

function isImageTarget(src: string): boolean {
  if (DATA_IMAGE_PATTERN.test(src)) return true;
  const internalImagePrefix = /^img:/i.test(src) ? src.slice(src.indexOf(':') + 1) : src;
  return IMAGE_TARGET_PATTERN.test(getImageTargetBase(internalImagePrefix));
}

function isEscapedAt(content: string, index: number): boolean {
  let slashCount = 0;
  for (let cursor = index - 1; cursor >= 0 && content[cursor] === '\\'; cursor -= 1) {
    slashCount += 1;
  }
  return slashCount % 2 === 1;
}

function isInsideMarkdownLinkLabel(content: string, start: number, end: number): boolean {
  const lineStart = Math.max(
    content.lastIndexOf('\n', start - 1) + 1,
    start - MAX_OBSIDIAN_IMAGE_TARGET_CHARS,
  );
  let openBracket = -1;
  let bracketDepth = 0;
  for (let cursor = start - 1; cursor >= lineStart; cursor -= 1) {
    if (isEscapedAt(content, cursor)) continue;
    if (content[cursor] === ']') {
      bracketDepth += 1;
    } else if (content[cursor] === '[') {
      if (bracketDepth > 0) bracketDepth -= 1;
      else {
        openBracket = cursor;
        break;
      }
    }
  }
  if (openBracket < 0) return false;

  const labelEnd = content.indexOf(']', end);
  const lineEnd = content.indexOf('\n', end);
  if (labelEnd < 0 || (lineEnd >= 0 && labelEnd > lineEnd)) return false;
  const suffix = content.slice(labelEnd + 1, labelEnd + 3);
  return suffix.startsWith('(') || suffix === '[]' || suffix.startsWith('[');
}

export function parseObsidianImageEmbedTarget(rawTarget: string): ParsedObsidianImageEmbedTarget | null {
  const { alias, rawSrc } = splitObsidianImageTarget(rawTarget);
  const safeSrc = sanitizeNoteMediaSrc(rawSrc.trim());
  if (!safeSrc || !isImageTarget(safeSrc)) {
    return null;
  }

  const sizeMatch = SIZE_ALIAS_PATTERN.exec(alias);
  const width = sizeMatch ? `${Number.parseInt(sizeMatch[1], 10)}px` : null;
  const height = sizeMatch?.[2] ? Number.parseInt(sizeMatch[2], 10) : null;
  return {
    src: safeSrc,
    alt: alias && !sizeMatch ? alias : '',
    title: null,
    obsidianEmbed: {
      alias,
      height,
      size: sizeMatch ? alias : null,
      src: safeSrc,
      width,
    },
  };
}

export function findObsidianImageEmbedSourceTokens(
  content: string,
  ignoredRanges: readonly ContentRange[] = [],
  maxTokens = Number.POSITIVE_INFINITY,
): ObsidianImageEmbedSourceToken[] {
  if (maxTokens <= 0 || !content.includes('![[')) return [];

  const tokens: ObsidianImageEmbedSourceToken[] = [];
  let ignoredIndex = 0;
  OBSIDIAN_IMAGE_EMBED_PATTERN.lastIndex = 0;
  for (const match of content.matchAll(OBSIDIAN_IMAGE_EMBED_PATTERN)) {
    const embedStart = match.index ?? 0;
    const source = match[0] ?? '';
    const embedEnd = embedStart + source.length;
    while (ignoredRanges[ignoredIndex] && ignoredRanges[ignoredIndex]!.end <= embedStart) {
      ignoredIndex += 1;
    }
    const ignoredRange = ignoredRanges[ignoredIndex];
    if (
      isEscapedAt(content, embedStart)
      || isInsideMarkdownLinkLabel(content, embedStart, embedEnd)
      || (ignoredRange && ignoredRange.start < embedEnd && ignoredRange.end > embedStart)
    ) {
      continue;
    }

    const rawTarget = match[1] ?? '';
    const target = parseObsidianImageEmbedTarget(rawTarget);
    if (!target) continue;

    const { rawSrc } = splitObsidianImageTarget(rawTarget);
    const leadingWhitespace = rawSrc.length - rawSrc.trimStart().length;
    const sourceStart = embedStart + 3 + leadingWhitespace;
    tokens.push({
      embedEnd,
      embedStart,
      source,
      sourceEnd: sourceStart + rawSrc.trim().length,
      sourceStart,
      target,
    });
    if (tokens.length >= maxTokens) break;
  }
  return tokens;
}

export function formatObsidianImageEmbed(
  metadata: ObsidianImageEmbedMetadata,
  alias = metadata.alias,
): string {
  return `![[${metadata.src}${alias ? `|${alias}` : ''}]]`;
}
