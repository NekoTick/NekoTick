import type { EditorView } from '@milkdown/kit/prose/view';
import {
  setTextSelectionInlineDecorationsForTransaction,
  showTextSelectionOverlayForTransaction,
  textSelectionOverlayPluginKey,
} from '../selection/textSelectionOverlayState';
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

export function showTextSelectionOverlayForPreview(
  view: EditorView,
  renderInlineDecorations = true,
): void {
  const pluginState = textSelectionOverlayPluginKey.getState(view.state);
  const hasInlineDecorations = view.dom instanceof HTMLElement
    && view.dom.getElementsByClassName(TEXT_SELECTION_OVERLAY_CLASS).length > 0;
  if (
    view.dom instanceof HTMLElement &&
    !view.dom.classList.contains(POINTER_NATIVE_SELECTION_CLASS) &&
    (
      pluginState?.renderInlineDecorations === renderInlineDecorations
      || (pluginState === undefined && renderInlineDecorations && hasInlineDecorations)
    ) &&
    (
      !renderInlineDecorations
      || hasInlineDecorations
    )
  ) {
    return;
  }

  const selection = view.state.selection;
  const tr = view.state.tr;
  if (!selection || selection.empty || typeof tr?.setMeta !== 'function') {
    return;
  }

  view.dispatch(
    setTextSelectionInlineDecorationsForTransaction(
      showTextSelectionOverlayForTransaction(tr),
      renderInlineDecorations,
    )
      .setMeta('addToHistory', false)
  );
}
