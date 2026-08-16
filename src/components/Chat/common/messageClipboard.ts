import { stripErrorTags } from '@/lib/ai/errorTag';
import { stripThinkingContent } from '@/lib/ai/stripThinkingContent';
import { normalizeClipboardImageDataUrl, writeImageBlobToClipboard, writeTextToClipboard } from '@/lib/clipboard';
import { getElectronBridge } from '@/lib/electron/bridge';
import { isRenderableDataImageSrc, normalizeRenderableImageSrc } from '@/components/common/markdown/imagePolicy';
import { stripImagePresentationFragment } from '@/lib/markdown/imageResourceSource';
import { isRenderedImageSource } from '@/lib/ai/chatImageSourcePolicy';
import { fetchChatImageBlob, MAX_CHAT_IMAGE_FETCH_BYTES } from './chatImageFetch';
import { resolveSafeChatImageSource } from './chatImageSourceResolution';
import {
  INLINE_DATA_IMAGE_TARGET_HINT_PATTERN,
  scrubOverflowCopyInlineDataImages,
} from './messageClipboardOverflowScrub';
import {
  parseMarkdownAndHtmlImageTokens,
  parseMarkdownImageTokens,
  stripImageTokens,
  type ImageToken,
  type ImageTokenParseOptions,
} from './messageImageTokens';
import { isSvgImageMimeType, rasterizeSvgBlobToPngBlob } from './svgRasterize';

const MAX_COPY_IMAGE_SCAN_TOKENS = 2000;
const MAX_COPY_TEXT_IMAGE_TOKENS = 1000;

export {
  isRenderedImageSource,
  normalizeRenderedMessageImageSources,
  MAX_CHAT_MESSAGE_IMAGE_SOURCE_ENTRIES,
  MAX_CHAT_MESSAGE_IMAGE_SOURCES,
} from '@/lib/ai/chatImageSourcePolicy';

function normalizeImageToken(token: ImageToken): ImageToken | null {
  const src = normalizeRenderableImageSrc(token.src);
  return src ? { ...token, src } : null;
}

function normalizeImageTokens(tokens: ImageToken[]): ImageToken[] {
  return tokens
    .map(normalizeImageToken)
    .filter((token): token is ImageToken => Boolean(token));
}

function normalizeRenderedImageTokens(tokens: ImageToken[]): ImageToken[] {
  return normalizeImageTokens(tokens).filter((token) => !!token.src && isRenderedImageSource(token.src));
}

export function extractMarkdownImageSources(content: string, options?: ImageTokenParseOptions): string[] {
  return normalizeImageTokens(parseMarkdownImageTokens(content, options))
    .map((token) => token.src)
    .filter((src): src is string => !!src);
}

export function extractMessageImageSources(content: string, options?: ImageTokenParseOptions): string[] {
  const tokens = normalizeImageTokens(parseMarkdownAndHtmlImageTokens(content, options));

  return tokens.map((token) => token.src).filter((src): src is string => !!src);
}

export function extractRenderedMarkdownImageSources(content: string, options?: ImageTokenParseOptions): string[] {
  return extractMarkdownImageSources(content, options).filter(isRenderedImageSource);
}

export function extractRenderedMessageImageSources(content: string, options?: ImageTokenParseOptions): string[] {
  return extractMessageImageSources(content, options).filter(isRenderedImageSource);
}

export function stripMarkdownImageTokens(content: string, options?: ImageTokenParseOptions): string {
  return stripImageTokens(content, normalizeRenderedImageTokens(parseMarkdownImageTokens(content, options)));
}

export function stripMessageImageTokens(content: string, options?: ImageTokenParseOptions): string {
  const tokens = normalizeRenderedImageTokens(parseMarkdownAndHtmlImageTokens(content, options));
  return stripImageTokens(content, tokens);
}

function getBoundedImageTokenLimit(options?: ImageTokenParseOptions): number | null {
  const value = options?.maxTokens;
  if (value === undefined || value === Number.POSITIVE_INFINITY) {
    return null;
  }
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.floor(value));
}

function isBlobByteLengthWithinLimit(size: number, maxBytes: number): boolean {
  return Number.isFinite(size) && size >= 0 && size <= maxBytes;
}

export function formatMessageCopyText(content: string, options?: ImageTokenParseOptions): string {
  const normalizedContent = stripThinkingContent(stripErrorTags(content));
  const tokens = normalizeImageTokens(parseMarkdownAndHtmlImageTokens(normalizedContent, options));
  const tokenLimit = getBoundedImageTokenLimit(options);
  if (tokens.length === 0) {
    return INLINE_DATA_IMAGE_TARGET_HINT_PATTERN.test(normalizedContent)
      ? scrubOverflowCopyInlineDataImages(normalizedContent)
      : normalizedContent;
  }

  const parts: string[] = [];
  let cursor = 0;
  for (const token of tokens) {
    parts.push(normalizedContent.slice(cursor, token.start));
    if (token.src) {
      parts.push(isRenderableDataImageSrc(token.src) ? "[image]" : token.src);
    }
    cursor = token.end;
  }
  parts.push(normalizedContent.slice(cursor));
  const text = parts.join("");
  return (tokenLimit !== null && tokens.length >= tokenLimit) || INLINE_DATA_IMAGE_TARGET_HINT_PATTERN.test(text)
    ? scrubOverflowCopyInlineDataImages(text)
    : text;
}

export async function copyImageSourceToClipboard(src: string): Promise<boolean> {
  try {
    const resolvedSrc = await resolveSafeChatImageSource(src, "clipboard-image");
    if (!resolvedSrc) {
      return false;
    }
    if (isRenderableDataImageSrc(resolvedSrc)) {
      const desktopClipboard = getElectronBridge()?.clipboard;
      const clipboardDataUrl = normalizeClipboardImageDataUrl(resolvedSrc);
      if (desktopClipboard?.writeImage) {
        try {
          if (clipboardDataUrl) {
            await desktopClipboard.writeImage(clipboardDataUrl);
            return true;
          }
        } catch {
        }
      }
    }

    let blob = await fetchChatImageBlob(stripImagePresentationFragment(resolvedSrc));
    if (!blob) {
      return false;
    }
    if (isSvgImageMimeType(blob.type)) {
      const rasterizedBlob = await rasterizeSvgBlobToPngBlob(blob);
      if (!rasterizedBlob) {
        return false;
      }
      blob = rasterizedBlob;
    }
    if (!isBlobByteLengthWithinLimit(blob.size, MAX_CHAT_IMAGE_FETCH_BYTES)) {
      return false;
    }
    return await writeImageBlobToClipboard(blob);
  } catch {
  }
  return false;
}

export async function copyMessageContentToClipboard(content: string): Promise<boolean> {
  const imageSources = extractRenderedMessageImageSources(content, {
    maxTokens: MAX_COPY_IMAGE_SCAN_TOKENS,
  });
  if (imageSources.length > 0) {
    const copied = await copyImageSourceToClipboard(imageSources[0]);
    if (copied) {
      return true;
    }
  }

  return writeTextToClipboard(formatMessageCopyText(content, {
    maxTokens: MAX_COPY_TEXT_IMAGE_TOKENS,
  }));
}
