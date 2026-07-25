import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WHITEBOARD_DRAFT_PREVIEW_MAX_POINTS, useWhiteboardDraftStroke } from './useWhiteboardDraftStroke';

describe('useWhiteboardDraftStroke', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('bounds live preview points without truncating the committed stroke', () => {
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
    const points = Array.from({ length: WHITEBOARD_DRAFT_PREVIEW_MAX_POINTS * 3 }, (_, index) => ({
      pressure: 0.5,
      x: index + 1,
      y: 0,
    }));

    act(() => result.current.setDraftStroke(initial));
    act(() => result.current.appendDraftPoints('pen', points, 0));
    expect(callbacks).toHaveLength(1);

    act(() => callbacks[0](0));

    expect(result.current.draftStroke?.points.length).toBeLessThanOrEqual(WHITEBOARD_DRAFT_PREVIEW_MAX_POINTS);
    expect(result.current.draftStroke?.points.at(-1)?.x).toBe(points.at(-1)?.x);
    expect(result.current.getDraftStroke()?.points).toHaveLength(points.length + 1);
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
