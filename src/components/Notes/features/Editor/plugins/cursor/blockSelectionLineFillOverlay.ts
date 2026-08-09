import type { EditorView } from '@milkdown/kit/prose/view';
import { getBlockSelectionPluginState } from './blockSelectionPluginState';
import {
  getBlockRangesKey,
  type BlockRange,
} from './blockSelectionUtils';
import {
  BLOCK_SELECTION_PENDING_CLASS,
  LINE_FILL_LAYER_CLASS,
  MAX_BLOCK_SELECTION_LINE_FILL_ELEMENTS,
  MAX_BLOCK_SELECTION_LINE_FILL_DOM_RECTS,
  MAX_BLOCK_SELECTION_LINE_FILL_RANGES,
  type LineFillOverlay,
} from './blockSelectionLineFillConstants';
import {
  LARGE_BLOCK_SELECTION_RENDERING_THRESHOLD,
  shouldRenderBlockSelectionWithPreview,
} from './blockSelectionTypes';
import { isBlockSelectionInteractionPending } from './blockSelectionInteractionState';
import { collectSelectedHardBreakLineRanges } from './blockSelectionLineFillRanges';
import { collectRangeRows } from './blockSelectionLineFillRows';
import {
  isRectNearViewport,
  resolveLineFillEdges,
  resolveLineFillLeft,
  resolveLineFillRight,
  resolveLineFillViewportRect,
  resolveParagraphElement,
} from './blockSelectionLineFillMetrics';
import {
  appendLineFillElement,
  appendSelectedImageBlockLineFills,
  collectSelectedImageBlockElements,
} from './blockSelectionLineFillRender';

export {
  collectRangeRows,
  collectSelectedHardBreakLineRanges,
  MAX_BLOCK_SELECTION_LINE_FILL_DOM_RECTS,
  MAX_BLOCK_SELECTION_LINE_FILL_RANGES,
};

interface LineFillInput {
  doc: EditorView['state']['doc'];
  hardBreakRanges: BlockRange[];
  hardBreakRangesKey: string;
  selectedImages: HTMLElement[];
}

function collectLineFillInput(view: EditorView): LineFillInput {
  const { decorationsDeferred, selectedBlocks } = getBlockSelectionPluginState(view.state);
  if (
    decorationsDeferred
    || selectedBlocks.length === 0
    || shouldRenderBlockSelectionWithPreview(selectedBlocks.length)
  ) {
    return {
      doc: view.state.doc,
      hardBreakRanges: [],
      hardBreakRangesKey: '',
      selectedImages: [],
    };
  }

  const hardBreakRanges = collectSelectedHardBreakLineRanges(view);
  return {
    doc: view.state.doc,
    hardBreakRanges,
    hardBreakRangesKey: getBlockRangesKey(hardBreakRanges),
    selectedImages: collectSelectedImageBlockElements(view),
  };
}

function hasSameLineFillInput(left: LineFillInput | null, right: LineFillInput): boolean {
  if (
    !left
    || left.doc !== right.doc
    || left.hardBreakRangesKey !== right.hardBreakRangesKey
    || left.selectedImages.length !== right.selectedImages.length
  ) {
    return false;
  }

  return left.selectedImages.every((image, index) => image === right.selectedImages[index]);
}

function hasLineFillContent(input: LineFillInput | null): boolean {
  return Boolean(
    input
    && (input.hardBreakRanges.length > 0 || input.selectedImages.length > 0)
  );
}

export function createBlockSelectionLineFillOverlay(view: EditorView): LineFillOverlay {
  const doc = view.dom.ownerDocument;
  const host = view.dom.parentElement ?? view.dom;
  const scrollRoot = view.dom.closest<HTMLElement>('[data-note-scroll-root="true"]');
  const win = doc.defaultView;
  let lastInput: LineFillInput | null = null;
  let pendingSelectionInput: LineFillInput | null = null;
  let currentView = view;
  let selectionRafId = 0;
  let scrollRafId = 0;
  let deferredGeometryUpdateTimeoutId = 0;
  let resizeObserver: ResizeObserver | null = null;
  if (host instanceof HTMLElement) {
    host.classList.add('editor-block-selection-line-fill-host');
  }
  const layer = doc.createElement('div');
  layer.className = LINE_FILL_LAYER_CLASS;
  layer.setAttribute('aria-hidden', 'true');
  host.appendChild(layer);

  const render = (
    updatedView: EditorView,
    input: LineFillInput,
    forceGeometryRefresh = false,
  ) => {
    currentView = updatedView;
    if (!forceGeometryRefresh && hasSameLineFillInput(lastInput, input)) {
      return;
    }
    lastInput = input;

    if (!hasLineFillContent(input)) {
      if (layer.childNodes.length > 0) {
        layer.replaceChildren();
      }
      return;
    }

    const currentHost = layer.parentElement ?? updatedView.dom;
    const hostRect = currentHost.getBoundingClientRect();
    const editorRect = updatedView.dom.getBoundingClientRect();
    const viewportRect = resolveLineFillViewportRect(updatedView);
    const nextContent = doc.createDocumentFragment();
    const visibleRanges: Array<{
      paragraph: HTMLElement;
      paragraphRect: DOMRect;
      range: BlockRange;
    }> = [];
    const paragraphRects = new WeakMap<HTMLElement, DOMRect>();
    let createdFills = 0;

    for (const range of input.hardBreakRanges) {
      const paragraph = resolveParagraphElement(updatedView, range);
      if (!paragraph || paragraph.closest('.heading-collapsed-content, .editor-collapsed-content')) continue;
      let paragraphRect = paragraphRects.get(paragraph);
      if (!paragraphRect) {
        paragraphRect = paragraph.getBoundingClientRect();
        paragraphRects.set(paragraph, paragraphRect);
      }
      if (viewportRect && paragraphRect.top > viewportRect.bottom) break;
      if (!isRectNearViewport(paragraphRect, viewportRect)) continue;

      const previous = visibleRanges[visibleRanges.length - 1];
      if (previous?.paragraph === paragraph && range.from <= previous.range.to) {
        previous.range.to = Math.max(previous.range.to, range.to);
        continue;
      }
      visibleRanges.push({ paragraph, paragraphRect, range: { ...range } });
    }
    for (const { paragraph, paragraphRect, range } of visibleRanges) {
      if (createdFills >= MAX_BLOCK_SELECTION_LINE_FILL_ELEMENTS) break;

      const fillStart = resolveLineFillLeft(paragraph, paragraphRect);
      const fillRight = resolveLineFillRight(updatedView, paragraph, paragraphRect, editorRect);
      const edges = resolveLineFillEdges(paragraph);
      const rows = collectRangeRows(updatedView, range);
      if (rows.length === 0) continue;
      const firstRow = rows[0];
      const lastRow = rows[rows.length - 1];
      if (
        firstRow &&
        lastRow &&
        appendLineFillElement(doc, nextContent, hostRect, fillStart, fillRight, firstRow.top, lastRow.bottom, edges)
      ) {
        createdFills += 1;
      }
    }

    createdFills += appendSelectedImageBlockLineFills(
      updatedView,
      input.selectedImages,
      doc,
      nextContent,
      hostRect,
      viewportRect,
      MAX_BLOCK_SELECTION_LINE_FILL_ELEMENTS - createdFills,
    );
    layer.replaceChildren(nextContent);
  };

  const isBlockSelectionDragPending = () => (
    currentView.dom.classList.contains(BLOCK_SELECTION_PENDING_CLASS)
    || isBlockSelectionInteractionPending(currentView.dom)
  );

  const update = (updatedView: EditorView) => {
    currentView = updatedView;
    const { selectedBlocks } = getBlockSelectionPluginState(updatedView.state);
    const input = collectLineFillInput(updatedView);
    if (hasSameLineFillInput(lastInput, input)) {
      if (win && selectionRafId !== 0) {
        win.cancelAnimationFrame(selectionRafId);
        selectionRafId = 0;
        pendingSelectionInput = null;
      }
      return;
    }
    const shouldScheduleRender = Boolean(
      win
      && (
        isBlockSelectionDragPending()
        || selectedBlocks.length >= LARGE_BLOCK_SELECTION_RENDERING_THRESHOLD
      )
    );
    if (!shouldScheduleRender || !win) {
      if (win && selectionRafId !== 0) {
        win.cancelAnimationFrame(selectionRafId);
        selectionRafId = 0;
      }
      pendingSelectionInput = null;
      render(updatedView, input);
      return;
    }

    pendingSelectionInput = input;
    if (selectionRafId !== 0) return;
    selectionRafId = win.requestAnimationFrame(() => {
      selectionRafId = 0;
      const nextInput = pendingSelectionInput;
      pendingSelectionInput = null;
      if (!nextInput) return;
      render(currentView, nextInput);
    });
  };

  const scheduleDeferredGeometryUpdateAfterDrag = () => {
    if (!win || deferredGeometryUpdateTimeoutId !== 0) return;
    deferredGeometryUpdateTimeoutId = win.setTimeout(() => {
      deferredGeometryUpdateTimeoutId = 0;
      if (isBlockSelectionDragPending()) {
        scheduleDeferredGeometryUpdateAfterDrag();
        return;
      }
      scheduleGeometryUpdate();
    }, 80);
  };

  function scheduleGeometryUpdate() {
    if (!win || scrollRafId !== 0) return;
    if (isBlockSelectionDragPending()) {
      scheduleDeferredGeometryUpdateAfterDrag();
      return;
    }
    if (!hasLineFillContent(lastInput) && layer.childNodes.length === 0) {
      return;
    }
    scrollRafId = win.requestAnimationFrame(() => {
      scrollRafId = 0;
      render(currentView, collectLineFillInput(currentView), true);
    });
  }

  scrollRoot?.addEventListener('scroll', scheduleGeometryUpdate, { passive: true });
  win?.addEventListener('resize', scheduleGeometryUpdate);
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(scheduleGeometryUpdate);
    resizeObserver.observe(view.dom);
    if (host instanceof HTMLElement && host !== view.dom) {
      resizeObserver.observe(host);
    }
    if (scrollRoot && scrollRoot !== view.dom && scrollRoot !== host) {
      resizeObserver.observe(scrollRoot);
    }
  }

  update(view);

  return {
    update,
    destroy() {
      scrollRoot?.removeEventListener('scroll', scheduleGeometryUpdate);
      win?.removeEventListener('resize', scheduleGeometryUpdate);
      resizeObserver?.disconnect();
      resizeObserver = null;
      if (win && scrollRafId !== 0) {
        win.cancelAnimationFrame(scrollRafId);
        scrollRafId = 0;
      }
      if (win && selectionRafId !== 0) {
        win.cancelAnimationFrame(selectionRafId);
        selectionRafId = 0;
      }
      pendingSelectionInput = null;
      if (win && deferredGeometryUpdateTimeoutId !== 0) {
        win.clearTimeout(deferredGeometryUpdateTimeoutId);
        deferredGeometryUpdateTimeoutId = 0;
      }
      if (host instanceof HTMLElement) {
        host.classList.remove('editor-block-selection-line-fill-host');
      }
      layer.remove();
    },
  };
}
