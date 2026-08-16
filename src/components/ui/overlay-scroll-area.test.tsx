import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OverlayScrollArea } from './overlay-scroll-area';
import { OVERLAY_SCROLL_IDLE_EVENT } from './overlayScrollAreaEvents';
import { themeUiFeedbackTokens } from '@/styles/themeTokens';

class ResizeObserverMock {
  static instances: ResizeObserverMock[] = [];
  callback: ResizeObserverCallback;
  observed: Element[] = [];

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    ResizeObserverMock.instances.push(this);
  }

  observe(element: Element) {
    this.observed.push(element);
  }

  disconnect() {}
}

function setViewportMetrics(element: HTMLDivElement, metrics: { clientHeight: number; scrollHeight: number; scrollTop?: number }) {
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

function flushFrameCallbacks(frameCallbacks: FrameRequestCallback[]) {
  act(() => {
    while (frameCallbacks.length > 0) {
      frameCallbacks.shift()?.(performance.now());
    }
  });
}

describe('OverlayScrollArea', () => {
  const originalResizeObserver = globalThis.ResizeObserver;

  beforeEach(() => {
    ResizeObserverMock.instances = [];
    globalThis.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    globalThis.ResizeObserver = originalResizeObserver;
    document.body.className = '';
  });

  it('toggles the configured body class while dragging the thumb', () => {
    render(
      <div style={{ height: 120 }}>
        <OverlayScrollArea draggingBodyClassName="app-overlay-scrollbar-dragging">
          <div style={{ height: 480 }}>content</div>
        </OverlayScrollArea>
      </div>
    );

    const viewport = screen.getByText('content').parentElement as HTMLDivElement;
    setViewportMetrics(viewport, { clientHeight: 120, scrollHeight: 480 });
    fireEvent.scroll(viewport);

    const thumb = viewport.parentElement?.querySelector('[data-overlay-scrollbar-thumb="true"]') as HTMLDivElement | null;
    expect(thumb).not.toBeNull();

    Object.defineProperty(thumb!, 'setPointerCapture', {
      configurable: true,
      value: vi.fn(),
    });

    fireEvent.pointerDown(thumb!, { button: 0, clientY: 10, pointerId: 1 });
    expect(document.body.classList.contains('app-overlay-scrollbar-dragging')).toBe(true);

    fireEvent.pointerUp(window, { pointerId: 1 });
    expect(document.body.classList.contains('app-overlay-scrollbar-dragging')).toBe(false);
  });

  it('supports a compact scrollbar variant without changing the default sizing', () => {
    const { rerender } = render(
      <div style={{ height: 120 }}>
        <OverlayScrollArea scrollbarVariant="compact">
          <div style={{ height: 480 }}>content</div>
        </OverlayScrollArea>
      </div>
    );

    const viewport = screen.getByText('content').parentElement as HTMLDivElement;
    setViewportMetrics(viewport, { clientHeight: 120, scrollHeight: 480 });
    fireEvent.scroll(viewport);

    const compactRail = viewport.parentElement?.querySelector('[data-overlay-scrollbar-rail="true"]') as HTMLDivElement | null;
    const compactTrack = compactRail?.firstElementChild as HTMLDivElement | null;
    const compactThumb = compactTrack?.firstElementChild as HTMLDivElement | null;

    expect(compactRail?.className).toContain('w-[var(--vlaina-size-7px)]');
    expect(compactRail?.className).toContain('justify-end');
    expect(compactTrack?.className).toContain('w-[var(--vlaina-size-7px)]');
    expect(compactThumb?.className).toContain('w-[var(--vlaina-size-5px)]');

    rerender(
      <div style={{ height: 120 }}>
        <OverlayScrollArea>
          <div style={{ height: 480 }}>content</div>
        </OverlayScrollArea>
      </div>
    );

    const defaultViewport = screen.getByText('content').parentElement as HTMLDivElement;
    setViewportMetrics(defaultViewport, { clientHeight: 120, scrollHeight: 480 });
    fireEvent.scroll(defaultViewport);

    const defaultRail = defaultViewport.parentElement?.querySelector('[data-overlay-scrollbar-rail="true"]') as HTMLDivElement | null;
    const defaultTrack = defaultRail?.firstElementChild as HTMLDivElement | null;
    const defaultThumb = defaultTrack?.firstElementChild as HTMLDivElement | null;

    expect(defaultRail?.className).toContain('w-4');
    expect(defaultRail?.className).toContain('justify-center');
    expect(defaultTrack?.className).toContain('w-3');
    expect(defaultThumb?.className).toContain('w-2');
  });

  it('uses the configured idle thumb color before hover', () => {
    render(
      <div style={{ height: 120 }}>
        <OverlayScrollArea scrollbarVariant="compact">
          <div style={{ height: 480 }}>content</div>
        </OverlayScrollArea>
      </div>
    );

    const viewport = screen.getByText('content').parentElement as HTMLDivElement;
    setViewportMetrics(viewport, { clientHeight: 120, scrollHeight: 480 });
    fireEvent.mouseEnter(viewport.parentElement as HTMLDivElement);
    fireEvent.scroll(viewport);

    const rail = viewport.parentElement?.querySelector('[data-overlay-scrollbar-rail="true"]') as HTMLDivElement | null;
    const track = rail?.firstElementChild as HTMLDivElement | null;
    const thumb = track?.firstElementChild as HTMLDivElement | null;

    expect(thumb?.className).toContain('bg-[var(--vlaina-color-scrollbar-thumb)]');
    expect(thumb?.className).toContain('right-0');
    expect(thumb?.className).toContain('w-[var(--vlaina-size-5px)]');
  });

  it('recomputes scroll metrics when the scroll area is hovered', () => {
    render(
      <div style={{ height: 120 }}>
        <OverlayScrollArea scrollbarVariant="compact">
          <div style={{ height: 480 }}>content</div>
        </OverlayScrollArea>
      </div>
    );

    const viewport = screen.getByText('content').parentElement as HTMLDivElement;
    setViewportMetrics(viewport, { clientHeight: 120, scrollHeight: 480 });

    expect(viewport.parentElement?.querySelector('[data-overlay-scrollbar-rail="true"]')).toBeNull();

    fireEvent.mouseEnter(viewport.parentElement as HTMLDivElement);

    const rail = viewport.parentElement?.querySelector('[data-overlay-scrollbar-rail="true"]') as HTMLDivElement | null;
    expect(rail).not.toBeNull();
  });

  it('updates the thumb during scrolling without rereading layout dimensions', () => {
    render(
      <div style={{ height: 120 }}>
        <OverlayScrollArea>
          <div style={{ height: 480 }}>content</div>
        </OverlayScrollArea>
      </div>
    );

    const viewport = screen.getByText('content').parentElement as HTMLDivElement;
    let clientHeightReads = 0;
    let scrollHeightReads = 0;
    let scrollTop = 0;
    Object.defineProperties(viewport, {
      clientHeight: {
        configurable: true,
        get: () => {
          clientHeightReads += 1;
          return 120;
        },
      },
      scrollHeight: {
        configurable: true,
        get: () => {
          scrollHeightReads += 1;
          return 480;
        },
      },
      scrollTop: {
        configurable: true,
        get: () => scrollTop,
        set: (value: number) => {
          scrollTop = value;
        },
      },
    });
    fireEvent.mouseEnter(viewport.parentElement as HTMLDivElement);
    clientHeightReads = 0;
    scrollHeightReads = 0;
    scrollTop = 180;

    fireEvent.scroll(viewport);

    const thumb = viewport.parentElement?.querySelector('[data-overlay-scrollbar-thumb="true"]') as HTMLDivElement;
    expect(clientHeightReads).toBe(0);
    expect(scrollHeightReads).toBe(0);
    expect(thumb.style.transform).toBe('translateY(42px)');
  });

  it('replays accumulated wheel intent after deferred content becomes scrollable', () => {
    const frameCallbacks: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback: FrameRequestCallback) => {
      frameCallbacks.push(callback);
      return frameCallbacks.length;
    });
    render(
      <div style={{ height: 120 }}>
        <OverlayScrollArea preserveWheelIntentKey="note-a">
          <div>content</div>
        </OverlayScrollArea>
      </div>
    );

    const viewport = screen.getByText('content').parentElement as HTMLDivElement;
    const layout = { clientHeight: 120, scrollHeight: 120, scrollTop: 0 };
    setViewportMetrics(viewport, layout);
    flushFrameCallbacks(frameCallbacks);

    fireEvent.wheel(viewport, { deltaY: 80 });
    fireEvent.wheel(viewport, { deltaY: 120 });
    expect(viewport.scrollTop).toBe(0);

    layout.scrollHeight = 480;
    const observer = ResizeObserverMock.instances[0];
    observer.callback([], observer as unknown as ResizeObserver);
    flushFrameCallbacks(frameCallbacks);

    expect(viewport.scrollTop).toBe(200);
  });

  it('expands the compact scrollbar on hover and uses the default cursor', () => {
    render(
      <div style={{ height: 120 }}>
        <OverlayScrollArea scrollbarVariant="compact">
          <div style={{ height: 480 }}>content</div>
        </OverlayScrollArea>
      </div>
    );

    const viewport = screen.getByText('content').parentElement as HTMLDivElement;
    setViewportMetrics(viewport, { clientHeight: 120, scrollHeight: 480 });
    fireEvent.mouseEnter(viewport.parentElement as HTMLDivElement);
    fireEvent.scroll(viewport);

    const rail = viewport.parentElement?.querySelector('[data-overlay-scrollbar-rail="true"]') as HTMLDivElement | null;
    const track = rail?.firstElementChild as HTMLDivElement | null;
    const thumb = track?.firstElementChild as HTMLDivElement | null;

    expect(rail?.dataset.overlayScrollbarRail).toBe('true');
    expect(rail?.dataset.noFocusInput).toBe('true');
    expect(rail?.className).toContain('z-[var(--vlaina-z-20)]');
    expect(thumb?.dataset.overlayScrollbarThumb).toBe('true');
    expect(rail?.className).toContain('cursor-default');
    expect(track?.className).toContain('cursor-default');
    expect(thumb?.className).toContain('cursor-default');

    fireEvent.pointerEnter(rail!);

    expect(rail?.className).toContain('w-4');
    expect(track?.className).toContain('w-3');
    expect(thumb?.className).toContain('w-2');
    expect(thumb?.className).toContain('right-[var(--vlaina-scrollbar-thumb-offset)]');
    expect(thumb?.className).toContain('bg-[var(--vlaina-color-scrollbar-thumb-hover)]');
  });

  it('routes wheel events from the overlay scrollbar rail to the viewport', () => {
    render(
      <div style={{ height: 120 }}>
        <OverlayScrollArea scrollbarVariant="compact">
          <div style={{ height: 480 }}>content</div>
        </OverlayScrollArea>
      </div>
    );

    const viewport = screen.getByText('content').parentElement as HTMLDivElement;
    setViewportMetrics(viewport, { clientHeight: 120, scrollHeight: 480, scrollTop: 0 });
    fireEvent.mouseEnter(viewport.parentElement as HTMLDivElement);

    const rail = viewport.parentElement?.querySelector('[data-overlay-scrollbar-rail="true"]') as HTMLDivElement | null;
    expect(rail).not.toBeNull();

    fireEvent.wheel(rail!, { deltaY: 3, deltaMode: WheelEvent.DOM_DELTA_LINE });

    expect(viewport.scrollTop).toBe(48);
  });

  it('coalesces thumb pointer moves into one scroll write per animation frame', () => {
    const frameCallbacks: FrameRequestCallback[] = [];
    const requestAnimationFrameSpy = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((callback: FrameRequestCallback) => {
        frameCallbacks.push(callback);
        return frameCallbacks.length;
      });
    render(
      <div style={{ height: 120 }}>
        <OverlayScrollArea>
          <div style={{ height: 480 }}>content</div>
        </OverlayScrollArea>
      </div>
    );
    flushFrameCallbacks(frameCallbacks);

    const viewport = screen.getByText('content').parentElement as HTMLDivElement;
    setViewportMetrics(viewport, { clientHeight: 120, scrollHeight: 480, scrollTop: 0 });
    fireEvent.mouseEnter(viewport.parentElement as HTMLDivElement);
    const thumb = viewport.parentElement?.querySelector('[data-overlay-scrollbar-thumb="true"]') as HTMLDivElement;
    Object.defineProperty(thumb, 'setPointerCapture', {
      configurable: true,
      value: vi.fn(),
    });
    fireEvent.pointerDown(thumb, { button: 0, clientY: 10, pointerId: 1 });
    requestAnimationFrameSpy.mockClear();

    fireEvent.pointerMove(window, { clientY: 30, pointerId: 1 });
    fireEvent.pointerMove(window, { clientY: 50, pointerId: 1 });
    fireEvent.pointerMove(window, { clientY: 70, pointerId: 1 });

    expect(requestAnimationFrameSpy).toHaveBeenCalledTimes(1);
    expect(viewport.scrollTop).toBe(0);
    flushFrameCallbacks(frameCallbacks);
    expect(viewport.scrollTop).toBeCloseTo((60 / 84) * 360);
    fireEvent.pointerUp(window, { pointerId: 1 });
  });

  it('marks the viewport as interacting until scrolling settles', () => {
    vi.useFakeTimers();
    render(
      <div style={{ height: 120 }}>
        <OverlayScrollArea>
          <div style={{ height: 480 }}>content</div>
        </OverlayScrollArea>
      </div>
    );
    const viewport = screen.getByText('content').parentElement as HTMLDivElement;
    setViewportMetrics(viewport, { clientHeight: 120, scrollHeight: 480 });

    fireEvent.scroll(viewport);
    expect(viewport.dataset.overlayScrollbarInteracting).toBe('true');
    act(() => {
      vi.advanceTimersByTime(themeUiFeedbackTokens.overlayScrollInteractionSettleMs - 1);
    });
    expect(viewport.dataset.overlayScrollbarInteracting).toBe('true');
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(viewport.dataset.overlayScrollbarInteracting).toBeUndefined();
  });

  it('reuses one settle timer while scroll events keep extending the idle deadline', () => {
    vi.useFakeTimers();
    const idleListener = vi.fn();
    window.addEventListener(OVERLAY_SCROLL_IDLE_EVENT, idleListener);
    render(
      <div style={{ height: 120 }}>
        <OverlayScrollArea>
          <div style={{ height: 480 }}>content</div>
        </OverlayScrollArea>
      </div>
    );
    const viewport = screen.getByText('content').parentElement as HTMLDivElement;
    setViewportMetrics(viewport, { clientHeight: 120, scrollHeight: 480 });
    const setTimeoutSpy = vi.spyOn(window, 'setTimeout');

    fireEvent.scroll(viewport);
    act(() => {
      vi.advanceTimersByTime(100);
    });
    fireEvent.scroll(viewport);
    fireEvent.scroll(viewport);
    fireEvent.scroll(viewport);

    expect(setTimeoutSpy).toHaveBeenCalledTimes(1);
    act(() => {
      vi.advanceTimersByTime(themeUiFeedbackTokens.overlayScrollInteractionSettleMs - 100);
    });
    expect(viewport.dataset.overlayScrollbarInteracting).toBe('true');
    expect(setTimeoutSpy).toHaveBeenCalledTimes(2);
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(viewport.dataset.overlayScrollbarInteracting).toBeUndefined();
    expect(idleListener).toHaveBeenCalledTimes(1);

    window.removeEventListener(OVERLAY_SCROLL_IDLE_EVENT, idleListener);
  });

  it('changes the interaction attribute only at the start and end of a scroll burst', async () => {
    vi.useFakeTimers();
    render(
      <div style={{ height: 120 }}>
        <OverlayScrollArea>
          <div style={{ height: 480 }}>content</div>
        </OverlayScrollArea>
      </div>
    );
    const viewport = screen.getByText('content').parentElement as HTMLDivElement;
    setViewportMetrics(viewport, { clientHeight: 120, scrollHeight: 480 });
    const attributeChanges: MutationRecord[] = [];
    const observer = new MutationObserver((records) => attributeChanges.push(...records));
    observer.observe(viewport, {
      attributeFilter: ['data-overlay-scrollbar-interacting'],
      attributes: true,
    });

    fireEvent.scroll(viewport);
    fireEvent.scroll(viewport);
    fireEvent.scroll(viewport);
    fireEvent.scroll(viewport);
    await act(async () => Promise.resolve());
    expect(attributeChanges).toHaveLength(1);

    act(() => {
      vi.advanceTimersByTime(themeUiFeedbackTokens.overlayScrollInteractionSettleMs);
    });
    await act(async () => Promise.resolve());
    expect(attributeChanges).toHaveLength(2);
    observer.disconnect();
  });

  it('signals idle when an interacting scroll area unmounts', () => {
    vi.useFakeTimers();
    const idleListener = vi.fn();
    window.addEventListener(OVERLAY_SCROLL_IDLE_EVENT, idleListener);
    const { unmount } = render(
      <div style={{ height: 120 }}>
        <OverlayScrollArea>
          <div style={{ height: 480 }}>content</div>
        </OverlayScrollArea>
      </div>
    );
    const viewport = screen.getByText('content').parentElement as HTMLDivElement;
    setViewportMetrics(viewport, { clientHeight: 120, scrollHeight: 480 });

    fireEvent.scroll(viewport);
    unmount();

    expect(viewport.dataset.overlayScrollbarInteracting).toBeUndefined();
    expect(idleListener).toHaveBeenCalledTimes(1);
    window.removeEventListener(OVERLAY_SCROLL_IDLE_EVENT, idleListener);
  });

  it('observes every direct viewport child for late content growth', () => {
    render(
      <div style={{ height: 120 }}>
        <OverlayScrollArea>
          <div>fixed header</div>
          <div>growing list</div>
        </OverlayScrollArea>
      </div>
    );

    const viewport = screen.getByText('fixed header').parentElement as HTMLDivElement;
    const header = screen.getByText('fixed header');
    const list = screen.getByText('growing list');
    const observer = ResizeObserverMock.instances[0];

    expect(observer.observed).toContain(viewport);
    expect(observer.observed).toContain(header);
    expect(observer.observed).toContain(list);
  });

  it('coalesces resize observer metric updates into one animation frame', () => {
    const frameCallbacks: FrameRequestCallback[] = [];
    const requestAnimationFrameSpy = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((callback: FrameRequestCallback) => {
        frameCallbacks.push(callback);
        return frameCallbacks.length;
      });

    render(
      <div style={{ height: 120 }}>
        <OverlayScrollArea>
          <div style={{ height: 480 }}>content</div>
        </OverlayScrollArea>
      </div>
    );

    flushFrameCallbacks(frameCallbacks);
    requestAnimationFrameSpy.mockClear();
    const observer = ResizeObserverMock.instances[0];
    observer.callback([], observer as unknown as ResizeObserver);
    observer.callback([], observer as unknown as ResizeObserver);

    expect(requestAnimationFrameSpy).toHaveBeenCalledTimes(1);
  });

  it('coalesces child content metric updates into one animation frame', () => {
    const frameCallbacks: FrameRequestCallback[] = [];
    const requestAnimationFrameSpy = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((callback: FrameRequestCallback) => {
        frameCallbacks.push(callback);
        return frameCallbacks.length;
      });

    const { rerender } = render(
      <div style={{ height: 120 }}>
        <OverlayScrollArea>
          <div style={{ height: 240 }}>first content</div>
        </OverlayScrollArea>
      </div>
    );

    flushFrameCallbacks(frameCallbacks);
    requestAnimationFrameSpy.mockClear();
    rerender(
      <div style={{ height: 120 }}>
        <OverlayScrollArea>
          <div style={{ height: 480 }}>updated content</div>
        </OverlayScrollArea>
      </div>
    );
    rerender(
      <div style={{ height: 120 }}>
        <OverlayScrollArea>
          <div style={{ height: 720 }}>updated content again</div>
        </OverlayScrollArea>
      </div>
    );

    expect(requestAnimationFrameSpy).toHaveBeenCalledTimes(1);
  });

  it('keeps the resize observer while virtualized children rerender', () => {
    const { rerender } = render(
      <div style={{ height: 120 }}>
        <OverlayScrollArea>
          <div style={{ height: 240 }}>first content</div>
        </OverlayScrollArea>
      </div>
    );

    expect(ResizeObserverMock.instances).toHaveLength(1);
    rerender(
      <div style={{ height: 120 }}>
        <OverlayScrollArea>
          <div style={{ height: 480 }}>updated content</div>
        </OverlayScrollArea>
      </div>
    );

    expect(ResizeObserverMock.instances).toHaveLength(1);
  });
});
