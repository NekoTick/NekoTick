import {
  getNativeSelectionMetrics,
  isTextSelectionOverlayEligible,
  POINTER_SELECTION_ACTIVE_ATTRIBUTE,
} from './textSelectionOverlayState';
import { syncNativeSelectionToCaretTarget } from './textSelectionOverlayCaret';
import {
  cancelPointerClickCollapseReassertion,
  collapsePointerNativeSelectionAt,
  getPointerNativeSelectionEnabled,
  schedulePointerClickCollapseReassertion,
} from './textSelectionOverlayPointerClick';
import type { TextSelectionOverlayViewContext } from './textSelectionOverlayViewTypes';
import { scheduleClearNativeSelection } from './textSelectionOverlayViewSync';

const POINTER_TEXT_SELECTION_MOVE_THRESHOLD_PX = 4;

export function handleTextSelectionOverlayMouseUp(
  context: TextSelectionOverlayViewContext,
  event: MouseEvent,
): void {
  const { ownerWindow, session, view } = context;
  if (!session.isPointerSelectionActive) return;
  if (!session.pointerMovedSinceDown && session.pointerDownPoint) {
    const deltaX = event.clientX - session.pointerDownPoint.x;
    const deltaY = event.clientY - session.pointerDownPoint.y;
    if (Math.hypot(deltaX, deltaY) > POINTER_TEXT_SELECTION_MOVE_THRESHOLD_PX) {
      session.pointerMovedSinceDown = true;
      cancelPointerClickCollapseReassertion(context);
      session.pointerClickCollapseTarget = null;
      session.pendingPointerClickCollapseTarget = null;
    }
  }
  session.isPointerSelectionActive = false;
  session.lastPointerSelectionY = null;
  session.pointerSelectionAutoScroll.stop();
  const clickCollapseTarget = session.pointerClickCollapseTarget;
  const shouldCollapsePointerClick = clickCollapseTarget !== null && !session.pointerMovedSinceDown;
  view.dom.removeAttribute(POINTER_SELECTION_ACTIVE_ATTRIBUTE);
  session.pointerClickCollapseTarget = null;
  session.pointerDownPoint = null;
  session.pointerMovedSinceDown = false;
  if (session.pointerNativeReleaseFrame !== null) {
    ownerWindow.cancelAnimationFrame(session.pointerNativeReleaseFrame);
    session.pointerNativeReleaseFrame = null;
  }

  if (shouldCollapsePointerClick) {
    event.preventDefault();
    event.stopImmediatePropagation();
    session.pendingPointerClickCollapseTarget = clickCollapseTarget;
    collapsePointerNativeSelectionAt(context, clickCollapseTarget);
    schedulePointerClickCollapseReassertion(context, clickCollapseTarget);
    return;
  }

  session.pendingPointerClickCollapseTarget = null;
  cancelPointerClickCollapseReassertion(context);
  if (isTextSelectionOverlayEligible(view.state)) {
    session.setPointerNativeSelection(false);
    session.syncActiveClass();
  }
  session.pointerNativeReleaseFrame = ownerWindow.requestAnimationFrame(() => {
    session.pointerNativeReleaseFrame = null;
    if (!getPointerNativeSelectionEnabled(context)) return;
    if (isTextSelectionOverlayEligible(view.state)) return;

    const nativeSelection = getNativeSelectionMetrics(view);
    if (view.state.selection.empty && (!nativeSelection || nativeSelection.isCollapsed)) {
      session.setPointerNativeSelection(false);
      session.syncActiveClass();
    }
  });

  if (isTextSelectionOverlayEligible(view.state)) {
    scheduleClearNativeSelection(context);
  }
}

export function handleTextSelectionOverlayClick(
  context: TextSelectionOverlayViewContext,
  event: MouseEvent,
): void {
  const { ownerWindow, session, view } = context;
  if (session.pendingPointerClickCollapseTarget === null) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  const target = session.pendingPointerClickCollapseTarget;
  session.pendingPointerClickCollapseTarget = null;
  cancelPointerClickCollapseReassertion(context);
  if (session.pointerNativeReleaseFrame !== null) {
    ownerWindow.cancelAnimationFrame(session.pointerNativeReleaseFrame);
    session.pointerNativeReleaseFrame = null;
  }
  syncNativeSelectionToCaretTarget(view, target);
  collapsePointerNativeSelectionAt(context, target);
}

export function handleTextSelectionOverlayWindowBlur(
  context: TextSelectionOverlayViewContext,
): void {
  const { session, view } = context;
  view.dom.removeAttribute(POINTER_SELECTION_ACTIVE_ATTRIBUTE);
  session.isPointerSelectionActive = false;
  session.lastPointerSelectionY = null;
  session.pointerSelectionAutoScroll.stop();
  session.pendingPointerClickCollapseTarget = null;
  cancelPointerClickCollapseReassertion(context);
  session.preserveNativeSelectionForKeyboard = false;
  session.syncActiveClass();
}
