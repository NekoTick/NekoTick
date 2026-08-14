import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { themeWhiteboardTokens } from '@/styles/themeTokens';
import { appendWhiteboardItems } from '../model/whiteboardCollection';
import { getWhiteboardAutoDrawSuggestions, type WhiteboardAutoDrawSuggestion } from '../model/autodraw/whiteboardAutoDrawRecognition';
import type { WhiteboardShapeRecognitionResult } from '../model/whiteboardAutoShape';
import { getWhiteboardAutoShapePoints } from '../model/whiteboardAutoShapeGeometry';
import {
  createStrokePoint,
  type WhiteboardElement,
  type WhiteboardStroke,
  type WhiteboardTool,
} from '../model/whiteboardModel';

interface WhiteboardAutoDrawOptions {
  draftRecognition?: WhiteboardShapeRecognitionResult | null;
  draftStroke: WhiteboardStroke | null;
  pushHistory: () => void;
  setElements: Dispatch<SetStateAction<WhiteboardElement[]>>;
  setSelectedElementIds: Dispatch<SetStateAction<string[]>>;
  setSelectedStrokeIds: Dispatch<SetStateAction<string[]>>;
  setStrokes: Dispatch<SetStateAction<WhiteboardStroke[]>>;
  setTool: Dispatch<SetStateAction<WhiteboardTool>>;
  strokes: WhiteboardStroke[];
  tool: WhiteboardTool;
}

export function useWhiteboardAutoDraw({
  draftRecognition,
  draftStroke,
  pushHistory,
  setElements,
  setSelectedElementIds,
  setSelectedStrokeIds,
  setStrokes,
  setTool,
  strokes,
  tool,
}: WhiteboardAutoDrawOptions) {
  const [sessionStrokes, setSessionStrokes] = useState<WhiteboardStroke[]>([]);
  const suggestions = useMemo(
    () => tool === 'autoshape'
      ? getWhiteboardAutoDrawSuggestions(
        draftStroke ? [...sessionStrokes, draftStroke] : sessionStrokes,
        12,
        sessionStrokes.length === 0 && draftStroke ? draftRecognition ?? undefined : undefined,
      )
      : [],
    [draftRecognition, draftStroke, sessionStrokes, tool],
  );

  useEffect(() => {
    if (tool !== 'autoshape') {
      setSessionStrokes([]);
      return;
    }
    const availableIds = new Set(strokes.map((stroke) => stroke.id));
    setSessionStrokes((current) => current.every((stroke) => availableIds.has(stroke.id)) ? current : []);
  }, [strokes, tool]);

  const addStroke = useCallback((stroke: WhiteboardStroke) => {
    setSessionStrokes((current) => [...current, stroke]);
  }, []);

  const dismiss = useCallback(() => setSessionStrokes([]), []);

  const chooseSuggestion = useCallback((suggestion: WhiteboardAutoDrawSuggestion) => {
    if (sessionStrokes.length === 0) return;
    const bounds = getSessionBounds(sessionStrokes);
    if (!bounds) return;
    const resultBounds = expandResultBounds(bounds);
    const source = sessionStrokes[0];
    const sessionIds = new Set(sessionStrokes.map((stroke) => stroke.id));
    const id = `${source.id}-autodraw`;
    pushHistory();
    setStrokes((current) => current.filter((stroke) => !sessionIds.has(stroke.id)));
    if (suggestion.kind === 'shape') {
      const nextStroke: WhiteboardStroke = {
        autoShape: suggestion.shape,
        color: source.color,
        id,
        points: getWhiteboardAutoShapePoints(suggestion.shape, [
          resultBounds.x,
          resultBounds.y,
          resultBounds.x + resultBounds.width,
          resultBounds.y + resultBounds.height,
        ]).map((point) => createStrokePoint(point, themeWhiteboardTokens.defaultPointerPressure)),
        size: source.size,
        tool: 'line',
      };
      setStrokes((current) => appendWhiteboardItems(current, [nextStroke]));
      setSelectedElementIds([]);
      setSelectedStrokeIds([id]);
    } else {
      const nextElement: WhiteboardElement = {
        autoDrawIcon: suggestion.icon,
        color: source.color,
        height: resultBounds.height,
        id,
        text: suggestion.label,
        type: 'icon',
        width: resultBounds.width,
        x: resultBounds.x,
        y: resultBounds.y,
      };
      setElements((current) => appendWhiteboardItems(current, [nextElement]));
      setSelectedElementIds([id]);
      setSelectedStrokeIds([]);
    }
    setTool('select');
    setSessionStrokes([]);
  }, [pushHistory, sessionStrokes, setElements, setSelectedElementIds, setSelectedStrokeIds, setStrokes, setTool]);

  return { addStroke, chooseSuggestion, dismiss, suggestions };
}

function getSessionBounds(strokes: WhiteboardStroke[]) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const stroke of strokes) {
    for (const point of stroke.points) {
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    }
  }
  if (!Number.isFinite(minX)) return null;
  return {
    height: maxY - minY,
    width: maxX - minX,
    x: minX,
    y: minY,
  };
}

function expandResultBounds(bounds: { height: number; width: number; x: number; y: number }) {
  const width = Math.max(themeWhiteboardTokens.autoDrawResultMinSizePx, bounds.width);
  const height = Math.max(themeWhiteboardTokens.autoDrawResultMinSizePx, bounds.height);
  return {
    height,
    width,
    x: bounds.x - (width - bounds.width) / 2,
    y: bounds.y - (height - bounds.height) / 2,
  };
}
