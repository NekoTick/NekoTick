import { afterEach, describe, expect, it, vi } from 'vitest';
import { OVERLAY_SCROLL_IDLE_EVENT } from '@/components/ui/overlayScrollAreaEvents';
import {
  isTagTokenBoundaryAtTextblock,
  shouldShowTextBlockCaretOverlay,
  TEXTBLOCK_CARET_OVERLAY_REFRESH_EVENT,
  TextBlockCaretOverlayView,
} from './textBlockCaretOverlayPlugin';
import { setBlockSelectionInteractionPending } from './blockSelectionInteractionState';
import { POINTER_SELECTION_ACTIVE_ATTRIBUTE } from '../selection/textSelectionOverlayState';

function createParent(text: string) {
  return {
    content: { size: text.length },
    textBetween: vi.fn((from: number, to: number) => text.slice(from, to)),
    get textContent() {
      throw new Error('aggregate parent textContent should not be read');
    },
  };
}

class TestResizeObserver {
  static instances: TestResizeObserver[] = [];

  readonly observe = vi.fn();
  readonly disconnect = vi.fn();

  constructor(readonly callback: ResizeObserverCallback) {
    TestResizeObserver.instances.push(this);
  }
}

function createTextblockSelection() {
  const text = 'alpha';
  return {
    empty: true,
    head: 1,
    $from: {
      parent: {
        content: { size: text.length },
        textBetween: vi.fn((from: number, to: number) => text.slice(from, to)),
        isTextblock: true,
      },
      parentOffset: 1,
    },
  };
}

function createTextblockSelectionAt(head: number) {
  const text = 'alpha';
  return {
    empty: true,
    head,
    $from: {
      parent: {
        content: { size: text.length },
        textBetween: vi.fn((from: number, to: number) => text.slice(from, to)),
        isTextblock: true,
      },
      parentOffset: head,
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  TestResizeObserver.instances = [];
  document.body.innerHTML = '';
});

describe('textBlockCaretOverlayPlugin', () => {
  it('hides the caret overlay while block selection is pending', () => {
    const editorDom = document.createElement('div');
    const view = {
      dom: editorDom,
      composing: false,
      hasFocus: () => true,
      state: {
        selection: createTextblockSelection(),
      },
    };

    setBlockSelectionInteractionPending(editorDom, true);

    expect(shouldShowTextBlockCaretOverlay(view as any)).toBe(false);

    setBlockSelectionInteractionPending(editorDom, false);
    expect(shouldShowTextBlockCaretOverlay(view as any)).toBe(true);
  });

  it('detects a tag token boundary without reading aggregate text', () => {
    const parent = createParent('hello #tag');

    expect(isTagTokenBoundaryAtTextblock(parent, 10)).toBe(true);
    expect(parent.textBetween).toHaveBeenCalledWith(0, 10, '\0', '\0');
  });

  it('does not treat a tag token as complete when another token character follows', () => {
    const parent = createParent('hello #tagx');

    expect(isTagTokenBoundaryAtTextblock(parent, 10)).toBe(false);
    expect(parent.textBetween).toHaveBeenCalledWith(10, 11, '\0', '\0');
  });

  it('limits tag boundary lookbehind text reads', () => {
    const parent = createParent(`${'x'.repeat(512)} #tag`);

    expect(isTagTokenBoundaryAtTextblock(parent, 517)).toBe(true);
    expect(parent.textBetween).toHaveBeenCalledWith(261, 517, '\0', '\0');
  });

  it('repositions the caret overlay when editor geometry changes', () => {
    const animationFrames: FrameRequestCallback[] = [];
    const animationFrame = vi.fn((callback: FrameRequestCallback) => {
      animationFrames.push(callback);
      return animationFrames.length;
    });
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(animationFrame);
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(vi.fn());
    vi.stubGlobal('ResizeObserver', TestResizeObserver);

    const editorDom = document.createElement('div');
    document.body.appendChild(editorDom);

    let top = 12;
    const view = {
      dom: editorDom,
      composing: false,
      hasFocus: () => true,
      coordsAtPos: vi.fn(() => ({
        left: 24,
        top,
        bottom: top + 20,
      })),
      domAtPos: vi.fn(),
      state: {
        selection: createTextblockSelection(),
      },
    };

    const overlay = new TextBlockCaretOverlayView(view as any);
    animationFrames.shift()?.(0);
    const caret = document.querySelector<HTMLElement>('.editor-textblock-caret-overlay');

    expect(TestResizeObserver.instances).toHaveLength(1);
    expect(TestResizeObserver.instances[0]!.observe).toHaveBeenCalledWith(editorDom);
    expect(caret?.style.top).toBe('12px');

    top = 48;
    TestResizeObserver.instances[0]!.callback([], TestResizeObserver.instances[0] as unknown as ResizeObserver);
    animationFrames.shift()?.(0);

    expect(view.coordsAtPos).toHaveBeenCalledTimes(2);
    expect(caret?.style.top).toBe('48px');

    overlay.destroy();
    expect(TestResizeObserver.instances[0]!.disconnect).toHaveBeenCalledTimes(1);
  });

  it('suspends caret geometry work until scrolling becomes idle', () => {
    const animationFrames: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback: FrameRequestCallback) => {
      animationFrames.push(callback);
      return animationFrames.length;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(vi.fn());
    vi.stubGlobal('ResizeObserver', TestResizeObserver);

    const scrollRoot = document.createElement('div');
    scrollRoot.dataset.noteScrollRoot = 'true';
    const editorDom = document.createElement('div');
    scrollRoot.appendChild(editorDom);
    document.body.appendChild(scrollRoot);

    let top = 12;
    const view = {
      dom: editorDom,
      composing: false,
      hasFocus: () => true,
      coordsAtPos: vi.fn(() => ({ left: 24, top, bottom: top + 20 })),
      domAtPos: vi.fn(),
      state: { selection: createTextblockSelection() },
    };

    const overlay = new TextBlockCaretOverlayView(view as any);
    animationFrames.shift()?.(0);
    expect(view.coordsAtPos).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.editor-textblock-caret-overlay')).not.toBeNull();

    top = 48;
    scrollRoot.dispatchEvent(new Event('scroll'));
    scrollRoot.dispatchEvent(new Event('scroll'));
    document.dispatchEvent(new Event('selectionchange'));

    expect(document.querySelector('.editor-textblock-caret-overlay')).toBeNull();
    expect(animationFrames).toHaveLength(0);
    expect(view.coordsAtPos).toHaveBeenCalledTimes(1);

    window.dispatchEvent(new Event(OVERLAY_SCROLL_IDLE_EVENT));
    animationFrames.shift()?.(0);

    expect(view.coordsAtPos).toHaveBeenCalledTimes(2);
    expect(document.querySelector<HTMLElement>('.editor-textblock-caret-overlay')?.style.top).toBe('48px');

    overlay.destroy();
  });

  it('suspends caret geometry work while pointer text selection is active', () => {
    const animationFrames: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback: FrameRequestCallback) => {
      animationFrames.push(callback);
      return animationFrames.length;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(vi.fn());
    vi.stubGlobal('ResizeObserver', TestResizeObserver);

    const editorDom = document.createElement('div');
    document.body.appendChild(editorDom);
    const view = {
      dom: editorDom,
      composing: false,
      hasFocus: () => true,
      coordsAtPos: vi.fn(() => ({ left: 24, top: 12, bottom: 32 })),
      domAtPos: vi.fn(),
      state: { selection: createTextblockSelection() },
    };

    const overlay = new TextBlockCaretOverlayView(view as any);
    animationFrames.shift()?.(0);
    expect(view.coordsAtPos).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.editor-textblock-caret-overlay')).not.toBeNull();

    editorDom.setAttribute(POINTER_SELECTION_ACTIVE_ATTRIBUTE, 'true');
    editorDom.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }));
    overlay.update(view as any);

    expect(animationFrames).toHaveLength(0);
    expect(view.coordsAtPos).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.editor-textblock-caret-overlay')).toBeNull();

    editorDom.removeAttribute(POINTER_SELECTION_ACTIVE_ATTRIBUTE);
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    animationFrames.shift()?.(0);

    expect(view.coordsAtPos).toHaveBeenCalledTimes(2);
    expect(document.querySelector('.editor-textblock-caret-overlay')).not.toBeNull();

    overlay.destroy();
  });

  it('refreshes the caret overlay immediately when requested after a scroll write', () => {
    const animationFrames: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback: FrameRequestCallback) => {
      animationFrames.push(callback);
      return animationFrames.length;
    });
    const cancelAnimationFrame = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(vi.fn());
    vi.stubGlobal('ResizeObserver', TestResizeObserver);

    const editorDom = document.createElement('div');
    document.body.appendChild(editorDom);

    let top = 12;
    const view = {
      dom: editorDom,
      composing: false,
      hasFocus: () => true,
      coordsAtPos: vi.fn(() => ({
        left: 24,
        top,
        bottom: top + 20,
      })),
      domAtPos: vi.fn(),
      state: {
        selection: createTextblockSelection(),
      },
    };

    const overlay = new TextBlockCaretOverlayView(view as any);
    animationFrames.shift()?.(0);
    const caret = document.querySelector<HTMLElement>('.editor-textblock-caret-overlay');
    expect(caret?.style.top).toBe('12px');

    top = 48;
    overlay.update(view as any);
    editorDom.dispatchEvent(new Event(TEXTBLOCK_CARET_OVERLAY_REFRESH_EVENT));

    expect(caret?.style.top).toBe('48px');
    expect(cancelAnimationFrame).toHaveBeenCalledTimes(1);

    overlay.destroy();
  });

  it('does not refresh the caret overlay during IME composition keydown', () => {
    const animationFrame = vi.fn((callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(animationFrame);
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(vi.fn());
    vi.stubGlobal('ResizeObserver', TestResizeObserver);

    const editorDom = document.createElement('div');
    document.body.appendChild(editorDom);

    const view = {
      dom: editorDom,
      composing: false,
      hasFocus: () => true,
      coordsAtPos: vi.fn(() => ({
        left: 24,
        top: 12,
        bottom: 32,
      })),
      domAtPos: vi.fn(),
      state: {
        selection: createTextblockSelection(),
      },
    };

    const overlay = new TextBlockCaretOverlayView(view as any);
    animationFrame.mockClear();

    editorDom.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'ArrowLeft',
      bubbles: true,
      isComposing: true,
    }));

    expect(animationFrame).not.toHaveBeenCalled();

    overlay.destroy();
  });

  it.each(['ArrowDown', 'ArrowUp'])(
    'does not redraw a stale caret overlay before %s updates selection',
    (key) => {
      const animationFrames: FrameRequestCallback[] = [];
      vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback: FrameRequestCallback) => {
        animationFrames.push(callback);
        return animationFrames.length;
      });
      vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(vi.fn());
      vi.stubGlobal('ResizeObserver', TestResizeObserver);

      const editorDom = document.createElement('div');
      document.body.appendChild(editorDom);

      const view = {
        dom: editorDom,
        composing: false,
        hasFocus: () => true,
        coordsAtPos: vi.fn((pos: number) => ({
          left: pos === 1 ? 24 : 48,
          top: 12,
          bottom: 32,
        })),
        domAtPos: vi.fn(),
        state: {
          selection: createTextblockSelectionAt(1),
        },
      };

      const overlay = new TextBlockCaretOverlayView(view as any);
      animationFrames.shift()?.(0);
      expect(document.querySelector<HTMLElement>('.editor-textblock-caret-overlay')?.style.left).toBe('24px');

      editorDom.dispatchEvent(new KeyboardEvent('keydown', {
        key,
        bubbles: true,
      }));

      expect(document.querySelector('.editor-textblock-caret-overlay')).toBeNull();
      animationFrames.shift()?.(0);
      expect(document.querySelector('.editor-textblock-caret-overlay')).toBeNull();

      view.state.selection = createTextblockSelectionAt(2);
      overlay.update(view as any);
      animationFrames.shift()?.(0);

      expect(document.querySelector<HTMLElement>('.editor-textblock-caret-overlay')?.style.left).toBe('48px');

      overlay.destroy();
    },
  );

  it('captures vertical navigation before earlier bubble handlers update selection', () => {
    const animationFrames: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback: FrameRequestCallback) => {
      animationFrames.push(callback);
      return animationFrames.length;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(vi.fn());
    vi.stubGlobal('ResizeObserver', TestResizeObserver);

    const editorDom = document.createElement('div');
    document.body.appendChild(editorDom);

    const view = {
      dom: editorDom,
      composing: false,
      hasFocus: () => true,
      coordsAtPos: vi.fn((pos: number) => ({
        left: pos === 1 ? 24 : 48,
        top: 12,
        bottom: 32,
      })),
      domAtPos: vi.fn(),
      state: {
        selection: createTextblockSelectionAt(1),
      },
    };
    let overlay: TextBlockCaretOverlayView | null = null;

    editorDom.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowDown') return;
      view.state.selection = createTextblockSelectionAt(2);
      overlay?.update(view as any);
    });

    overlay = new TextBlockCaretOverlayView(view as any);
    animationFrames.shift()?.(0);
    expect(document.querySelector<HTMLElement>('.editor-textblock-caret-overlay')?.style.left).toBe('24px');

    editorDom.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'ArrowDown',
      bubbles: true,
    }));

    animationFrames.shift()?.(0);

    expect(document.querySelector<HTMLElement>('.editor-textblock-caret-overlay')?.style.left).toBe('48px');

    overlay.destroy();
  });
});
