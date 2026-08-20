import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NATIVE_CARET_OVERLAY_REFRESH_EVENT } from '@/hooks/useNativeCaretOverlay';
import {
  shouldRefreshMovedCaret,
  useChatInputCaretLayoutSync,
} from './useChatInputCaretLayoutSync';

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('shouldRefreshMovedCaret', () => {
  const initial = { height: 24, left: 100, top: 500, width: 240 };

  it('detects a focused textarea moved by content inserted before it', () => {
    expect(shouldRefreshMovedCaret(
      initial,
      { ...initial, top: 550 },
      true,
      false,
    )).toBe(true);
  });

  it('ignores normal textarea growth while typing', () => {
    expect(shouldRefreshMovedCaret(
      initial,
      { ...initial, height: 48, top: 476 },
      true,
      false,
    )).toBe(false);
  });

  it('detects a width-driven layout change even when wrapping also changes height', () => {
    expect(shouldRefreshMovedCaret(
      initial,
      { ...initial, height: 48, left: 80, top: 476, width: 180 },
      true,
      false,
    )).toBe(true);
  });

  it('does not interrupt composition or an unfocused textarea', () => {
    const moved = { ...initial, top: 550 };
    expect(shouldRefreshMovedCaret(initial, moved, true, true)).toBe(false);
    expect(shouldRefreshMovedCaret(initial, moved, false, false)).toBe(false);
  });
});

describe('useChatInputCaretLayoutSync', () => {
  it('refreshes a moved caret without changing the real textarea selection', () => {
    let resizeCallback: ResizeObserverCallback | null = null;
    class MockResizeObserver {
      constructor(callback: ResizeObserverCallback) {
        resizeCallback = callback;
      }
      observe() {}
      disconnect() {}
    }
    vi.stubGlobal('ResizeObserver', MockResizeObserver);
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callback(0);
      return 1;
    });

    const composer = document.createElement('div');
    const textarea = document.createElement('textarea');
    textarea.value = '1234';
    composer.appendChild(textarea);
    document.body.appendChild(composer);
    let top = 100;
    vi.spyOn(textarea, 'getBoundingClientRect').mockImplementation(() => ({
      bottom: top + 24,
      height: 24,
      left: 50,
      right: 290,
      top,
      width: 240,
      x: 50,
      y: top,
      toJSON: () => ({}),
    }));
    textarea.focus();
    textarea.setSelectionRange(2, 2);
    const blur = vi.spyOn(textarea, 'blur');
    const setSelectionRange = vi.spyOn(textarea, 'setSelectionRange');
    const handleRefresh = vi.fn();
    document.addEventListener(NATIVE_CARET_OVERLAY_REFRESH_EVENT, handleRefresh);

    const hook = renderHook(() => useChatInputCaretLayoutSync({
      composerRootRef: { current: composer },
      isComposing: false,
      message: textarea.value,
      textareaRef: { current: textarea },
    }));

    top = 140;
    resizeCallback?.([], {} as ResizeObserver);

    expect(handleRefresh).toHaveBeenCalledTimes(1);
    expect(blur).not.toHaveBeenCalled();
    expect(setSelectionRange).not.toHaveBeenCalled();
    expect(textarea.selectionStart).toBe(2);
    expect(textarea.selectionEnd).toBe(2);
    expect(textarea.value).toBe('1234');

    hook.unmount();
    document.removeEventListener(NATIVE_CARET_OVERLAY_REFRESH_EVENT, handleRefresh);
  });

  it('refreshes a focused caret after the composer is programmatically cleared', () => {
    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);
    textarea.focus();
    const handleRefresh = vi.fn();
    document.addEventListener(NATIVE_CARET_OVERLAY_REFRESH_EVENT, handleRefresh);

    const { rerender } = renderHook(
      ({ message }) => useChatInputCaretLayoutSync({
        composerRootRef: { current: null },
        isComposing: false,
        message,
        textareaRef: { current: textarea },
      }),
      { initialProps: { message: 'hello' } },
    );

    rerender({ message: '' });

    expect(handleRefresh).toHaveBeenCalledTimes(1);
    document.removeEventListener(NATIVE_CARET_OVERLAY_REFRESH_EVENT, handleRefresh);
  });

  it('does not refresh while the composer remains populated or unfocused', () => {
    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);
    const handleRefresh = vi.fn();
    document.addEventListener(NATIVE_CARET_OVERLAY_REFRESH_EVENT, handleRefresh);

    const { rerender } = renderHook(
      ({ message }) => useChatInputCaretLayoutSync({
        composerRootRef: { current: null },
        isComposing: false,
        message,
        textareaRef: { current: textarea },
      }),
      { initialProps: { message: 'hello' } },
    );

    rerender({ message: 'hello again' });
    rerender({ message: '' });

    expect(handleRefresh).not.toHaveBeenCalled();
    document.removeEventListener(NATIVE_CARET_OVERLAY_REFRESH_EVENT, handleRefresh);
  });
});
