import { useCallback, useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
import { themeImageBlockStyleTokens } from '@/styles/themeTokens';

export function useSourceTextareaResize(
  textareaRef: RefObject<HTMLTextAreaElement | null>,
  active: boolean,
) {
  const frameRef = useRef<number | null>(null);

  const resizeToContent = useCallback(() => {
    frameRef.current = null;
    const textarea = textareaRef.current;
    if (!textarea) return;
    if (textarea.getBoundingClientRect().width <= 0) return;

    textarea.style.height = themeImageBlockStyleTokens.heightAuto;
    textarea.style.height = `${Math.max(textarea.scrollHeight, textarea.clientHeight)}px`;
  }, [textareaRef]);

  const scheduleResize = useCallback(() => {
    if (frameRef.current === null) {
      frameRef.current = window.requestAnimationFrame(resizeToContent);
    }
  }, [resizeToContent]);

  useLayoutEffect(() => {
    if (!active) return;
    if (frameRef.current !== null) {
      window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    resizeToContent();
  }, [active, resizeToContent]);

  useEffect(() => {
    return () => {
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, []);

  return scheduleResize;
}
