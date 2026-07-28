import { useCallback, useEffect, useRef, type RefObject } from 'react';
import { themeImageBlockStyleTokens } from '@/styles/themeTokens';

export function useSourceTextareaResize(
  textareaRef: RefObject<HTMLTextAreaElement | null>,
) {
  const frameRef = useRef<number | null>(null);

  const resizeToContent = useCallback(() => {
    frameRef.current = null;
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.style.height = themeImageBlockStyleTokens.heightAuto;
    textarea.style.height = `${Math.max(textarea.scrollHeight, textarea.clientHeight)}px`;
  }, [textareaRef]);

  const scheduleResize = useCallback(() => {
    if (frameRef.current === null) {
      frameRef.current = window.requestAnimationFrame(resizeToContent);
    }
  }, [resizeToContent]);

  useEffect(() => {
    scheduleResize();
    return () => {
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, [scheduleResize]);

  return scheduleResize;
}
