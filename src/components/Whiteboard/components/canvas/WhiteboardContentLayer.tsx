import { memo, useMemo, useRef, type PointerEvent } from 'react';
import { WhiteboardElementList, type WhiteboardIdLookup } from './WhiteboardElementList';
import { WhiteboardSelectionOverlay } from './WhiteboardSelectionOverlay';
import { WhiteboardStrokeLayer } from './WhiteboardStrokeLayer';
import type {
  WhiteboardElement,
  WhiteboardPoint,
  WhiteboardStroke,
  WhiteboardTool,
} from '../../model/whiteboardModel';
import {
  getElementBounds,
  getStrokeBounds,
  rectsOverlap,
  type WhiteboardLassoPath,
  type WhiteboardResizeHandle,
  type WhiteboardSelectionRect,
} from '../../model/whiteboardSelection';
import type { WhiteboardMovePreview, WhiteboardResizePreview, WhiteboardRotationPreview } from '../../model/whiteboardInteractions';
import { WhiteboardSelectionRenderData, type WhiteboardRenderData } from '../../model/whiteboardRenderData';
import {
  getWhiteboardResizePreviewItems,
  getWhiteboardResizePreviewSourceItems,
  getWhiteboardResizePreviewTransform,
  shouldTransformWhiteboardResizePreview,
} from '../../model/whiteboardResizePreview';
import {
  getWhiteboardBoundsCandidates,
  getWhiteboardIndexedItems,
} from '../../model/whiteboardEraser';
import { useWhiteboardStrokeLayerRenderCache } from './useWhiteboardStrokeLayerRenderCache';
import { isWhiteboardFullSelection } from '../../model/whiteboardCollection';
import {
  getWhiteboardRotationPreviewItems,
  getWhiteboardRotationPreviewTransform,
} from '../../model/whiteboardRotationPreview';

const EMPTY_IDS: string[] = [];

interface WhiteboardContentLayerProps {
  erasingElementIds: string[];
  erasingStrokeIds: string[];
  hiddenElementId?: string | null;
  movePreview: WhiteboardMovePreview | null;
  renderData: WhiteboardRenderData;
  resizePreview: WhiteboardResizePreview | null;
  rotationPreview: WhiteboardRotationPreview | null;
  selectionPath: WhiteboardLassoPath | null;
  spacePressed: boolean;
  tool: WhiteboardTool;
  visibleRect: WhiteboardSelectionRect | null;
  onElementPointerDown: (event: PointerEvent<HTMLDivElement>, element: WhiteboardElement) => void;
  onLinearPointPointerDown: (event: PointerEvent<SVGCircleElement>, strokeId: string, pointIndex: number, midpoint: boolean) => void;
  onSelectionMovePointerDown: (event: PointerEvent<SVGElement>) => void;
  onSelectionResizePointerDown: (event: PointerEvent<SVGRectElement>, handle: WhiteboardResizeHandle) => void;
  onSelectionRotationPointerDown: (event: PointerEvent<SVGCircleElement>, center: WhiteboardPoint) => void;
  zoom: number;
}

export const WhiteboardContentLayer = memo(function WhiteboardContentLayer({
  erasingElementIds,
  erasingStrokeIds,
  hiddenElementId = null,
  movePreview,
  renderData,
  resizePreview,
  rotationPreview,
  selectionPath,
  spacePressed,
  tool,
  visibleRect,
  onElementPointerDown,
  onLinearPointPointerDown,
  onSelectionMovePointerDown,
  onSelectionResizePointerDown,
  onSelectionRotationPointerDown,
  zoom,
}: WhiteboardContentLayerProps) {
  const { elements, selectedElementIds, selectedStrokeIds, spatialIndex, strokes } = renderData;
  const renderSelection = tool === 'select';
  const previewSelectedElementIds = movePreview?.elementIds ?? selectedElementIds;
  const previewSelectedStrokeIds = movePreview?.strokeIds ?? selectedStrokeIds;
  const preparedSelectionGeometry = movePreview
    && (!haveSameIds(previewSelectedElementIds, selectedElementIds)
      || !haveSameIds(previewSelectedStrokeIds, selectedStrokeIds))
    ? null
    : renderData.selectionGeometry;
  const selectedElementIdSet = useMemo(
    () => createIdLookup(previewSelectedElementIds, elements, spatialIndex.elementOrder),
    [elements, previewSelectedElementIds, spatialIndex.elementOrder],
  );
  const elementIndex = useMemo(() => (
    !renderSelection
      ? null
      : spatialIndex.allElements === elements
      ? spatialIndex.elementOrder
      : previewSelectedElementIds.length > 0 ? createItemIndex(elements) : null
  ), [elements, previewSelectedElementIds.length, renderSelection, spatialIndex]);
  const strokeIndex = useMemo(() => (
    !renderSelection
      ? null
      : spatialIndex.allStrokes === strokes
      ? spatialIndex.strokeOrder
      : previewSelectedStrokeIds.length > 0 ? createItemIndex(strokes) : null
  ), [previewSelectedStrokeIds.length, renderSelection, spatialIndex, strokes]);
  const selectedElements = useMemo(
    () => renderSelection && !preparedSelectionGeometry && elementIndex
      ? getWhiteboardIndexedItems(elements, elementIndex, previewSelectedElementIds)
      : [],
    [elements, elementIndex, preparedSelectionGeometry, previewSelectedElementIds, renderSelection],
  );
  const selectedStrokes = useMemo(
    () => renderSelection && !preparedSelectionGeometry && strokeIndex
      ? getWhiteboardIndexedItems(strokes, strokeIndex, previewSelectedStrokeIds)
      : [],
    [preparedSelectionGeometry, previewSelectedStrokeIds, renderSelection, strokes, strokeIndex],
  );
  const requiresProportionalResize = useMemo(
    () => renderSelection && Boolean(elementIndex) && previewSelectedElementIds.some((id) => {
      const index = elementIndex?.get(id);
      const element = index === undefined ? null : elements[index];
      return element?.id === id && (
        element.type === 'text' || (element.type === 'icon' && Boolean(element.autoDrawIcon))
      );
    }),
    [elementIndex, elements, previewSelectedElementIds, renderSelection],
  );
  const selectionRenderData = useMemo(
    () => new WhiteboardSelectionRenderData(
      selectedElements,
      selectedStrokes,
      renderSelection ? preparedSelectionGeometry : null,
      requiresProportionalResize,
    ),
    [preparedSelectionGeometry, renderSelection, requiresProportionalResize, selectedElements, selectedStrokes],
  );
  const erasingElementIdSet = useMemo(() => new Set(erasingElementIds), [erasingElementIds]);
  const movingElementIds = movePreview?.elementIds ?? EMPTY_IDS;
  const movingStrokeIds = movePreview?.strokeIds ?? EMPTY_IDS;
  const movingElementIdSet = useMemo(
    () => createIdLookup(movingElementIds, elements, spatialIndex.elementOrder),
    [elements, movingElementIds, spatialIndex.elementOrder],
  );
  const movingStrokeIdSet = useMemo(
    () => createIdLookup(movingStrokeIds, strokes, spatialIndex.strokeOrder),
    [movingStrokeIds, spatialIndex.strokeOrder, strokes],
  );
  const resizingElementIds = resizePreview?.originalElementsById;
  const resizingStrokeIds = resizePreview?.originalStrokesById;
  const rotatingElementIds = rotationPreview?.originalElementsById;
  const rotatingStrokeIds = rotationPreview?.originalStrokesById;
  const visibleCandidates = useMemo(
    () => visibleRect ? getWhiteboardBoundsCandidates(spatialIndex, visibleRect) : null,
    [spatialIndex, visibleRect],
  );
  const movingVisibleRect = useMemo(() => visibleRect && movePreview ? {
    ...visibleRect,
    x: visibleRect.x - movePreview.dx,
    y: visibleRect.y - movePreview.dy,
  } : null, [movePreview, visibleRect]);
  const movingCandidates = useMemo(
    () => movingVisibleRect ? getWhiteboardBoundsCandidates(spatialIndex, movingVisibleRect) : null,
    [movingVisibleRect, spatialIndex],
  );
  const staticElements = useMemo(() => getVisibleItems(
    elements,
    spatialIndex.allElements,
    visibleCandidates?.elements ?? null,
    (element) => element.id !== hiddenElementId && !movingElementIdSet.has(element.id) && !resizingElementIds?.has(element.id) && !rotatingElementIds?.has(element.id) && isVisible(getElementBounds(element), visibleRect),
  ), [elements, hiddenElementId, movingElementIdSet, resizingElementIds, rotatingElementIds, spatialIndex.allElements, visibleCandidates, visibleRect]);
  const nextMovingElements = useMemo(() => getVisibleItems(
    elements,
    spatialIndex.allElements,
    movingCandidates?.elements ?? null,
    (element) => movingElementIdSet.has(element.id) && isMovedVisible(getElementBounds(element), movePreview, visibleRect),
  ), [elements, movePreview, movingCandidates, movingElementIdSet, spatialIndex.allElements, visibleRect]);
  const staticStrokes = useMemo(() => getVisibleItems(
    strokes,
    spatialIndex.allStrokes,
    visibleCandidates?.strokes ?? null,
    (stroke) => !movingStrokeIdSet.has(stroke.id) && !resizingStrokeIds?.has(stroke.id) && !rotatingStrokeIds?.has(stroke.id) && isStrokeVisible(stroke, visibleRect),
  ), [movingStrokeIdSet, resizingStrokeIds, rotatingStrokeIds, spatialIndex.allStrokes, strokes, visibleCandidates, visibleRect]);
  const nextMovingStrokes = useMemo(() => getVisibleItems(
    strokes,
    spatialIndex.allStrokes,
    movingCandidates?.strokes ?? null,
    (stroke) => movingStrokeIdSet.has(stroke.id) && isMovedStrokeVisible(stroke, movePreview, visibleRect),
  ), [movePreview, movingCandidates, movingStrokeIdSet, spatialIndex.allStrokes, strokes, visibleRect]);
  const movingElements = useStableItemArray(nextMovingElements);
  const movingStrokes = useStableItemArray(nextMovingStrokes);
  const transformResizePreview = Boolean(resizePreview && shouldTransformWhiteboardResizePreview(resizePreview));
  const resizedItems = useMemo(
    () => resizePreview
      ? transformResizePreview
        ? getWhiteboardResizePreviewSourceItems(resizePreview, spatialIndex, visibleRect)
        : getWhiteboardResizePreviewItems(resizePreview, spatialIndex, visibleRect)
      : { elements: [], strokes: [] },
    [resizePreview, spatialIndex, transformResizePreview, visibleRect],
  );
  const resizedElements = useStableItemArray(resizedItems.elements);
  const resizedStrokes = useStableItemArray(resizedItems.strokes);
  const rotatedItems = useMemo(
    () => rotationPreview
      ? getWhiteboardRotationPreviewItems(rotationPreview, spatialIndex, visibleRect)
      : { elements: [], strokes: [] },
    [rotationPreview, spatialIndex, visibleRect],
  );
  const rotatedElements = useStableItemArray(rotatedItems.elements);
  const rotatedStrokes = useStableItemArray(rotatedItems.strokes);
  const resizeTransform = resizePreview && transformResizePreview
    ? getWhiteboardResizePreviewTransform(resizePreview)
    : undefined;
  const transform = movePreview ? `translate(${movePreview.dx}px, ${movePreview.dy}px)` : undefined;
  const rotationTransform = rotationPreview ? getWhiteboardRotationPreviewTransform(rotationPreview) : undefined;
  const reusePrimaryElementLayerForResize = Boolean(resizeTransform && staticElements.length === 0 && resizedElements.length > 0);
  const reusePrimaryStrokeLayerForMove = Boolean(movePreview && staticStrokes.length === 0 && movingStrokes.length > 0);
  const reusePrimaryStrokeLayerForResize = Boolean(resizeTransform && staticStrokes.length === 0 && resizedStrokes.length > 0);
  const primaryStrokes = reusePrimaryStrokeLayerForMove
    ? movingStrokes
    : reusePrimaryStrokeLayerForResize ? resizedStrokes : staticStrokes;
  const primaryStrokeRender = useWhiteboardStrokeLayerRenderCache(
    primaryStrokes,
    reusePrimaryStrokeLayerForMove && movePreview ? { x: movePreview.dx, y: movePreview.dy } : null,
  );
  const primaryStrokeTransform = reusePrimaryStrokeLayerForResize
    ? resizeTransform
    : primaryStrokeRender.transform;
  const elementProps = { erasingElementIdSet, onElementPointerDown, selectedElementIdSet, tool };

  return (
    <>
      <WhiteboardElementList
        {...elementProps}
        elements={reusePrimaryElementLayerForResize ? resizedElements : staticElements}
        moving={reusePrimaryElementLayerForResize}
        transform={reusePrimaryElementLayerForResize ? resizeTransform : undefined}
      />
      <WhiteboardElementList {...elementProps} elements={movingElements} moving transform={transform} />
      {!reusePrimaryElementLayerForResize ? <WhiteboardElementList {...elementProps} elements={resizedElements} moving transform={resizeTransform} /> : null}
      <WhiteboardElementList {...elementProps} elements={rotatedElements} moving transform={rotationTransform} />
      <WhiteboardStrokeLayer progressive cssTransform={primaryStrokeTransform} erasingStrokeIds={erasingStrokeIds} strokes={primaryStrokeRender.strokes} />
      {!reusePrimaryStrokeLayerForMove && movingStrokes.length > 0 ? <WhiteboardStrokeLayer cssTransform={transform} erasingStrokeIds={erasingStrokeIds} strokes={movingStrokes} /> : null}
      {!reusePrimaryStrokeLayerForResize && resizedStrokes.length > 0 ? <WhiteboardStrokeLayer cssTransform={transformResizePreview ? undefined : resizeTransform} erasingStrokeIds={erasingStrokeIds} strokes={resizedStrokes} /> : null}
      {rotatedStrokes.length > 0 ? <WhiteboardStrokeLayer cssTransform={rotationTransform} erasingStrokeIds={erasingStrokeIds} strokes={rotatedStrokes} /> : null}
      {renderSelection ? (
        <WhiteboardSelectionOverlay movePreview={movePreview} renderData={selectionRenderData} resizePreview={resizePreview} rotationPreview={rotationPreview} selectionPath={selectionPath} spacePressed={spacePressed} zoom={zoom} onLinearPointPointerDown={onLinearPointPointerDown} onSelectionMovePointerDown={onSelectionMovePointerDown} onSelectionResizePointerDown={onSelectionResizePointerDown} onSelectionRotationPointerDown={onSelectionRotationPointerDown} />
      ) : null}
    </>
  );
}, areWhiteboardContentLayerPropsEqual);

function areWhiteboardContentLayerPropsEqual(
  previous: WhiteboardContentLayerProps,
  next: WhiteboardContentLayerProps,
): boolean {
  if (
    previous.erasingElementIds !== next.erasingElementIds
    || previous.erasingStrokeIds !== next.erasingStrokeIds
    || previous.hiddenElementId !== next.hiddenElementId
    || previous.movePreview !== next.movePreview
    || previous.renderData !== next.renderData
    || previous.resizePreview !== next.resizePreview
    || previous.rotationPreview !== next.rotationPreview
    || previous.selectionPath !== next.selectionPath
    || previous.spacePressed !== next.spacePressed
    || previous.tool !== next.tool
    || previous.visibleRect !== next.visibleRect
    || previous.onElementPointerDown !== next.onElementPointerDown
    || previous.onLinearPointPointerDown !== next.onLinearPointPointerDown
    || previous.onSelectionMovePointerDown !== next.onSelectionMovePointerDown
    || previous.onSelectionResizePointerDown !== next.onSelectionResizePointerDown
    || previous.onSelectionRotationPointerDown !== next.onSelectionRotationPointerDown
  ) return false;
  if (previous.zoom === next.zoom) return true;
  return !hasSelectedLinearStroke(previous.renderData) && !hasSelectedLinearStroke(next.renderData);
}

function hasSelectedLinearStroke(renderData: WhiteboardRenderData): boolean {
  if (renderData.selectedStrokeIds.length !== 1) return false;
  const selected = renderData.strokes.find((stroke) => stroke.id === renderData.selectedStrokeIds[0]);
  return selected?.tool === 'line' || selected?.tool === 'arrow';
}

function getVisibleItems<T>(
  items: T[],
  indexedItems: T[],
  candidates: T[] | null,
  isVisibleItem: (item: T) => boolean,
): T[] {
  if (indexedItems !== items || !candidates || candidates === items) return items.filter(isVisibleItem);
  return candidates.filter(isVisibleItem);
}

function isStrokeVisible(stroke: WhiteboardStroke, visibleRect: WhiteboardSelectionRect | null): boolean {
  if (!visibleRect) return true;
  const bounds = getStrokeBounds(stroke);
  return stroke.points.length > 0 && Boolean(bounds && rectsOverlap(bounds, visibleRect));
}

function isMovedStrokeVisible(
  stroke: WhiteboardStroke,
  movePreview: WhiteboardMovePreview | null,
  visibleRect: WhiteboardSelectionRect | null,
): boolean {
  const bounds = getStrokeBounds(stroke);
  return stroke.points.length > 0 && Boolean(bounds && isMovedVisible(bounds, movePreview, visibleRect));
}

function isVisible(bounds: WhiteboardSelectionRect, visibleRect: WhiteboardSelectionRect | null): boolean {
  return !visibleRect || rectsOverlap(bounds, visibleRect);
}

function isMovedVisible(
  bounds: WhiteboardSelectionRect,
  movePreview: WhiteboardMovePreview | null,
  visibleRect: WhiteboardSelectionRect | null,
): boolean {
  return isVisible(movePreview ? { ...bounds, x: bounds.x + movePreview.dx, y: bounds.y + movePreview.dy } : bounds, visibleRect);
}

function useStableItemArray<T>(items: T[]): T[] {
  const currentRef = useRef(items);
  if (currentRef.current.length !== items.length || currentRef.current.some((item, index) => item !== items[index])) {
    currentRef.current = items;
  }
  return currentRef.current;
}

function createItemIndex<T extends { id: string }>(items: T[]): Map<string, number> {
  return new Map(items.map((item, order) => [item.id, order]));
}

function haveSameIds(first: string[], second: string[]): boolean {
  return first.length === second.length && first.every((id, index) => id === second[index]);
}

function createIdLookup<T extends { id: string }>(
  ids: string[],
  items: T[],
  order: { get: (id: string) => number | undefined },
): WhiteboardIdLookup {
  if (!isWhiteboardFullSelection(ids, items)) return new Set(ids);
  return {
    has: (id) => {
      const index = order.get(id);
      return index !== undefined && items[index]?.id === id;
    },
  };
}
