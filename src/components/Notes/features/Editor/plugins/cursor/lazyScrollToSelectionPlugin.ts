import { Plugin } from '@milkdown/kit/prose/state';
import type { EditorView } from '@milkdown/kit/prose/view';
import { $prose } from '@milkdown/kit/utils';

const LAZY_BLOCK_VISIBILITY_SELECTOR = '[data-note-lazy-block-visibility="true"]';
const LAZY_SCROLL_INTERVAL_MS = 100;

type PendingScroll = {
  ownerWindow: Window;
  timerId: number;
};

export function createLazyScrollToSelectionController() {
  const flushingViews = new WeakSet<EditorView>();
  const pendingScrolls = new Map<EditorView, PendingScroll>();

  const cancel = (view: EditorView) => {
    const pending = pendingScrolls.get(view);
    if (!pending) return;
    pending.ownerWindow.clearTimeout(pending.timerId);
    pendingScrolls.delete(view);
  };

  const handle = (view: EditorView) => {
    if (flushingViews.has(view)) return false;
    if (!view.dom.closest(LAZY_BLOCK_VISIBILITY_SELECTOR)) return false;
    if (pendingScrolls.has(view)) return true;

    const ownerWindow = view.dom.ownerDocument.defaultView;
    if (!ownerWindow) return false;

    const timerId = ownerWindow.setTimeout(() => {
      pendingScrolls.delete(view);
      if (view.isDestroyed) return;

      flushingViews.add(view);
      try {
        view.scrollToSelection();
      } finally {
        flushingViews.delete(view);
      }
    }, LAZY_SCROLL_INTERVAL_MS);
    pendingScrolls.set(view, { ownerWindow, timerId });
    return true;
  };

  return { cancel, handle };
}

export const lazyScrollToSelectionPlugin = $prose(() => {
  const controller = createLazyScrollToSelectionController();

  return new Plugin({
    props: {
      handleScrollToSelection: controller.handle,
    },
    view: (view) => ({
      destroy: () => controller.cancel(view),
    }),
  });
});
