import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createVerticalEdgeAutoScroll,
  resolveVerticalEdgeAutoScrollDelta,
  VERTICAL_EDGE_AUTO_SCROLL_MAX_STEP_PX,
} from './edgeAutoScroll';

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('edgeAutoScroll', () => {
  const scrollRootRect = { top: 100, bottom: 500 };

  it('uses a shared faster vertical edge scroll curve', () => {
    expect(resolveVerticalEdgeAutoScrollDelta(260, scrollRootRect)).toBe(0);
    expect(resolveVerticalEdgeAutoScrollDelta(140, scrollRootRect)).toBeLessThan(0);
    expect(resolveVerticalEdgeAutoScrollDelta(80, scrollRootRect)).toBe(-VERTICAL_EDGE_AUTO_SCROLL_MAX_STEP_PX);
    expect(resolveVerticalEdgeAutoScrollDelta(460, scrollRootRect)).toBeGreaterThan(0);
    expect(resolveVerticalEdgeAutoScrollDelta(520, scrollRootRect)).toBe(VERTICAL_EDGE_AUTO_SCROLL_MAX_STEP_PX);
  });

  it('uses the nearest edge when the top and bottom trigger zones overlap', () => {
    expect(resolveVerticalEdgeAutoScrollDelta(5, { top: 0, bottom: 100 })).toBeLessThan(0);
    expect(resolveVerticalEdgeAutoScrollDelta(50, { top: 0, bottom: 100 })).toBe(0);
    expect(resolveVerticalEdgeAutoScrollDelta(95, { top: 0, bottom: 100 })).toBeGreaterThan(0);
  });

  it('keeps scroll velocity stable across uneven animation frames', () => {
    const animationFrames: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback: FrameRequestCallback) => {
      animationFrames.push(callback);
      return animationFrames.length;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(vi.fn());

    const scrollRoot = document.createElement('div');
    scrollRoot.scrollTop = 100;
    const getBoundingClientRect = vi.fn(() => ({
      top: 100,
      bottom: 500,
    }));
    Object.defineProperty(scrollRoot, 'getBoundingClientRect', {
      configurable: true,
      value: getBoundingClientRect,
    });
    Object.defineProperties(scrollRoot, {
      clientHeight: { configurable: true, value: 400 },
      scrollHeight: { configurable: true, value: 1_000 },
    });
    const onScroll = vi.fn();
    const autoScroll = createVerticalEdgeAutoScroll({
      scrollRoot,
      getPointerY: () => 520,
      onScroll,
    });

    autoScroll.start();
    animationFrames.shift()?.(0);
    animationFrames.shift()?.(16);
    const afterRegularFrames = scrollRoot.scrollTop;
    animationFrames.shift()?.(48);
    const irregularFrameDelta = scrollRoot.scrollTop - afterRegularFrames;

    const regularFrameDelta = afterRegularFrames - 100 - VERTICAL_EDGE_AUTO_SCROLL_MAX_STEP_PX;
    expect(regularFrameDelta).toBeGreaterThan(0);
    expect(irregularFrameDelta).toBeCloseTo(regularFrameDelta * 2, 0);
    expect(onScroll).toHaveBeenCalledTimes(3);
    expect(getBoundingClientRect).toHaveBeenCalledTimes(1);

    window.dispatchEvent(new Event('resize'));
    expect(getBoundingClientRect).toHaveBeenCalledTimes(2);

    autoScroll.stop();
  });

  it('caps catch-up distance after a long blocked frame', () => {
    const animationFrames: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback: FrameRequestCallback) => {
      animationFrames.push(callback);
      return animationFrames.length;
    });
    const scrollRoot = document.createElement('div');
    scrollRoot.scrollTop = 100;
    Object.defineProperty(scrollRoot, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ top: 100, bottom: 500 }),
    });

    const autoScroll = createVerticalEdgeAutoScroll({
      scrollRoot,
      getPointerY: () => 520,
    });
    autoScroll.start();
    animationFrames.shift()?.(0);
    const beforeBlockedFrame = scrollRoot.scrollTop;
    animationFrames.shift()?.(200);

    expect(scrollRoot.scrollTop - beforeBlockedFrame).toBeLessThanOrEqual(
      VERTICAL_EDGE_AUTO_SCROLL_MAX_STEP_PX * 3,
    );
    autoScroll.stop();
  });
});
