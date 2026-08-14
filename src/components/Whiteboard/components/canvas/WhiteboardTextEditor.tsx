import { useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useI18n } from '@/lib/i18n';
import { themeWhiteboardTokens } from '@/styles/themeTokens';
import { getWhiteboardTextCaretIndex, measureWhiteboardText } from '../../model/whiteboardText';
import type { WhiteboardTextEditingState } from '../../hooks/useWhiteboardTextEditing';

interface WhiteboardTextEditorProps {
  editing: WhiteboardTextEditingState;
  onChange: (text: string) => void;
  onCommit: () => void;
}

export function WhiteboardTextEditor({ editing, onChange, onCommit }: WhiteboardTextEditorProps) {
  const { t } = useI18n();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const submittedRef = useRef(false);
  const [value, setValue] = useState(editing.element.text);
  const fontSize = editing.element.fontSize ?? themeWhiteboardTokens.whiteboardTextFontSizePx;
  const lineHeight = editing.element.lineHeight ?? themeWhiteboardTokens.whiteboardTextLineHeight;
  const metrics = measureWhiteboardText(value, fontSize, lineHeight);
  const finish = () => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    onCommit();
  };

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.focus();
    const caretIndex = editing.initialCaretPoint
      ? getWhiteboardTextCaretIndex(editing.element, editing.initialCaretPoint)
      : null;
    if (caretIndex === null) textarea.select();
    else textarea.setSelectionRange(caretIndex, caretIndex);
  }, []);

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      finish();
    } else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      if (!event.nativeEvent.isComposing) finish();
    }
  };

  return (
    <textarea
      ref={textareaRef}
      aria-label={t('whiteboard.tool.text')}
      data-whiteboard-text-editor="true"
      dir="auto"
      spellCheck
      value={value}
      className="pointer-events-auto absolute m-0 resize-none overflow-hidden border-0 bg-transparent p-0 outline-none"
      style={{
        color: editing.element.color,
        fontFamily: themeWhiteboardTokens.whiteboardTextFontFamily,
        fontSize,
        height: metrics.height,
        left: editing.element.x,
        lineHeight,
        minWidth: themeWhiteboardTokens.whiteboardTextEditorMinWidthPx,
        rotate: editing.element.rotation ? `${editing.element.rotation}rad` : undefined,
        transform: editing.element.flipX || editing.element.flipY
          ? `scale(${editing.element.flipX ? -1 : 1}, ${editing.element.flipY ? -1 : 1})`
          : undefined,
        transformOrigin: themeWhiteboardTokens.elementTransformOrigin,
        top: editing.element.y,
        width: metrics.width + themeWhiteboardTokens.whiteboardTextEditorWidthPaddingPx,
      }}
      onBlur={finish}
      onChange={(event) => {
        setValue(event.target.value);
        onChange(event.target.value);
      }}
      onKeyDown={handleKeyDown}
      onPointerDown={(event) => event.stopPropagation()}
    />
  );
}
