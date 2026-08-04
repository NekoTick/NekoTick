export interface RectBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface BlockRect extends RectBounds {
  from: number;
  to: number;
  /** Exact caret edges when the selectable block range includes structural inline nodes. */
  caretRange?: BlockRange;
  contentLeft?: number;
  contentRight?: number;
  contentLineRects?: RectBounds[];
  allowInsideTrailingClick?: boolean;
}

export interface BlockRange {
  from: number;
  to: number;
}

export interface BlockRectYIndex {
  blocks: readonly BlockRect[];
  sortedByTop: readonly BlockRect[];
}

export const LARGE_BLOCK_SELECTION_RENDERING_THRESHOLD = 64;
export const LARGE_BLOCK_SELECTION_DOCUMENT_CHILD_THRESHOLD = 256;
export const BLOCK_SELECTION_PREVIEW_RENDERING_THRESHOLD = 32;

export function shouldRenderBlockSelectionWithPreview(selectedBlockCount: number): boolean {
  return selectedBlockCount >= BLOCK_SELECTION_PREVIEW_RENDERING_THRESHOLD;
}

export function isLargeBlockSelectionDocument(doc: { childCount: number }): boolean {
  return doc.childCount >= LARGE_BLOCK_SELECTION_DOCUMENT_CHILD_THRESHOLD;
}

export function shouldUseLargeBlockSelectionRendering(
  doc: { childCount: number },
  selectedBlockCount: number,
): boolean {
  return selectedBlockCount >= LARGE_BLOCK_SELECTION_RENDERING_THRESHOLD
    || (selectedBlockCount > 0 && isLargeBlockSelectionDocument(doc));
}
