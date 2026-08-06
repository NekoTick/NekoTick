import { useRef } from 'react';
import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useSourceTextareaResize } from './useSourceTextareaResize';

function ResizeHarness({ active }: { active: boolean }) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const scheduleResize = useSourceTextareaResize(textareaRef, active);

  return (
    <div>
      <textarea ref={textareaRef} aria-label="Markdown source" />
      <button type="button" onClick={scheduleResize}>Resize</button>
    </div>
  );
}

describe('useSourceTextareaResize', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps the measured height while its parent view is hidden', () => {
    let frameCallback: FrameRequestCallback | null = null;
    let width = 360;
    let scrollHeight = 140;
    let clientHeight = 120;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frameCallback = callback;
      return 1;
    });

    const { rerender } = render(<ResizeHarness active />);
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    vi.spyOn(textarea, 'getBoundingClientRect').mockImplementation(() => ({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: width,
      bottom: 120,
      width,
      height: 120,
      toJSON: () => ({}),
    }));
    Object.defineProperties(textarea, {
      scrollHeight: { configurable: true, get: () => scrollHeight },
      clientHeight: { configurable: true, get: () => clientHeight },
    });

    act(() => {
      screen.getByRole('button', { name: 'Resize' }).click();
      frameCallback?.(0);
    });
    expect(textarea.style.height).toBe('140px');

    width = 0;
    scrollHeight = 0;
    clientHeight = 0;
    rerender(<ResizeHarness active={false} />);
    act(() => {
      screen.getByRole('button', { name: 'Resize' }).click();
      frameCallback?.(16);
    });

    expect(textarea.style.height).toBe('140px');

    width = 360;
    scrollHeight = 180;
    clientHeight = 140;
    rerender(<ResizeHarness active />);

    expect(textarea.style.height).toBe('180px');
  });
});
