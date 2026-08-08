import type { WheelEvent as ReactWheelEvent } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleScrollableWheel, normalizeWheelDelta } from './wheelScroll';

function setScrollMetrics(
  element: HTMLElement,
  metrics: {
    clientHeight: number;
    scrollHeight: number;
    scrollTop?: number;
    clientWidth?: number;
    scrollWidth?: number;
    scrollLeft?: number;
  },
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

  if (typeof metrics.clientWidth === 'number') {
    Object.defineProperty(element, 'clientWidth', {
      configurable: true,
      get: () => metrics.clientWidth,
    });
  }

  if (typeof metrics.scrollWidth === 'number') {
    Object.defineProperty(element, 'scrollWidth', {
      configurable: true,
      get: () => metrics.scrollWidth,
    });
  }

  let currentScrollLeft = metrics.scrollLeft ?? 0;
  Object.defineProperty(element, 'scrollLeft', {
    configurable: true,
    get: () => currentScrollLeft,
    set: (value: number) => {
      currentScrollLeft = value;
    },
  });
}

function createWheelEvent({
  root,
  target = root,
  deltaX = 0,
  deltaY = 120,
  deltaMode = 0,
  ctrlKey = false,
  metaKey = false,
  defaultPrevented = false,
}: {
  root: HTMLElement;
  target?: EventTarget;
  deltaX?: number;
  deltaY?: number;
  deltaMode?: number;
  ctrlKey?: boolean;
  metaKey?: boolean;
  defaultPrevented?: boolean;
}) {
  const event = {
    currentTarget: root,
    target,
    deltaX,
    deltaY,
    deltaMode,
    ctrlKey,
    metaKey,
    defaultPrevented,
    preventDefault: vi.fn(),
  } as unknown as ReactWheelEvent<HTMLElement> & { preventDefault: ReturnType<typeof vi.fn> };

  event.preventDefault.mockImplementation(() => {
    Object.defineProperty(event, 'defaultPrevented', {
      configurable: true,
      value: true,
    });
  });

  return event;
}

describe('scroll wheel handling', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('normalizes wheel deltas from Windows line and page modes', () => {
    expect(normalizeWheelDelta(3, 1, 240)).toBe(48);
    expect(normalizeWheelDelta(1, 2, 240)).toBe(240);
    expect(normalizeWheelDelta(120, 0, 240)).toBe(120);
  });

  it('leaves ordinary vertical wheel events to native scrolling', () => {
    const requestAnimationFrameSpy = vi.spyOn(window, 'requestAnimationFrame');
    const root = document.createElement('div');
    const child = document.createElement('div');
    root.style.overflowY = 'auto';
    root.append(child);
    document.body.append(root);
    setScrollMetrics(root, { clientHeight: 200, scrollHeight: 800, scrollTop: 20 });

    const event = createWheelEvent({ root, target: child, deltaY: 120 });
    handleScrollableWheel(event);

    expect(root.scrollTop).toBe(20);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(requestAnimationFrameSpy).not.toHaveBeenCalled();
  });

  it('leaves nested vertical wheel chaining to the browser', () => {
    const requestAnimationFrameSpy = vi.spyOn(window, 'requestAnimationFrame');
    const root = document.createElement('div');
    const nested = document.createElement('div');
    const child = document.createElement('div');
    root.style.overflowY = 'auto';
    nested.style.overflowY = 'auto';
    nested.append(child);
    root.append(nested);
    document.body.append(root);
    setScrollMetrics(root, { clientHeight: 200, scrollHeight: 800, scrollTop: 20 });
    setScrollMetrics(nested, { clientHeight: 100, scrollHeight: 400, scrollTop: 100 });

    const event = createWheelEvent({ root, target: child, deltaY: 120 });
    handleScrollableWheel(event);

    expect(requestAnimationFrameSpy).not.toHaveBeenCalled();
    expect(root.scrollTop).toBe(20);
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it('maps vertical wheel movement to horizontal scrolling when the root cannot scroll vertically', () => {
    const root = document.createElement('div');
    const child = document.createElement('div');
    root.style.overflowX = 'auto';
    root.append(child);
    document.body.append(root);
    setScrollMetrics(root, {
      clientHeight: 100,
      scrollHeight: 100,
      clientWidth: 200,
      scrollWidth: 600,
      scrollLeft: 10,
    });

    const event = createWheelEvent({ root, target: child, deltaY: 3, deltaMode: 1 });
    handleScrollableWheel(event);

    expect(root.scrollLeft).toBe(58);
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
  });

  it('lets a nested horizontal scrollable element consume horizontal wheel movement', () => {
    const root = document.createElement('div');
    const nested = document.createElement('div');
    const child = document.createElement('div');
    root.style.overflowX = 'auto';
    nested.style.overflowX = 'auto';
    nested.append(child);
    root.append(nested);
    document.body.append(root);
    setScrollMetrics(root, {
      clientHeight: 100,
      scrollHeight: 100,
      clientWidth: 200,
      scrollWidth: 600,
      scrollLeft: 0,
    });
    setScrollMetrics(nested, {
      clientHeight: 100,
      scrollHeight: 100,
      clientWidth: 100,
      scrollWidth: 400,
      scrollLeft: 0,
    });

    const event = createWheelEvent({ root, target: child, deltaX: 120, deltaY: 0 });
    handleScrollableWheel(event);

    expect(root.scrollLeft).toBe(0);
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it('does not intercept Ctrl or Meta wheel shortcuts', () => {
    const root = document.createElement('div');
    document.body.append(root);
    setScrollMetrics(root, { clientHeight: 200, scrollHeight: 800, scrollTop: 20 });

    const ctrlEvent = createWheelEvent({ root, ctrlKey: true, deltaY: 120 });
    handleScrollableWheel(ctrlEvent);
    expect(root.scrollTop).toBe(20);
    expect(ctrlEvent.preventDefault).not.toHaveBeenCalled();

    const metaEvent = createWheelEvent({ root, metaKey: true, deltaY: 120 });
    handleScrollableWheel(metaEvent);
    expect(root.scrollTop).toBe(20);
    expect(metaEvent.preventDefault).not.toHaveBeenCalled();
  });
});
