import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  calculateWindowResizeCompensationPx,
  useWindowResizeLagCompensation,
} from './useWindowResizeLagCompensation';

vi.mock('@/lib/electron/bridge', () => ({
  isElectronRuntime: () => true,
}));

vi.mock('@/lib/desktop/platform', () => ({
  isNativeWindows: () => true,
}));

function setWindowWidths({ innerWidth, outerWidth }: { innerWidth: number; outerWidth: number }) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: innerWidth });
  Object.defineProperty(window, 'outerWidth', { configurable: true, value: outerWidth });
}

describe('calculateWindowResizeCompensationPx', () => {
  it('returns zero when the native frame gap is stable', () => {
    expect(calculateWindowResizeCompensationPx({
      baselineGap: 16,
      innerWidth: 980,
      outerWidth: 996,
    })).toBe(0);
  });

  it('tracks native outer width while the renderer viewport lags', () => {
    expect(calculateWindowResizeCompensationPx({
      baselineGap: 16,
      innerWidth: 1000,
      outerWidth: 1136,
    })).toBe(120);
  });

  it('tracks native shrink before the renderer viewport catches up', () => {
    expect(calculateWindowResizeCompensationPx({
      baselineGap: 16,
      innerWidth: 1373,
      outerWidth: 1044,
    })).toBe(-345);
  });
});

describe('useWindowResizeLagCompensation', () => {
  beforeEach(() => {
    setWindowWidths({ innerWidth: 980, outerWidth: 996 });
    vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1);
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
  });

  afterEach(() => {
    document.documentElement.style.removeProperty('--vlaina-window-resize-compensation-x');
    vi.restoreAllMocks();
  });

  it('updates compensation synchronously when resize events catch the renderer viewport up', () => {
    const { unmount } = renderHook(() => useWindowResizeLagCompensation());

    setWindowWidths({ innerWidth: 980, outerWidth: 1388 });
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });

    expect(document.documentElement.style.getPropertyValue('--vlaina-window-resize-compensation-x')).toBe('392px');

    setWindowWidths({ innerWidth: 1372, outerWidth: 1388 });
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });

    expect(document.documentElement.style.getPropertyValue('--vlaina-window-resize-compensation-x')).toBe('0px');
    unmount();
  });

  it('does not keep an animation frame loop alive while the window is idle', () => {
    const requestAnimationFrameSpy = vi.mocked(window.requestAnimationFrame);
    const cancelAnimationFrameSpy = vi.mocked(window.cancelAnimationFrame);
    const { unmount } = renderHook(() => useWindowResizeLagCompensation());

    expect(requestAnimationFrameSpy).not.toHaveBeenCalled();

    act(() => {
      window.dispatchEvent(new Event('resize'));
      window.dispatchEvent(new Event('resize'));
    });

    expect(requestAnimationFrameSpy).toHaveBeenCalledTimes(1);
    unmount();
    expect(cancelAnimationFrameSpy).toHaveBeenCalledWith(1);
  });
});
