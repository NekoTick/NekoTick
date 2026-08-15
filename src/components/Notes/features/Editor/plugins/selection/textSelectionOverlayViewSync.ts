import { DecorationSet } from '@milkdown/kit/prose/view';
import { floatingToolbarKey } from '../floating-toolbar/floatingToolbarKey';
import { TOOLBAR_ACTIONS } from '../floating-toolbar/types';
import {
  KEYBOARD_SELECTION_PENDING_CLASS,
  POINTER_NATIVE_SELECTION_CLASS,
  POINTER_NATIVE_SELECTION_META,
  TEXT_SELECTION_OVERLAY_ACTIVE_CLASS,
  TEXT_SELECTION_INLINE_PAINT_CLASS,
  clearNativeSelectionRange,
  getNativeSelectionMetrics,
  isLargeEditorSelection,
  isTextSelectionOverlayEligible,
  textSelectionOverlayPluginKey,
} from './textSelectionOverlayState';
import type { TextSelectionOverlayViewContext } from './textSelectionOverlayViewTypes';

export function setPointerNativeSelection(
  { view }: TextSelectionOverlayViewContext,
  nextValue: boolean
): void {
  const currentValue = Boolean(
    textSelectionOverlayPluginKey.getState(view.state)?.usePointerNativeSelection
  );
  if (currentValue === nextValue) return;
  view.dispatch(
    view.state.tr
      .setMeta(POINTER_NATIVE_SELECTION_META, nextValue)
      .setMeta('addToHistory', false)
  );
}

export function getEmptyTextSelectionOverlayDecorationState() {
  return { decorationCount: 0, decorations: DecorationSet.empty };
}

export function scheduleClearNativeSelection(context: TextSelectionOverlayViewContext): void {
  const { ownerWindow, session, view } = context;
  if (session.clearNativeSelectionFrame !== null) return;

  session.clearNativeSelectionFrame = ownerWindow.requestAnimationFrame(() => {
    session.clearNativeSelectionFrame = null;
    if (session.isPointerSelectionActive) return;
    const nativeSelection = getNativeSelectionMetrics(view);
    const shouldClearNativeRangeForOverlay =
      !session.isPointerSelectionActive &&
      !session.preserveNativeSelectionForKeyboard &&
      isTextSelectionOverlayEligible(view.state) &&
      nativeSelection &&
      !nativeSelection.isCollapsed &&
      nativeSelection.rectCount > 0 &&
      !textSelectionOverlayPluginKey.getState(view.state)?.usePointerNativeSelection;

    if (shouldClearNativeRangeForOverlay) {
      clearNativeSelectionRange(view);
    }
  });
}

export function syncTextSelectionOverlayActiveClass(context: TextSelectionOverlayViewContext): void {
  const { session, view } = context;
  const pluginState = textSelectionOverlayPluginKey.getState(view.state);
  const usePointerNativeSelection = Boolean(pluginState?.usePointerNativeSelection);
  const showPointerNativeSelection = (
    usePointerNativeSelection
    && !isLargeEditorSelection(view.state)
  );
  const active = (
    isTextSelectionOverlayEligible(view.state)
    && !isLargeEditorSelection(view.state)
  );
  if (!active) {
    session.preserveNativeSelectionForKeyboard = false;
  }
  view.dom.classList.toggle(TEXT_SELECTION_OVERLAY_ACTIVE_CLASS, active);
  view.dom.classList.toggle(
    TEXT_SELECTION_INLINE_PAINT_CLASS,
    Boolean(pluginState?.renderInlineDecorations),
  );
  view.dom.classList.toggle(POINTER_NATIVE_SELECTION_CLASS, showPointerNativeSelection);
  if (active || !usePointerNativeSelection) {
    view.dom.classList.remove(KEYBOARD_SELECTION_PENDING_CLASS);
  }
  const classSignature = [
    active ? 'overlay-active' : 'overlay-inactive',
    showPointerNativeSelection ? 'native-active' : 'native-inactive',
    pluginState?.decorationCount ?? 0,
    pluginState?.renderInlineDecorations ? 'inline-paint' : 'layer-paint',
  ].join(':');
  if (classSignature !== session.lastClassSignature) {
    session.lastClassSignature = classSignature;
    if (!active || usePointerNativeSelection) return;
    if (session.isPointerSelectionActive) return;
    const nativeSelection = getNativeSelectionMetrics(view);
    if (
      nativeSelection &&
      !nativeSelection.isCollapsed &&
      nativeSelection.rectCount > 0
    ) {
      scheduleClearNativeSelection(context);
    }
  }
}

export function clearKeyboardSelectionState(context: TextSelectionOverlayViewContext): void {
  const { view } = context;
  const usePointerNativeSelection = Boolean(
    textSelectionOverlayPluginKey.getState(view.state)?.usePointerNativeSelection
  );
  const toolbarState = floatingToolbarKey.getState(view.state);
  const shouldHideToolbar = Boolean(
    toolbarState?.isVisible &&
    !(toolbarState.subMenu === 'aiReview' && toolbarState.aiReview)
  );

  if (!usePointerNativeSelection && !shouldHideToolbar) {
    syncTextSelectionOverlayActiveClass(context);
    return;
  }

  let tr = view.state.tr
    .setMeta(POINTER_NATIVE_SELECTION_META, false)
    .setMeta('addToHistory', false);
  if (shouldHideToolbar) {
    tr = tr.setMeta(floatingToolbarKey, {
      type: TOOLBAR_ACTIONS.HIDE,
    });
  }
  view.dispatch(tr);
  syncTextSelectionOverlayActiveClass(context);
}
