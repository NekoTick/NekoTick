import { afterEach, describe, expect, it, vi } from 'vitest';
import { openSlashVideoPrompt } from './slashVideoPrompt';

function createMockView() {
  const dom = document.createElement('div');
  dom.getBoundingClientRect = vi.fn(() => ({
    bottom: 120,
    height: 100,
    left: 40,
    right: 640,
    top: 20,
    width: 600,
    x: 40,
    y: 20,
    toJSON: () => undefined,
  }));
  document.body.appendChild(dom);

  return {
    dom,
    focus: vi.fn(),
    coordsAtPos: vi.fn(() => ({
      bottom: 80,
      left: 120,
      right: 120,
      top: 60,
    })),
    state: {
      selection: {
        from: 1,
      },
    },
  };
}

describe('openSlashVideoPrompt', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('does not refocus the editor when an outside text control is clicked', () => {
    const view = createMockView();
    const titleInput = document.createElement('textarea');
    document.body.appendChild(titleInput);

    openSlashVideoPrompt({
      view: view as never,
      onSubmit: vi.fn(),
    });

    titleInput.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));

    expect(view.focus).not.toHaveBeenCalled();
    expect(document.querySelector('.slash-video-prompt')).toBeNull();
  });

  it('keeps the existing outside click behavior for non-editable targets', () => {
    const view = createMockView();
    const outside = document.createElement('div');
    document.body.appendChild(outside);

    openSlashVideoPrompt({
      view: view as never,
      onSubmit: vi.fn(),
    });

    outside.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));

    expect(view.focus).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.slash-video-prompt')).toBeNull();
  });

  it('closes before editor blank-area handling stops the event at document capture', () => {
    const view = createMockView();
    const outside = document.createElement('div');
    document.body.appendChild(outside);
    const stopAtDocumentCapture = (event: MouseEvent) => event.stopImmediatePropagation();
    document.addEventListener('mousedown', stopAtDocumentCapture, true);

    try {
      openSlashVideoPrompt({
        view: view as never,
        onSubmit: vi.fn(),
      });

      outside.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));

      expect(document.querySelector('.slash-video-prompt')).toBeNull();
    } finally {
      document.removeEventListener('mousedown', stopAtDocumentCapture, true);
    }
  });
});
