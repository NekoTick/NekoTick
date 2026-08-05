import type { EditorView } from '@milkdown/kit/prose/view';
import {
  getInteractionCachedEditorBlockTargets,
  getInteractionCachedEditorGeometry,
  subscribeCurrentEditorBlockPositionSnapshot,
} from '../../utils/editorBlockPositionCache';
import { getBlockRangesKey } from './blockSelectionRanges';
import { getBlockSelectionPluginState } from './blockSelectionPluginState';
import { shouldRenderBlockSelectionWithPreview } from './blockSelectionTypes';
import {
  createRoundedBlockSelectionPreviewPath,
  resolveBlockSelectionPreviewMetrics,
  resolveBlockSelectionPreviewRects,
} from './blockSelectionPreviewGeometry';

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

export function createLargeBlockSelectionPreviewOverlay(view: EditorView) {
  const doc = view.dom.ownerDocument;
  const host = view.dom.parentElement ?? view.dom;
  const layer = createPreviewLayer(doc);
  const path = layer.firstElementChild as SVGPathElement;
  host.appendChild(layer);

  let currentView = view;
  let lastDoc: EditorView['state']['doc'] | null = null;
  let lastSelectionKey = '';
  let geometryRafId = 0;
  const previewMetrics = resolveBlockSelectionPreviewMetrics(view.dom);

  const clear = () => {
    lastDoc = currentView.state.doc;
    lastSelectionKey = '';
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

    const targets = getInteractionCachedEditorBlockTargets(updatedView, selectedBlocks);
    if (!targets) {
      clear();
      return;
    }

    const hostRect = host.getBoundingClientRect();
    const editorRect = getInteractionCachedEditorGeometry(updatedView)?.editorRect
      ?? updatedView.dom.getBoundingClientRect();
    const previewBlocks = targets.map((target) => ({
      from: target.range.from,
      to: target.range.to,
      left: editorRect.left - hostRect.left,
      top: target.rect.top - hostRect.top,
      right: editorRect.right - hostRect.left,
      bottom: target.rect.bottom - hostRect.top,
    }));
    const previewRects = resolveBlockSelectionPreviewRects(
      updatedView.state.doc,
      previewBlocks,
      previewMetrics,
    );
    const pathData = createRoundedBlockSelectionPreviewPath(previewRects, previewMetrics.radiusPx);
    const renderedCount = previewRects.length;

    lastDoc = updatedView.state.doc;
    lastSelectionKey = selectionKey;
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
