import { TextSelection } from '@milkdown/kit/prose/state';
import type { EditorView } from '@milkdown/kit/prose/view';
import { logDiagnostic } from '@/lib/diagnostics/diagnosticsLog';
import { clampDocPosition, isInlineTextSelectionEndpoint } from '../shared/pointerTextPosition';
import { setTextSelectionInlineDecorationsForTransaction } from '../selection/textSelectionOverlayPlugin';

const DRAG_THRESHOLD_PX = 4;
const CLICK_SUPPRESSION_MS = 500;
const DIAGNOSTIC_CHANNEL = 'notes-callout-selection';

function readSelectionSnapshot(view: EditorView): Record<string, unknown> {
  const selection = view.state.selection;
  const nativeSelection = view.dom.ownerDocument.defaultView?.getSelection() ?? null;
  return {
    activeElementInsideEditor: view.dom.contains(view.dom.ownerDocument.activeElement),
    editorHasFocus: view.hasFocus(),
    from: selection.from,
    nativeAnchorInsideEditor: Boolean(nativeSelection?.anchorNode && view.dom.contains(nativeSelection.anchorNode)),
    nativeCollapsed: nativeSelection?.isCollapsed ?? null,
    nativeRangeCount: nativeSelection?.rangeCount ?? null,
    pointerSelecting: view.dom.hasAttribute('data-editor-pointer-selecting'),
    selectionEmpty: selection.empty,
    selectionSize: selection.to - selection.from,
    to: selection.to,
  };
}

function logPostReleaseFrame(view: EditorView): void {
  const layer = view.dom.parentElement?.querySelector<HTMLElement>('.editor-text-selection-layer') ?? null;
  const inlineDecorations = view.dom.querySelectorAll('.editor-text-selection-overlay');
  const visibleSelectionRects = layer
    ? Array.from(layer.querySelectorAll<HTMLElement>('.editor-text-selection-layer-rect'))
      .filter((rect) => !rect.hidden && rect.getBoundingClientRect().width > 0).length
    : 0;
  logDiagnostic(DIAGNOSTIC_CHANNEL, 'post-release-frame', {
    ...readSelectionSnapshot(view),
    calloutInlineDecorationCount: view.dom.querySelectorAll(
      '.callout-content .editor-text-selection-overlay'
    ).length,
    inlineDecorationCount: inlineDecorations.length,
    inlinePaint: view.dom.classList.contains('editor-text-selection-inline-paint'),
    overlayActive: view.dom.classList.contains('editor-text-selection-overlay-active'),
    pointerNativeSelection: view.dom.classList.contains('editor-pointer-native-selection'),
    selectionLayerHidden: layer?.hidden ?? null,
    visibleSelectionRects,
  });
}

function resolveTextPositionAtPoint(view: EditorView, clientX: number, clientY: number): number | null {
  const pos = view.posAtCoords({ left: clientX, top: clientY })?.pos;
  if (pos === undefined) return null;

  const safePos = clampDocPosition(view, pos);
  return isInlineTextSelectionEndpoint(view, safePos) ? safePos : null;
}

function dispatchTextSelection(view: EditorView, anchor: number, head = anchor): boolean {
  if (!view.dom.isConnected) return false;

  const safeAnchor = clampDocPosition(view, anchor);
  const safeHead = clampDocPosition(view, head);
  if (
    !isInlineTextSelectionEndpoint(view, safeAnchor) ||
    !isInlineTextSelectionEndpoint(view, safeHead)
  ) {
    return false;
  }

  view.dispatch(
    setTextSelectionInlineDecorationsForTransaction(
      view.state.tr
        .setSelection(TextSelection.create(view.state.doc, safeAnchor, safeHead))
        .scrollIntoView(),
      true,
    )
  );
  view.focus();
  return true;
}

function startCalloutPointerSelection(view: EditorView, event: MouseEvent, anchor: number): void {
  const ownerDocument = view.dom.ownerDocument;
  const ownerWindow = ownerDocument.defaultView;
  const sessionDoc = view.state.doc;
  const startX = event.clientX;
  const startY = event.clientY;
  let moved = false;
  let unresolvedMoveLogged = false;

  logDiagnostic(DIAGNOSTIC_CHANNEL, 'session-start', {
    ...readSelectionSnapshot(view),
    anchor,
    startX: Math.round(startX),
    startY: Math.round(startY),
  });

  const stop = () => {
    ownerDocument.removeEventListener('mousemove', handleMouseMove, true);
    ownerDocument.removeEventListener('mouseup', handleMouseUp, true);
  };

  const stopClick = () => {
    ownerDocument.removeEventListener('click', handleClick, true);
  };

  const stopEvent = (pointerEvent: MouseEvent) => {
    pointerEvent.preventDefault();
    pointerEvent.stopPropagation();
    pointerEvent.stopImmediatePropagation();
  };

  const handleClick = (clickEvent: MouseEvent) => {
    if (view.state.doc === sessionDoc) {
      logDiagnostic(DIAGNOSTIC_CHANNEL, 'click-suppressed', {
        ...readSelectionSnapshot(view),
        moved,
      });
      stopEvent(clickEvent);
    }
    stopClick();
  };

  const handleMouseMove = (moveEvent: MouseEvent) => {
    if (view.state.doc !== sessionDoc) {
      logDiagnostic(DIAGNOSTIC_CHANNEL, 'session-cancelled', { reason: 'document-changed' });
      stop();
      stopClick();
      return;
    }

    const hasDragged = Math.hypot(
      moveEvent.clientX - startX,
      moveEvent.clientY - startY
    ) > DRAG_THRESHOLD_PX;
    if (!moved && !hasDragged) return;

    const isFirstDragMove = !moved;
    moved = true;
    stopEvent(moveEvent);
    const head = resolveTextPositionAtPoint(view, moveEvent.clientX, moveEvent.clientY);
    if (head !== null) {
      dispatchTextSelection(view, anchor, head);
      if (isFirstDragMove) {
        logDiagnostic(DIAGNOSTIC_CHANNEL, 'drag-start', {
          ...readSelectionSnapshot(view),
          anchor,
          deltaX: Math.round(moveEvent.clientX - startX),
          deltaY: Math.round(moveEvent.clientY - startY),
          head,
        });
      }
    } else if (!unresolvedMoveLogged) {
      unresolvedMoveLogged = true;
      logDiagnostic(DIAGNOSTIC_CHANNEL, 'drag-position-unresolved', {
        deltaX: Math.round(moveEvent.clientX - startX),
        deltaY: Math.round(moveEvent.clientY - startY),
      });
    }
  };

  const handleMouseUp = (upEvent: MouseEvent) => {
    stop();
    stopEvent(upEvent);
    ownerWindow?.setTimeout(stopClick, CLICK_SUPPRESSION_MS);

    if (view.state.doc !== sessionDoc) {
      logDiagnostic(DIAGNOSTIC_CHANNEL, 'session-cancelled', { reason: 'document-changed-on-release' });
      stopClick();
      return;
    }

    const head = moved
      ? resolveTextPositionAtPoint(view, upEvent.clientX, upEvent.clientY)
      : anchor;
    if (head !== null) {
      dispatchTextSelection(view, anchor, head);
    }
    logDiagnostic(DIAGNOSTIC_CHANNEL, 'pointer-up', {
      ...readSelectionSnapshot(view),
      anchor,
      head,
      moved,
    });
    ownerWindow?.requestAnimationFrame(() => logPostReleaseFrame(view));
  };

  event.preventDefault();
  dispatchTextSelection(view, anchor);
  ownerDocument.addEventListener('mousemove', handleMouseMove, true);
  ownerDocument.addEventListener('mouseup', handleMouseUp, true);
  ownerDocument.addEventListener('click', handleClick, true);
}

export function handleCalloutPointerSelection(view: EditorView, event: MouseEvent): boolean {
  const target = event.target instanceof Element
    ? event.target
    : event.target instanceof Node
      ? event.target.parentElement
      : null;
  if (!target?.closest('.callout-content')) return false;

  logDiagnostic(DIAGNOSTIC_CHANNEL, 'pointer-down', {
    ...readSelectionSnapshot(view),
    button: event.button,
    detail: event.detail,
    hasAltModifier: event.altKey,
    hasControlModifier: event.ctrlKey,
    hasMetaModifier: event.metaKey,
    hasShiftModifier: event.shiftKey,
    targetTag: target.tagName.toLowerCase(),
  });

  if (
    event.button !== 0 ||
    event.detail > 1 ||
    event.metaKey ||
    event.ctrlKey ||
    event.altKey ||
    event.shiftKey
  ) {
    logDiagnostic(DIAGNOSTIC_CHANNEL, 'pointer-down-ignored', { reason: 'unsupported-gesture' });
    return false;
  }

  const anchor = resolveTextPositionAtPoint(view, event.clientX, event.clientY);
  if (anchor === null) {
    logDiagnostic(DIAGNOSTIC_CHANNEL, 'pointer-down-ignored', { reason: 'anchor-unresolved' });
    return false;
  }

  startCalloutPointerSelection(view, event, anchor);
  return true;
}
