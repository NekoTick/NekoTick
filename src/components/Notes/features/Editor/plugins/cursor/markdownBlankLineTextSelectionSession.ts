import { TextSelection } from '@milkdown/kit/prose/state';
import type { EditorView } from '@milkdown/kit/prose/view';
import { floatingToolbarKey } from '../floating-toolbar/floatingToolbarKey';
import { TOOLBAR_ACTIONS } from '../floating-toolbar/types';
import { POINTER_SELECTION_ACTIVE_ATTRIBUTE } from '../selection/textSelectionOverlayState';
import {
  isInlineTextSelectionEndpoint,
  resolveEditorTextPositionAtPointer,
} from '../shared/pointerTextPosition';
import { createVerticalEdgeAutoScroll } from './edgeAutoScroll';
import { DRAG_THRESHOLD, SCROLL_ROOT_SELECTOR } from './blankAreaInteractionUtils';
import { isPointInTrailingTextSelectionGutter } from './blankAreaTextLineHit';
import { blankAreaDragBoxPluginKey, CLEAR_BLOCKS_ACTION } from './blockSelectionPluginState';
import {
  EDITABLE_MARKDOWN_BLANK_LINE_CLASS,
  EDITABLE_MARKDOWN_BLANK_LINE_PLACEHOLDER,
  isEditableMarkdownBlankLineNode,
} from './markdownBlankLineShared';

const activeBlankLineSelectionSessions = new WeakMap<EditorView, () => void>();

function dispatchBlankLineTextSelection(
  view: EditorView,
  anchor: number,
  head: number,
): boolean {
  if (
    !isInlineTextSelectionEndpoint(view, anchor)
    || !isInlineTextSelectionEndpoint(view, head)
  ) return false;

  const current = view.state.selection;
  if (
    current instanceof TextSelection
    && current.anchor === anchor
    && current.head === head
  ) return true;

  try {
    view.dispatch(
      view.state.tr
        .setSelection(TextSelection.create(view.state.doc, anchor, head))
        .setMeta(blankAreaDragBoxPluginKey, CLEAR_BLOCKS_ACTION)
        .setMeta(floatingToolbarKey, { type: TOOLBAR_ACTIONS.HIDE })
        .setMeta('addToHistory', false),
    );
    return true;
  } catch {
    return false;
  }
}

export function stopMarkdownBlankLineTextSelectionSession(view: EditorView): void {
  activeBlankLineSelectionSessions.get(view)?.();
}

export function isPointInMarkdownBlankLineTrailingTextSelectionGutter(
  blankLine: HTMLElement,
  clientX: number,
  clientY: number,
): boolean {
  const rect = blankLine.getBoundingClientRect();
  return isPointInTrailingTextSelectionGutter({
    bottom: rect.bottom,
    height: rect.height,
    left: rect.left,
    right: rect.left,
    top: rect.top,
    width: 0,
  }, clientX, clientY);
}

export function tryStartEditableMarkdownBlankLineTextSelectionSession(
  view: EditorView,
  event: MouseEvent,
): boolean {
  const target = event.target instanceof Element
    ? event.target.closest(`p.${EDITABLE_MARKDOWN_BLANK_LINE_CLASS}`)
    : null;
  if (!(target instanceof HTMLElement) || !view.dom.contains(target)) return false;
  if (!isPointInMarkdownBlankLineTrailingTextSelectionGutter(target, event.clientX, event.clientY)) {
    return false;
  }

  let nodePos: number;
  try {
    const $pos = view.state.doc.resolve(view.posAtDOM(target, 0, 1));
    if ($pos.depth !== 1 || !isEditableMarkdownBlankLineNode($pos.parent)) return false;
    nodePos = $pos.before();
  } catch {
    return false;
  }

  const blankLineFrom = nodePos + 1;
  const blankLineTo = blankLineFrom + EDITABLE_MARKDOWN_BLANK_LINE_PLACEHOLDER.length;
  event.preventDefault();
  dispatchBlankLineTextSelection(view, blankLineTo, blankLineTo);
  view.focus();
  startMarkdownBlankLineTextSelectionSession(
    view,
    event,
    blankLineFrom,
    blankLineTo,
  );
  return true;
}

export function startMarkdownBlankLineTextSelectionSession(
  view: EditorView,
  event: MouseEvent,
  blankLineFrom: number,
  blankLineTo: number,
): void {
  stopMarkdownBlankLineTextSelectionSession(view);
  const ownerDocument = view.dom.ownerDocument;
  const ownerWindow = ownerDocument.defaultView;
  const sessionDoc = view.state.doc;
  const startX = event.clientX;
  const startY = event.clientY;
  let lastPointer: { x: number; y: number } | null = null;
  let moved = false;
  let stopped = false;

  const extendSelection = (clientX: number, clientY: number) => {
    if (view.state.doc !== sessionDoc) return;
    const head = resolveEditorTextPositionAtPointer(view, clientX, clientY);
    if (head === null) return;
    const anchor = head < blankLineFrom ? blankLineTo : blankLineFrom;
    dispatchBlankLineTextSelection(view, anchor, head);
  };
  const autoScroll = createVerticalEdgeAutoScroll({
    scrollRoot: view.dom.closest<HTMLElement>(SCROLL_ROOT_SELECTOR),
    getPointerY: () => moved ? lastPointer?.y ?? null : null,
    onScroll: () => {
      if (lastPointer) extendSelection(lastPointer.x, lastPointer.y);
    },
  });
  const stop = () => {
    if (stopped) return;
    stopped = true;
    ownerDocument.removeEventListener('mousemove', handleMouseMove, true);
    ownerDocument.removeEventListener('mouseup', handleMouseUp, true);
    ownerWindow?.removeEventListener('blur', handleWindowBlur);
    autoScroll.stop();
    view.dom.removeAttribute(POINTER_SELECTION_ACTIVE_ATTRIBUTE);
    if (activeBlankLineSelectionSessions.get(view) === stop) {
      activeBlankLineSelectionSessions.delete(view);
    }
  };
  const handleMouseMove = (moveEvent: MouseEvent) => {
    if (view.state.doc !== sessionDoc) {
      stop();
      return;
    }
    if ((moveEvent.buttons & 1) === 0) {
      autoScroll.stop();
      return;
    }
    const hasDragged = Math.hypot(
      moveEvent.clientX - startX,
      moveEvent.clientY - startY,
    ) > DRAG_THRESHOLD;
    if (!moved && !hasDragged) return;

    if (!moved) {
      moved = true;
    }
    autoScroll.start();
    lastPointer = { x: moveEvent.clientX, y: moveEvent.clientY };
    moveEvent.preventDefault();
    extendSelection(moveEvent.clientX, moveEvent.clientY);
  };
  const handleMouseUp = (upEvent: MouseEvent) => {
    if (moved && view.state.doc === sessionDoc) {
      upEvent.preventDefault();
      extendSelection(upEvent.clientX, upEvent.clientY);
    }
    stop();
  };
  const handleWindowBlur = () => stop();

  view.dom.setAttribute(POINTER_SELECTION_ACTIVE_ATTRIBUTE, 'true');
  activeBlankLineSelectionSessions.set(view, stop);
  ownerDocument.addEventListener('mousemove', handleMouseMove, true);
  ownerDocument.addEventListener('mouseup', handleMouseUp, true);
  ownerWindow?.addEventListener('blur', handleWindowBlur);
}
