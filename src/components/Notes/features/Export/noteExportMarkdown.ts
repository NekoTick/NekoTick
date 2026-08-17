import { getElectronBridge } from '@/lib/electron/bridge';
import { hasInternalNoteAssetUrlPathSegment } from '@/lib/assets/core/internalAssetPaths';
import { resolveExistingNotesRootAssetPath } from '@/lib/assets/core/paths';
import { mapMarkdownOutsideProtectedSegments } from '@/lib/notes/markdown/markdownProtectedBlocks';
import { getNoteInternalImageAssetPath, sanitizeNoteMediaSrc } from '@/lib/notes/markdown/urlSecurity';
import { formatMarkdownImage } from '@/lib/markdown/markdownImageMarkdown';
import { resolveObsidianImagePath } from '@/lib/notes/markdown/obsidianImagePath';
import type { FileTreeNode } from '@/stores/notes/types';
import {
  MAX_EXPORT_MARKDOWN_ASSET_TOKENS,
  findExportMarkdownAssetSourceTokensWithOptions,
} from './noteExportMarkdownAssetTokens';
import type { ExportMarkdownAssetSourceToken } from './noteExportMarkdownAssetTypes';
import { MAX_EXPORT_EMBEDDED_IMAGE_BYTES } from './noteExportLimits';

const IMAGE_MIME_BY_EXTENSION: Record<string, string> = {
  avif: 'image/avif',
  bmp: 'image/bmp',
  gif: 'image/gif',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};
const MAX_EXPORT_IMAGE_BYTES = MAX_EXPORT_EMBEDDED_IMAGE_BYTES;
export { MAX_EXPORT_EMBEDDED_IMAGE_BYTES } from './noteExportLimits';

function getImageMimeType(path: string): string {
  const extension = path.split('.').pop()?.toLowerCase() ?? '';
  return IMAGE_MIME_BY_EXTENSION[extension] ?? 'application/octet-stream';
}

function isExportableImagePath(path: string): boolean {
  return Object.prototype.hasOwnProperty.call(IMAGE_MIME_BY_EXTENSION, path.split('.').pop()?.toLowerCase() ?? '');
}

function isExportableImageSize(size: number | null | undefined): boolean {
  return typeof size === 'number' && Number.isFinite(size) && size >= 0 && size <= MAX_EXPORT_IMAGE_BYTES;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

interface ResolvedExportAssetUrl {
  url: string;
  embeddedBytes: number;
}

type ExportAssetUrlCache = Map<string, Promise<ResolvedExportAssetUrl>>;
interface ExportAssetBudget {
  embeddedBytes: number;
}

interface ResolveExportMarkdownAssetOptions {
  preserveObsidianSize?: boolean;
  rootNodes?: readonly FileTreeNode[];
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatExportObsidianImage(
  src: string,
  token: ExportMarkdownAssetSourceToken,
  preserveSize: boolean,
): string {
  const embed = token.obsidianEmbed;
  if (!embed) return src;
  if (preserveSize && embed.width) {
    return `<img src="${escapeHtmlAttribute(src)}" alt="" width="${embed.width}" />`;
  }
  return formatMarkdownImage(src, embed.size ? '' : embed.alias);
}

function getExportLocalImageAssetPath(src: string): string | null {
  const safeSrc = sanitizeNoteMediaSrc(src);
  if (!safeSrc) {
    return null;
  }

  const internalAssetPath = getNoteInternalImageAssetPath(safeSrc);
  if (internalAssetPath) {
    return hasInternalNoteAssetUrlPathSegment(internalAssetPath) ? null : internalAssetPath;
  }

  if (
    safeSrc.startsWith('//') ||
    /^[A-Za-z][A-Za-z0-9+.-]*:/i.test(safeSrc) ||
    hasInternalNoteAssetUrlPathSegment(safeSrc)
  ) {
    return null;
  }

  return safeSrc;
}

async function resolveAssetUrl(
  src: string,
  notesPath: string,
  notePath: string,
  remainingEmbeddedBytes: number,
  fallbackSrc = src,
): Promise<ResolvedExportAssetUrl> {
  const assetPath = getExportLocalImageAssetPath(src);
  if (!assetPath || !notesPath) {
    return { url: fallbackSrc, embeddedBytes: 0 };
  }

  const bridge = getElectronBridge();
  if (!bridge) {
    return { url: fallbackSrc, embeddedBytes: 0 };
  }

  if (remainingEmbeddedBytes <= 0) {
    return { url: fallbackSrc, embeddedBytes: 0 };
  }

  try {
    const absolutePath = await resolveExistingNotesRootAssetPath(notesPath, assetPath, notePath);
    if (!absolutePath) {
      return { url: fallbackSrc, embeddedBytes: 0 };
    }

    if (hasInternalNoteAssetUrlPathSegment(absolutePath) || !isExportableImagePath(absolutePath)) {
      return { url: fallbackSrc, embeddedBytes: 0 };
    }

    const fileInfo = await bridge.fs.stat(absolutePath).catch(() => null);
    if (!fileInfo || fileInfo.isDirectory === true || fileInfo.isFile === false) {
      return { url: fallbackSrc, embeddedBytes: 0 };
    }
    const fileSize = fileInfo?.size;
    if (typeof fileSize === 'number') {
      if (!isExportableImageSize(fileSize)) {
        return { url: fallbackSrc, embeddedBytes: 0 };
      }
      if (fileSize > MAX_EXPORT_EMBEDDED_IMAGE_BYTES) {
        return { url: fallbackSrc, embeddedBytes: 0 };
      }
      if (fileSize > remainingEmbeddedBytes) {
        return { url: fallbackSrc, embeddedBytes: 0 };
      }
    }

    const bytes = await bridge.fs.readBinaryFile(absolutePath, remainingEmbeddedBytes);
    if (!isExportableImageSize(bytes.byteLength)) {
      return { url: fallbackSrc, embeddedBytes: 0 };
    }
    if (bytes.byteLength > remainingEmbeddedBytes) {
      return { url: fallbackSrc, embeddedBytes: 0 };
    }

    return {
      url: `data:${getImageMimeType(absolutePath)};base64,${bytesToBase64(bytes)}`,
      embeddedBytes: Math.max(fileSize ?? 0, bytes.byteLength),
    };
  } catch {
    return { url: fallbackSrc, embeddedBytes: 0 };
  }
}

function getExportAssetUrlCacheKey(src: string, notesPath: string, notePath: string, fallbackSrc: string): string {
  return JSON.stringify([src, notesPath, notePath, fallbackSrc]);
}

function consumeExportAssetBudget(
  asset: ResolvedExportAssetUrl,
  budget: ExportAssetBudget,
  fallbackSrc: string,
): string {
  if (asset.embeddedBytes <= 0) {
    return asset.url;
  }
  if (budget.embeddedBytes + asset.embeddedBytes > MAX_EXPORT_EMBEDDED_IMAGE_BYTES) {
    return fallbackSrc;
  }
  budget.embeddedBytes += asset.embeddedBytes;
  return asset.url;
}

async function resolveAssetUrlCached(
  cache: ExportAssetUrlCache,
  src: string,
  notesPath: string,
  notePath: string,
  budget: ExportAssetBudget,
  fallbackSrc = src,
): Promise<string> {
  const cacheKey = getExportAssetUrlCacheKey(src, notesPath, notePath, fallbackSrc);
  const cached = cache.get(cacheKey);
  if (cached) {
    return consumeExportAssetBudget(await cached, budget, fallbackSrc);
  }

  const remainingEmbeddedBytes = Math.max(0, MAX_EXPORT_EMBEDDED_IMAGE_BYTES - budget.embeddedBytes);
  const resolved = resolveAssetUrl(src, notesPath, notePath, remainingEmbeddedBytes, fallbackSrc);
  cache.set(cacheKey, resolved);
  return consumeExportAssetBudget(await resolved, budget, fallbackSrc);
}

export async function resolveExportMarkdownAssetSources(
  markdown: string,
  notesPath: string,
  notePath: string,
  options: ResolveExportMarkdownAssetOptions = {},
): Promise<string> {
  const normalizedMarkdown = markdown.replace(/\r\n?/g, '\n');
  const lineStarts: number[] = [0];
  for (let index = 0; index < normalizedMarkdown.length; index += 1) {
    if (normalizedMarkdown[index] === '\n') lineStarts.push(index + 1);
  }
  const visibleRanges: Array<{ start: number; end: number }> = [];
  mapMarkdownOutsideProtectedSegments(normalizedMarkdown, (segment, startIndex) => {
    const start = lineStarts[startIndex] ?? normalizedMarkdown.length;
    visibleRanges.push({ start, end: start + segment.length });
    return segment;
  }, { protectHtmlBlocks: false });
  const protectedRanges: Array<{ start: number; end: number }> = [];
  let protectedCursor = 0;
  for (const range of visibleRanges) {
    if (protectedCursor < range.start) protectedRanges.push({ start: protectedCursor, end: range.start });
    protectedCursor = range.end;
  }
  if (protectedCursor < normalizedMarkdown.length) {
    protectedRanges.push({ start: protectedCursor, end: normalizedMarkdown.length });
  }
  const assetUrlCache: ExportAssetUrlCache = new Map();
  const assetBudget: ExportAssetBudget = { embeddedBytes: 0 };
  return resolveExportMarkdownAssetSegment(
    normalizedMarkdown,
    notesPath,
    notePath,
    assetUrlCache,
    assetBudget,
    protectedRanges,
    options,
  );
}

async function resolveExportMarkdownAssetSegment(
  markdown: string,
  notesPath: string,
  notePath: string,
  assetUrlCache: ExportAssetUrlCache,
  assetBudget: ExportAssetBudget,
  ignoredRanges: Array<{ start: number; end: number }>,
  options: ResolveExportMarkdownAssetOptions,
): Promise<string> {
  const tokens = findExportMarkdownAssetSourceTokensWithOptions(markdown, {
    ignoredRanges,
    maxTokens: MAX_EXPORT_MARKDOWN_ASSET_TOKENS,
  });
  if (tokens.length === 0) {
    return markdown;
  }

  const parts: string[] = [];
  let cursor = 0;
  for (const token of tokens) {
    const replaceStart = token.replaceStart ?? token.start;
    const replaceEnd = token.replaceEnd ?? token.end;
    if (replaceStart < cursor) {
      continue;
    }
    parts.push(markdown.slice(cursor, replaceStart));
    const openedFolderSrc = token.obsidianEmbed && options.rootNodes
      ? resolveObsidianImagePath(token.lookupSrc ?? token.src, options.rootNodes, notePath)
      : null;
    const resolvedSrc = await resolveAssetUrlCached(
      assetUrlCache,
      openedFolderSrc ?? token.lookupSrc ?? token.src,
      notesPath,
      notePath,
      assetBudget,
      token.src,
    );
    parts.push(formatExportObsidianImage(resolvedSrc, token, options.preserveObsidianSize === true));
    cursor = replaceEnd;
  }
  parts.push(markdown.slice(cursor));
  return parts.join('');
}
