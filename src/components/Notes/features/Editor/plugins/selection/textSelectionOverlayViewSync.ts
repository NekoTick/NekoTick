import { DecorationSet } from '@milkdown/kit/prose/view';
import { floatingToolbarKey } from '../floating-toolbar/floatingToolbarKey';
import { TOOLBAR_ACTIONS } from '../floating-toolbar/types';
import {
  KEYBOARD_SELECTION_PENDING_CLASS,
  POINTER_NATIVE_SELECTION_CLASS,
  POINTER_NATIVE_SELECTION_META,
  TEXT_SELECTION_OVERLAY_ACTIVE_CLASS,
  clearNativeSelectionRange,
  getNativeSelectionMetrics,
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

export function scheduleClearNativeSelection({ session, view }: TextSelectionOverlayViewContext): void {
  if (session.clearNativeSelectionFrame !== null) return;

  session.clearNativeSelectionFrame = requestAnimationFrame(() => {
    session.clearNativeSelectionFrame = null;
    const nativeSelection = getNativeSelectionMetrics();
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
  const active = isTextSelectionOverlayEligible(view.state);
  if (!active) {
    session.preserveNativeSelectionForKeyboard = false;
  }
  view.dom.classList.toggle(TEXT_SELECTION_OVERLAY_ACTIVE_CLASS, active);
  view.dom.classList.toggle(POINTER_NATIVE_SELECTION_CLASS, usePointerNativeSelection);
  if (active || !usePointerNativeSelection) {
    view.dom.classList.remove(KEYBOARD_SELECTION_PENDING_CLASS);
  }
  const classSignature = [
    active ? 'overlay-active' : 'overlay-inactive',
    usePointerNativeSelection ? 'native-active' : 'native-inactive',
    pluginState?.decorationCount ?? 0,
  ].join(':');
  if (classSignature !== session.lastClassSignature) {
    session.lastClassSignature = classSignature;
    if (!active || usePointerNativeSelection) return;
    const nativeSelection = getNativeSelectionMetrics();
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
