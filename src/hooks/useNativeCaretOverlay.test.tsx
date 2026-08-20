import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useUIStore } from '@/stores/uiSlice';
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
    useUIStore.setState({ layoutPanelDragging: false });
    document.documentElement.removeAttribute('data-layout-panel-dragging');
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
    useUIStore.setState({ layoutPanelDragging: false });
    document.body.innerHTML = '';
    document.documentElement.removeAttribute('data-layout-panel-dragging');
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

  it('hides the caret throughout a layout drag and restores it without moving focus', () => {
    const textarea = document.createElement('textarea');
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
    expect(document.querySelector('.native-caret-overlay')).toBeInTheDocument();

    act(() => useUIStore.getState().setLayoutPanelDragging(true));

    expect(document.documentElement).toHaveAttribute('data-layout-panel-dragging', 'true');
    expect(document.querySelector('.native-caret-overlay')).not.toBeInTheDocument();
    expect(textarea).not.toHaveAttribute('data-native-caret-overlay-active');
    expect(textarea).toHaveFocus();
    expect(textarea.selectionStart).toBe(2);

    act(() => {
      document.dispatchEvent(new Event(NATIVE_CARET_OVERLAY_REFRESH_EVENT));
      window.dispatchEvent(new Event('resize'));
    });
    expect(document.querySelector('.native-caret-overlay')).not.toBeInTheDocument();

    act(() => useUIStore.getState().setLayoutPanelDragging(false));

    expect(document.documentElement).not.toHaveAttribute('data-layout-panel-dragging');
    expect(document.querySelector('.native-caret-overlay')).toBeInTheDocument();
    expect(textarea).toHaveFocus();
    expect(textarea.selectionStart).toBe(2);

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

  it.each([
    ['animationstart', 'animationend'],
    ['transitionrun', 'transitionend'],
  ] as const)('falls back to the native caret for the duration of a %s motion', (startEvent, endEvent) => {
    const shell = document.createElement('div');
    const textarea = document.createElement('textarea');
    textarea.value = 'hello';
    textarea.selectionStart = 2;
    textarea.selectionEnd = 2;
    vi.spyOn(textarea, 'getBoundingClientRect').mockReturnValue(rect(120, 180, 240, 48));
    shell.appendChild(textarea);
    document.body.appendChild(shell);
    elementFromPoint.mockReturnValue(textarea);

    const hook = renderHook(() => useNativeCaretOverlay());

    act(() => {
      textarea.focus();
      document.dispatchEvent(new Event(NATIVE_CARET_OVERLAY_REFRESH_EVENT));
    });
    expect(document.querySelector('.native-caret-overlay')).toBeInTheDocument();

    shell.style.transform = 'matrix(1, 0, 0, 1, 48, 0)';
    act(() => shell.dispatchEvent(new Event(startEvent, { bubbles: true })));

    expect(document.querySelector('.native-caret-overlay')).not.toBeInTheDocument();
    expect(textarea).not.toHaveAttribute('data-native-caret-overlay-active');
    expect(textarea).toHaveFocus();

    shell.style.transform = 'none';
    act(() => shell.dispatchEvent(new Event(endEvent, { bubbles: true })));

    expect(document.querySelector('.native-caret-overlay')).toBeInTheDocument();
    expect(textarea).toHaveAttribute('data-native-caret-overlay-active', 'true');

    hook.unmount();
  });

  it('remembers a CSS motion that starts before the text control receives focus', () => {
    const shell = document.createElement('div');
    const textarea = document.createElement('textarea');
    textarea.value = 'hello';
    textarea.selectionStart = 2;
    textarea.selectionEnd = 2;
    vi.spyOn(textarea, 'getBoundingClientRect').mockReturnValue(rect(120, 180, 240, 48));
    shell.appendChild(textarea);
    document.body.appendChild(shell);
    elementFromPoint.mockReturnValue(textarea);

    const hook = renderHook(() => useNativeCaretOverlay());

    shell.style.transform = 'matrix(1, 0, 0, 1, 48, 0)';
    act(() => shell.dispatchEvent(new Event('transitionrun', { bubbles: true })));
    act(() => textarea.focus());

    expect(document.querySelector('.native-caret-overlay')).not.toBeInTheDocument();

    shell.style.transform = 'none';
    act(() => shell.dispatchEvent(new Event('transitionend', { bubbles: true })));

    expect(document.querySelector('.native-caret-overlay')).toBeInTheDocument();
    expect(textarea).toHaveAttribute('data-native-caret-overlay-active', 'true');

    hook.unmount();
  });

  it('keeps the overlay visible for transitions that cannot move the caret', () => {
    const shell = document.createElement('div');
    const textarea = document.createElement('textarea');
    textarea.value = 'hello';
    textarea.selectionStart = 2;
    textarea.selectionEnd = 2;
    vi.spyOn(textarea, 'getBoundingClientRect').mockReturnValue(rect(120, 180, 240, 48));
    shell.appendChild(textarea);
    document.body.appendChild(shell);
    elementFromPoint.mockReturnValue(textarea);

    const hook = renderHook(() => useNativeCaretOverlay());

    act(() => {
      textarea.focus();
      document.dispatchEvent(new Event(NATIVE_CARET_OVERLAY_REFRESH_EVENT));
    });

    const start = new Event('transitionrun', { bubbles: true });
    Object.defineProperty(start, 'propertyName', { value: 'box-shadow' });
    const end = new Event('transitionend', { bubbles: true });
    Object.defineProperty(end, 'propertyName', { value: 'box-shadow' });
    act(() => shell.dispatchEvent(start));

    expect(document.querySelector('.native-caret-overlay')).toBeInTheDocument();
    expect(textarea).toHaveAttribute('data-native-caret-overlay-active', 'true');

    act(() => shell.dispatchEvent(end));
    expect(document.querySelector('.native-caret-overlay')).toBeInTheDocument();

    hook.unmount();
  });

  it('does not let unrelated animated decorations hide the focused caret', () => {
    const shell = document.createElement('div');
    const textarea = document.createElement('textarea');
    textarea.value = 'hello';
    textarea.selectionStart = 2;
    textarea.selectionEnd = 2;
    const decoration = document.createElement('span');
    shell.append(textarea, decoration);
    document.body.appendChild(shell);
    vi.spyOn(textarea, 'getBoundingClientRect').mockReturnValue(rect(120, 180, 240, 48));
    elementFromPoint.mockReturnValue(textarea);

    const hook = renderHook(() => useNativeCaretOverlay());

    act(() => {
      textarea.focus();
      document.dispatchEvent(new Event(NATIVE_CARET_OVERLAY_REFRESH_EVENT));
    });
    expect(document.querySelector('.native-caret-overlay')).toBeInTheDocument();

    act(() => decoration.dispatchEvent(new Event('animationstart', { bubbles: true })));

    expect(document.querySelector('.native-caret-overlay')).toBeInTheDocument();
    expect(textarea).toHaveAttribute('data-native-caret-overlay-active', 'true');

    hook.unmount();
  });

  it('ignores unrelated motion completion events for the focused caret', () => {
    const shell = document.createElement('div');
    const textarea = document.createElement('textarea');
    const decoration = document.createElement('span');
    shell.append(textarea, decoration);
    document.body.appendChild(shell);
    textarea.value = 'hello';
    textarea.selectionStart = 2;
    textarea.selectionEnd = 2;
    vi.spyOn(textarea, 'getBoundingClientRect').mockReturnValue(rect(120, 180, 240, 48));
    elementFromPoint.mockReturnValue(textarea);

    const hook = renderHook(() => useNativeCaretOverlay());

    act(() => {
      textarea.focus();
      document.dispatchEvent(new Event(NATIVE_CARET_OVERLAY_REFRESH_EVENT));
    });
    requestAnimationFrameSpy.mockClear();

    act(() => decoration.dispatchEvent(new Event('animationend', { bubbles: true })));

    expect(requestAnimationFrameSpy).not.toHaveBeenCalled();
    expect(document.querySelector('.native-caret-overlay')).toBeInTheDocument();

    hook.unmount();
  });

  it('keeps the overlay on a pure-translation ancestor', () => {
    const shell = document.createElement('div');
    shell.style.transform = 'matrix(1, 0, 0, 1, 48, 0)';
    const textarea = document.createElement('textarea');
    textarea.value = 'hello';
    textarea.selectionStart = 2;
    textarea.selectionEnd = 2;
    vi.spyOn(textarea, 'getBoundingClientRect').mockReturnValue(rect(120, 180, 240, 48));
    shell.appendChild(textarea);
    document.body.appendChild(shell);
    elementFromPoint.mockReturnValue(textarea);

    const hook = renderHook(() => useNativeCaretOverlay());

    act(() => {
      textarea.focus();
      document.dispatchEvent(new Event(NATIVE_CARET_OVERLAY_REFRESH_EVENT));
    });

    expect(document.querySelector('.native-caret-overlay')).toBeInTheDocument();
    expect(textarea).toHaveAttribute('data-native-caret-overlay-active', 'true');

    hook.unmount();
  });

  it.each([
    'matrix(0.95, 0, 0, 0.95, 0, 0)',
    'matrix(0, 1, -1, 0, 0, 0)',
  ])('uses the native caret for a non-translation ancestor transform (%s)', (transform) => {
    const shell = document.createElement('div');
    shell.style.transform = transform;
    const textarea = document.createElement('textarea');
    textarea.value = 'hello';
    textarea.selectionStart = 2;
    textarea.selectionEnd = 2;
    vi.spyOn(textarea, 'getBoundingClientRect').mockReturnValue(rect(120, 180, 240, 48));
    shell.appendChild(textarea);
    document.body.appendChild(shell);
    elementFromPoint.mockReturnValue(textarea);

    const hook = renderHook(() => useNativeCaretOverlay());

    act(() => {
      textarea.focus();
      document.dispatchEvent(new Event(NATIVE_CARET_OVERLAY_REFRESH_EVENT));
    });

    expect(document.querySelector('.native-caret-overlay')).not.toBeInTheDocument();
    expect(textarea).not.toHaveAttribute('data-native-caret-overlay-active');
    expect(textarea.selectionStart).toBe(2);

    shell.style.transform = 'matrix(1, 0, 0, 1, 0, 0)';
    act(() => shell.dispatchEvent(new Event('transitionend', { bubbles: true })));

    expect(document.querySelector('.native-caret-overlay')).toBeInTheDocument();
    expect(textarea).toHaveAttribute('data-native-caret-overlay-active', 'true');

    hook.unmount();
  });

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

  it('does not schedule global scroll refreshes without an editable text control', () => {
    const hook = renderHook(() => useNativeCaretOverlay());
    requestAnimationFrameSpy.mockClear();

    act(() => {
      document.dispatchEvent(new Event('scroll'));
      window.dispatchEvent(new Event('resize'));
    });

    expect(requestAnimationFrameSpy).not.toHaveBeenCalled();
    hook.unmount();
  });

  it('ignores sibling scrolls while refreshing scrolls that move the focused control', () => {
    const scroller = document.createElement('div');
    const textarea = document.createElement('textarea');
    const siblingScroller = document.createElement('div');
    scroller.appendChild(textarea);
    document.body.append(scroller, siblingScroller);
    const hook = renderHook(() => useNativeCaretOverlay());

    act(() => {
      textarea.focus();
      document.dispatchEvent(new Event(NATIVE_CARET_OVERLAY_REFRESH_EVENT));
    });
    requestAnimationFrameSpy.mockClear();

    act(() => siblingScroller.dispatchEvent(new Event('scroll', { bubbles: true })));
    expect(requestAnimationFrameSpy).not.toHaveBeenCalled();

    act(() => scroller.dispatchEvent(new Event('scroll', { bubbles: true })));
    expect(requestAnimationFrameSpy).toHaveBeenCalledOnce();

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

  it.each(['email', 'number', 'password'])(
    'leaves input type %s on the native caret because its visual metrics are not reliable',
    (type) => {
      const input = document.createElement('input');
      input.type = type;
      input.value = '1234';
      document.body.appendChild(input);
      elementFromPoint.mockReturnValue(input);

      const hook = renderHook(() => useNativeCaretOverlay());

      act(() => {
        input.focus();
        document.dispatchEvent(new Event(NATIVE_CARET_OVERLAY_REFRESH_EVENT));
      });

      expect(document.querySelector('.native-caret-overlay')).not.toBeInTheDocument();
      expect(input).not.toHaveAttribute('data-native-caret-overlay-active');

      hook.unmount();
    },
  );

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
