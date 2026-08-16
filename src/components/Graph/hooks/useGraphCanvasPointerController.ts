import {
  useCallback,
  useEffect,
  type Dispatch,
  type PointerEvent,
  type RefObject,
  type SetStateAction,
} from 'react';
import type { GraphViewport } from '../model/graphViewport';
import type { GraphNodePosition } from '../store/useGraphUIStore';
import { useGraphPinchZoom } from './useGraphPinchZoom';
import { useGraphPointerInteractions } from './useGraphPointerInteractions';

interface ViewportController {
  cancelViewportWork: () => void;
  getViewport: () => GraphViewport;
  setViewport: Dispatch<SetStateAction<GraphViewport>>;
  startPanInertia: (velocity: { x: number; y: number }) => boolean;
  viewport: GraphViewport;
}

export function useGraphCanvasPointerController(args: {
  active: boolean;
  clearPointerHover: (path: string | null) => void;
  getNodePosition: (path: string, fallback: GraphNodePosition) => GraphNodePosition;
  handleHoverPointerMove: (event: PointerEvent<SVGSVGElement>) => void;
  onDragPosition: (id: string, position: GraphNodePosition) => void;
  onOpenPath: (path: string) => void;
  onPositionCommit: (path: string, position: GraphNodePosition) => void;
  onReleaseDrag: (id: string) => void;
  onSelectPath: (path: string | null) => void;
  onViewportSettled: () => void;
  setDragPosition: Dispatch<SetStateAction<{ id: string; position: GraphNodePosition } | null>>;
  svgRef: RefObject<SVGSVGElement | null>;
  userPositionedViewportRef: { current: boolean };
  viewportController: ViewportController;
}) {
  const {
    cancelViewportWork,
    getViewport,
    setViewport,
    startPanInertia,
    viewport,
  } = args.viewportController;
  const pointer = useGraphPointerInteractions({
    onDragPosition: args.onDragPosition,
    onOpenPath: args.onOpenPath,
    onPositionCommit: args.onPositionCommit,
    onReleaseDrag: args.onReleaseDrag,
    onSelectPath: args.onSelectPath,
    setDragPosition: args.setDragPosition,
    setViewport,
    svgRef: args.svgRef,
    viewport,
  });

  const beginUserAction = useCallback(() => {
    args.userPositionedViewportRef.current = true;
    cancelViewportWork();
  }, [args.userPositionedViewportRef, cancelViewportWork]);

  const pinch = useGraphPinchZoom({
    getViewport,
    onPinchStart: () => {
      beginUserAction();
      pointer.cancelCurrentInteraction(true);
    },
    setViewport,
    svgRef: args.svgRef,
  });

  const startNodeDrag = useCallback((
    event: PointerEvent<SVGGElement>,
    path: string,
    position: GraphNodePosition,
  ) => {
    beginUserAction();
    if (pinch.handlePointerDown(event)) {
      event.stopPropagation();
      return;
    }
    pointer.startNodeDrag(event, path, args.getNodePosition(path, position));
  }, [args.getNodePosition, beginUserAction, pinch.handlePointerDown, pointer.startNodeDrag]);

  const startPan = useCallback((event: PointerEvent<SVGSVGElement>) => {
    if (event.button === 0 || event.button === 1 || event.pointerType === 'touch') {
      beginUserAction();
    }
    if (pinch.handlePointerDown(event)) return;
    pointer.startPan(event);
  }, [beginUserAction, pinch.handlePointerDown, pointer.startPan]);

  const handlePointerMove = useCallback((event: PointerEvent<SVGSVGElement>) => {
    if (!pinch.handlePointerMove(event)) pointer.handlePointerMove(event);
    args.handleHoverPointerMove(event);
  }, [args.handleHoverPointerMove, pinch.handlePointerMove, pointer.handlePointerMove]);

  const finishPointerInteraction = useCallback((event: PointerEvent<SVGSVGElement>) => {
    if (pinch.handlePointerEnd(event)) {
      args.clearPointerHover(null);
      args.onViewportSettled();
      return;
    }
    if (!pointer.hasCurrentInteraction()) return;
    const draggedNodeId = pointer.getDraggedNodeId();
    const result = pointer.finishDrag(event);
    if (result) args.clearPointerHover(draggedNodeId);
    if (result && typeof result === 'object' && !startPanInertia(result.velocity)) {
      args.onViewportSettled();
    }
  }, [
    args.clearPointerHover,
    args.onViewportSettled,
    pinch.handlePointerEnd,
    pointer,
    startPanInertia,
  ]);

  const cancelPointerInteraction = useCallback((event: PointerEvent<SVGSVGElement>) => {
    if (pinch.handlePointerCancel(event)) {
      return;
    }
    if (!pointer.hasCurrentInteraction()) return;
    const draggedNodeId = pointer.getDraggedNodeId();
    if (pointer.cancelDrag(event)) args.clearPointerHover(draggedNodeId);
  }, [args.clearPointerHover, pinch.handlePointerCancel, pointer]);

  const cancelAll = useCallback(() => {
    const draggedNodeId = pointer.getDraggedNodeId();
    pinch.cancelPinch();
    pointer.cancelCurrentInteraction();
    args.clearPointerHover(draggedNodeId);
  }, [args.clearPointerHover, pinch.cancelPinch, pointer]);

  useEffect(() => {
    if (!args.active) cancelAll();
  }, [args.active, cancelAll]);

  useEffect(() => {
    const cancelHiddenInteraction = () => {
      if (document.visibilityState === 'hidden') cancelAll();
    };
    document.addEventListener('visibilitychange', cancelHiddenInteraction);
    return () => document.removeEventListener('visibilitychange', cancelHiddenInteraction);
  }, [cancelAll]);

  const discardCurrentInteraction = useCallback(() => {
    pinch.cancelPinch();
    return pointer.discardCurrentInteraction();
  }, [pinch.cancelPinch, pointer.discardCurrentInteraction]);

  return {
    cancelPointerInteraction,
    discardCurrentInteraction,
    finishPointerInteraction,
    handlePointerMove,
    startNodeDrag,
    startPan,
  };
}
