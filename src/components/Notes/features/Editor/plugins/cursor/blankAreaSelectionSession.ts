import {
  resolveBlankAreaPlainClickAction,
} from './blankAreaPlainClick';
import {
  blurActiveEditableElement,
  createDragBox,
  getDragBoxTopBoundary,
  hasMeaningfulResizeDelta,
  resolveDragPointerY,
  updateDragBox,
} from './blankAreaSelectionDragBox';
import {
  filterExternalBlankAreaSelectionEdgeGrazes,
  resolveBlankAreaSelectionAutoScrollDelta,
} from './blankAreaSelectionGeometry';
import { createBlankAreaSelectionResolver } from './blankAreaSelectionResolver';
import type { StartBlankAreaSelectionSessionOptions } from './blankAreaSelectionSessionTypes';
import { startBlockDragSession, type BlockDragSessionHandle } from './blockDragSession';
import { createBlockRectResolver } from './blockRectResolver';
import {
  clampViewportRectTop,
  resolveDisplayedDragViewportRect,
  type RectBounds,
} from './blockSelectionUtils';
import { createVerticalEdgeAutoScroll } from './edgeAutoScroll';

export {
  blurActiveEditableElement,
  filterExternalBlankAreaSelectionEdgeGrazes,
  resolveBlankAreaSelectionAutoScrollDelta
};

export function startBlankAreaSelectionSession(
  options: StartBlankAreaSelectionSessionOptions,
): BlockDragSessionHandle {
  const {
    view,
    event,
    startZone,
    dragThreshold,
    cursor,
    dragBoxColor,
    scrollRootSelector,
    initialSelectedBlocks,
    onSelectionChange,
    onPendingPlainClick,
    onPlainClick,
    onActivateSelectionState,
    onSyncSelectionState,
  } = options;

  const doc = view.dom.ownerDocument;
  const scrollRoot = view.dom.closest(scrollRootSelector) as HTMLElement | null;
  const startedInsideEditor = event.target instanceof Node && view.dom.contains(event.target);
  const shouldFilterExternalEdgeGrazes = startZone !== 'below-last-block' && !startedInsideEditor;
  const startScrollLeft = scrollRoot?.scrollLeft ?? 0;
  const startScrollTop = scrollRoot?.scrollTop ?? 0;
  const rectResolver = createBlockRectResolver({
    view,
    scrollRootSelector,
    usePositionCache: true,
  });
  let pendingPlainClickHandled = false;

  let dragBox: HTMLDivElement | null = null;
  let pendingDragBoxRect: RectBounds | null = null;
  let lastViewportDragRect: RectBounds | null = null;
  let lastPointerY = event.clientY;
  let dragBoxTopBoundary = 0;
  let dragBoxRafId = 0;
  let resizeObserver: ResizeObserver | null = null;
  const observedResizeSizes = new WeakMap<Element, { width: number; height: number }>();

  const rememberObservedResizeSize = (element: Element) => {
    if (!(element instanceof HTMLElement)) return;
    const rect = element.getBoundingClientRect();
    observedResizeSizes.set(element, {
      width: rect.width,
      height: rect.height,
    });
  };

  const selectionResolver = createBlankAreaSelectionResolver({
    view,
    rectResolver,
    startClientX: event.clientX,
    startClientY: event.clientY,
    startScrollLeft,
    startScrollTop,
    getScrollLeft: () => scrollRoot?.scrollLeft ?? 0,
    getScrollTop: () => scrollRoot?.scrollTop ?? 0,
    initialSelectedBlocks,
    shouldFilterExternalEdgeGrazes,
    onSelectionChange,
  });

  if (
    startZone === 'outside-editor' &&
    initialSelectedBlocks.length === 0 &&
    onPendingPlainClick
  ) {
    const blockRects = rectResolver.getTopLevelBlockRects();
    const action = resolveBlankAreaPlainClickAction({
      blockRects,
      clientX: event.clientX,
      clientY: event.clientY,
    });
    if (action) {
      pendingPlainClickHandled = onPendingPlainClick({
        zone: startZone,
        action,
        blockRects,
        clientX: event.clientX,
        clientY: event.clientY,
      });
    }
  }

  const handleGeometryResize: ResizeObserverCallback = (entries) => {
    if (entries.length > 0) {
      let hasMeaningfulResize = false;
      for (const entry of entries) {
        const nextSize = {
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        };
        const previousSize = observedResizeSizes.get(entry.target);
        observedResizeSizes.set(entry.target, nextSize);
        if (hasMeaningfulResizeDelta(previousSize, nextSize)) {
          hasMeaningfulResize = true;
        }
      }
      if (!hasMeaningfulResize) return;
    }

    selectionResolver.invalidateGeometryCache();
    dragBoxTopBoundary = getDragBoxTopBoundary(scrollRoot);
    if (!lastViewportDragRect) return;
    selectionResolver.applyDragRectSelectionIfNeeded(lastViewportDragRect);
  };

  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(handleGeometryResize);
    rememberObservedResizeSize(view.dom);
    resizeObserver.observe(view.dom);
    if (scrollRoot) {
      rememberObservedResizeSize(scrollRoot);
      resizeObserver.observe(scrollRoot);
    }
  }

  const scheduleDragBoxUpdate = (viewportRect: RectBounds) => {
    pendingDragBoxRect = viewportRect;
    if (dragBoxRafId !== 0) return;

    dragBoxRafId = window.requestAnimationFrame(() => {
      dragBoxRafId = 0;
      if (!pendingDragBoxRect || !dragBox) return;
      const nextRect = pendingDragBoxRect;
      pendingDragBoxRect = null;
      updateDragBox(dragBox, nextRect);
    });
  };

  const handleScrollWhileDragging = () => {
    if (!lastViewportDragRect) return;

    if (dragBox) {
      const currentScrollLeft = scrollRoot?.scrollLeft ?? 0;
      const currentScrollTop = scrollRoot?.scrollTop ?? 0;
      const viewportRect = resolveDisplayedDragViewportRect(
        lastViewportDragRect,
        event.clientX,
        event.clientY,
        startScrollLeft,
        startScrollTop,
        currentScrollLeft,
        currentScrollTop,
      );
      scheduleDragBoxUpdate(clampViewportRectTop(viewportRect, dragBoxTopBoundary));
    }

    selectionResolver.applyDragRectSelectionIfNeeded(lastViewportDragRect);
  };

  const autoScroll = createVerticalEdgeAutoScroll({
    scrollRoot,
    getPointerY: () => lastViewportDragRect ? lastPointerY : null,
    onScroll: handleScrollWhileDragging,
  });

  const session = startBlockDragSession({
    view,
    event,
    startZone,
    dragThreshold,
    cursor,
    cursorRoot: scrollRoot,
    onActivate() {
      dragBox = createDragBox(doc, dragBoxColor);
      doc.body.appendChild(dragBox);
      dragBoxTopBoundary = getDragBoxTopBoundary(scrollRoot);
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        selection.removeAllRanges();
      }
      blurActiveEditableElement(doc);
      onActivateSelectionState();
      autoScroll.start();
    },
    onDragMove(dragRect) {
      lastPointerY = resolveDragPointerY(event.clientY, dragRect);
      lastViewportDragRect = dragRect;
      const currentScrollLeft = scrollRoot?.scrollLeft ?? 0;
      const currentScrollTop = scrollRoot?.scrollTop ?? 0;
      const displayedViewportRect = resolveDisplayedDragViewportRect(
        dragRect,
        event.clientX,
        event.clientY,
        startScrollLeft,
        startScrollTop,
        currentScrollLeft,
        currentScrollTop,
      );
      if (dragBox) {
        scheduleDragBoxUpdate(clampViewportRectTop(displayedViewportRect, dragBoxTopBoundary));
      }
      selectionResolver.applyDragRectSelectionIfNeeded(dragRect);
    },
    onPlainClick(zone) {
      if (pendingPlainClickHandled) return;
      const blockRects = rectResolver.getTopLevelBlockRects();
      const action = zone === 'below-last-block'
        ? null
        : resolveBlankAreaPlainClickAction({
          blockRects,
          clientX: event.clientX,
          clientY: event.clientY,
        });
      onPlainClick({
        zone,
        action,
        blockRects,
        clientX: event.clientX,
        clientY: event.clientY,
      });
    },
    onTeardown() {
      if (dragBox) {
        dragBox.remove();
        dragBox = null;
      }
      if (dragBoxRafId !== 0) {
        window.cancelAnimationFrame(dragBoxRafId);
        dragBoxRafId = 0;
      }
      pendingDragBoxRect = null;
      resizeObserver?.disconnect();
      resizeObserver = null;
      scrollRoot?.removeEventListener('scroll', handleScrollWhileDragging);
      autoScroll.stop();
      selectionResolver.invalidateGeometryCache();
      onSyncSelectionState();
    },
  });

  scrollRoot?.addEventListener('scroll', handleScrollWhileDragging, { passive: true });
  return session;
}
