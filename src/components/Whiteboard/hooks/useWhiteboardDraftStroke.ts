import { useCallback, useEffect, useRef, useState } from 'react';
import type { WhiteboardDrawingTool, WhiteboardStroke, WhiteboardStrokePoint } from '@/components/Whiteboard/model/core/whiteboardModel';
import { appendStrokePointsInPlace } from '@/components/Whiteboard/model/geometry/whiteboardStrokeGeometry';

export function useWhiteboardDraftStroke() {
  const [draftStroke, setDraftStrokeState] = useState<WhiteboardStroke | null>(null);
  const draftStrokeRef = useRef<WhiteboardStroke | null>(null);
  const frameRef = useRef<number | null>(null);

  const publishDraftStroke = useCallback(() => {
    frameRef.current = null;
    const draft = draftStrokeRef.current;
    setDraftStrokeState(draft ? { ...draft } : null);
  }, []);

  const setDraftStroke = useCallback((stroke: WhiteboardStroke | null) => {
    draftStrokeRef.current = stroke;
    setDraftStrokeState(stroke);
  }, []);

  const appendDraftPoints = useCallback((tool: WhiteboardDrawingTool, points: WhiteboardStrokePoint[], minDistance?: number) => {
    const current = draftStrokeRef.current;
    if (!current || current.tool !== tool) return;
    const previousPointCount = current.points.length;
    const previousLastPoint = current.points.at(-1);
    appendStrokePointsInPlace(current.points, points, minDistance);
    if (current.points.length === previousPointCount && current.points.at(-1) === previousLastPoint) return;
    if (frameRef.current !== null) return;
    frameRef.current = window.requestAnimationFrame(publishDraftStroke);
  }, [publishDraftStroke]);

  const getDraftStroke = useCallback(() => draftStrokeRef.current, []);

  const clearDraftStroke = useCallback(() => {
    draftStrokeRef.current = null;
    setDraftStrokeState(null);
  }, []);

  useEffect(() => () => {
    if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
  }, []);

  return { appendDraftPoints, clearDraftStroke, draftStroke, getDraftStroke, setDraftStroke };
}
