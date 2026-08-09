import { useEffect, useRef, useState } from 'react';
import type { ChatMessage } from '@/lib/ai/types';
import {
  buildChatDerivativeAggregate,
  createEmptyChatDerivativeAggregate,
  getCachedMessageDerivatives,
  updateChatDerivativeAggregateTail,
  type CachedMessageDerivatives,
  type ChatDerivativeAggregate,
  type ChatImageGalleryItem,
} from './chatMessageDerivatives';

export {
  MAX_CHAT_DERIVATIVE_SIGNATURE_HASH_CHARS,
  type ChatImageGalleryItem,
} from './chatMessageDerivatives';

interface DerivedState {
  aggregate: ChatDerivativeAggregate;
  messageCache: Map<string, CachedMessageDerivatives>;
  processedMessages: ChatMessage[] | null;
  wasStreaming: boolean;
}

interface StreamingTailUpdate {
  nextMessages: ChatMessage[];
  previousMessages: ChatMessage[];
}

const DERIVATIVE_BATCH_SIZE = 80;

function getStreamingTailUpdate(
  previous: ChatMessage[],
  next: ChatMessage[],
): StreamingTailUpdate | null {
  if (previous.length === 0 || next.length < previous.length) return null;
  if (next.length > previous.length) {
    if (next.length - previous.length > DERIVATIVE_BATCH_SIZE) return null;
    if (previous.at(-1) !== next[previous.length - 1]) return null;
    return {
      previousMessages: [],
      nextMessages: next.slice(previous.length),
    };
  }

  const previousLast = previous.at(-1);
  const nextLast = next.at(-1);
  if (
    !previousLast
    || !nextLast
    || previousLast.id !== nextLast.id
    || previousLast.role !== nextLast.role
    || (next.length > 1 && previous[next.length - 2] !== next[next.length - 2])
  ) {
    return null;
  }
  return {
    previousMessages: [previousLast],
    nextMessages: [nextLast],
  };
}

export function useStableChatMessageDerivatives(
  messages: ChatMessage[],
  isStreaming = false,
): {
  imageGallery: ChatImageGalleryItem[];
  sentUserMessages: string[];
} {
  const [, bumpRevision] = useState(0);
  const stateRef = useRef<DerivedState>({
    aggregate: createEmptyChatDerivativeAggregate(),
    messageCache: new Map(),
    processedMessages: null,
    wasStreaming: false,
  });
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  useEffect(() => {
    let cancelled = false;
    let index = 0;
    let pendingBatchTimer: number | null = null;
    const state = stateRef.current;
    const previousMessages = state.processedMessages;
    const shouldValidateCompletedStream = state.wasStreaming && !isStreaming;
    state.wasStreaming = isStreaming;

    if (!shouldValidateCompletedStream && previousMessages === messages) return;

    const tailUpdate = isStreaming && previousMessages
      ? getStreamingTailUpdate(previousMessages, messages)
      : null;
    if (!shouldValidateCompletedStream && tailUpdate) {
      const previousAggregate = state.aggregate;
      state.aggregate = updateChatDerivativeAggregateTail(
        tailUpdate.previousMessages,
        tailUpdate.nextMessages,
        state.messageCache,
        previousAggregate,
      );
      state.processedMessages = messages;
      if (
        state.aggregate.imageGallery !== previousAggregate.imageGallery
        || state.aggregate.sentUserMessages !== previousAggregate.sentUserMessages
      ) {
        bumpRevision((revision) => revision + 1);
      }
      return;
    }

    const processBatch = () => {
      pendingBatchTimer = null;
      if (cancelled) return;
      const latestMessages = messagesRef.current;
      const end = Math.min(latestMessages.length, index + DERIVATIVE_BATCH_SIZE);
      for (; index < end; index += 1) {
        getCachedMessageDerivatives(state.messageCache, latestMessages[index]!);
      }
      if (index < latestMessages.length) {
        pendingBatchTimer = window.setTimeout(processBatch, 0);
        return;
      }

      const activeMessageIds = new Set(latestMessages.map((message) => message.id));
      state.messageCache.forEach((_cached, messageId) => {
        if (!activeMessageIds.has(messageId)) state.messageCache.delete(messageId);
      });
      const previousAggregate = state.aggregate;
      state.aggregate = buildChatDerivativeAggregate(
        latestMessages,
        state.messageCache,
        previousAggregate,
      );
      state.processedMessages = latestMessages;
      if (
        state.aggregate.imageGallery !== previousAggregate.imageGallery
        || state.aggregate.sentUserMessages !== previousAggregate.sentUserMessages
      ) {
        bumpRevision((revision) => revision + 1);
      }
    };

    processBatch();
    return () => {
      cancelled = true;
      if (pendingBatchTimer !== null) window.clearTimeout(pendingBatchTimer);
    };
  }, [isStreaming, messages]);

  return {
    imageGallery: stateRef.current.aggregate.imageGallery.items,
    sentUserMessages: stateRef.current.aggregate.sentUserMessages.items,
  };
}
