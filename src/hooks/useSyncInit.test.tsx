import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSyncInit } from './useSyncInit';

const mocks = vi.hoisted(() => ({
  checkStatus: vi.fn().mockResolvedValue(undefined),
  handleAuthCallback: vi.fn().mockResolvedValue(false),
  hydrateAvatar: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/stores/accountSession', () => {
  const state = {
    checkStatus: mocks.checkStatus,
    handleAuthCallback: mocks.handleAuthCallback,
    hydrateAvatar: mocks.hydrateAvatar,
    isConnected: true,
  };
  const store = ((selector: (value: typeof state) => unknown) => selector(state)) as typeof state & {
    getState: () => typeof state;
  };
  store.getState = () => state;
  return { useAccountSessionStore: store };
});

vi.mock('@/lib/desktop/backend', () => ({
  hasElectronDesktopBridge: () => false,
}));

function setVisibility(value: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value });
}

describe('useSyncInit', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.checkStatus.mockClear();
    mocks.handleAuthCallback.mockClear();
    mocks.hydrateAvatar.mockClear();
    setVisibility('visible');
  });

  afterEach(() => {
    vi.useRealTimers();
    setVisibility('visible');
  });

  it('pauses token polling while hidden and refreshes when visible again', () => {
    const { unmount } = renderHook(() => useSyncInit());
    mocks.checkStatus.mockClear();

    act(() => {
      vi.advanceTimersByTime(4 * 60 * 1000);
    });
    expect(mocks.checkStatus).toHaveBeenCalledTimes(1);

    setVisibility('hidden');
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
      vi.advanceTimersByTime(8 * 60 * 1000);
    });
    expect(mocks.checkStatus).toHaveBeenCalledTimes(1);

    setVisibility('visible');
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(mocks.checkStatus).toHaveBeenCalledTimes(2);

    act(() => {
      vi.advanceTimersByTime(4 * 60 * 1000);
    });
    expect(mocks.checkStatus).toHaveBeenCalledTimes(3);

    unmount();
    act(() => {
      vi.advanceTimersByTime(4 * 60 * 1000);
    });
    expect(mocks.checkStatus).toHaveBeenCalledTimes(3);
  });

  it('does not start a timer when initially hidden', () => {
    setVisibility('hidden');
    const { unmount } = renderHook(() => useSyncInit());
    mocks.checkStatus.mockClear();

    act(() => {
      vi.advanceTimersByTime(8 * 60 * 1000);
    });
    expect(mocks.checkStatus).not.toHaveBeenCalled();

    setVisibility('visible');
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(mocks.checkStatus).toHaveBeenCalledTimes(1);
    unmount();
  });
});
