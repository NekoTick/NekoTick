import { getWhiteboardBoundsCandidates, type WhiteboardEraserSpatialIndex } from './whiteboardEraser';
import type { WhiteboardResizePreview } from './whiteboardInteractions';
import type { WhiteboardElement, WhiteboardStroke } from './whiteboardModel';
import { shouldPrepareWhiteboardResizeItems } from './whiteboardPreparedResize';
import {
  getElementBounds,
  getStrokeBounds,
  getWhiteboardResizeScale,
  normalizeWhiteboardSelectionRect,
  rectsOverlap,
  resizeSelectionElement,
  resizeSelectionStroke,
  type WhiteboardSelectionRect,
} from './whiteboardSelection';

export interface WhiteboardResizePreviewItems {
  elements: WhiteboardElement[];
  strokes: WhiteboardStroke[];
}

export function getWhiteboardResizePreviewItems(
  preview: WhiteboardResizePreview,
  spatialIndex: WhiteboardEraserSpatialIndex,
  visibleRect: WhiteboardSelectionRect | null,
): WhiteboardResizePreviewItems {
  const candidates = visibleRect
    ? getWhiteboardBoundsCandidates(spatialIndex, normalizeWhiteboardSelectionRect(invertResizeRect(visibleRect, preview)))
    : {
        elements: [...preview.originalElementsById.values()],
        strokes: [...preview.originalStrokesById.values()],
      };
  const elements: WhiteboardElement[] = [];
  const strokes: WhiteboardStroke[] = [];
  for (const candidate of candidates.elements) {
    const original = preview.originalElementsById.get(candidate.id);
    if (!original) continue;
    const resized = resizeSelectionElement(original, preview.startBounds, preview.nextBounds);
    if (!visibleRect || rectsOverlap(getElementBounds(resized), visibleRect)) elements.push(resized);
  }
  for (const candidate of candidates.strokes) {
    const original = preview.originalStrokesById.get(candidate.id);
    if (!original) continue;
    const resized = resizeSelectionStroke(original, preview.startBounds, preview.nextBounds);
    const bounds = getStrokeBounds(resized);
    if (!visibleRect || (bounds && rectsOverlap(bounds, visibleRect))) strokes.push(resized);
  }
  return { elements, strokes };
}

export function getWhiteboardResizePreviewSourceItems(
  preview: WhiteboardResizePreview,
  spatialIndex: WhiteboardEraserSpatialIndex,
  visibleRect: WhiteboardSelectionRect | null,
): WhiteboardResizePreviewItems {
  const sourceRect = visibleRect
    ? normalizeWhiteboardSelectionRect(invertResizeRect(visibleRect, preview))
    : null;
  const candidates = sourceRect
    ? getWhiteboardBoundsCandidates(spatialIndex, sourceRect)
    : {
        elements: [...preview.originalElementsById.values()],
        strokes: [...preview.originalStrokesById.values()],
      };
  return {
    elements: candidates.elements.filter((candidate) => {
      const original = preview.originalElementsById.get(candidate.id);
      return Boolean(original && (!sourceRect || rectsOverlap(getElementBounds(original), sourceRect)));
    }),
    strokes: candidates.strokes.filter((candidate) => {
      const original = preview.originalStrokesById.get(candidate.id);
      const bounds = original ? getStrokeBounds(original) : null;
      return Boolean(original && (!sourceRect || (bounds && rectsOverlap(bounds, sourceRect))));
    }),
  };
}

export function getWhiteboardResizePreviewTransform(preview: WhiteboardResizePreview): string {
  const scaleX = getWhiteboardResizeScale(preview.nextBounds.width, preview.startBounds.width);
  const scaleY = getWhiteboardResizeScale(preview.nextBounds.height, preview.startBounds.height);
  return `translate(${preview.nextBounds.x}px, ${preview.nextBounds.y}px) scale(${scaleX}, ${scaleY}) translate(${-preview.startBounds.x}px, ${-preview.startBounds.y}px)`;
}

export function shouldTransformWhiteboardResizePreview(preview: WhiteboardResizePreview): boolean {
  return shouldPrepareWhiteboardResizeItems(preview.originalElementsById, preview.originalStrokesById);
}

function invertResizeRect(
  rect: WhiteboardSelectionRect,
  preview: WhiteboardResizePreview,
): WhiteboardSelectionRect {
  const scaleX = getWhiteboardResizeScale(preview.nextBounds.width, preview.startBounds.width);
  const scaleY = getWhiteboardResizeScale(preview.nextBounds.height, preview.startBounds.height);
  return {
    height: rect.height / scaleY,
    width: rect.width / scaleX,
    x: preview.startBounds.x + (rect.x - preview.nextBounds.x) / scaleX,
    y: preview.startBounds.y + (rect.y - preview.nextBounds.y) / scaleY,
  };
}
