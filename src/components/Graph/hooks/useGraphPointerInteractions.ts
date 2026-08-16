import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type Dispatch,
  type PointerEvent,
  type RefObject,
  type SetStateAction,
} from 'react';
import { logDiagnostic } from '@/lib/diagnostics/diagnosticsLog';
import { themeGraphTokens } from '@/styles/themeTokens';
import {
  createGraphPanVelocity,
  getCurrentGraphPanVelocity,
  sampleGraphPanVelocity,
  type GraphPanVelocity,
} from '../model/graphPanVelocity';
import type { GraphViewport } from '../model/graphViewport';
import type { GraphNodePosition } from '../store/useGraphUIStore';

type DragState =
  | { kind: 'pan'; moved: boolean; pointerId: number; pointerType: string; startClientX: number; startClientY: number; startViewport: GraphViewport; velocity: GraphPanVelocity }
  | { kind: 'node'; id: string; moved: boolean; pointerId: number; pointerType: string; startedAt: number; startClientX: number; startClientY: number; startPosition: GraphNodePosition };

export type GraphPointerInteractionResult = 'node' | 'background' | {
  kind: 'viewport';
  velocity: { x: number; y: number };
};

interface GraphPointerInteractionOptions {
  onDragPosition: (id: string, position: GraphNodePosition) => void;
  onOpenPath: (path: string) => void;
  onPositionCommit: (path: string, position: GraphNodePosition) => void;
  onReleaseDrag: (id: string) => void;
  onSelectPath: (path: string | null) => void;
  setDragPosition: Dispatch<SetStateAction<{ id: string; position: GraphNodePosition } | null>>;
  setViewport: Dispatch<SetStateAction<GraphViewport>>;
  svgRef: RefObject<SVGSVGElement | null>;
  viewport: GraphViewport;
}

function getMovement(drag: DragState, clientX: number, clientY: number) {
  const deltaX = clientX - drag.startClientX;
  const deltaY = clientY - drag.startClientY;
  return {
    deltaX,
    deltaY,
    moved: drag.moved || Math.hypot(deltaX, deltaY) >= (
      drag.pointerType === 'touch'
        ? themeGraphTokens.touchDragThresholdPx
        : themeGraphTokens.pointerDragThresholdPx
    ),
  };
}

function getPointerEventTime(event: { timeStamp?: number }): number {
  const { timeStamp } = event;
  return typeof timeStamp === 'number' && Number.isFinite(timeStamp)
    ? timeStamp
    : performance.now();
}

export function useGraphPointerInteractions(options: GraphPointerInteractionOptions) {
  const optionsRef = useRef(options);
  const dragRef = useRef<DragState | null>(null);
  const viewportRef = useRef(options.viewport);
  const pendingPointRef = useRef<{ eventAt: number; x: number; y: number } | null>(null);
  const frameRef = useRef<number | null>(null);
  optionsRef.current = options;
  viewportRef.current = options.viewport;

  const getNodePosition = useCallback((
    drag: Extract<DragState, { kind: 'node' }>,
    deltaX: number,
    deltaY: number,
  ): GraphNodePosition => ({
    x: drag.startPosition.x + deltaX / viewportRef.current.zoom,
    y: drag.startPosition.y + deltaY / viewportRef.current.zoom,
  }), []);

  const applyPointerPoint = useCallback((clientX: number, clientY: number, eventAt: number) => {
    const drag = dragRef.current;
    if (!drag) return;
    const movement = getMovement(drag, clientX, clientY);
    if (drag.kind === 'pan') {
      dragRef.current = {
        ...drag,
        moved: movement.moved,
        velocity: sampleGraphPanVelocity(drag.velocity, clientX, clientY, eventAt),
      };
      optionsRef.current.setViewport({
        ...drag.startViewport,
        x: drag.startViewport.x + movement.deltaX,
        y: drag.startViewport.y + movement.deltaY,
      });
      return;
    }
    dragRef.current = { ...drag, moved: movement.moved };
    if (!movement.moved) return;
    optionsRef.current.onDragPosition(
      drag.id,
      getNodePosition(drag, movement.deltaX, movement.deltaY),
    );
  }, [getNodePosition]);

  const flushPendingPoint = useCallback(() => {
    frameRef.current = null;
    const point = pendingPointRef.current;
    pendingPointRef.current = null;
    if (point) applyPointerPoint(point.x, point.y, point.eventAt);
  }, [applyPointerPoint]);

  const handlePointerMove = useCallback((event: PointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    pendingPointRef.current = {
      eventAt: getPointerEventTime(event),
      x: event.clientX,
      y: event.clientY,
    };
    if (frameRef.current === null) {
      frameRef.current = window.requestAnimationFrame(flushPendingPoint);
    }
  }, [flushPendingPoint]);

  const finishDrag = useCallback((
    event: PointerEvent<SVGSVGElement>,
  ): GraphPointerInteractionResult | null => {
    const initialDrag = dragRef.current;
    if (!initialDrag || initialDrag.pointerId !== event.pointerId) return null;
    if (frameRef.current !== null) {
      window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    pendingPointRef.current = null;
    const movement = getMovement(initialDrag, event.clientX, event.clientY);
    const drag = { ...initialDrag, moved: movement.moved } as DragState;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (drag.kind === 'node') {
      const finalPosition = getNodePosition(drag, movement.deltaX, movement.deltaY);
      logDiagnostic('graph', 'pointer-drag-release', {
        deltaX: movement.deltaX,
        deltaY: movement.deltaY,
        durationMs: Math.round(performance.now() - drag.startedAt),
        finalPosition,
        id: drag.id,
        moved: drag.moved,
      });
      if (drag.moved) {
        optionsRef.current.onDragPosition(drag.id, finalPosition);
        optionsRef.current.onReleaseDrag(drag.id);
        optionsRef.current.onPositionCommit(drag.id, finalPosition);
      } else {
        optionsRef.current.onReleaseDrag(drag.id);
        optionsRef.current.onOpenPath(drag.id);
      }
      optionsRef.current.setDragPosition(null);
      return 'node';
    }
    if (drag.moved) {
      optionsRef.current.setViewport({
        ...drag.startViewport,
        x: drag.startViewport.x + movement.deltaX,
        y: drag.startViewport.y + movement.deltaY,
      });
      const releasedAt = getPointerEventTime(event);
      const releasedVelocity = drag.velocity.lastClientX === event.clientX
        && drag.velocity.lastClientY === event.clientY
        ? drag.velocity
        : sampleGraphPanVelocity(drag.velocity, event.clientX, event.clientY, releasedAt);
      return {
        kind: 'viewport',
        velocity: getCurrentGraphPanVelocity(releasedVelocity, releasedAt),
      };
    }
    optionsRef.current.onSelectPath(null);
    return 'background';
  }, [getNodePosition]);

  const cancelCurrentInteraction = useCallback((preserveViewport = false) => {
    if (frameRef.current !== null) {
      window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    pendingPointRef.current = null;
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;
    const currentOptions = optionsRef.current;
    const svg = currentOptions.svgRef.current;
    if (svg?.hasPointerCapture?.(drag.pointerId)) svg.releasePointerCapture(drag.pointerId);
    if (drag.kind === 'node') {
      if (drag.moved) currentOptions.onDragPosition(drag.id, drag.startPosition);
      currentOptions.onReleaseDrag(drag.id);
      currentOptions.setDragPosition(null);
      return;
    }
    if (!preserveViewport) currentOptions.setViewport(drag.startViewport);
  }, []);

  const discardCurrentInteraction = useCallback(() => {
    if (frameRef.current !== null) {
      window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    pendingPointRef.current = null;
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return null;
    const svg = optionsRef.current.svgRef.current;
    if (svg?.hasPointerCapture?.(drag.pointerId)) svg.releasePointerCapture(drag.pointerId);
    return drag.kind === 'node'
      ? { id: drag.id, moved: drag.moved, startPosition: drag.startPosition }
      : null;
  }, []);

  const cancelDrag = useCallback((event: PointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (drag && drag.pointerId !== event.pointerId) return false;
    cancelCurrentInteraction();
    return true;
  }, [cancelCurrentInteraction]);

  const startPan = useCallback((event: PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0 && event.button !== 1) return;
    if (dragRef.current) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const eventAt = getPointerEventTime(event);
    dragRef.current = {
      kind: 'pan',
      moved: false,
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startViewport: viewportRef.current,
      velocity: createGraphPanVelocity(event.clientX, event.clientY, eventAt),
    };
  }, []);

  const startNodeDrag = useCallback((
    event: PointerEvent<SVGGElement>,
    id: string,
    position: GraphNodePosition,
  ) => {
    if (event.button !== 0 || dragRef.current) return;
    event.stopPropagation();
    const currentOptions = optionsRef.current;
    currentOptions.svgRef.current?.setPointerCapture(event.pointerId);
    const startPosition = { x: position.x, y: position.y };
    logDiagnostic('graph', 'pointer-drag-start', {
      clientX: event.clientX,
      clientY: event.clientY,
      id,
      position: startPosition,
      zoom: viewportRef.current.zoom,
    });
    currentOptions.setDragPosition({ id, position: startPosition });
    dragRef.current = {
      kind: 'node',
      id,
      moved: false,
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      startedAt: performance.now(),
      startClientX: event.clientX,
      startClientY: event.clientY,
      startPosition,
    };
  }, []);

  useEffect(() => () => {
    if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
  }, []);

  return useMemo(() => ({
    cancelDrag,
    cancelCurrentInteraction,
    discardCurrentInteraction,
    finishDrag,
    getDraggedNodeId: () => dragRef.current?.kind === 'node' ? dragRef.current.id : null,
    hasCurrentInteraction: () => dragRef.current !== null,
    handlePointerMove,
    startNodeDrag,
    startPan,
  }), [
    cancelCurrentInteraction,
    cancelDrag,
    discardCurrentInteraction,
    finishDrag,
    handlePointerMove,
    startNodeDrag,
    startPan,
  ]);
}
