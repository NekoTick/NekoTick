import type {
  ChangeEvent,
  ClipboardEvent,
  CompositionEvent,
  KeyboardEvent,
  MouseEvent,
  RefObject,
} from 'react';
import { cn } from '@/lib/utils';
import {
  chatComposerInputBlockClass,
  chatComposerTextareaClass,
} from '../composerStyles';
import type { MentionPreviewPart } from '../noteMentionHelpers';
import { MentionPreviewOverlay } from './MentionPreviewOverlay';

interface ChatComposerFieldProps {
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  message: string;
  ariaLabel: string;
  placeholder: string;
  textareaScrollTop: number;
  mentionPreviewParts: MentionPreviewPart[];
  onChange: (event: ChangeEvent<HTMLTextAreaElement>) => void;
  onCompositionStart: (event: CompositionEvent<HTMLTextAreaElement>) => void;
  onCompositionEnd: (event: CompositionEvent<HTMLTextAreaElement>) => void;
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onSelect: (event: React.SyntheticEvent<HTMLTextAreaElement>) => void;
  onClick: (event: MouseEvent<HTMLTextAreaElement>) => void;
  onBlur: () => void;
  onPaste: (event: ClipboardEvent<HTMLTextAreaElement>) => void;
  onScroll: (event: React.UIEvent<HTMLTextAreaElement>) => void;
  onFocusMentionEnd: (rangeEnd: number) => void;
  onRemoveMention: (path: string, rangeStart?: number, rangeEnd?: number) => void;
  disabled?: boolean;
}

export function ChatComposerField({
  textareaRef,
  message,
  ariaLabel,
  placeholder,
  textareaScrollTop,
  mentionPreviewParts,
  onChange,
  onCompositionStart,
  onCompositionEnd,
  onKeyDown,
  onSelect,
  onClick,
  onBlur,
  onPaste,
  onScroll,
  onFocusMentionEnd,
  onRemoveMention,
  disabled = false,
}: ChatComposerFieldProps) {
  return (
    <div className={chatComposerInputBlockClass}>
      <div className="relative overflow-hidden">
        <textarea
          ref={textareaRef}
          value={message}
          spellCheck={false}
          onChange={onChange}
          onCompositionStart={onCompositionStart}
          onCompositionEnd={onCompositionEnd}
          onKeyDown={onKeyDown}
          onSelect={onSelect}
          onClick={onClick}
          onBlur={onBlur}
          onPaste={onPaste}
          onScroll={onScroll}
          aria-label={ariaLabel}
          placeholder={placeholder}
          disabled={disabled}
          rows={1}
          className={cn(
            chatComposerTextareaClass,
            'relative z-[var(--vlaina-z-10)] w-full',
            disabled && 'cursor-default text-[var(--vlaina-sidebar-chat-text-soft)] opacity-[var(--vlaina-opacity-75)]'
          )}
        />
        <MentionPreviewOverlay
          mentionPreviewParts={mentionPreviewParts}
          textareaScrollTop={textareaScrollTop}
          onFocusMentionEnd={onFocusMentionEnd}
          onRemoveMention={onRemoveMention}
        />
      </div>
    </div>
  );
}
