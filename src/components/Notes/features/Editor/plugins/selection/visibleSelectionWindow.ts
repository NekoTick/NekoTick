import type { EditorView } from '@milkdown/kit/prose/view';

export interface SelectionViewportBounds {
  bottom: number;
  top: number;
}

function getTopLevelChild(view: EditorView, node: Node): HTMLElement | null {
  let current = node instanceof HTMLElement ? node : node.parentElement;
  while (current && current.parentElement !== view.dom) current = current.parentElement;
  return current instanceof HTMLElement ? current : null;
}

export function getSelectionViewportBounds(view: EditorView): SelectionViewportBounds {
  const ownerWindow = view.dom.ownerDocument.defaultView;
  const scrollRoot = view.dom.closest<HTMLElement>('[data-note-scroll-root="true"]');
  const scrollRect = scrollRoot?.getBoundingClientRect();
  return {
    bottom: Math.min(
      ownerWindow?.innerHeight ?? Number.POSITIVE_INFINITY,
      scrollRect?.bottom ?? Number.POSITIVE_INFINITY,
    ),
    top: Math.max(0, scrollRect?.top ?? 0),
  };
}

function findViewportChildIndex(
  children: HTMLCollection,
  viewport: SelectionViewportBounds,
): number {
  let low = 0;
  let high = children.length - 1;
  while (low <= high) {
    const index = Math.floor((low + high) / 2);
    const child = children.item(index);
    if (!(child instanceof HTMLElement)) return index;
    if (isCollapsedSelectionBlock(child)) {
      let candidate = index - 1;
      while (candidate >= low) {
        const previous = children.item(candidate);
        if (previous instanceof HTMLElement && !isCollapsedSelectionBlock(previous)) break;
        candidate -= 1;
      }
      if (candidate < low) {
        low = index + 1;
        continue;
      }
      const previous = children.item(candidate);
      if (!(previous instanceof HTMLElement)) return candidate;
      const rect = previous.getBoundingClientRect();
      if (rect.bottom <= viewport.top) low = index + 1;
      else if (rect.top >= viewport.bottom) high = candidate - 1;
      else return candidate;
      continue;
    }
    const rect = child.getBoundingClientRect();
    if (rect.bottom <= viewport.top) low = index + 1;
    else if (rect.top >= viewport.bottom) high = index - 1;
    else return index;
  }
  return Math.max(0, Math.min(low, children.length - 1));
}

function getCenterChildIndex(
  view: EditorView,
  viewport: SelectionViewportBounds,
): number {
  const children = view.dom.children;
  try {
    const selectionChild = getTopLevelChild(
      view,
      view.domAtPos(view.state.selection.head).node,
    );
    if (selectionChild) {
      const rect = selectionChild.getBoundingClientRect();
      if (rect.top < viewport.bottom && rect.bottom > viewport.top) {
        return Math.max(
          0,
          Array.prototype.indexOf.call(children, selectionChild) as number,
        );
      }
    }
  } catch {
  }

  const editorRect = view.dom.getBoundingClientRect();
  const hit = view.dom.ownerDocument.elementFromPoint?.(
    editorRect.left + editorRect.width / 2,
    viewport.top + (viewport.bottom - viewport.top) / 2,
  );
  let child = hit ? getTopLevelChild(view, hit) : null;
  const nativeAnchor = view.root.getSelection()?.anchorNode;
  if (!child && nativeAnchor) child = getTopLevelChild(view, nativeAnchor);
  if (!child) {
    try {
      child = getTopLevelChild(view, view.domAtPos(view.state.selection.head).node);
    } catch {
      child = null;
    }
  }
  return child
    ? Math.max(0, Array.prototype.indexOf.call(children, child) as number)
    : findViewportChildIndex(children, viewport);
}

function isCollapsedSelectionBlock(element: HTMLElement): boolean {
  return element.matches('.heading-collapsed-content, .editor-collapsed-content');
}

export function getVisibleSelectionWindowChildren(
  view: EditorView,
  viewport = getSelectionViewportBounds(view),
): HTMLElement[] {
  const children = view.dom.children;
  if (children.length === 0) return [];
  const centerIndex = getCenterChildIndex(view, viewport);
  const visible: HTMLElement[] = [];

  for (let index = centerIndex; index >= 0; index -= 1) {
    const child = children.item(index);
    if (!(child instanceof HTMLElement) || isCollapsedSelectionBlock(child)) continue;
    const rect = child.getBoundingClientRect();
    if (rect.bottom <= viewport.top) break;
    if (rect.top < viewport.bottom && rect.bottom > viewport.top) visible.unshift(child);
  }
  for (let index = centerIndex + 1; index < children.length; index += 1) {
    const child = children.item(index);
    if (!(child instanceof HTMLElement) || isCollapsedSelectionBlock(child)) continue;
    const rect = child.getBoundingClientRect();
    if (rect.top >= viewport.bottom) break;
    if (rect.bottom > viewport.top && rect.top < viewport.bottom) visible.push(child);
  }
  if (visible.length === 0) {
    const first = Math.max(0, centerIndex - 2);
    const last = Math.min(children.length - 1, centerIndex + 2);
    for (let index = first; index <= last; index += 1) {
      const child = children.item(index);
      if (child instanceof HTMLElement && !isCollapsedSelectionBlock(child)) visible.push(child);
    }
  }
  return visible;
}
