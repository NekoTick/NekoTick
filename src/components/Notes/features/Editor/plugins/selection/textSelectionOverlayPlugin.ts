import { Plugin, TextSelection } from '@milkdown/kit/prose/state';
import { DecorationSet } from '@milkdown/kit/prose/view';
import { $prose } from '@milkdown/kit/utils';
import {
  createAtomicTextSelectionDecorationState,
  createTextSelectionDecorationState,
} from './textSelectionOverlayDecorations';
import { createTextSelectionOverlayPluginView } from './textSelectionOverlayPluginView';
import {
  POINTER_NATIVE_SELECTION_META,
  TEXT_SELECTION_INLINE_DECORATIONS_META,
  isLargeEditorSelection,
  isTextSelectionOverlayEligible,
  textSelectionOverlayPluginKey,
} from './textSelectionOverlayState';
import {
  blankAreaDragBoxPluginKey,
  type BlockSelectionAction,
} from '../cursor/blockSelectionPluginState';
import { getEmptyTextSelectionOverlayDecorationState } from './textSelectionOverlayViewSync';

export {
  addTextSelectionOverlayDecorations,
  addTextSelectionOverlayDecorationsForRange,
  createTextSelectionDecorationState,
} from './textSelectionOverlayDecorations';
export {
  MAX_TEXT_SELECTION_OVERLAY_DECORATIONS,
  MAX_TEXT_SELECTION_OVERLAY_SCAN_NODES,
  LARGE_SELECTION_MIN_RANGE_SIZE,
  LARGE_SELECTION_MIN_SELECTED_NODES,
  TEXT_SELECTION_OVERLAY_CLASS,
  getNativeSelectionMetrics,
  setTextSelectionInlineDecorationsForTransaction,
  showTextSelectionOverlayForTransaction,
} from './textSelectionOverlayState';

export const textSelectionOverlayPlugin = $prose(() => {
  return new Plugin({
    key: textSelectionOverlayPluginKey,
    state: {
      init() {
        return {
          ...getEmptyTextSelectionOverlayDecorationState(),
          renderInlineDecorations: false,
          usePointerNativeSelection: false,
        };
      },
      apply(tr, previous, _oldState, newState) {
        const pointerNativeMeta = tr.getMeta(POINTER_NATIVE_SELECTION_META) as boolean | undefined;
        const inlineDecorationsMeta = tr.getMeta(
          TEXT_SELECTION_INLINE_DECORATIONS_META
        ) as boolean | undefined;
        const blockSelectionAction = tr.getMeta(blankAreaDragBoxPluginKey) as BlockSelectionAction | undefined;
        const isSettingBlockSelection =
          blockSelectionAction?.type === 'set-blocks' &&
          blockSelectionAction.blocks.length > 0;
        const overlayEligible = !isSettingBlockSelection && isTextSelectionOverlayEligible(newState);
        let usePointerNativeSelection = pointerNativeMeta ?? (
          isLargeEditorSelection(newState)
            ? true
            : newState.selection instanceof TextSelection
              ? tr.docChanged && newState.selection.empty ? false : previous.usePointerNativeSelection
              : false
        );
        if (isSettingBlockSelection) {
          usePointerNativeSelection = false;
        }
        let renderInlineDecorations = inlineDecorationsMeta ?? previous.renderInlineDecorations;
        if ((tr.docChanged || tr.selectionSet) && inlineDecorationsMeta === undefined) {
          renderInlineDecorations = false;
        }
        if (!tr.docChanged && !tr.selectionSet && pointerNativeMeta === undefined && inlineDecorationsMeta === undefined) {
          if (isSettingBlockSelection && (previous.decorationCount > 0 || previous.usePointerNativeSelection)) {
            return {
              ...getEmptyTextSelectionOverlayDecorationState(),
              renderInlineDecorations: false,
              usePointerNativeSelection,
            };
          }
          return previous;
        }
        if (!overlayEligible) renderInlineDecorations = false;
        const decorationState = usePointerNativeSelection || !overlayEligible
          ? getEmptyTextSelectionOverlayDecorationState()
          : renderInlineDecorations
            ? createTextSelectionDecorationState(newState)
            : createAtomicTextSelectionDecorationState(newState);
        return {
          ...decorationState,
          renderInlineDecorations,
          usePointerNativeSelection,
        };
      },
    },
    props: {
      decorations(state) {
        return textSelectionOverlayPluginKey.getState(state)?.decorations ?? DecorationSet.empty;
      },
    },
    view: createTextSelectionOverlayPluginView,
  });
});
