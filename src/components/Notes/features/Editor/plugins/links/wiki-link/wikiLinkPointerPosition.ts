import type { EditorView } from '@milkdown/kit/prose/view';
import {
  resolveEditorTextPositionAtPointer,
  resolveTextOffsetAtPoint,
} from '../../shared/pointerTextPosition';
import type { WikiLinkSourceRange } from './wikiLinkSourceDecorations';

export function isInsideWikiLinkRange(
  position: number,
  range: WikiLinkSourceRange,
): boolean {
  return position >= range.from && position <= range.to;
}

function resolveExpandedPointerPosition(
  view: EditorView,
  roots: readonly HTMLElement[],
  expanded: WikiLinkSourceRange,
  event: MouseEvent,
): number | null {
  const rootSet = new Set(roots);
  const walker = view.dom.ownerDocument.createTreeWalker(view.dom, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  for (let current = walker.nextNode(); current; current = walker.nextNode()) {
    if (!(current instanceof Text)) continue;
    const root = current.parentElement?.closest('.wiki-link-expanded');
    if (root instanceof HTMLElement && rootSet.has(root)) textNodes.push(current);
  }
  const source = view.state.doc.textBetween(expanded.from, expanded.to, '');
  if (textNodes.map((node) => node.data).join('') !== source) return null;

  const resolveDomOffset = (node: Node, offset: number): number | null => {
    if (!(node instanceof Text)) return null;
    let consumed = 0;
    for (const current of textNodes) {
      if (current === node) {
        return consumed + Math.max(0, Math.min(offset, node.textContent?.length ?? 0));
      }
      consumed += current.textContent?.length ?? 0;
    }
    return null;
  };
  const doc = view.dom.ownerDocument as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };
  const caret = doc.caretPositionFromPoint?.(event.clientX, event.clientY);
  const caretOffset = caret ? resolveDomOffset(caret.offsetNode, caret.offset) : null;
  if (caretOffset !== null) return expanded.from + caretOffset;
  const range = doc.caretRangeFromPoint?.(event.clientX, event.clientY) ?? null;
  if (range) {
    const rangeOffset = resolveDomOffset(range.startContainer, range.startOffset);
    range.detach();
    if (rangeOffset !== null) return expanded.from + rangeOffset;
  }

  let best: { distance: number; offset: number } | null = null;
  let consumed = 0;
  for (const node of textNodes) {
    const resolved = resolveTextOffsetAtPoint(node, event.clientX, event.clientY);
    if (resolved && (!best || resolved.distance < best.distance)) {
      best = { distance: resolved.distance, offset: consumed + resolved.offset };
    }
    consumed += node.textContent?.length ?? 0;
  }
  return best ? expanded.from + best.offset : null;
}

export function resolveWikiLinkPointerPosition(
  view: EditorView,
  event: MouseEvent,
  expanded: WikiLinkSourceRange,
): number | null {
  const expandedRoots = Array.from(
    view.dom.querySelectorAll<HTMLElement>('.wiki-link-expanded'),
  );
  const isInsideExpandedRoot = expandedRoots.some((root) => {
    const rects = root.getClientRects();
    for (let index = 0; index < rects.length; index += 1) {
      const rect = rects.item(index);
      if (
        rect &&
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom
      ) {
        return true;
      }
    }
    return false;
  });
  if (isInsideExpandedRoot) {
    const position = resolveExpandedPointerPosition(view, expandedRoots, expanded, event);
    if (position !== null) return position;
  }
  return resolveEditorTextPositionAtPointer(view, event.clientX, event.clientY);
}
