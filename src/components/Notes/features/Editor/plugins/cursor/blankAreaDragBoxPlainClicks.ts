import { NodeSelection, Selection, TextSelection, type EditorState } from '@milkdown/kit/prose/state';
import type { EditorView } from '@milkdown/kit/prose/view';
import { dispatchTailBlankClickAction } from './endBlankClickPlugin';
import {
  resolveInsideBlockTrailingPlainClickAction,
  type BlankAreaPlainClickAction,
} from './blankAreaPlainClick';
import { createBlockRectResolver } from './blockRectResolver';
import {
  isExternalTextLineGutterNativeSelectionTarget,
  isIgnoredBlankAreaDragBoxTarget,
  isNativeTextSelectionHit,
  isPointInsideIgnoredBlankAreaDragBoxElement,
  isSameEditorBlankAreaInteractionTarget,
  resolvePointerEventTargetTextLineHit,
} from './blankAreaDragTargets';
import {
  DRAG_THRESHOLD,
  isSameEditorScrollRoot,
  SCROLL_ROOT_SELECTOR,
} from './blankAreaInteractionUtils';
import { dispatchBlankAreaPlainClick } from './forcedLineEdgeCaret';
import { floatingToolbarKey } from '../floating-toolbar/floatingToolbarKey';
import { TOOLBAR_ACTIONS } from '../floating-toolbar/types';
import { focusCurrentEmptyUntitledDraftTitle } from '../../utils/emptyUntitledDraftTitleFocus';
import { findBackslashHardBreakBlankClickTarget } from '../hard-break/backslashHardBreakCursor';
import { resolveTextblockLineEndPlainClick } from './listParagraphEndPlainClick';

function snapshotSelection(state: EditorState) {
  return {
    type: state.selection.constructor.name,
    from: state.selection.from,
    to: state.selection.to,
    empty: state.selection.empty,
  };
}

function isSameSelectionSnapshot(
  left: ReturnType<typeof snapshotSelection>,
  right: ReturnType<typeof snapshotSelection>,
): boolean {
  return left.type === right.type
    && left.from === right.from
    && left.to === right.to
    && left.empty === right.empty;
}

function resolveTopLevelListContainer(view: EditorView, target: EventTarget | null): HTMLElement | null {
  const targetElement = target instanceof HTMLElement
    ? target
    : target instanceof Node
      ? target.parentElement
      : null;
  if (!targetElement || !view.dom.contains(targetElement)) return null;

  for (let element: HTMLElement | null = targetElement; element && element !== view.dom; element = element.parentElement) {
    if ((element.tagName === 'OL' || element.tagName === 'UL') && element.parentElement === view.dom) {
      return element;
    }
  }

  return null;
}

export function handleTrailingBlankClickInsideLastList(view: EditorView, event: MouseEvent): boolean {
  if (!isSameEditorScrollRoot(view, event.target)) return false;
  if (event.button !== 0) return false;
  if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return false;

  const list = resolveTopLevelListContainer(view, event.target);
  if (!list || view.dom.lastElementChild !== list) return false;

  const resolver = createBlockRectResolver({
    view,
    scrollRootSelector: SCROLL_ROOT_SELECTOR,
  });
  const blockRects = resolver.getTopLevelBlockRects();
  resolver.invalidate();
  const lastBlock = blockRects[blockRects.length - 1];
  if (!lastBlock || event.clientY <= lastBlock.bottom) return false;

  const handled = dispatchTailBlankClickAction(view);
  if (!handled) return false;
  event.preventDefault();
  return true;
}

export function resolveInsideBlockTrailingPlainClick(view: EditorView, event: MouseEvent): BlankAreaPlainClickAction | null {
  if (!isSameEditorBlankAreaInteractionTarget(view, event.target)) return null;
  if (event.button !== 0) return null;
  if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return null;
  if (findBackslashHardBreakBlankClickTarget(view, event) !== null) return null;
  const startedInsideEditor = event.target instanceof Node && view.dom.contains(event.target);
  if (event.target instanceof HTMLElement) {
    const textLineHit = resolvePointerEventTargetTextLineHit(view, event);
    if (isNativeTextSelectionHit(textLineHit)) {
      return null;
    }
  }
  const textblockLineEndAction = resolveTextblockLineEndPlainClick(view, event);
  if (textblockLineEndAction) return textblockLineEndAction;

  const resolver = createBlockRectResolver({
    view,
    scrollRootSelector: SCROLL_ROOT_SELECTOR,
  });
  const blockRects = resolver.getTopLevelBlockRects();
  const action = resolveInsideBlockTrailingPlainClickAction({
    blockRects,
    clientX: event.clientX,
    clientY: event.clientY,
  });
  resolver.invalidate();
  if (action?.bias === 1 && !startedInsideEditor) return null;
  return action;
}

function clearWhitespaceNativeSelection(doc: Document): void {
  const selection = doc.getSelection();
  if (!selection || selection.isCollapsed) return;
  if (selection.toString().trim().length > 0) return;
  selection.removeAllRanges();
}

export function scheduleExternalTextLineGutterWhitespaceSelectionCleanup(view: EditorView, event: MouseEvent): void {
  if (!isExternalTextLineGutterNativeSelectionTarget(view, event)) {
    return;
  }

  const doc = view.dom.ownerDocument;
  const timeoutWindow = doc.defaultView ?? window;
  const handleMouseUp = () => {
    timeoutWindow.setTimeout(() => clearWhitespaceNativeSelection(doc), 0);
  };
  doc.addEventListener('mouseup', handleMouseUp, { capture: true, once: true });
}

export function shouldIgnoreBlankAreaDragBoxMouseDown(view: EditorView, event: MouseEvent): boolean {
  if (isIgnoredBlankAreaDragBoxTarget(event.target)) {
    return true;
  }
  if (!isPointInsideIgnoredBlankAreaDragBoxElement(view, event)) {
    return false;
  }
  event.preventDefault();
  return true;
}

export function focusEmptyUntitledDraftTitleFromBlankAreaClick(view: EditorView, event: MouseEvent): boolean {
  if (event.button !== 0) return false;
  if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return false;
  if (!isSameEditorBlankAreaInteractionTarget(view, event.target)) return false;

  return focusCurrentEmptyUntitledDraftTitle(
    view.dom.closest(SCROLL_ROOT_SELECTOR) ?? view.dom.ownerDocument
  );
}

function deferUntilPointerClickSettles(view: EditorView, callback: () => void): void {
  const win = view.dom.ownerDocument.defaultView;
  if (!win) {
    callback();
    return;
  }
  win.setTimeout(callback, 0);
}

export function startInsideBlockTrailingPlainClickSession(
  view: EditorView,
  event: MouseEvent,
  action: BlankAreaPlainClickAction,
  dragThreshold = DRAG_THRESHOLD,
): () => void {
  event.preventDefault();
  dispatchBlankAreaPlainClick(view, action, event.clientX, event.clientY);

  const startX = event.clientX;
  const startY = event.clientY;
  const pointerDownDoc = view.state.doc;
  const pointerDownSelection = snapshotSelection(view.state);
  let didDrag = false;
  let isStopped = false;
  const stop = () => {
    if (isStopped) return;
    isStopped = true;
    window.removeEventListener('mousemove', handleMouseMove, true);
    window.removeEventListener('mouseup', handleMouseUp, true);
  };

  const handleMouseMove = (moveEvent: MouseEvent) => {
    const movedPastThreshold =
      Math.abs(moveEvent.clientX - startX) >= dragThreshold ||
      Math.abs(moveEvent.clientY - startY) >= dragThreshold;
    if (movedPastThreshold) {
      didDrag = true;
      stop();
    }
  };

  const handleMouseUp = () => {
    stop();
    if (didDrag) return;
    if (!isSameSelectionSnapshot(pointerDownSelection, snapshotSelection(view.state))) return;
    deferUntilPointerClickSettles(view, () => {
      if (view.isDestroyed) return;
      if (
        view.state.doc === pointerDownDoc &&
        isSameSelectionSnapshot(pointerDownSelection, snapshotSelection(view.state))
      ) {
        return;
      }
      dispatchBlankAreaPlainClick(view, action, event.clientX, event.clientY, false);
    });
  };

  window.addEventListener('mousemove', handleMouseMove, true);
  window.addEventListener('mouseup', handleMouseUp, true);
  return stop;
}

export function clearTextSelectionForDragSession(view: EditorView): void {
  const { state } = view;
  if (!state.selection.empty && !(state.selection instanceof NodeSelection)) {
    const docSize = state.doc.content.size;
    const collapsePos = Math.max(0, Math.min(state.selection.from, docSize));
    const $collapsePos = state.doc.resolve(collapsePos);
    const tr = state.tr
      .setSelection(
        $collapsePos.parent.inlineContent
          ? TextSelection.create(state.doc, collapsePos)
          : Selection.near($collapsePos, -1)
      )
      .setMeta(floatingToolbarKey, { type: TOOLBAR_ACTIONS.HIDE })
      .setMeta('addToHistory', false);
    view.dispatch(tr);
    view.focus();
  }
  const selection = view.dom.ownerDocument.defaultView?.getSelection();
  if (selection && selection.rangeCount > 0) {
    selection.removeAllRanges();
  }
}

export function shouldStartUnclaimedBlankPlainClickSession(view: EditorView, event: MouseEvent): boolean {
  if (event.button !== 0) return false;
  if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return false;
  if (view.state.selection.empty || view.state.selection instanceof NodeSelection) return false;
  return isSameEditorBlankAreaInteractionTarget(view, event.target);
}

export function startUnclaimedBlankPlainClickSession(
  view: EditorView,
  event: MouseEvent,
  dragThreshold = DRAG_THRESHOLD,
): () => void {
  const startX = event.clientX;
  const startY = event.clientY;
  const startSelection = snapshotSelection(view.state);
  let didDrag = false;
  let isStopped = false;

  const stop = () => {
    if (isStopped) return;
    isStopped = true;
    view.dom.ownerDocument.removeEventListener('mousemove', handleMouseMove, true);
    view.dom.ownerDocument.removeEventListener('mouseup', handleMouseUp, true);
  };

  const handleMouseMove = (moveEvent: MouseEvent) => {
    const movedPastThreshold =
      Math.abs(moveEvent.clientX - startX) >= dragThreshold ||
      Math.abs(moveEvent.clientY - startY) >= dragThreshold;
    if (movedPastThreshold) {
      didDrag = true;
      stop();
    }
  };

  const handleMouseUp = () => {
    stop();
    if (didDrag) return;
    if (!isSameSelectionSnapshot(startSelection, snapshotSelection(view.state))) return;
    deferUntilPointerClickSettles(view, () => {
      if (!isSameSelectionSnapshot(startSelection, snapshotSelection(view.state))) return;
      clearTextSelectionForDragSession(view);
    });
  };

  view.dom.ownerDocument.addEventListener('mousemove', handleMouseMove, true);
  view.dom.ownerDocument.addEventListener('mouseup', handleMouseUp, true);
  return stop;
}
