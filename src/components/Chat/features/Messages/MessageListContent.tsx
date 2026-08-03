import { ChatLoading } from '@/components/Chat/features/Messages/components/ChatLoading';
import type { ChatMessageFrame } from '@/components/Chat/features/Layout/chatMessageFrames';
import { MessageItem } from './components/MessageItem';
import type { ChatImageGalleryGetter, RenderedMessageRow } from './MessageListTypes';

interface MessageListContentProps {
  getImageGallery?: ChatImageGalleryGetter;
  getVisibleRowRef: (messageId: string) => (node: HTMLDivElement | null) => void;
  isEmpty: boolean;
  isScrollActive: boolean;
  isSessionActive: boolean;
  layoutWidth: number;
  onCopy: (text: string) => Promise<boolean | void> | boolean | void;
  onEdit?: (id: string, newContent: string) => void;
  onFork?: (id: string) => void;
  onRegenerate: (id: string) => void;
  onSwitchVersion: (msgId: string, idx: number) => void;
  onUserMessageLayoutChange: (messageId: string) => void;
  renderedMessageCount: number;
  renderedRows: RenderedMessageRow[];
  showLoading: boolean;
  spacerHeight: number;
  trailingLayout: {
    loadingTop: number | null;
    spacerTop: number | null;
    totalHeight: number;
  };
  visibleFrames: ChatMessageFrame[];
}

export function MessageListContent({
  getImageGallery,
  getVisibleRowRef,
  isEmpty,
  isScrollActive,
  isSessionActive,
  layoutWidth,
  onCopy,
  onEdit,
  onFork,
  onRegenerate,
  onSwitchVersion,
  onUserMessageLayoutChange,
  renderedMessageCount,
  renderedRows,
  showLoading,
  spacerHeight,
  trailingLayout,
  visibleFrames,
}: MessageListContentProps) {
  return (
    <div className="w-full max-w-[var(--vlaina-size-850px)] mx-auto px-4">
      {!isEmpty && (
        <div
          className="relative w-full min-h-full"
          style={{ height: trailingLayout.totalHeight }}
        >
          {visibleFrames.map((frame) => {
            const row = renderedRows[frame.index]!;
            const message = row.message;
            return (
              <div
                key={frame.id}
                data-message-index={row.originalIndex}
                className="absolute left-0 right-0"
                style={{ top: frame.top }}
                ref={getVisibleRowRef(frame.id)}
              >
                <MessageItem
                  msg={message}
                  userBubbleContainerWidth={layoutWidth}
                  getImageGallery={getImageGallery}
                  isLoading={isSessionActive && frame.index === renderedMessageCount - 1}
                  isLastMessage={frame.index === renderedMessageCount - 1}
                  suspendStreamAnimation={
                    isScrollActive &&
                    isSessionActive &&
                    frame.index === renderedMessageCount - 1
                  }
                  onCopy={onCopy}
                  onFork={onFork}
                  onRegenerate={onRegenerate}
                  onEdit={onEdit}
                  onUserMessageLayoutChange={onUserMessageLayoutChange}
                  onSwitchVersion={onSwitchVersion}
                />
              </div>
            );
          })}

          {showLoading && trailingLayout.loadingTop !== null && (
            <div
              className="absolute left-0 right-0"
              style={{ top: trailingLayout.loadingTop }}
            >
              <ChatLoading />
            </div>
          )}

          {spacerHeight > 0 && trailingLayout.spacerTop !== null && (
            <div
              aria-hidden="true"
              className="absolute left-0 right-0"
              style={{
                top: trailingLayout.spacerTop,
                height: spacerHeight,
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}
