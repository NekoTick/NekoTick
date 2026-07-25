import {
  useCallback,
  useEffect,
  useRef,
  type Dispatch,
  type MutableRefObject,
  type PointerEvent,
  type RefObject,
  type SetStateAction,
} from 'react';
import {
  getWhiteboardMovePreview,
  isWhiteboardMoveDragState,
  type WhiteboardDragState,
} from '../model/whiteboardInteractions';
import type { WhiteboardEraserSample } from '../model/whiteboardEraser';
import {
  clampWhiteboardZoom,
  isBrushTool,
  isDrawingTool,
  screenPointToBoardPoint,
  type WhiteboardBrushColors,
  type WhiteboardBrushSizes,
  type WhiteboardDrawingTool,
  type WhiteboardPoint,
  type WhiteboardStroke,
  type WhiteboardStrokePoint,
  type WhiteboardTool,
  type WhiteboardViewport,
} from '../model/whiteboardModel';
import { getStrokePointMinDistance } from '../model/whiteboardStrokeGeometry';
import {
  useWhiteboardLassoDragScheduler,
  useWhiteboardMoveDragScheduler,
} from './useWhiteboardMoveDragScheduler';
import { useWhiteboardPointerSamples } from './useWhiteboardPointerSamples';

interface WhiteboardPointerActionsOptions {
  activePenPointerRef: MutableRefObject<number | null>;
  addPointer: (pointerId: number, clientX: number, clientY: number) => WhiteboardPoint;
  appendDraftPoints: (tool: WhiteboardDrawingTool, points: WhiteboardStrokePoint[], minDistance?: number) => void;
  brushColors: WhiteboardBrushColors;
  brushSizes: WhiteboardBrushSizes;
  clearDraftStroke: () => void;
  dragState: WhiteboardDragState | null;
  getBoardPointFromRect: (clientX: number, clientY: number, rect: DOMRectReadOnly) => WhiteboardPoint;
  getPinchMetrics: () => { center: WhiteboardPoint; distance: number } | null;
  eraserActions: {
    begin: (points: WhiteboardEraserSample[]) => void;
    update: (points: WhiteboardEraserSample[]) => void;
  };
  strokeEraserActions: {
    begin: (points: WhiteboardEraserSample[]) => void;
    update: (points: WhiteboardEraserSample[]) => void;
  };
  resizeSelection: (state: Extract<WhiteboardDragState, { kind: 'resize-selection' }>, point: WhiteboardPoint) => void;
  scheduleViewport: (update: SetStateAction<WhiteboardViewport>) => void;
  setBrushCursorPoint: (point: WhiteboardPoint | null) => void;
  setDragState: Dispatch<SetStateAction<WhiteboardDragState | null>>;
  setDraftStroke: (stroke: WhiteboardStroke | null) => void;
  setSelectedElementId: Dispatch<SetStateAction<string | null>>;
  setSelectedStrokeIds: Dispatch<SetStateAction<string[]>>;
  spacePressedRef: MutableRefObject<boolean>;
  startStrokeSelection: (point: WhiteboardPoint, event: PointerEvent<HTMLDivElement>) => void;
  strokeIdRef: MutableRefObject<number>;
  tool: WhiteboardTool;
  updatePointer: (pointerId: number, clientX: number, clientY: number) => WhiteboardPoint | null;
  viewport: WhiteboardViewport;
  viewportRef: RefObject<HTMLDivElement | null>;
}

export function useWhiteboardPointerActions({
  activePenPointerRef,
  addPointer,
  appendDraftPoints,
  brushColors,
  brushSizes,
  clearDraftStroke,
  dragState,
  eraserActions,
  getBoardPointFromRect,
  getPinchMetrics,
  resizeSelection,
  scheduleViewport,
  setBrushCursorPoint,
  setDragState,
  setDraftStroke,
  setSelectedElementId,
  setSelectedStrokeIds,
  spacePressedRef,
  startStrokeSelection,
  strokeEraserActions,
  strokeIdRef,
  tool,
  updatePointer,
  viewport,
  viewportRef,
}: WhiteboardPointerActionsOptions) {
  const activePointerRectRef = useRef<DOMRectReadOnly | null>(null);
  const scheduleMoveDragPoint = useWhiteboardMoveDragScheduler(setDragState);
  const scheduleLassoPoint = useWhiteboardLassoDragScheduler(setDragState);
  const { collectEraserSamples, collectStrokePoints, resetStrokeInput } = useWhiteboardPointerSamples({
    brushSizes, getBoardPointFromRect, tool, viewport, viewportRef,
  });

  useEffect(() => {
    const viewportElement = viewportRef.current;
    if (!viewportElement || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(() => {
      activePointerRectRef.current = null;
    });
    observer.observe(viewportElement);
    return () => observer.disconnect();
  }, [viewportRef]);

  const startPan = useCallback((event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragState({
      kind: 'pan',
      startClientX: event.clientX,
      startClientY: event.clientY,
      startViewport: viewport,
    });
  }, [setDragState, viewport]);

  const startPinch = useCallback(() => {
    const metrics = getPinchMetrics();
    if (!metrics) return false;
    clearDraftStroke();
    setDragState({
      kind: 'pinch',
      startCenter: metrics.center,
      startDistance: metrics.distance,
      startViewport: viewport,
    });
    return true;
  }, [clearDraftStroke, getPinchMetrics, setDragState, viewport]);

  const handleViewportPointerDown = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 && event.button !== 1) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    activePointerRectRef.current = viewportRef.current?.getBoundingClientRect() ?? null;
    if (event.pointerType === 'touch') addPointer(event.pointerId, event.clientX, event.clientY);
    if (event.pointerType === 'pen') activePenPointerRef.current = event.pointerId;
    if (event.pointerType === 'touch' && activePenPointerRef.current !== null) return;
    if (event.pointerType === 'touch' && startPinch()) return;
    if (event.button === 1 || tool === 'hand' || spacePressedRef.current) {
      startPan(event);
      return;
    }
    if (event.pointerType === 'touch' && (isBrushTool(tool) || tool === 'eraser')) {
      startPan(event);
      return;
    }
    const rect = activePointerRectRef.current ?? viewportRef.current?.getBoundingClientRect();
    const point = rect ? getBoardPointFromRect(event.clientX, event.clientY, rect) : { x: 0, y: 0 };
    if (isDrawingTool(tool) && event.button === 0) {
      setSelectedElementId(null);
      setSelectedStrokeIds([]);
      resetStrokeInput();
      setDraftStroke({
        color: brushColors[tool],
        id: `wb-stroke-${strokeIdRef.current}`,
        points: collectStrokePoints(event, tool, rect ?? undefined),
        size: brushSizes[tool],
        tool,
      });
      setDragState({ kind: 'draw' });
      return;
    }
    if ((tool === 'eraser' || tool === 'stroke-eraser') && event.button === 0) {
      setSelectedStrokeIds([]);
      setSelectedElementId(null);
      const samples = collectEraserSamples(event, rect ?? undefined);
      if (tool === 'eraser') eraserActions.begin(samples);
      else strokeEraserActions.begin(samples);
      setDragState({ kind: 'draw' });
      return;
    }
    if (tool === 'select') {
      startStrokeSelection(point, event);
      return;
    }
  }, [
    activePenPointerRef, brushColors, brushSizes, collectEraserSamples, collectStrokePoints,
    addPointer, eraserActions, getBoardPointFromRect, setDraftStroke, setDragState,
    resetStrokeInput, setSelectedElementId, setSelectedStrokeIds, spacePressedRef, startPan, startPinch,
    startStrokeSelection, strokeEraserActions, strokeIdRef, tool, viewportRef,
  ]);

  const handlePointerMove = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'touch') updatePointer(event.pointerId, event.clientX, event.clientY);
    if (!activePointerRectRef.current) activePointerRectRef.current = viewportRef.current?.getBoundingClientRect() ?? null;
    const rect = activePointerRectRef.current;
    const point = rect ? getBoardPointFromRect(event.clientX, event.clientY, rect) : { x: 0, y: 0 };
    if (!dragState || dragState.kind === 'draw') setBrushCursorPoint(point);
    if (!dragState) return;
    if (dragState.kind === 'pinch') {
      const metrics = getPinchMetrics();
      if (!metrics) return;
      const boardPoint = screenPointToBoardPoint(dragState.startCenter, dragState.startViewport);
      const nextZoom = clampWhiteboardZoom(dragState.startViewport.zoom * (metrics.distance / dragState.startDistance));
      scheduleViewport({
        x: Math.round((metrics.center.x - boardPoint.x * nextZoom) * 100) / 100,
        y: Math.round((metrics.center.y - boardPoint.y * nextZoom) * 100) / 100,
        zoom: nextZoom,
      });
      return;
    }
    if (dragState.kind === 'pan') {
      scheduleViewport({
        ...dragState.startViewport,
        x: dragState.startViewport.x + event.clientX - dragState.startClientX,
        y: dragState.startViewport.y + event.clientY - dragState.startClientY,
      });
      return;
    }
    if (dragState.kind === 'draw') {
      if (tool === 'eraser' || tool === 'stroke-eraser') {
        const samples = collectEraserSamples(event, rect ?? undefined);
        if (tool === 'eraser') eraserActions.update(samples);
        else strokeEraserActions.update(samples);
        return;
      }
      if (isDrawingTool(tool)) {
        appendDraftPoints(tool, collectStrokePoints(event, tool, rect ?? undefined), getStrokePointMinDistance(viewport.zoom));
      }
      return;
    }
    if (dragState.kind === 'lasso') {
      scheduleLassoPoint(point, viewport.zoom);
      return;
    }
    if (dragState.kind === 'resize-selection') {
      resizeSelection(dragState, point);
      return;
    }
    if (isWhiteboardMoveDragState(dragState)) {
      scheduleMoveDragPoint(point);
      return;
    }
  }, [
    appendDraftPoints, collectEraserSamples, collectStrokePoints, dragState, eraserActions, getBoardPointFromRect,
    getPinchMetrics, resizeSelection, scheduleLassoPoint, scheduleMoveDragPoint,
    scheduleViewport, setBrushCursorPoint, setDragState, strokeEraserActions, tool, updatePointer, viewport.zoom,
    viewportRef,
  ]);

  return {
    handlePointerMove,
    handleViewportPointerDown,
    isPanning: dragState?.kind === 'pan',
    movePreview: getWhiteboardMovePreview(dragState),
    selectionPath: dragState?.kind === 'lasso' ? dragState.points : null,
  };
}
