import {
  getNativeSelectionMetrics,
  isTextSelectionOverlayEligible,
  POINTER_SELECTION_ACTIVE_ATTRIBUTE,
} from './textSelectionOverlayState';
import { getCaretTargetFromPoint, syncNativeSelectionToCaretTarget } from './textSelectionOverlayCaret';
import {
  cancelPointerClickCollapseReassertion,
  clearTextSelectionFromBlankPointerDown,
  collapsePointerNativeSelectionAt,
  getPointerNativeSelectionEnabled,
  schedulePointerClickCollapseReassertion,
} from './textSelectionOverlayPointerClick';
import type { TextSelectionOverlayViewContext } from './textSelectionOverlayViewTypes';
import { scheduleClearNativeSelection } from './textSelectionOverlayViewSync';

export function handleTextSelectionOverlayMouseDown(
  context: TextSelectionOverlayViewContext,
  event: MouseEvent
): void {
  const { session, view } = context;
  if (event.button !== 0) return;
  if (
    event.target instanceof Element &&
    event.target.closest('.wiki-link-expanded, [data-wiki-link-source="true"]')
  ) return;
  view.dom.setAttribute(POINTER_SELECTION_ACTIVE_ATTRIBUTE, 'true');
  session.preserveNativeSelectionForKeyboard = false;
  session.isPointerSelectionActive = true;
  session.pointerMovedSinceDown = false;
  session.pointerDownPoint = { x: event.clientX, y: event.clientY };
  session.lastPointerSelectionY = event.clientY;
  session.pointerClickCollapseTarget = null;
  session.pendingPointerClickCollapseTarget = null;
  const shouldMaybeCollapseTextSelectionClick =
    isTextSelectionOverlayEligible(view.state) &&
    (event.clientX !== 0 || event.clientY !== 0) &&
    !event.shiftKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.altKey;
  if (shouldMaybeCollapseTextSelectionClick) {
    const clickedTarget = getCaretTargetFromPoint(view, event);
    if (clickedTarget !== null) {
      session.pointerClickCollapseTarget = clickedTarget;
      session.pendingPointerClickCollapseTarget = clickedTarget;
      collapsePointerNativeSelectionAt(context, clickedTarget);
      return;
    }

    if (event.target === view.dom) {
      event.preventDefault();
      event.stopImmediatePropagation();
      clearTextSelectionFromBlankPointerDown(context);
      return;
    }

    session.setPointerNativeSelection(true);
    session.syncActiveClass();
    return;
  }
  if (!session.pointerClickCollapseTarget) {
    session.setPointerNativeSelection(true);
  }
  session.syncActiveClass();
}

export function handleTextSelectionOverlayMouseMove(
  context: TextSelectionOverlayViewContext,
  event: MouseEvent
): void {
  const { session } = context;
  if (!session.isPointerSelectionActive || !session.pointerDownPoint) return;
  session.lastPointerSelectionY = event.clientY;
  if (session.pointerMovedSinceDown) return;
  const deltaX = event.clientX - session.pointerDownPoint.x;
  const deltaY = event.clientY - session.pointerDownPoint.y;
  session.pointerMovedSinceDown = Math.hypot(deltaX, deltaY) > 4;
  if (session.pointerMovedSinceDown) {
    cancelPointerClickCollapseReassertion(context);
    session.pointerClickCollapseTarget = null;
    session.pendingPointerClickCollapseTarget = null;
    session.pointerSelectionAutoScroll.start();
  }
}

export function handleTextSelectionOverlayMouseUp(
  context: TextSelectionOverlayViewContext,
  event: MouseEvent
): void {
  const { session, view } = context;
  view.dom.removeAttribute(POINTER_SELECTION_ACTIVE_ATTRIBUTE);
  if (!session.isPointerSelectionActive) return;
  session.isPointerSelectionActive = false;
  session.lastPointerSelectionY = null;
  session.pointerSelectionAutoScroll.stop();
  const clickCollapseTarget = session.pointerClickCollapseTarget;
  const shouldCollapsePointerClick = clickCollapseTarget !== null && !session.pointerMovedSinceDown;
  session.pointerClickCollapseTarget = null;
  session.pointerDownPoint = null;
  session.pointerMovedSinceDown = false;
  if (session.pointerNativeReleaseFrame !== null) {
    cancelAnimationFrame(session.pointerNativeReleaseFrame);
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
  session.pointerNativeReleaseFrame = requestAnimationFrame(() => {
    session.pointerNativeReleaseFrame = null;
    if (!getPointerNativeSelectionEnabled(context)) return;
    if (isTextSelectionOverlayEligible(view.state)) return;

    const nativeSelection = getNativeSelectionMetrics();
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
  event: MouseEvent
): void {
  const { session, view } = context;
  if (session.pendingPointerClickCollapseTarget === null) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  const target = session.pendingPointerClickCollapseTarget;
  session.pendingPointerClickCollapseTarget = null;
  cancelPointerClickCollapseReassertion(context);
  if (session.pointerNativeReleaseFrame !== null) {
    cancelAnimationFrame(session.pointerNativeReleaseFrame);
    session.pointerNativeReleaseFrame = null;
  }
  syncNativeSelectionToCaretTarget(view, target);
  collapsePointerNativeSelectionAt(context, target);
}

export function handleTextSelectionOverlayWindowBlur(context: TextSelectionOverlayViewContext): void {
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
