import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRef } from 'react';
import { MAX_CHAT_COMPOSER_INTERACTIVE_TEXT_CHARS } from '@/lib/ui/composerTextLimit';
import { usePredictedTextareaHeight } from './usePredictedTextareaHeight';

const textLayoutMocks = vi.hoisted(() => ({
  measureTextareaContentHeight: vi.fn(() => 48),
  resolveElementTextLayoutMetrics: vi.fn(() => ({
    font: '400 15px Inter',
    fontSize: 15,
    lineHeight: 24,
    paddingBlock: 12,
  })),
}));

vi.mock('@/lib/text-layout', () => ({
  measureTextareaContentHeight: () =>
    textLayoutMocks.measureTextareaContentHeight(),
  resolveElementTextLayoutMetrics: () =>
    textLayoutMocks.resolveElementTextLayoutMetrics(),
}));

class ResizeObserverMock {
  static instances: ResizeObserverMock[] = [];

  callback: ResizeObserverCallback;
  observe = vi.fn();
  disconnect = vi.fn();

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    ResizeObserverMock.instances.push(this);
  }
}

function Harness({ value }: { value: string }) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  usePredictedTextareaHeight(textareaRef, {
    value,
    minHeight: 24,
    maxHeight: 320,
    maxPredictedLayoutChars: MAX_CHAT_COMPOSER_INTERACTIVE_TEXT_CHARS,
  });

  return <textarea ref={textareaRef} />;
}

function UnboundedHarness({ value }: { value: string }) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  usePredictedTextareaHeight(textareaRef, {
    value,
    minHeight: 24,
    maxHeight: 100_000,
  });

  return <textarea ref={textareaRef} />;
}

describe('usePredictedTextareaHeight', () => {
  beforeEach(() => {
    vi.useRealTimers();
    ResizeObserverMock.instances = [];
    textLayoutMocks.measureTextareaContentHeight.mockClear();
    textLayoutMocks.resolveElementTextLayoutMetrics.mockClear();
    vi.stubGlobal('ResizeObserver', ResizeObserverMock);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reuses a single ResizeObserver across value updates', () => {
    const view = render(<Harness value="first" />);
    const textarea = view.container.querySelector('textarea');
    expect(textarea).not.toBeNull();

    Object.defineProperty(textarea!, 'clientWidth', {
      configurable: true,
      get: () => 320,
    });

    view.rerender(<Harness value="second" />);
    view.rerender(<Harness value="third" />);

    expect(ResizeObserverMock.instances).toHaveLength(1);
    expect(ResizeObserverMock.instances[0]!.observe).toHaveBeenCalledTimes(1);
    expect(textLayoutMocks.measureTextareaContentHeight).toHaveBeenCalledTimes(2);

    view.unmount();

    expect(ResizeObserverMock.instances[0]!.disconnect).toHaveBeenCalledTimes(1);
  });

  it('waits for an observed width before measuring an initially hidden textarea', async () => {
    let width = 0;
    const originalClientWidth = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'clientWidth');
    Object.defineProperty(HTMLTextAreaElement.prototype, 'clientWidth', {
      configurable: true,
      get: () => width,
    });

    try {
      const view = render(<Harness value="first" />);
      const textarea = view.container.querySelector('textarea');
      expect(textarea).not.toBeNull();
      expect(textarea!.style.height).toBe('');
      expect(textLayoutMocks.measureTextareaContentHeight).not.toHaveBeenCalled();

      width = 320;
      await act(async () => {
        ResizeObserverMock.instances[0]!.callback([], ResizeObserverMock.instances[0] as unknown as ResizeObserver);
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      });

      expect(textarea!.style.height).toBe('60px');
      expect(textLayoutMocks.measureTextareaContentHeight).toHaveBeenCalledTimes(1);
    } finally {
      if (originalClientWidth) {
        Object.defineProperty(HTMLTextAreaElement.prototype, 'clientWidth', originalClientWidth);
      } else {
        delete (HTMLTextAreaElement.prototype as { clientWidth?: number }).clientWidth;
      }
    }
  });

  it('preserves the last valid height while the textarea is hidden', async () => {
    let width = 320;
    const originalClientWidth = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'clientWidth');
    Object.defineProperty(HTMLTextAreaElement.prototype, 'clientWidth', {
      configurable: true,
      get: () => width,
    });

    try {
      const view = render(<Harness value={'first line\nsecond line'} />);
      const textarea = view.container.querySelector('textarea');
      expect(textarea!.style.height).toBe('60px');

      width = 0;
      await act(async () => {
        ResizeObserverMock.instances[0]!.callback([], ResizeObserverMock.instances[0] as unknown as ResizeObserver);
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      });

      expect(textarea!.style.height).toBe('60px');
    } finally {
      if (originalClientWidth) {
        Object.defineProperty(HTMLTextAreaElement.prototype, 'clientWidth', originalClientWidth);
      } else {
        delete (HTMLTextAreaElement.prototype as { clientWidth?: number }).clientWidth;
      }
    }
  });

  it('keeps max-height textarea appends from remeasuring the full value', () => {
    textLayoutMocks.measureTextareaContentHeight.mockImplementationOnce(() => 308);
    const originalClientWidth = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'clientWidth');
    Object.defineProperty(HTMLTextAreaElement.prototype, 'clientWidth', {
      configurable: true,
      get: () => 320,
    });

    try {
      const view = render(<Harness value="long content" />);
      const textarea = view.container.querySelector('textarea');
      expect(textarea).not.toBeNull();
      expect(textarea!.style.height).toBe('320px');
      expect(textLayoutMocks.measureTextareaContentHeight).toHaveBeenCalledTimes(1);

      view.rerender(<Harness value="long content appended text" />);

      expect(textarea!.style.height).toBe('320px');
      expect(textLayoutMocks.measureTextareaContentHeight).toHaveBeenCalledTimes(1);

      view.rerender(<Harness value="short" />);

      expect(textarea!.style.height).toBe('60px');
      expect(textLayoutMocks.measureTextareaContentHeight).toHaveBeenCalledTimes(2);
    } finally {
      if (originalClientWidth) {
        Object.defineProperty(HTMLTextAreaElement.prototype, 'clientWidth', originalClientWidth);
      } else {
        delete (HTMLTextAreaElement.prototype as { clientWidth?: number }).clientWidth;
      }
    }
  });

  it('caps oversized textarea values without preparing their full text layout', () => {
    const originalClientWidth = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'clientWidth');
    Object.defineProperty(HTMLTextAreaElement.prototype, 'clientWidth', {
      configurable: true,
      get: () => 320,
    });

    try {
      const view = render(
        <Harness value={'x'.repeat(MAX_CHAT_COMPOSER_INTERACTIVE_TEXT_CHARS + 1)} />,
      );
      const textarea = view.container.querySelector('textarea');

      expect(textarea!.style.height).toBe('320px');
      expect(textLayoutMocks.resolveElementTextLayoutMetrics).not.toHaveBeenCalled();
      expect(textLayoutMocks.measureTextareaContentHeight).not.toHaveBeenCalled();

      view.rerender(<Harness value="short again" />);

      expect(textarea!.style.height).toBe('60px');
      expect(textLayoutMocks.measureTextareaContentHeight).toHaveBeenCalledTimes(1);
    } finally {
      if (originalClientWidth) {
        Object.defineProperty(HTMLTextAreaElement.prototype, 'clientWidth', originalClientWidth);
      } else {
        delete (HTMLTextAreaElement.prototype as { clientWidth?: number }).clientWidth;
      }
    }
  });

  it('keeps oversized non-Chat textareas on exact predicted layout measurement', () => {
    const originalClientWidth = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'clientWidth');
    Object.defineProperty(HTMLTextAreaElement.prototype, 'clientWidth', {
      configurable: true,
      get: () => 320,
    });

    try {
      const view = render(
        <UnboundedHarness value={'x'.repeat(MAX_CHAT_COMPOSER_INTERACTIVE_TEXT_CHARS + 1)} />,
      );
      const textarea = view.container.querySelector('textarea');

      expect(textarea!.style.height).toBe('60px');
      expect(textLayoutMocks.measureTextareaContentHeight).toHaveBeenCalledTimes(1);
    } finally {
      if (originalClientWidth) {
        Object.defineProperty(HTMLTextAreaElement.prototype, 'clientWidth', originalClientWidth);
      } else {
        delete (HTMLTextAreaElement.prototype as { clientWidth?: number }).clientWidth;
      }
    }
  });

  it('remeasures max-height textarea appends after a width change', () => {
    textLayoutMocks.measureTextareaContentHeight.mockImplementationOnce(() => 308);
    let width = 320;
    const originalClientWidth = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'clientWidth');
    Object.defineProperty(HTMLTextAreaElement.prototype, 'clientWidth', {
      configurable: true,
      get: () => width,
    });

    try {
      const view = render(<Harness value="long content" />);
      expect(textLayoutMocks.measureTextareaContentHeight).toHaveBeenCalledTimes(1);

      width = 280;
      view.rerender(<Harness value="long content appended text" />);

      expect(textLayoutMocks.measureTextareaContentHeight).toHaveBeenCalledTimes(2);
    } finally {
      if (originalClientWidth) {
        Object.defineProperty(HTMLTextAreaElement.prototype, 'clientWidth', originalClientWidth);
      } else {
        delete (HTMLTextAreaElement.prototype as { clientWidth?: number }).clientWidth;
      }
    }
  });

  it('ignores ResizeObserver callbacks caused by its own stable height write', () => {
    const originalClientWidth = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'clientWidth');
    Object.defineProperty(HTMLTextAreaElement.prototype, 'clientWidth', {
      configurable: true,
      get: () => 320,
    });

    try {
      const view = render(<Harness value="borderline wrap" />);
      const textarea = view.container.querySelector('textarea');
      expect(textarea).not.toBeNull();
      expect(textarea!.style.height).toBe('60px');
      expect(textLayoutMocks.measureTextareaContentHeight).toHaveBeenCalledTimes(1);

      act(() => {
        ResizeObserverMock.instances[0]!.callback([], ResizeObserverMock.instances[0] as unknown as ResizeObserver);
      });

      expect(textLayoutMocks.measureTextareaContentHeight).toHaveBeenCalledTimes(1);
      expect(textarea!.style.height).toBe('60px');
    } finally {
      if (originalClientWidth) {
        Object.defineProperty(HTMLTextAreaElement.prototype, 'clientWidth', originalClientWidth);
      } else {
        delete (HTMLTextAreaElement.prototype as { clientWidth?: number }).clientWidth;
      }
    }
  });

  it('coalesces observed resize height recalculation into one animation frame', () => {
    let width = 320;
    let pendingFrame: FrameRequestCallback | null = null;
    const requestAnimationFrameSpy = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((callback: FrameRequestCallback) => {
        pendingFrame = callback;
        return 1;
      });
    const cancelAnimationFrameSpy = vi
      .spyOn(window, 'cancelAnimationFrame')
      .mockImplementation(() => {});
    const originalClientWidth = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'clientWidth');
    Object.defineProperty(HTMLTextAreaElement.prototype, 'clientWidth', {
      configurable: true,
      get: () => width,
    });

    try {
      const view = render(<Harness value="wrap again" />);
      const textarea = view.container.querySelector('textarea');
      expect(textarea).not.toBeNull();
      expect(textLayoutMocks.measureTextareaContentHeight).toHaveBeenCalledTimes(1);

      width = 360;
      act(() => {
        ResizeObserverMock.instances[0]!.callback([], ResizeObserverMock.instances[0] as unknown as ResizeObserver);
        ResizeObserverMock.instances[0]!.callback([], ResizeObserverMock.instances[0] as unknown as ResizeObserver);
        ResizeObserverMock.instances[0]!.callback([], ResizeObserverMock.instances[0] as unknown as ResizeObserver);
      });

      expect(requestAnimationFrameSpy).toHaveBeenCalledTimes(1);
      expect(textLayoutMocks.measureTextareaContentHeight).toHaveBeenCalledTimes(1);

      act(() => {
        pendingFrame?.(16);
      });

      expect(textLayoutMocks.measureTextareaContentHeight).toHaveBeenCalledTimes(2);
    } finally {
      requestAnimationFrameSpy.mockRestore();
      cancelAnimationFrameSpy.mockRestore();
      if (originalClientWidth) {
        Object.defineProperty(HTMLTextAreaElement.prototype, 'clientWidth', originalClientWidth);
      } else {
        delete (HTMLTextAreaElement.prototype as { clientWidth?: number }).clientWidth;
      }
    }
  });
});
