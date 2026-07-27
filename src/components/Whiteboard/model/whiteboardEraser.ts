import { doesEraserSweepTouchStroke } from './whiteboardStrokeGeometry';
import {
  getEraserRadius,
  type WhiteboardElement,
  type WhiteboardStroke,
} from './whiteboardModel';
import type { WhiteboardEraserSample } from './whiteboardSpatialIndex';

export {
  createWhiteboardEraserSpatialIndex,
  createWhiteboardEraserSpatialIndexAsync,
  getWhiteboardBoundsCandidates,
  getWhiteboardEraserCandidates,
  getWhiteboardIndexedItems,
  getWhiteboardStrokeEraserCandidates,
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
  return segmentIntersectsRect(sweep.start.point, sweep.end.point, {
    maxX: element.x + element.width + sweep.radius,
    maxY: element.y + element.height + sweep.radius,
    minX: element.x - sweep.radius,
    minY: element.y - sweep.radius,
  });
}

function segmentIntersectsRect(
  start: { x: number; y: number },
  end: { x: number; y: number },
  rect: { maxX: number; maxY: number; minX: number; minY: number },
): boolean {
  let minProgress = 0;
  let maxProgress = 1;
  for (const [origin, delta, min, max] of [
    [start.x, end.x - start.x, rect.minX, rect.maxX],
    [start.y, end.y - start.y, rect.minY, rect.maxY],
  ] as const) {
    if (delta === 0) {
      if (origin < min || origin > max) return false;
      continue;
    }
    const first = (min - origin) / delta;
    const second = (max - origin) / delta;
    minProgress = Math.max(minProgress, Math.min(first, second));
    maxProgress = Math.min(maxProgress, Math.max(first, second));
    if (minProgress > maxProgress) return false;
  }
  return true;
}
