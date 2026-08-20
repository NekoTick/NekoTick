import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
import { requestNativeCaretOverlayRefresh } from '@/hooks/useNativeCaretOverlay';

interface CaretLayoutRect {
  height: number;
  left: number;
  top: number;
  width: number;
}

interface UseChatInputCaretLayoutSyncOptions {
  composerRootRef: RefObject<HTMLElement | null>;
  isComposing: boolean;
  message: string;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
}

const LAYOUT_CHANGE_EPSILON_PX = 0.5;

function measureCaretLayout(element: HTMLElement): CaretLayoutRect {
  const rect = element.getBoundingClientRect();
  return {
    height: rect.height,
    left: rect.left,
    top: rect.top,
    width: rect.width,
  };
}

export function shouldRefreshMovedCaret(
  previous: CaretLayoutRect,
  current: CaretLayoutRect,
  textareaActive: boolean,
  isComposing: boolean,
): boolean {
  if (!textareaActive || isComposing) {
    return false;
  }

  const textareaResized = Math.abs(current.height - previous.height) > LAYOUT_CHANGE_EPSILON_PX;
  const textareaWidthChanged = Math.abs(current.width - previous.width) > LAYOUT_CHANGE_EPSILON_PX;
  if (textareaWidthChanged) {
    return true;
  }
  if (textareaResized) {
    return false;
  }

  return (
    Math.abs(current.top - previous.top) > LAYOUT_CHANGE_EPSILON_PX
    || Math.abs(current.left - previous.left) > LAYOUT_CHANGE_EPSILON_PX
  );
}

export function useChatInputCaretLayoutSync({
  composerRootRef,
  isComposing,
  message,
  textareaRef,
}: UseChatInputCaretLayoutSyncOptions): void {
  const previousMessageRef = useRef(message);

  useLayoutEffect(() => {
    const previousMessage = previousMessageRef.current;
    previousMessageRef.current = message;
    if (
      previousMessage.length > 0 &&
      message.length === 0 &&
      !isComposing &&
      document.activeElement === textareaRef.current
    ) {
      requestNativeCaretOverlayRefresh();
    }
  }, [isComposing, message, textareaRef]);

  useEffect(() => {
    const composer = composerRootRef.current;
    const textarea = textareaRef.current;
    if (!composer || !textarea || typeof ResizeObserver === 'undefined') {
      return;
    }

    let previous = measureCaretLayout(textarea);
    let frameId: number | null = null;
    const observer = new ResizeObserver(() => {
      if (frameId !== null) {
        cancelAnimationFrame(frameId);
      }
      frameId = requestAnimationFrame(() => {
        frameId = null;
        const current = measureCaretLayout(textarea);
        const shouldRefresh = shouldRefreshMovedCaret(
          previous,
          current,
          document.activeElement === textarea,
          isComposing,
        );
        previous = current;
        if (shouldRefresh) {
          requestNativeCaretOverlayRefresh();
        }
      });
    });

    observer.observe(composer);
    observer.observe(textarea);
    if (composer.parentElement) {
      observer.observe(composer.parentElement);
    }
    return () => {
      observer.disconnect();
      if (frameId !== null) {
        cancelAnimationFrame(frameId);
      }
    };
  }, [composerRootRef, isComposing, textareaRef]);
}
