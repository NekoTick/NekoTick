import type { WhiteboardStroke, WhiteboardStrokePoint } from './whiteboardModel';

export const WHITEBOARD_STROKE_RENDER_CHUNK_POINTS = 256;

interface StrokeRenderChunkCacheEntry {
  chunks: WhiteboardStroke[];
  color: string;
  id: string;
  pointCount: number;
  renderPathOffset: number;
  renderPointOffset: number;
  renderSeed: string;
  size: number;
  taperEnd: boolean;
  taperStart: boolean;
  textureScale: number;
  tool: WhiteboardStroke['tool'];
}

interface StrokeRenderContext {
  pointOffset: number;
  points: WhiteboardStrokePoint[];
}

const strokeRenderChunkCache = new WeakMap<WhiteboardStrokePoint[], StrokeRenderChunkCacheEntry>();
const strokeRenderContextCache = new WeakMap<WhiteboardStrokePoint[], StrokeRenderContext>();

export function invalidateWhiteboardStrokeRenderChunks(points: WhiteboardStrokePoint[]): void {
  strokeRenderChunkCache.delete(points);
  strokeRenderContextCache.delete(points);
}

export function getWhiteboardStrokePathNeighbors(
  stroke: WhiteboardStroke,
  sourcePoints: WhiteboardStrokePoint[],
  renderedPoints: WhiteboardStrokePoint[],
  index: number,
): [WhiteboardStrokePoint, WhiteboardStrokePoint] {
  const local: [WhiteboardStrokePoint, WhiteboardStrokePoint] = [
    renderedPoints[Math.max(0, index - 1)],
    renderedPoints[Math.min(renderedPoints.length - 1, index + 1)],
  ];
  if (index > 0 && index < renderedPoints.length - 1) return local;
  const context = strokeRenderContextCache.get(stroke.points);
  const localSourceIndex = stroke.points.indexOf(sourcePoints[index]);
  if (!context || localSourceIndex < 0) return local;
  const sourceIndex = context.pointOffset + localSourceIndex;
  const previous = context.points[sourceIndex - 1];
  const next = context.points[sourceIndex + 1];
  return !previous || !next || sourcePoints[index].breakBefore || next.breakBefore
    ? local
    : [previous, next];
}

export function getWhiteboardStrokeRenderChunks(stroke: WhiteboardStroke): WhiteboardStroke[] {
  const cached = strokeRenderChunkCache.get(stroke.points);
  const sameStyle = cached
    && cached.color === stroke.color
    && cached.id === stroke.id
    && cached.renderPathOffset === (stroke.renderPathOffset ?? 0)
    && cached.renderPointOffset === (stroke.renderPointOffset ?? 0)
    && cached.renderSeed === (stroke.renderSeed ?? stroke.id)
    && cached.size === stroke.size
    && cached.taperEnd === (stroke.renderTaperEnd !== false)
    && cached.taperStart === (stroke.renderTaperStart !== false)
    && cached.textureScale === (stroke.renderTextureScale ?? 1)
    && cached.tool === stroke.tool;
  if (sameStyle && cached.pointCount === stroke.points.length) return cached.chunks;

  const chunks = stroke.points.length <= WHITEBOARD_STROKE_RENDER_CHUNK_POINTS
    ? [stroke]
    : createStrokeRenderChunks(stroke, sameStyle ? cached.chunks : []);
  strokeRenderChunkCache.set(stroke.points, {
    chunks,
    color: stroke.color,
    id: stroke.id,
    pointCount: stroke.points.length,
    renderPathOffset: stroke.renderPathOffset ?? 0,
    renderPointOffset: stroke.renderPointOffset ?? 0,
    renderSeed: stroke.renderSeed ?? stroke.id,
    size: stroke.size,
    taperEnd: stroke.renderTaperEnd !== false,
    taperStart: stroke.renderTaperStart !== false,
    textureScale: stroke.renderTextureScale ?? 1,
    tool: stroke.tool,
  });
  return chunks;
}

function createStrokeRenderChunks(stroke: WhiteboardStroke, previous: WhiteboardStroke[]): WhiteboardStroke[] {
  const step = WHITEBOARD_STROKE_RENDER_CHUNK_POINTS - 1;
  const chunks: WhiteboardStroke[] = [];
  let renderPathOffset = stroke.renderPathOffset ?? 0;
  for (let start = 0, index = 0; start < stroke.points.length; start += step, index += 1) {
    const end = Math.min(stroke.points.length, start + WHITEBOARD_STROKE_RENDER_CHUNK_POINTS);
    const previousChunk = previous[index];
    const renderTaperEnd = end === stroke.points.length && stroke.renderTaperEnd !== false;
    const renderTaperStart = start === 0 && stroke.renderTaperStart !== false;
    let chunk: WhiteboardStroke;
    if (
      previousChunk
      && previousChunk.points.length === end - start
      && previousChunk.points[0] === stroke.points[start]
      && previousChunk.points.at(-1) === stroke.points[end - 1]
      && (previousChunk.renderPathOffset ?? 0) === renderPathOffset
      && previousChunk.renderTaperEnd === renderTaperEnd
      && previousChunk.renderTaperStart === renderTaperStart
    ) {
      chunk = previousChunk;
    } else {
      chunk = {
        ...stroke,
        points: stroke.points.slice(start, end),
        renderPathOffset,
        renderPointOffset: (stroke.renderPointOffset ?? 0) + start,
        renderTaperEnd,
        renderTaperStart,
      };
    }
    strokeRenderContextCache.set(chunk.points, { pointOffset: start, points: stroke.points });
    chunks.push(chunk);
    if (end === stroke.points.length) break;
    renderPathOffset += getStrokePathLength(stroke.points, start, end);
  }
  return chunks;
}

function getStrokePathLength(points: WhiteboardStrokePoint[], start: number, end: number): number {
  let length = 0;
  for (let index = start + 1; index < end; index += 1) {
    if (points[index].breakBefore) continue;
    length += Math.hypot(points[index].x - points[index - 1].x, points[index].y - points[index - 1].y);
  }
  return length;
}
