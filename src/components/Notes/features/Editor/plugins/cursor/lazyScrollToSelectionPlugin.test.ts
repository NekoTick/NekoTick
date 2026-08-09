import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EditorView } from '@milkdown/kit/prose/view';
import { createLazyScrollToSelectionController } from './lazyScrollToSelectionPlugin';

afterEach(() => {
  vi.restoreAllMocks();
});

function createView(lazy: boolean) {
  const shell = document.createElement('div');
  if (lazy) shell.setAttribute('data-note-lazy-block-visibility', 'true');
  const dom = document.createElement('div');
  shell.appendChild(dom);

  return {
    dom,
    isDestroyed: false,
    scrollToSelection: vi.fn(),
  } as unknown as EditorView;
}

describe('lazy scroll to selection', () => {
  it('coalesces lazy editor scroll requests and then uses the native view scroll', () => {
    const callbacks = new Map<number, TimerHandler>();
    let nextTimerId = 1;
    vi.spyOn(window, 'setTimeout').mockImplementation((callback) => {
      const timerId = nextTimerId;
      nextTimerId += 1;
      callbacks.set(timerId, callback);
      return timerId;
    });

    const controller = createLazyScrollToSelectionController();
    const view = createView(true);
    const nestedResult: boolean[] = [];
    vi.mocked(view.scrollToSelection).mockImplementation(() => {
      nestedResult.push(controller.handle(view));
    });

    expect(controller.handle(view)).toBe(true);
    expect(controller.handle(view)).toBe(true);
    expect(callbacks).toHaveLength(1);

    const callback = callbacks.values().next().value;
    if (typeof callback === 'function') callback();

    expect(view.scrollToSelection).toHaveBeenCalledOnce();
    expect(nestedResult).toEqual([false]);
  });

  it('keeps the native scroll path for ordinary editors', () => {
    const setTimeoutSpy = vi.spyOn(window, 'setTimeout');
    const controller = createLazyScrollToSelectionController();

    expect(controller.handle(createView(false))).toBe(false);
    expect(setTimeoutSpy).not.toHaveBeenCalled();
  });

  it('cancels a pending scroll when the editor view is destroyed', () => {
    vi.spyOn(window, 'setTimeout').mockReturnValue(7);
    const clearTimeoutSpy = vi.spyOn(window, 'clearTimeout');
    const controller = createLazyScrollToSelectionController();
    const view = createView(true);

    expect(controller.handle(view)).toBe(true);
    controller.cancel(view);

    expect(clearTimeoutSpy).toHaveBeenCalledWith(7);
  });
});
