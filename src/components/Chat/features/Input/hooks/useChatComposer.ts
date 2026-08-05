import { useCallback, useEffect, useRef, useState } from 'react';
import {
  focusVisibleTextareaAt,
  isMountedVisibleElement,
  registerComposerFocusAdapter,
  canInsertTextIntoComposerValue,
} from '@/lib/ui/composerFocusRegistry';
import {
  limitChatComposerText,
  MAX_CHAT_COMPOSER_INTERACTIVE_TEXT_CHARS,
} from '@/lib/ui/composerTextLimit';
import type { Attachment } from '@/lib/storage/attachmentStorage';
import type { NoteMentionReference } from '@/lib/ai/noteMentions';
import { usePredictedTextareaHeight } from '@/hooks/usePredictedTextareaHeight';
import { themeChatComposerTokens } from '@/styles/themeTokens';

const INVISIBLE_BREAK_REGEX = /[\u200b\u200c\u200d\ufeff]/g;
const UNIVERSAL_NEWLINE_REGEX = /\r\n?|\u2028|\u2029|\u0085/g;

function isPromiseLike<T>(value: T | Promise<T>): value is Promise<T> {
  return !!value && typeof (value as { then?: unknown }).then === 'function';
}

interface UseChatComposerOptions {
  active?: boolean;
  onSend: (message: string, attachments: Attachment[], noteMentions: NoteMentionReference[]) => void | boolean | Promise<void | boolean>;
  attachments: Attachment[];
  getNoteMentions: () => NoteMentionReference[];
  onAfterSend: () => void;
  canSubmit?: boolean;
  canEdit?: boolean;
  focusTrigger?: number;
}

export function useChatComposer({
  active = true,
  onSend,
  attachments,
  getNoteMentions,
  onAfterSend,
  canSubmit = true,
  canEdit = true,
  focusTrigger,
}: UseChatComposerOptions) {
  const [message, setMessage] = useState('');
  const messageRef = useRef(message);
  const [isComposing, setIsComposing] = useState(false);
  const isComposingRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const composerRootRef = useRef<HTMLDivElement>(null);
  const submitAfterCompositionRef = useRef(false);
  const isSubmittingRef = useRef(false);
  const hasExplicitMultilineRef = useRef(false);
  const focusRafRef = useRef<number | null>(null);
  const submitRafRef = useRef<number | null>(null);
  const heightSyncRafRef = useRef<number | null>(null);
  messageRef.current = message;

  useEffect(() => {
    if (active && canEdit && focusTrigger && textareaRef.current) {
      focusVisibleTextareaAt(textareaRef.current);
    }
  }, [active, canEdit, focusTrigger]);

  const textareaHeight = usePredictedTextareaHeight(textareaRef, {
    value: message,
    minHeight: themeChatComposerTokens.textareaMinHeightPx,
    maxHeight: themeChatComposerTokens.textareaMaxHeightPx,
    maxPredictedLayoutChars: MAX_CHAT_COMPOSER_INTERACTIVE_TEXT_CHARS,
  });
  const textareaHeightRef = useRef(textareaHeight);

  useEffect(() => {
    textareaHeightRef.current = textareaHeight;
  }, [textareaHeight]);

  useEffect(() => {
    if (!active) {
      return;
    }

    const unregister = registerComposerFocusAdapter({
      focus: () => {
        const input = textareaRef.current;
        if (!canEdit || !input || !isMountedVisibleElement(input) || !isMountedVisibleElement(composerRootRef.current)) {
          return false;
        }
        return focusVisibleTextareaAt(input);
      },
      blur: () => {
        const input = textareaRef.current;
        if (!input || !input.isConnected) {
          return false;
        }
        input.blur();
        return document.activeElement !== input;
      },
      isFocused: () => document.activeElement === textareaRef.current,
      containsTarget: (target) => target instanceof Node && !!composerRootRef.current?.contains(target),
      insertText: (text) => {
        if (!canEdit) {
          return false;
        }
        const normalized = text
          .replace(INVISIBLE_BREAK_REGEX, '')
          .replace(UNIVERSAL_NEWLINE_REGEX, '\n')
          .trim();
        if (!normalized) {
          return false;
        }
        if (!canInsertTextIntoComposerValue(messageRef.current, normalized)) {
          return false;
        }

        hasExplicitMultilineRef.current = true;
        setMessage((prev) => {
          const separator = prev && !prev.endsWith('\n') ? '\n' : '';
          const next = `${prev}${separator}${normalized}`;
          if (!canInsertTextIntoComposerValue(prev, normalized)) {
            return prev;
          }
          messageRef.current = next;
          return next;
        });

        if (focusRafRef.current !== null) {
          cancelAnimationFrame(focusRafRef.current);
        }
        focusRafRef.current = requestAnimationFrame(() => {
          focusRafRef.current = null;
          const input = textareaRef.current;
          if (!input || !isMountedVisibleElement(input) || !isMountedVisibleElement(composerRootRef.current)) {
            return;
          }
          if (!focusVisibleTextareaAt(input)) {
            return;
          }
          input.scrollTop = input.scrollHeight;
          textareaHeightRef.current.syncHeight(input.value);
        });
        return true;
      },
    });

    return unregister;
  }, [active, canEdit]);

  useEffect(() => {
    return () => {
      if (focusRafRef.current !== null) {
        cancelAnimationFrame(focusRafRef.current);
        focusRafRef.current = null;
      }
      if (submitRafRef.current !== null) {
        cancelAnimationFrame(submitRafRef.current);
        submitRafRef.current = null;
      }
      if (heightSyncRafRef.current !== null) {
        cancelAnimationFrame(heightSyncRafRef.current);
        heightSyncRafRef.current = null;
      }
    };
  }, []);

  const markExplicitMultiline = useCallback(() => {
    hasExplicitMultilineRef.current = true;
  }, []);

  const handleMessageChange = useCallback((nextValue: string) => {
    const limitedValue = limitChatComposerText(nextValue);
    messageRef.current = limitedValue;
    setMessage(limitedValue);
    if (limitedValue.length === 0) {
      hasExplicitMultilineRef.current = false;
    }
  }, []);

  const handleSend = useCallback(
    (overrideMessage?: string) => {
      if (isComposingRef.current) {
        submitAfterCompositionRef.current = true;
        return;
      }
      if (!canSubmit || isSubmittingRef.current) {
        submitAfterCompositionRef.current = false;
        return;
      }

      const noteMentions = getNoteMentions();
      const rawMessage = overrideMessage ?? message;
      const cleanedMessage = limitChatComposerText(rawMessage.replace(INVISIBLE_BREAK_REGEX, ''));
      const normalizedMessage = limitChatComposerText(cleanedMessage.replace(UNIVERSAL_NEWLINE_REGEX, '\n'));
      const outgoingMessage = hasExplicitMultilineRef.current
        ? normalizedMessage
        : limitChatComposerText(normalizedMessage.replace(/\s*\n+\s*/g, ''));

      if (!outgoingMessage.trim() && attachments.length === 0 && noteMentions.length === 0) {
        return;
      }

      submitAfterCompositionRef.current = false;
      hasExplicitMultilineRef.current = false;
      isSubmittingRef.current = true;
      const clearComposer = () => {
        messageRef.current = '';
        setMessage('');
        onAfterSend();
      };
      const sent = onSend(outgoingMessage, attachments, noteMentions);
      if (isPromiseLike(sent)) {
        void sent.then((accepted) => {
          if (accepted !== false) {
            clearComposer();
          }
        }).catch(() => {
        }).finally(() => {
          isSubmittingRef.current = false;
        });
        return;
      }

      try {
        const accepted = sent;
        if (accepted === false) {
          return;
        }
        clearComposer();
      } finally {
        isSubmittingRef.current = false;
      }
    },
    [attachments, canSubmit, getNoteMentions, message, onAfterSend, onSend]
  );

  const handleCompositionEnd = useCallback(() => {
    isComposingRef.current = false;
    setIsComposing(false);
    if (!submitAfterCompositionRef.current) {
      return;
    }

    submitAfterCompositionRef.current = false;
    if (submitRafRef.current !== null) {
      cancelAnimationFrame(submitRafRef.current);
    }
    submitRafRef.current = requestAnimationFrame(() => {
      submitRafRef.current = null;
      handleSend(textareaRef.current?.value ?? message);
    });
  }, [handleSend, message]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const native = e.nativeEvent as KeyboardEvent & { isComposing?: boolean; keyCode?: number };

      if (e.key === 'Enter' && e.shiftKey) {
        hasExplicitMultilineRef.current = true;
        if (heightSyncRafRef.current !== null) {
          cancelAnimationFrame(heightSyncRafRef.current);
        }
        heightSyncRafRef.current = requestAnimationFrame(() => {
          heightSyncRafRef.current = null;
          textareaHeight.syncHeight(textareaRef.current?.value);
        });
        return;
      }

      if (e.key === 'Enter' && !e.shiftKey) {
        if (isComposing || native.isComposing || native.keyCode === 229) {
          submitAfterCompositionRef.current = false;
          return;
        }
        e.preventDefault();
        submitAfterCompositionRef.current = false;
        handleSend();
      }
    },
    [handleSend, isComposing, textareaHeight]
  );

  return {
    message,
    isComposing,
    textareaRef,
    composerRootRef,
    markExplicitMultiline,
    handleMessageChange,
    handleSend,
    handleKeyDown,
    handleCompositionStart: () => {
      isComposingRef.current = true;
      setIsComposing(true);
    },
    handleCompositionEnd,
  };
}
