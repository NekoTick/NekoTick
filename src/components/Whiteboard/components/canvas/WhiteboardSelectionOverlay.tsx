import { memo, useMemo, type PointerEvent } from 'react';
import { themeWhiteboardTokens } from '@/styles/themeTokens';
import {
  getSelectedOverlayGeometry,
  type WhiteboardLassoPath,
  type WhiteboardResizeHandle,
  type WhiteboardSelectionRect,
} from '../../model/whiteboardSelection';
import type { WhiteboardStroke } from '../../model/whiteboardModel';
import type { WhiteboardMovePreview } from '../../model/whiteboardInteractions';
import type { WhiteboardSelectionRenderData } from '../../model/whiteboardRenderData';
import { WhiteboardSelectionDragTargets } from './WhiteboardSelectionDragTargets';

const EMPTY_SELECTED_STROKES: WhiteboardStroke[] = [];

interface WhiteboardSelectionOverlayProps {
  movePreview: WhiteboardMovePreview | null;
  renderData: WhiteboardSelectionRenderData;
  resizePreviewBounds?: WhiteboardSelectionRect | null;
  selectionPath: WhiteboardLassoPath | null;
  spacePressed: boolean;
  onSelectionMovePointerDown: (event: PointerEvent<SVGElement>) => void;
  onSelectionResizePointerDown: (event: PointerEvent<SVGRectElement>, handle: WhiteboardResizeHandle) => void;
}

export const WhiteboardSelectionOverlay = memo(function WhiteboardSelectionOverlay({
  movePreview,
  renderData,
  resizePreviewBounds,
  selectionPath,
  spacePressed,
  onSelectionMovePointerDown,
  onSelectionResizePointerDown,
}: WhiteboardSelectionOverlayProps) {
  if (selectionPath) {
    return <WhiteboardActiveSelectionOverlay selectionPath={selectionPath} />;
  }

  return (
    <WhiteboardSelectedItemsOverlay
      movePreview={movePreview}
      renderData={renderData}
      resizePreviewBounds={resizePreviewBounds}
      spacePressed={spacePressed}
      onSelectionMovePointerDown={onSelectionMovePointerDown}
      onSelectionResizePointerDown={onSelectionResizePointerDown}
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
  resizePreviewBounds,
  spacePressed,
  onSelectionMovePointerDown,
  onSelectionResizePointerDown,
}: Omit<WhiteboardSelectionOverlayProps, 'selectionPath'>) {
  const { elements, strokes } = renderData;
  const baseGeometry = useMemo(
    () => renderData.geometry ?? getSelectedOverlayGeometry(elements, strokes),
    [elements, renderData.geometry, strokes],
  );
  const selectedStrokes = useMemo(
    () => baseGeometry.singleStroke && !resizePreviewBounds ? [baseGeometry.singleStroke] : EMPTY_SELECTED_STROKES,
    [baseGeometry, resizePreviewBounds],
  );
  const groupBounds = baseGeometry.groupBounds
    ? resizePreviewBounds ?? offsetRect(baseGeometry.groupBounds, movePreview)
    : null;
  const strokeBounds = useMemo(() => (
    baseGeometry.singleStroke && baseGeometry.singleBounds
      ? [{
          ...(resizePreviewBounds ?? offsetRect(baseGeometry.singleBounds, movePreview)),
          id: baseGeometry.singleBounds.id,
        }]
      : []
  ), [baseGeometry, movePreview, resizePreviewBounds]);
  const singleBounds = baseGeometry.singleBounds
    ? {
        ...(resizePreviewBounds ?? offsetRect(baseGeometry.singleBounds, movePreview)),
        id: baseGeometry.singleBounds.id,
      }
    : null;
  const resizeBounds = groupBounds ?? singleBounds;

  return (
    <svg aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-visible">
      {resizeBounds ? (
        <rect
          data-whiteboard-selection-move-target="true"
          className="pointer-events-auto"
          x={resizeBounds.x}
          y={resizeBounds.y}
          width={resizeBounds.width}
          height={resizeBounds.height}
          fill="transparent"
          style={{ cursor: movePreview ? 'grabbing' : 'grab' }}
          onPointerDown={onSelectionMovePointerDown}
        />
      ) : null}
      {groupBounds ? null : (
        <WhiteboardSelectionDragTargets
          movePreview={movePreview}
          onPointerDown={onSelectionMovePointerDown}
          strokes={selectedStrokes}
        />
      )}
      {strokeBounds.map((bounds) => (
        <rect
          key={bounds.id}
          x={bounds.x}
          y={bounds.y}
          width={bounds.width}
          height={bounds.height}
          fill="transparent"
          rx="6"
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
        <SelectionResizeHandles bounds={resizeBounds} disabled={spacePressed} onPointerDown={onSelectionResizePointerDown} />
      ) : null}
    </svg>
  );
});

function SelectionResizeHandles({
  bounds,
  disabled,
  onPointerDown,
}: {
  bounds: WhiteboardSelectionRect;
  disabled: boolean;
  onPointerDown: (event: PointerEvent<SVGRectElement>, handle: WhiteboardResizeHandle) => void;
}) {
  const edge = themeWhiteboardTokens.selectionResizeEdgeHitSizePx;
  const size = themeWhiteboardTokens.selectionResizeHandleSizePx;
  const halfEdge = edge / 2;
  const halfSize = size / 2;
  const edgeHandles: Array<{ cursor: string; handle: WhiteboardResizeHandle; rect: WhiteboardSelectionRect }> = [
    { cursor: 'ns-resize', handle: 'n', rect: { height: edge, width: bounds.width, x: bounds.x, y: bounds.y - halfEdge } },
    { cursor: 'ew-resize', handle: 'e', rect: { height: bounds.height, width: edge, x: bounds.x + bounds.width - halfEdge, y: bounds.y } },
    { cursor: 'ns-resize', handle: 's', rect: { height: edge, width: bounds.width, x: bounds.x, y: bounds.y + bounds.height - halfEdge } },
    { cursor: 'ew-resize', handle: 'w', rect: { height: bounds.height, width: edge, x: bounds.x - halfEdge, y: bounds.y } },
  ];
  const cornerHandles: Array<{ cursor: string; handle: WhiteboardResizeHandle; x: number; y: number }> = [
    { cursor: 'nwse-resize', handle: 'nw', x: bounds.x, y: bounds.y },
    { cursor: 'nesw-resize', handle: 'ne', x: bounds.x + bounds.width, y: bounds.y },
    { cursor: 'nwse-resize', handle: 'se', x: bounds.x + bounds.width, y: bounds.y + bounds.height },
    { cursor: 'nesw-resize', handle: 'sw', x: bounds.x, y: bounds.y + bounds.height },
  ];

  return (
    <g>
      {edgeHandles.map(({ cursor, handle, rect }) => (
        <rect
          key={handle}
          data-whiteboard-selection-resize-handle={handle}
          className={disabled ? 'pointer-events-none' : 'pointer-events-auto'}
          x={rect.x}
          y={rect.y}
          width={rect.width}
          height={rect.height}
          fill="transparent"
          style={disabled ? undefined : { cursor }}
          onPointerDown={(event) => onPointerDown(event, handle)}
        />
      ))}
      {cornerHandles.map(({ cursor, handle, x, y }) => (
        <rect
          key={handle}
          data-whiteboard-selection-resize-handle={handle}
          className={disabled ? 'pointer-events-none' : 'pointer-events-auto'}
          x={x - halfSize}
          y={y - halfSize}
          width={size}
          height={size}
          fill="var(--vlaina-color-floating-surface)"
          rx={themeWhiteboardTokens.brushCursorStrokeWidthPx}
          stroke="var(--vlaina-color-whiteboard-selected)"
          strokeWidth={themeWhiteboardTokens.strokeSelectionWidthPx}
          style={disabled ? undefined : { cursor }}
          vectorEffect="non-scaling-stroke"
          onPointerDown={(event) => onPointerDown(event, handle)}
        />
      ))}
    </g>
  );
}

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
