import {
  MAX_CHAT_MESSAGE_IMAGE_SOURCE_ENTRIES,
  MAX_CHAT_MESSAGE_IMAGE_SOURCES,
} from '@/components/Chat/common/messageClipboard';
import type { ChatMessage } from '@/lib/ai/types';
import { extractChatMessageImageSources } from '@/lib/ai/chatImageSourcePolicy';

export interface ChatImageGalleryItem {
  id: string;
  src: string;
}

export interface DerivedCollection<T> {
  items: T[];
  signature: string;
}

export interface CachedMessageDerivatives {
  message: ChatMessage;
  imageGallery: DerivedCollection<ChatImageGalleryItem>;
  sentUserMessages: DerivedCollection<string>;
  assistantContentMayContainImageToken: boolean;
}

export interface ChatDerivativeAggregate {
  imageGallery: DerivedCollection<ChatImageGalleryItem>;
  sentUserMessages: DerivedCollection<string>;
  imageContributions: CachedMessageDerivatives[];
  sentUserContributions: CachedMessageDerivatives[];
}

export const MAX_CHAT_DERIVATIVE_SIGNATURE_HASH_CHARS = 8192;

function hashString(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function getDerivativeSignatureValue(value: string): string {
  if (value.length <= MAX_CHAT_DERIVATIVE_SIGNATURE_HASH_CHARS) {
    return `${value.length}:${hashString(value)}`;
  }

  const edgeLength = Math.floor(MAX_CHAT_DERIVATIVE_SIGNATURE_HASH_CHARS / 2);
  const sampledValue = `${value.slice(0, edgeLength)}\u0000${value.slice(-edgeLength)}`;
  return `${value.length}:large:${hashString(sampledValue)}`;
}

function areImageGalleryItemsEqual(
  left: readonly ChatImageGalleryItem[],
  right: readonly ChatImageGalleryItem[],
): boolean {
  if (left.length !== right.length) return false;
  return left.every((item, index) => {
    const other = right[index];
    return other !== undefined && item.id === other.id && item.src === other.src;
  });
}

function areStringItemsEqual(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((item, index) => item === right[index]);
}

function messageContentMayContainImageToken(content: string): boolean {
  return content.includes('![') || content.includes('<');
}

function buildMessageImageGallery(
  message: ChatMessage,
  contentMayContainImageToken: boolean,
): DerivedCollection<ChatImageGalleryItem> {
  if (message.role !== 'assistant') return { items: [], signature: '' };
  const renderableSources = contentMayContainImageToken
    ? extractChatMessageImageSources(message.content || '', {
        maxSources: MAX_CHAT_MESSAGE_IMAGE_SOURCES,
        maxTokens: MAX_CHAT_MESSAGE_IMAGE_SOURCE_ENTRIES,
      })
    : [];
  if (renderableSources.length === 0) return { items: [], signature: '' };
  return {
    items: renderableSources.map((src, index) => ({ id: `${message.id}:${index}`, src })),
    signature: `${message.id}\u0000${renderableSources.length}\u0000${renderableSources.map(getDerivativeSignatureValue).join('\u0002')}`,
  };
}

function buildMessageSentUserMessages(message: ChatMessage): DerivedCollection<string> {
  if (message.role !== 'user' || !message.content.trim()) return { items: [], signature: '' };
  return {
    items: [message.content],
    signature: `${message.id}\u0000${message.currentVersionIndex}\u0000${getDerivativeSignatureValue(message.content)}`,
  };
}

function canReuseEmptyAssistantImageGallery(
  cached: CachedMessageDerivatives | undefined,
  message: ChatMessage,
): boolean {
  if (
    !cached
    || cached.message.role !== 'assistant'
    || message.role !== 'assistant'
    || cached.imageGallery.signature
    || cached.assistantContentMayContainImageToken
  ) {
    return false;
  }
  const previousContent = cached.message.content || '';
  const nextContent = message.content || '';
  if (!nextContent.startsWith(previousContent)) return false;
  return !messageContentMayContainImageToken(
    nextContent.slice(Math.max(0, previousContent.length - 1)),
  );
}

function buildMessageDerivatives(
  message: ChatMessage,
  reusableImageGallery?: DerivedCollection<ChatImageGalleryItem>,
): CachedMessageDerivatives {
  const assistantContentMayContainImageToken =
    !reusableImageGallery
    && message.role === 'assistant'
    && messageContentMayContainImageToken(message.content || '');
  return {
    message,
    imageGallery: reusableImageGallery
      ?? buildMessageImageGallery(message, assistantContentMayContainImageToken),
    sentUserMessages: buildMessageSentUserMessages(message),
    assistantContentMayContainImageToken,
  };
}

export function getCachedMessageDerivatives(
  cache: Map<string, CachedMessageDerivatives>,
  message: ChatMessage,
): CachedMessageDerivatives {
  const cached = cache.get(message.id);
  if (cached?.message === message) return cached;
  const next = buildMessageDerivatives(
    message,
    canReuseEmptyAssistantImageGallery(cached, message) ? cached!.imageGallery : undefined,
  );
  cache.set(message.id, next);
  return next;
}

function stabilizeCollection<T>(
  next: DerivedCollection<T>,
  previous: DerivedCollection<T>,
  areItemsEqual: (left: readonly T[], right: readonly T[]) => boolean,
) {
  return next.signature === previous.signature && areItemsEqual(next.items, previous.items)
    ? previous
    : next;
}

function finalizeAggregate(
  imageContributions: CachedMessageDerivatives[],
  sentUserContributions: CachedMessageDerivatives[],
  previous: ChatDerivativeAggregate,
): ChatDerivativeAggregate {
  const imageContributionsChanged = imageContributions !== previous.imageContributions;
  const sentUserContributionsChanged = sentUserContributions !== previous.sentUserContributions;
  if (!imageContributionsChanged && !sentUserContributionsChanged) return previous;

  const imageItems: ChatImageGalleryItem[] = [];
  const imageSignatureParts: string[] = [];
  if (imageContributionsChanged) {
    for (const contribution of imageContributions) {
      const remaining = MAX_CHAT_MESSAGE_IMAGE_SOURCES - imageItems.length;
      if (remaining <= 0) break;
      imageItems.push(...contribution.imageGallery.items.slice(0, remaining));
      imageSignatureParts.push(contribution.imageGallery.signature);
    }
  }
  const nextImageGallery = imageContributionsChanged
    ? stabilizeCollection(
      { items: imageItems, signature: imageSignatureParts.join('\u0001') },
      previous.imageGallery,
      areImageGalleryItemsEqual,
    )
    : previous.imageGallery;
  const nextSentUserMessages = sentUserContributionsChanged
    ? stabilizeCollection(
      {
        items: sentUserContributions.flatMap(
          (contribution) => contribution.sentUserMessages.items,
        ),
        signature: sentUserContributions
          .map((contribution) => contribution.sentUserMessages.signature)
          .join('\u0001'),
      },
      previous.sentUserMessages,
      areStringItemsEqual,
    )
    : previous.sentUserMessages;
  return {
    imageGallery: nextImageGallery,
    sentUserMessages: nextSentUserMessages,
    imageContributions,
    sentUserContributions,
  };
}

export function createEmptyChatDerivativeAggregate(): ChatDerivativeAggregate {
  return {
    imageGallery: { items: [], signature: '' },
    sentUserMessages: { items: [], signature: '' },
    imageContributions: [],
    sentUserContributions: [],
  };
}

export function buildChatDerivativeAggregate(
  messages: readonly ChatMessage[],
  cache: Map<string, CachedMessageDerivatives>,
  previous: ChatDerivativeAggregate,
): ChatDerivativeAggregate {
  const imageContributions: CachedMessageDerivatives[] = [];
  const sentUserContributions: CachedMessageDerivatives[] = [];
  let imageCount = 0;
  for (const message of messages) {
    const contribution = cache.get(message.id);
    if (!contribution || contribution.message !== message) continue;
    if (contribution.imageGallery.signature && imageCount < MAX_CHAT_MESSAGE_IMAGE_SOURCES) {
      imageContributions.push(contribution);
      imageCount += contribution.imageGallery.items.length;
    }
    if (contribution.sentUserMessages.signature) {
      if (sentUserContributions.length >= MAX_CHAT_MESSAGE_IMAGE_SOURCES) {
        sentUserContributions.shift();
      }
      sentUserContributions.push(contribution);
    }
  }
  return finalizeAggregate(imageContributions, sentUserContributions, previous);
}

export function updateChatDerivativeAggregateTail(
  previousMessages: readonly ChatMessage[],
  nextMessages: readonly ChatMessage[],
  cache: Map<string, CachedMessageDerivatives>,
  previous: ChatDerivativeAggregate,
): ChatDerivativeAggregate {
  const removedIds = new Set(previousMessages.map((message) => message.id));
  let imageContributions = removeTailContributions(previous.imageContributions, removedIds);
  let sentUserContributions = removeTailContributions(previous.sentUserContributions, removedIds);
  let imageCount = imageContributions.reduce(
    (count, contribution) => count + contribution.imageGallery.items.length,
    0,
  );
  for (const message of nextMessages) {
    const contribution = getCachedMessageDerivatives(cache, message);
    if (contribution.imageGallery.signature && imageCount < MAX_CHAT_MESSAGE_IMAGE_SOURCES) {
      if (imageContributions === previous.imageContributions) {
        imageContributions = [...imageContributions];
      }
      imageContributions.push(contribution);
      imageCount += contribution.imageGallery.items.length;
    }
    if (contribution.sentUserMessages.signature) {
      if (sentUserContributions === previous.sentUserContributions) {
        sentUserContributions = [...sentUserContributions];
      }
      if (sentUserContributions.length >= MAX_CHAT_MESSAGE_IMAGE_SOURCES) {
        sentUserContributions.shift();
      }
      sentUserContributions.push(contribution);
    }
  }
  return finalizeAggregate(imageContributions, sentUserContributions, previous);
}

function removeTailContributions(
  contributions: CachedMessageDerivatives[],
  removedIds: ReadonlySet<string>,
): CachedMessageDerivatives[] {
  if (!contributions.some((contribution) => removedIds.has(contribution.message.id))) {
    return contributions;
  }
  return contributions.filter((contribution) => !removedIds.has(contribution.message.id));
}
