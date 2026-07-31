import {
  useCallback,
  useEffect,
  type MouseEvent as ReactMouseEvent,
  type RefObject,
} from 'react';
import { focusCurrentEmptyUntitledDraftTitle } from '../utils/emptyUntitledDraftTitleFocus';
import {
  fulfillEditorFocusIntent,
  subscribeEditorFocusIntent,
} from '../utils/editorFocusIntent';

const NOTE_SCROLL_ROOT_SELECTOR = '[data-note-scroll-root="true"]';

export function useSourceEditorFocus({
  active,
  currentNotePath,
  textareaRef,
}: {
  active: boolean;
  currentNotePath: string;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
}) {
  const fulfillFocusIntent = useCallback((path: string) => {
    if (!active || path !== currentNotePath) return;
    fulfillEditorFocusIntent(path, () => {
      const textarea = textareaRef.current;
      if (!textarea) return false;
      textarea.focus({ preventScroll: true });
      return document.activeElement === textarea;
    });
  }, [active, currentNotePath, textareaRef]);

  useEffect(() => {
    fulfillFocusIntent(currentNotePath);
    return subscribeEditorFocusIntent(fulfillFocusIntent);
  }, [currentNotePath, fulfillFocusIntent]);

  return useCallback((event: ReactMouseEvent<HTMLTextAreaElement>) => {
    if (event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;

    if (focusCurrentEmptyUntitledDraftTitle(
      event.currentTarget.closest(NOTE_SCROLL_ROOT_SELECTOR) ?? event.currentTarget.ownerDocument,
    )) {
      event.preventDefault();
    }
  }, []);
}
