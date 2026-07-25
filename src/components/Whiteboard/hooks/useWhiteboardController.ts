import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { useWhiteboardBoardActions } from './useWhiteboardBoardActions';
import { useWhiteboardBrushCursor } from './useWhiteboardBrushCursor';
import { useWhiteboardBrushSizes } from './useWhiteboardBrushSizes';
import { useWhiteboardClipboard } from './useWhiteboardClipboard';
import { useWhiteboardCoordinates } from './useWhiteboardCoordinates';
import { useWhiteboardDraftStroke } from './useWhiteboardDraftStroke';
import { useWhiteboardElementControls } from './useWhiteboardElementControls';
import { useWhiteboardEraserGesture } from './useWhiteboardEraserGesture';
import { useWhiteboardEscapeKey } from './useWhiteboardEscapeKey';
import { useWhiteboardExport } from './useWhiteboardExport';
import { useWhiteboardHistory } from './useWhiteboardHistory';
import { useWhiteboardImageImport } from './useWhiteboardImageImport';
import { useWhiteboardKeyboardShortcuts } from './useWhiteboardKeyboardShortcuts';
import { useWhiteboardPersistence } from './useWhiteboardPersistence';
import { useWhiteboardPointerActions } from './useWhiteboardPointerActions';
import { useWhiteboardPointerFinish } from './useWhiteboardPointerFinish';
import { useWhiteboardReady } from './useWhiteboardReady';
import { useWhiteboardSelectionDeletion } from './useWhiteboardSelectionDeletion';
import { useWhiteboardSpacePan } from './useWhiteboardSpacePan';
import { useWhiteboardStrokeSelection } from './useWhiteboardStrokeSelection';
import { useWhiteboardStrokeEraserGesture } from './useWhiteboardStrokeEraserGesture';
import { useWhiteboardStorageBridge } from './useWhiteboardStorageBridge';
import { useWhiteboardTouchPointers } from './useWhiteboardTouchPointers';
import { useWhiteboardViewportScheduler } from './useWhiteboardViewportScheduler';
import { getNextWhiteboardIdSequence } from '../model/whiteboardIds';
import { useWhiteboardStore } from '../stores/useWhiteboardStore';
import type { WhiteboardDragState } from '../model/whiteboardInteractions';
import { createWhiteboardEraserSpatialIndex } from '../model/whiteboardEraser';
import {
  WHITEBOARD_DEFAULT_PAPER_STYLE, WHITEBOARD_INITIAL_VIEWPORT, WHITEBOARD_SEED_ELEMENTS, WHITEBOARD_SEED_STROKES,
  isBrushTool,
  isDrawingTool,
  type WhiteboardBrushTool, type WhiteboardElement,
  type WhiteboardPaperStyle, type WhiteboardStroke, type WhiteboardTool,
} from '../model/whiteboardModel';

interface WhiteboardControllerOptions {
  active: boolean; onPrimaryContentReady?: () => void; onStartupReady?: () => void;
}

export function useWhiteboardController({
  active,
  onPrimaryContentReady,
  onStartupReady,
}: WhiteboardControllerOptions) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const activeBoardId = useWhiteboardStore((state) => state.activeBoardId);
  const appliedBoardKeyRef = useRef<string | null>(null);
  const activePenPointerRef = useRef<number | null>(null);
  const strokeIdRef = useRef(getNextWhiteboardIdSequence(WHITEBOARD_SEED_STROKES, 'wb-stroke-'));
  const { brushColors, brushSizes, resizeBrush, setBrushColor, setBrushSize } = useWhiteboardBrushSizes();
  const { appendDraftPoints, clearDraftStroke, draftStroke, getDraftStroke, setDraftStroke } = useWhiteboardDraftStroke();
  const { spacePressed, spacePressedRef } = useWhiteboardSpacePan(active);
  const [tool, setTool] = useState<WhiteboardTool>('select');
  const [viewport, setViewport] = useState(WHITEBOARD_INITIAL_VIEWPORT);
  const [elements, setElements] = useState<WhiteboardElement[]>(WHITEBOARD_SEED_ELEMENTS);
  const [strokes, setStrokes] = useState<WhiteboardStroke[]>(WHITEBOARD_SEED_STROKES);
  const [paperStyle, setPaperStyle] = useState<WhiteboardPaperStyle>(WHITEBOARD_DEFAULT_PAPER_STYLE);
  const scheduleViewport = useWhiteboardViewportScheduler(setViewport);
  const [selectedElementIds, setSelectedElementIds] = useState<string[]>([]);
  const setSelectedElementId = useCallback<Dispatch<SetStateAction<string | null>>>((value) => setSelectedElementIds((current) => { const id = typeof value === 'function' ? value(current[0] ?? null) : value; return id ? [id] : []; }), []);
  const [selectedStrokeIds, setSelectedStrokeIds] = useState<string[]>([]);
  const [dragState, setDragState] = useState<WhiteboardDragState | null>(null);
  const { brushCursorPoint, setBrushCursorPoint } = useWhiteboardBrushCursor();
  const { canRedo, canUndo, pushHistory, redo, undo } = useWhiteboardHistory({ active, elements, historyKey: activeBoardId, paper: paperStyle, setElements, setPaper: setPaperStyle, setStrokes, strokes });
  const spatialSourcesRef = useRef({ elements, strokes });
  const [spatialIndex, setSpatialIndex] = useState(() => createWhiteboardEraserSpatialIndex(elements, strokes));
  useEffect(() => {
    if (dragState !== null || (spatialSourcesRef.current.elements === elements && spatialSourcesRef.current.strokes === strokes)) return;
    spatialSourcesRef.current = { elements, strokes };
    setSpatialIndex(createWhiteboardEraserSpatialIndex(elements, strokes));
  }, [dragState, elements, strokes]);
  const strokeEraser = useWhiteboardStrokeEraserGesture({ pushHistory, setStrokes, spatialIndex, strokes });
  const renderedStrokes = strokeEraser.preview ?? strokes;
  const eraser = useWhiteboardEraserGesture({ elements, pushHistory, setElements, setStrokes, spatialIndex, strokes });
  useWhiteboardStorageBridge({
    active, appliedBoardKeyRef, setElements, setPaper: setPaperStyle,
    setSelectedElementIds, setSelectedStrokeIds, setStrokes, setViewport, strokeIdRef,
  });
  useWhiteboardReady(onStartupReady, onPrimaryContentReady);
  useWhiteboardPersistence(
    { elements, paper: paperStyle, strokes, viewport },
    !active || dragState !== null,
  );
  useWhiteboardSelectionDeletion({
    active, pushHistory, selectedElementIds, selectedStrokeIds, setElements, setSelectedElementIds, setSelectedStrokeIds, setStrokes,
  });
  useWhiteboardEscapeKey({ active, cancelEraserGesture: () => { eraser.finish(true); strokeEraser.finish(true); }, clearDraftStroke, setDragState, setSelectedElementId, setSelectedStrokeIds, setTool });
  const { getBoardPoint, getBoardPointFromRect, getViewportPoint } = useWhiteboardCoordinates(viewport, viewportRef);
  const { addPointer, deletePointer, getPinchMetrics, updatePointer } = useWhiteboardTouchPointers(getViewportPoint);
  const { flushResizeDrags, handleElementPointerDown, handleSelectionMovePointerDown, handleSelectionResizePointerDown, resizeSelection, selectElement } = useWhiteboardElementControls({
    elements, getBoardPoint, pushHistory, selectedElementIds, selectedStrokeIds, setDragState, setElements, setSelectedElementIds, setSelectedStrokeIds, setStrokes, spacePressedRef, strokes, tool,
  });
  const handlePaperStyleChange = useCallback((nextPaperStyle: WhiteboardPaperStyle) => {
    if (nextPaperStyle === paperStyle) return;
    pushHistory();
    setPaperStyle(nextPaperStyle);
  }, [paperStyle, pushHistory]);
  const boardActionOptions = useMemo(() => ({
    clearDraftStroke, elements, getViewportPoint, pushHistory, redo, resizeBrush,
    scheduleViewport, setDragState, setDraftStroke, setElements,
    setSelectedElementId, setSelectedStrokeIds, setStrokes, setViewport, spacePressedRef, strokes, tool, undo, viewportRef,
  }), [
    clearDraftStroke, elements, getViewportPoint, pushHistory, redo, resizeBrush,
    scheduleViewport, setDragState, setDraftStroke, setElements,
    setSelectedElementId, setSelectedStrokeIds, setStrokes, setViewport, spacePressedRef, strokes, tool, undo,
    viewportRef,
  ]);
  const boardActions = useWhiteboardBoardActions(boardActionOptions);
  const { copyBoardToClipboard, exportBoard } = useWhiteboardExport({ elements, paper: paperStyle, strokes, viewportRef });
  const importImage = useWhiteboardImageImport({ pushHistory, setElements, setSelectedElementId, setSelectedStrokeIds, setTool, viewport, viewportRef });
  const clipboard = useWhiteboardClipboard({
    active, elements, importImage, pushHistory, selectedElementIds, selectedStrokeIds,
    setElements, setSelectedElementIds, setSelectedStrokeIds, setStrokes, setTool, strokes,
  });
  const startStrokeSelection = useWhiteboardStrokeSelection({ elements, pushHistory, selectedElementIds, selectedStrokeIds, setDragState, setSelectedElementId, setSelectedStrokeIds, spatialIndex, strokes, zoom: viewport.zoom });
  useWhiteboardKeyboardShortcuts({ active, elements, pushHistory, resizeBrush, selectedBrushTool: isBrushTool(tool) ? tool : null, selectedElementIds, selectedStrokeIds, setElements, setSelectedElementIds, setSelectedStrokeIds, setStrokes, setTool, strokes, viewportZoom: viewport.zoom });
  const pointerActions = useWhiteboardPointerActions({
    activePenPointerRef, addPointer, appendDraftPoints, brushColors, brushSizes, clearDraftStroke,
    dragState, eraserActions: eraser, getBoardPointFromRect, getPinchMetrics, resizeSelection,
    scheduleViewport, setBrushCursorPoint,
    setDragState, setDraftStroke, setSelectedElementId,
    setSelectedStrokeIds, spacePressedRef,
    startStrokeSelection, strokeEraserActions: strokeEraser, strokeIdRef, tool, updatePointer, viewport, viewportRef,
  });
  const finishPointerAction = useWhiteboardPointerFinish({
    activePenPointerRef, clearDraftStroke, deletePointer, dragState,
    elements, finishEraserGesture: eraser.finish,
    finishStrokeEraserGesture: strokeEraser.finish,
    flushResizeDrags, getBoardPoint, getDraftStroke, pushHistory,
    setDragState, setElements, setSelectedElementIds, setSelectedStrokeIds, setStrokes,
    spatialIndex, strokeIdRef, strokes,
  });
  return {
    brushCursorColor: isDrawingTool(tool) ? brushColors[tool] : 'transparent',
    brushCursorPoint,
    brushCursorSize: isBrushTool(tool) ? brushSizes[tool] : 1,
    brushCursorTool: isBrushTool(tool) ? tool : null as WhiteboardBrushTool | null,
    brushColors, brushSizes, canRedo, canUndo,
    clearBoard: boardActions.clearBoard,
    draftStroke, elements, eraserPreview: eraser.preview,
    copyBoardToClipboard, exportBoard, handleElementPointerDown, handlePointerMove: pointerActions.handlePointerMove, importImage,
    handleRedo: boardActions.handleRedo,
    handleSelectionMovePointerDown, handleSelectionResizePointerDown, handleUndo: boardActions.handleUndo, handleViewportPointerDown: pointerActions.handleViewportPointerDown, handleWheel: boardActions.handleWheel,
    fitView: boardActions.fitView,
    isPanning: pointerActions.isPanning,
    onCopy: clipboard.copySelection,
    onDuplicate: clipboard.duplicateSelection, onPaste: clipboard.pasteSelection, resetView: boardActions.resetView,
    paperStyle,
    movePreview: pointerActions.movePreview,
    selectedElementIds, selectedStrokeIds,
    selectionPath: pointerActions.selectionPath,
    resizeBrush, setBrushColor, setBrushCursorPoint, setBrushSize,
    setPaperStyle: handlePaperStyleChange, setSelectedElementId: selectElement,
    setTool, spacePressed, spatialIndex, strokes: renderedStrokes, tool,
    updateZoom: boardActions.updateZoom, viewport, viewportRef, finishPointerAction,
  };
}
