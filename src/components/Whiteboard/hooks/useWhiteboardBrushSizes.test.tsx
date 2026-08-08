import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useWhiteboardBrushSizes } from './useWhiteboardBrushSizes';

describe('useWhiteboardBrushSizes', () => {
  it('uses one color for every drawing tool and updates them together', () => {
    const { result } = renderHook(() => useWhiteboardBrushSizes());
    expect(new Set(Object.values(result.current.brushColors))).toEqual(new Set(['#000000']));

    act(() => result.current.setBrushColor('marker', '#43A555'));

    expect(new Set(Object.values(result.current.brushColors))).toEqual(new Set(['#43A555']));
  });
});
