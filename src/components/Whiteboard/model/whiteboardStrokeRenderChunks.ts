import type { WhiteboardStroke, WhiteboardStrokePoint } from './whiteboardModel';

export const WHITEBOARD_STROKE_RENDER_CHUNK_POINTS = 256;

interface StrokeRenderChunkCacheEntry {
  chunks: WhiteboardStroke[];
  color: string;
  id: string;
  pointCount: number;
  size: number;
  tool: WhiteboardStroke['tool'];
}

const strokeRenderChunkCache = new WeakMap<WhiteboardStrokePoint[], StrokeRenderChunkCacheEntry>();

export function getWhiteboardStrokeRenderChunks(stroke: WhiteboardStroke): WhiteboardStroke[] {
  const cached = strokeRenderChunkCache.get(stroke.points);
  const sameStyle = cached
    && cached.color === stroke.color
    && cached.id === stroke.id
    && cached.size === stroke.size
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
    size: stroke.size,
    tool: stroke.tool,
  });
  return chunks;
}

function createStrokeRenderChunks(stroke: WhiteboardStroke, previous: WhiteboardStroke[]): WhiteboardStroke[] {
  const step = WHITEBOARD_STROKE_RENDER_CHUNK_POINTS - 1;
  const chunks: WhiteboardStroke[] = [];
  for (let start = 0, index = 0; start < stroke.points.length; start += step, index += 1) {
    const end = Math.min(stroke.points.length, start + WHITEBOARD_STROKE_RENDER_CHUNK_POINTS);
    const previousChunk = previous[index];
    if (
      previousChunk
      && previousChunk.points.length === end - start
      && previousChunk.points[0] === stroke.points[start]
      && previousChunk.points.at(-1) === stroke.points[end - 1]
    ) {
      chunks.push(previousChunk);
    } else {
      chunks.push({ ...stroke, points: stroke.points.slice(start, end) });
    }
    if (end === stroke.points.length) break;
  }
  return chunks;
}
