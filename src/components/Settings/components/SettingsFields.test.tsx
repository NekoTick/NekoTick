import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SettingsTextarea } from './SettingsFields';

function setScrollMetrics(
  element: HTMLElement,
  metrics: { clientHeight: number; scrollHeight: number; scrollTop?: number },
) {
  Object.defineProperty(element, 'clientHeight', {
    configurable: true,
    get: () => metrics.clientHeight,
  });
  Object.defineProperty(element, 'scrollHeight', {
    configurable: true,
    get: () => metrics.scrollHeight,
  });

  let currentScrollTop = metrics.scrollTop ?? 0;
  Object.defineProperty(element, 'scrollTop', {
    configurable: true,
    get: () => currentScrollTop,
    set: (value: number) => {
      currentScrollTop = value;
    },
  });
}

describe('SettingsFields', () => {
  it('preserves textarea wheel handlers while leaving vertical scrolling to the browser', () => {
    const onWheel = vi.fn();
    const requestAnimationFrameSpy = vi.spyOn(window, 'requestAnimationFrame');

    render(
      <SettingsTextarea
        aria-label="System prompt"
        autoGrow
        value="Line one\nLine two"
        onChange={vi.fn()}
        onWheel={onWheel}
      />,
    );

    const textarea = screen.getByRole('textbox', { name: 'System prompt' });
    requestAnimationFrameSpy.mockClear();
    textarea.style.overflowY = 'auto';
    setScrollMetrics(textarea, { clientHeight: 80, scrollHeight: 300, scrollTop: 20 });
    fireEvent.wheel(textarea, { deltaY: 60 });

    expect(onWheel).toHaveBeenCalledTimes(1);
    expect(textarea.scrollTop).toBe(20);
    expect(requestAnimationFrameSpy).not.toHaveBeenCalled();
  });
});
