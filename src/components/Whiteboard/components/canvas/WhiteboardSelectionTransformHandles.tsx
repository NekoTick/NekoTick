import type { PointerEvent } from 'react';
import { themeWhiteboardTokens } from '@/styles/themeTokens';
import type { WhiteboardResizeHandle, WhiteboardSelectionRect } from '../../model/whiteboardSelection';

interface WhiteboardSelectionTransformHandlesProps {
  bounds: WhiteboardSelectionRect;
  disabled: boolean;
  flipX: boolean;
  flipY: boolean;
  showEdgeHandles: boolean;
  zoom: number;
  onResizePointerDown: (event: PointerEvent<SVGRectElement>, handle: WhiteboardResizeHandle) => void;
  onRotationPointerDown: (event: PointerEvent<SVGCircleElement>, center: { x: number; y: number }) => void;
}

export function WhiteboardSelectionTransformHandles({
  bounds,
  disabled,
  flipX,
  flipY,
  showEdgeHandles,
  zoom,
  onResizePointerDown,
  onRotationPointerDown,
}: WhiteboardSelectionTransformHandlesProps) {
  const edge = themeWhiteboardTokens.selectionResizeEdgeHitSizePx / zoom;
  const size = themeWhiteboardTokens.selectionResizeHandleSizePx / zoom;
  const halfSize = size / 2;
  const edgeHandles = (['n', 'e', 's', 'w'] as const).map((handle) => {
    const visualHandle = flipResizeHandle(handle, flipX, flipY);
    return { cursor: getResizeCursor(visualHandle), handle, rect: getEdgeHandleRect(bounds, visualHandle, edge) };
  });
  const cornerHandles = (['nw', 'ne', 'se', 'sw'] as const).map((handle) => {
    const visualHandle = flipResizeHandle(handle, flipX, flipY);
    return {
      cursor: getResizeCursor(visualHandle),
      handle,
      x: visualHandle.includes('w') ? bounds.x : bounds.x + bounds.width,
      y: visualHandle.includes('n') ? bounds.y : bounds.y + bounds.height,
    };
  });

  return (
    <g>
      <circle
        data-whiteboard-selection-rotation-handle="true"
        cx={bounds.x + bounds.width / 2}
        cy={bounds.y - themeWhiteboardTokens.selectionRotationHandleGapPx / zoom}
        r={halfSize}
        fill="var(--vlaina-color-floating-surface)"
        stroke="var(--vlaina-color-whiteboard-selected)"
        strokeWidth={themeWhiteboardTokens.strokeSelectionWidthPx}
        vectorEffect="non-scaling-stroke"
        className={disabled ? 'pointer-events-none' : 'pointer-events-auto cursor-grab hover:fill-[var(--vlaina-color-whiteboard-selected)]'}
        onPointerDown={(event) => onRotationPointerDown(event, {
          x: bounds.x + bounds.width / 2,
          y: bounds.y + bounds.height / 2,
        })}
      />
      {showEdgeHandles ? edgeHandles.map(({ cursor, handle, rect }) => (
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
          onPointerDown={(event) => onResizePointerDown(event, handle)}
        />
      )) : null}
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
          onPointerDown={(event) => onResizePointerDown(event, handle)}
        />
      ))}
    </g>
  );
}

function flipResizeHandle(handle: WhiteboardResizeHandle, flipX: boolean, flipY: boolean): WhiteboardResizeHandle {
  let vertical = handle.includes('n') ? 'n' : handle.includes('s') ? 's' : '';
  let horizontal = handle.includes('w') ? 'w' : handle.includes('e') ? 'e' : '';
  if (flipY) vertical = vertical === 'n' ? 's' : vertical === 's' ? 'n' : '';
  if (flipX) horizontal = horizontal === 'w' ? 'e' : horizontal === 'e' ? 'w' : '';
  return `${vertical}${horizontal}` as WhiteboardResizeHandle;
}

function getResizeCursor(handle: WhiteboardResizeHandle): string {
  if (handle === 'n' || handle === 's') return 'ns-resize';
  if (handle === 'e' || handle === 'w') return 'ew-resize';
  return handle === 'nw' || handle === 'se' ? 'nwse-resize' : 'nesw-resize';
}

function getEdgeHandleRect(
  bounds: WhiteboardSelectionRect,
  handle: WhiteboardResizeHandle,
  edge: number,
): WhiteboardSelectionRect {
  const halfEdge = edge / 2;
  if (handle === 'n') return { height: edge, width: bounds.width, x: bounds.x, y: bounds.y - halfEdge };
  if (handle === 's') return { height: edge, width: bounds.width, x: bounds.x, y: bounds.y + bounds.height - halfEdge };
  if (handle === 'e') return { height: bounds.height, width: edge, x: bounds.x + bounds.width - halfEdge, y: bounds.y };
  return { height: bounds.height, width: edge, x: bounds.x - halfEdge, y: bounds.y };
}
