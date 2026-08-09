import { TextSelection } from '@milkdown/kit/prose/state';
import {
  getNativeSelectionMetrics,
  isTextSelectionOverlayEligible,
  POINTER_SELECTION_ACTIVE_ATTRIBUTE,
} from './textSelectionOverlayState';
import {
  getCaretTargetFromPoint,
  getTextNodeCaretTargetFromPoint,
  syncNativeSelectionToCaretTarget,
} from './textSelectionOverlayCaret';
import { didPointerDownStartWithBlockSelection } from '../cursor/blockSelectionInteractionState';
import { hasSelectedBlocks } from '../cursor/blockSelectionPluginState';
import { isInlineTextSelectionEndpoint } from '../shared/pointerTextPosition';
import {
  cancelPointerClickCollapseReassertion,
  clearTextSelectionFromBlankPointerDown,
  collapsePointerNativeSelectionAt,
  getPointerNativeSelectionEnabled,
  schedulePointerClickCollapseReassertion,
} from './textSelectionOverlayPointerClick';
import type { TextSelectionOverlayViewContext } from './textSelectionOverlayViewTypes';
import { scheduleClearNativeSelection } from './textSelectionOverlayViewSync';

const POINTER_TEXT_SELECTION_MOVE_THRESHOLD_PX = 4;

function dispatchPointerTextSelection(
  context: TextSelectionOverlayViewContext,
  anchor: number,
  head: number,
): boolean {
  const { session, view } = context;
  if (session.pointerTextSelectionDoc !== view.state.doc) return false;
  if (
    !isInlineTextSelectionEndpoint(view, anchor) ||
    !isInlineTextSelectionEndpoint(view, head)
  ) return false;
  if (
    view.state.selection instanceof TextSelection &&
    view.state.selection.anchor === anchor &&
    view.state.selection.head === head
  ) return true;

  try {
    view.dispatch(
      view.state.tr
        .setSelection(TextSelection.create(view.state.doc, anchor, head))
        .setMeta('addToHistory', false)
        .scrollIntoView(),
    );
    view.dom.focus({ preventScroll: true });
    view.focus();
    return true;
  } catch {
    return false;
  }
}

function resolvePointerTextSelectionHead(
  view: TextSelectionOverlayViewContext['view'],
  event: { clientX: number; clientY: number },
): number | null {
  const target = getCaretTargetFromPoint(view, event);
  if (target === null || !isInlineTextSelectionEndpoint(view, target.pos)) return null;
  return target.pos;
}

function canStartPointerTextSelectionFallback(context: TextSelectionOverlayViewContext): boolean {
  const { view } = context;
  if (!view.state.selection.empty) return false;
  const nativeSelection = getNativeSelectionMetrics();
  return nativeSelection === null || nativeSelection.isCollapsed;
}

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
  session.lastPointerSelectionX = event.clientX;
  session.lastPointerSelectionY = event.clientY;
  session.pointerTextSelectionActive = false;
  session.pointerTextSelectionAnchor = null;
  session.pointerTextSelectionDoc = null;
  session.pointerClickCollapseTarget = null;
  session.pendingPointerClickCollapseTarget = null;
  const hasBlockSelection = hasSelectedBlocks(view.state)
    || didPointerDownStartWithBlockSelection(event);
  const shouldMaybeCollapseTextSelectionClick =
    (isTextSelectionOverlayEligible(view.state) || hasBlockSelection) &&
    (event.clientX !== 0 || event.clientY !== 0) &&
    !event.shiftKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.altKey;
  if (shouldMaybeCollapseTextSelectionClick) {
    const clickedTarget = getCaretTargetFromPoint(view, event);
    const clickedTextTarget = hasBlockSelection
      ? getTextNodeCaretTargetFromPoint(view, event)
      : clickedTarget;
    const pointerTarget = hasBlockSelection ? clickedTextTarget : clickedTarget;
    if (pointerTarget !== null) {
      if (hasBlockSelection) {
        session.pointerTextSelectionAnchor = pointerTarget.pos;
        session.pointerTextSelectionDoc = view.state.doc;
      }
      session.pointerClickCollapseTarget = pointerTarget;
      session.pendingPointerClickCollapseTarget = pointerTarget;
      collapsePointerNativeSelectionAt(context, pointerTarget);
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
  session.lastPointerSelectionX = event.clientX;
  session.lastPointerSelectionY = event.clientY;
  if (!session.pointerMovedSinceDown) {
    const deltaX = event.clientX - session.pointerDownPoint.x;
    const deltaY = event.clientY - session.pointerDownPoint.y;
    session.pointerMovedSinceDown = Math.hypot(deltaX, deltaY) > POINTER_TEXT_SELECTION_MOVE_THRESHOLD_PX;
    if (session.pointerMovedSinceDown) {
      cancelPointerClickCollapseReassertion(context);
      session.pointerClickCollapseTarget = null;
      session.pendingPointerClickCollapseTarget = null;
      session.pointerSelectionAutoScroll.start();
    }
  }

  const anchor = session.pointerTextSelectionAnchor;
  if (
    !session.pointerMovedSinceDown ||
    anchor === null ||
    session.pointerTextSelectionDoc !== context.view.state.doc
  ) return;
  if (!session.pointerTextSelectionActive && !canStartPointerTextSelectionFallback(context)) return;

  const head = resolvePointerTextSelectionHead(context.view, event);
  if (head === null) return;
  if (!dispatchPointerTextSelection(context, anchor, head)) return;
  session.pointerTextSelectionActive = true;
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
}

export function handleTextSelectionOverlayAutoScroll(context: TextSelectionOverlayViewContext): void {
  const { session, view } = context;
  const anchor = session.pointerTextSelectionAnchor;
  const clientX = session.lastPointerSelectionX;
  const clientY = session.lastPointerSelectionY;
  if (
    !session.pointerTextSelectionActive ||
    anchor === null ||
    clientX === null ||
    clientY === null ||
    session.pointerTextSelectionDoc !== view.state.doc
  ) return;

  const head = resolvePointerTextSelectionHead(view, { clientX, clientY });
  if (head !== null) dispatchPointerTextSelection(context, anchor, head);
}

function finishPointerTextSelection(
  context: TextSelectionOverlayViewContext,
  event: MouseEvent,
): void {
  const { session, view } = context;
  if (!session.pointerTextSelectionActive) return;

  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  const anchor = session.pointerTextSelectionAnchor;
  if (anchor === null || session.pointerTextSelectionDoc !== view.state.doc) return;
  const head = resolvePointerTextSelectionHead(view, event);
  if (head !== null) {
    dispatchPointerTextSelection(context, anchor, head);
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
  session.lastPointerSelectionX = null;
  session.lastPointerSelectionY = null;
  session.pointerSelectionAutoScroll.stop();
  const clickCollapseTarget = session.pointerClickCollapseTarget;
  const shouldCollapsePointerClick = clickCollapseTarget !== null && !session.pointerMovedSinceDown;
  finishPointerTextSelection(context, event);
  session.pointerClickCollapseTarget = null;
  session.pointerDownPoint = null;
  session.pointerMovedSinceDown = false;
  session.pointerTextSelectionActive = false;
  session.pointerTextSelectionAnchor = null;
  session.pointerTextSelectionDoc = null;
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
  session.lastPointerSelectionX = null;
  session.lastPointerSelectionY = null;
  session.pointerTextSelectionActive = false;
  session.pointerTextSelectionAnchor = null;
  session.pointerTextSelectionDoc = null;
  session.pointerSelectionAutoScroll.stop();
  session.pendingPointerClickCollapseTarget = null;
  cancelPointerClickCollapseReassertion(context);
  session.preserveNativeSelectionForKeyboard = false;
  session.syncActiveClass();
}
