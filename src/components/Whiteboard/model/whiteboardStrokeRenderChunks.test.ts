import { describe, expect, it } from 'vitest';
import type { WhiteboardStroke } from './whiteboardModel';
import {
  getWhiteboardStrokePathNeighbors,
  getWhiteboardStrokeRenderChunks,
  WHITEBOARD_STROKE_RENDER_CHUNK_POINTS,
} from './whiteboardStrokeRenderChunks';

describe('whiteboardStrokeRenderChunks', () => {
  it('bounds live geometry work while preserving every source point', () => {
    expect(WHITEBOARD_STROKE_RENDER_CHUNK_POINTS).toBeLessThanOrEqual(256);

    const stroke: WhiteboardStroke = {
      color: '#111111',
      id: 'long-stroke',
      points: Array.from({ length: WHITEBOARD_STROKE_RENDER_CHUNK_POINTS * 3 }, (_, index) => ({
        pressure: 0.5,
        x: index,
        y: index % 20,
      })),
      size: 1,
      tool: 'crayon',
    };
    const first = getWhiteboardStrokeRenderChunks(stroke);
    const reconstructed = first.flatMap((chunk, index) => index === 0 ? chunk.points : chunk.points.slice(1));

    expect(first.length).toBeGreaterThan(1);
    expect(first.every((chunk) => chunk.points.length <= WHITEBOARD_STROKE_RENDER_CHUNK_POINTS)).toBe(true);
    expect(reconstructed).toEqual(stroke.points);

    stroke.points.push({ pressure: 0.5, x: stroke.points.length, y: 0 });
    const next = getWhiteboardStrokeRenderChunks(stroke);

    expect(next[0]).toBe(first[0]);
    expect(next.at(-1)?.points.length).toBeLessThanOrEqual(WHITEBOARD_STROKE_RENDER_CHUNK_POINTS);
  });

  it('uses the same source tangent on both sides of an internal chunk boundary', () => {
    const stroke: WhiteboardStroke = {
      color: '#111111',
      id: 'turning-stroke',
      points: Array.from({ length: WHITEBOARD_STROKE_RENDER_CHUNK_POINTS + 1 }, (_, index) => ({
        pressure: 0.5,
        x: Math.min(index, WHITEBOARD_STROKE_RENDER_CHUNK_POINTS - 1),
        y: Math.max(0, index - WHITEBOARD_STROKE_RENDER_CHUNK_POINTS + 1),
      })),
      size: 1,
      tool: 'marker',
    };
    const [first, second] = getWhiteboardStrokeRenderChunks(stroke);
    const firstNeighbors = getWhiteboardStrokePathNeighbors(first, first.points, first.points, first.points.length - 1);
    const secondNeighbors = getWhiteboardStrokePathNeighbors(second, second.points, second.points, 0);

    expect(firstNeighbors).toEqual(secondNeighbors);
    expect(firstNeighbors).toEqual([stroke.points.at(-3), stroke.points.at(-1)]);
  });
});
