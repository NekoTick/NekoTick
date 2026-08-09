import type { EditorView } from '@milkdown/kit/prose/view';
import { showTextSelectionOverlayForTransaction } from '../selection/textSelectionOverlayPlugin';
import {
  POINTER_NATIVE_SELECTION_CLASS,
  TEXT_SELECTION_OVERLAY_CLASS,
} from './previewStyleConstants';
import { previewStyleState } from './previewStyleState';

export function clearNativeSelectionForPreview(view: EditorView): void {
  view.dom.ownerDocument.defaultView?.getSelection()?.removeAllRanges();
}

export function clearNativeSelectionForPreviewFrames(viewDom: HTMLElement): void {
  const ownerWindow = viewDom.ownerDocument.defaultView;
  if (!ownerWindow) {
    return;
  }

  const clear = () => {
    if (
      viewDom.isConnected &&
      (
        previewStyleState.selectionColorPreview?.viewDom === viewDom ||
        previewStyleState.selectionFormatPreview?.viewDom === viewDom ||
        previewStyleState.selectionAlignmentPreview?.viewDom === viewDom ||
        previewStyleState.selectionBlockPreview?.viewDom === viewDom ||
        previewStyleState.previewOverlay?.viewDom === viewDom
      )
    ) {
      ownerWindow.getSelection()?.removeAllRanges();
    }
  };

  clear();
  queueMicrotask(clear);
  ownerWindow.requestAnimationFrame(clear);
  ownerWindow.setTimeout(clear, 0);
  ownerWindow.setTimeout(clear, 50);
}

export function showTextSelectionOverlayForPreview(view: EditorView): void {
  if (
    view.dom instanceof HTMLElement &&
    !view.dom.classList.contains(POINTER_NATIVE_SELECTION_CLASS) &&
    view.dom.getElementsByClassName(TEXT_SELECTION_OVERLAY_CLASS).length > 0
  ) {
    return;
  }

  const selection = view.state.selection;
  const tr = view.state.tr;
  if (!selection || selection.empty || typeof tr?.setMeta !== 'function') {
    return;
  }

  view.dispatch(
    showTextSelectionOverlayForTransaction(tr)
      .setMeta('addToHistory', false)
  );
}
