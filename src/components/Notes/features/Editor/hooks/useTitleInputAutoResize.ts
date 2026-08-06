import { useCallback, useEffect, useRef, type RefObject } from 'react';
import { requestNativeCaretOverlayRefresh } from '@/hooks/useNativeCaretOverlay';
import { themeTextAreaTokens } from '@/styles/themeTokens';

export function useTitleInputAutoResize(
  inputRef: RefObject<HTMLTextAreaElement | null>,
  title: string,
) {
  const resizeFrameRef = useRef<number | null>(null);
  const resizeTimeoutRef = useRef<number | null>(null);

  const resizeTitleInput = useCallback(() => {
    const input = inputRef.current;
    if (!input) return;

    if (input.getBoundingClientRect().width <= 0) {
      return;
    }

    input.style.height = themeTextAreaTokens.heightAuto;
    input.style.height = `${Math.ceil(input.scrollHeight) + themeTextAreaTokens.titleResizeHeightGuardPx}px`;
    input.scrollTop = 0;
    input.scrollLeft = 0;

    if (input.ownerDocument.activeElement === input) {
      requestNativeCaretOverlayRefresh();
    }
  }, [inputRef]);

  const scheduleResizeTitleInput = useCallback(() => {
    if (resizeFrameRef.current !== null) {
      cancelAnimationFrame(resizeFrameRef.current);
    }

    resizeFrameRef.current = requestAnimationFrame(() => {
      resizeFrameRef.current = null;
      resizeTitleInput();
    });
  }, [resizeTitleInput]);

  useEffect(() => {
    resizeTitleInput();
    scheduleResizeTitleInput();
  }, [resizeTitleInput, scheduleResizeTitleInput, title]);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;

    const observedElements = [input, input.parentElement].filter(Boolean) as Element[];
    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        scheduleResizeTitleInput();
      });
      observedElements.forEach((element) => resizeObserver?.observe(element));
    }

    resizeTimeoutRef.current = window.setTimeout(() => {
      resizeTimeoutRef.current = null;
      resizeTitleInput();
    }, themeTextAreaTokens.titleResizeFallbackDelayMs);

    void document.fonts?.ready.then(() => {
      scheduleResizeTitleInput();
    });

    return () => {
      resizeObserver?.disconnect();
      if (resizeFrameRef.current !== null) {
        cancelAnimationFrame(resizeFrameRef.current);
        resizeFrameRef.current = null;
      }
      if (resizeTimeoutRef.current !== null) {
        window.clearTimeout(resizeTimeoutRef.current);
        resizeTimeoutRef.current = null;
      }
    };
  }, [inputRef, resizeTitleInput, scheduleResizeTitleInput]);

  useEffect(() => {
    return () => {
      if (resizeFrameRef.current !== null) {
        cancelAnimationFrame(resizeFrameRef.current);
        resizeFrameRef.current = null;
      }
      if (resizeTimeoutRef.current !== null) {
        window.clearTimeout(resizeTimeoutRef.current);
        resizeTimeoutRef.current = null;
      }
    };
  }, []);

  return resizeTitleInput;
}
