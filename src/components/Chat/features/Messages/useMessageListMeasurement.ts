import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import type { ChatMessage } from '@/lib/ai/types';
import {
  rememberMeasuredChatMessageHeight,
  restoreCachedMeasuredHeights,
} from '@/components/Chat/features/Layout/chatMessageFrames';
import type { RenderedMessageState } from './MessageListTypes';
import { areMeasuredHeightsEqual } from './messageListState';

interface UseMessageListMeasurementOptions {
  active: boolean;
  activeMeasuredMessageId: string | null;
  activeRef: React.MutableRefObject<boolean>;
  chatId?: string | null;
  fontSize: number;
  isSessionActive: boolean;
  lastStreamingMessageId: string | null;
  layoutWidth: number;
  renderedMessages: ChatMessage[];
  renderedState: RenderedMessageState;
}

export function useMessageListMeasurement({
  active,
  activeMeasuredMessageId,
  activeRef,
  chatId,
  fontSize,
  isSessionActive,
  lastStreamingMessageId,
  layoutWidth,
  renderedMessages,
  renderedState,
}: UseMessageListMeasurementOptions) {
  const [measuredHeights, setMeasuredHeights] = useState<Map<string, number>>(new Map());
  const observedRowsRef = useRef(new Map<string, HTMLDivElement>());
  const visibleRowRefCallbacksRef = useRef(new Map<string, (node: HTMLDivElement | null) => void>());
  const rowResizeObserverRef = useRef<ResizeObserver | null>(null);
  const measuredHeightsRafRef = useRef<number | null>(null);
  const pendingMeasuredHeightsRef = useRef(new Map<string, number>());
  const measuredHeightsRef = useRef(measuredHeights);
  const renderedMessagesRef = useRef(renderedMessages);
  const historicalMessagesRef = useRef<ChatMessage[]>([]);
  const historicalMessagesRevisionRef = useRef(0);
  const lastStreamingMessageIdRef = useRef<string | null>(null);
  const measuredHeightContextRef = useRef({
    activeMeasuredMessageId: null as string | null,
    chatId,
    fontSize,
    isSessionActive,
    layoutWidth: 0,
    messageById: new Map<string, ChatMessage>(),
  });
  const messageById = renderedState.messageById;
  if (isSessionActive) {
    const historicalMessageCount = Math.max(0, renderedMessages.length - 1);
    const previousHistoricalMessages = historicalMessagesRef.current;
    let historicalMessagesChanged = previousHistoricalMessages.length !== historicalMessageCount;
    for (let index = 0; !historicalMessagesChanged && index < historicalMessageCount; index += 1) {
      historicalMessagesChanged = previousHistoricalMessages[index] !== renderedMessages[index];
    }
    if (historicalMessagesChanged) {
      historicalMessagesRef.current = renderedMessages.slice(0, historicalMessageCount);
      historicalMessagesRevisionRef.current += 1;
    }
  }
  const activeMessage = isSessionActive
    ? renderedMessages[renderedMessages.length - 1]
    : undefined;
  const activeMessageVersionIndex = activeMessage?.currentVersionIndex ?? null;
  const activeMessageVersionCreatedAt = activeMessageVersionIndex === null
    ? null
    : activeMessage?.versions?.[activeMessageVersionIndex]?.createdAt ?? null;
  const measuredHeightRestoreTrigger = isSessionActive
    ? [
        renderedMessages.length,
        historicalMessagesRevisionRef.current,
        activeMessageVersionIndex,
        activeMessageVersionCreatedAt,
      ].join(':')
    : renderedMessages;

  measuredHeightsRef.current = measuredHeights;
  renderedMessagesRef.current = renderedMessages;
  lastStreamingMessageIdRef.current = lastStreamingMessageId;

  useEffect(() => {
    measuredHeightContextRef.current = {
      activeMeasuredMessageId,
      chatId,
      fontSize,
      isSessionActive,
      layoutWidth,
      messageById,
    };
  }, [activeMeasuredMessageId, chatId, fontSize, isSessionActive, layoutWidth, messageById]);

  useLayoutEffect(() => {
    if (layoutWidth <= 0) {
      setMeasuredHeights((current) => (current.size === 0 ? current : new Map()));
      return;
    }

    setMeasuredHeights((current) => {
      const restored = restoreCachedMeasuredHeights(renderedMessagesRef.current, {
        activeMessageId: activeMeasuredMessageId,
        cacheKey: chatId,
        containerWidth: layoutWidth,
        fontSize,
        isSessionActive,
      });
      return areMeasuredHeightsEqual(current, restored) ? current : restored;
    });
  }, [activeMeasuredMessageId, chatId, fontSize, isSessionActive, layoutWidth, measuredHeightRestoreTrigger]);

  const flushMeasuredHeights = useCallback(() => {
    measuredHeightsRafRef.current = null;
    if (pendingMeasuredHeightsRef.current.size === 0) {
      return;
    }

    const pendingHeights = pendingMeasuredHeightsRef.current;
    pendingMeasuredHeightsRef.current = new Map();

    const {
      chatId: activeChatId,
      fontSize: activeFontSize,
      activeMeasuredMessageId,
      isSessionActive: activeIsSessionActive,
      layoutWidth: activeLayoutWidth,
      messageById: activeMessageById,
    } = measuredHeightContextRef.current;

    if (activeLayoutWidth > 0) {
      pendingHeights.forEach((height, messageId) => {
        const message = activeMessageById.get(messageId);
        if (!message) {
          return;
        }

        rememberMeasuredChatMessageHeight(message, {
          cacheKey: activeChatId,
          containerWidth: activeLayoutWidth,
          fontSize: activeFontSize,
          isSessionActive: activeIsSessionActive && message.id === activeMeasuredMessageId,
          height,
        });
      });
    }

    setMeasuredHeights((current) => {
      let next = current;
      let didChange = false;

      pendingHeights.forEach((height, messageId) => {
        if (!activeMessageById.has(messageId)) {
          return;
        }
        if (next.get(messageId) === height) {
          return;
        }

        if (!didChange) {
          next = new Map(current);
          didChange = true;
        }
        next.set(messageId, height);
      });

      return didChange ? next : current;
    });
  }, []);

  const scheduleMeasuredHeight = useCallback((messageId: string, nextHeight: number) => {
    if (!Number.isFinite(nextHeight) || nextHeight <= 0) {
      return;
    }

    const normalizedHeight = Math.max(1, Math.ceil(nextHeight));
    if (pendingMeasuredHeightsRef.current.get(messageId) === normalizedHeight) {
      return;
    }

    pendingMeasuredHeightsRef.current.set(messageId, normalizedHeight);
    if (measuredHeightsRafRef.current !== null) {
      return;
    }

    measuredHeightsRafRef.current = requestAnimationFrame(() => {
      flushMeasuredHeights();
    });
  }, [flushMeasuredHeights]);

  const remeasureVisibleRow = useCallback((messageId: string) => {
    const node = observedRowsRef.current.get(messageId);
    if (!node || !activeRef.current) {
      return;
    }

    const nextHeight = node.getBoundingClientRect().height;
    if (!Number.isFinite(nextHeight) || nextHeight <= 0) {
      return;
    }

    const normalizedHeight = Math.max(1, Math.ceil(nextHeight));
    pendingMeasuredHeightsRef.current.set(messageId, normalizedHeight);
    if (measuredHeightsRafRef.current !== null) {
      cancelAnimationFrame(measuredHeightsRafRef.current);
      measuredHeightsRafRef.current = null;
    }
    flushMeasuredHeights();
  }, [activeRef, flushMeasuredHeights]);

  const shouldMeasureVisibleRowSynchronously = useCallback((messageId: string) => {
    if (messageId === lastStreamingMessageIdRef.current) {
      return true;
    }

    return !measuredHeightsRef.current.has(messageId);
  }, []);

  useEffect(() => {
    if (!active) {
      return;
    }

    if (typeof ResizeObserver === 'undefined') {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      if (!activeRef.current) {
        return;
      }

      for (const entry of entries) {
        const element = entry.target as HTMLDivElement;
        const messageId = element.dataset.messageId;
        if (!messageId) {
          continue;
        }
        scheduleMeasuredHeight(messageId, entry.contentRect.height);
      }
    });

    rowResizeObserverRef.current = observer;
    observedRowsRef.current.forEach((node, messageId) => {
      node.dataset.messageId = messageId;
      observer.observe(node);
      if (shouldMeasureVisibleRowSynchronously(messageId)) {
        scheduleMeasuredHeight(messageId, node.getBoundingClientRect().height);
      }
    });

    return () => {
      rowResizeObserverRef.current = null;
      observer.disconnect();
      if (measuredHeightsRafRef.current !== null) {
        cancelAnimationFrame(measuredHeightsRafRef.current);
        measuredHeightsRafRef.current = null;
      }
      pendingMeasuredHeightsRef.current.clear();
    };
  }, [active, activeRef, flushMeasuredHeights, scheduleMeasuredHeight, shouldMeasureVisibleRowSynchronously]);

  useLayoutEffect(() => {
    if (!active) {
      return;
    }

    if (!lastStreamingMessageId) {
      return;
    }

    const node = observedRowsRef.current.get(lastStreamingMessageId);
    if (!node) {
      return;
    }

    scheduleMeasuredHeight(lastStreamingMessageId, node.getBoundingClientRect().height);
  }, [active, lastStreamingMessageId, scheduleMeasuredHeight]);

  const bindVisibleRow = useCallback((messageId: string, node: HTMLDivElement | null) => {
    const previous = observedRowsRef.current.get(messageId);
    if (previous && rowResizeObserverRef.current) {
      rowResizeObserverRef.current.unobserve(previous);
    }

    if (!node) {
      observedRowsRef.current.delete(messageId);
      return;
    }

    node.dataset.messageId = messageId;
    observedRowsRef.current.set(messageId, node);
    rowResizeObserverRef.current?.observe(node);
    if (activeRef.current && shouldMeasureVisibleRowSynchronously(messageId)) {
      scheduleMeasuredHeight(messageId, node.getBoundingClientRect().height);
    }
  }, [activeRef, scheduleMeasuredHeight, shouldMeasureVisibleRowSynchronously]);
  const bindVisibleRowRef = useRef(bindVisibleRow);

  useEffect(() => {
    bindVisibleRowRef.current = bindVisibleRow;
  }, [bindVisibleRow]);

  useEffect(() => {
    visibleRowRefCallbacksRef.current.forEach((_callback, messageId) => {
      if (!renderedState.ids.has(messageId)) {
        visibleRowRefCallbacksRef.current.delete(messageId);
      }
    });
  }, [renderedState]);

  const getVisibleRowRef = useCallback((messageId: string) => {
    const cached = visibleRowRefCallbacksRef.current.get(messageId);
    if (cached) {
      return cached;
    }

    const callback = (node: HTMLDivElement | null) => {
      bindVisibleRowRef.current(messageId, node);
    };
    visibleRowRefCallbacksRef.current.set(messageId, callback);
    return callback;
  }, []);

  return {
    getVisibleRowRef,
    measuredHeights,
    remeasureVisibleRow,
  };
}
