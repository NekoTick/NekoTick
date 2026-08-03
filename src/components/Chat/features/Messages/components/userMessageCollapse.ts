import { useLayoutEffect, useState, type RefObject } from 'react';

export const LONG_USER_MESSAGE_LINE_THRESHOLD = 8;
export const COLLAPSED_USER_MESSAGE_VISIBLE_LINES = 8;
export const LONG_USER_MESSAGE_PREVIEW_CHAR_LIMIT = 4_000;

export function getLongUserMessagePreviewText(text: string): string | null {
  let lineCount = 1;
  let previewEndIndex = -1;

  const scanEnd = Math.min(text.length, LONG_USER_MESSAGE_PREVIEW_CHAR_LIMIT);
  for (let index = 0; index < scanEnd; index += 1) {
    if (text.charCodeAt(index) !== 10) continue;
    if (lineCount === COLLAPSED_USER_MESSAGE_VISIBLE_LINES) {
      previewEndIndex = index;
    }
    lineCount += 1;
    if (lineCount > LONG_USER_MESSAGE_LINE_THRESHOLD) {
      return text.slice(0, previewEndIndex >= 0 ? previewEndIndex : index);
    }
  }

  if (text.length > LONG_USER_MESSAGE_PREVIEW_CHAR_LIMIT) {
    return text.slice(0, LONG_USER_MESSAGE_PREVIEW_CHAR_LIMIT);
  }

  return null;
}

export function useHasVisualUserMessageOverflow({
  fontSize,
  text,
  textBubbleWidth,
  textContentRef,
}: {
  fontSize: number;
  text: string;
  textBubbleWidth: number | null;
  textContentRef: RefObject<HTMLDivElement | null>;
}): boolean {
  const [hasVisualOverflow, setHasVisualOverflow] = useState(false);

  useLayoutEffect(() => {
    const element = textContentRef.current;
    if (!element) {
      setHasVisualOverflow(false);
      return;
    }

    const lineHeight = Number.parseFloat(window.getComputedStyle(element).lineHeight);
    if (!Number.isFinite(lineHeight) || lineHeight <= 0) {
      setHasVisualOverflow(false);
      return;
    }

    const maxCollapsedHeight = lineHeight * COLLAPSED_USER_MESSAGE_VISIBLE_LINES;
    const nextHasVisualOverflow = element.scrollHeight > maxCollapsedHeight + 1;
    setHasVisualOverflow((current) => current === nextHasVisualOverflow ? current : nextHasVisualOverflow);
  }, [fontSize, text, textBubbleWidth, textContentRef]);

  return hasVisualOverflow;
}
