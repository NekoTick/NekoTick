import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import type { Attachment } from '@/lib/storage/attachmentStorage';
import {
  chatComposerFrameClass,
  chatComposerSurfaceClass,
} from '../../Input/composerStyles';
import { secondaryPillButtonClass } from '@/components/ui/surfaceStyles';
import { ChatAttachmentPreviewList } from '../../Input/components/ChatAttachmentPreviewList';
import { ChatComposerField } from '../../Input/components/ChatComposerField';
import type { ChatMessage } from '@/lib/ai/types';
import { NoteMentionPicker } from '@/components/Chat/features/Input/components/NoteMentionPicker';
import { usePredictedTextareaHeight } from '@/hooks/usePredictedTextareaHeight';
import { focusVisibleTextareaAt } from '@/lib/ui/composerFocusRegistry';
import { requestNativeCaretOverlayRefresh } from '@/hooks/useNativeCaretOverlay';
import {
  limitChatComposerText,
  MAX_CHAT_COMPOSER_INTERACTIVE_TEXT_CHARS,
} from '@/lib/ui/composerTextLimit';
import {
  composeUserMessageContent,
  type ParsedUserMessageContent,
  toEditAttachment,
} from './userMessageContent';
import { useUserMessageEditorMentions } from './useUserMessageEditorMentions';
import { useI18n } from '@/lib/i18n';
import { themeChatComposerTokens, themeMotionTokens, themeRenderingTokens } from '@/styles/themeTokens';

interface UserMessageEditorProps {
  message: ChatMessage;
  parsedContent: ParsedUserMessageContent;
  onClose: () => void;
  onEdit?: (id: string, newContent: string) => void;
}

export function UserMessageEditor({
  message,
  parsedContent,
  onClose,
  onEdit,
}: UserMessageEditorProps) {
  const { t } = useI18n();
  const content = message.content || '';
  const [editValue, setEditValue] = useState(() => limitChatComposerText(parsedContent.text));
  const [editAttachments, setEditAttachments] = useState<Attachment[]>(() =>
    parsedContent.imageSources.map((src, index) => toEditAttachment(src, index))
  );
  const [isComposing, setIsComposing] = useState(false);
  const isComposingRef = useRef(false);
  const editTextareaRef = useRef<HTMLTextAreaElement>(null);
  const handleEditValueChange = useCallback((nextValue: string) => {
    setEditValue(limitChatComposerText(nextValue));
  }, []);

  const {
    currentPageCandidates,
    folderCandidates,
    linkedPageCandidates,
    mentionPreviewParts,
    showMentionPicker,
    mentionPickerStatus,
    activeCandidatePath,
    textareaScrollTop,
    handleValueChange,
    handleCaretBlur,
    handleMentionKeyDown,
    setTextareaScrollTop,
    setCaretIndex,
    applyMentionCandidate,
    removeMention,
  } = useUserMessageEditorMentions({
    value: editValue,
    onValueChange: handleEditValueChange,
    textareaRef: editTextareaRef,
  });

  useEffect(() => {
    const input = editTextareaRef.current;
    if (!input) {
      return;
    }

    const frameId = requestAnimationFrame(() => {
      if (!focusVisibleTextareaAt(input)) {
        return;
      }
      input.scrollTop = input.scrollHeight;
    });

    return () => cancelAnimationFrame(frameId);
  }, []);

  usePredictedTextareaHeight(editTextareaRef, {
    value: editValue,
    minHeight: themeChatComposerTokens.textareaMinHeightPx,
    maxHeight: themeChatComposerTokens.textareaMaxHeightPx,
    maxPredictedLayoutChars: MAX_CHAT_COMPOSER_INTERACTIVE_TEXT_CHARS,
  });

  const handleSave = useCallback(() => {
    if (isComposingRef.current) {
      return;
    }
    const normalized = composeUserMessageContent(limitChatComposerText(editValue), editAttachments);
    const normalizedCurrent = content.replace(/\r\n?/g, '\n');
    if (normalized.trim() !== normalizedCurrent.trim()) {
      onEdit?.(message.id, normalized);
    }
    onClose();
  }, [content, editAttachments, editValue, message.id, onClose, onEdit]);

  const handleCancel = useCallback(() => {
    onClose();
  }, [onClose]);

  const handleRemoveEditAttachment = useCallback((id: string) => {
    const caretPosition = editTextareaRef.current?.selectionStart;
    setEditAttachments((prev) => prev.filter((attachment) => attachment.id !== id));
    requestAnimationFrame(() => {
      focusVisibleTextareaAt(editTextareaRef.current, caretPosition);
    });
  }, []);

  const handleTextareaPaste = useCallback(() => {}, []);

  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const native = event.nativeEvent as KeyboardEvent & { isComposing?: boolean; keyCode?: number };
    if (handleMentionKeyDown(event)) {
      return;
    }

    if (isComposing || native.isComposing || native.keyCode === 229) {
      return;
    }

    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      event.stopPropagation();
      handleSave();
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      handleCancel();
    }
  }, [
    handleCancel,
    handleMentionKeyDown,
    handleSave,
    isComposing,
  ]);

  return (
    <motion.div
      initial={{
        opacity: themeMotionTokens.chatUserEditInitialOpacity,
        x: themeMotionTokens.chatUserEditInitialX,
      }}
      animate={{
        opacity: themeMotionTokens.opacityVisible,
        x: themeMotionTokens.chatUserEditVisibleX,
      }}
      transition={{
        duration: themeMotionTokens.chatUserEditDuration,
        ease: themeMotionTokens.standardEase,
      }}
      onUpdate={() => queueMicrotask(requestNativeCaretOverlayRefresh)}
      onAnimationComplete={requestNativeCaretOverlayRefresh}
      data-chat-message-editor="true"
      className="w-full flex justify-end pb-4"
      style={{ willChange: themeRenderingTokens.transformOpacityWillChange }}
    >
      <div className={cn('w-full', chatComposerFrameClass, chatComposerSurfaceClass)}>
        <ChatAttachmentPreviewList attachments={editAttachments} onRemove={handleRemoveEditAttachment} />
        {showMentionPicker && (
          <NoteMentionPicker
            currentPageCandidates={currentPageCandidates}
            folderCandidates={folderCandidates}
            activeCandidatePath={activeCandidatePath}
            linkedPageCandidates={linkedPageCandidates}
            status={mentionPickerStatus}
            className="left-0 right-0"
            onSelect={applyMentionCandidate}
          />
        )}
        <ChatComposerField
          textareaRef={editTextareaRef}
          message={editValue}
          ariaLabel={t('chat.editMessage')}
          placeholder=""
          textareaScrollTop={textareaScrollTop}
          mentionPreviewParts={mentionPreviewParts}
          onChange={(event) => {
            const nextValue = limitChatComposerText(event.target.value);
            handleValueChange(nextValue, Math.min(event.target.selectionStart ?? nextValue.length, nextValue.length));
          }}
          onCompositionStart={() => {
            isComposingRef.current = true;
            setIsComposing(true);
          }}
          onCompositionEnd={() => {
            isComposingRef.current = false;
            setIsComposing(false);
          }}
          onKeyDown={handleKeyDown}
          onSelect={(event) => setCaretIndex(
            event.currentTarget.selectionStart ?? 0,
            event.currentTarget.selectionEnd ?? event.currentTarget.selectionStart ?? 0,
          )}
          onClick={(event) => setCaretIndex(
            event.currentTarget.selectionStart ?? 0,
            event.currentTarget.selectionEnd ?? event.currentTarget.selectionStart ?? 0,
          )}
          onBlur={handleCaretBlur}
          onPaste={handleTextareaPaste}
          onScroll={(event) => setTextareaScrollTop(event.currentTarget.scrollTop)}
          onFocusMentionEnd={setCaretIndex}
          onRemoveMention={removeMention}
        />

        <div className="flex justify-end items-center gap-2 px-2 pb-2 pr-3">
          <button
            type="button"
            data-chat-message-editor-action="cancel"
            onClick={handleCancel}
            className={cn(
              secondaryPillButtonClass,
              'h-8 px-3.5 text-[var(--vlaina-font-13)] bg-[var(--vlaina-color-pill-surface)] hover:bg-[var(--vlaina-color-pill-surface-hover)] text-[var(--vlaina-text-primary)]'
            )}
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            data-chat-message-editor-action="save"
            onClick={handleSave}
            className="h-9 rounded-full bg-[var(--vlaina-color-user-message-editor-submit)] px-4 text-[length:var(--vlaina-font-13)] font-semibold text-[var(--vlaina-color-white)] shadow-[var(--vlaina-shadow-user-message-editor-submit)] transition-[box-shadow,transform] duration-[var(--vlaina-duration-200)] hover:bg-[var(--vlaina-color-user-message-editor-submit)] hover:scale-[var(--vlaina-scale-105)] active:scale-[var(--vlaina-scale-95)]"
          >
            {t('common.send')}
          </button>
        </div>
      </div>
    </motion.div>
  );
}
