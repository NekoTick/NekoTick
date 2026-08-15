import { useCallback, type Dispatch, type RefObject, type SetStateAction, type WheelEvent } from 'react';
import { themeWhiteboardTokens } from '@/styles/themeTokens';
import type { WhiteboardDragState } from '../model/whiteboardInteractions';
import {
  WHITEBOARD_INITIAL_VIEWPORT,
  clampWhiteboardZoom,
  isStrokeTool,
  zoomViewportAtPoint,
  type WhiteboardStrokeTool,
  type WhiteboardElement,
  type WhiteboardPoint,
  type WhiteboardStroke,
  type WhiteboardTool,
  type WhiteboardViewport,
} from '../model/whiteboardModel';
import { fitViewportToContent } from '../model/whiteboardViewport';

interface WhiteboardBoardActionsOptions {
  clearDraftStroke: () => void;
  elements: WhiteboardElement[];
  pushHistory: () => void;
  redo: () => void;
  resizeBrush: (tool: WhiteboardStrokeTool, deltaY: number) => void;
  setDragState: Dispatch<SetStateAction<WhiteboardDragState | null>>;
  setDraftStroke: (stroke: WhiteboardStroke | null) => void;
  setElements: Dispatch<SetStateAction<WhiteboardElement[]>>;
  setSelectedElementId: Dispatch<SetStateAction<string | null>>;
  setSelectedStrokeIds: Dispatch<SetStateAction<string[]>>;
  setStrokes: Dispatch<SetStateAction<WhiteboardStroke[]>>;
  scheduleViewport: Dispatch<SetStateAction<WhiteboardViewport>>;
  setViewport: Dispatch<SetStateAction<WhiteboardViewport>>;
  spacePressedRef: RefObject<boolean>;
  strokes: WhiteboardStroke[];
  tool: WhiteboardTool;
  undo: () => void;
  getViewportPoint: (clientX: number, clientY: number) => WhiteboardPoint;
  viewportRef: RefObject<HTMLDivElement | null>;
}

export function useWhiteboardBoardActions(options: WhiteboardBoardActionsOptions) {
  const resetSelection = useCallback(() => {
    options.setSelectedStrokeIds([]);
    options.setSelectedElementId(null);
  }, [options]);

  const updateZoom = useCallback((delta: number) => {
    options.setViewport((current) => ({ ...current, zoom: clampWhiteboardZoom(current.zoom + delta) }));
  }, [options]);

  const handleWheel = useCallback((event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const point = options.getViewportPoint(event.clientX, event.clientY);
    if (event.ctrlKey || event.metaKey) {
      options.scheduleViewport((current) => zoomViewportAtPoint(current, point, current.zoom * (1 - event.deltaY * themeWhiteboardTokens.wheelZoomIntensity)));
      return;
    }
    if (isStrokeTool(options.tool) && !options.spacePressedRef.current) {
      options.resizeBrush(options.tool, event.deltaY);
      return;
    }
    options.scheduleViewport((current) => ({ ...current, x: current.x - event.deltaX, y: current.y - event.deltaY }));
  }, [options]);

  const handleUndo = useCallback(() => {
    options.clearDraftStroke();
    options.setDragState(null);
    resetSelection();
    options.undo();
  }, [options, resetSelection]);

  const handleRedo = useCallback(() => {
    options.clearDraftStroke();
    options.setDragState(null);
    resetSelection();
    options.redo();
  }, [options, resetSelection]);

  const clearBoard = useCallback(() => {
    if (options.elements.length > 0 || options.strokes.length > 0) options.pushHistory();
    options.setElements([]);
    options.setStrokes([]);
    options.setDraftStroke(null);
    resetSelection();
  }, [options, resetSelection]);

  const fitView = useCallback(() => {
    const rect = options.viewportRef.current?.getBoundingClientRect();
    const viewportSize = { x: rect?.width ?? 0, y: rect?.height ?? 0 };
    options.setViewport(fitViewportToContent(options.elements, options.strokes, viewportSize));
  }, [options]);

  const resetView = useCallback(() => {
    options.setViewport(WHITEBOARD_INITIAL_VIEWPORT);
  }, [options]);

  return {
    clearBoard,
    handleRedo,
    handleUndo,
    handleWheel,
    fitView,
    resetView,
    updateZoom,
  };
}
