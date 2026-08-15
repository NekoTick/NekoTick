import { TextSelection } from '@milkdown/kit/prose/state';
import type { EditorView } from '@milkdown/kit/prose/view';
import { floatingToolbarKey } from '../floating-toolbar/floatingToolbarKey';
import { TOOLBAR_ACTIONS } from '../floating-toolbar/types';
import {
  POINTER_NATIVE_SELECTION_META,
  clearNativeSelectionRange,
  textSelectionOverlayPluginKey,
} from './textSelectionOverlayState';
import { syncNativeSelectionToCaretTarget } from './textSelectionOverlayCaret';
import type { PointerCaretTarget, TextSelectionOverlayViewContext } from './textSelectionOverlayViewTypes';

export function collapsePointerNativeSelectionAt(
  { session, view }: TextSelectionOverlayViewContext,
  target: PointerCaretTarget
): void {
  if (target.doc && target.doc !== view.state.doc) {
    return;
  }
  const nextPos = Math.max(0, Math.min(view.state.doc.content.size, target.pos));
  if (!view.state.doc.resolve(nextPos).parent.inlineContent) {
    return;
  }
  const tr = view.state.tr
    .setSelection(TextSelection.create(view.state.doc, nextPos))
    .setMeta(floatingToolbarKey, {
      type: TOOLBAR_ACTIONS.HIDE,
    })
    .setMeta(POINTER_NATIVE_SELECTION_META, false)
    .setMeta('addToHistory', false);
  view.dispatch(tr);
  view.dom.focus({ preventScroll: true });
  syncNativeSelectionToCaretTarget(view, { ...target, pos: nextPos });
  session.syncActiveClass();
}

export function cancelPointerClickCollapseReassertion(
  { ownerWindow, session }: TextSelectionOverlayViewContext
): void {
  if (session.pointerClickCollapseFrame !== null) {
    ownerWindow.cancelAnimationFrame(session.pointerClickCollapseFrame);
    session.pointerClickCollapseFrame = null;
  }
  if (session.pointerClickCollapseTimeout !== null) {
    ownerWindow.clearTimeout(session.pointerClickCollapseTimeout);
    session.pointerClickCollapseTimeout = null;
  }
}

function shouldReassertPointerClickCollapse(
  { session }: TextSelectionOverlayViewContext,
  target: PointerCaretTarget
) {
  return session.pendingPointerClickCollapseTarget === target && !session.pointerMovedSinceDown;
}

function reassertPointerClickCollapse(
  context: TextSelectionOverlayViewContext,
  target: PointerCaretTarget,
  expectedDoc: EditorView['state']['doc']
) {
  if (!shouldReassertPointerClickCollapse(context, target)) return;
  if (context.view.state.doc !== expectedDoc) return;
  collapsePointerNativeSelectionAt(context, target);
}

export function schedulePointerClickCollapseReassertion(
  context: TextSelectionOverlayViewContext,
  target: PointerCaretTarget
): void {
  const { ownerWindow, session, view } = context;
  const expectedDoc = view.state.doc;
  cancelPointerClickCollapseReassertion(context);

  ownerWindow.queueMicrotask(() => {
    reassertPointerClickCollapse(context, target, expectedDoc);
  });
  session.pointerClickCollapseFrame = ownerWindow.requestAnimationFrame(() => {
    session.pointerClickCollapseFrame = null;
    reassertPointerClickCollapse(context, target, expectedDoc);
  });
  session.pointerClickCollapseTimeout = ownerWindow.setTimeout(() => {
    session.pointerClickCollapseTimeout = null;
    reassertPointerClickCollapse(context, target, expectedDoc);
  }, 0);
}

export function clearTextSelectionFromBlankPointerDown(context: TextSelectionOverlayViewContext): void {
  const { ownerWindow, session, view } = context;
  session.pendingPointerClickCollapseTarget = null;
  cancelPointerClickCollapseReassertion(context);
  if (session.pointerNativeReleaseFrame !== null) {
    ownerWindow.cancelAnimationFrame(session.pointerNativeReleaseFrame);
    session.pointerNativeReleaseFrame = null;
  }

  const nextPos = Math.max(0, Math.min(view.state.selection.from, view.state.doc.content.size));
  let tr = view.state.tr
    .setSelection(TextSelection.create(view.state.doc, nextPos))
    .setMeta(POINTER_NATIVE_SELECTION_META, false)
    .setMeta('addToHistory', false);
  const toolbarState = floatingToolbarKey.getState(view.state);
  if (
    toolbarState?.isVisible &&
    !(toolbarState.subMenu === 'aiReview' && toolbarState.aiReview)
  ) {
    tr = tr.setMeta(floatingToolbarKey, {
      type: TOOLBAR_ACTIONS.HIDE,
    });
  }
  view.dispatch(tr);
  clearNativeSelectionRange(view);
  session.syncActiveClass();
}

export function getPointerNativeSelectionEnabled({ view }: TextSelectionOverlayViewContext): boolean {
  return Boolean(
    textSelectionOverlayPluginKey.getState(view.state)?.usePointerNativeSelection
  );
}
