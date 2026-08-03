import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { Icon } from '@/components/ui/icons';
import { useI18n } from '@/lib/i18n';
import {
  COLLAPSED_USER_MESSAGE_VISIBLE_LINES,
  getLongUserMessagePreviewText,
  useHasVisualUserMessageOverflow,
} from './userMessageCollapse';

interface UserMessageTextBubbleProps {
  fontSize: number;
  messageId: string;
  onLayoutChange?: (messageId: string) => void;
  text: string;
  textBubbleStyle: CSSProperties;
  textBubbleWidth: number | null;
}

const collapsedTextStyle = {
  maxHeight: `calc(${COLLAPSED_USER_MESSAGE_VISIBLE_LINES} * (var(--vlaina-markdown-font-body-size) + var(--vlaina-size-8px)))`,
  overflow: 'hidden',
} as const;

export function UserMessageTextBubble({
  fontSize,
  messageId,
  onLayoutChange,
  text,
  textBubbleStyle,
  textBubbleWidth,
}: UserMessageTextBubbleProps) {
  const { t } = useI18n();
  const [isExpanded, setIsExpanded] = useState(false);
  const textContentRef = useRef<HTMLDivElement | null>(null);
  const pendingLayoutChangeRef = useRef(false);
  const collapseAnchorRef = useRef<{
    scrollable: HTMLElement;
    toggle: HTMLButtonElement;
    top: number;
  } | null>(null);
  const collapsedText = useMemo(() => getLongUserMessagePreviewText(text), [text]);
  const hasVisualOverflow = useHasVisualUserMessageOverflow({
    fontSize,
    text,
    textBubbleWidth,
    textContentRef,
  });
  const isLongMessage = collapsedText !== null || hasVisualOverflow;
  const isCollapsed = isLongMessage && !isExpanded;

  useEffect(() => {
    setIsExpanded(false);
  }, [text]);

  useLayoutEffect(() => {
    if (!pendingLayoutChangeRef.current) {
      return;
    }

    pendingLayoutChangeRef.current = false;
    const collapseAnchor = collapseAnchorRef.current;
    collapseAnchorRef.current = null;
    if (collapseAnchor) {
      const newTop = collapseAnchor.toggle.getBoundingClientRect().top;
      collapseAnchor.scrollable.scrollTop += newTop - collapseAnchor.top;
    }
    onLayoutChange?.(messageId);
  }, [isExpanded, messageId, onLayoutChange]);

  return (
    <div
      data-no-focus-input="true"
      data-chat-selection-surface="true"
      data-chat-selection-start="true"
      data-chat-long-user-message={isLongMessage ? (isExpanded ? 'expanded' : 'collapsed') : undefined}
      data-vlaina-markdown-font-size-surface="true"
      className="inline-block max-w-[var(--vlaina-size-90pct)] select-text rounded-3xl bg-[var(--vlaina-accent)] px-4 py-1.5 text-left text-[var(--vlaina-color-white)]"
      style={textBubbleStyle}
    >
      {collapsedText === null ? (
        <div
          ref={textContentRef}
          className="whitespace-pre-wrap break-words"
          style={isCollapsed ? collapsedTextStyle : undefined}
        >
          {text}
        </div>
      ) : (
        <>
          <div
            ref={isCollapsed ? textContentRef : undefined}
            data-chat-long-user-message-text="preview"
            hidden={!isCollapsed}
            className="whitespace-pre-wrap break-words"
            style={collapsedTextStyle}
          >
            {collapsedText}
          </div>
          {!isCollapsed && (
            <div
              ref={textContentRef}
              data-chat-long-user-message-text="full"
              className="whitespace-pre-wrap break-words"
            >
              {text}
            </div>
          )}
        </>
      )}
      {isLongMessage && (
        <button
          type="button"
          aria-expanded={isExpanded}
          aria-label={t(isExpanded ? 'chat.collapseMessage' : 'chat.expandMessage')}
          data-chat-long-user-message-toggle="true"
          onClick={(event) => {
            collapseAnchorRef.current = null;
            if (isExpanded) {
              const toggle = event.currentTarget;
              const scrollable = toggle.closest<HTMLElement>('[data-chat-scrollable="true"]');
              if (scrollable) {
                collapseAnchorRef.current = {
                  scrollable,
                  toggle,
                  top: toggle.getBoundingClientRect().top,
                };
              }
            }
            pendingLayoutChangeRef.current = true;
            setIsExpanded((expanded) => !expanded);
          }}
          className="mt-2 inline-flex items-center gap-1 rounded-full bg-[var(--vlaina-color-white)]/15 px-3 py-1 text-[length:var(--vlaina-font-12)] font-medium text-[var(--vlaina-color-white)] transition-colors hover:bg-[var(--vlaina-color-white)]/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vlaina-color-white)]/70"
        >
          <Icon name={isExpanded ? 'nav.chevronUp' : 'nav.chevronDown'} size="sm" />
          {t(isExpanded ? 'chat.collapseMessage' : 'chat.expandMessage')}
        </button>
      )}
    </div>
  );
}
