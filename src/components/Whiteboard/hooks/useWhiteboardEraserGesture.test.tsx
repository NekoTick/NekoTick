import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useWhiteboardEraserGesture } from './useWhiteboardEraserGesture';
import { createWhiteboardEraserSpatialIndex } from '../model/whiteboardEraser';

function createOptions() {
  const elements = [
    { height: 80, id: 'image-1', text: '', type: 'image' as const, width: 100, x: 0, y: 0 },
    { height: 80, id: 'image-2', text: '', type: 'image' as const, width: 100, x: 200, y: 0 },
  ];
  return {
    elements,
    pushHistory: vi.fn(),
    setElements: vi.fn(),
    setStrokes: vi.fn(),
    spatialIndex: createWhiteboardEraserSpatialIndex(elements, []),
    strokes: [],
  };
}

describe('useWhiteboardEraserGesture', () => {
  it('commits complete image deletion once when the gesture finishes', () => {
    const options = createOptions();
    const { result } = renderHook(() => useWhiteboardEraserGesture(options));
    act(() => {
      result.current.begin([{ point: { x: 20, y: 20 }, size: 1 }]);
      result.current.finish();
    });
    expect(options.pushHistory).toHaveBeenCalledTimes(1);
    expect(options.setElements.mock.calls[0][0](options.elements)).toEqual([options.elements[1]]);
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

  it('rebuilds a stale shared index when an erase gesture starts immediately after content changes', () => {
    const options = createOptions();
    options.spatialIndex = createWhiteboardEraserSpatialIndex([], []);
    const { result } = renderHook(() => useWhiteboardEraserGesture(options));

    act(() => {
      result.current.begin([{ point: { x: 20, y: 20 }, size: 1 }]);
      result.current.finish();
    });

    expect(options.setElements).toHaveBeenCalledOnce();
    expect(options.setElements.mock.calls[0][0](options.elements)).toEqual([options.elements[1]]);
  });
});
