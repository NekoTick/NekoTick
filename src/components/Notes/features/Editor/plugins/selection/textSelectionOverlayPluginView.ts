import type { EditorView } from '@milkdown/kit/prose/view';
import { createVerticalEdgeAutoScroll } from '../cursor/edgeAutoScroll';
import {
  KEYBOARD_SELECTION_PENDING_CLASS,
  KEY_EVENT_LISTENER_OPTIONS,
  POINTER_NATIVE_SELECTION_CLASS,
  POINTER_SELECTION_ACTIVE_ATTRIBUTE,
  TEXT_SELECTION_INLINE_PAINT_CLASS,
  TEXT_SELECTION_OVERLAY_ACTIVE_CLASS,
} from './textSelectionOverlayState';
import { handleTextSelectionOverlayKeyDown } from './textSelectionOverlayKeyboard';
import {
  handleTextSelectionOverlayMouseDown,
  handleTextSelectionOverlayMouseMove,
} from './textSelectionOverlayPointerHandlers';
import {
  handleTextSelectionOverlayClick,
  handleTextSelectionOverlayMouseUp,
  handleTextSelectionOverlayWindowBlur,
} from './textSelectionOverlayPointerRelease';
import { cancelPointerClickCollapseReassertion } from './textSelectionOverlayPointerClick';
import { setPointerNativeSelection, syncTextSelectionOverlayActiveClass } from './textSelectionOverlayViewSync';
import type { TextSelectionOverlayViewContext, TextSelectionOverlayViewSession } from './textSelectionOverlayViewTypes';
import { installLargeSelectionHighlight } from './largeSelectionHighlight';
import { installTextSelectionLayer } from './textSelectionLayer';

export function createTextSelectionOverlayPluginView(view: EditorView) {
  const ownerDocument = view.dom.ownerDocument;
  const ownerWindow = ownerDocument.defaultView!;
  const largeSelectionHighlight = installLargeSelectionHighlight(view);
  const selectionLayer = installTextSelectionLayer(view);
  const scrollRoot = view.dom.closest('[data-note-scroll-root="true"]') as HTMLElement | null;
  let context: TextSelectionOverlayViewContext;
  const session: TextSelectionOverlayViewSession = {
    clearNativeSelectionFrame: null,
    keyClearFrame: null,
    keyboardSelectionPendingCleanupTimeout: null,
    lastClassSignature: '',
    lastPointerSelectionY: null,
    pendingPointerClickCollapseTarget: null,
    pointerClickCollapseFrame: null,
    pointerClickCollapseTarget: null,
    pointerClickCollapseTimeout: null,
    pointerDownPoint: null,
    pointerMovedSinceDown: false,
    pointerNativeReleaseFrame: null,
    pointerSelectionAutoScroll: createVerticalEdgeAutoScroll({
      scrollRoot,
      getPointerY: () => (
        session.isPointerSelectionActive && session.pointerMovedSinceDown
          ? session.lastPointerSelectionY
          : null
      ),
    }),
    preserveNativeSelectionForKeyboard: false,
    isPointerSelectionActive: false,
    setPointerNativeSelection: (nextValue) => setPointerNativeSelection(context, nextValue),
    syncActiveClass: () => syncTextSelectionOverlayActiveClass(context),
  };
  context = { ownerWindow, session, view };

  const handleMouseDown = (event: MouseEvent) => handleTextSelectionOverlayMouseDown(context, event);
  const handleMouseMove = (event: MouseEvent) => handleTextSelectionOverlayMouseMove(context, event);
  const handleKeyDown = (event: KeyboardEvent) => {
    if (largeSelectionHighlight.handleKeyDown(event)) return;
    handleTextSelectionOverlayKeyDown(context, event);
  };
  const handleMouseUp = (event: MouseEvent) => {
    const shouldRefreshSelectionLayer = session.isPointerSelectionActive;
    handleTextSelectionOverlayMouseUp(context, event);
    if (shouldRefreshSelectionLayer) selectionLayer.refresh();
  };
  const handleClick = (event: MouseEvent) => handleTextSelectionOverlayClick(context, event);
  const handleWindowBlur = () => handleTextSelectionOverlayWindowBlur(context);

  view.dom.addEventListener('mousedown', handleMouseDown, true);
  view.dom.addEventListener('keydown', handleKeyDown, KEY_EVENT_LISTENER_OPTIONS);
  ownerDocument.addEventListener('mousemove', handleMouseMove, true);
  ownerDocument.addEventListener('mouseup', handleMouseUp, true);
  view.dom.addEventListener('click', handleClick, true);
  ownerWindow.addEventListener('blur', handleWindowBlur);
  session.syncActiveClass();
  return {
    update() {
      largeSelectionHighlight.update();
      session.syncActiveClass();
      selectionLayer.update(session.isPointerSelectionActive);
    },
    destroy() {
      largeSelectionHighlight.destroy();
      selectionLayer.destroy();
      if (session.keyClearFrame !== null) {
        ownerWindow.cancelAnimationFrame(session.keyClearFrame);
      }
      if (session.keyboardSelectionPendingCleanupTimeout !== null) {
        ownerWindow.clearTimeout(session.keyboardSelectionPendingCleanupTimeout);
        session.keyboardSelectionPendingCleanupTimeout = null;
      }
      view.dom.classList.remove(KEYBOARD_SELECTION_PENDING_CLASS);
      if (session.pointerNativeReleaseFrame !== null) {
        ownerWindow.cancelAnimationFrame(session.pointerNativeReleaseFrame);
      }
      cancelPointerClickCollapseReassertion(context);
      if (session.clearNativeSelectionFrame !== null) {
        ownerWindow.cancelAnimationFrame(session.clearNativeSelectionFrame);
      }
      view.dom.removeEventListener('mousedown', handleMouseDown, true);
      view.dom.removeEventListener('keydown', handleKeyDown, KEY_EVENT_LISTENER_OPTIONS);
      ownerDocument.removeEventListener('mousemove', handleMouseMove, true);
      ownerDocument.removeEventListener('mouseup', handleMouseUp, true);
      view.dom.removeEventListener('click', handleClick, true);
      ownerWindow.removeEventListener('blur', handleWindowBlur);
      session.pointerSelectionAutoScroll.stop();
      view.dom.classList.remove(TEXT_SELECTION_OVERLAY_ACTIVE_CLASS);
      view.dom.classList.remove(POINTER_NATIVE_SELECTION_CLASS);
      view.dom.classList.remove(KEYBOARD_SELECTION_PENDING_CLASS);
      view.dom.classList.remove(TEXT_SELECTION_INLINE_PAINT_CLASS);
      view.dom.removeAttribute(POINTER_SELECTION_ACTIVE_ATTRIBUTE);
    },
  };
}
