import { $prose } from '@milkdown/kit/utils';
import { Plugin, Selection, TextSelection } from '@milkdown/kit/prose/state';
import type { EditorView } from '@milkdown/kit/prose/view';
import { TOOLBAR_ACTIONS, type FloatingToolbarState, type ToolbarMeta } from './types';
import { getLinkUrl } from './selectionHelpers';
import { setLink, toggleMark } from './commands';
import { isFloatingToolbarSuppressed } from './floatingToolbarDom';
import { createFloatingToolbarPluginView } from './floatingToolbarPluginView';
import { applyToolbarMeta, createInitialState, mapAiReviewRange } from './floatingToolbarState';
import { floatingToolbarKey } from './floatingToolbarKey';
import { openLinkTooltipFromSelection } from './linkTooltipActions';
import { getAiReviewSelectionDecorations } from './ai/reviewSelection';
import { hasUsableTextSelection } from './selectionValidity';
import { isLargeEditorTextSelection } from '../selection/textSelectionOverlayState';

export function shouldHideToolbarForArrowNavigation(selection: Selection, event: KeyboardEvent): boolean {
  if (
    selection.empty ||
    !(selection instanceof TextSelection) ||
    event.shiftKey ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    event.isComposing
  ) {
    return false;
  }

  return (
    event.key === 'ArrowLeft' ||
    event.key === 'ArrowRight' ||
    event.key === 'ArrowUp' ||
    event.key === 'ArrowDown'
  );
}

function getArrowNavigationFallbackPosition(selection: TextSelection, key: string): number {
  if (key === 'ArrowLeft' || key === 'ArrowUp') {
    return selection.from;
  }

  return selection.to;
}

function getVerticalArrowNavigationPosition(
  view: EditorView,
  selection: TextSelection,
  key: string
): number | null {
  const isUp = key === 'ArrowUp';
  const basePos = isUp ? selection.from : selection.to;

  try {
    const coords = view.coordsAtPos(basePos);
    const editorStyle = window.getComputedStyle(view.dom);
    const parsedLineHeight = Number.parseFloat(editorStyle.lineHeight);
    const lineStep = Number.isFinite(parsedLineHeight) && parsedLineHeight > 0
      ? parsedLineHeight
      : Math.max(18, coords.bottom - coords.top);
    const target = view.posAtCoords({
      left: coords.left,
      top: isUp ? coords.top - lineStep : coords.bottom + lineStep,
    });

    return target?.pos ?? null;
  } catch {
    return null;
  }
}

export function moveSelectionForArrowNavigation(view: EditorView, event: KeyboardEvent): boolean {
  const { selection } = view.state;
  if (!shouldHideToolbarForArrowNavigation(selection, event) || !(selection instanceof TextSelection)) {
    return false;
  }

  const fallbackPos = getArrowNavigationFallbackPosition(selection, event.key);
  const targetPos = event.key === 'ArrowUp' || event.key === 'ArrowDown'
    ? getVerticalArrowNavigationPosition(view, selection, event.key) ?? fallbackPos
    : fallbackPos;
  const maxPos = view.state.doc.content.size;
  const cursorPos = Math.max(0, Math.min(targetPos, maxPos));
  const $cursorPos = view.state.doc.resolve(cursorPos);
  const nextSelection = $cursorPos.parent.inlineContent
    ? TextSelection.create(view.state.doc, cursorPos)
    : Selection.findFrom(
        $cursorPos,
        event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1,
        true,
      ) ?? TextSelection.create(view.state.doc, fallbackPos);

  event.preventDefault();
  view.dispatch(
    view.state.tr
      .setSelection(nextSelection)
      .setMeta(floatingToolbarKey, {
        type: TOOLBAR_ACTIONS.HIDE,
      })
      .setMeta('addToHistory', false)
      .scrollIntoView()
  );

  return true;
}

export const floatingToolbarPlugin = $prose(() => {
  const interactionState = {
    isMouseDown: false,
    pendingShow: false,
    isPointerInsideToolbar: false,
  };

  return new Plugin<FloatingToolbarState>({
    key: floatingToolbarKey,
    state: {
      init: () => createInitialState(),
      apply(tr, prevState, _oldState, newState) {
        const mappedState = tr.docChanged
          ? mapAiReviewRange(prevState, tr.mapping, newState.doc.content.size)
          : prevState;
        const meta = tr.getMeta(floatingToolbarKey) as ToolbarMeta | undefined;
        const nextMetaState = applyToolbarMeta(mappedState, meta);
        if (nextMetaState) {
          return nextMetaState;
        }

        if (tr.selectionSet) {
          const { selection } = newState;
          const selectionIsEmpty = selection.empty;
          const isAiReviewPinned = mappedState.subMenu === 'aiReview' && Boolean(mappedState.aiReview);
          const hasReviewPanels = mappedState.aiReviews.length > 0 || Boolean(mappedState.aiReview);
          const isSelectionSubMenuOpen =
            mappedState.subMenu === 'ai' ||
            mappedState.subMenu === 'block' ||
            mappedState.subMenu === 'alignment' ||
            mappedState.subMenu === 'color';
          if (isLargeEditorTextSelection(newState) && !hasReviewPanels) {
            interactionState.pendingShow = false;
            if (!mappedState.isVisible && !mappedState.selectionRange) {
              return mappedState;
            }
            return {
              ...mappedState,
              isVisible: false,
              subMenu: null,
              copied: false,
              selectionRange: null,
            };
          }
          if (!hasUsableTextSelection(selection, newState.doc)) {
            if (mappedState.isVisible) {
              if (isAiReviewPinned) {
                return mappedState;
              }

              if (selectionIsEmpty && isSelectionSubMenuOpen) {
                return mappedState;
              }

              if (selectionIsEmpty && mappedState.selectionRange && !tr.docChanged) {
                return mappedState;
              }

              if (selectionIsEmpty && interactionState.isPointerInsideToolbar) {
                return mappedState;
              }

              return { ...mappedState, isVisible: false, subMenu: null, copied: false };
            }
          } else {
            if (isFloatingToolbarSuppressed()) {
              if (isAiReviewPinned) {
                return mappedState;
              }

              if (mappedState.isVisible) {
                return { ...mappedState, isVisible: false, subMenu: null, copied: false };
              }

              return mappedState;
            }

            if (!interactionState.isMouseDown && !mappedState.isVisible) {
              return { ...mappedState, isVisible: true, selectionRange: { from: selection.from, to: selection.to } };
            }

            if (interactionState.isMouseDown) {
              interactionState.pendingShow = true;
            }

            return { ...mappedState, selectionRange: { from: selection.from, to: selection.to } };
          }
        }
        return mappedState;
      },
    },
    view(editorView) {
      return createFloatingToolbarPluginView(editorView, floatingToolbarKey, interactionState);
    },
    props: {
      decorations(state) {
        return getAiReviewSelectionDecorations(state);
      },
      handleKeyDown(view, event) {
        if (moveSelectionForArrowNavigation(view, event)) {
          return true;
        }

        const isMod = event.ctrlKey || event.metaKey;
        if (isMod && !event.shiftKey) {
          const { selection } = view.state;
          if (selection.empty) return false;
          switch (event.key.toLowerCase()) {
            case 'b': event.preventDefault(); toggleMark(view, 'strong'); return true;
            case 'i': event.preventDefault(); toggleMark(view, 'emphasis'); return true;
            case 'u': event.preventDefault(); toggleMark(view, 'underline'); return true;
            case 'k': {
              event.preventDefault();
              const linkUrl = getLinkUrl(view);
              if (linkUrl !== null && linkUrl !== '') {
                setLink(view, null);
                return true;
              }

              openLinkTooltipFromSelection(view, { autoFocus: true });
              return true;
            }
            case 'h': event.preventDefault(); toggleMark(view, 'highlight'); return true;
          }
        }
        return false;
      },
    },
  });
});
