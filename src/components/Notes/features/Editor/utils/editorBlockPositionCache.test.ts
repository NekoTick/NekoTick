import { describe, expect, it, vi } from 'vitest';
import { OVERLAY_SCROLL_IDLE_EVENT } from '@/components/ui/overlayScrollAreaEvents';
import {
  createCurrentEditorBlockPositionController,
  clearCurrentEditorBlockPositionSnapshot,
  type EditorBlockPositionEntry,
  type EditorBlockPositionSnapshot,
  getCachedEditorBlockTargetByPos,
  getCachedEditorBlockTargetNearY,
  getCachedEditorBlockTargetsNearY,
  getCachedEditorBlockTargets,
  getFreshCachedEditorBlockTargets,
  getCurrentEditorBlockPositionSnapshot,
  getInteractionCachedEditorBlockTargets,
  getInteractionCachedEditorBlockTargetNearY,
  getInteractionCachedEditorBlockTargetsNearY,
  isEditorHiddenByToolbarPreview,
  MAX_BLOCK_POSITION_SNAPSHOT_BLOCKS,
  refreshCurrentEditorBlockPositionSnapshot,
  resolveToolbarPreviewRoot,
  setCurrentEditorBlockPositionSnapshot,
} from './editorBlockPositionCache';
import { setBlockSelectionInteractionPending } from '../plugins/cursor/blockSelectionInteractionState';

function rect(top: number, bottom: number, width = 320): DOMRect {
  return {
    bottom,
    height: bottom - top,
    left: 0,
    right: width,
    top,
    width,
    x: 0,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

function withBlockIndex(
  snapshot: Omit<EditorBlockPositionSnapshot, 'blockIndex'>,
): EditorBlockPositionSnapshot {
  return {
    ...snapshot,
    blockIndex: new Map(snapshot.blocks.map((block: EditorBlockPositionEntry) => [`${block.from}:${block.to}`, block])),
  };
}

describe('editorBlockPositionCache', () => {
  function waitForNextFrame(): Promise<void> {
    return new Promise((resolve) => requestAnimationFrame(() => resolve()));
  }

  it('detects toolbar-applied previews that temporarily hide the live editor', () => {
    const dom = document.createElement('div');

    expect(isEditorHiddenByToolbarPreview({ dom })).toBe(false);

    dom.setAttribute('data-toolbar-preview-hidden', 'true');
    expect(isEditorHiddenByToolbarPreview({ dom })).toBe(true);

    dom.removeAttribute('data-toolbar-preview-hidden');
    expect(isEditorHiddenByToolbarPreview({ dom })).toBe(false);
  });

  it('resolves the toolbar preview root rendered next to the hidden editor', () => {
    const host = document.createElement('div');
    const preview = document.createElement('div');
    const dom = document.createElement('div');
    preview.className = 'toolbar-applied-preview-overlay';
    dom.setAttribute('data-toolbar-preview-hidden', 'true');
    host.append(preview, dom);

    expect(resolveToolbarPreviewRoot({ dom })).toBe(preview);

    dom.removeAttribute('data-toolbar-preview-hidden');
    expect(resolveToolbarPreviewRoot({ dom })).toBeNull();
  });

  it('publishes outline headings from the live toolbar preview without replacing the editor root', async () => {
    const scrollRoot = document.createElement('div');
    scrollRoot.setAttribute('data-note-scroll-root', 'true');
    scrollRoot.scrollTop = 40;
    scrollRoot.getBoundingClientRect = () => rect(10, 610, 640);

    const host = document.createElement('div');
    const preview = document.createElement('div');
    const heading = document.createElement('h2');
    const dom = document.createElement('div');

    preview.className = 'toolbar-applied-preview-overlay';
    heading.textContent = 'Preview heading';
    heading.getBoundingClientRect = () => rect(100, 132);
    dom.setAttribute('data-toolbar-preview-hidden', 'true');

    preview.appendChild(heading);
    host.append(preview, dom);
    scrollRoot.appendChild(host);
    document.body.appendChild(scrollRoot);

    const doc = {
      content: { size: 18 },
      forEach(callback: (node: { nodeSize: number }, offset: number) => void) {
        callback({ nodeSize: 18 }, 0);
      },
    };
    const view = {
      dom,
      state: { doc },
    };

    const controller = createCurrentEditorBlockPositionController(view as any);
    expect(getCurrentEditorBlockPositionSnapshot()?.blocks).toEqual([]);
    await waitForNextFrame();
    const snapshot = getCurrentEditorBlockPositionSnapshot();

    expect(snapshot?.editorRoot).toBe(dom);
    expect(snapshot?.headings).toHaveLength(1);
    expect(snapshot?.headings[0]).toMatchObject({
      id: 'outline-0-h2-preview-heading',
      level: 2,
      text: 'Preview heading',
      top: 130,
    });
    expect(snapshot?.headings[0]?.element).toBe(heading);

    controller.destroy();
    scrollRoot.remove();
  });

  it('scans toolbar preview children without materializing the child list', async () => {
    const host = document.createElement('div');
    const preview = document.createElement('div');
    const dom = document.createElement('div');
    const first = document.createElement('p');
    const second = document.createElement('h3');
    const arrayFromSpy = vi.spyOn(Array, 'from');

    preview.className = 'toolbar-applied-preview-overlay';
    first.textContent = 'First';
    second.textContent = 'Second heading';
    first.getBoundingClientRect = () => rect(20, 44);
    second.getBoundingClientRect = () => rect(60, 92);
    dom.setAttribute('data-toolbar-preview-hidden', 'true');

    preview.append(first, second);
    host.append(preview, dom);
    document.body.appendChild(host);

    const doc = {
      childCount: 2,
      content: { size: 8 },
      forEach(callback: (node: { nodeSize: number }, offset: number) => void) {
        callback({ nodeSize: 4 }, 0);
        callback({ nodeSize: 4 }, 4);
      },
    };
    const view = {
      dom,
      state: { doc },
    };

    try {
      const controller = createCurrentEditorBlockPositionController(view as any);
      expect(getCurrentEditorBlockPositionSnapshot()?.blocks).toEqual([]);
      await waitForNextFrame();
      const snapshot = getCurrentEditorBlockPositionSnapshot();

      expect(snapshot?.blocks).toHaveLength(2);
      expect(snapshot?.headings[0]).toMatchObject({
        id: 'outline-0-h3-second-heading',
        level: 3,
        text: 'Second heading',
      });
      expect(arrayFromSpy.mock.calls.some(([source]) => source === preview.children)).toBe(false);

      controller.destroy();
    } finally {
      arrayFromSpy.mockRestore();
      host.remove();
    }
  });

  it('publishes headings without scanning blocks for very large documents', async () => {
    const dom = document.createElement('div');
    const heading = document.createElement('h2');
    heading.getBoundingClientRect = () => rect(24, 56);
    dom.append(heading);
    document.body.appendChild(dom);

    const headingNode = {
      attrs: { level: 2 },
      child: () => ({ marks: [], text: 'Large document heading' }),
      childCount: 1,
      nodeSize: 24,
      type: { name: 'heading' },
    };
    const doc = {
      childCount: MAX_BLOCK_POSITION_SNAPSHOT_BLOCKS + 1,
      content: { size: MAX_BLOCK_POSITION_SNAPSHOT_BLOCKS + 1 },
      descendants(callback: (node: typeof headingNode, pos: number) => void) {
        callback(headingNode, 0);
      },
      forEach() {
        throw new Error('large documents should not be scanned');
      },
      resolve: () => ({ depth: 0 }),
    };
    const view = {
      dom,
      nodeDOM: () => heading,
      state: { doc },
    };

    const controller = createCurrentEditorBlockPositionController(view as any);
    await waitForNextFrame();
    const snapshot = getCurrentEditorBlockPositionSnapshot();

    expect(snapshot?.blocks).toEqual([]);
    expect(snapshot?.headings).toEqual([
      expect.objectContaining({ level: 2, text: 'Large document heading' }),
    ]);

    controller.destroy();
    dom.remove();
  });

  it('publishes nested headings from a toolbar-applied preview', async () => {
    const host = document.createElement('div');
    const preview = document.createElement('div');
    const quote = document.createElement('blockquote');
    const heading = document.createElement('h3');
    const hiddenHeading = document.createElement('h4');
    const dom = document.createElement('div');
    preview.className = 'toolbar-applied-preview-overlay';
    heading.textContent = 'Nested preview heading';
    hiddenHeading.textContent = 'Hidden preview heading';
    heading.getBoundingClientRect = () => rect(80, 112);
    hiddenHeading.getBoundingClientRect = () => rect(0, 0, 0);
    quote.getBoundingClientRect = () => rect(60, 132);
    quote.append(heading, hiddenHeading);
    preview.append(quote);
    dom.setAttribute('data-toolbar-preview-hidden', 'true');
    host.append(preview, dom);
    document.body.append(host);

    const headingNode = {
      attrs: { level: 3 },
      child: () => ({ marks: [], text: 'Nested preview heading' }),
      childCount: 1,
      nodeSize: 24,
      type: { name: 'heading' },
    };
    const hiddenHeadingNode = {
      ...headingNode,
      attrs: { level: 4 },
      child: () => ({ marks: [], text: 'Hidden preview heading' }),
    };
    const doc = {
      childCount: 1,
      content: { size: 30 },
      descendants(callback: (node: typeof headingNode, pos: number) => void) {
        callback(headingNode, 3);
        callback(hiddenHeadingNode, 15);
      },
      forEach(callback: (node: { nodeSize: number }, offset: number) => void) {
        callback({ nodeSize: 30 }, 0);
      },
    };
    const controller = createCurrentEditorBlockPositionController({ dom, state: { doc } } as any);
    await waitForNextFrame();

    expect(getCurrentEditorBlockPositionSnapshot()?.headings).toEqual([
      expect.objectContaining({
        element: heading,
        from: 3,
        level: 3,
        text: 'Nested preview heading',
      }),
      expect.objectContaining({
        element: hiddenHeading,
        from: 15,
        hasExactGeometry: false,
        level: 4,
        text: 'Hidden preview heading',
      }),
    ]);

    controller.destroy();
    host.remove();
  });

  it('can refresh an initially empty opening snapshot on demand', () => {
    const dom = document.createElement('div');
    const paragraph = document.createElement('p');
    paragraph.textContent = 'Ready';
    paragraph.getBoundingClientRect = () => rect(30, 54);
    dom.append(paragraph);
    document.body.append(dom);

    const paragraphNode = {
      type: { name: 'paragraph' },
      nodeSize: 7,
      forEach() {},
    };
    const doc = {
      childCount: 1,
      content: { size: 7 },
      forEach(callback: (node: typeof paragraphNode, offset: number) => void) {
        callback(paragraphNode, 0);
      },
      child(index: number) {
        return index === 0 ? paragraphNode : null;
      },
      resolve() {
        return {
          parent: { type: { name: 'doc' } },
          nodeAfter: paragraphNode,
          index: () => 0,
          posAtIndex: () => 0,
        };
      },
    };
    const view = {
      dom,
      state: { doc },
      domAtPos() {
        throw new Error('not needed');
      },
      nodeDOM() {
        return paragraph;
      },
    };

    const controller = createCurrentEditorBlockPositionController(view as any);
    try {
      expect(getCurrentEditorBlockPositionSnapshot()?.blocks).toEqual([]);

      const snapshot = refreshCurrentEditorBlockPositionSnapshot(view as any);
      expect(snapshot?.blocks).toHaveLength(1);
      expect(getCachedEditorBlockTargetsNearY(
        view as any,
        42,
        (candidateRect, candidateY) => candidateY >= candidateRect.top && candidateY <= candidateRect.bottom,
      )?.[0]?.element).toBe(paragraph);
    } finally {
      controller.destroy();
      dom.remove();
    }
  });

  it('debounces content mutation snapshots until typing settles', async () => {
    vi.useFakeTimers();
    let mutationCallback: MutationCallback | null = null;
    let rafCallback: FrameRequestCallback | null = null;
    class MockMutationObserver {
      constructor(callback: MutationCallback) {
        mutationCallback = callback;
      }

      observe = vi.fn();
      disconnect = vi.fn();
      takeRecords = vi.fn(() => []);
    }
    vi.stubGlobal('MutationObserver', MockMutationObserver);
    const requestAnimationFrameSpy = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((callback: FrameRequestCallback) => {
        rafCallback = callback;
        return 1;
      });
    const cancelAnimationFrameSpy = vi
      .spyOn(window, 'cancelAnimationFrame')
      .mockImplementation(() => {});
    const runAnimationFrame = () => {
      const callback = rafCallback as FrameRequestCallback | null;
      expect(callback).not.toBeNull();
      callback?.(0);
    };
    const emitContentMutation = () => {
      const callback = mutationCallback as MutationCallback | null;
      expect(callback).not.toBeNull();
      callback?.([{ type: 'characterData' } as MutationRecord], {} as MutationObserver);
    };

    const dom = document.createElement('div');
    const paragraph = document.createElement('p');
    const textNode = document.createTextNode('Ready');
    const paragraphRect = vi.fn(() => rect(30, 54));
    paragraph.getBoundingClientRect = paragraphRect;
    paragraph.append(textNode);
    dom.append(paragraph);
    document.body.append(dom);

    const paragraphNode = {
      type: { name: 'paragraph' },
      nodeSize: 7,
      forEach() {},
    };
    const doc = {
      childCount: 1,
      content: { size: 7 },
      forEach(callback: (node: typeof paragraphNode, offset: number) => void) {
        callback(paragraphNode, 0);
      },
      child(index: number) {
        return index === 0 ? paragraphNode : null;
      },
      resolve() {
        return {
          parent: { type: { name: 'doc' } },
          nodeAfter: paragraphNode,
          index: () => 0,
          posAtIndex: () => 0,
        };
      },
    };
    const view = {
      dom,
      state: { doc },
      domAtPos() {
        throw new Error('not needed');
      },
      nodeDOM() {
        return paragraph;
      },
    };

    const controller = createCurrentEditorBlockPositionController(view as any);
    try {
      runAnimationFrame();
      rafCallback = null;
      expect(getCurrentEditorBlockPositionSnapshot()?.blocks).toHaveLength(1);
      paragraphRect.mockClear();

      emitContentMutation();
      vi.advanceTimersByTime(239);
      expect(paragraphRect).not.toHaveBeenCalled();

      emitContentMutation();
      vi.advanceTimersByTime(239);
      expect(paragraphRect).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1);
      runAnimationFrame();
      expect(paragraphRect).toHaveBeenCalledTimes(1);
    } finally {
      controller.destroy();
      dom.remove();
      requestAnimationFrameSpy.mockRestore();
      cancelAnimationFrameSpy.mockRestore();
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });

  it('does not rebuild block positions for selection decoration mutations', () => {
    let mutationCallback: MutationCallback | null = null;
    let rafCallback: FrameRequestCallback | null = null;
    class MockMutationObserver {
      constructor(callback: MutationCallback) {
        mutationCallback = callback;
      }

      observe = vi.fn();
      disconnect = vi.fn();
      takeRecords = vi.fn(() => []);
    }
    vi.stubGlobal('MutationObserver', MockMutationObserver);
    const requestAnimationFrameSpy = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((callback: FrameRequestCallback) => {
        rafCallback = callback;
        return 1;
      });
    const cancelAnimationFrameSpy = vi
      .spyOn(window, 'cancelAnimationFrame')
      .mockImplementation(() => {});

    const dom = document.createElement('div');
    const paragraph = document.createElement('p');
    paragraph.className = 'editor-block-selected';
    const paragraphRect = vi.fn(() => rect(30, 54));
    paragraph.getBoundingClientRect = paragraphRect;
    dom.append(paragraph);
    document.body.append(dom);

    const paragraphNode = {
      type: { name: 'paragraph' },
      nodeSize: 7,
      forEach() {},
    };
    const doc = {
      childCount: 1,
      content: { size: 7 },
      forEach(callback: (node: typeof paragraphNode, offset: number) => void) {
        callback(paragraphNode, 0);
      },
      child(index: number) {
        return index === 0 ? paragraphNode : null;
      },
      resolve() {
        return {
          parent: { type: { name: 'doc' } },
          nodeAfter: paragraphNode,
          index: () => 0,
          posAtIndex: () => 0,
        };
      },
    };
    const view = {
      dom,
      state: { doc },
      domAtPos() {
        throw new Error('not needed');
      },
      nodeDOM() {
        return paragraph;
      },
    };

    const controller = createCurrentEditorBlockPositionController(view as any);
    try {
      const initialRafCallback = rafCallback as FrameRequestCallback | null;
      initialRafCallback?.(0);
      rafCallback = null;
      paragraphRect.mockClear();

      const emitMutation = mutationCallback as MutationCallback | null;
      emitMutation?.([{ type: 'childList' } as MutationRecord], {} as MutationObserver);

      expect(rafCallback).toBeNull();
      expect(paragraphRect).not.toHaveBeenCalled();
    } finally {
      controller.destroy();
      dom.remove();
      requestAnimationFrameSpy.mockRestore();
      cancelAnimationFrameSpy.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it('reads live editor heading snapshot text without aggregating heading textContent', () => {
    const dom = document.createElement('div');
    const heading = document.createElement('h2');
    heading.appendChild(document.createTextNode('Live heading'));
    heading.getBoundingClientRect = () => rect(24, 56);
    Object.defineProperty(heading, 'textContent', {
      get() {
        throw new Error('aggregate heading textContent should not be read');
      },
    });
    dom.append(heading);
    document.body.append(dom);

    const headingNode = {
      type: { name: 'heading' },
      nodeSize: 14,
      forEach() {},
    };
    const doc = {
      childCount: 1,
      content: { size: 14 },
      forEach(callback: (node: typeof headingNode, offset: number) => void) {
        callback(headingNode, 0);
      },
      child(index: number) {
        return index === 0 ? headingNode : null;
      },
      resolve() {
        return {
          parent: { type: { name: 'doc' } },
          nodeAfter: headingNode,
          index: () => 0,
          posAtIndex: () => 0,
        };
      },
    };
    const view = {
      dom,
      state: { doc },
      domAtPos() {
        throw new Error('not needed');
      },
      nodeDOM() {
        return heading;
      },
    };

    try {
      const snapshot = refreshCurrentEditorBlockPositionSnapshot(view as any);

      expect(snapshot?.headings).toHaveLength(1);
      expect(snapshot?.headings[0]).toMatchObject({
        id: 'outline-0-h2-live-heading',
        level: 2,
        text: 'Live heading',
      });
    } finally {
      clearCurrentEditorBlockPositionSnapshot();
      dom.remove();
    }
  });

  it('publishes cached scroll positions during block selection without remeasuring or cloning blocks', async () => {
    const scrollRoot = document.createElement('div');
    scrollRoot.setAttribute('data-note-scroll-root', 'true');
    scrollRoot.scrollTop = 20;
    scrollRoot.getBoundingClientRect = () => rect(10, 610, 640);

    const host = document.createElement('div');
    const preview = document.createElement('div');
    const heading = document.createElement('h2');
    const dom = document.createElement('div');
    const headingRect = vi.fn(() => rect(100, 132));

    preview.className = 'toolbar-applied-preview-overlay';
    heading.textContent = 'Preview heading';
    heading.getBoundingClientRect = headingRect;
    dom.setAttribute('data-toolbar-preview-hidden', 'true');

    preview.appendChild(heading);
    host.append(preview, dom);
    scrollRoot.appendChild(host);
    document.body.appendChild(scrollRoot);

    const doc = {
      content: { size: 18 },
      forEach(callback: (node: { nodeSize: number }, offset: number) => void) {
        callback({ nodeSize: 18 }, 0);
      },
    };
    const view = {
      dom,
      state: { doc },
    };

    const controller = createCurrentEditorBlockPositionController(view as any);
    expect(getCurrentEditorBlockPositionSnapshot()?.blocks).toEqual([]);
    await waitForNextFrame();
    const initial = getCurrentEditorBlockPositionSnapshot();
    expect(initial?.blocks[0]?.rect.top).toBe(100);
    expect(initial?.blocks[0]?.documentTop).toBe(110);
    expect(headingRect).toHaveBeenCalledTimes(1);

    heading.getBoundingClientRect = () => {
      throw new Error('scroll updates should not remeasure block DOM');
    };
    setBlockSelectionInteractionPending(dom, true);
    scrollRoot.scrollTop = 70;
    scrollRoot.dispatchEvent(new Event('scroll'));
    await new Promise((resolve) => requestAnimationFrame(resolve));

    const scrolled = getCurrentEditorBlockPositionSnapshot();
    expect(scrolled?.scrollTop).toBe(70);
    expect(scrolled?.blocks).toBe(initial?.blocks);
    expect(scrolled?.blockIndex).toBe(initial?.blockIndex);
    expect(scrolled?.blocks[0]?.rect.top).toBe(100);
    expect(scrolled?.blocks[0]?.rect.bottom).toBe(132);
    expect(scrolled?.blocks[0]?.documentTop).toBe(110);
    expect(scrolled?.headings[0]?.top).toBe(110);
    expect(getCachedEditorBlockTargets(view as any)?.[0]?.rect.top).toBe(50);
    expect(getCachedEditorBlockTargets(view as any)?.[0]?.rect.bottom).toBe(82);

    setBlockSelectionInteractionPending(dom, false);
    controller.destroy();
    scrollRoot.remove();
  });

  it('defers rebuilding a stale snapshot until Notes scrolling is idle', async () => {
    const scrollRoot = document.createElement('div');
    scrollRoot.setAttribute('data-note-scroll-root', 'true');
    const dom = document.createElement('div');
    const paragraph = document.createElement('p');
    const textNode = document.createTextNode('Ready');
    const paragraphRect = vi.fn(() => rect(30, 54));
    paragraph.getBoundingClientRect = paragraphRect;
    paragraph.append(textNode);
    dom.append(paragraph);
    scrollRoot.append(dom);
    document.body.append(scrollRoot);

    const paragraphNode = {
      type: { name: 'paragraph' },
      nodeSize: 7,
      forEach() {},
    };
    const doc = {
      childCount: 1,
      content: { size: 7 },
      forEach(callback: (node: typeof paragraphNode, offset: number) => void) {
        callback(paragraphNode, 0);
      },
      child(index: number) {
        return index === 0 ? paragraphNode : null;
      },
      resolve() {
        return {
          parent: { type: { name: 'doc' } },
          nodeAfter: paragraphNode,
          index: () => 0,
          posAtIndex: () => 0,
        };
      },
    };
    const view = {
      dom,
      state: { doc },
      domAtPos() {
        return { node: textNode, offset: 0 };
      },
      nodeDOM() {
        return paragraph;
      },
    };

    const controller = createCurrentEditorBlockPositionController(view as any);
    try {
      const openingSnapshot = getCurrentEditorBlockPositionSnapshot();
      expect(openingSnapshot).not.toBeNull();
      setCurrentEditorBlockPositionSnapshot({
        ...openingSnapshot!,
        doc: { content: { size: 7 } } as any,
      });

      scrollRoot.dataset.overlayScrollbarInteracting = 'true';
      scrollRoot.scrollTop = 40;
      scrollRoot.dispatchEvent(new Event('scroll'));
      await waitForNextFrame();

      expect(paragraphRect).not.toHaveBeenCalled();
      expect(getCurrentEditorBlockPositionSnapshot()?.doc).not.toBe(doc);

      window.dispatchEvent(new Event(OVERLAY_SCROLL_IDLE_EVENT));
      await waitForNextFrame();
      expect(paragraphRect).not.toHaveBeenCalled();

      delete scrollRoot.dataset.overlayScrollbarInteracting;
      window.dispatchEvent(new Event(OVERLAY_SCROLL_IDLE_EVENT));
      await waitForNextFrame();

      expect(getCurrentEditorBlockPositionSnapshot()?.doc).toBe(doc);
      expect(paragraphRect).toHaveBeenCalledTimes(1);
    } finally {
      controller.destroy();
      scrollRoot.remove();
    }
  });

  it('does not return block targets from a stale document snapshot', () => {
    const dom = document.createElement('div');
    document.body.appendChild(dom);
    const oldDoc = { content: { size: 4 } };
    const newDoc = { content: { size: 4 } };
    const block = document.createElement('p');
    dom.appendChild(block);

    const view = {
      dom,
      state: { doc: newDoc },
    };

    setCurrentEditorBlockPositionSnapshot(withBlockIndex({
      version: 1,
      view: view as any,
      doc: oldDoc as any,
      editorRoot: dom,
      scrollRoot: null,
      scrollLeft: 0,
      scrollTop: 0,
      blocks: [{
        from: 0,
        to: 4,
        element: block,
        rect: rect(10, 30),
        documentTop: 10,
        documentBottom: 30,
        tagName: 'P',
        headingLevel: null,
        headingId: null,
        headingText: null,
      }],
      headings: [],
    }));

    try {
      expect(getCachedEditorBlockTargets(view as any)).toBeNull();
      expect(getCachedEditorBlockTargetByPos(view as any, 0)).toBeNull();
    } finally {
      clearCurrentEditorBlockPositionSnapshot();
      dom.remove();
    }
  });

  it('does not return cached block targets when same-document DOM geometry has changed', () => {
    const dom = document.createElement('div');
    document.body.appendChild(dom);
    const block = document.createElement('p');
    block.textContent = 'Ready';
    dom.appendChild(block);

    let currentRect = rect(10, 30);
    block.getBoundingClientRect = () => currentRect;
    const paragraphNode = {
      type: { name: 'paragraph' },
      nodeSize: 4,
      forEach: () => {},
    };
    const doc = {
      childCount: 1,
      content: { size: 4 },
      forEach(callback: (node: typeof paragraphNode, offset: number) => void) {
        callback(paragraphNode, 0);
      },
      child(index: number) {
        return index === 0 ? paragraphNode : null;
      },
      resolve() {
        return {
          parent: { type: { name: 'doc' } },
          nodeAfter: paragraphNode,
          index: () => 0,
          posAtIndex: () => 0,
        };
      },
    };
    const view = {
      dom,
      state: { doc },
      domAtPos() {
        throw new Error('not needed');
      },
      nodeDOM() {
        return block;
      },
    };

    try {
      expect(refreshCurrentEditorBlockPositionSnapshot(view as any)?.blocks).toHaveLength(1);
      expect(getCachedEditorBlockTargets(view as any)).toHaveLength(1);

      currentRect = rect(48, 72);

      expect(getCachedEditorBlockTargets(view as any)).toBeNull();
      expect(getFreshCachedEditorBlockTargets(view as any, null)).toBeNull();
      expect(getCachedEditorBlockTargetNearY(view as any, 56)).toBeNull();
      expect(getCachedEditorBlockTargetsNearY(
        view as any,
        56,
        (candidateRect, candidateY) => candidateY >= candidateRect.top && candidateY <= candidateRect.bottom,
      )).toBeNull();
    } finally {
      clearCurrentEditorBlockPositionSnapshot();
      dom.remove();
    }
  });

  it.each([
    'heading-collapsed-content',
    'editor-collapsed-content',
  ])('does not return cached targets after a block gains %s', (collapsedClass) => {
    const scrollRoot = document.createElement('div');
    scrollRoot.setAttribute('data-note-scroll-root', 'true');
    scrollRoot.scrollTop = 20;
    scrollRoot.getBoundingClientRect = () => rect(0, 200, 640);
    const dom = document.createElement('div');
    const block = document.createElement('p');
    dom.appendChild(block);
    scrollRoot.appendChild(dom);
    document.body.appendChild(scrollRoot);

    const doc = { content: { size: 4 } };
    const view = {
      dom,
      state: { doc },
    };

    setCurrentEditorBlockPositionSnapshot(withBlockIndex({
      version: 1,
      view: view as any,
      doc: doc as any,
      editorRoot: dom,
      scrollRoot,
      scrollLeft: 0,
      scrollTop: 20,
      geometryValidationScrollLeft: 0,
      geometryValidationScrollTop: 20,
      blocks: [{
        from: 0,
        to: 4,
        element: block,
        rect: rect(10, 30),
        documentTop: 30,
        documentBottom: 50,
        tagName: 'P',
        headingLevel: null,
        headingId: null,
        headingText: null,
      }],
      headings: [],
    }));

    try {
      block.classList.add(collapsedClass);
      block.getBoundingClientRect = () => {
        throw new Error('Collapsed cached blocks should not be measured');
      };
      scrollRoot.scrollTop = 80;

      expect(getCachedEditorBlockTargets(view as any)).toBeNull();
      expect(getCachedEditorBlockTargetByPos(view as any, 0)).toBeNull();
    } finally {
      clearCurrentEditorBlockPositionSnapshot();
      scrollRoot.remove();
    }
  });

  it('validates cached list-item headers against their selectable row geometry', () => {
    const dom = document.createElement('div');
    const item = document.createElement('li');
    const header = document.createElement('p');
    item.appendChild(header);
    dom.appendChild(item);
    document.body.appendChild(dom);
    item.getBoundingClientRect = () => rect(40, 140);
    header.getBoundingClientRect = () => rect(40, 64);

    const listNode = {
      type: { name: 'bullet_list' },
      nodeSize: 10,
    };
    const doc = {
      content: { size: 10 },
      forEach(callback: (node: typeof listNode, offset: number) => void) {
        callback(listNode, 0);
      },
    };
    const view = {
      dom,
      state: { doc },
      nodeDOM: () => header,
    };
    const block = {
      from: 1,
      to: 5,
      element: item,
      rect: rect(40, 64),
      documentTop: 40,
      documentBottom: 64,
      tagName: 'LI',
      headingLevel: null,
      headingId: null,
      headingText: null,
    };

    setCurrentEditorBlockPositionSnapshot(withBlockIndex({
      version: 1,
      view: view as any,
      doc: doc as any,
      editorRoot: dom,
      scrollRoot: null,
      scrollLeft: 0,
      scrollTop: 0,
      geometryValidationScrollLeft: 0,
      geometryValidationScrollTop: 0,
      blocks: [block],
      headings: [],
    }));

    try {
      expect(getCachedEditorBlockTargets(view as any)).toHaveLength(1);
    } finally {
      clearCurrentEditorBlockPositionSnapshot();
      dom.remove();
    }
  });

  it('preserves interaction snapshot geometry while resolving ranged targets from the live DOM', () => {
    const scrollRoot = document.createElement('div');
    scrollRoot.setAttribute('data-note-scroll-root', 'true');
    scrollRoot.scrollTop = 40;
    const dom = document.createElement('div');
    const block = document.createElement('p');
    const secondBlock = document.createElement('p');
    dom.append(block, secondBlock);
    scrollRoot.append(dom);
    document.body.append(scrollRoot);
    const doc = { content: { size: 8 } };
    const view = {
      dom,
      nodeDOM: (pos: number) => pos >= 4 ? secondBlock : block,
      state: { doc },
    };
    const liveBlockRect = vi.fn(() => rect(300, 324));
    const liveScrollRootRect = vi.fn(() => rect(20, 620, 640));
    block.getBoundingClientRect = liveBlockRect;
    scrollRoot.getBoundingClientRect = liveScrollRootRect;

    setCurrentEditorBlockPositionSnapshot(withBlockIndex({
      version: 1,
      view: view as any,
      doc: doc as any,
      editorRoot: dom,
      editorRect: rect(10, 500, 640),
      scrollRoot,
      scrollRootRect: rect(20, 620, 640),
      scrollLeft: 0,
      scrollTop: 40,
      blocks: [
        {
          from: 0,
          to: 4,
          element: block,
          rect: rect(80, 104),
          documentTop: 100,
          documentBottom: 124,
          tagName: 'P',
          headingLevel: null,
          headingId: null,
          headingText: null,
        },
        {
          from: 4,
          to: 8,
          element: secondBlock,
          rect: rect(120, 144),
          documentTop: 140,
          documentBottom: 164,
          tagName: 'P',
          headingLevel: null,
          headingId: null,
          headingText: null,
        },
      ],
      headings: [],
    }));

    try {
      const targets = getInteractionCachedEditorBlockTargetsNearY(
        view as any,
        92,
        (candidate, y) => y >= candidate.top && y <= candidate.bottom,
      );

      expect(targets?.[0]?.range).toEqual({ from: 0, to: 4 });
      const rangedTargets = getInteractionCachedEditorBlockTargets(
        view as any,
        [{ from: 4, to: 8 }],
      );
      expect(rangedTargets?.map((target) => target.range)).toEqual([{ from: 4, to: 8 }]);
      expect(rangedTargets?.[0]?.element).toBe(secondBlock);
      expect(liveBlockRect).not.toHaveBeenCalled();
      expect(liveScrollRootRect).not.toHaveBeenCalled();
    } finally {
      clearCurrentEditorBlockPositionSnapshot();
      scrollRoot.remove();
    }
  });

  it('resolves the current block element when an interaction snapshot element was replaced', () => {
    const dom = document.createElement('div');
    const staleBlock = document.createElement('p');
    const currentBlock = document.createElement('p');
    dom.appendChild(currentBlock);
    document.body.appendChild(dom);
    const paragraph = {
      childCount: 0,
      nodeSize: 4,
      type: { name: 'paragraph' },
    };
    const doc = {
      childCount: 1,
      content: { size: 4 },
      forEach(callback: (node: typeof paragraph, offset: number) => void) {
        callback(paragraph, 0);
      },
    };
    const currentBlockRect = vi.fn(() => rect(20, 44));
    currentBlock.getBoundingClientRect = currentBlockRect;
    const view = {
      dom,
      domAtPos: () => ({ node: currentBlock }),
      nodeDOM: () => currentBlock,
      state: { doc },
    };

    setCurrentEditorBlockPositionSnapshot(withBlockIndex({
      version: 1,
      view: view as any,
      doc: doc as any,
      editorRoot: dom,
      scrollRoot: null,
      scrollLeft: 0,
      scrollTop: 0,
      blocks: [{
        from: 0,
        to: 4,
        element: staleBlock,
        rect: rect(20, 44),
        documentTop: 20,
        documentBottom: 44,
        tagName: 'P',
        headingLevel: null,
        headingId: null,
        headingText: null,
      }],
      headings: [],
    }));

    try {
      expect(getInteractionCachedEditorBlockTargets(view as any)?.[0]?.element).toBe(currentBlock);
      expect(getInteractionCachedEditorBlockTargetNearY(view as any, 30)?.element).toBe(currentBlock);
      expect(currentBlockRect).not.toHaveBeenCalled();
    } finally {
      clearCurrentEditorBlockPositionSnapshot();
      dom.remove();
    }
  });

  it('can retain connected ranged snapshot elements for geometry-only refreshes', () => {
    const dom = document.createElement('div');
    const snapshotBlock = document.createElement('p');
    const currentBlock = document.createElement('p');
    dom.append(snapshotBlock, currentBlock);
    document.body.appendChild(dom);
    const doc = { content: { size: 4 } };
    const view = {
      dom,
      nodeDOM: vi.fn(() => currentBlock),
      state: { doc },
    };

    setCurrentEditorBlockPositionSnapshot(withBlockIndex({
      version: 1,
      view: view as any,
      doc: doc as any,
      editorRoot: dom,
      scrollRoot: null,
      scrollLeft: 0,
      scrollTop: 0,
      blocks: [{
        from: 0,
        to: 4,
        element: snapshotBlock,
        rect: rect(20, 44),
        documentTop: 20,
        documentBottom: 44,
        tagName: 'P',
        headingLevel: null,
        headingId: null,
        headingText: null,
      }],
      headings: [],
    }));

    try {
      const target = getInteractionCachedEditorBlockTargets(
        view as any,
        [{ from: 0, to: 4 }],
        { resolveCurrentElements: false },
      )?.[0];

      expect(target?.element).toBe(snapshotBlock);
      expect(view.nodeDOM).not.toHaveBeenCalled();
    } finally {
      clearCurrentEditorBlockPositionSnapshot();
      dom.remove();
    }
  });

  it('resolves the nearest fresh cached block target by viewport y without mapping every block', () => {
    const scrollRoot = document.createElement('div');
    scrollRoot.setAttribute('data-note-scroll-root', 'true');
    scrollRoot.scrollTop = 40;
    scrollRoot.getBoundingClientRect = () => rect(10, 210, 640);
    const dom = document.createElement('div');
    const first = document.createElement('p');
    const second = document.createElement('p');
    const third = document.createElement('p');
    dom.append(first, second, third);
    scrollRoot.appendChild(dom);
    document.body.appendChild(scrollRoot);

    const doc = { content: { size: 12 } };
    const view = {
      dom,
      state: { doc },
    };
    const blocks = [
      {
        from: 0,
        to: 4,
        element: first,
        rect: rect(20, 40),
        documentTop: 50,
        documentBottom: 70,
        tagName: 'P',
        headingLevel: null,
        headingId: null,
        headingText: null,
      },
      {
        from: 4,
        to: 8,
        element: second,
        rect: rect(80, 110),
        documentTop: 110,
        documentBottom: 140,
        tagName: 'P',
        headingLevel: null,
        headingId: null,
        headingText: null,
      },
      {
        from: 8,
        to: 12,
        element: third,
        rect: rect(150, 180),
        documentTop: 180,
        documentBottom: 210,
        tagName: 'P',
        headingLevel: null,
        headingId: null,
        headingText: null,
      },
    ];

    setCurrentEditorBlockPositionSnapshot(withBlockIndex({
      version: 1,
      view: view as any,
      doc: doc as any,
      editorRoot: dom,
      scrollRoot,
      scrollLeft: 0,
      scrollTop: 40,
      blocks,
      headings: [],
    }));

    try {
      const direct = getCachedEditorBlockTargetNearY(view as any, 95);
      expect(direct?.range).toEqual({ from: 4, to: 8 });
      expect(direct?.rect.top).toBe(80);

      const candidates = getCachedEditorBlockTargetsNearY(
        view as any,
        95,
        (candidateRect, candidateY) => (
          candidateY >= candidateRect.top - 70 &&
          candidateY <= candidateRect.bottom + 70
        ),
      );
      expect(candidates?.map((candidate) => candidate.range)).toEqual([
        { from: 0, to: 4 },
        { from: 4, to: 8 },
        { from: 8, to: 12 },
      ]);

      const filtered = getCachedEditorBlockTargetNearY(
        view as any,
        95,
        (block) => block.from !== 4,
      );
      expect(filtered?.range).toEqual({ from: 0, to: 4 });
    } finally {
      clearCurrentEditorBlockPositionSnapshot();
      scrollRoot.remove();
    }
  });

  it('reuses same-document block targets across scroll changes with adjusted viewport rects', () => {
    const scrollRoot = document.createElement('div');
    scrollRoot.setAttribute('data-note-scroll-root', 'true');
    scrollRoot.scrollTop = 20;
    scrollRoot.getBoundingClientRect = () => rect(0, 200, 640);
    const dom = document.createElement('div');
    const block = document.createElement('p');
    dom.appendChild(block);
    scrollRoot.appendChild(dom);
    document.body.appendChild(scrollRoot);

    const paragraphNode = {
      type: { name: 'paragraph' },
      nodeSize: 4,
      forEach: () => {},
    };
    const doc = {
      content: { size: 4 },
      forEach: (callback: (node: typeof paragraphNode, offset: number) => void) => {
        callback(paragraphNode, 0);
      },
      resolve: () => ({
        nodeAfter: { type: { name: 'paragraph' }, nodeSize: 4 },
      }),
    };
    const view = {
      dom,
      state: { doc },
    };

    setCurrentEditorBlockPositionSnapshot(withBlockIndex({
      version: 1,
      view: view as any,
      doc: doc as any,
      editorRoot: dom,
      scrollRoot,
      scrollLeft: 0,
      scrollTop: 20,
      blocks: [{
        from: 0,
        to: 4,
        element: block,
        rect: rect(10, 30),
        documentTop: 30,
        documentBottom: 50,
        tagName: 'P',
        headingLevel: null,
        headingId: null,
        headingText: null,
      }],
      headings: [],
    }));

    try {
      scrollRoot.scrollTop = 80;

      expect(getCachedEditorBlockTargets(view as any)?.[0]?.rect.top).toBe(-50);
      expect(getCachedEditorBlockTargets(view as any)?.[0]?.rect.bottom).toBe(-30);
      expect(getCachedEditorBlockTargetByPos(view as any, 0)?.rect.top).toBe(-50);
    } finally {
      clearCurrentEditorBlockPositionSnapshot();
      scrollRoot.remove();
    }
  });
});
