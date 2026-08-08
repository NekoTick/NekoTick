import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NATIVE_CARET_OVERLAY_REFRESH_EVENT, useNativeCaretOverlay } from './useNativeCaretOverlay';

function rect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    x: left,
    y: top,
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
    toJSON: () => ({}),
  } as DOMRect;
}

describe('useNativeCaretOverlay', () => {
  let requestAnimationFrameSpy: ReturnType<typeof vi.spyOn>;
  let cancelAnimationFrameSpy: ReturnType<typeof vi.spyOn>;
  let elementFromPoint: ReturnType<typeof vi.fn>;
  let originalElementFromPoint: typeof document.elementFromPoint | undefined;

  beforeEach(() => {
    originalElementFromPoint = document.elementFromPoint;
    elementFromPoint = vi.fn();
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: elementFromPoint,
    });
    requestAnimationFrameSpy = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((callback: FrameRequestCallback) => {
        callback(0);
        return 1;
      });
    cancelAnimationFrameSpy = vi
      .spyOn(window, 'cancelAnimationFrame')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    document.body.innerHTML = '';
    document.head.querySelector('#native-caret-overlay-style')?.remove();
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: originalElementFromPoint,
    });
    requestAnimationFrameSpy.mockRestore();
    cancelAnimationFrameSpy.mockRestore();
    vi.restoreAllMocks();
  });

  it('keeps the caret visible when a chat composer decoration owns the caret point', () => {
    const root = document.createElement('div');
    root.dataset.chatInput = 'true';
    const textarea = document.createElement('textarea');
    textarea.value = 'hello';
    textarea.selectionStart = 2;
    textarea.selectionEnd = 2;
    vi.spyOn(textarea, 'getBoundingClientRect').mockReturnValue(rect(120, 180, 240, 48));
    const decoration = document.createElement('span');
    root.append(textarea, decoration);
    document.body.appendChild(root);
    elementFromPoint.mockReturnValue(decoration);

    const hook = renderHook(() => useNativeCaretOverlay());

    act(() => {
      textarea.focus();
      document.dispatchEvent(new Event(NATIVE_CARET_OVERLAY_REFRESH_EVENT));
    });

    expect(document.querySelector('.native-caret-overlay')).toBeInTheDocument();
    expect(textarea).toHaveAttribute('data-native-caret-overlay-active', 'true');

    hook.unmount();
  });

  it('matches textarea carets to the rendered line height', () => {
    const textarea = document.createElement('textarea');
    textarea.style.lineHeight = '24px';
    textarea.value = 'hello';
    textarea.selectionStart = 2;
    textarea.selectionEnd = 2;
    vi.spyOn(textarea, 'getBoundingClientRect').mockReturnValue(rect(120, 180, 240, 48));
    document.body.appendChild(textarea);
    elementFromPoint.mockReturnValue(textarea);

    const hook = renderHook(() => useNativeCaretOverlay());

    act(() => {
      textarea.focus();
      document.dispatchEvent(new Event(NATIVE_CARET_OVERLAY_REFRESH_EVENT));
    });

    expect(document.querySelector<HTMLElement>('.native-caret-overlay')?.style.height).toBe('24px');

    hook.unmount();
  });

  it('hides the caret when another surface covers the focused composer', () => {
    const root = document.createElement('div');
    root.dataset.chatInput = 'true';
    const textarea = document.createElement('textarea');
    textarea.value = 'hello';
    textarea.selectionStart = 2;
    textarea.selectionEnd = 2;
    vi.spyOn(textarea, 'getBoundingClientRect').mockReturnValue(rect(120, 180, 240, 48));
    const sidebar = document.createElement('aside');
    root.appendChild(textarea);
    document.body.append(root, sidebar);
    elementFromPoint
      .mockReturnValueOnce(textarea)
      .mockReturnValueOnce(textarea)
      .mockReturnValue(sidebar);

    const hook = renderHook(() => useNativeCaretOverlay());

    act(() => {
      textarea.focus();
      document.dispatchEvent(new Event(NATIVE_CARET_OVERLAY_REFRESH_EVENT));
    });
    expect(document.querySelector('.native-caret-overlay')).toBeInTheDocument();

    act(() => {
      document.dispatchEvent(new Event(NATIVE_CARET_OVERLAY_REFRESH_EVENT));
    });

    expect(document.querySelector('.native-caret-overlay')).not.toBeInTheDocument();
    expect(textarea).not.toHaveAttribute('data-native-caret-overlay-active');

    hook.unmount();
  });

  it.each(['animationend', 'transitionend'])(
    'refreshes the caret after a surrounding %s event',
    (eventName) => {
      const shell = document.createElement('div');
      const textarea = document.createElement('textarea');
      textarea.value = '';
      textarea.selectionStart = 0;
      textarea.selectionEnd = 0;
      const getRect = vi.spyOn(textarea, 'getBoundingClientRect')
        .mockReturnValue(rect(120, 180, 240, 48));
      shell.appendChild(textarea);
      document.body.appendChild(shell);
      elementFromPoint.mockReturnValue(textarea);

      const hook = renderHook(() => useNativeCaretOverlay());

      act(() => {
        textarea.focus();
        document.dispatchEvent(new Event(NATIVE_CARET_OVERLAY_REFRESH_EVENT));
      });
      const initialLeft = Number.parseFloat(
        document.querySelector<HTMLElement>('.native-caret-overlay')?.style.left ?? '',
      );

      getRect.mockReturnValue(rect(220, 180, 240, 48));
      act(() => {
        shell.dispatchEvent(new Event(eventName, { bubbles: true }));
      });

      const nextLeft = Number.parseFloat(
        document.querySelector<HTMLElement>('.native-caret-overlay')?.style.left ?? '',
      );
      expect(nextLeft - initialLeft).toBe(100);

      hook.unmount();
    },
  );

  it('does not refresh the caret overlay during IME composition keydown', () => {
    const root = document.createElement('div');
    root.dataset.chatInput = 'true';
    const textarea = document.createElement('textarea');
    textarea.value = 'hello';
    textarea.selectionStart = 2;
    textarea.selectionEnd = 2;
    vi.spyOn(textarea, 'getBoundingClientRect').mockReturnValue(rect(120, 180, 240, 48));
    root.appendChild(textarea);
    document.body.appendChild(root);
    elementFromPoint.mockReturnValue(textarea);

    const hook = renderHook(() => useNativeCaretOverlay());

    act(() => {
      textarea.focus();
      document.dispatchEvent(new Event(NATIVE_CARET_OVERLAY_REFRESH_EVENT));
    });
    requestAnimationFrameSpy.mockClear();

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'ArrowLeft',
        bubbles: true,
        isComposing: true,
      }));
    });

    expect(requestAnimationFrameSpy).not.toHaveBeenCalled();

    hook.unmount();
  });

  it('leaves opted-out textareas on the native caret', () => {
    const textarea = document.createElement('textarea');
    textarea.setAttribute('data-native-caret-overlay-disabled', 'true');
    textarea.value = 'source markdown';
    textarea.selectionStart = 6;
    textarea.selectionEnd = 6;
    vi.spyOn(textarea, 'getBoundingClientRect').mockReturnValue(rect(120, 180, 240, 48));
    document.body.appendChild(textarea);
    elementFromPoint.mockReturnValue(textarea);

    const hook = renderHook(() => useNativeCaretOverlay());

    act(() => {
      textarea.focus();
      document.dispatchEvent(new Event(NATIVE_CARET_OVERLAY_REFRESH_EVENT));
    });

    expect(document.querySelector('.native-caret-overlay')).not.toBeInTheDocument();
    expect(textarea).not.toHaveAttribute('data-native-caret-overlay-active');

    requestAnimationFrameSpy.mockClear();
    act(() => {
      textarea.dispatchEvent(new InputEvent('input', { bubbles: true }));
      textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'x', bubbles: true }));
      textarea.dispatchEvent(new KeyboardEvent('keyup', { key: 'x', bubbles: true }));
      document.dispatchEvent(new Event('selectionchange'));
    });

    expect(requestAnimationFrameSpy).not.toHaveBeenCalled();

    hook.unmount();
  });

  it('cancels a queued caret measurement when focus moves to an opted-out textarea', () => {
    requestAnimationFrameSpy.mockImplementation(() => 7);
    const input = document.createElement('input');
    const textarea = document.createElement('textarea');
    textarea.setAttribute('data-native-caret-overlay-disabled', 'true');
    document.body.append(input, textarea);
    const hook = renderHook(() => useNativeCaretOverlay());

    act(() => input.focus());
    cancelAnimationFrameSpy.mockClear();
    act(() => textarea.focus());

    expect(cancelAnimationFrameSpy).toHaveBeenCalledWith(7);
    expect(requestAnimationFrameSpy).toHaveBeenCalledTimes(1);

    hook.unmount();
  });
});
