import { useRef } from 'react';
import type { WhiteboardStroke } from '../../model/whiteboardModel';

interface WhiteboardStrokeLayerRender {
  strokes: WhiteboardStroke[];
  transform?: string;
}

interface WhiteboardStrokeLayerRenderCache {
  current: WhiteboardStroke[];
  offsetX: number;
  offsetY: number;
  previewSource: WhiteboardStroke[] | null;
  rendered: WhiteboardStroke[];
}

const TRANSLATION_EPSILON = 1e-7;

export function useWhiteboardStrokeLayerRenderCache(
  strokes: WhiteboardStroke[],
  previewOffset: { x: number; y: number } | null,
): WhiteboardStrokeLayerRender {
  const cacheRef = useRef<WhiteboardStrokeLayerRenderCache | null>(null);
  let cache = cacheRef.current;
  if (!cache) {
    cache = createCache(strokes);
    cacheRef.current = cache;
  }

  if (previewOffset) {
    if (!hasSameItems(cache.current, strokes)) {
      cache = createCache(strokes);
      cacheRef.current = cache;
    }
    cache.previewSource = strokes;
    return {
      strokes: cache.rendered,
      transform: getTranslate(cache.offsetX + previewOffset.x, cache.offsetY + previewOffset.y),
    };
  }

  if (cache.previewSource) {
    const translation = getStrokeSetTranslation(cache.previewSource, strokes);
    if (translation) {
      cache.current = strokes;
      cache.offsetX += translation.x;
      cache.offsetY += translation.y;
      cache.previewSource = null;
      return { strokes: cache.rendered, transform: getTranslate(cache.offsetX, cache.offsetY) };
    }
  }

  cache.previewSource = null;
  if (!hasSameItems(cache.current, strokes)) {
    cache = createCache(strokes);
    cacheRef.current = cache;
  }
  return {
    strokes: cache.rendered,
    transform: cache.offsetX === 0 && cache.offsetY === 0 ? undefined : getTranslate(cache.offsetX, cache.offsetY),
  };
}

function createCache(strokes: WhiteboardStroke[]): WhiteboardStrokeLayerRenderCache {
  return { current: strokes, offsetX: 0, offsetY: 0, previewSource: null, rendered: strokes };
}

function getStrokeSetTranslation(
  source: WhiteboardStroke[],
  next: WhiteboardStroke[],
): { x: number; y: number } | null {
  if (source.length !== next.length || source.length === 0) return null;
  let translation: { x: number; y: number } | null = null;
  for (let index = 0; index < source.length; index += 1) {
    const before = source[index];
    const after = next[index];
    if (before.id !== after.id || before.color !== after.color || before.size !== after.size
      || before.tool !== after.tool || before.points.length !== after.points.length) return null;
    const beforePoint = before.points[0];
    const afterPoint = after.points[0];
    if (!beforePoint || !afterPoint) continue;
    if (!hasSamePointData(beforePoint, afterPoint)) return null;
    const current = { x: afterPoint.x - beforePoint.x, y: afterPoint.y - beforePoint.y };
    if (translation && !hasSameTranslation(translation, current)) return null;
    translation ??= current;
    const beforeLastPoint = before.points.at(-1);
    const afterLastPoint = after.points.at(-1);
    if (!beforeLastPoint || !afterLastPoint || !hasSamePointData(beforeLastPoint, afterLastPoint)
      || !hasSameTranslation(translation, {
        x: afterLastPoint.x - beforeLastPoint.x,
        y: afterLastPoint.y - beforeLastPoint.y,
      })) return null;
  }
  return translation;
}

function hasSamePointData(
  first: WhiteboardStroke['points'][number],
  second: WhiteboardStroke['points'][number],
): boolean {
  return first.pressure === second.pressure && first.breakBefore === second.breakBefore;
}

function hasSameTranslation(
  first: { x: number; y: number },
  second: { x: number; y: number },
): boolean {
  return Math.abs(first.x - second.x) <= TRANSLATION_EPSILON
    && Math.abs(first.y - second.y) <= TRANSLATION_EPSILON;
}

function hasSameItems(first: WhiteboardStroke[], second: WhiteboardStroke[]): boolean {
  return first.length === second.length && first.every((stroke, index) => stroke === second[index]);
}

function getTranslate(x: number, y: number): string {
  return `translate(${x}px, ${y}px)`;
}
