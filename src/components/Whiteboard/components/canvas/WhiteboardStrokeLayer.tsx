import { memo, useMemo } from 'react';
import { themeWhiteboardTokens } from '@/styles/themeTokens';
import type { WhiteboardStroke } from '@/components/Whiteboard/model/core/whiteboardModel';
import { getWhiteboardStrokeNode, WhiteboardStrokeNode } from './WhiteboardStrokeNode';
import { useWhiteboardProgressiveStrokeSlots } from './useWhiteboardProgressiveStrokeSlots';

interface WhiteboardStrokeLayerProps {
  cssTransform?: string;
  erasingStrokeIds?: string[];
  progressive?: boolean;
  strokes: WhiteboardStroke[];
}

export const WhiteboardStrokeLayer = memo(function WhiteboardStrokeLayer({
  cssTransform,
  erasingStrokeIds = [],
  progressive = false,
  strokes,
}: WhiteboardStrokeLayerProps) {
  const erasingStrokeIdSet = useMemo(() => new Set(erasingStrokeIds), [erasingStrokeIds]);
  const slots = useWhiteboardProgressiveStrokeSlots(progressive, strokes, cssTransform);
  if (progressive) {
    return (
      <>
        {slots.map((slot, index) => (
          <WhiteboardStrokeSvg
            key={index}
            erasingStrokeIdSet={erasingStrokeIdSet}
            slot={index}
            strokes={slot.strokes}
            transform={slot.transform}
          />
        ))}
      </>
    );
  }
  return <WhiteboardStrokeSvg erasingStrokeIdSet={erasingStrokeIdSet} strokes={strokes} transform={cssTransform} />;
});

const WhiteboardStrokeSvg = memo(function WhiteboardStrokeSvg({
  erasingStrokeIdSet,
  slot,
  strokes,
  transform,
}: {
  erasingStrokeIdSet: Set<string>;
  slot?: number;
  strokes: WhiteboardStroke[];
  transform?: string;
}) {
  const strokeNodes = useMemo(
    () => strokes.map((stroke) => getWhiteboardStrokeNode(stroke, erasingStrokeIdSet.has(stroke.id))),
    [erasingStrokeIdSet, strokes],
  );
  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-visible"
      data-whiteboard-progressive-slot={slot}
      style={transform ? { transform, transformOrigin: themeWhiteboardTokens.layerTransformOrigin, willChange: 'transform' } : undefined}
    >
      <g>{strokeNodes}</g>
    </svg>
  );
});

export const WhiteboardDraftStrokeLayer = memo(function WhiteboardDraftStrokeLayer({
  stroke,
}: {
  stroke: WhiteboardStroke | null;
}) {
  if (!stroke || stroke.points.length === 0) return null;
  return (
    <svg aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-visible">
      <g data-whiteboard-draft-stroke="raw">
        <WhiteboardStrokeNode stroke={stroke} />
      </g>
    </svg>
  );
});
