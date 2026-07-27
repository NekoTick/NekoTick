import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useWhiteboardDraftStroke } from './useWhiteboardDraftStroke';

describe('useWhiteboardDraftStroke', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps the live preview in sync with the committed points during a long stroke', () => {
    const callbacks: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callbacks.push(callback);
      return callbacks.length;
    });
    const { result } = renderHook(() => useWhiteboardDraftStroke());
    const initial = {
      color: '#111111',
      id: 'draft',
      points: [{ pressure: 0.5, x: 0, y: 0 }],
      size: 1,
      tool: 'pen' as const,
    };
    const points = Array.from({ length: 1_000 }, (_, index) => ({
      pressure: 0.5,
      x: Math.cos(index) * 20,
      y: Math.sin(index) * 20,
    }));

    act(() => result.current.setDraftStroke(initial));
    act(() => result.current.appendDraftPoints('pen', points, 0));
    expect(callbacks).toHaveLength(1);

    act(() => callbacks[0](0));

    expect(result.current.getDraftStroke()?.points).toHaveLength(points.length + 1);
    expect(result.current.draftStroke?.points).toBe(result.current.getDraftStroke()?.points);
  });

  it('does not schedule a frame when all samples are below the distance threshold', () => {
    const requestAnimationFrame = vi.spyOn(window, 'requestAnimationFrame');
    const { result } = renderHook(() => useWhiteboardDraftStroke());
    act(() => result.current.setDraftStroke({
      color: '#111111',
      id: 'draft',
      points: [{ pressure: 0.5, x: 0, y: 0 }],
      size: 1,
      tool: 'pen',
    }));

    act(() => result.current.appendDraftPoints('pen', [{ pressure: 0.5, x: 0.1, y: 0 }], 1));

    expect(requestAnimationFrame).not.toHaveBeenCalled();
  });
});
