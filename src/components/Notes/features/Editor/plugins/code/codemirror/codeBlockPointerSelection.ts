import { EditorSelection } from '@codemirror/state';
import { EditorView as CodeMirror, ViewPlugin } from '@codemirror/view';
import {
  iterateTextGraphemeRanges,
  MAX_POINTER_TEXT_GRAPHEME_MEASUREMENTS,
} from '../../shared/pointerTextPosition';

function resolveCodeBlockTextNodeCaretPositionAtPointer(view: CodeMirror, event: MouseEvent): number | null {
  const ownerDocument = view.dom.ownerDocument;
  const hitElement = ownerDocument.elementFromPoint?.(event.clientX, event.clientY);
  const root = hitElement && view.contentDOM.contains(hitElement) ? hitElement : view.contentDOM;
  const showText = ownerDocument.defaultView?.NodeFilter?.SHOW_TEXT ?? 4;
  const walker = ownerDocument.createTreeWalker(root, showText);
  const range = ownerDocument.createRange();
  let best: { distance: number; node: Text; offset: number } | null = null;
  let measuredGraphemes = 0;

  try {
    while (walker.nextNode()) {
      const textNode = walker.currentNode as Text;
      if (!textNode.data) continue;

      range.selectNodeContents(textNode);
      const textNodeRects = Array.from(range.getClientRects());
      const isOnClickedLine = textNodeRects.some((rect) =>
        rect.width > 0 &&
        rect.height > 0 &&
        event.clientY >= rect.top - 3 &&
        event.clientY <= rect.bottom + 3
      );
      if (!isOnClickedLine) continue;

      for (const grapheme of iterateTextGraphemeRanges(textNode.data)) {
        if (measuredGraphemes >= MAX_POINTER_TEXT_GRAPHEME_MEASUREMENTS) return null;
        measuredGraphemes += 1;
        range.setStart(textNode, grapheme.from);
        range.setEnd(textNode, grapheme.to);
        for (const rect of Array.from(range.getClientRects())) {
          if (rect.width <= 0 || rect.height <= 0) continue;

          const verticalDistance = event.clientY < rect.top
            ? rect.top - event.clientY
            : event.clientY > rect.bottom
              ? event.clientY - rect.bottom
              : 0;
          if (verticalDistance > Math.max(4, rect.height / 2)) continue;

          const horizontalDistance = event.clientX < rect.left
            ? rect.left - event.clientX
            : event.clientX > rect.right
              ? event.clientX - rect.right
              : 0;
          const centerY = rect.top + rect.height / 2;
          const distance = horizontalDistance + Math.abs(event.clientY - centerY) * 2;
          if (best && distance >= best.distance) continue;

          best = {
            distance,
            node: textNode,
            offset: event.clientX <= rect.left + rect.width / 2 ? grapheme.from : grapheme.to,
          };
        }
      }
    }
  } finally {
    range.detach();
  }

  if (!best) return null;
  try {
    return view.posAtDOM(best.node, best.offset);
  } catch {
    return null;
  }
}

export function resolveCodeBlockCaretPositionAtPointer(view: CodeMirror, event: MouseEvent): number | null {
  const coordsPosition = view.posAtCoords({ x: event.clientX, y: event.clientY });
  if (coordsPosition !== null) {
    return coordsPosition;
  }

  const textNodePosition = resolveCodeBlockTextNodeCaretPositionAtPointer(view, event);
  if (textNodePosition !== null) {
    return textNodePosition;
  }

  const ownerDocument = view.dom.ownerDocument as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };
  const caretPosition = ownerDocument.caretPositionFromPoint?.(event.clientX, event.clientY);
  const caretRange = caretPosition
    ? null
    : ownerDocument.caretRangeFromPoint?.(event.clientX, event.clientY);
  const node = caretPosition?.offsetNode ?? caretRange?.startContainer ?? null;
  const offset = caretPosition?.offset ?? caretRange?.startOffset ?? null;

  if (node && offset !== null && view.contentDOM.contains(node)) {
    try {
      return view.posAtDOM(node, offset);
    } catch {
    }
  }

  return null;
}

function isCodeBlockContentTarget(view: CodeMirror, event: MouseEvent): boolean {
  const target = event.target;
  return target instanceof Node && view.contentDOM.contains(target);
}

function isPositionInsideCodeBlockSelection(view: CodeMirror, position: number): boolean {
  return view.state.selection.ranges.some((range) => !range.empty && position >= range.from && position <= range.to);
}

function hasCodeBlockSelection(view: CodeMirror): boolean {
  return view.state.selection.ranges.some((range) => !range.empty);
}

export function resolveCodeBlockBlankContentClickPosition(view: CodeMirror, event: MouseEvent): number | null {
  if (event.button !== 0 || event.shiftKey || event.metaKey || event.ctrlKey || event.altKey) {
    return null;
  }

  const target = event.target;
  if (!(target instanceof Node) || !view.dom.contains(target)) {
    return null;
  }

  const element = target instanceof Element ? target : target.parentElement;
  if (!element || element.closest('.cm-gutters, .cm-gutter, .cm-gutterElement')) {
    return null;
  }

  if (hasCodeBlockSelection(view)) {
    const caretPosition = resolveCodeBlockCaretPositionAtPointer(view, event);
    if (caretPosition !== null && isPositionInsideCodeBlockSelection(view, caretPosition)) {
      return caretPosition;
    }
  }

  const lineBlock = view.lineBlockAtHeight(event.clientY - view.documentTop);
  const line = view.state.doc.lineAt(lineBlock.from);
  const lineElement = element.closest('.cm-line');
  if (lineElement) {
    const lineEndCoords = view.coordsAtPos(line.to, 1) ?? view.coordsAtPos(line.to);
    if (!lineEndCoords || event.clientX < lineEndCoords.right) {
      return null;
    }
  } else if (!view.contentDOM.contains(target) && !view.scrollDOM.contains(target)) {
    return null;
  }

  return line.to;
}

export function applyResolvedCodeBlockPointerSelection(view: CodeMirror, event: MouseEvent): boolean {
  const position = resolveCodeBlockBlankContentClickPosition(view, event);
  if (position === null) {
    return false;
  }

  event.preventDefault();
  event.stopImmediatePropagation();
  view.dispatch({
    selection: EditorSelection.cursor(position),
    scrollIntoView: true,
  });
  view.focus();
  return true;
}

export const codeBlockPointerSelectionPlugin = ViewPlugin.fromClass(class {
  private readonly handlePointerDown = (event: PointerEvent) => {
    if (isCodeBlockContentTarget(this.view, event)) {
      return;
    }

    const position = resolveCodeBlockBlankContentClickPosition(this.view, event);
    if (
      position === null
      || !hasCodeBlockSelection(this.view)
      || !isPositionInsideCodeBlockSelection(this.view, position)
    ) {
      return;
    }

    applyResolvedCodeBlockPointerSelection(this.view, event);
  };

  constructor(private readonly view: CodeMirror) {
    view.dom.addEventListener('pointerdown', this.handlePointerDown, true);
  }

  destroy() {
    this.view.dom.removeEventListener('pointerdown', this.handlePointerDown, true);
  }
});
