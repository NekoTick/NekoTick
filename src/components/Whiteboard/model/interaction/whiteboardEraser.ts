import { doesEraserSweepTouchStroke } from '@/components/Whiteboard/model/geometry/whiteboardStrokeGeometry';
import { distanceBetweenSegments } from '@/components/Whiteboard/model/geometry/whiteboardSegmentGeometry';
import {
  getEraserRadius,
  type WhiteboardElement,
  type WhiteboardStroke,
} from '@/components/Whiteboard/model/core/whiteboardModel';
import { getElementCorners } from './whiteboardSelection';
import type { WhiteboardEraserSample } from './whiteboardSpatialIndex';

export {
  createWhiteboardEraserSpatialIndex,
  createWhiteboardEraserSpatialIndexAsync,
  getWhiteboardBoundsCandidates,
  getWhiteboardEraserCandidates,
  getWhiteboardIndexedItems,
  updateWhiteboardEraserSpatialIndex,
  tryUpdateWhiteboardEraserSpatialIndex,
} from './whiteboardSpatialIndex';
export type {
  WhiteboardEraserSample,
  WhiteboardEraserSpatialIndex,
  WhiteboardItemOrder,
} from './whiteboardSpatialIndex';

export interface WhiteboardEraserTargets {
  elementIds: string[];
  strokeIds: string[];
}

export interface WhiteboardEraserPreview extends WhiteboardEraserTargets {
  trail: WhiteboardEraserSample[];
}

interface WhiteboardEraserSweep {
  end: WhiteboardEraserSample;
  radius: number;
  start: WhiteboardEraserSample;
}

export const EMPTY_WHITEBOARD_ERASER_PREVIEW: WhiteboardEraserPreview = {
  elementIds: [],
  strokeIds: [],
  trail: [],
};

export function getWhiteboardEraserTargets(
  elements: WhiteboardElement[],
  strokes: WhiteboardStroke[],
  samples: WhiteboardEraserSample[],
): WhiteboardEraserTargets {
  const sweeps = getEraserSweeps(samples);
  if (sweeps.length === 0) return { elementIds: [], strokeIds: [] };
  return {
    elementIds: elements.filter((element) => sweeps.some((sweep) => eraserSweepTouchesElement(element, sweep))).map((element) => element.id),
    strokeIds: strokes.filter((stroke) => sweeps.some((sweep) => (
      doesEraserSweepTouchStroke(stroke, sweep.start.point, sweep.end.point, Math.max(sweep.start.size, sweep.end.size))
    ))).map((stroke) => stroke.id),
  };
}

function getEraserSweeps(samples: WhiteboardEraserSample[]): WhiteboardEraserSweep[] {
  if (samples.length === 0) return [];
  if (samples.length === 1) {
    const sample = samples[0];
    return [{ end: sample, radius: getEraserRadius(sample.size), start: sample }];
  }
  return samples.slice(1).map((end, index) => {
    const start = samples[index];
    return { end, radius: getEraserRadius(Math.max(start.size, end.size)), start };
  });
}

function eraserSweepTouchesElement(element: WhiteboardElement, sweep: WhiteboardEraserSweep): boolean {
  const corners = getElementCorners(element);
  if (pointInPolygon(sweep.start.point, corners) || pointInPolygon(sweep.end.point, corners)) return true;
  return corners.map((point, index) => [point, corners[(index + 1) % corners.length]] as const)
    .some(([start, end]) => distanceBetweenSegments(sweep.start.point, sweep.end.point, start, end) <= sweep.radius);
}

function pointInPolygon(
  point: { x: number; y: number },
  polygon: Array<{ x: number; y: number }>,
): boolean {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const currentPoint = polygon[index];
    const previousPoint = polygon[previous];
    const crossesY = currentPoint.y > point.y !== previousPoint.y > point.y;
    const xAtY = ((previousPoint.x - currentPoint.x) * (point.y - currentPoint.y))
      / (previousPoint.y - currentPoint.y) + currentPoint.x;
    if (crossesY && point.x < xAtY) inside = !inside;
  }
  return inside;
}
