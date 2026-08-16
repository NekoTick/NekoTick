import { getWhiteboardBoundsCandidates, type WhiteboardEraserSpatialIndex } from './whiteboardEraser';
import type { WhiteboardRotationPreview } from './whiteboardInteractions';
import type { WhiteboardElement, WhiteboardPoint, WhiteboardStroke } from '@/components/Whiteboard/model/core/whiteboardModel';
import { getElementBounds, getStrokeBounds, rectsOverlap, type WhiteboardSelectionRect } from './whiteboardSelection';

export function getWhiteboardRotationPreviewItems(
  preview: WhiteboardRotationPreview,
  spatialIndex: WhiteboardEraserSpatialIndex,
  visibleRect: WhiteboardSelectionRect | null,
): { elements: WhiteboardElement[]; strokes: WhiteboardStroke[] } {
  const sourceRect = visibleRect ? rotateRectBounds(visibleRect, preview.center, -preview.angle) : null;
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

export function getWhiteboardRotationPreviewTransform(preview: WhiteboardRotationPreview): string {
  return `translate(${preview.center.x}px, ${preview.center.y}px) rotate(${preview.angle}rad) translate(${-preview.center.x}px, ${-preview.center.y}px)`;
}

export function rotateRectBounds(
  rect: WhiteboardSelectionRect,
  center: WhiteboardPoint,
  angle: number,
): WhiteboardSelectionRect {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const corners = [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.width, y: rect.y },
    { x: rect.x + rect.width, y: rect.y + rect.height },
    { x: rect.x, y: rect.y + rect.height },
  ].map((point) => {
    const x = point.x - center.x;
    const y = point.y - center.y;
    return { x: center.x + x * cosine - y * sine, y: center.y + x * sine + y * cosine };
  });
  const xs = corners.map((point) => point.x);
  const ys = corners.map((point) => point.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return {
    height: Math.max(...ys) - minY,
    width: Math.max(...xs) - minX,
    x: minX,
    y: minY,
  };
}
