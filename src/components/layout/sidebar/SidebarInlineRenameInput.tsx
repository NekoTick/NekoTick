import { useEffect, useLayoutEffect, useRef, type ComponentPropsWithoutRef } from 'react';
import { themeTextAreaTokens } from '@/styles/themeTokens';
import {
  preventImageClipboardTextPaste,
  preventImageDataTransferTextDrop,
} from '@/lib/clipboardImagePayload';

interface SidebarInlineRenameInputProps
  extends Omit<
    ComponentPropsWithoutRef<'textarea'>,
    'onBlur' | 'onChange' | 'onKeyDown' | 'onMouseDown' | 'value'
  > {
  value: string;
  onValueChange: (value: string) => void;
  onSubmit: () => void | Promise<void>;
  onCancel: () => void;
  selectOnMount?: boolean;
}

export function SidebarInlineRenameInput({
  value,
  onValueChange,
  onSubmit,
  onCancel,
  selectOnMount = true,
  onClick,
  onDrop,
  onPaste,
  className,
  ...props
}: SidebarInlineRenameInputProps) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const isComposingRef = useRef(false);
  const restoreFocusOnWindowFocusRef = useRef(false);

  useLayoutEffect(() => {
    const input = inputRef.current;
    if (!input) {
      return;
    }

    input.style.height = themeTextAreaTokens.heightAuto;
    input.style.height = `${Math.min(input.scrollHeight, themeTextAreaTokens.inlineRenameMaxHeightPx)}px`;
    input.style.overflowY = input.scrollHeight > themeTextAreaTokens.inlineRenameMaxHeightPx
      ? themeTextAreaTokens.overflowAuto
      : themeTextAreaTokens.overflowHidden;
  }, [value]);

  useEffect(() => {
    const handleWindowFocus = () => {
      if (!restoreFocusOnWindowFocusRef.current) {
        return;
      }

      restoreFocusOnWindowFocusRef.current = false;
      inputRef.current?.focus();
    };

    window.addEventListener('focus', handleWindowFocus);
    return () => {
      window.removeEventListener('focus', handleWindowFocus);
    };
  }, []);

  useEffect(() => {
    if (!selectOnMount) {
      return;
    }

    const input = inputRef.current;
    if (!input) {
      return;
    }

    const frameId = requestAnimationFrame(() => {
      input.focus();
      input.select();
    });

    return () => {
      cancelAnimationFrame(frameId);
    };
  }, [selectOnMount]);

  return (
    <textarea
      {...props}
      ref={inputRef}
      spellCheck={false}
      rows={1}
      wrap="soft"
      value={value}
      onChange={(event) => onValueChange(event.target.value.replace(/[\r\n]+/g, ' '))}
      onCompositionStart={() => {
        isComposingRef.current = true;
      }}
      onCompositionEnd={() => {
        isComposingRef.current = false;
      }}
      onBlur={() => {
        if (isComposingRef.current) {
          return;
        }
        if (!document.hasFocus()) {
          restoreFocusOnWindowFocusRef.current = true;
          return;
        }
        void Promise.resolve(onSubmit()).catch(() => undefined);
      }}
      onKeyDown={(event) => {
        if (event.nativeEvent.isComposing || isComposingRef.current) {
          return;
        }

        if (event.key === 'Enter') {
          event.preventDefault();
          void Promise.resolve(onSubmit()).catch(() => undefined);
          return;
        }

        if (event.key === 'Escape') {
          event.preventDefault();
          onCancel();
        }
      }}
      onPaste={(event) => {
        if (!preventImageClipboardTextPaste(event)) {
          onPaste?.(event);
        }
      }}
      onDrop={(event) => {
        if (!preventImageDataTransferTextDrop(event)) {
          onDrop?.(event);
        }
      }}
      onClick={(event) => {
        event.stopPropagation();
        onClick?.(event);
      }}
      onMouseDown={(event) => {
        event.stopPropagation();
      }}
      className={[
        'resize-none overflow-hidden whitespace-pre-wrap break-words',
        className,
      ].filter(Boolean).join(' ')}
    />
  );
}
