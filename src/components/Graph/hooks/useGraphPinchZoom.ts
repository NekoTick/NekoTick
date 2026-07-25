import {
  useCallback,
  useEffect,
  useRef,
  type Dispatch,
  type PointerEvent,
  type RefObject,
  type SetStateAction,
} from 'react';
import {
  zoomGraphViewportAtPoint,
  type GraphViewport,
} from '../model/graphViewport';

type PointerPoint = { x: number; y: number };

interface PinchState {
  pointerIds: [number, number];
  rect: { left: number; top: number };
  startCenter: PointerPoint;
  startDistance: number;
  startViewport: GraphViewport;
}

function getCenter(first: PointerPoint, second: PointerPoint): PointerPoint {
  return { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
}

function getDistance(first: PointerPoint, second: PointerPoint): number {
  return Math.max(1, Math.hypot(first.x - second.x, first.y - second.y));
}

export function useGraphPinchZoom(args: {
  getViewport: () => GraphViewport;
  onPinchStart: () => void;
  setViewport: Dispatch<SetStateAction<GraphViewport>>;
  svgRef: RefObject<SVGSVGElement | null>;
}) {
  const argsRef = useRef(args);
  const pointersRef = useRef(new Map<number, PointerPoint>());
  const pinchRef = useRef<PinchState | null>(null);
  const frameRef = useRef<number | null>(null);
  argsRef.current = args;

  const applyPinch = useCallback(() => {
    frameRef.current = null;
    const pinch = pinchRef.current;
    if (!pinch) return;
    const first = pointersRef.current.get(pinch.pointerIds[0]);
    const second = pointersRef.current.get(pinch.pointerIds[1]);
    if (!first || !second) return;
    const center = getCenter(first, second);
    const zoomed = zoomGraphViewportAtPoint(
      pinch.startViewport,
      {
        x: pinch.startCenter.x - pinch.rect.left,
        y: pinch.startCenter.y - pinch.rect.top,
      },
      pinch.startViewport.zoom * getDistance(first, second) / pinch.startDistance,
    );
    argsRef.current.setViewport({
      ...zoomed,
      x: zoomed.x + center.x - pinch.startCenter.x,
      y: zoomed.y + center.y - pinch.startCenter.y,
    });
  }, []);

  const handlePointerDown = useCallback((
    event: PointerEvent<SVGSVGElement | SVGGElement>,
  ): boolean => {
    if (event.pointerType !== 'touch') return false;
    if (pinchRef.current) return true;
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointersRef.current.size < 2) return false;
    const entries = [...pointersRef.current.entries()].slice(0, 2);
    const [firstId, first] = entries[0]!;
    const [secondId, second] = entries[1]!;
    argsRef.current.onPinchStart();
    const svg = argsRef.current.svgRef.current;
    if (!svg) return false;
    svg.setPointerCapture?.(firstId);
    svg.setPointerCapture?.(secondId);
    const rect = svg.getBoundingClientRect();
    pinchRef.current = {
      pointerIds: [firstId, secondId],
      rect: { left: rect.left, top: rect.top },
      startCenter: getCenter(first, second),
      startDistance: getDistance(first, second),
      startViewport: argsRef.current.getViewport(),
    };
    return true;
  }, []);

  const handlePointerMove = useCallback((event: PointerEvent<SVGSVGElement>): boolean => {
    if (!pointersRef.current.has(event.pointerId)) return false;
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const pinch = pinchRef.current;
    if (!pinch || !pinch.pointerIds.includes(event.pointerId)) return false;
    if (frameRef.current === null) {
      frameRef.current = window.requestAnimationFrame(applyPinch);
    }
    return true;
  }, [applyPinch]);

  const handlePointerEnd = useCallback((event: PointerEvent<SVGSVGElement>): boolean => {
    const pinch = pinchRef.current;
    if (!pinch || !pinch.pointerIds.includes(event.pointerId)) {
      pointersRef.current.delete(event.pointerId);
      return false;
    }
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
    applyPinch();
    const svg = argsRef.current.svgRef.current;
    pinch.pointerIds.forEach((pointerId) => {
      if (svg?.hasPointerCapture?.(pointerId)) svg.releasePointerCapture(pointerId);
    });
    pinchRef.current = null;
    pointersRef.current.clear();
    return true;
  }, [applyPinch]);

  const cancelPinch = useCallback(() => {
    if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    const svg = argsRef.current.svgRef.current;
    pinchRef.current?.pointerIds.forEach((pointerId) => {
      if (svg?.hasPointerCapture?.(pointerId)) svg.releasePointerCapture(pointerId);
    });
    pinchRef.current = null;
    pointersRef.current.clear();
  }, []);

  const handlePointerCancel = useCallback((event: PointerEvent<SVGSVGElement>): boolean => {
    const pinch = pinchRef.current;
    if (!pinch || !pinch.pointerIds.includes(event.pointerId)) {
      pointersRef.current.delete(event.pointerId);
      return false;
    }
    cancelPinch();
    return true;
  }, [cancelPinch]);

  useEffect(() => cancelPinch, [cancelPinch]);

  return {
    cancelPinch,
    handlePointerDown,
    handlePointerCancel,
    handlePointerEnd,
    handlePointerMove,
  };
}
