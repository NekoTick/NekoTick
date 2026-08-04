import { afterEach, describe, expect, it, vi } from 'vitest';
import { startBlockDragSession } from './blockDragSession';
import { isBlockSelectionInteractionPending } from './blockSelectionInteractionState';

function setupViewDom() {
  const editorRoot = document.createElement('div');
  editorRoot.className = 'milkdown-editor';
  const dom = document.createElement('div');
  editorRoot.appendChild(dom);
  document.body.appendChild(editorRoot);
  return {
    view: { dom } as any,
    editorRoot,
  };
}

afterEach(async () => {
  await new Promise((resolve) => window.setTimeout(resolve, 0));
  document.body.innerHTML = '';
  document.body.style.cursor = '';
  document.body.style.userSelect = '';
});

describe('startBlockDragSession', () => {
  it('treats mouse up without dragging as plain click', () => {
    const { view } = setupViewDom();
    const cursorRoot = document.createElement('div');
    document.body.appendChild(cursorRoot);
    const onActivate = vi.fn();
    const onDragMove = vi.fn();
    const onPlainClick = vi.fn();
    const onTeardown = vi.fn();
    const event = new MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
      clientX: 10,
      clientY: 20,
    });

    startBlockDragSession({
      view,
      event,
      startZone: 'outside-editor',
      dragThreshold: 6,
      cursor: 'crosshair',
      cursorRoot,
      onActivate,
      onDragMove,
      onPlainClick,
      onTeardown,
    });

    expect(view.dom.classList.contains('editor-block-selection-pending')).toBe(false);
    expect(isBlockSelectionInteractionPending(view.dom)).toBe(true);
    expect(cursorRoot.style.cursor).toBe('');
    expect(document.body.style.cursor).toBe('');
    expect(view.dom.style.cursor).toBe('');

    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));

    expect(onActivate).not.toHaveBeenCalled();
    expect(onDragMove).not.toHaveBeenCalled();
    expect(onPlainClick).toHaveBeenCalledWith('outside-editor');
    expect(onTeardown).toHaveBeenCalledTimes(1);
    expect(view.dom.classList.contains('editor-block-selection-pending')).toBe(false);
    expect(isBlockSelectionInteractionPending(view.dom)).toBe(false);
    expect(cursorRoot.style.cursor).toBe('');
    expect(document.body.style.userSelect).toBe('');

    const followUpClick = new MouseEvent('click', { bubbles: true, cancelable: true });
    document.dispatchEvent(followUpClick);
    expect(followUpClick.defaultPrevented).toBe(true);

    const intentionalClick = new MouseEvent('click', { bubbles: true, cancelable: true });
    document.dispatchEvent(intentionalClick);
    expect(intentionalClick.defaultPrevented).toBe(false);
  });

  it('activates drag after threshold and emits normalized selection rect', () => {
    const { view } = setupViewDom();
    const cursorRoot = document.createElement('div');
    document.body.appendChild(cursorRoot);
    const onActivate = vi.fn();
    const onDragMove = vi.fn();
    const onPlainClick = vi.fn();
    const onTeardown = vi.fn();
    const event = new MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
      clientX: 40,
      clientY: 30,
    });

    startBlockDragSession({
      view,
      event,
      startZone: 'below-last-block',
      dragThreshold: 4,
      cursor: 'crosshair',
      cursorRoot,
      onActivate,
      onDragMove,
      onPlainClick,
      onTeardown,
    });

    expect(view.dom.classList.contains('editor-block-selection-pending')).toBe(false);
    expect(cursorRoot.style.cursor).toBe('');
    expect(document.body.style.cursor).toBe('');
    expect(view.dom.style.cursor).toBe('');

    document.dispatchEvent(new MouseEvent('mousemove', {
      bubbles: true,
      cancelable: true,
      clientX: 42,
      clientY: 32,
      buttons: 1,
    }));

    expect(cursorRoot.style.cursor).toBe('');
    expect(view.dom.style.cursor).toBe('');

    document.dispatchEvent(new MouseEvent('mousemove', {
      bubbles: true,
      cancelable: true,
      clientX: 24,
      clientY: 54,
      buttons: 1,
    }));

    expect(onActivate).toHaveBeenCalledTimes(1);
    expect(onDragMove).toHaveBeenCalledTimes(1);
    expect(onDragMove).toHaveBeenCalledWith(
      {
        left: 24,
        top: 30,
        right: 40,
        bottom: 54,
      },
      { clientX: 24, clientY: 54 },
    );
    expect(view.dom.classList.contains('editor-block-selection-pending')).toBe(true);
    expect(document.querySelector('.editor-block-selection-interaction-shield')).not.toBeNull();
    expect(document.body.classList.contains('editor-block-dragging-cursor')).toBe(false);
    expect(cursorRoot.style.cursor).toBe('crosshair');
    expect(document.body.style.cursor).toBe('');
    expect(view.dom.style.cursor).toBe('crosshair');
    expect(document.body.style.userSelect).toBe('');

    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));

    expect(onPlainClick).not.toHaveBeenCalled();
    expect(onTeardown).toHaveBeenCalledTimes(1);
    expect(view.dom.classList.contains('editor-block-selection-pending')).toBe(false);
    expect(document.querySelector('.editor-block-selection-interaction-shield')).toBeNull();
    expect(document.body.classList.contains('editor-block-dragging-cursor')).toBe(false);
    expect(document.body.style.userSelect).toBe('');
  });

  it('coalesces follow-up moves per frame and flushes the latest move on mouse up', () => {
    const animationFrames: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback: FrameRequestCallback) => {
      animationFrames.push(callback);
      return animationFrames.length;
    });
    const cancelAnimationFrame = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(vi.fn());
    const { view } = setupViewDom();
    const onDragMove = vi.fn();
    const onPointerMove = vi.fn();

    startBlockDragSession({
      view,
      event: new MouseEvent('mousedown', {
        bubbles: true,
        cancelable: true,
        clientX: 10,
        clientY: 20,
      }),
      startZone: 'outside-editor',
      dragThreshold: 1,
      cursor: 'crosshair',
      onActivate: vi.fn(),
      onPointerMove,
      onDragMove,
      onPlainClick: vi.fn(),
    });

    document.dispatchEvent(new MouseEvent('mousemove', {
      bubbles: true,
      cancelable: true,
      buttons: 1,
      clientX: 20,
      clientY: 30,
    }));
    document.dispatchEvent(new MouseEvent('mousemove', {
      bubbles: true,
      cancelable: true,
      buttons: 1,
      clientX: 30,
      clientY: 40,
    }));
    document.dispatchEvent(new MouseEvent('mousemove', {
      bubbles: true,
      cancelable: true,
      buttons: 1,
      clientX: 40,
      clientY: 50,
    }));

    expect(onDragMove).toHaveBeenCalledTimes(1);
    animationFrames.shift()?.(16);
    expect(onDragMove).toHaveBeenCalledTimes(2);
    expect(onPointerMove).toHaveBeenLastCalledWith({ clientX: 40, clientY: 50 });
    expect(onDragMove).toHaveBeenLastCalledWith(
      {
        left: 10,
        top: 20,
        right: 40,
        bottom: 50,
      },
      { clientX: 40, clientY: 50 },
    );

    document.dispatchEvent(new MouseEvent('mousemove', {
      bubbles: true,
      cancelable: true,
      buttons: 1,
      clientX: 50,
      clientY: 60,
    }));
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));

    expect(onDragMove).toHaveBeenCalledTimes(3);
    expect(onDragMove).toHaveBeenLastCalledWith(
      {
        left: 10,
        top: 20,
        right: 50,
        bottom: 60,
      },
      { clientX: 50, clientY: 60 },
    );
    expect(cancelAnimationFrame).toHaveBeenCalled();
  });

  it('avoids mutating the ProseMirror class list for large document drags', () => {
    const { view } = setupViewDom();
    view.dom.classList.add('editor-block-selection-large');

    startBlockDragSession({
      view,
      event: new MouseEvent('mousedown', {
        bubbles: true,
        cancelable: true,
        clientX: 10,
        clientY: 20,
      }),
      startZone: 'below-last-block',
      dragThreshold: 1,
      cursor: 'crosshair',
      onActivate: vi.fn(),
      onDragMove: vi.fn(),
      onPlainClick: vi.fn(),
    });

    document.dispatchEvent(new MouseEvent('mousemove', {
      bubbles: true,
      cancelable: true,
      buttons: 1,
      clientX: 30,
      clientY: 40,
    }));

    expect(view.dom.classList.contains('editor-block-selection-pending')).toBe(false);
    expect(document.querySelector('.editor-block-selection-interaction-shield')).not.toBeNull();
    expect(isBlockSelectionInteractionPending(view.dom)).toBe(true);
    expect(view.dom.style.cursor).toBe('');

    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    expect(document.querySelector('.editor-block-selection-interaction-shield')).toBeNull();
    expect(isBlockSelectionInteractionPending(view.dom)).toBe(false);
  });

  it('suppresses only the click generated immediately after an activated block drag', () => {
    const { view } = setupViewDom();
    const link = document.createElement('a');
    link.href = 'https://example.test';
    document.body.appendChild(link);
    const linkClick = vi.fn();
    const documentClick = vi.fn();
    link.addEventListener('click', linkClick);
    document.addEventListener('click', documentClick, true);

    startBlockDragSession({
      view,
      event: new MouseEvent('mousedown', {
        bubbles: true,
        cancelable: true,
        clientX: 10,
        clientY: 20,
      }),
      startZone: 'below-last-block',
      dragThreshold: 4,
      cursor: 'crosshair',
      onActivate: vi.fn(),
      onDragMove: vi.fn(),
      onPlainClick: vi.fn(),
    });

    document.dispatchEvent(new MouseEvent('mousemove', {
      bubbles: true,
      cancelable: true,
      buttons: 1,
      clientX: 30,
      clientY: 40,
    }));
    document.dispatchEvent(new MouseEvent('mouseup', {
      bubbles: true,
      cancelable: true,
      clientX: 30,
      clientY: 40,
    }));

    const followUpClick = new MouseEvent('click', { bubbles: true, cancelable: true });
    link.dispatchEvent(followUpClick);

    expect(followUpClick.defaultPrevented).toBe(true);
    expect(linkClick).not.toHaveBeenCalled();
    expect(documentClick).not.toHaveBeenCalled();

    const intentionalClick = new MouseEvent('click', { bubbles: true, cancelable: true });
    link.dispatchEvent(intentionalClick);

    expect(intentionalClick.defaultPrevented).toBe(false);
    expect(linkClick).toHaveBeenCalledTimes(1);
    expect(documentClick).toHaveBeenCalledTimes(1);
    document.removeEventListener('click', documentClick, true);
  });

  it('releases follow-up click suppression when the drag produces no click event', async () => {
    const { view } = setupViewDom();
    const button = document.createElement('button');
    document.body.appendChild(button);
    const buttonClick = vi.fn();
    button.addEventListener('click', buttonClick);

    startBlockDragSession({
      view,
      event: new MouseEvent('mousedown', {
        bubbles: true,
        cancelable: true,
        clientX: 10,
        clientY: 20,
      }),
      startZone: 'below-last-block',
      dragThreshold: 4,
      cursor: 'crosshair',
      onActivate: vi.fn(),
      onDragMove: vi.fn(),
      onPlainClick: vi.fn(),
    });

    document.dispatchEvent(new MouseEvent('mousemove', {
      bubbles: true,
      cancelable: true,
      buttons: 1,
      clientX: 30,
      clientY: 40,
    }));
    document.dispatchEvent(new MouseEvent('mouseup', {
      bubbles: true,
      cancelable: true,
      clientX: 30,
      clientY: 40,
    }));
    await new Promise((resolve) => window.setTimeout(resolve, 0));

    const intentionalClick = new MouseEvent('click', { bubbles: true, cancelable: true });
    button.dispatchEvent(intentionalClick);

    expect(intentionalClick.defaultPrevented).toBe(false);
    expect(buttonClick).toHaveBeenCalledTimes(1);
  });

  it('can be stopped manually', () => {
    const { view } = setupViewDom();
    const onActivate = vi.fn();
    const onDragMove = vi.fn();
    const onPlainClick = vi.fn();
    const onTeardown = vi.fn();
    const event = new MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
      clientX: 8,
      clientY: 8,
    });

    const session = startBlockDragSession({
      view,
      event,
      startZone: 'outside-editor',
      dragThreshold: 1,
      cursor: 'crosshair',
      onActivate,
      onDragMove,
      onPlainClick,
      onTeardown,
    });

    session.stop();
    document.dispatchEvent(new MouseEvent('mousemove', {
      bubbles: true,
      cancelable: true,
      clientX: 20,
      clientY: 20,
      buttons: 1,
    }));
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));

    expect(onActivate).not.toHaveBeenCalled();
    expect(onDragMove).not.toHaveBeenCalled();
    expect(onPlainClick).not.toHaveBeenCalled();
    expect(onTeardown).toHaveBeenCalledTimes(1);
  });

  it('tears down on window blur without turning the gesture into a plain click', () => {
    const { view } = setupViewDom();
    const cursorRoot = document.createElement('div');
    document.body.appendChild(cursorRoot);
    const onActivate = vi.fn();
    const onDragMove = vi.fn();
    const onPlainClick = vi.fn();
    const onTeardown = vi.fn();
    const event = new MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
      clientX: 10,
      clientY: 10,
    });

    startBlockDragSession({
      view,
      event,
      startZone: 'outside-editor',
      dragThreshold: 1,
      cursor: 'crosshair',
      cursorRoot,
      onActivate,
      onDragMove,
      onPlainClick,
      onTeardown,
    });

    document.dispatchEvent(new MouseEvent('mousemove', {
      bubbles: true,
      cancelable: true,
      clientX: 30,
      clientY: 30,
      buttons: 1,
    }));
    expect(view.dom.classList.contains('editor-block-selection-pending')).toBe(true);

    window.dispatchEvent(new Event('blur'));
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));

    expect(onActivate).toHaveBeenCalledTimes(1);
    expect(onDragMove).toHaveBeenCalledTimes(1);
    expect(onPlainClick).not.toHaveBeenCalled();
    expect(onTeardown).toHaveBeenCalledTimes(1);
    expect(view.dom.classList.contains('editor-block-selection-pending')).toBe(false);
    expect(cursorRoot.style.cursor).toBe('');
    expect(view.dom.style.cursor).toBe('');
  });

  it('does not tear down when an editor child loses focus during drag activation', () => {
    const { view } = setupViewDom();
    const button = document.createElement('button');
    view.dom.appendChild(button);
    const onActivate = vi.fn();
    const onDragMove = vi.fn();
    const onPlainClick = vi.fn();
    const onTeardown = vi.fn();
    const event = new MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
      clientX: 10,
      clientY: 10,
    });

    startBlockDragSession({
      view,
      event,
      startZone: 'outside-editor',
      dragThreshold: 1,
      cursor: 'crosshair',
      onActivate,
      onDragMove,
      onPlainClick,
      onTeardown,
    });

    button.dispatchEvent(new FocusEvent('blur'));
    document.dispatchEvent(new MouseEvent('mousemove', {
      bubbles: true,
      cancelable: true,
      clientX: 30,
      clientY: 30,
      buttons: 1,
    }));
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));

    expect(onActivate).toHaveBeenCalledTimes(1);
    expect(onDragMove).toHaveBeenCalledTimes(1);
    expect(onPlainClick).not.toHaveBeenCalled();
    expect(onTeardown).toHaveBeenCalledTimes(1);
  });

  it('listens on the editor owner document instead of the global document', () => {
    const iframe = document.createElement('iframe');
    document.body.appendChild(iframe);
    const ownerDocument = iframe.contentDocument;
    if (!ownerDocument || !iframe.contentWindow) {
      throw new Error('Expected iframe document');
    }
    const OwnerMouseEvent = (iframe.contentWindow as unknown as { MouseEvent: typeof MouseEvent }).MouseEvent;
    const editorRoot = ownerDocument.createElement('div');
    editorRoot.className = 'milkdown-editor';
    const dom = ownerDocument.createElement('div');
    editorRoot.appendChild(dom);
    ownerDocument.body.appendChild(editorRoot);

    const view = { dom } as any;
    const onActivate = vi.fn();
    const onDragMove = vi.fn();
    const onPlainClick = vi.fn();
    const onTeardown = vi.fn();
    const event = new OwnerMouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
      clientX: 10,
      clientY: 10,
    });

    startBlockDragSession({
      view,
      event,
      startZone: 'outside-editor',
      dragThreshold: 1,
      cursor: 'crosshair',
      onActivate,
      onDragMove,
      onPlainClick,
      onTeardown,
    });

    document.dispatchEvent(new MouseEvent('mousemove', {
      bubbles: true,
      cancelable: true,
      clientX: 30,
      clientY: 30,
      buttons: 1,
    }));

    expect(onActivate).not.toHaveBeenCalled();
    expect(onDragMove).not.toHaveBeenCalled();

    ownerDocument.dispatchEvent(new OwnerMouseEvent('mousemove', {
      bubbles: true,
      cancelable: true,
      clientX: 30,
      clientY: 30,
      buttons: 1,
    }));
    ownerDocument.dispatchEvent(new OwnerMouseEvent('mouseup', {
      bubbles: true,
      cancelable: true,
    }));

    expect(onActivate).toHaveBeenCalledTimes(1);
    expect(onDragMove).toHaveBeenCalledTimes(1);
    expect(onPlainClick).not.toHaveBeenCalled();
    expect(onTeardown).toHaveBeenCalledTimes(1);
  });
});
