import { memo, useMemo, type PointerEvent } from 'react';
import { themeIconTokens, themeWhiteboardTokens } from '@/styles/themeTokens';
import type { WhiteboardMovePreview } from '../../model/whiteboardInteractions';
import type { WhiteboardStroke } from '../../model/whiteboardModel';
import { getCenterStrokePath, getStrokeRenderWidth } from '../../model/whiteboardStrokeRenderGeometry';

interface WhiteboardSelectionDragTargetsProps {
  movePreview: WhiteboardMovePreview | null;
  movingStrokeIds: Set<string>;
  onPointerDown: (event: PointerEvent<SVGElement>) => void;
  strokes: WhiteboardStroke[];
}

export function WhiteboardSelectionDragTargets({
  movePreview,
  movingStrokeIds,
  onPointerDown,
  strokes,
}: WhiteboardSelectionDragTargetsProps) {
  const cursor = movePreview ? 'grabbing' : 'grab';
  const [movingStrokes, staticStrokes] = useMemo(() => {
    const moving: WhiteboardStroke[] = [];
    const stationary: WhiteboardStroke[] = [];
    strokes.forEach((stroke) => (movingStrokeIds.has(stroke.id) ? moving : stationary).push(stroke));
    return [moving, stationary];
  }, [movingStrokeIds, strokes]);
  const transform = movePreview ? `translate(${movePreview.dx} ${movePreview.dy})` : undefined;
  return (
    <>
      <WhiteboardSelectionDragTargetList cursor={cursor} strokes={staticStrokes} onPointerDown={onPointerDown} />
      <g transform={transform}>
        <WhiteboardSelectionDragTargetList cursor={cursor} strokes={movingStrokes} onPointerDown={onPointerDown} />
      </g>
    </>
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
