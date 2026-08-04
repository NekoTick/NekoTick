import { useCallback, useLayoutEffect, useMemo } from 'react';
import type { ChatMessageFrame } from '@/components/Chat/features/Layout/chatMessageFrames';
import { themeChatLayoutTokens } from '@/styles/themeTokens';
import type {
  ChatMessageNavigationHandler,
  RenderedMessageRow,
} from './MessageListTypes';

interface UseChatMessageNavigationOptions {
  containerRef: React.RefObject<HTMLDivElement | null>;
  frames: ChatMessageFrame[];
  navigationRef?: React.RefObject<ChatMessageNavigationHandler | null>;
  renderedRows: RenderedMessageRow[];
  scrollTop: number;
}

export function useChatMessageNavigation({
  containerRef,
  frames,
  navigationRef,
  renderedRows,
  scrollTop,
}: UseChatMessageNavigationOptions) {
  const userFrames = useMemo(
    () => frames.filter((frame) => renderedRows[frame.index]?.message.role === 'user'),
    [frames, renderedRows],
  );
  const activeMessageId = useMemo(() => {
    if (userFrames.length === 0) {
      return null;
    }

    let activeId = userFrames[0]!.id;
    const activeThreshold = scrollTop + themeChatLayoutTokens.messageNavigationThresholdPx;
    for (const frame of userFrames) {
      if (frame.top > activeThreshold) {
        break;
      }
      activeId = frame.id;
    }
    return activeId;
  }, [scrollTop, userFrames]);

  const scrollToMessage = useCallback((messageId: string) => {
    const container = containerRef.current;
    const frame = userFrames.find((item) => item.id === messageId);
    if (!container || !frame) {
      return;
    }

    container.scrollTo({
      top: Math.max(0, frame.top - themeChatLayoutTokens.messageScrollOffsetPx),
      behavior: 'auto',
    });
  }, [containerRef, userFrames]);

  const navigateMessages = useCallback<ChatMessageNavigationHandler>((direction) => {
    const container = containerRef.current;
    if (!container || userFrames.length === 0) {
      return;
    }

    const currentScroll = container.scrollTop;
    let targetTop: number | null = null;
    for (const frame of userFrames) {
      if (direction === 'prev') {
        if (frame.top < currentScroll - themeChatLayoutTokens.messageNavigationThresholdPx) {
          targetTop = frame.top;
        }
      } else if (frame.top > currentScroll + themeChatLayoutTokens.messageNavigationThresholdPx) {
        targetTop = frame.top;
        break;
      }
    }

    if (targetTop !== null) {
      container.scrollTo({
        top: Math.max(0, targetTop - themeChatLayoutTokens.messageScrollOffsetPx),
        behavior: 'smooth',
      });
      return;
    }

    container.scrollTo({
      top: direction === 'prev' ? 0 : container.scrollHeight,
      behavior: 'smooth',
    });
  }, [containerRef, userFrames]);

  useLayoutEffect(() => {
    if (!navigationRef) {
      return;
    }
    navigationRef.current = navigateMessages;
    return () => {
      if (navigationRef.current === navigateMessages) {
        navigationRef.current = null;
      }
    };
  }, [navigateMessages, navigationRef]);

  return { activeMessageId, scrollToMessage };
}
