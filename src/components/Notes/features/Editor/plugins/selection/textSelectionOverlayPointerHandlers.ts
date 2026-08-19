import {
  isTextSelectionOverlayEligible,
  POINTER_SELECTION_ACTIVE_ATTRIBUTE,
  POINTER_SELECTION_STARTED_FOCUSED_ATTRIBUTE,
} from './textSelectionOverlayState';
import {
  getCaretTargetFromPoint,
  getTextNodeCaretTargetFromPoint,
} from './textSelectionOverlayCaret';
import { didPointerDownStartWithBlockSelection } from '../cursor/blockSelectionInteractionState';
import { hasSelectedBlocks } from '../cursor/blockSelectionPluginState';
import {
  cancelPointerClickCollapseReassertion,
  clearTextSelectionFromBlankPointerDown,
  collapsePointerNativeSelectionAt,
} from './textSelectionOverlayPointerClick';
import type { TextSelectionOverlayViewContext } from './textSelectionOverlayViewTypes';
import { logDiagnostic } from '@/lib/diagnostics/diagnosticsLog';

const POINTER_TEXT_SELECTION_MOVE_THRESHOLD_PX = 4;

export function handleTextSelectionOverlayMouseDown(
  context: TextSelectionOverlayViewContext,
  event: MouseEvent,
): void {
  if (event.button !== 0) return;
  if (
    event.target instanceof Element
    && event.target.closest('.callout-content')
  ) {
    logDiagnostic('notes-callout-selection', 'overlay-bypass', {
      editorHasFocus: context.view.hasFocus(),
      pointerSelectingBeforeBypass: context.view.dom.hasAttribute(POINTER_SELECTION_ACTIVE_ATTRIBUTE),
      targetTag: event.target.tagName.toLowerCase(),
    });
    return;
  }

  const { ownerWindow, session, view } = context;
  if (session.pointerNativeReleaseFrame !== null) {
    ownerWindow.cancelAnimationFrame(session.pointerNativeReleaseFrame);
    session.pointerNativeReleaseFrame = null;
  }
  if (
    event.target instanceof Element
    && event.target.closest('.wiki-link-expanded, [data-wiki-link-source="true"]')
  ) return;
  view.dom.setAttribute(POINTER_SELECTION_ACTIVE_ATTRIBUTE, 'true');
  if (view.hasFocus()) {
    view.dom.setAttribute(POINTER_SELECTION_STARTED_FOCUSED_ATTRIBUTE, 'true');
  } else {
    view.dom.removeAttribute(POINTER_SELECTION_STARTED_FOCUSED_ATTRIBUTE);
  }
  session.preserveNativeSelectionForKeyboard = false;
  session.isPointerSelectionActive = true;
  session.pointerMovedSinceDown = false;
  session.pointerDownPoint = { x: event.clientX, y: event.clientY };
  session.lastPointerSelectionY = event.clientY;
  session.pointerClickCollapseTarget = null;
  session.pendingPointerClickCollapseTarget = null;
  const hasBlockSelection = hasSelectedBlocks(view.state)
    || didPointerDownStartWithBlockSelection(event);
  const isPlainPointerGesture =
    (event.clientX !== 0 || event.clientY !== 0)
    && event.detail <= 1
    && !event.shiftKey
    && !event.ctrlKey
    && !event.metaKey
    && !event.altKey;
  const shouldMaybeCollapseTextSelectionClick =
    (isTextSelectionOverlayEligible(view.state)
      || hasBlockSelection)
    && isPlainPointerGesture;
  if (shouldMaybeCollapseTextSelectionClick) {
    const clickedTarget = getCaretTargetFromPoint(view, event);
    const clickedTextTarget = hasBlockSelection
      ? getTextNodeCaretTargetFromPoint(view, event)
      : clickedTarget;
    const pointerTarget = hasBlockSelection ? clickedTextTarget : clickedTarget;
    if (pointerTarget !== null) {
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
  event: MouseEvent,
): void {
  const { session } = context;
  if (!session.isPointerSelectionActive || !session.pointerDownPoint) return;
  session.lastPointerSelectionY = event.clientY;
  if (!session.pointerMovedSinceDown) {
    const deltaX = event.clientX - session.pointerDownPoint.x;
    const deltaY = event.clientY - session.pointerDownPoint.y;
    session.pointerMovedSinceDown = Math.hypot(deltaX, deltaY) > POINTER_TEXT_SELECTION_MOVE_THRESHOLD_PX;
    if (session.pointerMovedSinceDown) {
      cancelPointerClickCollapseReassertion(context);
      session.pointerClickCollapseTarget = null;
      session.pendingPointerClickCollapseTarget = null;
      session.setPointerNativeSelection(true);
      session.syncActiveClass();
      session.pointerSelectionAutoScroll.start();
    }
  }

  if (!session.pointerMovedSinceDown) {
    return;
  }
}
