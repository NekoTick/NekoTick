import {
  resolveBlankAreaPlainClickAction,
} from './blankAreaPlainClick';
import {
  blurActiveEditableElement,
  areRectBoundsEqual,
  createBlockSelectionPreviewLayer,
  createDragBox,
  DRAG_SELECTION_PREVIEW_ACTIVE_CLASS,
  hasMeaningfulResizeDelta,
  hasMeaningfulWidthResizeDelta,
  updateDragBox,
  updateBlockSelectionPreviewLayer,
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
  convertDocumentRectToViewportRect,
  createDragSelectionRect,
  type RectBounds,
} from './blockSelectionUtils';
import { createVerticalEdgeAutoScroll } from './edgeAutoScroll';
import {
  getInteractionCachedEditorBlockTargets,
  getInteractionCachedEditorGeometry,
} from '../../utils/editorBlockPositionCache';
import { setBlockSelectionPreviewElements } from './blockSelectionInteractionState';

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
    selectionPreviewColor = dragBoxColor,
    useSelectionPreview = false,
    scrollRootSelector,
    initialSelectedBlocks,
    onSelectionChange,
    onPreviewSurfaceRangesChange,
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
  let currentScrollLeft = startScrollLeft;
  let currentScrollTop = startScrollTop;
  const rectResolver = createBlockRectResolver({
    view,
    scrollRootSelector,
    usePositionCache: true,
  });
  let pendingPlainClickHandled = false;

  let dragBox: HTMLDivElement | null = null;
  let selectionPreviewLayer: SVGSVGElement | null = null;
  let pendingDragBoxRect: RectBounds | null = null;
  let renderedDragBoxRect: RectBounds | null = null;
  let lastViewportDragRect: RectBounds | null = null;
  let lastPointerX = event.clientX;
  let lastPointerY = event.clientY;
  let dragBoxTopBoundary = 0;
  let dragBoxRafId = 0;
  let geometryRefreshRafId = 0;
  let pendingGeometryRefresh: {
    invalidateGeometry: boolean;
    changedPreviewSurfaceRanges: Map<string, { from: number; to: number }>;
  } | null = null;
  let resizeObserver: ResizeObserver | null = null;
  const observedResizeSizes = new WeakMap<Element, { width: number; height: number }>();
  const observedPreviewSurfaceElements = new Set<HTMLElement>();
  const previewSurfaceRangesByElement = new Map<HTMLElement, readonly { from: number; to: number }[]>();
  let lastHandledScrollLeft = Number.NaN;
  let lastHandledScrollTop = Number.NaN;
  let pendingAutoScrollTop: number | null = null;
  let refreshAutoScrollBounds = () => {};
  let getAutoScrollBounds = (): RectBounds | null => null;
  let syncAutoScrollTop = (_scrollTop: number) => {};

  const syncPreviewSurfaceResizeTargets = (
    elements: readonly HTMLElement[],
    ranges: readonly { from: number; to: number }[],
  ) => {
    if (!resizeObserver) return;
    const nextElements = new Set(elements);
    observedPreviewSurfaceElements.forEach((element) => {
      if (nextElements.has(element)) return;
      resizeObserver?.unobserve(element);
      observedPreviewSurfaceElements.delete(element);
      previewSurfaceRangesByElement.delete(element);
    });
    previewSurfaceRangesByElement.clear();
    elements.forEach((element, index) => {
      const range = ranges[index];
      if (range) {
        const previousRanges = previewSurfaceRangesByElement.get(element) ?? [];
        previewSurfaceRangesByElement.set(element, previousRanges.some((candidate) => (
          candidate.from === range.from && candidate.to === range.to
        )) ? previousRanges : [...previousRanges, range]);
      }
      if (observedPreviewSurfaceElements.has(element)) return;
      observedPreviewSurfaceElements.add(element);
      resizeObserver?.observe(element);
    });
  };

  const selectionResolver = createBlankAreaSelectionResolver({
    view,
    rectResolver,
    startClientX: event.clientX,
    startClientY: event.clientY,
    startScrollLeft,
    startScrollTop,
    getScrollLeft: () => currentScrollLeft,
    getScrollTop: () => currentScrollTop,
    getPointerClientX: () => lastPointerX,
    getPointerClientY: () => lastPointerY,
    initialSelectedBlocks,
    shouldFilterExternalEdgeGrazes,
    onSelectionChange,
  });

  const scheduleGeometryRefresh = (
    invalidateGeometry: boolean,
    changedPreviewSurfaceRanges: ReadonlyMap<string, { from: number; to: number }> = new Map(),
  ) => {
    const pending = pendingGeometryRefresh ?? {
      invalidateGeometry: false,
      changedPreviewSurfaceRanges: new Map<string, { from: number; to: number }>(),
    };
    pending.invalidateGeometry ||= invalidateGeometry;
    changedPreviewSurfaceRanges.forEach((range, key) => {
      pending.changedPreviewSurfaceRanges.set(key, range);
    });
    pendingGeometryRefresh = pending;
    if (geometryRefreshRafId !== 0) return;

    geometryRefreshRafId = window.requestAnimationFrame(() => {
      geometryRefreshRafId = 0;
      const nextRefresh = pendingGeometryRefresh;
      pendingGeometryRefresh = null;
      if (!nextRefresh) return;

      if (nextRefresh.invalidateGeometry) {
        refreshAutoScrollBounds();
        selectionResolver.invalidateGeometryCache();
        dragBoxTopBoundary = getAutoScrollBounds()?.top ?? 0;
        if (!lastViewportDragRect) return;
        selectionResolver.applyDragRectSelectionIfNeeded(lastViewportDragRect);
        renderSelectionPreview();
        return;
      }

      if (
        lastViewportDragRect
        && selectionResolver.refreshSelectionPreviewGeometry(
          nextRefresh.changedPreviewSurfaceRanges.size > 0
            ? [...nextRefresh.changedPreviewSurfaceRanges.values()]
            : undefined,
        )
      ) {
        renderSelectionPreview();
      }
    });
  };

  if (
    startZone === 'outside-editor' &&
    initialSelectedBlocks.length === 0 &&
    !useSelectionPreview &&
    onPendingPlainClick
  ) {
    const blockRects = rectResolver.getPlainClickBlockRects(event.clientX, event.clientY);
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
    let hasMeaningfulResize = entries.length === 0;
    let shouldRefreshPreviewGeometry = false;
    const changedPreviewSurfaceRanges = new Map<string, { from: number; to: number }>();
    for (const entry of entries) {
      const nextSize = {
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      };
      const previousSize = observedResizeSizes.get(entry.target);
      observedResizeSizes.set(entry.target, nextSize);
      if (useSelectionPreview && entry.target === view.dom) {
        if (hasMeaningfulWidthResizeDelta(previousSize, nextSize)) {
          hasMeaningfulResize = true;
        } else if (previousSize && hasMeaningfulResizeDelta(previousSize, nextSize)) {
          shouldRefreshPreviewGeometry = true;
        }
      } else if (
        useSelectionPreview
        && entry.target instanceof HTMLElement
        && observedPreviewSurfaceElements.has(entry.target)
      ) {
        // A first notification can already contain the post-layout size when
        // a rich block changes immediately after it is observed.
        if (!previousSize || hasMeaningfulResizeDelta(previousSize, nextSize)) {
          shouldRefreshPreviewGeometry = true;
          previewSurfaceRangesByElement.get(entry.target)?.forEach((range) => {
            changedPreviewSurfaceRanges.set(`${range.from}:${range.to}`, range);
          });
        }
      } else if (previousSize && hasMeaningfulResizeDelta(previousSize, nextSize)) {
        hasMeaningfulResize = true;
      }
    }
    if (!hasMeaningfulResize) {
      if (
        shouldRefreshPreviewGeometry
        && lastViewportDragRect
      ) {
        scheduleGeometryRefresh(false, changedPreviewSurfaceRanges);
      }
      return;
    }

    scheduleGeometryRefresh(true);
  };

  const scheduleDragBoxUpdate = (viewportRect: RectBounds) => {
    if (areRectBoundsEqual(renderedDragBoxRect, viewportRect)) return;
    pendingDragBoxRect = viewportRect;
    if (dragBoxRafId !== 0) return;

    dragBoxRafId = window.requestAnimationFrame(() => {
      dragBoxRafId = 0;
      if (!pendingDragBoxRect || !dragBox) return;
      const nextRect = pendingDragBoxRect;
      pendingDragBoxRect = null;
      updateDragBox(dragBox, nextRect);
      renderedDragBoxRect = nextRect;
    });
  };

  const renderSelectionPreview = () => {
    if (!selectionPreviewLayer) return;
    const previewRanges = selectionResolver.getSelectionPreviewRanges();
    const previewSurfaceRanges = selectionResolver.getSelectionPreviewSurfaceRanges();
    onPreviewSurfaceRangesChange?.(previewSurfaceRanges);
    let previewElements = rectResolver.getSelectionBlockElements(previewRanges);
    if (previewElements.length !== previewRanges.length) {
      const currentPreviewTargets = getInteractionCachedEditorBlockTargets(view, previewRanges);
      if (currentPreviewTargets) {
        previewElements = currentPreviewTargets.map((target) => target.element);
      }
    }
    const previewElementsByRange = new Map(
      previewRanges.map((range, index) => [
        `${range.from}:${range.to}`,
        previewElements[index],
      ] as const),
    );
    const previewSurfaceElementRanges = [] as typeof previewSurfaceRanges;
    const previewSurfaceElements = previewSurfaceRanges
      .map((range) => {
        const element = rectResolver.getSelectionBlockElements([range])[0]
          ?? previewElementsByRange.get(`${range.from}:${range.to}`);
        if (!element) return null;
        previewSurfaceElementRanges.push(range);
        return element;
      })
      .filter((element): element is HTMLElement => Boolean(element));
    syncPreviewSurfaceResizeTargets(previewSurfaceElements, previewSurfaceElementRanges);
    updateBlockSelectionPreviewLayer(
      selectionPreviewLayer,
      selectionResolver.getSelectionPreviewDocumentRects(),
      selectionResolver.getSelectionPreviewPath(),
      getAutoScrollBounds(),
      currentScrollLeft,
      currentScrollTop,
    );
    setBlockSelectionPreviewElements(
      view.dom,
      previewElements,
    );
  };

  const handleScrollWhileDragging = (knownScrollTop?: number) => {
    if (!lastViewportDragRect) return;

    if (knownScrollTop !== undefined) {
      pendingAutoScrollTop = knownScrollTop;
      currentScrollTop = knownScrollTop;
    } else if (pendingAutoScrollTop !== null) {
      currentScrollTop = pendingAutoScrollTop;
      pendingAutoScrollTop = null;
    } else {
      currentScrollLeft = scrollRoot?.scrollLeft ?? 0;
      currentScrollTop = scrollRoot?.scrollTop ?? 0;
      syncAutoScrollTop(currentScrollTop);
    }
    if (
      lastHandledScrollLeft === currentScrollLeft
      && lastHandledScrollTop === currentScrollTop
    ) {
      return;
    }
    lastHandledScrollLeft = currentScrollLeft;
    lastHandledScrollTop = currentScrollTop;

    if (dragBox) {
      const documentRect = createDragSelectionRect(
        event.clientX + startScrollLeft,
        event.clientY + startScrollTop,
        lastPointerX + currentScrollLeft,
        lastPointerY + currentScrollTop,
      );
      const viewportRect = convertDocumentRectToViewportRect(
        documentRect,
        currentScrollLeft,
        currentScrollTop,
      );
      scheduleDragBoxUpdate(clampViewportRectTop(viewportRect, dragBoxTopBoundary));
    }

    selectionResolver.applyDragRectSelectionIfNeeded(lastViewportDragRect);
    renderSelectionPreview();
  };
  const handleNativeScrollWhileDragging = () => handleScrollWhileDragging();

  const initialScrollRootRect = getInteractionCachedEditorGeometry(view)?.scrollRootRect;
  const autoScroll = createVerticalEdgeAutoScroll({
    scrollRoot,
    getPointerY: () => lastViewportDragRect ? lastPointerY : null,
    onScroll: handleScrollWhileDragging,
    initialBounds: initialScrollRootRect ? {
      left: initialScrollRootRect.left,
      top: initialScrollRootRect.top,
      right: initialScrollRootRect.right,
      bottom: initialScrollRootRect.bottom,
    } : null,
  });
  refreshAutoScrollBounds = autoScroll.refreshBounds;
  getAutoScrollBounds = autoScroll.getBounds;
  syncAutoScrollTop = autoScroll.syncScrollTop;

  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(handleGeometryResize);
    resizeObserver.observe(view.dom);
    if (scrollRoot) {
      resizeObserver.observe(scrollRoot);
    }
  }

  const session = startBlockDragSession({
    view,
    event,
    startZone,
    dragThreshold,
    cursor,
    cursorRoot: scrollRoot,
    onActivate() {
      autoScroll.start();
      dragBox = createDragBox(doc, dragBoxColor, !useSelectionPreview);
      doc.body.appendChild(dragBox);
      if (useSelectionPreview) {
        selectionPreviewLayer = createBlockSelectionPreviewLayer(doc, selectionPreviewColor);
        (view.dom.parentElement ?? doc.body).appendChild(selectionPreviewLayer);
      }
      dragBoxTopBoundary = getAutoScrollBounds()?.top ?? 0;
      if (!useSelectionPreview) {
        const selection = window.getSelection();
        if (selection && selection.rangeCount > 0) {
          selection.removeAllRanges();
        }
      }
      if (!useSelectionPreview) {
        blurActiveEditableElement(doc);
      }
      onActivateSelectionState();
      view.dom.classList.add(DRAG_SELECTION_PREVIEW_ACTIVE_CLASS);
    },
    onPointerMove(pointer) {
      lastPointerX = pointer.clientX;
      lastPointerY = pointer.clientY;
    },
    onDragMove(dragRect, pointer) {
      lastPointerX = pointer.clientX;
      lastPointerY = pointer.clientY;
      lastViewportDragRect = dragRect;
      const documentRect = createDragSelectionRect(
        event.clientX + startScrollLeft,
        event.clientY + startScrollTop,
        lastPointerX + currentScrollLeft,
        lastPointerY + currentScrollTop,
      );
      const displayedViewportRect = convertDocumentRectToViewportRect(
        documentRect,
        currentScrollLeft,
        currentScrollTop,
      );
      if (dragBox) {
        scheduleDragBoxUpdate(clampViewportRectTop(displayedViewportRect, dragBoxTopBoundary));
      }
      selectionResolver.applyDragRectSelectionIfNeeded(dragRect);
      renderSelectionPreview();
    },
    onPlainClick(zone) {
      if (pendingPlainClickHandled) return;
      const blockRects = rectResolver.getPlainClickBlockRects(event.clientX, event.clientY);
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
      handleScrollWhileDragging();
      const finalSelectionBlocks = selectionResolver.getSelectionBlocks();
      if (dragBox) {
        dragBox.remove();
        dragBox = null;
      }
      selectionPreviewLayer?.remove();
      selectionPreviewLayer = null;
      view.dom.classList.remove(DRAG_SELECTION_PREVIEW_ACTIVE_CLASS);
      if (dragBoxRafId !== 0) {
        window.cancelAnimationFrame(dragBoxRafId);
        dragBoxRafId = 0;
      }
      if (geometryRefreshRafId !== 0) {
        window.cancelAnimationFrame(geometryRefreshRafId);
        geometryRefreshRafId = 0;
      }
      pendingGeometryRefresh = null;
      pendingDragBoxRect = null;
      renderedDragBoxRect = null;
      resizeObserver?.disconnect();
      resizeObserver = null;
      observedPreviewSurfaceElements.clear();
      previewSurfaceRangesByElement.clear();
      scrollRoot?.removeEventListener('scroll', handleNativeScrollWhileDragging);
      autoScroll.stop();
      selectionResolver.invalidateGeometryCache();
      if (useSelectionPreview) {
        onPreviewSurfaceRangesChange?.([]);
        setBlockSelectionPreviewElements(view.dom, null);
      }
      onSyncSelectionState(finalSelectionBlocks);
    },
  });

  scrollRoot?.addEventListener('scroll', handleNativeScrollWhileDragging, { passive: true });
  return session;
}
