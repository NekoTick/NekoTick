import type { EditorView } from '@milkdown/kit/prose/view';
import { createVerticalEdgeAutoScroll } from '../cursor/edgeAutoScroll';
import {
  KEYBOARD_SELECTION_PENDING_CLASS,
  KEY_EVENT_LISTENER_OPTIONS,
  POINTER_NATIVE_SELECTION_CLASS,
  POINTER_SELECTION_ACTIVE_ATTRIBUTE,
  TEXT_SELECTION_OVERLAY_ACTIVE_CLASS,
} from './textSelectionOverlayState';
import { handleTextSelectionOverlayKeyDown } from './textSelectionOverlayKeyboard';
import {
  handleTextSelectionOverlayClick,
  handleTextSelectionOverlayMouseDown,
  handleTextSelectionOverlayMouseMove,
  handleTextSelectionOverlayMouseUp,
  handleTextSelectionOverlayWindowBlur,
} from './textSelectionOverlayPointerHandlers';
import { cancelPointerClickCollapseReassertion } from './textSelectionOverlayPointerClick';
import { setPointerNativeSelection, syncTextSelectionOverlayActiveClass } from './textSelectionOverlayViewSync';
import type { TextSelectionOverlayViewContext, TextSelectionOverlayViewSession } from './textSelectionOverlayViewTypes';
import { installLargeSelectionHighlight } from './largeSelectionHighlight';

export function createTextSelectionOverlayPluginView(view: EditorView) {
  const largeSelectionHighlight = installLargeSelectionHighlight(view);
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
  context = { session, view };

  const handleMouseDown = (event: MouseEvent) => handleTextSelectionOverlayMouseDown(context, event);
  const handleMouseMove = (event: MouseEvent) => handleTextSelectionOverlayMouseMove(context, event);
  const handleKeyDown = (event: KeyboardEvent) => {
    if (largeSelectionHighlight.handleKeyDown(event)) return;
    handleTextSelectionOverlayKeyDown(context, event);
  };
  const handleMouseUp = (event: MouseEvent) => handleTextSelectionOverlayMouseUp(context, event);
  const handleClick = (event: MouseEvent) => handleTextSelectionOverlayClick(context, event);
  const handleWindowBlur = () => handleTextSelectionOverlayWindowBlur(context);

  const ownerDocument = view.dom.ownerDocument;
  view.dom.addEventListener('mousedown', handleMouseDown, true);
  view.dom.addEventListener('keydown', handleKeyDown, KEY_EVENT_LISTENER_OPTIONS);
  ownerDocument.addEventListener('mousemove', handleMouseMove, true);
  ownerDocument.addEventListener('mouseup', handleMouseUp, true);
  view.dom.addEventListener('click', handleClick, true);
  window.addEventListener('blur', handleWindowBlur);
  session.syncActiveClass();
  return {
    update() {
      largeSelectionHighlight.update();
      session.syncActiveClass();
    },
    destroy() {
      largeSelectionHighlight.destroy();
      if (session.keyClearFrame !== null) {
        cancelAnimationFrame(session.keyClearFrame);
      }
      if (session.keyboardSelectionPendingCleanupTimeout !== null) {
        window.clearTimeout(session.keyboardSelectionPendingCleanupTimeout);
        session.keyboardSelectionPendingCleanupTimeout = null;
      }
      view.dom.classList.remove(KEYBOARD_SELECTION_PENDING_CLASS);
      if (session.pointerNativeReleaseFrame !== null) {
        cancelAnimationFrame(session.pointerNativeReleaseFrame);
      }
      cancelPointerClickCollapseReassertion(context);
      if (session.clearNativeSelectionFrame !== null) {
        cancelAnimationFrame(session.clearNativeSelectionFrame);
      }
      view.dom.removeEventListener('mousedown', handleMouseDown, true);
      view.dom.removeEventListener('keydown', handleKeyDown, KEY_EVENT_LISTENER_OPTIONS);
      ownerDocument.removeEventListener('mousemove', handleMouseMove, true);
      ownerDocument.removeEventListener('mouseup', handleMouseUp, true);
      view.dom.removeEventListener('click', handleClick, true);
      window.removeEventListener('blur', handleWindowBlur);
      session.pointerSelectionAutoScroll.stop();
      view.dom.classList.remove(TEXT_SELECTION_OVERLAY_ACTIVE_CLASS);
      view.dom.classList.remove(POINTER_NATIVE_SELECTION_CLASS);
      view.dom.classList.remove(KEYBOARD_SELECTION_PENDING_CLASS);
      view.dom.removeAttribute(POINTER_SELECTION_ACTIVE_ATTRIBUTE);
    },
  };
}
