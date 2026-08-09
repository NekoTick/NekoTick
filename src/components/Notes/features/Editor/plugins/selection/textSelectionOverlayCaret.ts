import type { EditorView } from '@milkdown/kit/prose/view';
import type { PointerCaretTarget } from './textSelectionOverlayViewTypes';
import { iterateTextGraphemeRanges } from '../shared/pointerTextPosition';

export const MAX_TEXT_SELECTION_CARET_GRAPHEMES = 2048;
const MAX_TEXT_SELECTION_CARET_TEXT_NODES = 64;
const MAX_TEXT_SELECTION_CARET_RECTS = 4096;

interface PointerCoordinates {
  clientX: number;
  clientY: number;
}

function isInlineCaretTarget(view: EditorView, target: PointerCaretTarget): boolean {
  try {
    if (target.doc && target.doc !== view.state.doc) return false;
    const pos = Math.max(0, Math.min(view.state.doc.content.size, target.pos));
    return view.state.doc.resolve(pos).parent.inlineContent;
  } catch {
    return false;
  }
}

export function getDomCaretTarget(
  view: EditorView,
  target: PointerCaretTarget
): PointerCaretTarget | null {
  const nextPos = Math.max(0, Math.min(view.state.doc.content.size, target.pos));
  if (!isInlineCaretTarget(view, { ...target, pos: nextPos })) {
    return null;
  }

  if (target.node && target.offset !== undefined && view.dom.contains(target.node)) {
    try {
      if (view.posAtDOM(target.node, target.offset) === nextPos) {
        return { ...target, pos: nextPos };
      }
    } catch {
    }
  }

  try {
    const domTarget = view.domAtPos(nextPos);
    if (domTarget.node !== view.dom && !view.dom.contains(domTarget.node)) {
      return null;
    }

    return {
      doc: view.state.doc,
      node: domTarget.node,
      offset: domTarget.offset,
      pos: nextPos,
    };
  } catch {
    return null;
  }
}

export function syncNativeSelectionToCaretTarget(
  view: EditorView,
  target: PointerCaretTarget
): void {
  const domTarget = getDomCaretTarget(view, target);
  if (!domTarget?.node || domTarget.offset === undefined) return;
  const ownerDocument = view.dom.ownerDocument;
  const nativeSelection = ownerDocument.defaultView?.getSelection();
  if (!nativeSelection) return;

  const range = ownerDocument.createRange();
  try {
    range.setStart(domTarget.node, domTarget.offset);
    range.collapse(true);
    nativeSelection.removeAllRanges();
    nativeSelection.addRange(range);
  } catch {
  } finally {
    range.detach();
  }
}

export function getTextNodeCaretTargetFromPoint(
  view: EditorView,
  event: PointerCoordinates
): PointerCaretTarget | null {
  const ownerDocument = view.dom.ownerDocument;
  const nativeTarget = getNativeCaretTargetFromPoint(view, event);
  if (nativeTarget?.node instanceof Text) return nativeTarget;

  const hitElement = ownerDocument.elementFromPoint?.(event.clientX, event.clientY) ?? null;
  const root = hitElement && view.dom.contains(hitElement) ? hitElement : view.dom;
  const walker = ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const range = ownerDocument.createRange();
  let best: {
    distance: number;
    horizontalDistance: number;
    node: Text;
    offset: number;
  } | null = null;
  let measuredGraphemes = 0;
  let measuredRects = 0;
  let measuredTextNodes = 0;

  try {
    while (walker.nextNode()) {
      measuredTextNodes += 1;
      if (measuredTextNodes > MAX_TEXT_SELECTION_CARET_TEXT_NODES) return null;
      const textNode = walker.currentNode as Text;
      if (!textNode.data) continue;

      range.selectNodeContents(textNode);
      const textNodeRects = Array.from(range.getClientRects());
      measuredRects += textNodeRects.length;
      if (measuredRects > MAX_TEXT_SELECTION_CARET_RECTS) return null;
      const isOnClickedLine = textNodeRects.some((rect) =>
        rect.width > 0 &&
        rect.height > 0 &&
        event.clientY >= rect.top - 3 &&
        event.clientY <= rect.bottom + 3
      );
      if (!isOnClickedLine) continue;

      for (const grapheme of iterateTextGraphemeRanges(textNode.data)) {
        if (measuredGraphemes >= MAX_TEXT_SELECTION_CARET_GRAPHEMES) return null;
        measuredGraphemes += 1;
        range.setStart(textNode, grapheme.from);
        range.setEnd(textNode, grapheme.to);
        const graphemeRects = Array.from(range.getClientRects());
        measuredRects += graphemeRects.length;
        if (measuredRects > MAX_TEXT_SELECTION_CARET_RECTS) return null;
        for (const rect of graphemeRects) {
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
            horizontalDistance,
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
  if (best.horizontalDistance > 8) return null;
  try {
    return {
      doc: view.state.doc,
      node: best.node,
      offset: best.offset,
      pos: view.posAtDOM(best.node, best.offset),
    };
  } catch {
    return null;
  }
}

function getNativeCaretTargetFromPoint(
  view: EditorView,
  event: PointerCoordinates,
): PointerCaretTarget | null {
  const ownerDocument = view.dom.ownerDocument as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };
  const caretPosition = ownerDocument.caretPositionFromPoint?.(event.clientX, event.clientY);
  const caretRange = caretPosition
    ? null
    : ownerDocument.caretRangeFromPoint?.(event.clientX, event.clientY) ?? null;
  const node = caretPosition?.offsetNode ?? caretRange?.startContainer ?? null;
  const offset = caretPosition?.offset ?? caretRange?.startOffset ?? null;

  try {
    if (!node || offset === null || !view.dom.contains(node)) return null;
    const target = {
      doc: view.state.doc,
      node,
      offset,
      pos: view.posAtDOM(node, offset),
    };
    return isInlineCaretTarget(view, target) ? target : null;
  } catch {
    return null;
  } finally {
    caretRange?.detach();
  }
}

export function getCaretTargetFromPoint(
  view: EditorView,
  event: PointerCoordinates
): PointerCaretTarget | null {
  const nativeTarget = getNativeCaretTargetFromPoint(view, event);
  if (nativeTarget !== null) return nativeTarget;

  const textNodeTarget = getTextNodeCaretTargetFromPoint(view, event);
  if (textNodeTarget !== null && isInlineCaretTarget(view, textNodeTarget)) {
    return textNodeTarget;
  }
  return null;
}
