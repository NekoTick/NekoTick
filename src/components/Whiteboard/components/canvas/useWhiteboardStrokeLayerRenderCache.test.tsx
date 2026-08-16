import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { WhiteboardStroke } from '@/components/Whiteboard/model/core/whiteboardModel';
import { useWhiteboardStrokeLayerRenderCache } from './useWhiteboardStrokeLayerRenderCache';

interface RenderProps {
  previewOffset: { x: number; y: number } | null;
  strokes: WhiteboardStroke[];
}

function createStroke(id: string, x: number): WhiteboardStroke {
  return {
    color: '#112233',
    id,
    points: [
      { pressure: 0.4, x, y: x / 3 },
      { pressure: 0.8, x: x + 12.345, y: x / 3 + 6.789 },
    ],
    size: 1,
    tool: 'pen',
  };
}

function translate(strokes: WhiteboardStroke[], dx: number, dy: number): WhiteboardStroke[] {
  return strokes.map((stroke) => ({
    ...stroke,
    points: stroke.points.map((point) => ({ ...point, x: point.x + dx, y: point.y + dy })),
  }));
}

describe('useWhiteboardStrokeLayerRenderCache', () => {
  it('reuses geometry across repeated fractional move commits', () => {
    const initial = [createStroke('first', 0.3), createStroke('second', 123.456789)];
    const firstOffset = { x: 4.123, y: 2.789 };
    const initialProps: RenderProps = { previewOffset: null, strokes: initial };
    const { rerender, result } = renderHook(
      ({ previewOffset, strokes }: RenderProps) => useWhiteboardStrokeLayerRenderCache(strokes, previewOffset),
      { initialProps },
    );

    rerender({ previewOffset: firstOffset, strokes: initial });
    expect(result.current).toEqual({ strokes: initial, transform: 'translate(4.123px, 2.789px)' });

    const firstCommit = translate(initial, firstOffset.x, firstOffset.y);
    rerender({ previewOffset: null, strokes: firstCommit });
    expect(result.current).toEqual({ strokes: initial, transform: 'translate(4.123px, 2.789px)' });

    const secondOffset = { x: 1.111, y: -0.222 };
    rerender({ previewOffset: secondOffset, strokes: firstCommit });
    const secondCommit = translate(firstCommit, secondOffset.x, secondOffset.y);
    rerender({ previewOffset: null, strokes: secondCommit });

    expect(result.current).toEqual({ strokes: initial, transform: 'translate(5.234px, 2.567px)' });
  });

  it('invalidates preview geometry when the result is not a uniform translation', () => {
    const initial = [createStroke('stroke', 10.25)];
    const initialProps: RenderProps = { previewOffset: null, strokes: initial };
    const { rerender, result } = renderHook(
      ({ previewOffset, strokes }: RenderProps) => useWhiteboardStrokeLayerRenderCache(strokes, previewOffset),
      { initialProps },
    );
    rerender({ previewOffset: { x: 5, y: 3 }, strokes: initial });
    const reshaped = translate(initial, 5, 3);
    reshaped[0].points[1] = { ...reshaped[0].points[1], y: reshaped[0].points[1].y + 4 };

    rerender({ previewOffset: null, strokes: reshaped });

    expect(result.current).toEqual({ strokes: reshaped, transform: undefined });
  });
});
