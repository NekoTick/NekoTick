import { memo, useMemo, type CSSProperties, type PointerEvent } from 'react';
import { WhiteboardBrushCursor } from './WhiteboardBrushCursor';
import { WhiteboardElementNode } from './WhiteboardElementNode';
import { WhiteboardEraserTrail } from './WhiteboardEraserTrail';
import { WhiteboardSelectionOverlay } from './WhiteboardSelectionOverlay';
import { WhiteboardDraftStrokeLayer, WhiteboardStrokeLayer } from './WhiteboardStrokeLayer';
import type {
  WhiteboardBrushTool,
  WhiteboardElement,
  WhiteboardPoint,
  WhiteboardStroke,
  WhiteboardTool,
  WhiteboardViewport,
} from '../../model/whiteboardModel';
import {
  getElementBounds,
  getStrokeBounds,
  rectsOverlap,
  type WhiteboardLassoPath,
  type WhiteboardResizeHandle,
  type WhiteboardSelectionRect,
} from '../../model/whiteboardSelection';
import { getVisibleBoardRect } from '../../model/whiteboardViewport';
import type { WhiteboardMovePreview } from '../../model/whiteboardInteractions';
import {
  createWhiteboardEraserSpatialIndex,
  getWhiteboardBoundsCandidates,
  type WhiteboardEraserPreview,
  type WhiteboardEraserSpatialIndex,
} from '../../model/whiteboardEraser';

const EMPTY_IDS: string[] = [];

interface WhiteboardCanvasLayerProps {
  brushCursorColor: string;
  brushCursorPoint: WhiteboardPoint | null;
  brushCursorSize: number;
  brushCursorTool: WhiteboardBrushTool | null;
  draftStroke: WhiteboardStroke | null;
  elements: WhiteboardElement[];
  eraserPreview: WhiteboardEraserPreview;
  movePreview: WhiteboardMovePreview | null;
  selectedElementIds: string[];
  selectedStrokeIds: string[];
  selectionPath: WhiteboardLassoPath | null;
  spacePressed: boolean;
  spatialIndex?: WhiteboardEraserSpatialIndex;
  strokes: WhiteboardStroke[];
  tool: WhiteboardTool;
  viewport: WhiteboardViewport;
  viewportSize: WhiteboardPoint;
  onElementPointerDown: (event: PointerEvent<HTMLDivElement>, element: WhiteboardElement) => void;
  onSelectionMovePointerDown: (event: PointerEvent<SVGElement>) => void;
  onSelectionResizePointerDown: (event: PointerEvent<SVGRectElement>, handle: WhiteboardResizeHandle) => void;
}

export function WhiteboardCanvasLayer(props: WhiteboardCanvasLayerProps) {
  const style: CSSProperties = {
    transform: `translate(${props.viewport.x}px, ${props.viewport.y}px) scale(${props.viewport.zoom})`,
    transformOrigin: '0 0',
  };
  const visibleRect = useMemo(
    () => getVisibleBoardRect(props.viewport, props.viewportSize),
    [props.viewport, props.viewportSize],
  );
  const spatialIndex = useMemo(
    () => props.spatialIndex ?? createWhiteboardEraserSpatialIndex(props.elements, props.strokes),
    [props.elements, props.spatialIndex, props.strokes],
  );

  return (
    <div className="absolute inset-0 overflow-visible" style={style}>
      <WhiteboardContentLayer
        elements={props.elements}
        erasingElementIds={props.eraserPreview.elementIds}
        erasingStrokeIds={props.eraserPreview.strokeIds}
        movePreview={props.movePreview}
        selectedElementIds={props.selectedElementIds}
        selectedStrokeIds={props.selectedStrokeIds}
        selectionPath={props.selectionPath}
        spacePressed={props.spacePressed}
        spatialIndex={spatialIndex}
        strokes={props.strokes}
        tool={props.tool}
        visibleRect={visibleRect}
        onElementPointerDown={props.onElementPointerDown}
        onSelectionMovePointerDown={props.onSelectionMovePointerDown}
        onSelectionResizePointerDown={props.onSelectionResizePointerDown}
      />
      <WhiteboardEraserTrail trail={props.eraserPreview.trail} zoom={props.viewport.zoom} />
      <WhiteboardDraftStrokeLayer stroke={props.draftStroke} />
      <WhiteboardBrushCursor
        color={props.brushCursorColor}
        point={props.brushCursorPoint}
        size={props.brushCursorSize}
        tool={props.brushCursorTool}
      />
    </div>
  );
}

interface WhiteboardContentLayerProps {
  elements: WhiteboardElement[];
  erasingElementIds: string[];
  erasingStrokeIds: string[];
  movePreview: WhiteboardMovePreview | null;
  selectedElementIds: string[];
  selectedStrokeIds: string[];
  selectionPath: WhiteboardLassoPath | null;
  spacePressed: boolean;
  spatialIndex: WhiteboardEraserSpatialIndex;
  strokes: WhiteboardStroke[];
  tool: WhiteboardTool;
  visibleRect: WhiteboardSelectionRect | null;
  onElementPointerDown: (event: PointerEvent<HTMLDivElement>, element: WhiteboardElement) => void;
  onSelectionMovePointerDown: (event: PointerEvent<SVGElement>) => void;
  onSelectionResizePointerDown: (event: PointerEvent<SVGRectElement>, handle: WhiteboardResizeHandle) => void;
}

const WhiteboardContentLayer = memo(function WhiteboardContentLayer({
  elements,
  erasingElementIds,
  erasingStrokeIds,
  movePreview,
  selectedElementIds,
  selectedStrokeIds,
  selectionPath,
  spacePressed,
  spatialIndex,
  strokes,
  tool,
  visibleRect,
  onElementPointerDown,
  onSelectionMovePointerDown,
  onSelectionResizePointerDown,
}: WhiteboardContentLayerProps) {
  const selectedElementIdSet = useMemo(() => new Set(selectedElementIds), [selectedElementIds]);
  const selectedStrokeIdSet = useMemo(() => new Set(selectedStrokeIds), [selectedStrokeIds]);
  const elementIndex = useMemo(() => (
    spatialIndex.allElements === elements
      ? spatialIndex.elementOrder
      : selectedElementIds.length > 0 ? createItemIndex(elements) : null
  ), [elements, selectedElementIds.length, spatialIndex]);
  const strokeIndex = useMemo(() => (
    spatialIndex.allStrokes === strokes
      ? spatialIndex.strokeOrder
      : selectedStrokeIds.length > 0 ? createItemIndex(strokes) : null
  ), [selectedStrokeIds.length, spatialIndex, strokes]);
  const selectedElements = useMemo(
    () => elementIndex ? getIndexedItems(elements, elementIndex, selectedElementIds) : [],
    [elements, elementIndex, selectedElementIds],
  );
  const selectedStrokes = useMemo(
    () => strokeIndex ? getIndexedItems(strokes, strokeIndex, selectedStrokeIds) : [],
    [selectedStrokeIds, strokes, strokeIndex],
  );
  const erasingElementIdSet = useMemo(() => new Set(erasingElementIds), [erasingElementIds]);
  const movingElementIdSet = useMemo(() => new Set(movePreview?.elementIds ?? EMPTY_IDS), [movePreview?.elementIds]);
  const movingStrokeIdSet = useMemo(() => new Set(movePreview?.strokeIds ?? EMPTY_IDS), [movePreview?.strokeIds]);
  const visibleCandidates = useMemo(
    () => visibleRect ? getWhiteboardBoundsCandidates(spatialIndex, visibleRect) : null,
    [spatialIndex, visibleRect],
  );
  const visibleElements = useMemo(() => {
    if (!visibleRect || !visibleCandidates) return elements;
    if (spatialIndex.allElements !== elements || visibleCandidates.elements === elements) {
      return elements.filter((element) => selectedElementIdSet.has(element.id) || rectsOverlap(getElementBounds(element), visibleRect));
    }
    if (selectedElements.length === 0) return visibleCandidates.elements.filter((element) => (
      selectedElementIdSet.has(element.id) || rectsOverlap(getElementBounds(element), visibleRect)
    ));
    return mergeVisibleItems(visibleCandidates.elements, selectedElements, elementIndex!, (element) => (
      selectedElementIdSet.has(element.id) || rectsOverlap(getElementBounds(element), visibleRect)
    ));
  }, [elementIndex, elements, selectedElementIdSet, selectedElements, spatialIndex, visibleCandidates, visibleRect]);
  const visibleStrokes = useMemo(() => {
    if (!visibleRect || !visibleCandidates) return strokes;
    if (spatialIndex.allStrokes !== strokes || visibleCandidates.strokes === strokes) {
      return strokes.filter((stroke) => {
        if (selectedStrokeIdSet.has(stroke.id)) return true;
        const bounds = getStrokeBounds(stroke);
        return stroke.points.length > 0 && Boolean(bounds && rectsOverlap(bounds, visibleRect));
      });
    }
    if (selectedStrokes.length === 0) return visibleCandidates.strokes.filter((stroke) => {
      if (selectedStrokeIdSet.has(stroke.id)) return true;
      const bounds = getStrokeBounds(stroke);
      return stroke.points.length > 0 && Boolean(bounds && rectsOverlap(bounds, visibleRect));
    });
    return mergeVisibleItems(visibleCandidates.strokes, selectedStrokes, strokeIndex!, (stroke) => {
      if (selectedStrokeIdSet.has(stroke.id)) return true;
      const bounds = getStrokeBounds(stroke);
      return stroke.points.length > 0 && Boolean(bounds && rectsOverlap(bounds, visibleRect));
    });
  }, [selectedStrokeIdSet, selectedStrokes, spatialIndex, strokeIndex, strokes, visibleCandidates, visibleRect]);
  const staticStrokes = useMemo(
    () => visibleStrokes.filter((stroke) => !movingStrokeIdSet.has(stroke.id)),
    [movingStrokeIdSet, visibleStrokes],
  );
  const movingStrokes = useMemo(
    () => visibleStrokes.filter((stroke) => movingStrokeIdSet.has(stroke.id)),
    [movingStrokeIdSet, visibleStrokes],
  );
  const staticElements = useMemo(
    () => visibleElements.filter((element) => !movingElementIdSet.has(element.id)),
    [movingElementIdSet, visibleElements],
  );
  const movingElements = useMemo(
    () => visibleElements.filter((element) => movingElementIdSet.has(element.id)),
    [movingElementIdSet, visibleElements],
  );
  const transform = movePreview ? `translate(${movePreview.dx}px, ${movePreview.dy}px)` : undefined;
  const selectedItemCount = selectedElementIds.length + selectedStrokeIds.length;
  const elementProps = { erasingElementIdSet, onElementPointerDown, selectedElementIdSet, selectedItemCount, tool };

  return (
    <>
      <WhiteboardElementList {...elementProps} elements={staticElements} moving={false} />
      <WhiteboardElementList {...elementProps} elements={movingElements} moving transform={transform} />
      <WhiteboardStrokeLayer erasingStrokeIds={erasingStrokeIds} strokes={staticStrokes} />
      {movingStrokes.length > 0 ? <WhiteboardStrokeLayer cssTransform={transform} erasingStrokeIds={erasingStrokeIds} strokes={movingStrokes} /> : null}
      {tool === 'select' ? (
        <WhiteboardSelectionOverlay elements={selectedElements} movePreview={movePreview} selectedElementIds={selectedElementIds} selectedStrokeIds={selectedStrokeIds} selectionPath={selectionPath} spacePressed={spacePressed} strokes={selectedStrokes} onSelectionMovePointerDown={onSelectionMovePointerDown} onSelectionResizePointerDown={onSelectionResizePointerDown} />
      ) : null}
    </>
  );
});

interface WhiteboardElementListProps {
  elements: WhiteboardElement[];
  erasingElementIdSet: Set<string>;
  selectedElementIdSet: Set<string>;
  selectedItemCount: number;
  tool: WhiteboardTool;
  moving: boolean;
  transform?: string;
  onElementPointerDown: (event: PointerEvent<HTMLDivElement>, element: WhiteboardElement) => void;
}

const WhiteboardElementList = memo(function WhiteboardElementList(props: WhiteboardElementListProps) {
  const nodes = props.elements.map((element) => (
    <WhiteboardElementNode
      key={element.id}
      element={element}
      erasing={props.erasingElementIdSet.has(element.id)}
      moving={props.moving}
      selected={props.tool === 'select' && props.selectedElementIdSet.has(element.id)}
      showSelectionBorder={props.tool === 'select' && props.selectedItemCount <= 1 && props.selectedElementIdSet.has(element.id)}
      tool={props.tool}
      onPointerDown={props.onElementPointerDown}
    />
  ));
  return props.transform ? <div className="absolute inset-0 overflow-visible" style={{ transform: props.transform }}>{nodes}</div> : nodes;
});

function createItemIndex<T extends { id: string }>(items: T[]): Map<string, number> {
  return new Map(items.map((item, order) => [item.id, order]));
}

function getIndexedItems<T extends { id: string }>(items: T[], index: Map<string, number>, ids: string[]): T[] {
  return ids.flatMap((id) => {
    const order = index.get(id);
    const item = order === undefined ? undefined : items[order];
    return item ? [item] : [];
  });
}

function mergeVisibleItems<T extends { id: string }>(
  candidates: T[],
  selected: T[],
  index: Map<string, number>,
  isVisible: (item: T) => boolean,
): T[] {
  const items = new Set([...candidates, ...selected]);
  return [...items]
    .filter(isVisible)
    .sort((first, second) => (index.get(first.id) ?? 0) - (index.get(second.id) ?? 0));
}
