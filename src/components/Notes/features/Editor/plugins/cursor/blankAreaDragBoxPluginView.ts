import type { EditorState } from '@milkdown/kit/prose/state';
import type { EditorView } from '@milkdown/kit/prose/view';
import type { BlockRange } from './blockSelectionUtils';
import { type BlockDragStartZone } from './blockDragSession';
import {
  clearBlockSelection,
  getBlockSelectionPluginState,
  hasSelectedBlocks,
  setBlockSelectionEnabled,
  setBlockSelectionVisualState,
  syncBlockSelectionVisualState,
} from './blockSelectionPluginState';
import {
  handleBlockSelectionCopy,
  handleBlockSelectionCut,
  handleBlockSelectionKeyDown,
} from './blockSelectionInputHandlers';
import { createBlockSelectionLineFillOverlay } from './blockSelectionLineFillOverlay';
import { createLargeBlockSelectionPreviewOverlay } from './blockSelectionLargePreviewOverlay';
import { handleListGapPlaceholderPointerDown } from './listGapPlaceholder';
import {
  handleMarkdownBlankLinePointerDown,
  stopMarkdownBlankLineTextSelectionSession,
} from './markdownBlankLineInteraction';
import { clearForcedCaretForOwner } from './forcedLineEdgeCaret';
import {
  focusEmptyUntitledDraftTitleFromBlankAreaClick,
  handleTrailingBlankClickInsideLastList,
  resolveInsideBlockTrailingPlainClick,
  scheduleExternalTextLineGutterWhitespaceSelectionCleanup,
  shouldIgnoreBlankAreaDragBoxMouseDown,
  startInsideBlockTrailingPlainClickSession,
} from './blankAreaDragBoxPlainClicks';
import {
  collapseNativeNodeSelectionForExternalMouseDown,
  deleteSelectedBlocks,
  handleDocumentBlockSelectionPaste,
  shouldHandleDocumentBlockSelectionEvent,
} from './blankAreaDragBoxDocumentSelection';
import { markBlockSelectionPointerDown } from './blockSelectionInteractionState';

interface CreateBlankAreaDragBoxPluginViewOptions {
  clearInsideBlockTrailingPlainClickSession: () => void;
  clearSession: () => void;
  clearUnclaimedBlankPlainClickSession: () => void;
  documentInspectedMouseDownEvents: WeakSet<MouseEvent>;
  serializeSelectedBlocks: (state: EditorState, selectedBlocks: readonly BlockRange[]) => string;
  setInsideBlockTrailingPlainClickSession: (stop: () => void) => void;
  tryStartSession: (view: EditorView, event: MouseEvent) => BlockDragStartZone | null;
  tryStartUnclaimedBlankPlainClickSession: (view: EditorView, event: MouseEvent) => void;
}

function stopHandledDocumentMouseDown(view: EditorView, event: MouseEvent): void {
  clearForcedCaretForOwner(view.dom);
  event.stopImmediatePropagation();
}

export function createBlankAreaDragBoxPluginView(
  view: EditorView,
  options: CreateBlankAreaDragBoxPluginViewOptions,
) {
  const doc = view.dom.ownerDocument;
  const lineFillOverlay = createBlockSelectionLineFillOverlay(view);
  const largeSelectionPreviewOverlay = createLargeBlockSelectionPreviewOverlay(view);
  setBlockSelectionEnabled(view, true);
  syncBlockSelectionVisualState(view);
  const handleDocumentKeyDown = (event: KeyboardEvent) => {
    if (event.isComposing) return;
    if (!shouldHandleDocumentBlockSelectionEvent(view, event)) return;
    const { selectedBlocks } = getBlockSelectionPluginState(view.state);
    if (!handleBlockSelectionKeyDown(event, {
      view,
      selectedBlocks,
      serializeSelectedBlocks: options.serializeSelectedBlocks,
      deleteSelectedBlocks,
    })) {
      return;
    }
    event.stopImmediatePropagation();
  };
  const handleDocumentCopy = (event: ClipboardEvent) => {
    if (!shouldHandleDocumentBlockSelectionEvent(view, event)) return;
    const { selectedBlocks } = getBlockSelectionPluginState(view.state);
    if (!handleBlockSelectionCopy(event, {
      view,
      selectedBlocks,
      serializeSelectedBlocks: options.serializeSelectedBlocks,
    })) {
      return;
    }
    event.stopImmediatePropagation();
  };
  const handleDocumentCut = (event: ClipboardEvent) => {
    if (!shouldHandleDocumentBlockSelectionEvent(view, event)) return;
    const { selectedBlocks } = getBlockSelectionPluginState(view.state);
    if (!handleBlockSelectionCut(event, {
      view,
      selectedBlocks,
      serializeSelectedBlocks: options.serializeSelectedBlocks,
      deleteSelectedBlocks,
    })) {
      return;
    }
    event.stopImmediatePropagation();
  };
  const handleDocumentPaste = (event: ClipboardEvent) => {
    if (!shouldHandleDocumentBlockSelectionEvent(view, event)) return;
    if (!handleDocumentBlockSelectionPaste(view, event)) return;
    event.stopImmediatePropagation();
  };
  const handleDocumentMouseDown = (event: MouseEvent) => {
    collapseNativeNodeSelectionForExternalMouseDown(view, event);
    if (event.button !== 0) return;
    if (shouldIgnoreBlankAreaDragBoxMouseDown(view, event)) {
      return;
    }
    if (focusEmptyUntitledDraftTitleFromBlankAreaClick(view, event)) {
      event.preventDefault();
      stopHandledDocumentMouseDown(view, event);
      return;
    }
    if (handleMarkdownBlankLinePointerDown(view, event)) {
      stopHandledDocumentMouseDown(view, event);
      return;
    }
    const target = event.target;
    if (target instanceof Node && view.dom.contains(target)) {
      options.documentInspectedMouseDownEvents.add(event);
      if (
        handleListGapPlaceholderPointerDown(view, event) ||
        handleTrailingBlankClickInsideLastList(view, event)
      ) {
        stopHandledDocumentMouseDown(view, event);
        return;
      }

      const startZone = options.tryStartSession(view, event);
      if (startZone) {
        stopHandledDocumentMouseDown(view, event);
        return;
      }

      if (hasSelectedBlocks(view.state)) {
        markBlockSelectionPointerDown(event);
        clearBlockSelection(view);
      }
      options.tryStartUnclaimedBlankPlainClickSession(view, event);
      return;
    }
    const startZone = options.tryStartSession(view, event);
    if (startZone) return;

    scheduleExternalTextLineGutterWhitespaceSelectionCleanup(view, event);

    const insideBlockTrailingClickAction = resolveInsideBlockTrailingPlainClick(view, event);
    if (insideBlockTrailingClickAction) {
      options.clearInsideBlockTrailingPlainClickSession();
      options.setInsideBlockTrailingPlainClickSession(startInsideBlockTrailingPlainClickSession(
        view,
        event,
        insideBlockTrailingClickAction,
      ));
      event.preventDefault();
      return;
    }

    options.tryStartUnclaimedBlankPlainClickSession(view, event);
    clearBlockSelection(view);
  };

  doc.addEventListener('keydown', handleDocumentKeyDown, true);
  doc.addEventListener('copy', handleDocumentCopy, true);
  doc.addEventListener('cut', handleDocumentCut, true);
  doc.addEventListener('paste', handleDocumentPaste, true);
  doc.addEventListener('mousedown', handleDocumentMouseDown, true);

  return {
    update(updatedView: EditorView) {
      syncBlockSelectionVisualState(updatedView);
      lineFillOverlay.update(updatedView);
      largeSelectionPreviewOverlay.update(updatedView);
    },
    destroy() {
      doc.removeEventListener('keydown', handleDocumentKeyDown, true);
      doc.removeEventListener('copy', handleDocumentCopy, true);
      doc.removeEventListener('cut', handleDocumentCut, true);
      doc.removeEventListener('paste', handleDocumentPaste, true);
      doc.removeEventListener('mousedown', handleDocumentMouseDown, true);
      clearForcedCaretForOwner(view.dom);
      lineFillOverlay.destroy();
      largeSelectionPreviewOverlay.destroy();
      options.clearSession();
      options.clearInsideBlockTrailingPlainClickSession();
      options.clearUnclaimedBlankPlainClickSession();
      stopMarkdownBlankLineTextSelectionSession(view);
      setBlockSelectionVisualState(view, false, false);
      setBlockSelectionEnabled(view, false);
    },
  };
}
