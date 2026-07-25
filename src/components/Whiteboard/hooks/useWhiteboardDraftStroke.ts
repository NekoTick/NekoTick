import { useCallback, useEffect, useRef, useState } from 'react';
import type { WhiteboardDrawingTool, WhiteboardStroke, WhiteboardStrokePoint } from '../model/whiteboardModel';
import { appendStrokePointsInPlace } from '../model/whiteboardStrokeGeometry';

export const WHITEBOARD_DRAFT_PREVIEW_MAX_POINTS = 768;

export function useWhiteboardDraftStroke() {
  const [draftStroke, setDraftStrokeState] = useState<WhiteboardStroke | null>(null);
  const draftStrokeRef = useRef<WhiteboardStroke | null>(null);
  const draftPreviewPointsRef = useRef<WhiteboardStrokePoint[]>([]);
  const frameRef = useRef<number | null>(null);

  const publishDraftStroke = useCallback(() => {
    frameRef.current = null;
    const draft = draftStrokeRef.current;
    setDraftStrokeState(draft ? { ...draft, points: draftPreviewPointsRef.current } : null);
  }, []);

  const setDraftStroke = useCallback((stroke: WhiteboardStroke | null) => {
    draftStrokeRef.current = stroke;
    draftPreviewPointsRef.current = stroke ? limitDraftPreviewPoints([...stroke.points]) : [];
    setDraftStrokeState(stroke ? { ...stroke, points: draftPreviewPointsRef.current } : null);
  }, []);

  const appendDraftPoints = useCallback((tool: WhiteboardDrawingTool, points: WhiteboardStrokePoint[], minDistance?: number) => {
    const current = draftStrokeRef.current;
    if (!current || current.tool !== tool) return;
    const previousPointCount = current.points.length;
    appendStrokePointsInPlace(current.points, points, minDistance);
    if (current.points.length === previousPointCount) return;
    draftPreviewPointsRef.current = limitDraftPreviewPoints([
      ...draftPreviewPointsRef.current,
      ...current.points.slice(previousPointCount),
    ]);
    if (frameRef.current !== null) return;
    frameRef.current = window.requestAnimationFrame(publishDraftStroke);
  }, [publishDraftStroke]);

  const getDraftStroke = useCallback(() => draftStrokeRef.current, []);

  const clearDraftStroke = useCallback(() => {
    draftStrokeRef.current = null;
    draftPreviewPointsRef.current = [];
    setDraftStrokeState(null);
  }, []);

  useEffect(() => () => {
    if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
  }, []);

  return { appendDraftPoints, clearDraftStroke, draftStroke, getDraftStroke, setDraftStroke };
}

function limitDraftPreviewPoints(points: WhiteboardStrokePoint[]): WhiteboardStrokePoint[] {
  let next = points;
  while (next.length > WHITEBOARD_DRAFT_PREVIEW_MAX_POINTS) {
    const compacted = [next[0]];
    for (let index = 2; index < next.length - 1; index += 2) compacted.push(next[index]);
    const last = next.at(-1);
    if (last && last !== compacted.at(-1)) compacted.push(last);
    next = compacted;
  }
  return next;
}
