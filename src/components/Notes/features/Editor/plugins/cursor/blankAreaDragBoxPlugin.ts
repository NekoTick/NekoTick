import { $prose } from '@milkdown/kit/utils';
import { serializerCtx } from '@milkdown/kit/core';
import {
  Plugin,
  type EditorState,
} from '@milkdown/kit/prose/state';
import { DecorationSet, type EditorView } from '@milkdown/kit/prose/view';
import type { Serializer } from '@milkdown/kit/transformer';
import { dispatchTailBlankClickAction } from './endBlankClickPlugin';
import { type BlockRange } from './blockSelectionUtils';
import { serializeSelectedBlocksToText } from './blockSelectionCommands';
import { startBlankAreaSelectionSession } from './blankAreaSelectionSession';
import { type BlockDragStartZone } from './blockDragSession';
import {
  blankAreaDragBoxPluginKey,
  CLEAR_BLOCKS_ACTION,
  clearBlockSelection,
  dispatchBlockSelectionAction,
  getBlockSelectionPluginState,
  setBlockSelectionVisualState,
  syncBlockSelectionVisualState,
  type BlankAreaDragBoxState,
} from './blockSelectionPluginState';
import { isLargeBlockSelectionDocument } from './blockSelectionTypes';
import { resolveBlankAreaDragStartZone } from './blankAreaDragTargets';
import {
  DRAG_BOX_COLOR,
  DRAG_SESSION_CURSOR,
  DRAG_THRESHOLD,
  SCROLL_ROOT_SELECTOR,
} from './blankAreaInteractionUtils';
import {
  appendMarkdownBlankLineNodeSelectionRecoveryTransaction,
  createEditableMarkdownBlankLineDecorations,
} from './markdownBlankLineInteraction';
import {
  dispatchBlankAreaPlainClick,
} from './forcedLineEdgeCaret';
import {
  applyBlankAreaDragBoxStateTransaction,
  createBlankAreaDragBoxState,
} from './blankAreaDragBoxState';
import {
  clearTextSelectionForDragSession,
  shouldStartUnclaimedBlankPlainClickSession,
  startUnclaimedBlankPlainClickSession,
} from './blankAreaDragBoxPlainClicks';
import { createBlankAreaDragBoxPluginView } from './blankAreaDragBoxPluginView';
import { createBlankAreaDragBoxPluginProps } from './blankAreaDragBoxPluginProps';
import { resolveTextblockLineEndPlainClick } from './listParagraphEndPlainClick';
import type { BlankAreaPlainClickAction } from './blankAreaPlainClick';

export { blankAreaDragBoxPluginKey } from './blockSelectionPluginState';
export { shouldClearBlockSelectionForTransaction } from './blankAreaDragBoxState';
export { MAX_DOCUMENT_BLOCK_SELECTION_PASTE_CHARS } from './blankAreaDragBoxDocumentSelection';

export const blankAreaDragBoxPlugin = $prose((ctx) => {
  let stopSession: (() => void) | null = null;
  let stopInsideBlockTrailingPlainClickSession: (() => void) | null = null;
  let stopUnclaimedBlankPlainClickSession: (() => void) | null = null;
  const documentInspectedMouseDownEvents = new WeakSet<MouseEvent>();
  let markdownSerializer: Serializer | null = null;
  let serializerResolved = false;

  const resolveMarkdownSerializer = (): Serializer | null => {
    if (serializerResolved) return markdownSerializer;
    serializerResolved = true;
    try {
      markdownSerializer = ctx.get(serializerCtx);
    } catch {
      markdownSerializer = null;
    }
    return markdownSerializer;
  };

  const serializeSelectedBlocks = (state: EditorState, selectedBlocks: readonly BlockRange[]): string =>
    serializeSelectedBlocksToText(state, selectedBlocks, {
      compactPlainParagraphs: true,
      markdownSerializer: resolveMarkdownSerializer(),
    });

  const clearSession = () => {
    if (!stopSession) return;
    stopSession();
    stopSession = null;
  };

  const clearInsideBlockTrailingPlainClickSession = () => {
    if (!stopInsideBlockTrailingPlainClickSession) return;
    stopInsideBlockTrailingPlainClickSession();
    stopInsideBlockTrailingPlainClickSession = null;
  };

  const clearUnclaimedBlankPlainClickSession = () => {
    if (!stopUnclaimedBlankPlainClickSession) return;
    stopUnclaimedBlankPlainClickSession();
    stopUnclaimedBlankPlainClickSession = null;
  };

  const tryStartUnclaimedBlankPlainClickSession = (view: EditorView, event: MouseEvent) => {
    if (!shouldStartUnclaimedBlankPlainClickSession(view, event)) return;
    clearUnclaimedBlankPlainClickSession();
    stopUnclaimedBlankPlainClickSession = startUnclaimedBlankPlainClickSession(
      view,
      event,
    );
  };

  const tryStartSession = (view: EditorView, event: MouseEvent): BlockDragStartZone | null => {
    if (event.button !== 0) {
      return null;
    }
    if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
      return null;
    }
    const startZone = resolveBlankAreaDragStartZone(view, event);
    if (!startZone) return null;
    clearTextSelectionForDragSession(view);
    clearSession();
    const deferSelectionDecorations = isLargeBlockSelectionDocument(view.state.doc);
    const initialSelectedBlocks = getBlockSelectionPluginState(view.state).selectedBlocks;
    let deferredDragActivated = false;
    let deferredSelectionBlocks = [...initialSelectedBlocks];

    const dispatchResolvedPlainClickAction = (
      action: BlankAreaPlainClickAction | null,
      clientX: number,
      clientY: number,
    ): boolean => {
      const textblockLineEndAction = resolveTextblockLineEndPlainClick(view, event);
      const resolvedAction = textblockLineEndAction ?? action;
      if (!resolvedAction) return false;
      if (textblockLineEndAction) {
        dispatchBlankAreaPlainClick(view, resolvedAction);
      } else {
        dispatchBlankAreaPlainClick(view, resolvedAction, clientX, clientY);
      }
      return true;
    };

    const session = startBlankAreaSelectionSession({
      view,
      event,
      startZone,
      dragThreshold: DRAG_THRESHOLD,
      cursor: DRAG_SESSION_CURSOR,
      dragBoxColor: DRAG_BOX_COLOR,
      useSelectionPreview: deferSelectionDecorations,
      scrollRootSelector: SCROLL_ROOT_SELECTOR,
      initialSelectedBlocks,
      onSelectionChange(blocks) {
        if (deferSelectionDecorations) {
          deferredSelectionBlocks = blocks;
          return;
        }
        dispatchBlockSelectionAction(view, blocks.length > 0
          ? { type: 'set-blocks', blocks }
          : CLEAR_BLOCKS_ACTION);
      },
      onPendingPlainClick({ action, clientX, clientY }) {
        return dispatchResolvedPlainClickAction(action, clientX, clientY);
      },
      onPlainClick({ zone, action, clientX, clientY }) {
        if (zone === 'below-last-block') {
          dispatchTailBlankClickAction(view);
          return;
        }
        if (zone === 'external-sidebar-blank') {
          clearBlockSelection(view);
          return;
        }
        if (!dispatchResolvedPlainClickAction(action, clientX, clientY)) {
          clearBlockSelection(view);
        }
      },
      onActivateSelectionState() {
        deferredDragActivated = true;
        if (deferSelectionDecorations && initialSelectedBlocks.length > 0) {
          dispatchBlockSelectionAction(view, {
            type: 'set-blocks',
            blocks: initialSelectedBlocks,
            deferDecorations: true,
          });
        }
        setBlockSelectionVisualState(view, !deferSelectionDecorations);
      },
      onSyncSelectionState() {
        if (deferSelectionDecorations && deferredDragActivated) {
          dispatchBlockSelectionAction(view, deferredSelectionBlocks.length > 0
            ? { type: 'set-blocks', blocks: deferredSelectionBlocks }
            : CLEAR_BLOCKS_ACTION);
          syncBlockSelectionVisualState(view);
          return;
        }
        const selectionState = getBlockSelectionPluginState(view.state);
        if (selectionState.decorationsDeferred && selectionState.selectedBlocks.length > 0) {
          dispatchBlockSelectionAction(view, {
            type: 'set-blocks',
            blocks: selectionState.selectedBlocks,
          });
        }
        syncBlockSelectionVisualState(view);
      },
    });

    stopSession = session.stop;
    return startZone;
  };

  return new Plugin({
    key: blankAreaDragBoxPluginKey,
    appendTransaction(_transactions, oldState, newState) {
      return appendMarkdownBlankLineNodeSelectionRecoveryTransaction(oldState, newState);
    },
    state: {
      init(_config, state) {
        return createBlankAreaDragBoxState(
          state.doc,
          [],
          DecorationSet.empty,
          createEditableMarkdownBlankLineDecorations(state.doc),
        );
      },
      apply(tr, pluginState: BlankAreaDragBoxState) {
        return applyBlankAreaDragBoxStateTransaction(
          tr,
          pluginState,
          tr.getMeta(blankAreaDragBoxPluginKey),
        );
      },
    },
    props: createBlankAreaDragBoxPluginProps({
      clearInsideBlockTrailingPlainClickSession,
      documentInspectedMouseDownEvents,
      serializeSelectedBlocks,
      setInsideBlockTrailingPlainClickSession(stop) {
        stopInsideBlockTrailingPlainClickSession = stop;
      },
      tryStartSession,
      tryStartUnclaimedBlankPlainClickSession,
    }),
    view(view) {
      return createBlankAreaDragBoxPluginView(view, {
        clearInsideBlockTrailingPlainClickSession,
        clearSession,
        clearUnclaimedBlankPlainClickSession,
        documentInspectedMouseDownEvents,
        serializeSelectedBlocks,
        setInsideBlockTrailingPlainClickSession(stop) {
          stopInsideBlockTrailingPlainClickSession = stop;
        },
        tryStartSession,
        tryStartUnclaimedBlankPlainClickSession,
      });
    },
  });
});
