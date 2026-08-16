import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createSpatialIndex: vi.fn(),
}));

vi.mock('@/components/Whiteboard/model/interaction/whiteboardEraser', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/Whiteboard/model/interaction/whiteboardEraser')>();
  return {
    ...actual,
    createWhiteboardEraserSpatialIndex: (...args: Parameters<typeof actual.createWhiteboardEraserSpatialIndex>) => {
      mocks.createSpatialIndex();
      return actual.createWhiteboardEraserSpatialIndex(...args);
    },
  };
});

import { useWhiteboardController } from './useWhiteboardController';

describe('useWhiteboardController performance boundaries', () => {
  beforeEach(() => {
    mocks.createSpatialIndex.mockClear();
  });

  it('does not rebuild the spatial index when unrelated state rerenders the controller', () => {
    const { result } = renderHook(() => useWhiteboardController({ active: false }));
    const initialBuildCount = mocks.createSpatialIndex.mock.calls.length;

    act(() => result.current.setTool('pen'));

    expect(initialBuildCount).toBeGreaterThan(0);
    expect(mocks.createSpatialIndex).toHaveBeenCalledTimes(initialBuildCount);
  });
});
