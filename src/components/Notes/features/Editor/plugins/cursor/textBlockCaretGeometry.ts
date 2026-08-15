import type { EditorView } from '@milkdown/kit/prose/view';
import { resolveElementLineHeight } from '@/lib/ui/caretOverlayStyles';

function elementAtPosition(view: EditorView, pos: number): HTMLElement | null {
  try {
    const domAtPos = view.domAtPos(pos);
    const element = domAtPos.node instanceof HTMLElement
      ? domAtPos.node
      : domAtPos.node.parentElement;
    return element && view.dom.contains(element) ? element : null;
  } catch {
    return null;
  }
}

export function resolveTextBlockElement(view: EditorView, pos: number): HTMLElement | null {
  try {
    const $pos = view.state.doc.resolve(pos);
    for (let depth = $pos.depth; depth > 0; depth -= 1) {
      if (!$pos.node(depth).isTextblock) continue;
      const nodeDom = view.nodeDOM($pos.before(depth));
      if (nodeDom instanceof HTMLElement) return nodeDom;
    }
  } catch {
    // Fall back to the DOM position when a node view does not expose its textblock DOM directly.
  }

  const element = elementAtPosition(view, pos);
  return element?.closest<HTMLElement>('p, h1, h2, h3, h4, h5, h6, pre, td, th') ?? element;
}

export function resolveTextBlockCaretLineHeight(view: EditorView, pos: number): number | null {
  return resolveElementLineHeight(resolveTextBlockElement(view, pos));
}
