import { memo, type PointerEvent } from 'react';
import { themeIconTokens, themeWhiteboardTokens } from '@/styles/themeTokens';
import type { WhiteboardMovePreview } from '@/components/Whiteboard/model/interaction/whiteboardInteractions';
import type { WhiteboardStroke } from '@/components/Whiteboard/model/core/whiteboardModel';
import { getCenterStrokePath, getStrokeRenderWidth } from '@/components/Whiteboard/model/geometry/whiteboardStrokeRenderGeometry';

interface WhiteboardSelectionDragTargetsProps {
  movePreview: WhiteboardMovePreview | null;
  onPointerDown: (event: PointerEvent<SVGElement>) => void;
  strokes: WhiteboardStroke[];
}

export function WhiteboardSelectionDragTargets({
  movePreview,
  onPointerDown,
  strokes,
}: WhiteboardSelectionDragTargetsProps) {
  const cursor = movePreview ? 'grabbing' : 'grab';
  const transform = movePreview ? `translate(${movePreview.dx} ${movePreview.dy})` : undefined;
  return (
    <g transform={transform}>
      <WhiteboardSelectionDragTargetList cursor={cursor} strokes={strokes} onPointerDown={onPointerDown} />
    </g>
  );
}

const WhiteboardSelectionDragTargetList = memo(function WhiteboardSelectionDragTargetList({
  cursor,
  onPointerDown,
  strokes,
}: {
  cursor: 'grab' | 'grabbing';
  onPointerDown: (event: PointerEvent<SVGElement>) => void;
  strokes: WhiteboardStroke[];
}) {
  return strokes.map((stroke) => {
    if (stroke.points.length === 1) {
      const point = stroke.points[0];
      return (
        <circle
          key={stroke.id}
          data-whiteboard-selection-drag-target={stroke.id}
          className="pointer-events-auto"
          cx={point.x}
          cy={point.y}
          r={themeWhiteboardTokens.selectionResizeEdgeHitSizePx / 2}
          fill="transparent"
          style={{ cursor }}
          onPointerDown={onPointerDown}
        />
      );
    }
    return (
      <path
        key={stroke.id}
        data-whiteboard-selection-drag-target={stroke.id}
        d={getCenterStrokePath(stroke)}
        fill={themeIconTokens.fillNone}
        pointerEvents="stroke"
        stroke="transparent"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={Math.max(getStrokeRenderWidth(stroke), themeWhiteboardTokens.selectionResizeEdgeHitSizePx)}
        style={{ cursor }}
        vectorEffect="non-scaling-stroke"
        onPointerDown={onPointerDown}
      />
    );
  });
});
