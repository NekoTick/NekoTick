import { normalizeRenderableImageSrc } from '@/lib/markdown/renderableImagePolicy';
import { MAX_INLINE_IMAGE_BYTES } from '@/lib/markdown/dataImagePolicy';
import {
  parseMarkdownAndHtmlImageTokens,
  stripImageTokens,
  type ImageToken,
} from '@/lib/markdown/markdownImageTokens';
import { parseVideoUrl } from '@/lib/markdown/videoUrl';
import { createStoredAttachmentFromSource } from '@/lib/storage/attachmentStorage';

interface ChatMessageImageSourceOptions {
  maxEntries?: number;
  maxSources?: number;
  maxTokens?: number;
  persistable?: boolean;
}

type NormalizedImageToken = ImageToken & { src: string };

const MAX_CHAT_IMAGE_NON_DATA_SOURCE_CHARS = 16 * 1024;
const MAX_CHAT_IMAGE_DATA_SOURCE_CHARS = Math.ceil(MAX_INLINE_IMAGE_BYTES / 3) * 4 + 128;

export const MAX_CHAT_MESSAGE_IMAGE_SOURCE_ENTRIES = 2000;
export const MAX_CHAT_MESSAGE_IMAGE_SOURCES = 1000;

function startsWithDataImageCandidate(value: string): boolean {
  let index = 0;
  while (index < value.length && index < 128 && /\s/.test(value[index])) {
    index += 1;
  }
  return /^data:/i.test(value.slice(index, index + 5));
}

function isImageAttachmentMimeType(type: unknown): boolean {
  return typeof type === 'string' && type.trim().toLowerCase().startsWith('image/');
}

export function normalizeChatMessageImageSource(src: unknown): string | null {
  if (typeof src !== 'string') {
    return null;
  }
  if (src.length > MAX_CHAT_IMAGE_NON_DATA_SOURCE_CHARS && !startsWithDataImageCandidate(src)) {
    return null;
  }
  if (src.length > MAX_CHAT_IMAGE_DATA_SOURCE_CHARS) {
    return null;
  }
  const trimmed = src.trim();
  if (!trimmed) {
    return null;
  }

  const storedAttachment = createStoredAttachmentFromSource(trimmed, 'chat-message-image');
  if (storedAttachment && isImageAttachmentMimeType(storedAttachment.type) && !parseVideoUrl(trimmed)) {
    return storedAttachment.assetUrl;
  }

  const normalized = normalizeRenderableImageSrc(trimmed);
  if (!normalized || parseVideoUrl(normalized)) {
    return null;
  }

  const lower = normalized.toLowerCase();
  return lower.startsWith('http://') ||
    lower.startsWith('https://') ||
    lower.startsWith('data:') ||
    lower.startsWith('blob:')
    ? normalized
    : null;
}

export function normalizePersistedChatMessageImageSource(src: unknown): string | null {
  const normalized = normalizeChatMessageImageSource(src);
  if (!normalized || normalized.toLowerCase().startsWith('blob:')) {
    return null;
  }
  return normalized;
}

export function isRenderedImageSource(src: string): boolean {
  return !parseVideoUrl(src);
}

export function normalizeRenderedMessageImageSources(sources: readonly string[] | undefined): string[] {
  if (!sources || sources.length === 0) {
    return [];
  }

  const normalizedSources: string[] = [];
  const entryLimit = Math.min(sources.length, MAX_CHAT_MESSAGE_IMAGE_SOURCE_ENTRIES);
  for (let index = 0; index < entryLimit && normalizedSources.length < MAX_CHAT_MESSAGE_IMAGE_SOURCES; index += 1) {
    const src = normalizeRenderableImageSrc(sources[index]);
    if (src && isRenderedImageSource(src)) {
      normalizedSources.push(src);
    }
  }
  return normalizedSources;
}

function normalizeChatMessageImageSourceForMode(
  src: unknown,
  persistable: boolean,
): string | null {
  return persistable
    ? normalizePersistedChatMessageImageSource(src)
    : normalizeChatMessageImageSource(src);
}

export function normalizeChatMessageImageSources(
  sources: readonly unknown[] | undefined,
  options: ChatMessageImageSourceOptions = {},
): string[] {
  if (!sources || sources.length === 0) {
    return [];
  }

  const normalizedSources: string[] = [];
  const entryLimit = Math.min(sources.length, options.maxEntries ?? sources.length);
  const sourceLimit = options.maxSources ?? Number.POSITIVE_INFINITY;
  for (let index = 0; index < entryLimit && normalizedSources.length < sourceLimit; index += 1) {
    const source = normalizeChatMessageImageSourceForMode(sources[index], options.persistable === true);
    if (source) {
      normalizedSources.push(source);
    }
  }
  return normalizedSources;
}

export function getChatMessageImageTokens(
  content: string,
  options: ChatMessageImageSourceOptions = {},
): ImageToken[] {
  if (!content.includes('![') && !content.includes('<')) {
    return [];
  }

  return parseMarkdownAndHtmlImageTokens(content, { maxTokens: options.maxTokens })
    .map((token) => {
      const src = normalizeChatMessageImageSourceForMode(token.src, options.persistable === true);
      return src ? { ...token, src } : null;
    })
    .filter((token): token is NormalizedImageToken => token !== null);
}

export function extractChatMessageImageSources(
  content: string,
  options: ChatMessageImageSourceOptions = {},
): string[] {
  const tokens = getChatMessageImageTokens(content, options);
  const sourceLimit = options.maxSources ?? Number.POSITIVE_INFINITY;
  return tokens
    .slice(0, sourceLimit)
    .map((token) => token.src)
    .filter((src): src is string => !!src);
}

export function stripChatMessageImageTokens(
  content: string,
  options: ChatMessageImageSourceOptions = {},
): string {
  return stripImageTokens(content, getChatMessageImageTokens(content, options));
}
