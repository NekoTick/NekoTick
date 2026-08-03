import { useCallback, useRef, type ChangeEvent, type ClipboardEvent, type KeyboardEvent, type RefObject } from 'react';
import { dispatchSidebarCloseSearchEvent } from '@/components/layout/sidebar/sidebarEvents';
import { limitChatComposerText } from '@/lib/ui/composerTextLimit';
import { shouldMarkPastedTextMultiline } from '../chatPasteText';

interface HistoryKeyDownEvent {
  altKey: boolean;
  ctrlKey: boolean;
  isComposing: boolean;
  key: string;
  metaKey: boolean;
  preventDefault: () => void;
  selectionEnd: number;
  selectionStart: number;
  shiftKey: boolean;
}

interface UseChatInputEventHandlersOptions {
  clearHistoryNavigationOnInput: () => void;
  discardRemovedAttachmentUndoStack: () => void;
  handleCaretChange: (start: number, end?: number) => void;
  handleFileChange: (event: ChangeEvent<HTMLInputElement>) => Promise<void>;
  handleHistoryKeyDown: (event: HistoryKeyDownEvent) => boolean;
  handleKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  handleMentionKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => boolean;
  handleMessageChange: (message: string) => void;
  handlePaste: (event: ClipboardEvent<HTMLTextAreaElement>) => Promise<void>;
  isComposing: boolean;
  markExplicitMultiline: () => void;
  message: string;
  scheduleComposerFocus: (position?: number) => void;
  scheduleFocusOnWindowFocus: () => void;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  triggerFileSelect: () => void;
}

export function useChatInputEventHandlers({
  clearHistoryNavigationOnInput,
  discardRemovedAttachmentUndoStack,
  handleCaretChange,
  handleFileChange,
  handleHistoryKeyDown,
  handleKeyDown,
  handleMentionKeyDown,
  handleMessageChange,
  handlePaste,
  isComposing,
  markExplicitMultiline,
  message,
  scheduleComposerFocus,
  scheduleFocusOnWindowFocus,
  textareaRef,
  triggerFileSelect,
}: UseChatInputEventHandlersOptions) {
  const messageRef = useRef(message);
  messageRef.current = message;
  const handleCaretChangeRef = useRef(handleCaretChange);
  handleCaretChangeRef.current = handleCaretChange;

  const handleTextareaPaste = useCallback(
    (e: ClipboardEvent<HTMLTextAreaElement>) => {
      if (shouldMarkPastedTextMultiline(e.clipboardData.getData('text/plain'))) {
        markExplicitMultiline();
      }
      void handlePaste(e).catch(() => undefined);
    },
    [handlePaste, markExplicitMultiline]
  );

  const handleHiddenFileInputChange = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      await handleFileChange(e);
      scheduleComposerFocus();
    },
    [handleFileChange, scheduleComposerFocus]
  );

  const handleTriggerFileSelect = useCallback(() => {
    triggerFileSelect();
    scheduleFocusOnWindowFocus();
  }, [scheduleFocusOnWindowFocus, triggerFileSelect]);

  const handleTriggerMentionSelect = useCallback(() => {
    const input = textareaRef.current;
    const currentMessage = messageRef.current;
    const selectionStart = input?.selectionStart ?? currentMessage.length;
    const selectionEnd = input?.selectionEnd ?? selectionStart;
    const before = currentMessage.slice(0, selectionStart);
    const after = currentMessage.slice(selectionEnd);
    const prefix = before && !/\s$/.test(before) ? ' ' : '';
    const nextMessage = limitChatComposerText(`${before}${prefix}@${after}`);
    const nextCaret = Math.min(before.length + prefix.length + 1, nextMessage.length);

    handleMessageChange(nextMessage);
    clearHistoryNavigationOnInput();
    handleCaretChangeRef.current(nextCaret);
    scheduleComposerFocus(nextCaret);
  }, [
    clearHistoryNavigationOnInput,
    handleMessageChange,
    scheduleComposerFocus,
    textareaRef,
  ]);

  const handleTextareaKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      const native = e.nativeEvent as globalThis.KeyboardEvent & { isComposing?: boolean; keyCode?: number };
      if (isComposing || native.isComposing || native.keyCode === 229) {
        return;
      }

      const selectionStart = e.currentTarget.selectionStart ?? 0;
      const selectionEnd = e.currentTarget.selectionEnd ?? 0;

      if (handleMentionKeyDown(e)) {
        return;
      }

      if (
        e.key === 'Escape' &&
        !e.shiftKey &&
        !e.altKey &&
        !e.ctrlKey &&
        !e.metaKey
      ) {
        dispatchSidebarCloseSearchEvent('chat');
      }

      if (
        handleHistoryKeyDown({
          key: e.key,
          selectionStart,
          selectionEnd,
          shiftKey: e.shiftKey,
          altKey: e.altKey,
          ctrlKey: e.ctrlKey,
          metaKey: e.metaKey,
          isComposing,
          preventDefault: () => e.preventDefault(),
        })
      ) {
        return;
      }

      handleKeyDown(e);
    },
    [
      handleHistoryKeyDown,
      handleKeyDown,
      handleMentionKeyDown,
      isComposing,
    ]
  );

  const handleComposerChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      discardRemovedAttachmentUndoStack();
      const nextValue = limitChatComposerText(event.target.value);
      handleMessageChange(nextValue);
      clearHistoryNavigationOnInput();
      handleCaretChange(Math.min(event.target.selectionStart ?? nextValue.length, nextValue.length));
    },
    [
      clearHistoryNavigationOnInput,
      discardRemovedAttachmentUndoStack,
      handleCaretChange,
      handleMessageChange,
    ]
  );

  return {
    handleComposerChange,
    handleHiddenFileInputChange,
    handleTextareaKeyDown,
    handleTextareaPaste,
    handleTriggerFileSelect,
    handleTriggerMentionSelect,
  };
}
