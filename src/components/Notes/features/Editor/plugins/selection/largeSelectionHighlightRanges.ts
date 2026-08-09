import type { EditorView } from '@milkdown/kit/prose/view';
import {
  LARGE_SELECTION_CLASS,
  LARGE_SELECTION_HIGHLIGHT_NAME,
  LARGE_SELECTION_VISIBLE_ELEMENT_CLASS,
} from './textSelectionOverlayState';

interface EditorHighlightRegistry {
  set: (name: string, highlight: EditorHighlight) => void;
}

interface EditorHighlight {
  add: (range: Range) => EditorHighlight;
  clear: () => void;
}

export type LargeSelectionHighlightSpec =
  | { type: 'all' }
  | {
      anchorNode: Node;
      anchorOffset: number;
      boundary: 'end' | 'start';
      type: 'boundary';
    };

const rangesByDocument = new WeakMap<Document, Map<HTMLElement, readonly Range[]>>();
const highlightByDocument = new WeakMap<Document, EditorHighlight>();
const visibleElementsByEditor = new WeakMap<HTMLElement, readonly HTMLElement[]>();

function isCollapsedSelectionBlock(element: HTMLElement): boolean {
  return element.matches('.heading-collapsed-content, .editor-collapsed-content');
}

export interface VisibleLargeSelectionHighlight {
  elements: readonly HTMLElement[];
  ranges: readonly Range[];
}

function getSelectionWindowChildren(view: EditorView): HTMLElement[] {
  const children = view.dom.children;
  if (children.length === 0) return [];

  const ownerWindow = view.dom.ownerDocument.defaultView;
  const editorRect = view.dom.getBoundingClientRect();
  const scrollRoot = view.dom.closest<HTMLElement>('[data-note-scroll-root="true"]');
  const scrollRect = scrollRoot?.getBoundingClientRect();
  const viewportTop = Math.max(0, scrollRect?.top ?? 0);
  const viewportBottom = Math.min(
    ownerWindow?.innerHeight ?? Number.POSITIVE_INFINITY,
    scrollRect?.bottom ?? Number.POSITIVE_INFINITY,
  );
  const centerY = viewportTop + (viewportBottom - viewportTop) / 2;
  const centerX = editorRect.left + editorRect.width / 2;
  const candidate = typeof view.dom.ownerDocument.elementFromPoint === 'function'
    ? view.dom.ownerDocument.elementFromPoint(centerX, centerY)
    : null;
  const viewportChild = candidate instanceof Node ? getTopLevelChild(view, candidate) : null;
  const nativeAnchor = view.root.getSelection()?.anchorNode;
  const anchorChild = nativeAnchor ? getTopLevelChild(view, nativeAnchor) : null;
  const centerChild = viewportChild ?? anchorChild;

  const centerIndex = centerChild
    ? Math.max(0, Array.prototype.indexOf.call(children, centerChild) as number)
    : 0;
  const visible: HTMLElement[] = [];
  for (let index = centerIndex; index >= 0; index -= 1) {
    const child = children.item(index);
    if (!(child instanceof HTMLElement) || isCollapsedSelectionBlock(child)) continue;
    const rect = child.getBoundingClientRect();
    if (rect.bottom <= viewportTop) break;
    if (rect.top < viewportBottom && rect.bottom > viewportTop) visible.unshift(child);
  }
  for (let index = centerIndex + 1; index < children.length; index += 1) {
    const child = children.item(index);
    if (!(child instanceof HTMLElement) || isCollapsedSelectionBlock(child)) continue;
    const rect = child.getBoundingClientRect();
    if (rect.top >= viewportBottom) break;
    if (rect.bottom > viewportTop && rect.top < viewportBottom) visible.push(child);
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

function getTopLevelChild(view: EditorView, node: Node): HTMLElement | null {
  let current = node instanceof HTMLElement ? node : node.parentElement;
  while (current && current.parentElement !== view.dom) {
    current = current.parentElement;
  }
  return current instanceof HTMLElement ? current : null;
}

function createChildRange(child: HTMLElement): Range {
  const range = child.ownerDocument.createRange();
  range.selectNodeContents(child);
  return range;
}

function createChildrenRange(children: readonly HTMLElement[]): Range[] {
  const first = children[0];
  const last = children[children.length - 1];
  if (!first || !last) return [];

  const range = first.ownerDocument.createRange();
  range.setStart(first, 0);
  range.setEnd(last, last.childNodes.length);
  return [range];
}

function createBoundaryHighlight(
  view: EditorView,
  visibleChildren: readonly HTMLElement[],
  spec: Extract<LargeSelectionHighlightSpec, { type: 'boundary' }>,
): VisibleLargeSelectionHighlight {
  const elements: HTMLElement[] = [];
  const ranges: Range[] = [];
  if (spec.anchorNode === view.dom) {
    visibleChildren.forEach((child) => {
      const index = Array.prototype.indexOf.call(view.dom.children, child) as number;
      const selected = spec.boundary === 'end'
        ? index >= spec.anchorOffset
        : index < spec.anchorOffset;
      if (!selected) return;
      elements.push(child);
      ranges.push(createChildRange(child));
    });
    return { elements, ranges };
  }

  const anchorChild = getTopLevelChild(view, spec.anchorNode);
  if (!anchorChild) return { elements, ranges };

  visibleChildren.forEach((child) => {
    if (child === anchorChild) {
      const range = child.ownerDocument.createRange();
      if (spec.boundary === 'end') {
        range.setStart(spec.anchorNode, spec.anchorOffset);
        range.setEnd(child, child.childNodes.length);
      } else {
        range.setStart(child, 0);
        range.setEnd(spec.anchorNode, spec.anchorOffset);
      }
      elements.push(child);
      ranges.push(range);
      return;
    }

    const relation = anchorChild.compareDocumentPosition(child);
    const selected = spec.boundary === 'end'
      ? Boolean(relation & Node.DOCUMENT_POSITION_FOLLOWING)
      : Boolean(relation & Node.DOCUMENT_POSITION_PRECEDING);
    if (!selected) return;
    elements.push(child);
    ranges.push(createChildRange(child));
  });
  return { elements, ranges };
}

export function createVisibleLargeSelectionRanges(
  view: EditorView,
  spec: LargeSelectionHighlightSpec,
): VisibleLargeSelectionHighlight {
  const visibleChildren = getSelectionWindowChildren(view);
  if (spec.type === 'all') {
    return {
      elements: visibleChildren,
      ranges: createChildrenRange(visibleChildren),
    };
  }
  return createBoundaryHighlight(view, visibleChildren, spec);
}

export function setLargeSelectionHighlightRanges(
  view: EditorView,
  nextRanges: readonly Range[] | null,
  nextVisibleElements: readonly HTMLElement[] = [],
): void {
  const ownerDocument = view.dom.ownerDocument;
  const ownerWindow = ownerDocument.defaultView as unknown as {
    CSS?: { highlights?: EditorHighlightRegistry };
    Highlight?: new (...ranges: Range[]) => EditorHighlight;
  } | null;
  const registry = ownerWindow?.CSS?.highlights;
  const Highlight = ownerWindow?.Highlight;
  const useVisibleElementFallback = Boolean(
    nextRanges !== null
    && nextVisibleElements.length > 0
    && (!registry || !Highlight),
  );
  const previousVisibleElements = visibleElementsByEditor.get(view.dom) ?? [];
  for (const element of previousVisibleElements) {
    element.classList.remove(LARGE_SELECTION_VISIBLE_ELEMENT_CLASS);
  }
  if (useVisibleElementFallback) {
    visibleElementsByEditor.set(view.dom, nextVisibleElements);
    for (const element of nextVisibleElements) {
      element.classList.add(LARGE_SELECTION_VISIBLE_ELEMENT_CLASS);
    }
  } else {
    visibleElementsByEditor.delete(view.dom);
  }
  view.dom.classList.toggle(
    LARGE_SELECTION_CLASS,
    nextRanges !== null
      && nextVisibleElements.length === 0
      && (!registry || !Highlight),
  );
  if (!registry || !Highlight) return;

  let highlight = highlightByDocument.get(ownerDocument);
  if (!highlight) {
    highlight = new Highlight();
    highlightByDocument.set(ownerDocument, highlight);
    registry.set(LARGE_SELECTION_HIGHLIGHT_NAME, highlight);
  }

  let editorRanges = rangesByDocument.get(ownerDocument);
  const previousRanges = editorRanges?.get(view.dom);
  let rangesChanged = false;
  if (nextRanges) {
    editorRanges ??= new Map();
    editorRanges.set(view.dom, nextRanges);
    rangesByDocument.set(ownerDocument, editorRanges);
    rangesChanged = previousRanges !== nextRanges;
  } else if (previousRanges) {
    editorRanges?.delete(view.dom);
    rangesChanged = true;
  }

  if (!rangesChanged) return;
  highlight.clear();
  if (!editorRanges || editorRanges.size === 0) {
    rangesByDocument.delete(ownerDocument);
    return;
  }

  for (const range of Array.from(editorRanges.values()).flat()) {
    highlight.add(range);
  }
}
