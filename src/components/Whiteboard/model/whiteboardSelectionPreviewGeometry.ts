import type { WhiteboardResizePreview, WhiteboardRotationPreview } from './whiteboardInteractions';
import type { WhiteboardSelectedOverlayGeometry } from './whiteboardSelection';
import {
  getSelectedOverlayGeometry,
  normalizeWhiteboardSelectionRect,
  resizeSelectionElement,
  resizeSelectionStroke,
  rotateSelectionElement,
  rotateSelectionStroke,
} from './whiteboardSelection';
import { shouldPrepareWhiteboardResizeItems } from './whiteboardPreparedResize';
import { rotateRectBounds } from './whiteboardRotationPreview';

export function getWhiteboardResizePreviewGeometry(
  preview: WhiteboardResizePreview,
  fallback: WhiteboardSelectedOverlayGeometry,
): WhiteboardSelectedOverlayGeometry {
  if (shouldPrepareWhiteboardResizeItems(preview.originalElementsById, preview.originalStrokesById)) {
    return transformFallbackGeometry(fallback, normalizeWhiteboardSelectionRect(preview.nextBounds));
  }
  return getSelectedOverlayGeometry(
    [...preview.originalElementsById.values()].map((element) => (
      resizeSelectionElement(element, preview.startBounds, preview.nextBounds)
    )),
    [...preview.originalStrokesById.values()].map((stroke) => (
      resizeSelectionStroke(stroke, preview.startBounds, preview.nextBounds)
    )),
  );
}

export function getWhiteboardRotationPreviewGeometry(
  preview: WhiteboardRotationPreview,
  fallback: WhiteboardSelectedOverlayGeometry,
): WhiteboardSelectedOverlayGeometry {
  if (shouldPrepareWhiteboardResizeItems(preview.originalElementsById, preview.originalStrokesById)) {
    const bounds = fallback.groupBounds ?? fallback.singleBounds;
    return bounds ? transformFallbackGeometry(fallback, rotateRectBounds(bounds, preview.center, preview.angle)) : fallback;
  }
  return getSelectedOverlayGeometry(
    [...preview.originalElementsById.values()].map((element) => (
      rotateSelectionElement(element, preview.center, preview.angle)
    )),
    [...preview.originalStrokesById.values()].map((stroke) => (
      rotateSelectionStroke(stroke, preview.center, preview.angle)
    )),
  );
}

function transformFallbackGeometry(
  geometry: WhiteboardSelectedOverlayGeometry,
  bounds: { height: number; width: number; x: number; y: number },
): WhiteboardSelectedOverlayGeometry {
  if (geometry.groupBounds) return { groupBounds: bounds, singleBounds: null, singleStroke: null };
  if (!geometry.singleBounds) return geometry;
  return {
    groupBounds: null,
    singleBounds: { ...bounds, id: geometry.singleBounds.id },
    singleStroke: geometry.singleStroke,
  };
}
