import type { EditorView } from '@milkdown/kit/prose/view';
import { OVERLAY_SCROLL_IDLE_EVENT } from '@/components/ui/overlayScrollAreaEvents';
import { isBlockSelectionInteractionPending } from '../plugins/cursor/blockSelectionInteractionState';
import {
  BLOCK_SELECTION_PENDING_CLASS,
  CONTENT_MUTATION_REFRESH_DELAY_MS,
  PENDING_BLOCK_SELECTION_REFRESH_RETRY_MS,
  TOOLBAR_PREVIEW_HIDDEN_ATTRIBUTE,
} from './editorBlockPositionConstants';
import {
  createScrollAdjustedSnapshot,
} from './editorBlockPositionGeometry';
import {
  createEmptySnapshot,
  createSnapshot,
  isTooLargeForBlockPositionSnapshot,
} from './editorBlockPositionSnapshotFactory';
import type {
  EditorBlockPositionController,
  EditorBlockPositionSnapshot,
} from './editorBlockPositionTypes';

interface CreateCurrentEditorBlockPositionControllerOptions {
  view: EditorView;
  getCurrentSnapshot: () => EditorBlockPositionSnapshot | null;
  publishSnapshot: (snapshot: EditorBlockPositionSnapshot | null) => void;
  nextVersion: () => number;
}

export function createCurrentEditorBlockPositionControllerWithState({
  view,
  getCurrentSnapshot,
  publishSnapshot,
  nextVersion,
}: CreateCurrentEditorBlockPositionControllerOptions): EditorBlockPositionController {
  let refreshFrameId = 0;
  let scrollFrameId = 0;
  let contentMutationTimerId = 0;
  let pendingBlockSelectionRefreshTimerId = 0;
  let needsRefreshAfterPendingBlockSelection = false;
  let needsRefreshAfterScroll = false;
  let scrolling = false;
  let destroyed = false;
  let mutationObserver: MutationObserver | null = null;
  let resizeObserver: ResizeObserver | null = null;
  const scrollRoot = view.dom.closest('[data-note-scroll-root="true"]') as HTMLElement | null;

  const clearContentMutationRefresh = () => {
    if (contentMutationTimerId === 0) {
      return;
    }
    window.clearTimeout(contentMutationTimerId);
    contentMutationTimerId = 0;
  };

  const clearPendingBlockSelectionRefresh = () => {
    if (pendingBlockSelectionRefreshTimerId === 0) {
      return;
    }
    window.clearTimeout(pendingBlockSelectionRefreshTimerId);
    pendingBlockSelectionRefreshTimerId = 0;
  };

  const isBlockSelectionPending = () => (
    view.dom.classList.contains(BLOCK_SELECTION_PENDING_CLASS)
    || isBlockSelectionInteractionPending(view.dom)
  );

  const hasRenderedBlockSelection = () => (
    view.dom.querySelector('.editor-block-selected') !== null
  );

  const scheduleRefreshAfterPendingBlockSelection = () => {
    if (destroyed) {
      return;
    }

    needsRefreshAfterPendingBlockSelection = true;
    if (pendingBlockSelectionRefreshTimerId !== 0) {
      return;
    }

    pendingBlockSelectionRefreshTimerId = window.setTimeout(() => {
      pendingBlockSelectionRefreshTimerId = 0;
      if (destroyed) {
        return;
      }
      if (isBlockSelectionPending()) {
        scheduleRefreshAfterPendingBlockSelection();
        return;
      }
      if (!needsRefreshAfterPendingBlockSelection) {
        return;
      }
      needsRefreshAfterPendingBlockSelection = false;
      scheduleRefresh();
    }, PENDING_BLOCK_SELECTION_REFRESH_RETRY_MS);
  };

  const refresh = () => {
    if (destroyed) {
      return;
    }

    clearContentMutationRefresh();
    needsRefreshAfterScroll = false;
    const snapshot = createSnapshot(view, nextVersion);
    publishSnapshot(snapshot);
  };

  const scheduleRefresh = () => {
    if (destroyed || refreshFrameId !== 0) {
      return;
    }
    if (scrolling) {
      needsRefreshAfterScroll = true;
      return;
    }

    refreshFrameId = requestAnimationFrame(() => {
      refreshFrameId = 0;
      if (scrolling) {
        needsRefreshAfterScroll = true;
        return;
      }
      if (isBlockSelectionPending()) {
        scheduleRefreshAfterPendingBlockSelection();
        return;
      }
      refresh();
    });
  };

  const scheduleContentMutationRefresh = () => {
    if (destroyed) {
      return;
    }

    clearContentMutationRefresh();
    contentMutationTimerId = window.setTimeout(() => {
      contentMutationTimerId = 0;
      if (isBlockSelectionPending()) {
        scheduleRefreshAfterPendingBlockSelection();
        return;
      }
      scheduleRefresh();
    }, CONTENT_MUTATION_REFRESH_DELAY_MS);
  };

  const scheduleMutationRefresh = (records: MutationRecord[]) => {
    if (isBlockSelectionPending()) {
      clearContentMutationRefresh();
      scheduleRefreshAfterPendingBlockSelection();
      return;
    }

    const snapshot = getCurrentSnapshot();
    if (
      snapshot?.view === view
      && snapshot.doc === view.state.doc
      && hasRenderedBlockSelection()
    ) {
      return;
    }

    const onlyContentMutations = records.length > 0 && records.every(
      (record) => record.type === 'characterData' || record.type === 'childList',
    );
    if (onlyContentMutations) {
      scheduleContentMutationRefresh();
      return;
    }

    clearContentMutationRefresh();
    scheduleRefresh();
  };

  if (typeof MutationObserver !== 'undefined') {
    mutationObserver = new MutationObserver(scheduleMutationRefresh);
    mutationObserver.observe(view.dom, {
      attributes: true,
      attributeFilter: [TOOLBAR_PREVIEW_HIDDEN_ATTRIBUTE],
      childList: true,
      subtree: true,
      characterData: true,
    });
  }

  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver((entries) => {
      if (isBlockSelectionPending()) {
        clearContentMutationRefresh();
        scheduleRefreshAfterPendingBlockSelection();
        return;
      }

      const onlyEditorContentResize = entries.length > 0 && entries.every((entry) => entry.target === view.dom);
      if (onlyEditorContentResize) {
        scheduleContentMutationRefresh();
        return;
      }
      clearContentMutationRefresh();
      scheduleRefresh();
    });
    resizeObserver.observe(view.dom);
    if (scrollRoot && scrollRoot !== view.dom) {
      resizeObserver.observe(scrollRoot);
    }
  }

  const handleScroll = () => {
    if (destroyed) {
      return;
    }

    scrolling = true;
    if (refreshFrameId !== 0) {
      cancelAnimationFrame(refreshFrameId);
      refreshFrameId = 0;
      needsRefreshAfterScroll = true;
    }
    if (scrollFrameId !== 0) {
      return;
    }

    scrollFrameId = requestAnimationFrame(() => {
      scrollFrameId = 0;
      const snapshot = getCurrentSnapshot();
      if (
        snapshot
        && snapshot.view === view
        && snapshot.doc === view.state.doc
        && snapshot.scrollRoot === scrollRoot
      ) {
        publishSnapshot(createScrollAdjustedSnapshot(
          snapshot,
          scrollRoot?.scrollLeft ?? 0,
          scrollRoot?.scrollTop ?? 0,
          nextVersion(),
        ));
        return;
      }

      needsRefreshAfterScroll = true;
      if (!scrolling) {
        needsRefreshAfterScroll = false;
        scheduleRefresh();
      }
    });
  };

  const handleScrollIdle = () => {
    if (
      destroyed
      || !scrolling
      || scrollRoot?.dataset.overlayScrollbarInteracting === 'true'
    ) {
      return;
    }

    scrolling = false;
    if (!needsRefreshAfterScroll) {
      return;
    }
    needsRefreshAfterScroll = false;
    scheduleRefresh();
  };

  scrollRoot?.addEventListener('scroll', handleScroll, { passive: true });
  window.addEventListener(OVERLAY_SCROLL_IDLE_EVENT, handleScrollIdle);
  window.addEventListener('resize', scheduleRefresh);

  publishSnapshot(createEmptySnapshot(view, nextVersion()));
  if (!isTooLargeForBlockPositionSnapshot(view.state.doc)) {
    scheduleRefresh();
  }

  return {
    refresh,
    destroy() {
      destroyed = true;
      if (refreshFrameId !== 0) {
        cancelAnimationFrame(refreshFrameId);
        refreshFrameId = 0;
      }
      if (scrollFrameId !== 0) {
        cancelAnimationFrame(scrollFrameId);
        scrollFrameId = 0;
      }
      clearContentMutationRefresh();
      clearPendingBlockSelectionRefresh();
      mutationObserver?.disconnect();
      resizeObserver?.disconnect();
      scrollRoot?.removeEventListener('scroll', handleScroll);
      window.removeEventListener(OVERLAY_SCROLL_IDLE_EVENT, handleScrollIdle);
      window.removeEventListener('resize', scheduleRefresh);
      if (getCurrentSnapshot()?.view === view) {
        publishSnapshot(null);
      }
    },
  };
}
