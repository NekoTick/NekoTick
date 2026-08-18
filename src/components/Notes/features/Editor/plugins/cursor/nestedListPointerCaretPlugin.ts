import { $prose } from '@milkdown/kit/utils';
import { Plugin, PluginKey, TextSelection } from '@milkdown/kit/prose/state';
import type { EditorView } from '@milkdown/kit/prose/view';
import {
  clampDocPosition,
  isInlineTextSelectionEndpoint,
  resolveTextNodeDocumentPosition,
  resolveTextOffsetAtPoint,
} from '../shared/pointerTextPosition';
import { resolveTaskCheckboxTarget } from '../task-list/taskCheckboxHitArea';

export const nestedListPointerCaretPluginKey = new PluginKey('nestedListPointerCaret');

const NESTED_LIST_SELECTOR = 'li > ol, li > ul';
const IGNORED_TEXT_TARGET_SELECTOR = [
  'button',
  'input',
  'textarea',
  'select',
  'summary',
  '[role="button"]',
  '[contenteditable="false"]',
].join(', ');
const MAX_NESTED_LIST_CARET_TEXT_NODES = 512;
const MAX_NESTED_LIST_CARET_TEXT_CHARS = 100_000;
const CLICK_MOVE_THRESHOLD_PX = 4;
const CLICK_SUPPRESSION_MS = 500;
const activeNestedListPointerSessions = new WeakMap<EditorView, () => void>();

function isPrimaryPlainMouseDown(event: MouseEvent): boolean {
  return event.button === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.altKey &&
    !event.shiftKey;
}

function isTaskCheckboxPointer(view: EditorView, event: MouseEvent): boolean {
  const target = event.target instanceof HTMLElement
    ? event.target
    : event.target instanceof Node
      ? event.target.parentElement
      : null;
  return Boolean(
    target && resolveTaskCheckboxTarget(view.dom, target, event.clientX, event.clientY)
  );
}

export function resolveNestedListPointerScanRoot(
  view: EditorView,
  target: EventTarget | null,
  clientX: number,
  clientY: number,
): HTMLElement | null {
  const targetElement = target instanceof Element
    ? target
    : target instanceof Node
      ? target.parentElement
      : null;
  if (!targetElement) return null;

  const targetLine = targetElement.closest('.cm-line');
  if (targetLine?.tagName === 'P' && !targetElement.closest('li')) {
    return null;
  }
  if (targetLine?.tagName === 'P' && !targetElement.closest(NESTED_LIST_SELECTOR)) {
    try {
      const coordsPos = view.posAtCoords({ left: clientX, top: clientY })?.pos;
      const lineStart = view.posAtDOM(targetLine, 0, -1);
      const lineEnd = view.posAtDOM(targetLine, targetLine.childNodes.length, 1);
      if (coordsPos !== undefined && coordsPos >= lineStart && coordsPos <= lineEnd) return null;
    } catch {
    }
  }

  const listItem = targetElement.closest('li');
  if (listItem instanceof HTMLElement && view.dom.contains(listItem)) return listItem;
  return targetElement === view.dom ? view.dom : null;
}

function dispatchNestedListTextSelection(view: EditorView, anchor: number, head = anchor): boolean {
  if (!view.dom.isConnected) return false;

  const nextAnchor = clampDocPosition(view, anchor);
  const nextHead = clampDocPosition(view, head);
  if (
    !isInlineTextSelectionEndpoint(view, nextAnchor) ||
    !isInlineTextSelectionEndpoint(view, nextHead)
  ) {
    return false;
  }
  try {
    const selection = TextSelection.create(view.state.doc, nextAnchor, nextHead);
    const tr = view.state.tr.setSelection(selection).scrollIntoView();
    view.dispatch(tr);
    view.dom.focus({ preventScroll: true });
    view.focus();
    return true;
  } catch {
    return false;
  }
}

export function resolveNestedListTextPositionAtPoint(
  view: EditorView,
  clientX: number,
  clientY: number,
  scanRoot: HTMLElement = view.dom,
): number | null {
  if (!view.dom.contains(scanRoot)) return null;

  const doc = view.dom.ownerDocument;
  let measuredTextNodes = 0;
  let measuredTextChars = 0;
  const walker = doc.createTreeWalker(scanRoot, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const text = node.textContent ?? '';
      measuredTextChars += text.length;
      if (measuredTextChars > MAX_NESTED_LIST_CARET_TEXT_CHARS) return NodeFilter.FILTER_ACCEPT;
      if (!text.trim()) return NodeFilter.FILTER_REJECT;

      const parent = node.parentElement;
      if (!parent || parent.closest(IGNORED_TEXT_TARGET_SELECTOR)) {
        return NodeFilter.FILTER_REJECT;
      }
      if (!parent.closest(NESTED_LIST_SELECTOR)) {
        return NodeFilter.FILTER_REJECT;
      }

      return NodeFilter.FILTER_ACCEPT;
    },
  });

  let best: { distance: number; pos: number } | null = null;

  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (measuredTextChars > MAX_NESTED_LIST_CARET_TEXT_CHARS) return null;
    measuredTextNodes += 1;
    if (measuredTextNodes > MAX_NESTED_LIST_CARET_TEXT_NODES) return null;
    if (!(node instanceof Text)) continue;

    const resolved = resolveTextOffsetAtPoint(node, clientX, clientY);
    if (resolved === null) continue;

    try {
      const pos = resolveTextNodeDocumentPosition(view, node, resolved.offset) ??
        view.posAtDOM(node, resolved.offset, -1);
      if (best === null || resolved.distance < best.distance) {
        best = { distance: resolved.distance, pos };
      }
    } catch {
      continue;
    }
  }

  return best?.pos ?? null;
}

function resolveNestedListDragHeadAtPoint(
  view: EditorView,
  clientX: number,
  clientY: number,
  scanRoot: HTMLElement,
): number | null {
  const coordsPos = view.posAtCoords({ left: clientX, top: clientY })?.pos ?? null;
  const safeCoordsPos = coordsPos !== null && isInlineTextSelectionEndpoint(view, coordsPos)
    ? coordsPos
    : null;
  return (
    resolveNestedListTextPositionAtPoint(view, clientX, clientY, scanRoot) ??
    (scanRoot === view.dom ? null : resolveNestedListTextPositionAtPoint(view, clientX, clientY, view.dom)) ??
    safeCoordsPos
  );
}

export function startNestedListPointerSelection(view: EditorView, event: MouseEvent, pos: number, scanRoot: HTMLElement): void {
  activeNestedListPointerSessions.get(view)?.();
  const { ownerDocument } = view.dom;
  const ownerWindow = ownerDocument.defaultView;
  const sessionDoc = view.state.doc;
  const startX = event.clientX;
  const startY = event.clientY;
  let moved = false;
  let stopped = false;
  let clickStopped = false;

  const stop = () => {
    if (stopped) return;
    stopped = true;
    ownerDocument.removeEventListener('mousemove', handleMouseMove, true);
    ownerDocument.removeEventListener('mouseup', handleMouseUp, true);
    ownerWindow?.removeEventListener('blur', handleWindowBlur);
    if (activeNestedListPointerSessions.get(view) === cancelSession) {
      activeNestedListPointerSessions.delete(view);
    }
  };

  const stopClick = () => {
    if (clickStopped) return;
    clickStopped = true;
    ownerDocument.removeEventListener('click', handleClick, true);
  };

  const scheduleClickStop = () => {
    window.setTimeout(stopClick, CLICK_SUPPRESSION_MS);
  };

  const cancelSession = () => {
    stop();
    stopClick();
  };

  const handleWindowBlur = () => cancelSession();

  const handleClick = (clickEvent: MouseEvent) => {
    if (view.state.doc !== sessionDoc) {
      stopClick();
      return;
    }
    clickEvent.preventDefault();
    clickEvent.stopPropagation();
    clickEvent.stopImmediatePropagation();
    if (!moved) {
      dispatchNestedListTextSelection(view, pos);
    }
    stopClick();
  };

  const handleMouseMove = (moveEvent: MouseEvent) => {
    if (view.state.doc !== sessionDoc) {
      cancelSession();
      return;
    }
    if ((moveEvent.buttons & 1) === 0) return;
    const hasDragged = Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY) > CLICK_MOVE_THRESHOLD_PX;
    if (!moved && !hasDragged) return;

    moved = true;
    moveEvent.preventDefault();
    moveEvent.stopPropagation();
    moveEvent.stopImmediatePropagation();
    const head = resolveNestedListDragHeadAtPoint(view, moveEvent.clientX, moveEvent.clientY, scanRoot);
    if (head !== null) {
      dispatchNestedListTextSelection(view, pos, head);
    }
  };

  const handleMouseUp = (upEvent: MouseEvent) => {
    stop();
    if (view.state.doc !== sessionDoc) {
      stopClick();
      return;
    }
    scheduleClickStop();
    upEvent.preventDefault();
    upEvent.stopPropagation();
    upEvent.stopImmediatePropagation();
    if (!moved) {
      dispatchNestedListTextSelection(view, pos);
      window.setTimeout(() => {
        if (view.state.doc === sessionDoc) {
          dispatchNestedListTextSelection(view, pos);
        }
      }, 0);
      return;
    }

    const head = resolveNestedListDragHeadAtPoint(view, upEvent.clientX, upEvent.clientY, scanRoot);
    if (head !== null) {
      dispatchNestedListTextSelection(view, pos, head);
    }
  };

  event.preventDefault();
  dispatchNestedListTextSelection(view, pos);
  ownerDocument.addEventListener('mousemove', handleMouseMove, true);
  ownerDocument.addEventListener('mouseup', handleMouseUp, true);
  ownerDocument.addEventListener('click', handleClick, true);
  ownerWindow?.addEventListener('blur', handleWindowBlur);
  activeNestedListPointerSessions.set(view, cancelSession);
}

export const nestedListPointerCaretPlugin = $prose(() => {
  return new Plugin({
    key: nestedListPointerCaretPluginKey,
    props: {
      handleDOMEvents: {
        click(view, event) {
          if (!(event instanceof MouseEvent)) return false;
          if (!isPrimaryPlainMouseDown(event)) return false;
          if (!(event.target instanceof Node) || !view.dom.contains(event.target)) return false;
          if (isTaskCheckboxPointer(view, event)) return false;

          const scanRoot = resolveNestedListPointerScanRoot(view, event.target, event.clientX, event.clientY);
          if (!scanRoot) return false;
          const pos = resolveNestedListTextPositionAtPoint(view, event.clientX, event.clientY, scanRoot);
          if (pos === null) return false;

          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();
          return dispatchNestedListTextSelection(view, pos);
        },
        mousedown(view, event) {
          if (!(event instanceof MouseEvent)) return false;
          if (!isPrimaryPlainMouseDown(event)) return false;
          if (!(event.target instanceof Node) || !view.dom.contains(event.target)) return false;
          if (isTaskCheckboxPointer(view, event)) return false;

          const scanRoot = resolveNestedListPointerScanRoot(view, event.target, event.clientX, event.clientY);
          if (!scanRoot) return false;
          const pos = resolveNestedListTextPositionAtPoint(view, event.clientX, event.clientY, scanRoot);
          if (pos === null) return false;

          startNestedListPointerSelection(view, event, pos, scanRoot);
          return true;
        },
      },
    },
  });
});
