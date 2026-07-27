import { memo, useMemo, useRef, type PointerEvent } from 'react';
import { WhiteboardElementList, type WhiteboardIdLookup } from './WhiteboardElementList';
import { WhiteboardSelectionOverlay } from './WhiteboardSelectionOverlay';
import { WhiteboardStrokeLayer } from './WhiteboardStrokeLayer';
import type {
  WhiteboardElement,
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
import type { WhiteboardMovePreview, WhiteboardResizePreview } from '../../model/whiteboardInteractions';
import type { WhiteboardStrokeEraserPreview } from '../../model/whiteboardStrokeEraser';
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

const EMPTY_IDS: string[] = [];

interface WhiteboardContentLayerProps {
  erasingElementIds: string[];
  erasingStrokeIds: string[];
  movePreview: WhiteboardMovePreview | null;
  renderData: WhiteboardRenderData;
  resizePreview: WhiteboardResizePreview | null;
  selectionPath: WhiteboardLassoPath | null;
  spacePressed: boolean;
  strokeEraserPreview: WhiteboardStrokeEraserPreview | null;
  tool: WhiteboardTool;
  visibleRect: WhiteboardSelectionRect | null;
  onElementPointerDown: (event: PointerEvent<HTMLDivElement>, element: WhiteboardElement) => void;
  onSelectionMovePointerDown: (event: PointerEvent<SVGElement>) => void;
  onSelectionResizePointerDown: (event: PointerEvent<SVGRectElement>, handle: WhiteboardResizeHandle) => void;
}

export const WhiteboardContentLayer = memo(function WhiteboardContentLayer({
  erasingElementIds,
  erasingStrokeIds,
  movePreview,
  renderData,
  resizePreview,
  selectionPath,
  spacePressed,
  strokeEraserPreview,
  tool,
  visibleRect,
  onElementPointerDown,
  onSelectionMovePointerDown,
  onSelectionResizePointerDown,
}: WhiteboardContentLayerProps) {
  const { elements, selectedElementIds, selectedStrokeIds, spatialIndex, strokes } = renderData;
  const renderSelection = tool === 'select';
  const preparedSelectionGeometry = renderData.selectionGeometry;
  const selectedElementIdSet = useMemo(
    () => createIdLookup(selectedElementIds, elements, spatialIndex.elementOrder),
    [elements, selectedElementIds, spatialIndex.elementOrder],
  );
  const elementIndex = useMemo(() => (
    !renderSelection
      ? null
      : spatialIndex.allElements === elements
      ? spatialIndex.elementOrder
      : selectedElementIds.length > 0 ? createItemIndex(elements) : null
  ), [elements, renderSelection, selectedElementIds.length, spatialIndex]);
  const strokeIndex = useMemo(() => (
    !renderSelection
      ? null
      : spatialIndex.allStrokes === strokes
      ? spatialIndex.strokeOrder
      : selectedStrokeIds.length > 0 ? createItemIndex(strokes) : null
  ), [renderSelection, selectedStrokeIds.length, spatialIndex, strokes]);
  const selectedElements = useMemo(
    () => renderSelection && !preparedSelectionGeometry && elementIndex
      ? getWhiteboardIndexedItems(elements, elementIndex, selectedElementIds)
      : [],
    [elements, elementIndex, preparedSelectionGeometry, renderSelection, selectedElementIds],
  );
  const selectedStrokes = useMemo(
    () => renderSelection && !preparedSelectionGeometry && strokeIndex
      ? getWhiteboardIndexedItems(strokes, strokeIndex, selectedStrokeIds)
      : [],
    [preparedSelectionGeometry, renderSelection, selectedStrokeIds, strokes, strokeIndex],
  );
  const selectionRenderData = useMemo(
    () => new WhiteboardSelectionRenderData(
      selectedElements,
      selectedStrokes,
      renderSelection ? preparedSelectionGeometry : null,
    ),
    [preparedSelectionGeometry, renderSelection, selectedElements, selectedStrokes],
  );
  const erasingElementIdSet = useMemo(() => new Set(erasingElementIds), [erasingElementIds]);
  const movingElementIds = movePreview ? selectedElementIds : EMPTY_IDS;
  const movingStrokeIds = movePreview ? selectedStrokeIds : EMPTY_IDS;
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
    (element) => !movingElementIdSet.has(element.id) && !resizingElementIds?.has(element.id) && isVisible(getElementBounds(element), visibleRect),
  ), [elements, movingElementIdSet, resizingElementIds, spatialIndex.allElements, visibleCandidates, visibleRect]);
  const nextMovingElements = useMemo(() => getVisibleItems(
    elements,
    spatialIndex.allElements,
    movingCandidates?.elements ?? null,
    (element) => movingElementIdSet.has(element.id) && isMovedVisible(getElementBounds(element), movePreview, visibleRect),
  ), [elements, movePreview, movingCandidates, movingElementIdSet, spatialIndex.allElements, visibleRect]);
  const visibleStaticStrokes = useMemo(() => getVisibleItems(
    strokes,
    spatialIndex.allStrokes,
    visibleCandidates?.strokes ?? null,
    (stroke) => !movingStrokeIdSet.has(stroke.id) && !resizingStrokeIds?.has(stroke.id) && isStrokeVisible(stroke, visibleRect),
  ), [movingStrokeIdSet, resizingStrokeIds, spatialIndex.allStrokes, strokes, visibleCandidates, visibleRect]);
  const staticStrokes = useMemo(
    () => applyStrokeReplacements(visibleStaticStrokes, strokeEraserPreview?.replacements),
    [strokeEraserPreview, visibleStaticStrokes],
  );
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
  const resizeTransform = resizePreview && transformResizePreview
    ? getWhiteboardResizePreviewTransform(resizePreview)
    : undefined;
  const transform = movePreview ? `translate(${movePreview.dx}px, ${movePreview.dy}px)` : undefined;
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
  const selectedItemCount = selectedElementIds.length + selectedStrokeIds.length;
  const elementProps = { erasingElementIdSet, onElementPointerDown, selectedElementIdSet, selectedItemCount, tool };

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
      <WhiteboardStrokeLayer progressive cssTransform={primaryStrokeTransform} erasingStrokeIds={erasingStrokeIds} strokes={primaryStrokeRender.strokes} />
      {!reusePrimaryStrokeLayerForMove && movingStrokes.length > 0 ? <WhiteboardStrokeLayer cssTransform={transform} erasingStrokeIds={erasingStrokeIds} strokes={movingStrokes} /> : null}
      {!reusePrimaryStrokeLayerForResize && resizedStrokes.length > 0 ? <WhiteboardStrokeLayer cssTransform={transformResizePreview ? undefined : resizeTransform} erasingStrokeIds={erasingStrokeIds} strokes={resizedStrokes} /> : null}
      {renderSelection ? (
        <WhiteboardSelectionOverlay movePreview={movePreview} renderData={selectionRenderData} resizePreviewBounds={resizePreview?.nextBounds ?? null} selectionPath={selectionPath} spacePressed={spacePressed} onSelectionMovePointerDown={onSelectionMovePointerDown} onSelectionResizePointerDown={onSelectionResizePointerDown} />
      ) : null}
    </>
  );
});

function getVisibleItems<T>(
  items: T[],
  indexedItems: T[],
  candidates: T[] | null,
  isVisibleItem: (item: T) => boolean,
): T[] {
  if (indexedItems !== items || !candidates || candidates === items) return items.filter(isVisibleItem);
  return candidates.filter(isVisibleItem);
}

function applyStrokeReplacements(
  strokes: WhiteboardStroke[],
  replacements: ReadonlyMap<string, WhiteboardStroke[]> | undefined,
): WhiteboardStroke[] {
  if (!replacements || replacements.size === 0) return strokes;
  let changed = false;
  const rendered: WhiteboardStroke[] = [];
  for (const stroke of strokes) {
    const replacement = replacements.get(stroke.id);
    if (!replacement) rendered.push(stroke);
    else {
      changed = true;
      rendered.push(...replacement);
    }
  }
  return changed ? rendered : strokes;
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
