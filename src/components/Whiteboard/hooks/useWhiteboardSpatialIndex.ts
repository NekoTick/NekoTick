import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import {
  getWhiteboardItemIds,
  isWhiteboardFullSelection,
  markWhiteboardFullSelection,
} from '@/components/Whiteboard/model/core/whiteboardCollection';
import {
  isWhiteboardMoveDragState,
  type WhiteboardDragState,
} from '@/components/Whiteboard/model/interaction/whiteboardInteractions';
import type { WhiteboardElement, WhiteboardPoint, WhiteboardStroke, WhiteboardTool } from '@/components/Whiteboard/model/core/whiteboardModel';
import { prepareWhiteboardMove, shouldPrepareWhiteboardMove } from '@/components/Whiteboard/model/interaction/whiteboardPreparedMove';
import { prepareWhiteboardResize, shouldPrepareWhiteboardResize } from '@/components/Whiteboard/model/interaction/whiteboardPreparedResize';
import { WhiteboardRenderData } from '@/components/Whiteboard/model/rendering/whiteboardRenderData';
import type { WhiteboardSelectedOverlayGeometry, WhiteboardSelectionRect } from '@/components/Whiteboard/model/interaction/whiteboardSelection';
import {
  createWhiteboardEraserSpatialIndex,
  createWhiteboardEraserSpatialIndexAsync,
  tryUpdateWhiteboardEraserSpatialIndex,
  type WhiteboardEraserSpatialIndex,
} from '@/components/Whiteboard/model/interaction/whiteboardEraser';

interface WhiteboardSpatialIndexOptions {
  dragState: WhiteboardDragState | null;
  elements: WhiteboardElement[];
  selectedElementIds: string[];
  selectedStrokeIds: string[];
  setDragState: Dispatch<SetStateAction<WhiteboardDragState | null>>;
  setElements: Dispatch<SetStateAction<WhiteboardElement[]>>;
  setSelectedElementIds: Dispatch<SetStateAction<string[]>>;
  setSelectedStrokeIds: Dispatch<SetStateAction<string[]>>;
  setStrokes: Dispatch<SetStateAction<WhiteboardStroke[]>>;
  setTool: Dispatch<SetStateAction<WhiteboardTool>>;
  strokes: WhiteboardStroke[];
}

interface PreparedSelection {
  elements: WhiteboardElement[];
  geometry: WhiteboardSelectedOverlayGeometry;
  selectedElementIds: string[];
  selectedStrokeIds: string[];
  strokes: WhiteboardStroke[];
}

interface PreparedTransform {
  elements: WhiteboardElement[];
  selectionGeometry: WhiteboardSelectedOverlayGeometry;
  strokes: WhiteboardStroke[];
}

const EMPTY_SELECTION_GEOMETRY: WhiteboardSelectedOverlayGeometry = {
  groupBounds: null,
  singleBounds: null,
  singleStroke: null,
};

export function useWhiteboardSpatialIndex({
  dragState,
  elements,
  selectedElementIds,
  selectedStrokeIds,
  setDragState,
  setElements,
  setSelectedElementIds,
  setSelectedStrokeIds,
  setStrokes,
  setTool,
  strokes,
}: WhiteboardSpatialIndexOptions) {
  const dragStateRef = useRef(dragState);
  const selectionSourcesRef = useRef({ selectedElementIds, selectedStrokeIds });
  const spatialIndexRef = useRef<WhiteboardEraserSpatialIndex | null>(null);
  const spatialRebuildTargetRef = useRef<{ elements: WhiteboardElement[]; strokes: WhiteboardStroke[] } | null>(null);
  const spatialSourcesRef = useRef({ elements, strokes });
  const preparedSelectionRef = useRef<PreparedSelection | null>(null);
  const transformTokenRef = useRef<object | null>(null);
  const [transformPending, setTransformPending] = useState(false);
  const [, setSpatialIndexVersion] = useState(0);
  dragStateRef.current = dragState;
  selectionSourcesRef.current = { selectedElementIds, selectedStrokeIds };
  spatialSourcesRef.current = { elements, strokes };

  if (spatialIndexRef.current === null) {
    spatialIndexRef.current = createWhiteboardEraserSpatialIndex(elements, strokes);
  } else if (
    dragState === null &&
    (spatialIndexRef.current.allElements !== elements || spatialIndexRef.current.allStrokes !== strokes) &&
    (spatialRebuildTargetRef.current?.elements !== elements || spatialRebuildTargetRef.current?.strokes !== strokes)
  ) {
    const updated = tryUpdateWhiteboardEraserSpatialIndex(spatialIndexRef.current, elements, strokes);
    if (updated) {
      spatialIndexRef.current = updated;
      spatialRebuildTargetRef.current = updated.selectionGeometry ? null : { elements, strokes };
    } else {
      spatialRebuildTargetRef.current = { elements, strokes };
    }
  }
  const spatialIndex = spatialIndexRef.current;

  useEffect(() => {
    const target = spatialRebuildTargetRef.current;
    if (dragState !== null || !target || target.elements !== elements || target.strokes !== strokes) return undefined;
    let current = true;
    const isCurrent = () => current && spatialSourcesRef.current.elements === elements && spatialSourcesRef.current.strokes === strokes;
    void createWhiteboardEraserSpatialIndexAsync(elements, strokes, isCurrent).then((rebuilt) => {
      if (!rebuilt || !isCurrent()) return;
      spatialIndexRef.current = rebuilt;
      spatialRebuildTargetRef.current = null;
      const selection = selectionSourcesRef.current;
      if (
        rebuilt.selectionGeometry &&
        isWhiteboardFullSelection(selection.selectedElementIds, elements) &&
        isWhiteboardFullSelection(selection.selectedStrokeIds, strokes)
      ) {
        preparedSelectionRef.current = {
          elements,
          geometry: rebuilt.selectionGeometry,
          selectedElementIds: selection.selectedElementIds,
          selectedStrokeIds: selection.selectedStrokeIds,
          strokes,
        };
      }
      setSpatialIndexVersion((version) => version + 1);
    });
    return () => {
      current = false;
    };
  }, [dragState, elements, strokes]);

  const finishPreparedTransform = useCallback(async (
    prepared: PreparedTransform,
    source: { elements: WhiteboardElement[]; strokes: WhiteboardStroke[] },
    selection: { selectedElementIds: string[]; selectedStrokeIds: string[] },
    isCurrent: () => boolean,
  ) => {
    const index = await createWhiteboardEraserSpatialIndexAsync(prepared.elements, prepared.strokes, isCurrent);
    if (!index || !isCurrent()) return;
    spatialIndexRef.current = index;
    spatialRebuildTargetRef.current = null;
    preparedSelectionRef.current = {
      elements: prepared.elements,
      geometry: prepared.selectionGeometry,
      selectedElementIds: selection.selectedElementIds,
      selectedStrokeIds: selection.selectedStrokeIds,
      strokes: prepared.strokes,
    };
    if (isWhiteboardFullSelection(selection.selectedElementIds, source.elements)) {
      markWhiteboardFullSelection(selection.selectedElementIds, prepared.elements);
    }
    if (isWhiteboardFullSelection(selection.selectedStrokeIds, source.strokes)) {
      markWhiteboardFullSelection(selection.selectedStrokeIds, prepared.strokes);
    }
    setElements(prepared.elements);
    setStrokes(prepared.strokes);
    setDragState(null);
  }, [setDragState, setElements, setStrokes]);

  const prepareMoveCommit = useCallback((
    state: Extract<WhiteboardDragState, { kind: 'move-elements' | 'move-strokes' }>,
    point: WhiteboardPoint,
  ) => {
    if (!shouldPrepareWhiteboardMove(state)) return false;
    const source = spatialSourcesRef.current;
    const selection = selectionSourcesRef.current;
    const token = {};
    transformTokenRef.current = token;
    setTransformPending(true);
    setDragState((current) => current === state ? { ...current, currentPoint: point } : current);
    const isCurrent = () => {
      const activeDrag = dragStateRef.current;
      return isSharedTransformCurrent(token, source, selection) &&
        isWhiteboardMoveDragState(activeDrag) &&
        activeDrag.kind === state.kind &&
        activeDrag.originalStrokesById === state.originalStrokesById;
    };
    void prepareWhiteboardMove(source.elements, source.strokes, state, point, isCurrent)
      .then((prepared) => prepared && isCurrent()
        ? finishPreparedTransform(prepared, source, selection, isCurrent)
        : undefined)
      .finally(() => finishTransform(token));
    return true;
  }, [finishPreparedTransform, setDragState]);

  const prepareResizeCommit = useCallback((
    state: Extract<WhiteboardDragState, { kind: 'resize-selection' }>,
    nextBounds: WhiteboardSelectionRect,
  ) => {
    if (!shouldPrepareWhiteboardResize(state)) return false;
    const source = spatialSourcesRef.current;
    const selection = selectionSourcesRef.current;
    const token = {};
    transformTokenRef.current = token;
    setTransformPending(true);
    setDragState((current) => current === state ? { ...current, currentBounds: nextBounds } : current);
    const isCurrent = () => {
      const activeDrag = dragStateRef.current;
      return isSharedTransformCurrent(token, source, selection) &&
        activeDrag?.kind === 'resize-selection' &&
        activeDrag.originalElementsById === state.originalElementsById &&
        activeDrag.originalStrokesById === state.originalStrokesById;
    };
    void prepareWhiteboardResize(source.elements, source.strokes, state, nextBounds, isCurrent)
      .then((prepared) => prepared && isCurrent()
        ? finishPreparedTransform(prepared, source, selection, isCurrent)
        : undefined)
      .finally(() => finishTransform(token));
    return true;
  }, [finishPreparedTransform, setDragState]);

  const preparedSelection = preparedSelectionRef.current;
  const selectionGeometry = preparedSelection &&
    preparedSelection.elements === elements &&
    preparedSelection.strokes === strokes &&
    preparedSelection.selectedElementIds === selectedElementIds &&
    preparedSelection.selectedStrokeIds === selectedStrokeIds
    ? preparedSelection.geometry
    : null;
  const renderData = useMemo(
    () => new WhiteboardRenderData(
      elements,
      spatialIndex,
      strokes,
      selectionGeometry,
      selectedElementIds,
      selectedStrokeIds,
    ),
    [elements, selectedElementIds, selectedStrokeIds, selectionGeometry, spatialIndex, strokes],
  );
  const selectAll = useCallback(() => {
    const nextSelectedElementIds = getWhiteboardItemIds(elements);
    const nextSelectedStrokeIds = getWhiteboardItemIds(strokes);
    const hasCurrentIndex = spatialIndex.allElements === elements && spatialIndex.allStrokes === strokes;
    const geometry = hasCurrentIndex
      ? spatialIndex.selectionGeometry ?? spatialIndex.baseIndex?.selectionGeometry
      : null;
    preparedSelectionRef.current = {
      elements,
      geometry: geometry ?? EMPTY_SELECTION_GEOMETRY,
      selectedElementIds: nextSelectedElementIds,
      selectedStrokeIds: nextSelectedStrokeIds,
      strokes,
    };
    setSelectedElementIds(nextSelectedElementIds);
    setSelectedStrokeIds(nextSelectedStrokeIds);
    setTool('select');
  }, [elements, setSelectedElementIds, setSelectedStrokeIds, setTool, spatialIndex, strokes]);

  function isSharedTransformCurrent(
    token: object,
    source: { elements: WhiteboardElement[]; strokes: WhiteboardStroke[] },
    selection: { selectedElementIds: string[]; selectedStrokeIds: string[] },
  ): boolean {
    return transformTokenRef.current === token &&
      spatialSourcesRef.current.elements === source.elements &&
      spatialSourcesRef.current.strokes === source.strokes &&
      selectionSourcesRef.current.selectedElementIds === selection.selectedElementIds &&
      selectionSourcesRef.current.selectedStrokeIds === selection.selectedStrokeIds;
  }

  function finishTransform(token: object): void {
    if (transformTokenRef.current !== token) return;
    transformTokenRef.current = null;
    setTransformPending(false);
  }

  return {
    interactionLocked: transformPending,
    prepareMoveCommit,
    prepareResizeCommit,
    renderData,
    selectAll,
    selectionBounds: selectionGeometry?.groupBounds ?? null,
    spatialIndex,
  };
}
