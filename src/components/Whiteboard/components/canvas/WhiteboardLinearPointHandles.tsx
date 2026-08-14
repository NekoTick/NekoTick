import type { PointerEvent } from 'react';
import { themeWhiteboardTokens } from '@/styles/themeTokens';
import { getWhiteboardLinearMidpoint, isWhiteboardLinearSegmentTooShort } from '../../model/whiteboardLinear';
import type { WhiteboardStroke } from '../../model/whiteboardModel';

interface WhiteboardLinearPointHandlesProps {
  onPointerDown: (
    event: PointerEvent<SVGCircleElement>,
    strokeId: string,
    pointIndex: number,
    midpoint: boolean,
  ) => void;
  stroke: WhiteboardStroke;
  zoom: number;
}

export function WhiteboardLinearPointHandles({
  onPointerDown,
  stroke,
  zoom,
}: WhiteboardLinearPointHandlesProps) {
  const radius = themeWhiteboardTokens.linearPointHandleRadiusPx / zoom;
  const hitRadius = themeWhiteboardTokens.linearPointHandleHitRadiusPx / zoom;
  return (
    <g data-whiteboard-linear-handles={stroke.id}>
      {stroke.points.map((point, pointIndex) => (
        <g key={`point-${pointIndex}`}>
          {stroke.points.length === 2 && pointIndex === 0 && !isWhiteboardLinearSegmentTooShort(stroke, pointIndex, zoom) ? (
            <LinearPointHandle
              midpoint
              point={getWhiteboardLinearMidpoint(stroke, pointIndex)!}
              pointIndex={pointIndex}
            />
          ) : null}
          <LinearPointHandle point={point} pointIndex={pointIndex} />
        </g>
      ))}
    </g>
  );

  function LinearPointHandle({
    midpoint = false,
    point,
    pointIndex,
  }: {
    midpoint?: boolean;
    point: { x: number; y: number };
    pointIndex: number;
  }) {
    return (
      <>
        <circle
          data-whiteboard-linear-handle-hit={midpoint ? 'midpoint' : 'point'}
          className="pointer-events-auto cursor-move"
          cx={point.x}
          cy={point.y}
          r={hitRadius}
          fill="transparent"
          onPointerDown={(event) => onPointerDown(event, stroke.id, pointIndex, midpoint)}
        />
        <circle
          data-whiteboard-linear-handle={midpoint ? 'midpoint' : 'point'}
          cx={point.x}
          cy={point.y}
          r={radius}
          fill={midpoint ? 'var(--vlaina-color-whiteboard-selected)' : 'var(--vlaina-color-whiteboard-linear-handle-fill)'}
          pointerEvents="none"
          stroke={midpoint ? 'none' : 'var(--vlaina-color-whiteboard-linear-handle-stroke)'}
          strokeWidth={themeWhiteboardTokens.strokeSelectionWidthPx / zoom}
        />
      </>
    );
  }
}
