import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createWhiteboardEraserSpatialIndex } from '../model/whiteboardEraser';
import { useWhiteboardStrokeEraserGesture } from './useWhiteboardStrokeEraserGesture';

function createOptions() {
  const strokes = [{
    color: '#111111',
    id: 'stroke',
    points: [{ pressure: 0.5, x: 0, y: 0 }, { pressure: 0.5, x: 100, y: 0 }],
    size: 1,
    tool: 'pen' as const,
  }];
  return {
    pushHistory: vi.fn(),
    setStrokes: vi.fn(),
    spatialIndex: createWhiteboardEraserSpatialIndex([], strokes),
    strokes,
  };
}

describe('useWhiteboardStrokeEraserGesture', () => {
  it('commits one history entry after a partial erase', () => {
    const options = createOptions();
    const { result } = renderHook(() => useWhiteboardStrokeEraserGesture(options));

    act(() => {
      result.current.begin([{ point: { x: 50, y: 0 }, size: 1 }]);
      result.current.finish();
    });

    expect(options.pushHistory).toHaveBeenCalledTimes(1);
    expect(options.setStrokes).toHaveBeenCalledTimes(1);
    const committed = options.setStrokes.mock.calls[0][0];
    expect(committed).toHaveLength(2);
    expect(new Set(committed.map((stroke: { id: string }) => stroke.id)).size).toBe(2);
  });

  it('discards the preview when cancelled', () => {
    const options = createOptions();
    const { result } = renderHook(() => useWhiteboardStrokeEraserGesture(options));

    act(() => {
      result.current.begin([{ point: { x: 50, y: 0 }, size: 1 }]);
      result.current.finish(true);
    });

    expect(options.pushHistory).not.toHaveBeenCalled();
    expect(options.setStrokes).not.toHaveBeenCalled();
  });
});
