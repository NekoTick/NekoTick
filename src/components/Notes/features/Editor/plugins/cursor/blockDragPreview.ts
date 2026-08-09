import { themeOffscreenTokens } from '@/styles/themeTokens';
import type { EditorView } from '@milkdown/kit/prose/view';
import {
  createContentLayer,
  revealAfterVideoCaptures,
} from './blockDragPreviewContent';
import {
  clamp,
  copyCssVariables,
  resolvePreviewOffsetX,
  resolvePreviewOffsetY,
  sanitizeCloneTree
} from './blockDragPreviewDom';
import {
  collectBlockDragSourceParentMarkerElements
} from './blockDragPreviewSourceMarker';
import {
  MIN_PREVIEW_WIDTH,
  PREVIEW_CLASS,
  SOURCE_CLASS,
  SOURCE_PARENT_MARKER_CLASS,
  type BlockDragPreviewHandle,
  type BlockDragPreviewOptions,
  type CaptureJob,
  type PreviewItem,
} from './blockDragPreviewTypes';
import type { BlockRange } from './blockSelectionUtils';
import {
  isInlineSelectableBlockRange,
  resolveSelectableBlockTargetByPos,
} from './blockUnitResolver';

export { collectBlockDragPreviewElements } from './blockDragPreviewDom';
export { createBlockDragSourceMarker } from './blockDragPreviewSourceMarker';
export {
  MAX_BLOCK_DRAG_PREVIEW_CAPTURE_CONCURRENCY,
  MAX_BLOCK_DRAG_PREVIEW_DOM_SCAN_ELEMENTS,
  MAX_BLOCK_DRAG_PREVIEW_MATCHED_ELEMENTS,
  type BlockDragPreviewHandle,
  type BlockDragPreviewOptions,
  type BlockDragSourceMarkerHandle,
  type BlockDragSourceMarkerOptions
} from './blockDragPreviewTypes';

function createInlineRangePreviewContent(
  view: EditorView,
  range: BlockRange,
  source: HTMLElement,
): HTMLElement | null {
  const doc = view.dom.ownerDocument;
  const domRange = doc.createRange();

  try {
    const start = view.domAtPos(range.from);
    const end = view.domAtPos(range.to);
    domRange.setStart(start.node, start.offset);
    domRange.setEnd(end.node, end.offset);

    const content = source.cloneNode(false);
    if (!(content instanceof HTMLElement)) return null;
    content.appendChild(domRange.cloneContents());
    if (!sanitizeCloneTree(content)) return null;
    return content;
  } catch {
    return null;
  } finally {
    domRange.detach();
  }
}

function collectPreviewItems(view: EditorView, ranges: readonly BlockRange[]): PreviewItem[] {
  const items: PreviewItem[] = [];
  for (const range of ranges) {
    const target = resolveSelectableBlockTargetByPos(view, range.from);
    if (!target) continue;
    const element = target?.subElement ?? target?.element;
    if (!element) continue;

    if (isInlineSelectableBlockRange(view.state.doc, range)) {
      const content = createInlineRangePreviewContent(view, range, element);
      if (!content) continue;
      items.push({
        source: element,
        sourceClassElement: null,
        rect: target.rect,
        content,
      });
      continue;
    }

    const existingAncestorIndex = items.findIndex((existing) => (
      existing.sourceClassElement !== null && existing.sourceClassElement.contains(element)
    ));
    if (existingAncestorIndex >= 0) continue;

    for (let index = items.length - 1; index >= 0; index -= 1) {
      const existingElement = items[index].sourceClassElement;
      if (existingElement !== null && element.contains(existingElement)) {
        items.splice(index, 1);
      }
    }

    const clone = element.cloneNode(true);
    if (!(clone instanceof HTMLElement)) continue;
    if (!sanitizeCloneTree(clone)) continue;

    items.push({
      source: element,
      sourceClassElement: element,
      rect: element.getBoundingClientRect(),
      content: clone,
    });
  }
  return items;
}

function resolvePreviewSourceWidth(view: EditorView, items: readonly PreviewItem[]): number {
  const sourceWidth = Math.max(...items.map((item) => item.rect.width));
  if (items.every((item) => item.sourceClassElement === null)) {
    return sourceWidth;
  }

  const editorWidth = view.dom.getBoundingClientRect().width;
  return Math.max(sourceWidth, editorWidth);
}

export function createBlockDragPreview({
  view,
  ranges,
  clientX,
  clientY,
}: BlockDragPreviewOptions): BlockDragPreviewHandle | null {
  const items = collectPreviewItems(view, ranges);
  if (items.length === 0) return null;

  const doc = view.dom.ownerDocument;
  const preview = doc.createElement('div');
  preview.className = PREVIEW_CLASS;
  preview.setAttribute('aria-hidden', 'true');
  preview.setAttribute('data-no-editor-drag-box', 'true');
  preview.style.left = themeOffscreenTokens.blockDragPreviewLeft;
  preview.style.top = themeOffscreenTokens.blockDragPreviewTop;

  copyCssVariables(view.dom as HTMLElement, preview);
  const scrollRoot = view.dom.closest('[data-note-scroll-root="true"]');
  if (scrollRoot instanceof HTMLElement) {
    copyCssVariables(scrollRoot, preview);
  }
  copyCssVariables(items[0].source, preview);

  const captureJobs: CaptureJob[] = [];
  const contentLayer = createContentLayer(doc, items, captureJobs);
  preview.appendChild(contentLayer);

  const viewportWidth = doc.defaultView?.innerWidth ?? 1600;
  const sourceWidth = resolvePreviewSourceWidth(view, items);
  const previewWidth = clamp(sourceWidth, MIN_PREVIEW_WIDTH, Math.max(MIN_PREVIEW_WIDTH, viewportWidth - 16));
  preview.style.width = `${Math.round(previewWidth)}px`;

  doc.body.appendChild(preview);
  let sourceClassElements: HTMLElement[] = [];
  let sourceParentMarkerElements: HTMLElement[] = [];
  let offsetX = 0;
  let offsetY = 0;
  try {
    revealAfterVideoCaptures(preview, captureJobs);

    const firstRect = items[0].rect;
    const previewRect = preview.getBoundingClientRect();
    offsetX = resolvePreviewOffsetX(clientX, firstRect.left, previewRect.width);
    offsetY = resolvePreviewOffsetY(clientY, firstRect.top, previewRect.height);

    sourceClassElements = items
      .map((item) => item.sourceClassElement)
      .filter((element): element is HTMLElement => element !== null);
    sourceParentMarkerElements = collectBlockDragSourceParentMarkerElements(view, sourceClassElements);
    sourceClassElements.forEach((element) => element.classList.add(SOURCE_CLASS));
    sourceParentMarkerElements.forEach((element) => element.classList.add(SOURCE_PARENT_MARKER_CLASS));
  } catch (error) {
    sourceClassElements.forEach((element) => element.classList.remove(SOURCE_CLASS));
    sourceParentMarkerElements.forEach((element) => element.classList.remove(SOURCE_PARENT_MARKER_CLASS));
    preview.remove();
    throw error;
  }

  const roundedOffsetX = Math.round(offsetX);
  const roundedOffsetY = Math.round(offsetY);
  preview.style.left = themeOffscreenTokens.blockDragPreviewOrigin;
  preview.style.top = themeOffscreenTokens.blockDragPreviewOrigin;
  const move = (nextClientX: number, nextClientY: number) => {
    const x = Math.round(nextClientX - roundedOffsetX);
    const y = Math.round(nextClientY - roundedOffsetY);
    preview.style.transform = `translate3d(${x}px, ${y}px, 0)`;
  };
  move(clientX, clientY);

  const destroy = () => {
    sourceClassElements.forEach((element) => element.classList.remove(SOURCE_CLASS));
    sourceParentMarkerElements.forEach((element) => element.classList.remove(SOURCE_PARENT_MARKER_CLASS));
    preview.remove();
  };

  return {
    element: preview,
    offsetX: roundedOffsetX,
    offsetY: roundedOffsetY,
    move,
    destroy,
  };
}
