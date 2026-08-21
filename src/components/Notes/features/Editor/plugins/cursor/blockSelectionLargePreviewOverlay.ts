import type { EditorView } from '@milkdown/kit/prose/view';
import {
  getInteractionCachedEditorBlockTargets,
  subscribeCurrentEditorBlockPositionSnapshot,
} from '../../utils/editorBlockPositionCache';
import type { SelectableBlockTarget } from './blockUnitResolver';
import {
  getBlockRangesKey,
  resolveBlockSelectionDisplayRangeInfo,
} from './blockSelectionRanges';
import { getBlockSelectionPluginState } from './blockSelectionPluginState';
import { shouldRenderBlockSelectionWithPreview, type BlockRect } from './blockSelectionTypes';
import { resolveBlockSelectionPreviewMetrics } from './blockSelectionPreviewGeometry';
import {
  resolveBlockSelectionPreviewLayout,
} from './blockSelectionPreviewLayout';

const LARGE_SELECTION_PREVIEW_LAYER_CLASS = 'editor-block-selection-large-preview-layer';
const LARGE_SELECTION_PREVIEW_ACTIVE_CLASS = 'editor-block-selection-large-preview-active';

function createPreviewLayer(doc: Document): SVGSVGElement {
  const layer = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
  layer.classList.add(LARGE_SELECTION_PREVIEW_LAYER_CLASS);
  layer.setAttribute('aria-hidden', 'true');
  layer.setAttribute('data-editor-block-selection-committed-preview', 'true');
  layer.appendChild(doc.createElementNS('http://www.w3.org/2000/svg', 'path'));
  return layer;
}

function mapTargetToPreviewBlock(
  updatedView: EditorView,
  target: {
    range: { from: number; to: number };
    element: HTMLElement;
    rect: DOMRect;
  },
  hostRect: DOMRect,
  editorRect: DOMRect,
): BlockRect {
  const { isFullListItem } = resolveBlockSelectionDisplayRangeInfo(
    updatedView.state.doc,
    target.range,
  );
  const rect = target.element.isConnected
    ? isFullListItem && target.element.tagName === 'LI'
      ? target.element.getBoundingClientRect()
      : target.rect
    : target.rect;

  return {
    from: target.range.from,
    to: target.range.to,
    left: editorRect.left - hostRect.left,
    top: rect.top - hostRect.top,
    right: editorRect.right - hostRect.left,
    bottom: rect.bottom - hostRect.top,
  };
}

function areTargetRectsEqual(
  left: readonly SelectableBlockTarget[],
  right: readonly SelectableBlockTarget[],
): boolean {
  return left.length === right.length && left.every((target, index) => {
    const candidate = right[index];
    return Boolean(
      candidate
      && target.range.from === candidate.range.from
      && target.range.to === candidate.range.to
      && target.rect.left === candidate.rect.left
      && target.rect.top === candidate.rect.top
      && target.rect.right === candidate.rect.right
      && target.rect.bottom === candidate.rect.bottom,
    );
  });
}

function areRectsEqual(left: DOMRect | null, right: DOMRect): boolean {
  return Boolean(
    left
    && left.left === right.left
    && left.top === right.top
    && left.right === right.right
    && left.bottom === right.bottom,
  );
}

export function createLargeBlockSelectionPreviewOverlay(view: EditorView) {
  const doc = view.dom.ownerDocument;
  const host = view.dom.parentElement ?? view.dom;
  const layer = createPreviewLayer(doc);
  const path = layer.firstElementChild as SVGPathElement;
  host.appendChild(layer);

  let currentView = view;
  let lastDoc: EditorView['state']['doc'] | null = null;
  let lastSelectionKey = '';
  let lastTargets: SelectableBlockTarget[] | null = null;
  let lastHostRect: DOMRect | null = null;
  let lastEditorRect: DOMRect | null = null;
  let geometryRafId = 0;
  const previewMetrics = resolveBlockSelectionPreviewMetrics(view.dom);

  const clear = () => {
    lastDoc = currentView.state.doc;
    lastSelectionKey = '';
    lastTargets = null;
    lastHostRect = null;
    lastEditorRect = null;
    if (layer.dataset.selectionCount !== '0') {
      layer.dataset.selectionCount = '0';
    }
    if (currentView.dom.classList.contains(LARGE_SELECTION_PREVIEW_ACTIVE_CLASS)) {
      currentView.dom.classList.remove(LARGE_SELECTION_PREVIEW_ACTIVE_CLASS);
    }
    if (path.hasAttribute('d')) path.removeAttribute('d');
  };

  const render = (updatedView: EditorView, forceGeometryRefresh = false) => {
    currentView = updatedView;
    const { decorationsDeferred, selectedBlocks } = getBlockSelectionPluginState(updatedView.state);
    if (
      decorationsDeferred
      || !shouldRenderBlockSelectionWithPreview(selectedBlocks.length)
    ) {
      clear();
      return;
    }

    const selectionKey = getBlockRangesKey(selectedBlocks);
    if (
      !forceGeometryRefresh
      && lastDoc === updatedView.state.doc
      && lastSelectionKey === selectionKey
    ) return;

    const targets = getInteractionCachedEditorBlockTargets(updatedView, selectedBlocks, {
      resolveCurrentElements: false,
    });
    if (!targets) {
      if (
        lastDoc === updatedView.state.doc
        && lastSelectionKey === selectionKey
        && path.hasAttribute('d')
      ) {
        return;
      }
      clear();
      return;
    }
    const hostRect = host.getBoundingClientRect();
    const editorRect = updatedView.dom.getBoundingClientRect();
    if (
      forceGeometryRefresh
      && lastDoc === updatedView.state.doc
      && lastSelectionKey === selectionKey
      && lastTargets
      && areTargetRectsEqual(lastTargets, targets)
      && areRectsEqual(lastHostRect, hostRect)
      && areRectsEqual(lastEditorRect, editorRect)
    ) return;

    const sourceBlocks = targets.map((target) => mapTargetToPreviewBlock(
      updatedView,
      target,
      hostRect,
      editorRect,
    ));
    const previewLayout = resolveBlockSelectionPreviewLayout({
      doc: updatedView.state.doc,
      selectedBlocks,
      sourceBlocks,
      metrics: previewMetrics,
    });
    const pathData = previewLayout.pathData;
    const renderedCount = previewLayout.rects.length;

    lastDoc = updatedView.state.doc;
    lastSelectionKey = selectionKey;
    lastTargets = targets;
    lastHostRect = hostRect;
    lastEditorRect = editorRect;
    const selectionCount = String(renderedCount);
    if (layer.dataset.selectionCount !== selectionCount) {
      layer.dataset.selectionCount = selectionCount;
    }
    const previewActive = renderedCount > 0;
    if (updatedView.dom.classList.contains(LARGE_SELECTION_PREVIEW_ACTIVE_CLASS) !== previewActive) {
      updatedView.dom.classList.toggle(LARGE_SELECTION_PREVIEW_ACTIVE_CLASS, previewActive);
    }
    if (path.getAttribute('d') !== pathData) {
      path.setAttribute('d', pathData);
    }
  };

  const scheduleGeometryRefresh = () => {
    const win = doc.defaultView;
    if (!win || geometryRafId !== 0) return;
    const { decorationsDeferred, selectedBlocks } = getBlockSelectionPluginState(currentView.state);
    if (
      decorationsDeferred
      || !shouldRenderBlockSelectionWithPreview(selectedBlocks.length)
    ) return;
    geometryRafId = win.requestAnimationFrame(() => {
      geometryRafId = 0;
      render(currentView, true);
    });
  };

  const unsubscribeSnapshot = subscribeCurrentEditorBlockPositionSnapshot((snapshot) => {
    if (snapshot?.view === currentView) scheduleGeometryRefresh();
  });
  const resizeObserver = typeof ResizeObserver === 'undefined'
    ? null
    : new ResizeObserver(scheduleGeometryRefresh);
  resizeObserver?.observe(view.dom);
  if (host !== view.dom) resizeObserver?.observe(host);
  doc.defaultView?.addEventListener('resize', scheduleGeometryRefresh);

  render(view);

  return {
    update: render,
    destroy() {
      unsubscribeSnapshot();
      resizeObserver?.disconnect();
      doc.defaultView?.removeEventListener('resize', scheduleGeometryRefresh);
      if (geometryRafId !== 0) {
        doc.defaultView?.cancelAnimationFrame(geometryRafId);
        geometryRafId = 0;
      }
      currentView.dom.classList.remove(LARGE_SELECTION_PREVIEW_ACTIVE_CLASS);
      layer.remove();
    },
  };
}
