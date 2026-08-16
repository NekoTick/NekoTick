import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useWhiteboardEraserGesture } from './useWhiteboardEraserGesture';
import { createWhiteboardEraserSpatialIndex } from '@/components/Whiteboard/model/interaction/whiteboardEraser';
import type { WhiteboardStroke } from '@/components/Whiteboard/model/core/whiteboardModel';

function createOptions() {
  const elements = [
    { height: 80, id: 'image-1', text: '', type: 'image' as const, width: 100, x: 0, y: 0 },
    { height: 80, id: 'image-2', text: '', type: 'image' as const, width: 100, x: 200, y: 0 },
  ];
  const strokes: WhiteboardStroke[] = [];
  return {
    elements,
    pushHistory: vi.fn(),
    setElements: vi.fn(),
    setStrokes: vi.fn(),
    spatialIndex: createWhiteboardEraserSpatialIndex(elements, strokes),
    strokes,
  };
}

describe('useWhiteboardEraserGesture', () => {
  it('commits complete image deletion once when the gesture finishes', () => {
    const options = createOptions();
    const { result } = renderHook(() => useWhiteboardEraserGesture(options));
    act(() => {
      result.current.begin([{ point: { x: 20, y: 20 }, size: 1 }]);
      result.current.update([{ point: { x: 30, y: 30 }, size: 1 }]);
      result.current.finish();
    });
    expect(options.pushHistory).toHaveBeenCalledTimes(1);
    expect(options.setElements.mock.calls[0][0](options.elements)).toEqual([options.elements[1]]);
    expect(options.setStrokes).not.toHaveBeenCalled();
  });

  it('does not replace the element array when only a stroke is erased', () => {
    const options = createOptions();
    options.strokes = [{
      color: '#111111', id: 'stroke',
      points: [{ pressure: 0.5, x: 500, y: 0 }, { pressure: 0.5, x: 600, y: 0 }],
      size: 1, tool: 'pen' as const,
    }];
    options.spatialIndex = createWhiteboardEraserSpatialIndex(options.elements, options.strokes);
    const { result } = renderHook(() => useWhiteboardEraserGesture(options));

    act(() => {
      result.current.begin([{ point: { x: 550, y: 0 }, size: 1 }]);
      result.current.finish();
    });

    expect(options.setElements).not.toHaveBeenCalled();
    expect(options.setStrokes).toHaveBeenCalledOnce();
  });

  it('restores a stroke crossed again during the same erase gesture', () => {
    const options = createOptions();
    options.elements = [];
    options.strokes = [20, 50, 80].map((y, index) => ({
      color: '#111111',
      id: `stroke-${index + 1}`,
      points: [{ pressure: 0.5, x: -20, y }, { pressure: 0.5, x: 20, y }],
      size: 1,
      tool: 'pen' as const,
    }));
    options.spatialIndex = createWhiteboardEraserSpatialIndex(options.elements, options.strokes);
    const { result } = renderHook(() => useWhiteboardEraserGesture(options));

    act(() => {
      result.current.begin([{ point: { x: 0, y: 0 }, size: 1 }]);
      result.current.update([
        { point: { x: 0, y: 100 }, size: 1 },
        { point: { x: 0, y: 65 }, size: 1 },
      ]);
      result.current.finish();
    });

    const applyDeletion = options.setStrokes.mock.calls[0][0];
    expect(applyDeletion(options.strokes)).toEqual([options.strokes[2]]);
  });

  it('selects a restored stroke again on the third crossing', () => {
    const options = createOptions();
    options.elements = [];
    options.strokes = [{
      color: '#111111', id: 'stroke',
      points: [{ pressure: 0.5, x: -20, y: 50 }, { pressure: 0.5, x: 20, y: 50 }],
      size: 1, tool: 'pen' as const,
    }];
    options.spatialIndex = createWhiteboardEraserSpatialIndex(options.elements, options.strokes);
    const { result } = renderHook(() => useWhiteboardEraserGesture(options));

    act(() => {
      result.current.begin([{ point: { x: 0, y: 0 }, size: 1 }]);
      result.current.update([
        { point: { x: 0, y: 100 }, size: 1 },
        { point: { x: 0, y: 0 }, size: 1 },
        { point: { x: 0, y: 100 }, size: 1 },
      ]);
      result.current.finish();
    });

    const applyDeletion = options.setStrokes.mock.calls[0][0];
    expect(applyDeletion(options.strokes)).toEqual([]);
  });

  it('does not delete when the gesture is cancelled', () => {
    const options = createOptions();
    const { result } = renderHook(() => useWhiteboardEraserGesture(options));
    act(() => {
      result.current.begin([{ point: { x: 20, y: 20 }, size: 1 }]);
      result.current.finish(true);
    });
    expect(options.pushHistory).not.toHaveBeenCalled();
    expect(options.setElements).not.toHaveBeenCalled();
  });

  it('finishes an erase after a stale shared index is rebuilt asynchronously', async () => {
    const options = createOptions();
    options.spatialIndex = createWhiteboardEraserSpatialIndex([], []);
    const { result } = renderHook(() => useWhiteboardEraserGesture(options));

    await act(async () => {
      result.current.begin([{ point: { x: 20, y: 20 }, size: 1 }]);
      result.current.finish();
      await Promise.resolve();
    });

    expect(options.setElements).toHaveBeenCalledOnce();
    expect(options.setElements.mock.calls[0][0](options.elements)).toEqual([options.elements[1]]);
  });
});
