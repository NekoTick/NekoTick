import { memo, useCallback, useLayoutEffect, useMemo, useState } from 'react';
import { OverlayScrollArea } from '@/components/ui/overlay-scroll-area';
import { cn } from '@/lib/utils';
import {
  buildChatMessageFrameLayout,
  buildTrailingChatLayout,
  resolveChatMessageListOverscan,
  resolveVisibleChatMessageRange,
} from '@/components/Chat/features/Layout/chatMessageFrames';
import { normalizeChatContainerWidth } from '@/components/Chat/features/Layout/chatWidthBuckets';
import { themeRenderingTokens } from '@/styles/themeTokens';
import { ChatMessageOutlineRail } from './ChatMessageOutlineRail';
import { MessageListContent } from './MessageListContent';
import type { MessageListProps } from './MessageListTypes';
import { buildRenderedMessageState } from './messageListState';
import { TAIL_ANCHOR_THRESHOLD, useMessageListViewport } from './useMessageListViewport';
import { useMessageListMeasurement } from './useMessageListMeasurement';
import { useChatMessageNavigation } from './useChatMessageNavigation';
import { useUIStore } from '@/stores/uiSlice';

export const MessageList = memo(function MessageList({
  active = true,
  chatId,
  messages,
  getImageGallery,
  isSessionActive,
  showLoading,
  isLayoutCentered,
  useOverlayScrollbar = false,
  showMessageOutline = false,
  spacerHeight,
  currentTurnTopSpacerHeight = 0,
  containerRef,
  navigationRef,
  onCopy,
  onFork,
  onRegenerate,
  onEdit,
  onSwitchVersion
}: MessageListProps) {
  const fontSize = useUIStore((state) => state.fontSize);
  const [pinnedLayoutMessageId, setPinnedLayoutMessageId] = useState<string | null>(null);
  const renderedState = useMemo(
    () => buildRenderedMessageState(messages),
    [messages],
  );
  const renderedRows = renderedState.rows;
  const renderedMessages = renderedState.messages;
  const isEmpty = renderedMessages.length === 0;
  const {
    activeRef,
    isScrollActive,
    isTailDetached,
    scrollTop,
    viewportHeight,
    viewportWidth,
  } = useMessageListViewport({
    active,
    containerRef,
    isEmpty,
    isSessionActive,
    renderedMessageCount: renderedMessages.length,
    useOverlayScrollbar,
  });
  const layoutWidth = useMemo(
    () => (viewportWidth > 0 ? normalizeChatContainerWidth(viewportWidth) : 0),
    [viewportWidth]
  );
  const lastStreamingMessageId = isSessionActive
    ? renderedMessages[renderedMessages.length - 1]?.id ?? null
    : null;
  const activeMeasuredMessageId =
    isSessionActive && renderedMessages[renderedMessages.length - 1]?.role === 'assistant'
      ? renderedMessages[renderedMessages.length - 1]!.id
      : null;
  const { getVisibleRowRef, measuredHeights, remeasureVisibleRow } = useMessageListMeasurement({
    active,
    activeMeasuredMessageId,
    activeRef,
    chatId,
    fontSize,
    isScrollActive,
    isSessionActive,
    lastStreamingMessageId,
    layoutWidth,
    renderedMessages,
    renderedState,
  });

  const frameLayout = useMemo(
    () => buildChatMessageFrameLayout(renderedMessages, {
      activeMessageId: activeMeasuredMessageId,
      cacheKey: chatId,
      containerWidth: Math.max(layoutWidth, 1),
      fontSize,
      isSessionActive,
      measuredHeights,
    }),
    [activeMeasuredMessageId, chatId, fontSize, isSessionActive, layoutWidth, measuredHeights, renderedMessages]
  );

  const positionedFrameLayout = useMemo(() => {
    if (currentTurnTopSpacerHeight <= 0) {
      return frameLayout;
    }

    return {
      endOffset: frameLayout.endOffset + currentTurnTopSpacerHeight,
      items: frameLayout.items.map((frame) => ({
        ...frame,
        bottom: frame.bottom + currentTurnTopSpacerHeight,
        top: frame.top + currentTurnTopSpacerHeight,
      })),
    };
  }, [currentTurnTopSpacerHeight, frameLayout]);

  const {
    activeMessageId: activeOutlineMessageId,
    scrollToMessage,
  } = useChatMessageNavigation({
    containerRef,
    frames: positionedFrameLayout.items,
    navigationRef,
    renderedRows,
    scrollTop,
  });

  const trailingLayout = useMemo(
    () => buildTrailingChatLayout(positionedFrameLayout, showLoading, spacerHeight),
    [positionedFrameLayout, showLoading, spacerHeight]
  );

  const visibleRange = useMemo(() => {
    const shouldAnchorTail =
      (isSessionActive || showLoading || spacerHeight > 0) &&
      !isScrollActive &&
      !isTailDetached &&
      trailingLayout.totalHeight - (scrollTop + viewportHeight) <= TAIL_ANCHOR_THRESHOLD;
    const overscan = resolveChatMessageListOverscan({
      anchorTail: shouldAnchorTail,
      isSessionActive: isSessionActive || showLoading,
      viewportHeight,
    });

    return resolveVisibleChatMessageRange(positionedFrameLayout.items, {
      anchorTail: shouldAnchorTail,
      overscan,
      scrollTop,
      viewportHeight,
    });
  }, [
    isSessionActive,
    isScrollActive,
    isTailDetached,
    positionedFrameLayout.items,
    scrollTop,
    showLoading,
    spacerHeight,
    trailingLayout.totalHeight,
    viewportHeight,
  ]);

  const visibleFrames = useMemo(
    () => {
      const frames = positionedFrameLayout.items.slice(visibleRange.start, visibleRange.end);
      if (!pinnedLayoutMessageId || frames.some((frame) => frame.id === pinnedLayoutMessageId)) {
        return frames;
      }

      const pinnedFrame = positionedFrameLayout.items.find(
        (frame) => frame.id === pinnedLayoutMessageId,
      );
      if (!pinnedFrame) {
        return frames;
      }

      return [...frames, pinnedFrame].sort((left, right) => left.index - right.index);
    },
    [pinnedLayoutMessageId, positionedFrameLayout.items, visibleRange.end, visibleRange.start]
  );

  useLayoutEffect(() => {
    if (!pinnedLayoutMessageId) {
      return;
    }

    const pinnedIndex = positionedFrameLayout.items.findIndex(
      (frame) => frame.id === pinnedLayoutMessageId,
    );
    if (pinnedIndex < 0) {
      setPinnedLayoutMessageId(null);
      return;
    }
    if (pinnedIndex >= visibleRange.start && pinnedIndex < visibleRange.end) {
      setPinnedLayoutMessageId(null);
    }
  }, [pinnedLayoutMessageId, positionedFrameLayout.items, visibleRange.end, visibleRange.start]);

  const handleUserMessageLayoutChange = useCallback((messageId: string) => {
    setPinnedLayoutMessageId(messageId);
    remeasureVisibleRow(messageId);
  }, [remeasureVisibleRow]);

  const content = (
    <MessageListContent
      getImageGallery={getImageGallery}
      getVisibleRowRef={getVisibleRowRef}
      isEmpty={isEmpty}
      isScrollActive={isScrollActive}
      isSessionActive={isSessionActive}
      layoutWidth={layoutWidth}
      onCopy={onCopy}
      onEdit={onEdit}
      onFork={onFork}
      onRegenerate={onRegenerate}
      onSwitchVersion={onSwitchVersion}
      onUserMessageLayoutChange={handleUserMessageLayoutChange}
      renderedMessageCount={renderedMessages.length}
      renderedRows={renderedRows}
      showLoading={showLoading}
      spacerHeight={spacerHeight}
      trailingLayout={trailingLayout}
      visibleFrames={visibleFrames}
    />
  );
  const outline = showMessageOutline ? (
    <ChatMessageOutlineRail
      activeMessageId={activeOutlineMessageId}
      enabled={active}
      messages={renderedMessages}
      onSelect={scrollToMessage}
    />
  ) : null;

  if (useOverlayScrollbar) {
    return (
      <>
        <OverlayScrollArea
          ref={containerRef}
          data-chat-scrollable="true"
          aria-busy={isSessionActive || showLoading || undefined}
          style={{ overflowAnchor: themeRenderingTokens.overflowAnchorNone }}
          className={cn(
            'transition-opacity duration-[var(--vlaina-duration-150)]',
            isEmpty ? 'pointer-events-none opacity-[var(--vlaina-opacity-0)]' : 'opacity-[var(--vlaina-opacity-100)]',
            isLayoutCentered && 'hidden',
          )}
          viewportClassName="h-full"
          scrollbarVariant="compact"
        >
          {content}
        </OverlayScrollArea>
        {outline}
      </>
    );
  }

  return (
    <>
      <div
        data-chat-scrollable="true"
        aria-busy={isSessionActive || showLoading || undefined}
        style={{ overflowAnchor: themeRenderingTokens.overflowAnchorNone }}
        className={cn(
          'flex-1 overflow-x-hidden overflow-y-auto transition-opacity duration-[var(--vlaina-duration-150)]',
          isEmpty ? 'pointer-events-none opacity-[var(--vlaina-opacity-0)]' : 'opacity-[var(--vlaina-opacity-100)]',
          isLayoutCentered && 'hidden',
        )}
        ref={containerRef}
      >
        {content}
      </div>
      {outline}
    </>
  );
});
