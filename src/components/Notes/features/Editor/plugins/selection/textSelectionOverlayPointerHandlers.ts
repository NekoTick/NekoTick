import { TextSelection } from '@milkdown/kit/prose/state';
import {
  getNativeSelectionMetrics,
  isTextSelectionOverlayEligible,
  POINTER_SELECTION_ACTIVE_ATTRIBUTE,
  TEXT_SELECTION_OVERLAY_FORCE_CLASS,
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
  getRetainedHeadingPointerTextProjection,
  getRetainedHeadingMarkerSelectionHead,
  syncRetainedHeadingMarkerSelection,
} from '../heading/headingMarkerPointerRetention';
import {
  cancelPointerClickCollapseReassertion,
  clearTextSelectionFromBlankPointerDown,
  collapsePointerNativeSelectionAt,
  getPointerNativeSelectionEnabled,
  schedulePointerClickCollapseReassertion,
} from './textSelectionOverlayPointerClick';
import type { TextSelectionOverlayViewContext } from './textSelectionOverlayViewTypes';
import { scheduleClearNativeSelection } from './textSelectionOverlayViewSync';
import {
  beginHeadingPointerSelectionDiagnostic,
  discardHeadingPointerSelectionDiagnostic,
  finishHeadingPointerSelectionDiagnostic,
  recordHeadingPointerSelectionMove,
} from './headingSelectionPointerDiagnostics';

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
        .setMeta('addToHistory', false),
    );
    if (!view.hasFocus()) view.dom.focus({ preventScroll: true });
    return true;
  } catch {
    return false;
  }
}

function resolvePointerTextSelectionHead(
  view: TextSelectionOverlayViewContext['view'],
  event: { clientX: number; clientY: number },
): number | null {
  let target = getCaretTargetFromPoint(view, event);
  if (target === null) {
    const projectedPoint = getRetainedHeadingPointerTextProjection(view, event);
    if (projectedPoint) target = getCaretTargetFromPoint(view, projectedPoint);
  }
  if (target === null || !isInlineTextSelectionEndpoint(view, target.pos)) return null;
  return target.pos;
}

function syncPointerTextSelectionAtPoint(
  context: TextSelectionOverlayViewContext,
  event: { clientX: number; clientY: number },
): boolean {
  const { session, view } = context;
  const anchor = session.pointerTextSelectionAnchor;
  if (anchor === null || session.pointerTextSelectionDoc !== view.state.doc) return false;

  const markerHead = getRetainedHeadingMarkerSelectionHead(view, event);
  const head = markerHead ?? resolvePointerTextSelectionHead(view, event);
  if (head === null || !dispatchPointerTextSelection(context, anchor, head)) return false;

  session.pointerTextSelectionActive = true;
  const retainedMarkerIsSelected = syncRetainedHeadingMarkerSelection(view);
  if (markerHead !== null || retainedMarkerIsSelected) {
    session.setPointerNativeSelection(false);
    session.syncActiveClass();
  }
  return true;
}

function canStartPointerTextSelectionFallback(context: TextSelectionOverlayViewContext): boolean {
  const { view } = context;
  if (!view.state.selection.empty) return false;
  const nativeSelection = getNativeSelectionMetrics();
  return nativeSelection === null || nativeSelection.isCollapsed;
}

function isHeadingTextPointerTarget(view: TextSelectionOverlayViewContext['view'], target: EventTarget | null) {
  if (!(target instanceof Element)) return false;
  const heading = target.closest('h1, h2, h3, h4, h5, h6');
  if (!heading || !view.dom.contains(heading)) return false;
  if (target.closest('.heading-markdown-marker')) return true;
  return target.closest('button, input, textarea, select, a[href], [contenteditable="false"]') === null;
}

export function handleTextSelectionOverlayMouseDown(
  context: TextSelectionOverlayViewContext,
  event: MouseEvent
): void {
  const { session, view } = context;
  if (event.button !== 0) return;
  if (session.pointerNativeReleaseFrame !== null) {
    cancelAnimationFrame(session.pointerNativeReleaseFrame);
    session.pointerNativeReleaseFrame = null;
  }
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
  beginHeadingPointerSelectionDiagnostic(context, event);
  const hasBlockSelection = hasSelectedBlocks(view.state)
    || didPointerDownStartWithBlockSelection(event);
  const isPlainPointerGesture =
    (event.clientX !== 0 || event.clientY !== 0)
    && event.detail <= 1
    && !event.shiftKey
    && !event.ctrlKey
    && !event.metaKey
    && !event.altKey;
  const shouldForcePointerTextSelection = isPlainPointerGesture
    && isHeadingTextPointerTarget(view, event.target);
  const shouldMaybeCollapseTextSelectionClick =
    (isTextSelectionOverlayEligible(view.state)
      || hasBlockSelection
      || shouldForcePointerTextSelection)
    && isPlainPointerGesture;
  if (shouldMaybeCollapseTextSelectionClick) {
    const retainedMarkerPos = getRetainedHeadingMarkerSelectionHead(view, event);
    const clickedTarget = retainedMarkerPos === null
      ? getCaretTargetFromPoint(view, event)
      : { doc: view.state.doc, pos: retainedMarkerPos };
    const clickedTextTarget = hasBlockSelection
      ? getTextNodeCaretTargetFromPoint(view, event)
      : clickedTarget;
    const pointerTarget = hasBlockSelection ? clickedTextTarget : clickedTarget;
    if (pointerTarget !== null) {
      if (shouldForcePointerTextSelection) {
        event.preventDefault();
        session.pointerTextSelectionActive = true;
      }
      session.pointerTextSelectionAnchor = pointerTarget.pos;
      session.pointerTextSelectionDoc = view.state.doc;
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
      if (!session.pointerTextSelectionActive) session.setPointerNativeSelection(true);
      session.syncActiveClass();
      session.pointerSelectionAutoScroll.start();
    }
  }

  if (!session.pointerMovedSinceDown) {
    recordHeadingPointerSelectionMove(context, event, 'below-threshold');
    return;
  }
  if (!session.pointerTextSelectionActive && !canStartPointerTextSelectionFallback(context)) {
    recordHeadingPointerSelectionMove(context, event, 'fallback-blocked');
    return;
  }
  if (!syncPointerTextSelectionAtPoint(context, event)) {
    recordHeadingPointerSelectionMove(context, event, 'sync-failed');
    return;
  }
  recordHeadingPointerSelectionMove(context, event, 'selection-synced');
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
  shouldSyncFinalPoint: boolean,
): string {
  const { session } = context;
  if (!session.pointerMovedSinceDown) return 'not-drag';
  if (
    !session.pointerTextSelectionActive
    && !canStartPointerTextSelectionFallback(context)
  ) return 'fallback-blocked';

  const outcome = shouldSyncFinalPoint
    ? syncPointerTextSelectionAtPoint(context, event)
      ? 'final-point-synced'
      : 'final-point-sync-failed'
    : 'last-move-current';
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  return outcome;
}

export function handleTextSelectionOverlayMouseUp(
  context: TextSelectionOverlayViewContext,
  event: MouseEvent
): void {
  const { session, view } = context;
  if (!session.isPointerSelectionActive) return;
  const shouldSyncFinalPoint =
    session.lastPointerSelectionX !== event.clientX
    || session.lastPointerSelectionY !== event.clientY;
  const completedCustomPointerSelection = session.pointerTextSelectionActive;
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
  session.lastPointerSelectionX = null;
  session.lastPointerSelectionY = null;
  session.pointerSelectionAutoScroll.stop();
  const clickCollapseTarget = session.pointerClickCollapseTarget;
  const shouldCollapsePointerClick = clickCollapseTarget !== null && !session.pointerMovedSinceDown;
  const finishOutcome = finishPointerTextSelection(context, event, shouldSyncFinalPoint);
  const expectedPointerSelection =
    completedCustomPointerSelection
    && view.state.selection instanceof TextSelection
      ? {
          anchor: view.state.selection.anchor,
          doc: view.state.doc,
          head: view.state.selection.head,
        }
      : null;
  const diagnosticDetails = {
    finalPointWasNew: shouldSyncFinalPoint,
    outcome: finishOutcome,
  };
  finishHeadingPointerSelectionDiagnostic(context, event, diagnosticDetails);
  view.dom.removeAttribute(POINTER_SELECTION_ACTIVE_ATTRIBUTE);
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
  if (
    isTextSelectionOverlayEligible(view.state)
    && view.dom.getElementsByClassName(TEXT_SELECTION_OVERLAY_FORCE_CLASS).length > 0
  ) {
    session.setPointerNativeSelection(false);
    session.syncActiveClass();
  }
  session.pointerNativeReleaseFrame = requestAnimationFrame(() => {
    session.pointerNativeReleaseFrame = null;
    if (
      expectedPointerSelection
      && view.state.doc === expectedPointerSelection.doc
      && view.state.selection.empty
      && (
        view.state.selection.from === expectedPointerSelection.anchor
        || view.state.selection.from === expectedPointerSelection.head
      )
    ) {
      view.dispatch(
        view.state.tr
          .setSelection(TextSelection.create(
            view.state.doc,
            expectedPointerSelection.anchor,
            expectedPointerSelection.head,
          ))
          .setMeta('addToHistory', false),
      );
      session.syncActiveClass();
    }
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
  discardHeadingPointerSelectionDiagnostic(context);
  cancelPointerClickCollapseReassertion(context);
  session.preserveNativeSelectionForKeyboard = false;
  session.syncActiveClass();
}
