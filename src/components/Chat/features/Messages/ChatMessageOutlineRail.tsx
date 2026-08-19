import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  getSidebarIdleRowSurfaceClass,
  getSidebarLabelClass,
  getSidebarSelectedRowSurfaceClass,
} from '@/components/layout/sidebar/sidebarLabelStyles';
import { raisedPillSurfaceClass } from '@/components/ui/surfaceStyles';
import { useI18n } from '@/lib/i18n';
import type { ChatMessage } from '@/lib/ai/types';
import { cn } from '@/lib/utils';
import { themeChatLayoutTokens, themeDomStyleTokens } from '@/styles/themeTokens';
import { parseUserMessageContentWithKnownImages } from './components/userMessageContent';
import './chat-message-outline.css';

interface ChatMessageOutlineRailProps {
  activeMessageId: string | null;
  enabled: boolean;
  messages: ChatMessage[];
  onSelect: (messageId: string) => void;
}

const outlineTextByMessage = new WeakMap<ChatMessage, string>();
const CHAT_MESSAGE_OUTLINE_VIRTUALIZATION_THRESHOLD = 80;
const CHAT_MESSAGE_OUTLINE_VIRTUAL_OVERSCAN_ROWS = 6;

function getNormalizedOutlinePrefix(value: string): string {
  let normalized = '';
  let pendingSpace = false;
  let length = 0;

  for (const char of value) {
    if (/\s/.test(char)) {
      if (length > 0) pendingSpace = true;
      continue;
    }
    if (pendingSpace) {
      normalized += ' ';
      length += 1;
      pendingSpace = false;
      if (length >= themeChatLayoutTokens.messageOutlineLabelChars) break;
    }
    normalized += char;
    length += 1;
    if (length >= themeChatLayoutTokens.messageOutlineLabelChars) break;
  }

  return normalized;
}

export function getChatMessageOutlineLabel(
  message: ChatMessage,
  fallback: string,
): string {
  let outlineText = outlineTextByMessage.get(message);
  if (outlineText === undefined) {
    const content = message.content || '';
    outlineText = !content.includes('![') && !/<img\b/i.test(content)
      ? getNormalizedOutlinePrefix(content)
      : getNormalizedOutlinePrefix(
        parseUserMessageContentWithKnownImages(content, message.imageSources).text,
      );
    outlineTextByMessage.set(message, outlineText);
  }

  return outlineText || getNormalizedOutlinePrefix(fallback);
}

export function ChatMessageOutlineRail({
  activeMessageId,
  enabled,
  messages,
  onSelect,
}: ChatMessageOutlineRailProps) {
  const { t } = useI18n();
  const [isHovered, setIsHovered] = useState(false);
  const [hasFocus, setHasFocus] = useState(false);
  const activeRowRef = useRef<HTMLButtonElement | null>(null);
  const isPointerFocusRef = useRef(false);
  const scrollAreaRef = useRef<HTMLDivElement | null>(null);
  const isExpanded = isHovered || hasFocus;
  const items = useMemo(
    () => messages.filter((message) => message.role === 'user'),
    [messages],
  );
  const shouldVirtualize = items.length >= CHAT_MESSAGE_OUTLINE_VIRTUALIZATION_THRESHOLD;
  const activeIndex = useMemo(
    () => items.findIndex((message) => message.id === activeMessageId),
    [activeMessageId, items],
  );
  const virtualizer = useVirtualizer({
    count: items.length,
    enabled: shouldVirtualize,
    estimateSize: () => isExpanded
      ? themeChatLayoutTokens.messageOutlineExpandedRowHeightPx
      : themeChatLayoutTokens.messageOutlineCompactRowHeightPx,
    getItemKey: (index) => items[index]?.id ?? index,
    getScrollElement: () => scrollAreaRef.current,
    overscan: CHAT_MESSAGE_OUTLINE_VIRTUAL_OVERSCAN_ROWS,
  });

  useEffect(() => {
    if (!enabled || items.length === 0) {
      setIsHovered(false);
      setHasFocus(false);
    }
  }, [enabled, items.length]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      if (shouldVirtualize && activeIndex >= 0) {
        virtualizer.scrollToIndex(activeIndex, { align: 'auto' });
      } else {
        activeRowRef.current?.scrollIntoView?.({ block: 'nearest' });
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeIndex, activeMessageId, shouldVirtualize, virtualizer]);

  useLayoutEffect(() => {
    if (shouldVirtualize) virtualizer.measure();
  }, [isExpanded, shouldVirtualize, virtualizer]);

  if (!enabled || items.length === 0) {
    return null;
  }

  const renderItem = (message: ChatMessage) => {
    const isActive = message.id === activeMessageId;
    return (
      <button
        key={message.id}
        ref={isActive ? activeRowRef : undefined}
        type="button"
        aria-current={isActive ? 'location' : undefined}
        className={cn(
          'chat-message-outline-row group/sidebar-row',
          isActive && 'chat-message-outline-row-active',
          isExpanded && (
            isActive
              ? getSidebarSelectedRowSurfaceClass('chat')
              : getSidebarIdleRowSurfaceClass('chat')
          ),
        )}
        onClick={() => onSelect(message.id)}
      >
        <span
          className={cn(
            'chat-message-outline-row-text',
            isExpanded && getSidebarLabelClass('chat', { selected: isActive }),
          )}
        >
          {getChatMessageOutlineLabel(message, t('chat.attachment'))}
        </span>
      </button>
    );
  };

  return (
    <aside
      className="chat-message-outline-rail"
      data-chat-message-outline="true"
      data-expanded={isExpanded ? 'true' : 'false'}
      data-layout-resize-right-anchor="true"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => {
        isPointerFocusRef.current = false;
        setIsHovered(false);
      }}
      onPointerDownCapture={() => {
        isPointerFocusRef.current = true;
        setHasFocus(false);
      }}
      onPointerUpCapture={() => {
        isPointerFocusRef.current = false;
      }}
      onPointerCancelCapture={() => {
        isPointerFocusRef.current = false;
      }}
      onFocusCapture={() => {
        if (!isPointerFocusRef.current) {
          setHasFocus(true);
        }
      }}
      onBlurCapture={(event) => {
        const nextTarget = event.relatedTarget;
        if (!nextTarget || !event.currentTarget.contains(nextTarget as Node)) {
          setHasFocus(false);
        }
      }}
    >
      <div className={cn('chat-message-outline-panel', isExpanded && raisedPillSurfaceClass)}>
        <div ref={scrollAreaRef} className="chat-message-outline-scroll-area scrollbar-hidden">
          <div className="chat-message-outline-list">
            <nav aria-label={t('sidebar.outline')}>
              {shouldVirtualize ? (
                <div
                  data-chat-message-outline-virtual-list="true"
                  style={{
                    height: virtualizer.getTotalSize(),
                    position: themeDomStyleTokens.positionRelative,
                  }}
                >
                  {virtualizer.getVirtualItems().map((virtualRow) => {
                    const message = items[virtualRow.index];
                    if (!message) return null;
                    return (
                      <div
                        key={message.id}
                        data-index={virtualRow.index}
                        style={{
                          left: themeDomStyleTokens.numericZero,
                          position: themeDomStyleTokens.positionAbsolute,
                          top: themeDomStyleTokens.numericZero,
                          transform: `translateY(${virtualRow.start}px)`,
                          width: '100%',
                        }}
                      >
                        {renderItem(message)}
                      </div>
                    );
                  })}
                </div>
              ) : items.map(renderItem)}
            </nav>
          </div>
        </div>
      </div>
    </aside>
  );
}
