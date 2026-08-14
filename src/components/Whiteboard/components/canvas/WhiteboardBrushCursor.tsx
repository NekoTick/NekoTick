import { memo } from 'react';
import { themeWhiteboardTokens } from '@/styles/themeTokens';
import {
  type WhiteboardBrushTool,
  type WhiteboardPoint,
  type WhiteboardStroke,
} from '../../model/whiteboardModel';
import { WhiteboardStrokeNode } from './WhiteboardStrokeNode';

interface WhiteboardBrushCursorProps {
  point: WhiteboardPoint | null;
  color: string;
  size: number;
  tool: WhiteboardBrushTool | null;
}

const brushCursorLayerClassName = 'pointer-events-none absolute inset-0 hidden overflow-visible group-hover/whiteboard-surface:block';

export const WhiteboardBrushCursor = memo(function WhiteboardBrushCursor({ color, point, size, tool }: WhiteboardBrushCursorProps) {
  if (!point || !tool) return null;
  const cursorStroke: WhiteboardStroke = {
    color,
    id: 'whiteboard-brush-cursor',
    points: [{
      pressure: themeWhiteboardTokens.defaultPointerPressure,
      tilt: 0,
      velocity: 0,
      x: point.x,
      y: point.y,
    }],
    size,
    tool,
  };

  return (
    <svg aria-hidden="true" className={brushCursorLayerClassName}>
      <g data-whiteboard-brush-cursor={tool}>
        <WhiteboardStrokeNode stroke={cursorStroke} />
      </g>
    </svg>
  );
});
