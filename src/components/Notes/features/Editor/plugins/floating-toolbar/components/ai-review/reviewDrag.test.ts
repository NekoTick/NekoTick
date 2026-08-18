import type { EditorView } from '@milkdown/kit/prose/view';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TOOLBAR_ACTIONS } from '../../types';
import { bindAiReviewDrag } from './reviewDrag';

function createEditorView() {
  const transaction = {
    setMeta: vi.fn(() => transaction),
  };
  return {
    state: {
      tr: transaction,
    },
    dispatch: vi.fn(),
  } as unknown as EditorView & {
    state: {
      tr: typeof transaction;
    };
    dispatch: ReturnType<typeof vi.fn>;
  };
}

describe('bindAiReviewDrag', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.replaceChildren();
  });

  it('moves the review panel during the same mouse move', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 800 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 600 });
    const requestAnimationFrameSpy = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation(() => 1);
    const cancelAnimationFrameSpy = vi
      .spyOn(window, 'cancelAnimationFrame')
      .mockImplementation(() => undefined);

    const container = document.createElement('div');
    const dragHandle = document.createElement('button');
    container.style.left = '100px';
    container.style.top = '120px';
    Object.defineProperty(container, 'offsetWidth', { configurable: true, value: 240 });
    Object.defineProperty(container, 'offsetHeight', { configurable: true, value: 180 });
    container.append(dragHandle);
    document.body.append(container);
    const view = createEditorView();

    bindAiReviewDrag({ container, dragHandle, view });

    dragHandle.dispatchEvent(new MouseEvent('mousedown', {
      button: 0,
      clientX: 40,
      clientY: 50,
      bubbles: true,
      cancelable: true,
    }));
    window.dispatchEvent(new MouseEvent('mousemove', {
      buttons: 1,
      clientX: 72,
      clientY: 92,
    }));

    expect(container.style.left).toBe('132px');
    expect(container.style.top).toBe('162px');
    expect(requestAnimationFrameSpy).toHaveBeenCalledTimes(1);
    expect(view.dispatch).not.toHaveBeenCalled();

    window.dispatchEvent(new MouseEvent('mouseup'));

    expect(cancelAnimationFrameSpy).toHaveBeenCalledWith(1);
    expect(view.state.tr.setMeta).toHaveBeenCalledWith(expect.anything(), {
      type: TOOLBAR_ACTIONS.UPDATE_POSITION,
      payload: {
        dragPosition: {
          x: 132,
          y: 162,
        },
      },
    });
    expect(view.dispatch).toHaveBeenCalledWith(view.state.tr);
  });

  it('finishes the drag when mouseup stops bubbling', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 800 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 600 });
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);

    const container = document.createElement('div');
    const dragHandle = document.createElement('button');
    const blocker = document.createElement('div');
    container.style.left = '100px';
    container.style.top = '120px';
    Object.defineProperty(container, 'offsetWidth', { configurable: true, value: 240 });
    Object.defineProperty(container, 'offsetHeight', { configurable: true, value: 180 });
    container.append(dragHandle);
    document.body.append(container, blocker);
    blocker.addEventListener('mouseup', (event) => event.stopPropagation());
    const view = createEditorView();

    bindAiReviewDrag({ container, dragHandle, view });

    dragHandle.dispatchEvent(new MouseEvent('mousedown', {
      button: 0,
      clientX: 40,
      clientY: 50,
      bubbles: true,
      cancelable: true,
    }));
    window.dispatchEvent(new MouseEvent('mousemove', {
      buttons: 1,
      clientX: 72,
      clientY: 92,
    }));
    blocker.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));

    expect(view.state.tr.setMeta).toHaveBeenCalledWith(expect.anything(), {
      type: TOOLBAR_ACTIONS.UPDATE_POSITION,
      payload: {
        dragPosition: {
          x: 132,
          y: 162,
        },
      },
    });
    expect(view.dispatch).toHaveBeenCalledWith(view.state.tr);
  });

  it('does not apply a hover position after the mouse button is released', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 800 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 600 });
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
    const container = document.createElement('div');
    const dragHandle = document.createElement('button');
    container.style.left = '100px';
    container.style.top = '120px';
    Object.defineProperty(container, 'offsetWidth', { configurable: true, value: 240 });
    Object.defineProperty(container, 'offsetHeight', { configurable: true, value: 180 });
    container.append(dragHandle);
    document.body.append(container);
    const view = createEditorView();

    bindAiReviewDrag({ container, dragHandle, view });
    dragHandle.dispatchEvent(new MouseEvent('mousedown', {
      button: 0,
      clientX: 40,
      clientY: 50,
      bubbles: true,
      cancelable: true,
    }));
    window.dispatchEvent(new MouseEvent('mousemove', {
      buttons: 1,
      clientX: 72,
      clientY: 92,
    }));
    window.dispatchEvent(new MouseEvent('mousemove', {
      buttons: 0,
      clientX: 300,
      clientY: 300,
    }));

    expect(container.style.left).toBe('132px');
    expect(container.style.top).toBe('162px');
    expect(view.state.tr.setMeta).toHaveBeenLastCalledWith(expect.anything(), {
      type: TOOLBAR_ACTIONS.UPDATE_POSITION,
      payload: { dragPosition: { x: 132, y: 162 } },
    });
  });
});
