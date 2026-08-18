import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  calculateWindowResizeCompensationPx,
  useWindowResizeLagCompensation,
} from './useWindowResizeLagCompensation';
import type { ElectronWindowBoundsChanged } from '@/lib/electron/bridge';

const electronBridgeMocks = vi.hoisted(() => ({
  onBoundsChanged: vi.fn(),
}));
const platformMocks = vi.hoisted(() => ({
  isNativeWindows: true,
}));

vi.mock('@/lib/electron/bridge', () => ({
  getElectronBridge: () => ({
    window: {
      onBoundsChanged: electronBridgeMocks.onBoundsChanged,
    },
  }),
  isElectronRuntime: () => true,
}));

vi.mock('@/lib/desktop/platform', () => ({
  isNativeWindows: () => platformMocks.isNativeWindows,
}));

function setWindowWidths({ innerWidth, outerWidth }: { innerWidth: number; outerWidth: number }) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: innerWidth });
  Object.defineProperty(window, 'outerWidth', { configurable: true, value: outerWidth });
}

describe('calculateWindowResizeCompensationPx', () => {
  it('returns zero when the native frame gap is stable', () => {
    expect(calculateWindowResizeCompensationPx({
      innerWidth: 980,
      targetContentWidth: 980,
    })).toBe(0);
  });

  it('tracks native outer width while the renderer viewport lags', () => {
    expect(calculateWindowResizeCompensationPx({
      innerWidth: 1000,
      targetContentWidth: 1120,
    })).toBe(120);
  });

  it('tracks native shrink before the renderer viewport catches up', () => {
    expect(calculateWindowResizeCompensationPx({
      innerWidth: 1373,
      targetContentWidth: 1028,
    })).toBe(-345);
  });
});

describe('useWindowResizeLagCompensation', () => {
  let boundsChangedListener: ((bounds: ElectronWindowBoundsChanged) => void) | null;
  let removeBoundsChangedListener: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    platformMocks.isNativeWindows = true;
    boundsChangedListener = null;
    removeBoundsChangedListener = vi.fn();
    electronBridgeMocks.onBoundsChanged.mockClear();
    electronBridgeMocks.onBoundsChanged.mockImplementation((listener) => {
      boundsChangedListener = listener;
      return removeBoundsChangedListener;
    });
    setWindowWidths({ innerWidth: 980, outerWidth: 996 });
    vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1);
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
  });

  afterEach(() => {
    document.documentElement.style.removeProperty('--vlaina-window-resize-compensation-x');
    document.documentElement.style.removeProperty('--vlaina-window-resize-content-compensation-x');
    vi.restoreAllMocks();
  });

  it('uses main-process bounds before the renderer outer width changes', () => {
    const { unmount } = renderHook(() => useWindowResizeLagCompensation());

    act(() => {
      boundsChangedListener?.({ width: 1388, height: 900 });
    });
    expect(document.documentElement.style.getPropertyValue('--vlaina-window-resize-compensation-x')).toBe('392px');
    expect(document.documentElement.style.getPropertyValue('--vlaina-window-resize-content-compensation-x')).toBe('196px');

    setWindowWidths({ innerWidth: 1372, outerWidth: 996 });
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });
    expect(document.documentElement.style.getPropertyValue('--vlaina-window-resize-compensation-x')).toBe('0px');
    expect(document.documentElement.style.getPropertyValue('--vlaina-window-resize-content-compensation-x')).toBe('0px');

    unmount();
    expect(removeBoundsChangedListener).toHaveBeenCalledTimes(1);
  });

  it('does not install resize compensation on non-Windows Electron', () => {
    platformMocks.isNativeWindows = false;
    const { unmount } = renderHook(() => useWindowResizeLagCompensation());

    expect(electronBridgeMocks.onBoundsChanged).not.toHaveBeenCalled();
    expect(document.documentElement.style.getPropertyValue('--vlaina-window-resize-compensation-x')).toBe('');
    expect(document.documentElement.style.getPropertyValue('--vlaina-window-resize-content-compensation-x')).toBe('');

    unmount();
  });

  it('updates compensation synchronously when resize events catch the renderer viewport up', () => {
    const { unmount } = renderHook(() => useWindowResizeLagCompensation());

    setWindowWidths({ innerWidth: 980, outerWidth: 1388 });
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });

    expect(document.documentElement.style.getPropertyValue('--vlaina-window-resize-compensation-x')).toBe('392px');
    expect(document.documentElement.style.getPropertyValue('--vlaina-window-resize-content-compensation-x')).toBe('196px');

    setWindowWidths({ innerWidth: 1372, outerWidth: 1388 });
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });

    expect(document.documentElement.style.getPropertyValue('--vlaina-window-resize-compensation-x')).toBe('0px');
    expect(document.documentElement.style.getPropertyValue('--vlaina-window-resize-content-compensation-x')).toBe('0px');
    unmount();
  });

  it('coalesces resize events into one animation frame', () => {
    const requestAnimationFrameSpy = vi.mocked(window.requestAnimationFrame);
    const cancelAnimationFrameSpy = vi.mocked(window.cancelAnimationFrame);
    const { unmount } = renderHook(() => useWindowResizeLagCompensation());

    requestAnimationFrameSpy.mockClear();
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
