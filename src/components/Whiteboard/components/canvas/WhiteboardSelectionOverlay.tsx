import { memo, useMemo, type PointerEvent } from 'react';
import { themeWhiteboardTokens } from '@/styles/themeTokens';
import {
  getSelectedOverlayGeometry,
  normalizeWhiteboardSelectionRect,
  type WhiteboardLassoPath,
  type WhiteboardResizeHandle,
  type WhiteboardSelectionRect,
} from '../../model/whiteboardSelection';
import type { WhiteboardStroke } from '../../model/whiteboardModel';
import { isLinearTool } from '../../model/whiteboardModel';
import type { WhiteboardMovePreview, WhiteboardResizePreview, WhiteboardRotationPreview } from '../../model/whiteboardInteractions';
import type { WhiteboardSelectionRenderData } from '../../model/whiteboardRenderData';
import {
  getWhiteboardResizePreviewGeometry,
  getWhiteboardRotationPreviewGeometry,
} from '../../model/whiteboardSelectionPreviewGeometry';
import { WhiteboardSelectionDragTargets } from './WhiteboardSelectionDragTargets';
import { WhiteboardLinearPointHandles } from './WhiteboardLinearPointHandles';
import { WhiteboardSelectionTransformHandles } from './WhiteboardSelectionTransformHandles';

const EMPTY_SELECTED_STROKES: WhiteboardStroke[] = [];

interface WhiteboardSelectionOverlayProps {
  movePreview: WhiteboardMovePreview | null;
  renderData: WhiteboardSelectionRenderData;
  resizePreview?: WhiteboardResizePreview | null;
  rotationPreview?: WhiteboardRotationPreview | null;
  selectionPath: WhiteboardLassoPath | null;
  spacePressed: boolean;
  zoom?: number;
  onLinearPointPointerDown?: (event: PointerEvent<SVGCircleElement>, strokeId: string, pointIndex: number, midpoint: boolean) => void;
  onSelectionMovePointerDown: (event: PointerEvent<SVGElement>) => void;
  onSelectionResizePointerDown: (event: PointerEvent<SVGRectElement>, handle: WhiteboardResizeHandle) => void;
  onSelectionRotationPointerDown?: (event: PointerEvent<SVGCircleElement>, center: { x: number; y: number }) => void;
}

export const WhiteboardSelectionOverlay = memo(function WhiteboardSelectionOverlay({
  movePreview,
  renderData,
  resizePreview,
  rotationPreview,
  selectionPath,
  spacePressed,
  zoom = 1,
  onLinearPointPointerDown = ignoreLinearPointPointerDown,
  onSelectionMovePointerDown,
  onSelectionResizePointerDown,
  onSelectionRotationPointerDown = ignoreSelectionRotationPointerDown,
}: WhiteboardSelectionOverlayProps) {
  if (selectionPath) {
    return <WhiteboardActiveSelectionOverlay selectionPath={selectionPath} />;
  }

  return (
    <WhiteboardSelectedItemsOverlay
      movePreview={movePreview}
      renderData={renderData}
      resizePreview={resizePreview}
      rotationPreview={rotationPreview}
      spacePressed={spacePressed}
      zoom={zoom}
      onLinearPointPointerDown={onLinearPointPointerDown}
      onSelectionMovePointerDown={onSelectionMovePointerDown}
      onSelectionResizePointerDown={onSelectionResizePointerDown}
      onSelectionRotationPointerDown={onSelectionRotationPointerDown}
    />
  );
});

function WhiteboardActiveSelectionOverlay({
  selectionPath,
}: Pick<WhiteboardSelectionOverlayProps, 'selectionPath'>) {
  const lassoPathData = useMemo(() => (selectionPath ? getLassoPathData(selectionPath) : ''), [selectionPath]);
  const lassoClosePathData = useMemo(() => (selectionPath ? getLassoClosePathData(selectionPath) : ''), [selectionPath]);
  const showLassoClosePath = Boolean(selectionPath && selectionPath.length >= 3);

  return (
    <svg aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-visible">
      {selectionPath ? (
        <g>
          <path
            d={lassoPathData}
            fill="transparent"
            stroke="var(--vlaina-color-floating-surface)"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={themeWhiteboardTokens.strokeSelectionWidthPx * 3}
            vectorEffect="non-scaling-stroke"
          />
          {showLassoClosePath ? (
            <path
              d={lassoClosePathData}
              fill="transparent"
              stroke="var(--vlaina-color-floating-surface)"
              strokeLinecap="round"
              strokeWidth={themeWhiteboardTokens.strokeSelectionWidthPx * 3}
              vectorEffect="non-scaling-stroke"
            />
          ) : null}
          <path
            d={lassoPathData}
            fill="transparent"
            stroke="var(--vlaina-color-whiteboard-selected)"
            strokeDasharray="7 5"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={themeWhiteboardTokens.strokeSelectionWidthPx}
            vectorEffect="non-scaling-stroke"
          />
          {showLassoClosePath ? (
            <path
              d={lassoClosePathData}
              fill="transparent"
              stroke="var(--vlaina-color-whiteboard-selected)"
              strokeDasharray="3 6"
              strokeLinecap="round"
              strokeWidth={themeWhiteboardTokens.strokeSelectionWidthPx}
              vectorEffect="non-scaling-stroke"
            />
          ) : null}
        </g>
      ) : null}
    </svg>
  );
}

const WhiteboardSelectedItemsOverlay = memo(function WhiteboardSelectedItemsOverlay({
  movePreview,
  renderData,
  resizePreview,
  rotationPreview,
  spacePressed,
  zoom,
  onLinearPointPointerDown,
  onSelectionMovePointerDown,
  onSelectionResizePointerDown,
  onSelectionRotationPointerDown,
}: Omit<WhiteboardSelectionOverlayProps, 'selectionPath'>) {
  const handleLinearPointPointerDown = onLinearPointPointerDown ?? ignoreLinearPointPointerDown;
  const handleSelectionRotationPointerDown = onSelectionRotationPointerDown ?? ignoreSelectionRotationPointerDown;
  const linearZoom = zoom ?? 1;
  const { elements, strokes } = renderData;
  const baseGeometry = useMemo(
    () => renderData.geometry ?? getSelectedOverlayGeometry(elements, strokes),
    [elements, renderData.geometry, strokes],
  );
  const previewGeometry = useMemo(() => (
    resizePreview
      ? getWhiteboardResizePreviewGeometry(resizePreview, baseGeometry)
      : rotationPreview
        ? getWhiteboardRotationPreviewGeometry(rotationPreview, baseGeometry)
        : baseGeometry
  ), [baseGeometry, resizePreview, rotationPreview]);
  const selectedStrokes = useMemo(
    () => baseGeometry.singleStroke && !resizePreview && !rotationPreview ? [baseGeometry.singleStroke] : EMPTY_SELECTED_STROKES,
    [baseGeometry, resizePreview, rotationPreview],
  );
  const groupBounds = previewGeometry.groupBounds
    ? normalizeWhiteboardSelectionRect(offsetRect(previewGeometry.groupBounds, movePreview))
    : null;
  const linearStroke = baseGeometry.singleStroke && !baseGeometry.singleStroke.autoShape && isLinearTool(baseGeometry.singleStroke.tool)
    ? baseGeometry.singleStroke
    : null;
  const singleItemBounds = useMemo(() => (
    previewGeometry.singleBounds
      ? [{
          ...normalizeWhiteboardSelectionRect(offsetRect(previewGeometry.singleBounds, movePreview)),
          id: previewGeometry.singleBounds.id,
        }]
      : []
  ), [movePreview, previewGeometry.singleBounds]);
  const singleBounds = previewGeometry.singleBounds
    ? {
        ...normalizeWhiteboardSelectionRect(offsetRect(previewGeometry.singleBounds, movePreview)),
        id: previewGeometry.singleBounds.id,
      }
    : null;
  const resizeBounds = groupBounds ?? singleBounds;
  const requiresProportionalResize = renderData.requiresProportionalResize;

  return (
    <svg aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-visible">
      {resizeBounds ? (
        <rect
          data-whiteboard-selection-move-target="true"
          className="pointer-events-none"
          x={resizeBounds.x}
          y={resizeBounds.y}
          width={resizeBounds.width}
          height={resizeBounds.height}
          fill="transparent"
          style={{ cursor: movePreview ? 'grabbing' : 'grab' }}
        />
      ) : null}
      {groupBounds ? null : (
        <WhiteboardSelectionDragTargets
          movePreview={movePreview}
          onPointerDown={onSelectionMovePointerDown}
          strokes={selectedStrokes}
        />
      )}
      {linearStroke && !movePreview && !resizePreview && !rotationPreview ? (
        <WhiteboardLinearPointHandles stroke={linearStroke} zoom={linearZoom} onPointerDown={handleLinearPointPointerDown} />
      ) : null}
      {singleItemBounds.map((bounds) => (
        <rect
          key={bounds.id}
          x={bounds.x}
          y={bounds.y}
          width={bounds.width}
          height={bounds.height}
          fill="transparent"
          stroke="var(--vlaina-color-whiteboard-selected)"
          strokeDasharray="6 5"
          strokeWidth={themeWhiteboardTokens.strokeSelectionWidthPx}
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {groupBounds ? (
        <rect
          x={groupBounds.x}
          y={groupBounds.y}
          width={groupBounds.width}
          height={groupBounds.height}
          fill="transparent"
          rx={themeWhiteboardTokens.exportElementRadiusPx}
          stroke="var(--vlaina-color-whiteboard-selected)"
          strokeDasharray="6 5"
          strokeWidth={themeWhiteboardTokens.strokeSelectionWidthPx}
          vectorEffect="non-scaling-stroke"
        />
      ) : null}
      {resizeBounds ? (
        <WhiteboardSelectionTransformHandles
          bounds={resizeBounds}
          disabled={spacePressed}
          flipX={Boolean(resizePreview && resizePreview.nextBounds.width < 0)}
          flipY={Boolean(resizePreview && resizePreview.nextBounds.height < 0)}
          showEdgeHandles={!requiresProportionalResize}
          zoom={linearZoom}
          onResizePointerDown={onSelectionResizePointerDown}
          onRotationPointerDown={handleSelectionRotationPointerDown}
        />
      ) : null}
    </svg>
  );
});

function ignoreLinearPointPointerDown() {}
function ignoreSelectionRotationPointerDown() {}

function offsetRect<T extends WhiteboardSelectionRect>(rect: T, movePreview: WhiteboardMovePreview | null): T {
  return movePreview ? { ...rect, x: rect.x + movePreview.dx, y: rect.y + movePreview.dy } : rect;
}

function getLassoPathData(path: WhiteboardLassoPath): string {
  if (path.length === 0) return '';
  return `M ${path.map((point) => `${point.x} ${point.y}`).join(' L ')}`;
}

function getLassoClosePathData(path: WhiteboardLassoPath): string {
  const first = path[0];
  const last = path[path.length - 1];
  return `M ${last.x} ${last.y} L ${first.x} ${first.y}`;
}
