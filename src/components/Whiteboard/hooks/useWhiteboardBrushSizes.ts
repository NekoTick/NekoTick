import { useCallback, useMemo, useState } from 'react';
import {
  WHITEBOARD_DEFAULT_BRUSH_COLORS,
  WHITEBOARD_DEFAULT_BRUSH_SIZES,
  resizeBrushSize,
  type WhiteboardBrushColors,
  type WhiteboardBrushSizes,
  type WhiteboardBrushTool,
  type WhiteboardDrawingTool,
} from '../model/whiteboardModel';

export function useWhiteboardBrushSizes() {
  const [brushColor, setBrushColor] = useState<string | WhiteboardBrushColors>(WHITEBOARD_DEFAULT_BRUSH_COLORS.pen);
  const [brushSizes, setBrushSizes] = useState<WhiteboardBrushSizes>(WHITEBOARD_DEFAULT_BRUSH_SIZES);
  const sharedBrushColor = typeof brushColor === 'string' ? brushColor : brushColor.pen;
  const brushColors = useMemo<WhiteboardBrushColors>(() => ({
    pen: sharedBrushColor,
    pencil: sharedBrushColor,
    marker: sharedBrushColor,
    'colored-pencil': sharedBrushColor,
    fountain: sharedBrushColor,
    watercolor: sharedBrushColor,
    crayon: sharedBrushColor,
  }), [sharedBrushColor]);

  const resizeBrush = useCallback((tool: WhiteboardBrushTool, deltaY: number) => {
    setBrushSizes((current) => ({
      ...current,
      [tool]: resizeBrushSize(current[tool], deltaY),
    }));
  }, []);

  const setBrushSize = useCallback((tool: WhiteboardBrushTool, size: number) => {
    setBrushSizes((current) => ({ ...current, [tool]: size }));
  }, []);

  const setDrawingColor = useCallback((_tool: WhiteboardDrawingTool, color: string) => {
    setBrushColor(color);
  }, []);

  return { brushColors, brushSizes, resizeBrush, setBrushColor: setDrawingColor, setBrushSize };
}
