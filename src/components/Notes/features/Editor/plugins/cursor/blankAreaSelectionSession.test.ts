import type { EditorView } from '@milkdown/kit/prose/view';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBlockRectResolver } from './blockRectResolver';
import {
  blurActiveEditableElement,
  filterExternalBlankAreaSelectionEdgeGrazes,
  resolveBlankAreaSelectionAutoScrollDelta,
  startBlankAreaSelectionSession,
} from './blankAreaSelectionSession';
import { VERTICAL_EDGE_AUTO_SCROLL_MAX_STEP_PX } from './edgeAutoScroll';
import type { BlockRect } from './blockSelectionUtils';

const rectResolverMockState = vi.hoisted(() => ({
  currentRects: [] as BlockRect[],
  getPlainClickBlockRects: vi.fn(() => [] as BlockRect[]),
  getSelectionBlockRects: vi.fn(() => [] as BlockRect[]),
  getSelectionBlockElements: vi.fn(() => [] as HTMLElement[]),
  getTopLevelBlockRects: vi.fn(() => [] as BlockRect[]),
  invalidate: vi.fn(),
}));

vi.mock('./blockRectResolver', () => ({
  createBlockRectResolver: vi.fn(() => ({
    getPlainClickBlockRects: rectResolverMockState.getPlainClickBlockRects,
    getSelectionBlockRects: rectResolverMockState.getSelectionBlockRects,
    getSelectionBlockElements: rectResolverMockState.getSelectionBlockElements,
    getTopLevelBlockRects: rectResolverMockState.getTopLevelBlockRects,
    invalidate: rectResolverMockState.invalidate,
  })),
}));

class TestResizeObserver {
  static instances: TestResizeObserver[] = [];

  readonly observe = vi.fn();
  readonly disconnect = vi.fn();

  constructor(readonly callback: ResizeObserverCallback) {
    TestResizeObserver.instances.push(this);
  }
}

function blockRect(from: number, to: number, top: number, bottom: number): BlockRect {
  return {
    from,
    to,
    left: 100,
    top,
    right: 500,
    bottom,
  };
}

function createView(): EditorView {
  const scrollRoot = document.createElement('div');
  scrollRoot.setAttribute('data-note-scroll-root', 'true');
  const editorDom = document.createElement('div');
  scrollRoot.append(editorDom);
  document.body.append(scrollRoot);

  return {
    dom: editorDom,
    state: {
      doc: {
        content: { size: 20 },
        resolve: vi.fn(() => ({ nodeAfter: null })),
      },
    },
  } as unknown as EditorView;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.mocked(createBlockRectResolver).mockClear();
  TestResizeObserver.instances = [];
  rectResolverMockState.currentRects = [];
  rectResolverMockState.getPlainClickBlockRects.mockReset();
  rectResolverMockState.getPlainClickBlockRects.mockImplementation(() => rectResolverMockState.currentRects);
  rectResolverMockState.getSelectionBlockRects.mockReset();
  rectResolverMockState.getSelectionBlockRects.mockImplementation(() => rectResolverMockState.currentRects);
  rectResolverMockState.getSelectionBlockElements.mockReset();
  rectResolverMockState.getSelectionBlockElements.mockImplementation(() => []);
  rectResolverMockState.getTopLevelBlockRects.mockReset();
  rectResolverMockState.getTopLevelBlockRects.mockImplementation(() => rectResolverMockState.currentRects);
  rectResolverMockState.invalidate.mockClear();
  document.body.innerHTML = '';
});

describe('resolveBlankAreaSelectionAutoScrollDelta', () => {
  const scrollRootRect = { top: 100, bottom: 500 };

  it('does not scroll when the pointer is away from the viewport edges', () => {
    expect(resolveBlankAreaSelectionAutoScrollDelta(260, scrollRootRect)).toBe(0);
  });

  it('scrolls upward near the top edge', () => {
    expect(resolveBlankAreaSelectionAutoScrollDelta(140, scrollRootRect)).toBeLessThan(0);
    expect(resolveBlankAreaSelectionAutoScrollDelta(80, scrollRootRect)).toBe(
      -VERTICAL_EDGE_AUTO_SCROLL_MAX_STEP_PX,
    );
  });

  it('scrolls downward near the bottom edge', () => {
    expect(resolveBlankAreaSelectionAutoScrollDelta(460, scrollRootRect)).toBeGreaterThan(0);
    expect(resolveBlankAreaSelectionAutoScrollDelta(520, scrollRootRect)).toBe(
      VERTICAL_EDGE_AUTO_SCROLL_MAX_STEP_PX,
    );
  });
});

describe('blurActiveEditableElement', () => {
  it('blurs the focused editable element when block selection activates', () => {
    const input = document.createElement('textarea');
    document.body.appendChild(input);

    try {
      input.focus();
      expect(document.activeElement).toBe(input);

      blurActiveEditableElement(document);

      expect(document.activeElement).not.toBe(input);
    } finally {
      input.remove();
    }
  });

  it('does not blur non-editable focused surfaces', () => {
    const surface = document.createElement('div');
    surface.tabIndex = 0;
    document.body.appendChild(surface);

    try {
      surface.focus();
      expect(document.activeElement).toBe(surface);

      blurActiveEditableElement(document);

      expect(document.activeElement).toBe(surface);
    } finally {
      surface.remove();
    }
  });
});

describe('filterExternalBlankAreaSelectionEdgeGrazes', () => {
  const block: BlockRect = {
    from: 1,
    to: 16,
    left: 100,
    top: 40,
    right: 400,
    bottom: 64,
  };

  it('drops external blank-area drags that only graze a block edge', () => {
    expect(filterExternalBlankAreaSelectionEdgeGrazes(
      [block],
      [{ from: 1, to: 16 }],
      { left: 397, top: 44, right: 420, bottom: 60 },
    )).toEqual([]);
  });

  it('drops external blank-area drags that only graze a block leading edge', () => {
    expect(filterExternalBlankAreaSelectionEdgeGrazes(
      [block],
      [{ from: 1, to: 16 }],
      { left: 80, top: 44, right: 103, bottom: 60 },
    )).toEqual([]);
  });

  it('keeps external blank-area drags that enter the block body', () => {
    expect(filterExternalBlankAreaSelectionEdgeGrazes(
      [block],
      [{ from: 1, to: 16 }],
      { left: 360, top: 44, right: 420, bottom: 60 },
    )).toEqual([{ from: 1, to: 16 }]);
  });
});

describe('startBlankAreaSelectionSession', () => {
  it('enables cached block positions for drag hit testing', () => {
    const view = createView();
    const event = new MouseEvent('mousedown', {
      bubbles: true,
      clientX: 80,
      clientY: 90,
      button: 0,
      buttons: 1,
    });
    Object.defineProperty(event, 'target', {
      configurable: true,
      value: view.dom,
    });

    const session = startBlankAreaSelectionSession({
      view,
      event,
      startZone: 'outside-editor',
      dragThreshold: 0,
      cursor: 'crosshair',
      dragBoxColor: 'rgba(0, 0, 0, 0.1)',
      scrollRootSelector: '[data-note-scroll-root="true"]',
      initialSelectedBlocks: [],
      onSelectionChange: vi.fn(),
      onPlainClick: vi.fn(),
      onActivateSelectionState: vi.fn(),
      onSyncSelectionState: vi.fn(),
    });

    expect(vi.mocked(createBlockRectResolver).mock.calls.at(-1)?.[0]).toMatchObject({
      usePositionCache: true,
    });

    session.stop();
  });

  it('renders selected block feedback outside ProseMirror while decorations are deferred', () => {
    const view = createView();
    view.dom.setAttribute('contenteditable', 'true');
    view.dom.tabIndex = -1;
    view.dom.focus();
    rectResolverMockState.currentRects = [blockRect(1, 6, 100, 160)];
    const scrollRoot = view.dom.parentElement as HTMLElement;
    scrollRoot.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      right: 800,
      bottom: 600,
      width: 800,
      height: 600,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    const event = new MouseEvent('mousedown', {
      bubbles: true,
      clientX: 80,
      clientY: 90,
      button: 0,
      buttons: 1,
    });
    Object.defineProperty(event, 'target', {
      configurable: true,
      value: view.dom,
    });

    const session = startBlankAreaSelectionSession({
      view,
      event,
      startZone: 'outside-editor',
      dragThreshold: 0,
      cursor: 'crosshair',
      dragBoxColor: 'rgba(0, 0, 0, 0.1)',
      useSelectionPreview: true,
      scrollRootSelector: '[data-note-scroll-root="true"]',
      initialSelectedBlocks: [],
      onSelectionChange: vi.fn(),
      onPlainClick: vi.fn(),
      onActivateSelectionState: vi.fn(),
      onSyncSelectionState: vi.fn(),
    });

    document.dispatchEvent(new MouseEvent('mousemove', {
      bubbles: true,
      clientX: 220,
      clientY: 170,
      buttons: 1,
    }));

    const preview = document.querySelector<HTMLElement>('[data-editor-block-selection-preview="true"]');
    expect(preview).not.toBeNull();
    expect(preview?.children).toHaveLength(1);
    expect(preview?.parentElement).toBe(document.body);
    expect(view.dom.querySelector('[data-editor-block-selection-preview="true"]')).toBeNull();
    expect(document.activeElement).toBe(view.dom);
    expect(document.querySelector<HTMLElement>('[data-editor-drag-box="true"]')?.style.background)
      .toBe('transparent');
    const previewPath = preview?.firstElementChild as SVGPathElement | null;
    const initialPathData = previewPath?.getAttribute('d');
    expect(initialPathData).toBe(
      'M36 98H564A8 8 0 0 1 572 106V154A8 8 0 0 1 564 162H36A8 8 0 0 1 28 154V106A8 8 0 0 1 36 98Z',
    );

    scrollRoot.scrollTop = 40;
    scrollRoot.dispatchEvent(new Event('scroll'));

    expect(previewPath?.getAttribute('d')).toBe(initialPathData);
    expect(previewPath?.style.transform).toBe('translate3d(0px, -40px, 0)');

    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    expect(document.querySelector('[data-editor-block-selection-preview="true"]')).toBeNull();

    session.stop();
  });

  it('establishes resize baselines without eager geometry reads', () => {
    vi.stubGlobal('ResizeObserver', TestResizeObserver);
    const view = createView();
    const scrollRoot = view.dom.parentElement as HTMLElement;
    const editorRect = vi.spyOn(view.dom, 'getBoundingClientRect');
    const scrollRootRect = vi.spyOn(scrollRoot, 'getBoundingClientRect');
    const event = new MouseEvent('mousedown', {
      bubbles: true,
      clientX: 80,
      clientY: 90,
      button: 0,
      buttons: 1,
    });
    Object.defineProperty(event, 'target', {
      configurable: true,
      value: view.dom,
    });

    const session = startBlankAreaSelectionSession({
      view,
      event,
      startZone: 'outside-editor',
      dragThreshold: 4,
      cursor: 'crosshair',
      dragBoxColor: 'rgba(0, 0, 0, 0.1)',
      scrollRootSelector: '[data-note-scroll-root="true"]',
      initialSelectedBlocks: [],
      onSelectionChange: vi.fn(),
      onPlainClick: vi.fn(),
      onActivateSelectionState: vi.fn(),
      onSyncSelectionState: vi.fn(),
    });

    expect(editorRect).not.toHaveBeenCalled();
    expect(scrollRootRect).not.toHaveBeenCalled();

    TestResizeObserver.instances[0]!.callback([
      {
        target: view.dom,
        contentRect: { width: 500, height: 300 },
      } as unknown as ResizeObserverEntry,
      {
        target: scrollRoot,
        contentRect: { width: 700, height: 600 },
      } as unknown as ResizeObserverEntry,
    ], TestResizeObserver.instances[0] as unknown as ResizeObserver);

    expect(rectResolverMockState.invalidate).not.toHaveBeenCalled();
    expect(editorRect).not.toHaveBeenCalled();
    expect(scrollRootRect).not.toHaveBeenCalled();

    session.stop();
  });

  it('resolves an outside-editor plain click target on pointer down', () => {
    const view = createView();
    rectResolverMockState.currentRects = [
      blockRect(1, 6, 100, 160),
      blockRect(7, 12, 180, 240),
    ];
    const onPendingPlainClick = vi.fn(() => true);
    const onPlainClick = vi.fn();
    const event = new MouseEvent('mousedown', {
      bubbles: true,
      clientX: 540,
      clientY: 200,
      button: 0,
      buttons: 1,
    });
    Object.defineProperty(event, 'target', {
      configurable: true,
      value: view.dom,
    });

    const session = startBlankAreaSelectionSession({
      view,
      event,
      startZone: 'outside-editor',
      dragThreshold: 4,
      cursor: 'crosshair',
      dragBoxColor: 'rgba(0, 0, 0, 0.1)',
      scrollRootSelector: '[data-note-scroll-root="true"]',
      initialSelectedBlocks: [],
      onSelectionChange: vi.fn(),
      onPendingPlainClick,
      onPlainClick,
      onActivateSelectionState: vi.fn(),
      onSyncSelectionState: vi.fn(),
    });

    expect(onPendingPlainClick).toHaveBeenCalledWith(expect.objectContaining({
      zone: 'outside-editor',
      action: expect.objectContaining({ blockFrom: 7 }),
      clientX: 540,
      clientY: 200,
    }));
    expect(rectResolverMockState.getPlainClickBlockRects).toHaveBeenCalledWith(540, 200);
    expect(rectResolverMockState.getTopLevelBlockRects).not.toHaveBeenCalled();

    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    expect(onPlainClick).not.toHaveBeenCalled();

    session.stop();
  });

  it('does not move the caret early when a block selection already exists', () => {
    const view = createView();
    rectResolverMockState.currentRects = [blockRect(1, 6, 100, 160)];
    const onPendingPlainClick = vi.fn();
    const event = new MouseEvent('mousedown', {
      bubbles: true,
      clientX: 540,
      clientY: 120,
      button: 0,
      buttons: 1,
    });
    Object.defineProperty(event, 'target', {
      configurable: true,
      value: view.dom,
    });

    const session = startBlankAreaSelectionSession({
      view,
      event,
      startZone: 'outside-editor',
      dragThreshold: 4,
      cursor: 'crosshair',
      dragBoxColor: 'rgba(0, 0, 0, 0.1)',
      scrollRootSelector: '[data-note-scroll-root="true"]',
      initialSelectedBlocks: [{ from: 1, to: 6 }],
      onSelectionChange: vi.fn(),
      onPendingPlainClick,
      onPlainClick: vi.fn(),
      onActivateSelectionState: vi.fn(),
      onSyncSelectionState: vi.fn(),
    });

    expect(onPendingPlainClick).not.toHaveBeenCalled();

    session.stop();
  });

  it('absorbs small pointer-edge geometry gaps while dragging downward', () => {
    const animationFrames: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback: FrameRequestCallback) => {
      animationFrames.push(callback);
      return animationFrames.length;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(vi.fn());

    const view = createView();
    rectResolverMockState.currentRects = [
      blockRect(1, 6, 100, 160),
      blockRect(7, 12, 180, 240),
    ];
    const selectionChanges = vi.fn();
    const event = new MouseEvent('mousedown', {
      bubbles: true,
      clientX: 80,
      clientY: 90,
      button: 0,
      buttons: 1,
    });
    Object.defineProperty(event, 'target', {
      configurable: true,
      value: view.dom,
    });

    const session = startBlankAreaSelectionSession({
      view,
      event,
      startZone: 'outside-editor',
      dragThreshold: 0,
      cursor: 'crosshair',
      dragBoxColor: 'rgba(0, 0, 0, 0.1)',
      scrollRootSelector: '[data-note-scroll-root="true"]',
      initialSelectedBlocks: [],
      onSelectionChange: selectionChanges,
      onPlainClick: vi.fn(),
      onActivateSelectionState: vi.fn(),
      onSyncSelectionState: vi.fn(),
    });

    document.dispatchEvent(new MouseEvent('mousemove', {
      bubbles: true,
      clientX: 220,
      clientY: 173,
      buttons: 1,
    }));

    expect(selectionChanges).toHaveBeenLastCalledWith([
      { from: 1, to: 6 },
      { from: 7, to: 12 },
    ]);

    session.stop();
  });

  it('shrinks a downward selection when the pointer reverses after scrolling', () => {
    const animationFrames: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback: FrameRequestCallback) => {
      animationFrames.push(callback);
      return animationFrames.length;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(vi.fn());

    const view = createView();
    (view.state.doc.content as { size: number }).size = 200;
    const scrollRoot = view.dom.parentElement as HTMLElement;
    scrollRoot.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      right: 800,
      bottom: 600,
      width: 800,
      height: 600,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    const scrollBy = vi.fn((_: number, top: number) => {
      scrollRoot.scrollTop += top;
    });
    Object.defineProperty(scrollRoot, 'scrollBy', { value: scrollBy });
    rectResolverMockState.currentRects = Array.from({ length: 16 }, (_, index) => (
      blockRect(index * 6 + 1, index * 6 + 6, 100 + index * 80, 160 + index * 80)
    ));
    rectResolverMockState.getSelectionBlockRects.mockImplementation(
      () => rectResolverMockState.currentRects,
    );
    const selectionChanges = vi.fn();
    const event = new MouseEvent('mousedown', {
      bubbles: true,
      clientX: 80,
      clientY: 90,
      button: 0,
      buttons: 1,
    });
    Object.defineProperty(event, 'target', {
      configurable: true,
      value: view.dom,
    });

    const session = startBlankAreaSelectionSession({
      view,
      event,
      startZone: 'outside-editor',
      dragThreshold: 0,
      cursor: 'crosshair',
      dragBoxColor: 'rgba(0, 0, 0, 0.1)',
      scrollRootSelector: '[data-note-scroll-root="true"]',
      initialSelectedBlocks: [],
      onSelectionChange: selectionChanges,
      onPlainClick: vi.fn(),
      onActivateSelectionState: vi.fn(),
      onSyncSelectionState: vi.fn(),
    });

    document.dispatchEvent(new MouseEvent('mousemove', {
      bubbles: true,
      clientX: 220,
      clientY: 580,
      buttons: 1,
    }));
    scrollRoot.scrollTop = 400;
    scrollRoot.dispatchEvent(new Event('scroll'));
    const expandedCount = selectionChanges.mock.calls.at(-1)?.[0].length ?? 0;

    document.dispatchEvent(new MouseEvent('mousemove', {
      bubbles: true,
      clientX: 220,
      clientY: 300,
      buttons: 1,
    }));
    animationFrames.splice(0).forEach((callback) => callback(16));
    const shrunkCount = selectionChanges.mock.calls.at(-1)?.[0].length ?? 0;

    expect(scrollBy).not.toHaveBeenCalled();
    expect(expandedCount).toBeGreaterThan(shrunkCount);
    expect(shrunkCount).toBeGreaterThan(0);

    session.stop();
  });

  it('reuses block geometry when selection decorations do not resize the editor', () => {
    const animationFrames: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback: FrameRequestCallback) => {
      animationFrames.push(callback);
      return animationFrames.length;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(vi.fn());

    const view = createView();
    rectResolverMockState.currentRects = [
      blockRect(1, 6, 100, 160),
      blockRect(7, 12, 180, 240),
    ];
    const selectionChanges = vi.fn(() => {
      rectResolverMockState.currentRects = [
        blockRect(1, 6, 100, 160),
        blockRect(7, 12, 174, 240),
      ];
    });
    const event = new MouseEvent('mousedown', {
      bubbles: true,
      clientX: 80,
      clientY: 90,
      button: 0,
      buttons: 1,
    });
    Object.defineProperty(event, 'target', {
      configurable: true,
      value: view.dom,
    });

    const session = startBlankAreaSelectionSession({
      view,
      event,
      startZone: 'outside-editor',
      dragThreshold: 0,
      cursor: 'crosshair',
      dragBoxColor: 'rgba(0, 0, 0, 0.1)',
      scrollRootSelector: '[data-note-scroll-root="true"]',
      initialSelectedBlocks: [],
      onSelectionChange: selectionChanges,
      onPlainClick: vi.fn(),
      onActivateSelectionState: vi.fn(),
      onSyncSelectionState: vi.fn(),
    });

    document.dispatchEvent(new MouseEvent('mousemove', {
      bubbles: true,
      clientX: 220,
      clientY: 170,
      buttons: 1,
    }));

    expect(selectionChanges).toHaveBeenLastCalledWith([{ from: 1, to: 6 }]);

    document.dispatchEvent(new MouseEvent('mousemove', {
      bubbles: true,
      clientX: 220,
      clientY: 170,
      buttons: 1,
    }));

    expect(rectResolverMockState.invalidate).not.toHaveBeenCalled();
    expect(selectionChanges).toHaveBeenLastCalledWith([{ from: 1, to: 6 }]);

    session.stop();
  });

  it('refreshes hit testing when block geometry changes during a drag', () => {
    vi.stubGlobal('ResizeObserver', TestResizeObserver);
    const animationFrames: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback: FrameRequestCallback) => {
      animationFrames.push(callback);
      return animationFrames.length;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(vi.fn());

    const view = createView();
    rectResolverMockState.currentRects = [
      blockRect(1, 6, 100, 160),
      blockRect(7, 12, 180, 240),
    ];
    const selectionChanges = vi.fn();
    const event = new MouseEvent('mousedown', {
      bubbles: true,
      clientX: 80,
      clientY: 90,
      button: 0,
      buttons: 1,
    });
    Object.defineProperty(event, 'target', {
      configurable: true,
      value: view.dom,
    });

    const session = startBlankAreaSelectionSession({
      view,
      event,
      startZone: 'outside-editor',
      dragThreshold: 0,
      cursor: 'crosshair',
      dragBoxColor: 'rgba(0, 0, 0, 0.1)',
      scrollRootSelector: '[data-note-scroll-root="true"]',
      initialSelectedBlocks: [],
      onSelectionChange: selectionChanges,
      onPlainClick: vi.fn(),
      onActivateSelectionState: vi.fn(),
      onSyncSelectionState: vi.fn(),
    });

    document.dispatchEvent(new MouseEvent('mousemove', {
      bubbles: true,
      clientX: 220,
      clientY: 170,
      buttons: 1,
    }));

    expect(selectionChanges).toHaveBeenLastCalledWith([{ from: 1, to: 6 }]);
    expect(animationFrames.length).toBeGreaterThan(0);

    rectResolverMockState.currentRects = [
      blockRect(1, 6, 100, 130),
      blockRect(7, 12, 140, 200),
    ];
    TestResizeObserver.instances[0]!.callback([], TestResizeObserver.instances[0] as unknown as ResizeObserver);

    expect(rectResolverMockState.invalidate).toHaveBeenCalled();
    expect(selectionChanges).toHaveBeenLastCalledWith([
      { from: 1, to: 6 },
      { from: 7, to: 12 },
    ]);

    session.stop();
    expect(TestResizeObserver.instances[0]!.disconnect).toHaveBeenCalledTimes(1);
  });
});
