import type { ChatMessage } from '@/lib/ai/types';
import { estimateChatMessageHeight } from './chatMessageLayout';
import { normalizeChatContainerWidth } from './chatWidthBuckets';
import {
  MARKDOWN_BODY_FONT_SIZE,
  normalizeMarkdownBodyFontSize,
} from '@/components/common/markdown/markdownMetrics';

export const CHAT_MESSAGE_LIST_GAP = 32;
export const CHAT_MESSAGE_LOADING_GAP = 16;
export const CHAT_MESSAGE_LIST_TOP_PADDING = 32;
export const CHAT_MESSAGE_LIST_BOTTOM_PADDING = 16;
export const CHAT_MESSAGE_LIST_OVERSCAN = 480;
export const CHAT_MESSAGE_LIST_ACTIVE_OVERSCAN = 320;
export const CHAT_MESSAGE_LIST_TAIL_OVERSCAN = 160;

export interface ChatMessageFrame {
  bottom: number;
  height: number;
  id: string;
  index: number;
  top: number;
}

export interface ChatMessageFrameLayout {
  endOffset: number;
  items: ChatMessageFrame[];
}

export interface BuildChatMessageFrameLayoutOptions {
  activeMessageId?: string | null;
  cacheKey?: string | null;
  containerWidth: number;
  fontSize?: number;
  isSessionActive: boolean;
  measuredHeights?: Map<string, number>;
}

type CachedFrameLayoutEntry = {
  layout: ChatMessageFrameLayout;
  messageSignatures: string[];
};

type CachedMeasuredHeightEntry = {
  height: number;
  signature: string;
};

const FRAME_LAYOUT_CACHE_LIMIT = 24;
const MEASURED_HEIGHT_CACHE_LIMIT = 2000;
const estimatedFrameLayoutCache = new Map<string, CachedFrameLayoutEntry>();
const measuredHeightCache = new Map<string, CachedMeasuredHeightEntry>();
const messageSignatureCache = new WeakMap<ChatMessage, string>();

function hashString(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function countLineBreaks(value: string): number {
  let count = 0;
  for (let index = 0; index < value.length; index += 1) {
    if (value.charCodeAt(index) === 10) {
      count += 1;
    }
  }
  return count;
}

function setEstimatedFrameLayoutCacheEntry(
  key: string,
  entry: CachedFrameLayoutEntry,
): void {
  if (estimatedFrameLayoutCache.has(key)) {
    estimatedFrameLayoutCache.delete(key);
  } else if (estimatedFrameLayoutCache.size >= FRAME_LAYOUT_CACHE_LIMIT) {
    const oldestKey = estimatedFrameLayoutCache.keys().next().value;
    if (oldestKey !== undefined) {
      estimatedFrameLayoutCache.delete(oldestKey);
    }
  }

  estimatedFrameLayoutCache.set(key, entry);
}

function setMeasuredHeightCacheEntry(
  key: string,
  entry: CachedMeasuredHeightEntry,
): void {
  if (measuredHeightCache.has(key)) {
    measuredHeightCache.delete(key);
  } else if (measuredHeightCache.size >= MEASURED_HEIGHT_CACHE_LIMIT) {
    const oldestKey = measuredHeightCache.keys().next().value;
    if (oldestKey !== undefined) {
      measuredHeightCache.delete(oldestKey);
    }
  }

  measuredHeightCache.set(key, entry);
}

function getFrameLayoutCacheKey(
  cacheKey: string | null | undefined,
  containerWidth: number,
  fontSize: number,
  isSessionActive: boolean,
): string {
  return `${cacheKey ?? 'sessionless'}\u0000${containerWidth}\u0000${fontSize}\u0000${isSessionActive ? 1 : 0}`;
}

function getMessageSignature(message: ChatMessage): string {
  const cached = messageSignatureCache.get(message);
  if (cached !== undefined) {
    return cached;
  }

  const content = message.content;
  const length = content.length;
  const currentVersionCreatedAt = message.versions?.[message.currentVersionIndex]?.createdAt ?? '';
  const sample = length <= 96
    ? content
    : `${content.slice(0, 32)}\u0002${content.slice(Math.max(0, Math.floor(length / 2) - 16), Math.floor(length / 2) + 16)}\u0002${content.slice(-32)}`;
  const signature = `${message.id}\u0000${message.currentVersionIndex}\u0000${currentVersionCreatedAt}\u0000${message.role}\u0000${length}\u0000${countLineBreaks(content)}\u0000${hashString(sample)}`;
  messageSignatureCache.set(message, signature);
  return signature;
}

function getMessageSignatures(messages: ChatMessage[]): string[] {
  return messages.map((message) => getMessageSignature(message));
}

function getSharedMessagePrefixLength(
  previous: string[],
  next: string[],
): number {
  const maxLength = Math.min(previous.length, next.length);
  let index = 0;

  while (index < maxLength && previous[index] === next[index]) {
    index += 1;
  }

  return index;
}

function areMessageSignaturesEqual(
  previous: string[],
  next: string[],
): boolean {
  if (previous.length !== next.length) {
    return false;
  }

  for (let index = 0; index < previous.length; index += 1) {
    if (previous[index] !== next[index]) {
      return false;
    }
  }

  return true;
}

function getMeasuredHeightCacheKey(
  cacheKey: string | null | undefined,
  containerWidth: number,
  fontSize: number,
  isSessionActive: boolean,
  messageId: string,
): string {
  return `${cacheKey ?? 'sessionless'}\u0000${containerWidth}\u0000${fontSize}\u0000${isSessionActive ? 1 : 0}\u0000${messageId}`;
}

export function restoreCachedMeasuredHeights(
  messages: ChatMessage[],
  {
    activeMessageId,
    cacheKey,
    containerWidth,
    fontSize = MARKDOWN_BODY_FONT_SIZE,
    isSessionActive,
  }: Pick<BuildChatMessageFrameLayoutOptions, 'activeMessageId' | 'cacheKey' | 'containerWidth' | 'fontSize' | 'isSessionActive'>,
): Map<string, number> {
  const normalizedWidth = normalizeChatContainerWidth(containerWidth);
  const normalizedFontSize = normalizeMarkdownBodyFontSize(fontSize);
  const restored = new Map<string, number>();

  for (const message of messages) {
    const shouldUseActiveCache = activeMessageId === undefined
      ? isSessionActive
      : isSessionActive && message.id === activeMessageId;
    const key = getMeasuredHeightCacheKey(
      cacheKey,
      normalizedWidth,
      normalizedFontSize,
      shouldUseActiveCache,
      message.id,
    );
    const cached = measuredHeightCache.get(key);
    if (!cached || cached.signature !== getMessageSignature(message)) {
      continue;
    }

    measuredHeightCache.delete(key);
    measuredHeightCache.set(key, cached);
    restored.set(message.id, cached.height);
  }

  return restored;
}

export function rememberMeasuredChatMessageHeight(
  message: ChatMessage,
  {
    cacheKey,
    containerWidth,
    fontSize = MARKDOWN_BODY_FONT_SIZE,
    isSessionActive,
    height,
  }: Pick<BuildChatMessageFrameLayoutOptions, 'cacheKey' | 'containerWidth' | 'fontSize' | 'isSessionActive'> & { height: number },
): void {
  const normalizedWidth = normalizeChatContainerWidth(containerWidth);
  const normalizedFontSize = normalizeMarkdownBodyFontSize(fontSize);
  const normalizedHeight = Math.max(1, Math.ceil(height));
  setMeasuredHeightCacheEntry(
    getMeasuredHeightCacheKey(cacheKey, normalizedWidth, normalizedFontSize, isSessionActive, message.id),
    {
      height: normalizedHeight,
      signature: getMessageSignature(message),
    },
  );
}

export function buildEstimatedChatMessageFrameLayout(
  messages: ChatMessage[],
  {
    cacheKey,
    containerWidth,
    fontSize = MARKDOWN_BODY_FONT_SIZE,
    isSessionActive,
  }: Pick<BuildChatMessageFrameLayoutOptions, 'cacheKey' | 'containerWidth' | 'fontSize' | 'isSessionActive'>,
): ChatMessageFrameLayout {
  const normalizedWidth = normalizeChatContainerWidth(containerWidth);
  const normalizedFontSize = normalizeMarkdownBodyFontSize(fontSize);
  const key = getFrameLayoutCacheKey(cacheKey, normalizedWidth, normalizedFontSize, isSessionActive);
  const messageSignatures = getMessageSignatures(messages);
  const cached = estimatedFrameLayoutCache.get(key);
  if (cached && areMessageSignaturesEqual(cached.messageSignatures, messageSignatures)) {
    return cached.layout;
  }

  const sharedPrefixLength = cached
    ? getSharedMessagePrefixLength(cached.messageSignatures, messageSignatures)
    : 0;
  const items = sharedPrefixLength > 0
    ? cached!.layout.items.slice(0, sharedPrefixLength)
    : [];
  let offset = sharedPrefixLength > 0
    ? items[items.length - 1]!.bottom + (sharedPrefixLength < messages.length ? CHAT_MESSAGE_LIST_GAP : 0)
    : CHAT_MESSAGE_LIST_TOP_PADDING;

  for (let index = sharedPrefixLength; index < messages.length; index += 1) {
    const message = messages[index]!;
    const estimatedHeight = estimateChatMessageHeight(message, {
      containerWidth: normalizedWidth,
      fontSize: normalizedFontSize,
      isStreaming: isSessionActive && index === messages.length - 1,
    });
    const height = Math.max(1, Math.ceil(estimatedHeight));
    const top = offset;
    const bottom = top + height;

    items.push({
      bottom,
      height,
      id: message.id,
      index,
      top,
    });

    offset = bottom;
    if (index < messages.length - 1) {
      offset += CHAT_MESSAGE_LIST_GAP;
    }
  }

  const layout = {
    endOffset: offset,
    items,
  };
  setEstimatedFrameLayoutCacheEntry(key, { layout, messageSignatures });
  return layout;
}
