import { $prose } from '@milkdown/kit/utils';
import { Plugin } from '@milkdown/kit/prose/state';
import {
  handleEditableMarkdownBlankLineAfterHeadingKeyboardDelete,
  handleMarkdownBlankLineDeletion,
} from './markdownBlankLineInteraction';
import {
  handleBackspaceAtParagraphStartAfterStructuralGap,
  handleDocumentBoundaryAtomicBlockDelete,
  handleEmptyParagraphBetweenPlainParagraphsDelete,
  handleEmptyCodeBlockDelete,
  handleEmptyParagraphNearStructuralBlockDelete,
  shouldPreserveParagraphAfterCodeBlockOnBackspace,
} from './atomicBlockDeleteHandlers';
import {
  handleDeleteAtHeadingEndBeforeBlankLine,
  handleDeleteAtLeadingHardBreakAfterHeading,
} from './atomicBlockHeadingDeleteHandlers';
import {
  ATOMIC_BLOCK_KEYBOARD_SELECTION_CLASS,
  EMPTY_TRANSIENT_GAP_STATE,
  atomicBlockKeyboardNavigationPluginKey,
  createClearTransientGapTransaction,
  getTrackedEmptyGap,
  isEmptyParagraphNode,
  isSelectionInsideBlock,
  syncAtomicBlockKeyboardSelectionClass,
  type TransientGapAction,
  type TransientGapState,
} from './atomicBlockKeyboardShared';
import { createAtomicSelectionRepairTransaction } from './atomicBlockSelectionRepair';
import { handleAtomicBlockKeyboardNavigation } from './atomicBlockArrowNavigation';

export {
  ATOMIC_BLOCK_KEYBOARD_SELECTION_CLASS,
  atomicBlockKeyboardNavigationPluginKey,
  handleAtomicBlockKeyboardNavigation,
};

export const atomicBlockKeyboardNavigationPlugin = $prose(() => {
  return new Plugin<TransientGapState>({
    key: atomicBlockKeyboardNavigationPluginKey,
    state: {
      init() {
        return EMPTY_TRANSIENT_GAP_STATE;
      },
      apply(tr, pluginState) {
        const action = tr.getMeta(atomicBlockKeyboardNavigationPluginKey) as TransientGapAction | undefined;
        if (action?.type === 'clear') {
          return EMPTY_TRANSIENT_GAP_STATE;
        }
        if (action?.type === 'track') {
          return { pos: action.pos };
        }
        if (pluginState.pos === null) {
          return pluginState;
        }

        if (!tr.docChanged) {
          return pluginState;
        }

        const mappedPos = tr.mapping.map(pluginState.pos, 1);
        const mappedNode = tr.doc.nodeAt(mappedPos);
        if (!isEmptyParagraphNode(mappedNode)) {
          return EMPTY_TRANSIENT_GAP_STATE;
        }

        return { pos: mappedPos };
      },
    },
    appendTransaction(transactions, oldState, newState) {
      const repairedAtomicSelection = createAtomicSelectionRepairTransaction(transactions, oldState, newState);
      if (repairedAtomicSelection) {
        return repairedAtomicSelection;
      }

      const gap = getTrackedEmptyGap(newState);
      if (!gap || isSelectionInsideBlock(newState.selection, gap)) {
        return null;
      }

      return createClearTransientGapTransaction(newState);
    },
    props: {
      handleKeyDown(view, event) {
        if (handleMarkdownBlankLineDeletion(view, event)) {
          return true;
        }

        if (shouldPreserveParagraphAfterCodeBlockOnBackspace(view, event)) {
          event.preventDefault();
          return true;
        }

        if (handleDocumentBoundaryAtomicBlockDelete(view, event)) {
          return true;
        }

        if (handleDeleteAtHeadingEndBeforeBlankLine(view, event)) {
          return true;
        }

        if (handleDeleteAtLeadingHardBreakAfterHeading(view, event)) {
          return true;
        }

        if (handleEmptyParagraphBetweenPlainParagraphsDelete(view, event)) {
          return true;
        }

        if (handleEmptyParagraphNearStructuralBlockDelete(view, event)) {
          return true;
        }

        if (handleBackspaceAtParagraphStartAfterStructuralGap(view, event)) {
          return true;
        }

        if (handleEmptyCodeBlockDelete(view, event)) {
          return true;
        }

        return handleAtomicBlockKeyboardNavigation(view, event);
      },
    },
    view(view) {
      const doc = view.dom.ownerDocument;
      let cleanupTimer: number | null = null;
      syncAtomicBlockKeyboardSelectionClass(view);

      const cleanupGapIfClickLeavesIt = () => {
        cleanupTimer = null;
        const gap = getTrackedEmptyGap(view.state);
        if (!gap || isSelectionInsideBlock(view.state.selection, gap)) {
          return;
        }

        const tr = createClearTransientGapTransaction(view.state);
        if (tr) {
          view.dispatch(tr);
        }
      };

      const handleDocumentMouseDown = () => {
        if (cleanupTimer !== null && typeof window !== 'undefined') {
          window.clearTimeout(cleanupTimer);
        }

        if (typeof window === 'undefined') {
          cleanupGapIfClickLeavesIt();
          return;
        }

        cleanupTimer = window.setTimeout(cleanupGapIfClickLeavesIt, 0);
      };

      const handleEditorKeyDownCapture = (event: KeyboardEvent) => {
        if (event.isComposing || view.composing) return;
        if (handleEditableMarkdownBlankLineAfterHeadingKeyboardDelete(view, event)) {
          event.stopPropagation();
          if (typeof event.stopImmediatePropagation === 'function') {
            event.stopImmediatePropagation();
          }
        }
      };

      doc.addEventListener('mousedown', handleDocumentMouseDown, true);
      view.dom.addEventListener('keydown', handleEditorKeyDownCapture, true);

      return {
        update(updatedView) {
          syncAtomicBlockKeyboardSelectionClass(updatedView);
        },
        destroy() {
          doc.removeEventListener('mousedown', handleDocumentMouseDown, true);
          view.dom.removeEventListener('keydown', handleEditorKeyDownCapture, true);
          if (cleanupTimer !== null && typeof window !== 'undefined') {
            window.clearTimeout(cleanupTimer);
          }
          view.dom.classList.remove(ATOMIC_BLOCK_KEYBOARD_SELECTION_CLASS);
        },
      };
    },
  });
});
