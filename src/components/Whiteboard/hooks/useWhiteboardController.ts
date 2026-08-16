import { useCallback, useMemo, useRef, useState, type Dispatch, type MouseEvent, type PointerEvent, type SetStateAction } from 'react';
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
import { useWhiteboardLinearPointControls } from './useWhiteboardLinearPointControls';
import { useWhiteboardPersistence } from './useWhiteboardPersistence';
import { useWhiteboardPointerActions } from './useWhiteboardPointerActions';
import { useWhiteboardPointerFinish } from './useWhiteboardPointerFinish';
import { useWhiteboardReady } from './useWhiteboardReady';
import { useWhiteboardSelectionDeletion } from './useWhiteboardSelectionDeletion';
import { useWhiteboardSelectionRotationControls } from './useWhiteboardSelectionRotationControls';
import { useWhiteboardSpacePan } from './useWhiteboardSpacePan';
import { useWhiteboardStrokeSelection } from './useWhiteboardStrokeSelection';
import { useWhiteboardStorageBridge } from './useWhiteboardStorageBridge';
import { useWhiteboardSpatialIndex } from './useWhiteboardSpatialIndex';
import { useWhiteboardTouchPointers } from './useWhiteboardTouchPointers';
import { useWhiteboardTextEditing } from './useWhiteboardTextEditing';
import { useWhiteboardViewportScheduler } from './useWhiteboardViewportScheduler';
import { useWhiteboardAutoDraw } from './useWhiteboardAutoDraw';
import { useWhiteboardSelectionColor } from './useWhiteboardSelectionColor';
import { getNextWhiteboardIdSequence } from '@/components/Whiteboard/model/core/whiteboardIds';
import { useWhiteboardStore } from '../stores/useWhiteboardStore';
import { getWhiteboardResizePreview, getWhiteboardRotationPreview, type WhiteboardDragState } from '@/components/Whiteboard/model/interaction/whiteboardInteractions';
import {
  WHITEBOARD_DEFAULT_PAPER_STYLE, WHITEBOARD_INITIAL_VIEWPORT, WHITEBOARD_SEED_ELEMENTS, WHITEBOARD_SEED_STROKES,
  isBrushTool,
  isStrokeTool,
  isDrawingTool,
  type WhiteboardBrushTool, type WhiteboardElement,
  type WhiteboardPaperStyle, type WhiteboardStroke, type WhiteboardTool,
} from '@/components/Whiteboard/model/core/whiteboardModel';

interface WhiteboardControllerOptions {
  active: boolean;
  drawWithTouch?: boolean;
  onPrimaryContentReady?: () => void;
  onStartupReady?: () => void;
}

export function useWhiteboardController({
  active,
  drawWithTouch = false,
  onPrimaryContentReady,
  onStartupReady,
}: WhiteboardControllerOptions) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const activeBoardId = useWhiteboardStore((state) => state.activeBoardId);
  const appliedBoardKeyRef = useRef<string | null>(null);
  const activePenPointerRef = useRef<number | null>(null);
  const strokeIdRef = useRef(getNextWhiteboardIdSequence(
    [...WHITEBOARD_SEED_STROKES, ...WHITEBOARD_SEED_ELEMENTS],
    'wb-stroke-',
  ));
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
  const [penInputDetected, setPenInputDetected] = useState(false);
  const [dragState, setDragState] = useState<WhiteboardDragState | null>(null);
  const { brushCursorPoint, setBrushCursorPoint } = useWhiteboardBrushCursor();
  const { canRedo, canUndo, pushHistory, redo, undo } = useWhiteboardHistory({ active, elements, historyKey: activeBoardId, paper: paperStyle, setElements, setPaper: setPaperStyle, setStrokes, strokes });
  const selectionColor = useWhiteboardSelectionColor({
    elements, paper: paperStyle, pushHistory, selectedElementIds, selectedStrokeIds,
    setElements, setStrokes, strokes,
  });
  const autoDraw = useWhiteboardAutoDraw({
    draftStroke, pushHistory, setElements, setSelectedElementIds, setSelectedStrokeIds, setStrokes, setTool, strokes, tool,
  });
  const textEditing = useWhiteboardTextEditing({
    elements, pushHistory, setElements, setSelectedElementIds, setSelectedStrokeIds, setTool,
  });
  const {
    interactionLocked,
    prepareMoveCommit,
    prepareResizeCommit,
    renderData,
    selectAll,
    selectionBounds,
    spatialIndex,
  } = useWhiteboardSpatialIndex({
    dragState, elements, selectedElementIds, selectedStrokeIds, setDragState, setElements,
    setSelectedElementIds, setSelectedStrokeIds, setStrokes, setTool, strokes,
  });
  const eraser = useWhiteboardEraserGesture({ elements, pushHistory, setElements, setStrokes, spatialIndex, strokes });
  useWhiteboardStorageBridge({
    active, appliedBoardKeyRef, elements, setElements, setPaper: setPaperStyle,
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
  useWhiteboardEscapeKey({ active, cancelEraserGesture: () => eraser.finish(true), clearDraftStroke, setDragState, setSelectedElementId, setSelectedStrokeIds, setTool });
  const { getBoardPoint, getBoardPointFromRect, getViewportPoint } = useWhiteboardCoordinates(viewport, viewportRef);
  const {
    cancelPendingLinearPoint,
    handleLinearPointPointerDown,
    updateLinearPoint,
  } = useWhiteboardLinearPointControls({
    getBoardPoint, interactionLocked, pushHistory, setDragState, setStrokes, strokes, tool, viewportZoom: viewport.zoom,
  });
  const { addPointer, deletePointer, getPinchMetrics, updatePointer } = useWhiteboardTouchPointers(getViewportPoint);
  const {
    cancelPendingSelectionRotation,
    handleSelectionRotationPointerDown,
    updateSelectionRotation,
  } = useWhiteboardSelectionRotationControls({
    elements, getBoardPoint, interactionLocked, pushHistory, selectedElementIds, selectedStrokeIds,
    setDragState, spacePressedRef, spatialIndex, strokes, tool,
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
  const editSelectedText = useCallback(() => {
    if (selectedElementIds.length !== 1 || selectedStrokeIds.length > 0) return false;
    const element = elements.find((candidate) => candidate.id === selectedElementIds[0]);
    if (element?.type !== 'text') return false;
    textEditing.editTextElement(element);
    return true;
  }, [elements, selectedElementIds, selectedStrokeIds.length, textEditing.editTextElement]);
  const { flushResizeDrags, handleElementPointerDown, handleSelectionMovePointerDown, handleSelectionResizePointerDown, resizeSelection, selectElement } = useWhiteboardElementControls({
    editSelectedText, elements, getBoardPoint, interactionLocked, pushHistory, selectedElementIds, selectedStrokeIds, selectionBounds, setDragState, setElements, setSelectedElementIds, setSelectedStrokeIds, setStrokes, spacePressedRef, spatialIndex, strokes, tool,
  });
  const startStrokeSelection = useWhiteboardStrokeSelection({ elements, pushHistory, selectedElementIds, selectedStrokeIds, setDragState, setSelectedElementIds, setSelectedStrokeIds, spatialIndex, strokes, zoom: viewport.zoom });
  useWhiteboardKeyboardShortcuts({ active, editSelectedText, pushHistory, resizeBrush, selectAll, selectedBrushTool: isStrokeTool(tool) ? tool : null, selectedElementIds, selectedStrokeIds, setElements, setStrokes, setTool, spatialIndex, viewportZoom: viewport.zoom });
  const pointerActions = useWhiteboardPointerActions({
    activePenPointerRef, addPointer, appendDraftPoints, brushColors, brushSizes, clearDraftStroke,
    dragState, drawWithTouch, eraserActions: eraser, getBoardPointFromRect, getPinchMetrics, resizeSelection,
    interactionLocked, scheduleViewport, setBrushCursorPoint,
    setDragState, setDraftStroke, setSelectedElementId,
    setSelectedStrokeIds, spacePressedRef,
    startStrokeSelection, startTextEditing: textEditing.startTextEditing, strokeIdRef, tool, updateLinearPoint, updatePointer, updateSelectionRotation, viewport, viewportRef,
  });
  const handleInputPointerType = useCallback((event: PointerEvent<HTMLElement>) => {
    setPenInputDetected(event.pointerType === 'pen');
  }, []);
  const handleViewportPointerDown = useCallback((event: Parameters<typeof pointerActions.handleViewportPointerDown>[0]) => {
    if (textEditing.editing) {
      textEditing.commitTextEditing();
      return;
    }
    pointerActions.handleViewportPointerDown(event);
  }, [pointerActions.handleViewportPointerDown, textEditing.commitTextEditing, textEditing.editing]);
  const handleViewportDoubleClick = useCallback((event: MouseEvent<HTMLDivElement>) => {
    if (textEditing.editing || tool !== 'select' || interactionLocked || spacePressedRef.current) return;
    if (!textEditing.editTextAtPoint(getBoardPoint(event.clientX, event.clientY))) return;
    event.preventDefault();
    setDragState(null);
  }, [getBoardPoint, interactionLocked, setDragState, spacePressedRef, textEditing.editTextAtPoint, textEditing.editing, tool]);
  const finishPointerAction = useWhiteboardPointerFinish({
    activePenPointerRef, applyFinalDrawSample: pointerActions.handlePointerMove,
    clearDraftStroke, deletePointer, dragState,
    elements, finishEraserGesture: eraser.finish,
    cancelPendingLinearPoint, cancelPendingSelectionRotation, flushResizeDrags, getBoardPoint, getDraftStroke, prepareMoveCommit, prepareResizeCommit, pushHistory,
    onAutoDrawStrokeCommit: autoDraw.addStroke,
    setDragState, setElements, setSelectedElementIds, setSelectedStrokeIds, setStrokes,
    setTool, spatialIndex, strokeIdRef, strokes, viewportZoom: viewport.zoom,
  });
  return {
    brushCursorColor: isDrawingTool(tool) ? brushColors[tool] : 'transparent',
    brushCursorPoint,
    brushCursorSize: isBrushTool(tool) ? brushSizes[tool] : 1,
    brushCursorTool: isBrushTool(tool) ? tool : null as WhiteboardBrushTool | null,
    brushColors, brushSizes, canRedo, canUndo,
    autoDrawSuggestions: autoDraw.suggestions,
    clearBoard: boardActions.clearBoard,
    draftStroke,
    elements, eraserPreview: eraser.preview,
    copyBoardToClipboard, exportBoard, handleElementPointerDown, handleInputPointerType, handleLinearPointPointerDown, handlePointerMove: pointerActions.handlePointerMove, handleViewportDoubleClick, importImage,
    handleRedo: boardActions.handleRedo,
    handleSelectionMovePointerDown, handleSelectionResizePointerDown, handleSelectionRotationPointerDown, handleUndo: boardActions.handleUndo, handleViewportPointerDown, handleWheel: boardActions.handleWheel,
    fitView: boardActions.fitView,
    isPanning: pointerActions.isPanning,
    onCopy: clipboard.copySelection,
    onDuplicate: clipboard.duplicateSelection, onPaste: clipboard.pasteSelection, resetView: boardActions.resetView,
    paperStyle, penInputDetected,
    movePreview: pointerActions.movePreview,
    renderData,
    resizePreview: getWhiteboardResizePreview(dragState),
    rotationPreview: getWhiteboardRotationPreview(dragState),
    selectedElementIds, selectedStrokeIds,
    selectedContentColor: selectionColor.selectedContentColor,
    selectionPath: pointerActions.selectionPath,
    resizeBrush, setBrushColor, setBrushCursorPoint, setBrushSize,
    setPaperStyle: handlePaperStyleChange, setSelectedElementId: selectElement,
    setSelectedContentColor: selectionColor.setSelectedContentColor,
    previewSelectedContentColor: selectionColor.previewSelectedContentColor,
    cancelSelectedContentColor: selectionColor.cancelSelectedContentColor,
    chooseAutoDrawSuggestion: autoDraw.chooseSuggestion, dismissAutoDrawSuggestions: autoDraw.dismiss,
    setTool, spacePressed, spatialIndex, strokes, textEditing: textEditing.editing, tool,
    commitTextEditing: textEditing.commitTextEditing, updateTextEditing: textEditing.updateTextEditing,
    updateZoom: boardActions.updateZoom, viewport, viewportRef, finishPointerAction,
  };
}
