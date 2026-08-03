import { useCallback, useRef, type PointerEvent, type RefObject } from 'react';
import { getCoalescedPointerEvents } from '../model/whiteboardInteractions';
import { createResponsiveStrokePoints, type WhiteboardStrokeInputState } from '../model/whiteboardStrokeInput';
import type { WhiteboardEraserSample } from '../model/whiteboardEraser';
import type {
  WhiteboardBrushSizes,
  WhiteboardDrawingTool,
  WhiteboardPoint,
  WhiteboardTool,
  WhiteboardViewport,
} from '../model/whiteboardModel';

interface WhiteboardPointerSamplesOptions {
  brushSizes: WhiteboardBrushSizes;
  getBoardPointFromRect: (clientX: number, clientY: number, rect: DOMRectReadOnly) => WhiteboardPoint;
  tool: WhiteboardTool;
  viewport: WhiteboardViewport;
  viewportRef: RefObject<HTMLDivElement | null>;
}

export function useWhiteboardPointerSamples({
  brushSizes,
  getBoardPointFromRect,
  tool,
  viewport,
  viewportRef,
}: WhiteboardPointerSamplesOptions) {
  const strokeInputStateRef = useRef<WhiteboardStrokeInputState | null>(null);

  const collectStrokePoints = useCallback((event: PointerEvent, drawingTool: WhiteboardDrawingTool, rect?: DOMRectReadOnly) => {
    const viewportRect = rect ?? viewportRef.current?.getBoundingClientRect();
    if (!viewportRect) return [];
    const result = createResponsiveStrokePoints(drawingTool, getCoalescedPointerEvents(event).map((coalescedEvent) => ({
      ...(coalescedEvent.pointerType === 'pen' ? getStylusDynamics(coalescedEvent) : {}),
      point: getBoardPointFromRect(coalescedEvent.clientX, coalescedEvent.clientY, viewportRect),
      pointerType: coalescedEvent.pointerType,
      pressure: coalescedEvent.pressure,
      screenPoint: { x: coalescedEvent.clientX, y: coalescedEvent.clientY },
      timeStamp: coalescedEvent.timeStamp,
    })), strokeInputStateRef.current);
    strokeInputStateRef.current = result.state;
    return result.points;
  }, [getBoardPointFromRect, viewportRef]);

  const collectEraserSamples = useCallback((event: PointerEvent, rect?: DOMRectReadOnly): WhiteboardEraserSample[] => {
    const viewportRect = rect ?? viewportRef.current?.getBoundingClientRect();
    if (!viewportRect) return [];
    return getCoalescedPointerEvents(event).map((coalescedEvent) => ({
      point: getBoardPointFromRect(coalescedEvent.clientX, coalescedEvent.clientY, viewportRect),
      size: tool === 'stroke-eraser' ? brushSizes['stroke-eraser'] : 1 / viewport.zoom,
    }));
  }, [brushSizes, getBoardPointFromRect, tool, viewport.zoom, viewportRef]);

  const resetStrokeInput = useCallback(() => {
    strokeInputStateRef.current = null;
  }, []);

  return { collectEraserSamples, collectStrokePoints, resetStrokeInput };
}

function getStylusDynamics(event: globalThis.PointerEvent): {
  azimuth?: number;
  rotation?: number;
  tilt: number;
} {
  const fallback = getTiltFallback(event.tiltX, event.tiltY);
  const altitude = event.altitudeAngle;
  const hasAltitude = Number.isFinite(altitude) && altitude > 0;
  const tilt = hasAltitude
    ? 1 - Math.min(1, altitude / (Math.PI / 2))
    : fallback.tilt;
  const azimuth = tilt > 0
    ? hasAltitude && Number.isFinite(event.azimuthAngle)
      ? normalizeAngle(event.azimuthAngle)
      : fallback.azimuth
    : undefined;
  const rotation = Number.isFinite(event.twist)
    ? normalizeAngle(event.twist * Math.PI / 180)
    : undefined;
  return {
    ...(azimuth !== undefined ? { azimuth } : {}),
    ...(rotation !== undefined ? { rotation } : {}),
    tilt,
  };
}

function getTiltFallback(tiltX: number, tiltY: number): { azimuth?: number; tilt: number } {
  if (tiltX === 0 && tiltY === 0) return { tilt: 0 };
  const axisX = Math.tan(tiltX * Math.PI / 180);
  const axisY = Math.tan(tiltY * Math.PI / 180);
  const tilt = Math.min(1, Math.atan(Math.hypot(axisX, axisY)) / (Math.PI / 2));
  return { azimuth: normalizeAngle(Math.atan2(axisY, axisX)), tilt };
}

function normalizeAngle(angle: number): number {
  const fullTurn = Math.PI * 2;
  return (angle % fullTurn + fullTurn) % fullTurn;
}
