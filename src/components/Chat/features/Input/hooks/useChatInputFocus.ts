import { useCallback, useEffect, useRef, type RefObject } from 'react';
import { focusVisibleTextareaAt } from '@/lib/ui/composerFocusRegistry';

export function useChatInputFocus(textareaRef: RefObject<HTMLTextAreaElement | null>) {
  const focusRafRef = useRef<number | null>(null);
  const restoreFocusListenerRef = useRef<(() => void) | null>(null);

  const scheduleFocus = useCallback((position?: number) => {
    if (focusRafRef.current !== null) {
      cancelAnimationFrame(focusRafRef.current);
    }
    focusRafRef.current = requestAnimationFrame(() => {
      focusRafRef.current = null;
      const input = textareaRef.current;
      focusVisibleTextareaAt(input, position);
    });
  }, [textareaRef]);

  const scheduleComposerFocus = useCallback((position?: number) => {
    scheduleFocus(position);
  }, [scheduleFocus]);

  const scheduleFocusOnWindowFocus = useCallback(() => {
    if (typeof window === 'undefined') {
      return;
    }
    if (restoreFocusListenerRef.current) {
      window.removeEventListener('focus', restoreFocusListenerRef.current, { capture: true });
      restoreFocusListenerRef.current = null;
    }
    const restoreFocus = () => {
      restoreFocusListenerRef.current = null;
      scheduleComposerFocus();
    };
    restoreFocusListenerRef.current = restoreFocus;
    window.addEventListener('focus', restoreFocus, { capture: true, once: true });
  }, [scheduleComposerFocus]);

  useEffect(() => {
    return () => {
      if (focusRafRef.current !== null) {
        cancelAnimationFrame(focusRafRef.current);
        focusRafRef.current = null;
      }
      if (restoreFocusListenerRef.current) {
        window.removeEventListener('focus', restoreFocusListenerRef.current, { capture: true });
        restoreFocusListenerRef.current = null;
      }
    };
  }, []);

  return {
    scheduleComposerFocus,
    scheduleFocusOnWindowFocus,
  };
}
