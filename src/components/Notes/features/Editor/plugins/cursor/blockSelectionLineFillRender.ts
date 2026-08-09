import type { EditorView } from '@milkdown/kit/prose/view';
import type { RectBounds } from './blockSelectionUtils';
import {
  LINE_FILL_CLASS,
  SELECTED_IMAGE_BLOCK_SELECTOR,
  type LineFillEdges,
} from './blockSelectionLineFillConstants';
import {
  isRectNearViewport,
  resolveBlockSelectionBleedXStart,
  resolveLineFillEdges,
  resolveLineFillRight,
} from './blockSelectionLineFillMetrics';

export function appendLineFillElement(
  doc: Document,
  layer: DocumentFragment | HTMLElement,
  hostRect: DOMRect,
  fillStart: number,
  fillRight: number,
  top: number,
  bottom: number,
  edges: LineFillEdges,
): boolean {
  const paintTop = top + edges.top;
  const paintBottom = bottom - edges.bottom;
  if (fillRight - fillStart <= 0.5 || paintBottom - paintTop <= 0.5) return false;

  const fill = doc.createElement('div');
  fill.className = LINE_FILL_CLASS;
  fill.style.left = `${fillStart - hostRect.left}px`;
  fill.style.top = `${paintTop - hostRect.top}px`;
  fill.style.width = `${fillRight - fillStart}px`;
  fill.style.height = `${paintBottom - paintTop}px`;
  layer.appendChild(fill);
  return true;
}

function resolveImageFillAnchor(view: EditorView, image: HTMLElement): HTMLElement {
  const paragraph = image.closest('p');
  return paragraph instanceof HTMLElement && view.dom.contains(paragraph) ? paragraph : image;
}

export function collectSelectedImageBlockElements(view: EditorView): HTMLElement[] {
  return Array.from(view.dom.querySelectorAll<HTMLElement>(SELECTED_IMAGE_BLOCK_SELECTOR))
    .filter((image) => !image.closest('.heading-collapsed-content, .editor-collapsed-content'));
}

export function appendSelectedImageBlockLineFills(
  view: EditorView,
  images: readonly HTMLElement[],
  doc: Document,
  layer: DocumentFragment | HTMLElement,
  hostRect: DOMRect,
  viewportRect: RectBounds | null,
  availableElements: number,
): number {
  if (availableElements <= 0) return 0;

  let createdFills = 0;

  for (const image of images) {
    if (createdFills >= availableElements) break;

    const anchor = resolveImageFillAnchor(view, image);
    const anchorRect = anchor.getBoundingClientRect();
    if (!isRectNearViewport(anchorRect, viewportRect)) continue;

    const imageRect = image.getBoundingClientRect();
    const rowTop = imageRect.height > 0 ? imageRect.top : anchorRect.top;
    const rowBottom = imageRect.height > 0 ? imageRect.bottom : anchorRect.bottom;
    const fillStart = anchorRect.left - resolveBlockSelectionBleedXStart(anchor);
    const fillRight = resolveLineFillRight(view, anchor, anchorRect);
    const edges = resolveLineFillEdges(anchor);

    if (appendLineFillElement(doc, layer, hostRect, fillStart, fillRight, rowTop, rowBottom, edges)) {
      createdFills += 1;
    }
  }

  return createdFills;
}
