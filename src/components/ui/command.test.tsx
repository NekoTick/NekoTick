import { fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Command, CommandItem, CommandList } from './command';

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

describe('CommandList', () => {
  const originalScrollIntoView = Element.prototype.scrollIntoView;

  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    if (originalScrollIntoView) {
      Element.prototype.scrollIntoView = originalScrollIntoView;
    } else {
      delete (Element.prototype as { scrollIntoView?: Element['scrollIntoView'] }).scrollIntoView;
    }
    vi.restoreAllMocks();
  });

  it('preserves consumer wheel handlers while leaving vertical scrolling to the browser', () => {
    const onWheel = vi.fn();
    const requestAnimationFrameSpy = vi.spyOn(window, 'requestAnimationFrame');

    render(
      <Command>
        <CommandList onWheel={onWheel}>
          <CommandItem>Open settings</CommandItem>
          <CommandItem>Show shortcuts</CommandItem>
        </CommandList>
      </Command>,
    );

    const scrollRoot = document.querySelector('[data-slot="command-list"]') as HTMLElement | null;
    expect(scrollRoot).not.toBeNull();

    requestAnimationFrameSpy.mockClear();
    scrollRoot!.style.overflowY = 'auto';
    setScrollMetrics(scrollRoot!, { clientHeight: 120, scrollHeight: 420, scrollTop: 10 });
    fireEvent.wheel(scrollRoot!, { deltaY: 70 });

    expect(onWheel).toHaveBeenCalledTimes(1);
    expect(scrollRoot!.scrollTop).toBe(10);
    expect(requestAnimationFrameSpy).not.toHaveBeenCalled();
  });
});
