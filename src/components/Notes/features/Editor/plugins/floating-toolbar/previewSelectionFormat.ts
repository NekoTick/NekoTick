import type { EditorView } from '@milkdown/kit/prose/view';
import {
  TEXT_SELECTION_OVERLAY_CLASS,
  TOOLBAR_FORMAT_PREVIEW_ATTRIBUTE,
  TOOLBAR_FORMAT_PREVIEW_MODE_ATTRIBUTE,
  TOOLBAR_SELECTION_HIDDEN_PREVIEW_CLASS,
} from './previewStyleConstants';
import {
  clearNativeSelectionForPreviewFrames,
  showTextSelectionOverlayForPreview,
} from './previewNativeSelection';
import {
  getSelectionColorPreviewSignature,
  hasSameSelectionColorPreviewSignature,
} from './previewSelectionSignature';
import { capturePreviewScrollSnapshot, restorePreviewScrollSnapshot } from './previewScroll';
import { previewStyleState } from './previewStyleState';

function hasMatchingSelectionFormatPreview(view: EditorView, key: string): boolean {
  const preview = previewStyleState.selectionFormatPreview;
  return Boolean(
    preview &&
    preview.viewDom === view.dom &&
    preview.key === key &&
    view.state.doc.eq(preview.originalDoc) &&
    hasSameSelectionColorPreviewSignature(
      getSelectionColorPreviewSignature(view),
      preview.selection
    ) &&
    view.dom.getElementsByClassName(TEXT_SELECTION_OVERLAY_CLASS).length > 0
  );
}

export function refreshMatchingSelectionFormatPreview(view: EditorView, key: string): boolean {
  if (!hasMatchingSelectionFormatPreview(view, key)) {
    return false;
  }

  clearNativeSelectionForPreviewFrames(view.dom);
  return true;
}

export function clearSelectionFormatPreview(): boolean {
  const preview = previewStyleState.selectionFormatPreview;
  if (!preview) {
    return false;
  }

  const scrollSnapshot = capturePreviewScrollSnapshot(preview.viewDom);
  if (preview.viewDom.isConnected) {
    preview.viewDom.classList.remove(TOOLBAR_SELECTION_HIDDEN_PREVIEW_CLASS);
    preview.viewDom.removeAttribute(TOOLBAR_FORMAT_PREVIEW_ATTRIBUTE);
    preview.viewDom.removeAttribute(TOOLBAR_FORMAT_PREVIEW_MODE_ATTRIBUTE);
  }
  previewStyleState.selectionFormatPreview = null;
  restorePreviewScrollSnapshot(scrollSnapshot);
  return true;
}

export function renderSelectionFormatPreview(
  view: EditorView,
  action: string,
  isActive: boolean,
  key: string
): boolean {
  if (!(view.dom instanceof HTMLElement)) {
    return false;
  }
  if (!view.state.selection || view.state.selection.empty) {
    return false;
  }
  if (hasMatchingSelectionFormatPreview(view, key)) {
    clearNativeSelectionForPreviewFrames(view.dom);
    return true;
  }

  clearSelectionFormatPreview();
  const scrollSnapshot = capturePreviewScrollSnapshot(view.dom);
  showTextSelectionOverlayForPreview(view);

  view.dom.classList.add(TOOLBAR_SELECTION_HIDDEN_PREVIEW_CLASS);
  view.dom.setAttribute(TOOLBAR_FORMAT_PREVIEW_ATTRIBUTE, action);
  view.dom.setAttribute(TOOLBAR_FORMAT_PREVIEW_MODE_ATTRIBUTE, isActive ? 'remove' : 'apply');
  previewStyleState.selectionFormatPreview = {
    key,
    originalDoc: view.state.doc,
    selection: getSelectionColorPreviewSignature(view),
    viewDom: view.dom,
  };
  clearNativeSelectionForPreviewFrames(view.dom);
  restorePreviewScrollSnapshot(scrollSnapshot);
  return true;
}
