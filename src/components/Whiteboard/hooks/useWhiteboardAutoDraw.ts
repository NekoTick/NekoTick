import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { themeWhiteboardTokens } from '@/styles/themeTokens';
import { appendWhiteboardItems } from '../model/whiteboardCollection';
import { getWhiteboardAutoDrawSuggestions, type WhiteboardAutoDrawSuggestion } from '../model/autodraw/whiteboardAutoDrawRecognition';
import { getWhiteboardAutoShapePoints } from '../model/whiteboardAutoShapeGeometry';
import {
  createStrokePoint,
  type WhiteboardElement,
  type WhiteboardStroke,
  type WhiteboardTool,
} from '../model/whiteboardModel';

interface WhiteboardAutoDrawOptions {
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
  const choosingSuggestionRef = useRef(false);
  const suggestions = useMemo(
    () => tool === 'autoshape'
      ? getWhiteboardAutoDrawSuggestions(
        draftStroke ? [...sessionStrokes, draftStroke] : sessionStrokes,
        12,
      )
      : [],
    [draftStroke, sessionStrokes, tool],
  );

  useEffect(() => {
    if (tool !== 'autoshape') {
      choosingSuggestionRef.current = false;
      setSessionStrokes([]);
      return;
    }
    const availableIds = new Set(strokes.map((stroke) => stroke.id));
    setSessionStrokes((current) => current.every((stroke) => availableIds.has(stroke.id)) ? current : []);
  }, [strokes, tool]);

  const addStroke = useCallback((stroke: WhiteboardStroke) => {
    choosingSuggestionRef.current = false;
    setSessionStrokes((current) => [...current, stroke]);
  }, []);

  const dismiss = useCallback(() => {
    choosingSuggestionRef.current = false;
    setSessionStrokes([]);
  }, []);

  const chooseSuggestion = useCallback((suggestion: WhiteboardAutoDrawSuggestion) => {
    if (choosingSuggestionRef.current || sessionStrokes.length === 0) return;
    const bounds = getSessionBounds(sessionStrokes);
    if (!bounds) return;
    choosingSuggestionRef.current = true;
    const resultBounds = getSquareResultBounds(bounds);
    const source = sessionStrokes[0];
    const sessionIds = new Set(sessionStrokes.map((stroke) => stroke.id));
    const id = `${source.id}-autodraw`;
    pushHistory();
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
      setElements((current) => current.filter((element) => element.id !== id));
      setStrokes((current) => appendWhiteboardItems(
        current.filter((stroke) => !sessionIds.has(stroke.id) && stroke.id !== id),
        [nextStroke],
      ));
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
      setStrokes((current) => current.filter((stroke) => !sessionIds.has(stroke.id) && stroke.id !== id));
      setElements((current) => appendWhiteboardItems(
        current.filter((element) => element.id !== id),
        [nextElement],
      ));
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

function getSquareResultBounds(bounds: { height: number; width: number; x: number; y: number }) {
  const size = Math.max(themeWhiteboardTokens.autoDrawResultMinSizePx, Math.min(bounds.width, bounds.height));
  return {
    height: size,
    width: size,
    x: bounds.x - (size - bounds.width) / 2,
    y: bounds.y - (size - bounds.height) / 2,
  };
}
