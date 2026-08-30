import { TextSelection } from '@milkdown/kit/prose/state';
import type { EditorView as ProseMirrorView } from '@milkdown/kit/prose/view';
import type { EditorView as CodeMirrorView } from '@codemirror/view';
import { mapCodeBlockEditorOffsetToDocumentOffset } from './codemirror';
import { resolveCodeBlockCaretPositionAtPointer } from './codemirror/codeBlockPointerSelection';
import {
  clampDocPosition,
  isInlineTextSelectionEndpoint,
  resolveEditorTextPositionAtPointer,
} from '../shared/pointerTextPosition';
import { showTextSelectionOverlayForTransaction } from '../selection/textSelectionOverlayState';

const POINTER_DRAG_THRESHOLD_PX = 4;
const activeSessions = new WeakMap<ProseMirrorView, () => void>();

interface CodeBlockCrossBoundarySelectionOptions {
  codeMirror: CodeMirrorView;
  codeBlockDOM: HTMLElement;
  getCodeBlockPosition: () => number | undefined;
  getCodeBlockText: () => string;
  syncCodeBlockSelection: () => void;
  view: ProseMirrorView;
}

function isPlainPrimaryMouseDown(event: MouseEvent): boolean {
  return event.button === 0 &&
    event.detail <= 1 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.altKey &&
    !event.shiftKey;
}

function isPointInsideElement(element: HTMLElement, event: MouseEvent): boolean {
  const target = event.target;
  if (target instanceof Node && element.contains(target)) {
    return true;
  }

  for (const rect of Array.from(element.getClientRects())) {
    if (
      rect.width > 0 &&
      rect.height > 0 &&
      event.clientX >= rect.left &&
      event.clientX <= rect.right &&
      event.clientY >= rect.top &&
      event.clientY <= rect.bottom
    ) {
      return true;
    }
  }

  return false;
}

function resolveDocumentPosition(
  options: CodeBlockCrossBoundarySelectionOptions,
  event: MouseEvent,
): number | null {
  const { codeBlockDOM, codeMirror, getCodeBlockPosition, getCodeBlockText, view } = options;
  if (isPointInsideElement(codeBlockDOM, event)) {
    const editorOffset = resolveCodeBlockCaretPositionAtPointer(codeMirror, event);
    const codeBlockPosition = getCodeBlockPosition();
    if (editorOffset !== null && codeBlockPosition !== undefined) {
      return codeBlockPosition + 1 + mapCodeBlockEditorOffsetToDocumentOffset(
        getCodeBlockText(),
        editorOffset,
      );
    }
    return null;
  }

  return resolveEditorTextPositionAtPointer(view, event.clientX, event.clientY);
}

function dispatchTextSelection(view: ProseMirrorView, anchor: number, head: number): boolean {
  const nextAnchor = clampDocPosition(view, anchor);
  const nextHead = clampDocPosition(view, head);
  if (
    !isInlineTextSelectionEndpoint(view, nextAnchor) ||
    !isInlineTextSelectionEndpoint(view, nextHead)
  ) {
    return false;
  }

  try {
    view.dispatch(
      showTextSelectionOverlayForTransaction(
        view.state.tr
          .setSelection(TextSelection.create(view.state.doc, nextAnchor, nextHead))
          .setMeta('addToHistory', false),
      ),
    );
    return true;
  } catch {
    return false;
  }
}

export function installCodeBlockCrossBoundarySelection(
  options: CodeBlockCrossBoundarySelectionOptions,
): () => void {
  const {
    codeBlockDOM,
    codeMirror,
    getCodeBlockPosition,
    syncCodeBlockSelection,
    view,
  } = options;
  const ownerDocument = codeMirror.dom.ownerDocument;
  const ownerWindow = ownerDocument.defaultView;
  let cleanupSession: (() => void) | null = null;

  const handleMouseDown = (event: MouseEvent) => {
    if (!isPlainPrimaryMouseDown(event)) return;

    const anchor = resolveDocumentPosition(options, event);
    if (anchor === null || getCodeBlockPosition() === undefined) return;

    cleanupSession?.();
    const sessionDoc = view.state.doc;
    const startX = event.clientX;
    const startY = event.clientY;
    let moved = false;
    let outerSelectionActive = false;
    let selectionHead = anchor;
    let stopped = false;

    const stopEvent = (pointerEvent: MouseEvent) => {
      pointerEvent.preventDefault();
      pointerEvent.stopPropagation();
      pointerEvent.stopImmediatePropagation();
    };

    const stop = () => {
      if (stopped) return;
      stopped = true;
      ownerDocument.removeEventListener('mousemove', handleMouseMove, true);
      ownerDocument.removeEventListener('mouseup', handleMouseUp, true);
      ownerWindow?.removeEventListener('blur', stop);
      if (activeSessions.get(view) === stop) {
        activeSessions.delete(view);
      }
      if (cleanupSession === stop) {
        cleanupSession = null;
      }
    };

    const activateOuterSelection = (eventToResolve: MouseEvent, head: number) => {
      outerSelectionActive = true;
      moved = true;
      selectionHead = head;
      stopEvent(eventToResolve);

      codeMirror.contentDOM.blur();
      codeMirror.dom.blur();
      if (dispatchTextSelection(view, anchor, head)) {
        syncCodeBlockSelection();
        view.dom.focus({ preventScroll: true });
      }
    };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (view.state.doc !== sessionDoc) {
        stop();
        return;
      }
      if ((moveEvent.buttons & 1) === 0) return;

      const hasDragged = Math.hypot(
        moveEvent.clientX - startX,
        moveEvent.clientY - startY,
      ) > POINTER_DRAG_THRESHOLD_PX;
      if (!moved && !hasDragged) return;

      if (!outerSelectionActive) {
        if (isPointInsideElement(codeBlockDOM, moveEvent)) return;
        const head = resolveDocumentPosition(options, moveEvent);
        if (head === null) return;
        activateOuterSelection(moveEvent, head);
        return;
      }

      stopEvent(moveEvent);
      const head = resolveDocumentPosition(options, moveEvent);
      if (head !== null && dispatchTextSelection(view, anchor, head)) {
        selectionHead = head;
      }
    };

    const handleMouseUp = (upEvent: MouseEvent) => {
      if (!outerSelectionActive) {
        stop();
        return;
      }

      stop();
      stopEvent(upEvent);
      if (view.state.doc !== sessionDoc) return;

      const head = resolveDocumentPosition(options, upEvent) ?? selectionHead;
      dispatchTextSelection(view, anchor, head);
    };

    cleanupSession = stop;
    activeSessions.get(view)?.();
    activeSessions.set(view, stop);
    ownerDocument.addEventListener('mousemove', handleMouseMove, true);
    ownerDocument.addEventListener('mouseup', handleMouseUp, true);
    ownerWindow?.addEventListener('blur', stop);
  };

  codeMirror.dom.addEventListener('mousedown', handleMouseDown, true);

  const dispose = () => {
    codeMirror.dom.removeEventListener('mousedown', handleMouseDown, true);
    cleanupSession?.();
    cleanupSession = null;
  };

  return dispose;
}
