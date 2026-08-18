import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { startCoverResizeSession } from './coverResizeSession';
import type { ResizeSnapshot } from '../../../../utils/coverResizeMath';

const snapshot: ResizeSnapshot = {
  scaledWidth: 400,
  scaledHeight: 300,
  absoluteTop: -20,
  absoluteLeft: 0,
  containerWidth: 320,
  maxVisualHeightNoShift: 280,
  maxShiftDown: 20,
  maxMechanicalHeight: 300,
};

describe('startCoverResizeSession', () => {
  const originalRaf = globalThis.requestAnimationFrame;
  const originalCancelRaf = globalThis.cancelAnimationFrame;

  beforeEach(() => {
    globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    }) as typeof requestAnimationFrame;
    globalThis.cancelAnimationFrame = vi.fn();
  });

  afterEach(() => {
    globalThis.requestAnimationFrame = originalRaf;
    globalThis.cancelAnimationFrame = originalCancelRaf;
    vi.restoreAllMocks();
  });

  it('runs frame callback on mouse move', () => {
    const onFrame = vi.fn();
    const onCommit = vi.fn();
    const addSpy = vi.spyOn(document, 'addEventListener');

    startCoverResizeSession({
      startY: 100,
      startHeight: 200,
      snapshot,
      onFrame,
      onCommit,
    });

    const moveHandler = addSpy.mock.calls.find(([eventName]) => eventName === 'mousemove')?.[1];
    expect(moveHandler).toBeTypeOf('function');

    (moveHandler as EventListener)(new MouseEvent('mousemove', { buttons: 1, clientY: 120 }));
    expect(onFrame).toHaveBeenCalledTimes(1);
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('coalesces rapid resize moves into one animation frame', () => {
    const animationFrames: FrameRequestCallback[] = [];
    const requestAnimationFrameSpy = vi.fn((callback: FrameRequestCallback) => {
      animationFrames.push(callback);
      return animationFrames.length;
    });
    globalThis.requestAnimationFrame = requestAnimationFrameSpy as typeof requestAnimationFrame;
    const onFrame = vi.fn();
    const addSpy = vi.spyOn(document, 'addEventListener');

    startCoverResizeSession({
      startY: 100,
      startHeight: 200,
      snapshot,
      onFrame,
      onCommit: vi.fn(),
    });

    const moveHandler = addSpy.mock.calls.find(([eventName]) => eventName === 'mousemove')?.[1];
    expect(moveHandler).toBeTypeOf('function');

    (moveHandler as EventListener)(new MouseEvent('mousemove', { buttons: 1, clientY: 120 }));
    (moveHandler as EventListener)(new MouseEvent('mousemove', { buttons: 1, clientY: 140 }));

    expect(requestAnimationFrameSpy).toHaveBeenCalledTimes(1);
    expect(onFrame).not.toHaveBeenCalled();

    animationFrames.shift()?.(0);
    expect(onFrame).toHaveBeenCalledTimes(1);
    expect(onFrame).toHaveBeenCalledWith(expect.objectContaining({ pointerY: 140 }));
  });

  it('commits and removes listeners on mouse up', () => {
    const onFrame = vi.fn();
    const onCommit = vi.fn();
    const addSpy = vi.spyOn(document, 'addEventListener');
    const removeSpy = vi.spyOn(document, 'removeEventListener');

    startCoverResizeSession({
      startY: 100,
      startHeight: 200,
      snapshot,
      onFrame,
      onCommit,
    });

    const upHandler = addSpy.mock.calls.find(([eventName]) => eventName === 'mouseup')?.[1];
    expect(upHandler).toBeTypeOf('function');

    (upHandler as EventListener)(new MouseEvent('mouseup', { clientY: 130 }));

    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(removeSpy).toHaveBeenCalledWith('mousemove', expect.any(Function), true);
    expect(removeSpy).toHaveBeenCalledWith('mouseup', expect.any(Function), true);
  });

  it('dispose is idempotent', () => {
    const onFrame = vi.fn();
    const onCommit = vi.fn();
    const removeSpy = vi.spyOn(document, 'removeEventListener');

    const dispose = startCoverResizeSession({
      startY: 100,
      startHeight: 200,
      snapshot,
      onFrame,
      onCommit,
    });

    dispose();
    dispose();

    const moveRemoves = removeSpy.mock.calls.filter(([name]) => name === 'mousemove');
    const upRemoves = removeSpy.mock.calls.filter(([name]) => name === 'mouseup');

    expect(moveRemoves).toHaveLength(1);
    expect(upRemoves).toHaveLength(1);
  });

  it('registers capture listeners so dragging keeps working over cover interactions', () => {
    const addSpy = vi.spyOn(document, 'addEventListener');

    startCoverResizeSession({
      startY: 100,
      startHeight: 200,
      snapshot,
      onFrame: vi.fn(),
      onCommit: vi.fn(),
    });

    expect(addSpy).toHaveBeenCalledWith('mousemove', expect.any(Function), true);
    expect(addSpy).toHaveBeenCalledWith('mouseup', expect.any(Function), true);
  });

  it('keeps the image pinned to the top after reaching the top in one resize session', () => {
    const onFrame = vi.fn();
    const onCommit = vi.fn();
    const addSpy = vi.spyOn(document, 'addEventListener');

    startCoverResizeSession({
      startY: 100,
      startHeight: 200,
      snapshot,
      onFrame,
      onCommit,
    });

    const moveHandler = addSpy.mock.calls.find(([eventName]) => eventName === 'mousemove')?.[1];
    expect(moveHandler).toBeTypeOf('function');

    (moveHandler as EventListener)(new MouseEvent('mousemove', { buttons: 1, clientY: 200 }));
    (moveHandler as EventListener)(new MouseEvent('mousemove', { buttons: 1, clientY: 150 }));

    expect(onFrame).toHaveBeenNthCalledWith(1, expect.objectContaining({
      effectiveHeight: 300,
      shiftY: 20,
    }));
    expect(onFrame).toHaveBeenNthCalledWith(2, expect.objectContaining({
      effectiveHeight: 250,
      shiftY: 20,
    }));
  });

  it('commits the last pressed position instead of a later hover position', () => {
    const animationFrames: FrameRequestCallback[] = [];
    globalThis.requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
      animationFrames.push(callback);
      return animationFrames.length;
    }) as typeof requestAnimationFrame;
    const onCommit = vi.fn();
    const addSpy = vi.spyOn(document, 'addEventListener');

    startCoverResizeSession({
      startY: 100,
      startHeight: 200,
      snapshot,
      onFrame: vi.fn(),
      onCommit,
    });

    const moveHandler = addSpy.mock.calls.find(([eventName]) => eventName === 'mousemove')?.[1];
    expect(moveHandler).toBeTypeOf('function');
    (moveHandler as EventListener)(new MouseEvent('mousemove', { buttons: 1, clientY: 140 }));
    (moveHandler as EventListener)(new MouseEvent('mousemove', { buttons: 0, clientY: 260 }));

    expect(onCommit).toHaveBeenCalledWith(expect.objectContaining({ pointerY: 140 }));
    expect(animationFrames).toHaveLength(1);
  });
});
