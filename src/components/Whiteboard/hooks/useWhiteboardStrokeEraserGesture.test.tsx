import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
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
  afterEach(() => {
    vi.restoreAllMocks();
  });

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

  it('commits fragments from the same sweep shown in the live preview', () => {
    let publishFrame: FrameRequestCallback | null = null;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      publishFrame = callback;
      return 1;
    });
    const options = createOptions();
    const { result } = renderHook(() => useWhiteboardStrokeEraserGesture(options));

    act(() => result.current.begin([{ point: { x: 50, y: 0 }, size: 1 }]));
    act(() => publishFrame?.(0));
    const preview = result.current.preview?.replacements.get('stroke');
    act(() => result.current.finish());

    const committed = options.setStrokes.mock.calls[0][0];
    expect(preview).toHaveLength(2);
    expect(committed).toEqual(preview);
    expect(committed[0]).toBe(preview?.[0]);
    expect(committed[1]).toBe(preview?.[1]);
  });

  it('updates preview fragments without committing during drag', () => {
    let publishFrame: FrameRequestCallback | null = null;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      publishFrame = callback;
      return 1;
    });
    const options = createOptions();
    const { result } = renderHook(() => useWhiteboardStrokeEraserGesture(options));
    const samples = [
      { point: { x: 40, y: 0 }, size: 1 },
      { point: { x: 60, y: 0 }, size: 1 },
    ];

    act(() => result.current.begin(samples));
    act(() => publishFrame?.(0));

    expect(result.current.preview?.replacements.get('stroke')).toHaveLength(2);
    expect(options.setStrokes).not.toHaveBeenCalled();
  });

  it('keeps generated fragment ids unique from existing source ids', () => {
    const options = createOptions();
    const existing = { ...options.strokes[0], id: 'stroke-part-2', points: options.strokes[0].points.map((point) => ({ ...point, y: 100 })) };
    options.strokes = [...options.strokes, existing];
    options.spatialIndex = createWhiteboardEraserSpatialIndex([], options.strokes);
    const { result } = renderHook(() => useWhiteboardStrokeEraserGesture(options));

    act(() => {
      result.current.begin([{ point: { x: 50, y: 0 }, size: 1 }]);
      result.current.finish();
    });

    const committed = options.setStrokes.mock.calls[0][0];
    expect(new Set(committed.map((stroke: { id: string }) => stroke.id)).size).toBe(committed.length);
  });

  it('does not scan the full stroke array while publishing a local preview', () => {
    let publishFrame: FrameRequestCallback | null = null;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      publishFrame = callback;
      return 1;
    });
    const source = Array.from({ length: 1000 }, (_, index) => ({
      color: '#111111',
      id: `stroke-${index}`,
      points: [
        { pressure: 0.5, x: index * 1000, y: 0 },
        { pressure: 0.5, x: index * 1000 + 100, y: 0 },
      ],
      size: 1,
      tool: 'pen' as const,
    }));
    let failOnItemAccess = false;
    const strokes = new Proxy(source, {
      get(target, property, receiver) {
        if (failOnItemAccess && typeof property === 'string' && /^\d+$/.test(property)) {
          throw new Error('all strokes were inspected while publishing the preview');
        }
        return Reflect.get(target, property, receiver);
      },
    });
    const options = {
      pushHistory: vi.fn(),
      setStrokes: vi.fn(),
      spatialIndex: createWhiteboardEraserSpatialIndex([], strokes),
      strokes,
    };
    const { result } = renderHook(() => useWhiteboardStrokeEraserGesture(options));

    act(() => result.current.begin([{ point: { x: 50, y: 0 }, size: 1 }]));
    failOnItemAccess = true;
    act(() => publishFrame?.(0));

    expect(result.current.preview).not.toBeNull();
  });

  it('finishes a partial erase after a stale shared index is rebuilt asynchronously', async () => {
    const options = createOptions();
    options.spatialIndex = createWhiteboardEraserSpatialIndex([], []);
    const { result } = renderHook(() => useWhiteboardStrokeEraserGesture(options));

    await act(async () => {
      result.current.begin([{ point: { x: 50, y: 0 }, size: 1 }]);
      result.current.finish();
      await Promise.resolve();
    });

    expect(options.pushHistory).toHaveBeenCalledOnce();
    expect(options.setStrokes.mock.calls[0][0]).toHaveLength(2);
  });
});
