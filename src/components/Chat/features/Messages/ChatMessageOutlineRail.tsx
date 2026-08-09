import { useEffect, useMemo, useRef, useState } from 'react';
import {
  getSidebarIdleRowSurfaceClass,
  getSidebarLabelClass,
  getSidebarSelectedRowSurfaceClass,
} from '@/components/layout/sidebar/sidebarLabelStyles';
import { raisedPillSurfaceClass } from '@/components/ui/surfaceStyles';
import { useI18n } from '@/lib/i18n';
import type { ChatMessage } from '@/lib/ai/types';
import { cn } from '@/lib/utils';
import { themeChatLayoutTokens } from '@/styles/themeTokens';
import { parseUserMessageContentWithKnownImages } from './components/userMessageContent';
import './chat-message-outline.css';

interface ChatMessageOutlineRailProps {
  activeMessageId: string | null;
  enabled: boolean;
  messages: ChatMessage[];
  onSelect: (messageId: string) => void;
}

const outlineTextByMessage = new WeakMap<ChatMessage, string>();

export function getChatMessageOutlineLabel(
  message: ChatMessage,
  fallback: string,
): string {
  let outlineText = outlineTextByMessage.get(message);
  if (outlineText === undefined) {
    const parsed = parseUserMessageContentWithKnownImages(message.content, message.imageSources);
    outlineText = parsed.text.replace(/\s+/g, ' ').trim();
    outlineTextByMessage.set(message, outlineText);
  }

  return Array.from(outlineText || fallback)
    .slice(0, themeChatLayoutTokens.messageOutlineLabelChars)
    .join('');
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
  const isExpanded = isHovered || hasFocus;
  const items = useMemo(() => messages.flatMap((message) => {
    if (message.role !== 'user') {
      return [];
    }

    return [{
      id: message.id,
      label: getChatMessageOutlineLabel(message, t('chat.attachment')),
    }];
  }), [messages, t]);

  useEffect(() => {
    if (!enabled || items.length === 0) {
      setIsHovered(false);
      setHasFocus(false);
    }
  }, [enabled, items.length]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      activeRowRef.current?.scrollIntoView?.({ block: 'nearest' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeMessageId]);

  if (!enabled || items.length === 0) {
    return null;
  }

  return (
    <aside
      className="chat-message-outline-rail"
      data-chat-message-outline="true"
      data-expanded={isExpanded ? 'true' : 'false'}
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
        <div className="chat-message-outline-scroll-area scrollbar-hidden">
          <div className="chat-message-outline-list">
            <nav aria-label={t('sidebar.outline')}>
              {items.map((item) => {
                const isActive = item.id === activeMessageId;
                return (
                  <button
                    key={item.id}
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
                    onClick={() => onSelect(item.id)}
                  >
                    <span
                      className={cn(
                        'chat-message-outline-row-text',
                        isExpanded && getSidebarLabelClass('chat', { selected: isActive }),
                      )}
                    >
                      {item.label}
                    </span>
                  </button>
                );
              })}
            </nav>
          </div>
        </div>
      </div>
    </aside>
  );
}
