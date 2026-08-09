import { Editor, defaultValueCtx, editorViewCtx } from '@milkdown/kit/core';
import { commonmark } from '@milkdown/kit/preset/commonmark';
import { gfm } from '@milkdown/kit/preset/gfm';
import type { EditorView } from '@milkdown/kit/prose/view';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { blankAreaDragBoxPlugin } from './blankAreaDragBoxPlugin';
import { blankAreaDragBoxPluginKey, dispatchBlockSelectionAction } from './blockSelectionPluginState';
import {
  collectRangeRows,
  collectSelectedHardBreakLineRanges,
  createBlockSelectionLineFillOverlay,
  MAX_BLOCK_SELECTION_LINE_FILL_DOM_RECTS,
  MAX_BLOCK_SELECTION_LINE_FILL_RANGES,
} from './blockSelectionLineFillOverlay';
import { resolveLineFillEdges } from './blockSelectionLineFillMetrics';
import { collectSelectedImageBlockElements } from './blockSelectionLineFillRender';
import { LARGE_BLOCK_SELECTION_RENDERING_THRESHOLD } from './blockSelectionUtils';

async function createEditor(markdown: string) {
  const editor = Editor.make()
    .config((ctx) => {
      ctx.set(defaultValueCtx, markdown);
    })
    .use(commonmark)
    .use(gfm)
    .use(blankAreaDragBoxPlugin);

  await editor.create();
  return editor;
}

function selectWholeDocument(view: EditorView) {
  dispatchBlockSelectionAction(view, {
    type: 'set-blocks',
    blocks: [{ from: 0, to: view.state.doc.content.size }],
  });
}

function getParagraphRanges(view: EditorView) {
  const ranges: Array<{ from: number; to: number }> = [];
  view.state.doc.descendants((node, pos) => {
    if (node.type.name !== 'paragraph') return true;
    ranges.push({ from: pos, to: pos + node.nodeSize });
    return false;
  });
  return ranges;
}

function mockRect(element: Element, rect: Partial<DOMRect>) {
  const fullRect = {
    x: rect.left ?? 0,
    y: rect.top ?? 0,
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
    width: 0,
    height: 0,
    toJSON: () => ({}),
    ...rect,
  } as DOMRect;
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue(fullRect);
}

function mockRectGetter(element: Element, readRect: () => Partial<DOMRect>) {
  vi.spyOn(element, 'getBoundingClientRect').mockImplementation(() => {
    const rect = readRect();
    return {
      x: rect.left ?? 0,
      y: rect.top ?? 0,
      left: 0,
      top: 0,
      right: 0,
      bottom: 0,
      width: 0,
      height: 0,
      toJSON: () => ({}),
      ...rect,
    } as DOMRect;
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('blockSelectionLineFillOverlay', () => {
  it('collects range rows without materializing DOM rect lists', () => {
    const dom = document.createElement('div');
    const rectIterator = vi.fn(() => {
      throw new Error('rects should not be iterated');
    });
    const createRangeSpy = vi.spyOn(document, 'createRange').mockReturnValue({
      setStart: vi.fn(),
      setEnd: vi.fn(),
      getClientRects: () => ({
        length: 2,
        item: (index: number) => [
          {
            top: 20,
            right: 80,
            bottom: 40,
            height: 20,
          },
          {
            top: 22,
            right: 120,
            bottom: 42,
            height: 20,
          },
        ][index] as DOMRect | undefined ?? null,
        [Symbol.iterator]: rectIterator,
      }),
      detach: vi.fn(),
    } as unknown as Range);
    const view = {
      dom,
      domAtPos: vi.fn(() => ({ node: dom, offset: 0 })),
      state: {
        doc: {
          resolve: vi.fn(() => ({ nodeBefore: null })),
        },
      },
    };

    expect(collectRangeRows(view as any, { from: 1, to: 2 })).toEqual([
      { top: 20, right: 120, bottom: 42 },
    ]);
    expect(rectIterator).not.toHaveBeenCalled();

    createRangeSpy.mockRestore();
  });

  it('skips oversized range row rect lists without reading entries', () => {
    const dom = document.createElement('div');
    const item = vi.fn(() => {
      throw new Error('rect entries should not be read');
    });
    const rectIterator = vi.fn(() => {
      throw new Error('rects should not be iterated');
    });
    const createRangeSpy = vi.spyOn(document, 'createRange').mockReturnValue({
      setStart: vi.fn(),
      setEnd: vi.fn(),
      getClientRects: () => ({
        length: MAX_BLOCK_SELECTION_LINE_FILL_DOM_RECTS + 1,
        item,
        [Symbol.iterator]: rectIterator,
      }),
      detach: vi.fn(),
    } as unknown as Range);
    const view = {
      dom,
      domAtPos: vi.fn(() => ({ node: dom, offset: 0 })),
      state: {
        doc: {
          resolve: vi.fn(() => ({ nodeBefore: null })),
        },
      },
    };

    expect(collectRangeRows(view as any, { from: 1, to: 2 })).toEqual([]);
    expect(item).not.toHaveBeenCalled();
    expect(rectIterator).not.toHaveBeenCalled();

    createRangeSpy.mockRestore();
  });

  it('collects selected hard-break line ranges', async () => {
    const editor = await createEditor('alpha\\\nbravo\\\ncharlie');
    const view = editor.ctx.get(editorViewCtx);

    try {
      selectWholeDocument(view);

      expect(collectSelectedHardBreakLineRanges(view)).toEqual([
        { from: 1, to: 7 },
        { from: 7, to: 13 },
        { from: 13, to: 20 },
      ]);
    } finally {
      await editor.destroy();
    }
  });

  it('uses selected line fill inset variables for adjacent hard-break rows', () => {
    const paragraph = document.createElement('p');
    const selectedLine = document.createElement('span');
    selectedLine.className = 'editor-block-selected editor-block-selected-inline-line';
    selectedLine.style.setProperty('--vlaina-block-selection-bleed-y', '2px');
    selectedLine.style.setProperty('--vlaina-block-selection-fill-top', '3px');
    selectedLine.style.setProperty('--vlaina-block-selection-fill-bottom', '4px');
    paragraph.appendChild(selectedLine);
    document.body.appendChild(paragraph);

    expect(resolveLineFillEdges(paragraph)).toEqual({
      top: 3,
      bottom: 4,
    });
  });

  it('collects disjoint selected hard-break paragraphs', async () => {
    const editor = await createEditor([
      'alpha\\',
      'bravo',
      '',
      'plain middle paragraph',
      '',
      'charlie\\',
      'delta',
    ].join('\n'));
    const view = editor.ctx.get(editorViewCtx);

    try {
      const paragraphRanges = getParagraphRanges(view);
      expect(paragraphRanges).toHaveLength(3);

      dispatchBlockSelectionAction(view, {
        type: 'set-blocks',
        blocks: [paragraphRanges[0], paragraphRanges[2]],
      });

      expect(collectSelectedHardBreakLineRanges(view)).toHaveLength(4);
    } finally {
      await editor.destroy();
    }
  });

  it('caps selected hard-break line ranges before overlay measurement', async () => {
    const markdown = Array.from(
      { length: MAX_BLOCK_SELECTION_LINE_FILL_RANGES + 8 },
      (_, index) => `line-${index}\\`
    ).join('\n');
    const editor = await createEditor(markdown);
    const view = editor.ctx.get(editorViewCtx);

    try {
      selectWholeDocument(view);

      expect(collectSelectedHardBreakLineRanges(view)).toHaveLength(MAX_BLOCK_SELECTION_LINE_FILL_RANGES);
    } finally {
      await editor.destroy();
    }
  });

  it('keeps hard-break line fill ranges available for large block selections', async () => {
    const markdown = Array.from(
      { length: LARGE_BLOCK_SELECTION_RENDERING_THRESHOLD },
      (_, index) => `line-${index}\\\nwrapped-${index}`
    ).join('\n\n');
    const editor = await createEditor(markdown);
    const view = editor.ctx.get(editorViewCtx);

    try {
      const paragraphRanges = getParagraphRanges(view);
      expect(paragraphRanges).toHaveLength(LARGE_BLOCK_SELECTION_RENDERING_THRESHOLD);
      dispatchBlockSelectionAction(view, {
        type: 'set-blocks',
        blocks: paragraphRanges,
      });

      expect(collectSelectedHardBreakLineRanges(view)).toHaveLength(
        LARGE_BLOCK_SELECTION_RENDERING_THRESHOLD * 2,
      );
    } finally {
      await editor.destroy();
    }
  });

  it('does not measure selected hard-break paragraphs hidden by heading collapse', async () => {
    const editor = await createEditor('alpha\\\nbravo');
    const view = editor.ctx.get(editorViewCtx);

    try {
      selectWholeDocument(view);
      const paragraph = view.dom.querySelector('p');
      expect(paragraph).not.toBeNull();
      const originalClosest = paragraph?.closest.bind(paragraph);
      if (paragraph && originalClosest) {
        vi.spyOn(paragraph, 'closest').mockImplementation((selector) => (
          selector === '.heading-collapsed-content, .editor-collapsed-content'
            ? paragraph
            : originalClosest(selector)
        ));
      }
      const paragraphRect = paragraph
        ? vi.spyOn(paragraph, 'getBoundingClientRect').mockImplementation(() => {
            throw new Error('Collapsed hard-break paragraphs should not be measured');
          })
        : null;

      const overlay = createBlockSelectionLineFillOverlay(view);

      expect(paragraphRect).not.toHaveBeenCalled();
      overlay.destroy();
    } finally {
      await editor.destroy();
    }
  });

  it('excludes selected image blocks hidden by list collapse', () => {
    const editorDom = document.createElement('div');
    const collapsedList = document.createElement('ul');
    const image = document.createElement('div');
    collapsedList.className = 'editor-collapsed-content';
    image.className = 'image-block-container editor-block-selected';
    collapsedList.appendChild(image);
    editorDom.appendChild(collapsedList);

    expect(collectSelectedImageBlockElements({ dom: editorDom } as EditorView)).toEqual([]);
  });

  it('adds line fills for selected image blocks with collapsed node-view rects', () => {
    const host = document.createElement('div');
    const editorDom = document.createElement('div');
    const paragraph = document.createElement('p');
    const image = document.createElement('div');
    const view = {
      dom: editorDom,
      state: {
        doc: {
          content: { size: 1 },
          childCount: 0,
          child: vi.fn(),
          resolve: vi.fn(() => ({ nodeBefore: null })),
        },
        [blankAreaDragBoxPluginKey.key]: {
          selectedBlocks: [{ from: 0, to: 1 }],
        },
      },
    } as unknown as EditorView;

    document.body.appendChild(host);
    host.appendChild(editorDom);
    paragraph.className = 'editor-paragraph-has-image-block';
    image.className = 'image-block-container editor-block-selected';
    image.style.setProperty('--vlaina-block-selection-bleed-x-start', '72px');
    image.style.setProperty('--vlaina-block-selection-bleed-x-end', '72px');
    paragraph.appendChild(image);
    editorDom.appendChild(paragraph);

    mockRect(host, { left: 100, top: 20, right: 600, bottom: 420, width: 500, height: 400 });
    mockRect(editorDom, { left: 100, top: 20, right: 600, bottom: 420, width: 500, height: 400 });
    mockRect(paragraph, { left: 100, top: 80, right: 600, bottom: 180, width: 500, height: 100 });
    mockRect(image, { left: 100, top: 96, right: 100, bottom: 156, width: 0, height: 60 });

    const overlay = createBlockSelectionLineFillOverlay(view);
    const fill = host.querySelector<HTMLElement>('.editor-block-selection-line-fill');

    expect(fill).not.toBeNull();
    expect(fill?.style.left).toBe('-72px');
    expect(fill?.style.top).toBe('74px');
    expect(fill?.style.width).toBe('644px');
    expect(fill?.style.height).toBe('64px');

    overlay.destroy();
  });

  it('batches line fill DOM writes after geometry reads', () => {
    const host = document.createElement('div');
    const editorDom = document.createElement('div');
    const pluginState = { selectedBlocks: [] as Array<{ from: number; to: number }> };
    const view = {
      dom: editorDom,
      state: {
        doc: {
          content: { size: 2 },
          childCount: 0,
          child: vi.fn(),
          resolve: vi.fn(() => ({ nodeBefore: null })),
        },
        [blankAreaDragBoxPluginKey.key]: pluginState,
      },
    } as unknown as EditorView;

    document.body.appendChild(host);
    host.appendChild(editorDom);
    mockRect(host, { left: 100, top: 20, right: 600, bottom: 420, width: 500, height: 400 });
    mockRect(editorDom, { left: 100, top: 20, right: 600, bottom: 420, width: 500, height: 400 });

    const overlay = createBlockSelectionLineFillOverlay(view);
    const layer = host.querySelector<HTMLElement>('.editor-block-selection-line-fill-layer');
    expect(layer).not.toBeNull();
    if (!layer) return;

    for (const top of [80, 180]) {
      const paragraph = document.createElement('p');
      const image = document.createElement('div');
      paragraph.className = 'editor-paragraph-has-image-block';
      image.className = 'image-block-container editor-block-selected';
      paragraph.appendChild(image);
      editorDom.appendChild(paragraph);
      mockRect(paragraph, { left: 100, top, right: 600, bottom: top + 80, width: 500, height: 80 });
      mockRect(image, { left: 100, top: top + 16, right: 100, bottom: top + 56, width: 0, height: 40 });
    }

    const appendSpy = vi.spyOn(layer, 'appendChild');
    const originalGetComputedStyle = window.getComputedStyle.bind(window);
    const appendCountsAtStyleRead: number[] = [];
    vi.spyOn(window, 'getComputedStyle').mockImplementation((element, pseudoElement) => {
      appendCountsAtStyleRead.push(appendSpy.mock.calls.length);
      return originalGetComputedStyle(element, pseudoElement);
    });

    pluginState.selectedBlocks = [{ from: 0, to: 1 }, { from: 1, to: 2 }];
    overlay.update(view);

    expect(layer.querySelectorAll('.editor-block-selection-line-fill')).toHaveLength(2);
    expect(appendCountsAtStyleRead.length).toBeGreaterThan(1);
    expect(appendCountsAtStyleRead.every((count) => count === 0)).toBe(true);
    overlay.destroy();
  });

  it('updates line fills on the next frame while a block selection drag is pending', () => {
    const animationFrames: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback: FrameRequestCallback) => {
      animationFrames.push(callback);
      return animationFrames.length;
    });
    const host = document.createElement('div');
    const editorDom = document.createElement('div');
    const paragraph = document.createElement('p');
    const image = document.createElement('div');
    const pluginState = { selectedBlocks: [] as Array<{ from: number; to: number }> };
    const view = {
      dom: editorDom,
      state: {
        doc: {
          content: { size: 1 },
          childCount: 0,
          child: vi.fn(),
          resolve: vi.fn(() => ({ nodeBefore: null })),
        },
        [blankAreaDragBoxPluginKey.key]: pluginState,
      },
    } as unknown as EditorView;

    document.body.appendChild(host);
    host.appendChild(editorDom);
    paragraph.className = 'editor-paragraph-has-image-block';
    image.className = 'image-block-container editor-block-selected';
    paragraph.appendChild(image);
    editorDom.appendChild(paragraph);

    mockRect(host, { left: 100, top: 20, right: 600, bottom: 420, width: 500, height: 400 });
    mockRect(editorDom, { left: 100, top: 20, right: 600, bottom: 420, width: 500, height: 400 });
    mockRect(paragraph, { left: 100, top: 80, right: 600, bottom: 180, width: 500, height: 100 });
    mockRect(image, { left: 100, top: 96, right: 100, bottom: 156, width: 0, height: 60 });

    const overlay = createBlockSelectionLineFillOverlay(view);
    editorDom.classList.add('editor-block-selection-pending');
    pluginState.selectedBlocks = [{ from: 0, to: 1 }];
    overlay.update(view);

    expect(host.querySelector('.editor-block-selection-line-fill')).toBeNull();
    animationFrames.shift()?.(0);
    expect(host.querySelector('.editor-block-selection-line-fill')).not.toBeNull();
    overlay.destroy();
  });

  it('keeps existing line fills when ordinary selected blocks change during a drag', () => {
    const host = document.createElement('div');
    const editorDom = document.createElement('div');
    const paragraph = document.createElement('p');
    const image = document.createElement('div');
    const pluginState = { selectedBlocks: [{ from: 0, to: 1 }] };
    const view = {
      dom: editorDom,
      state: {
        doc: {
          content: { size: 2 },
          childCount: 0,
          child: vi.fn(),
          resolve: vi.fn(() => ({ nodeBefore: null })),
        },
        [blankAreaDragBoxPluginKey.key]: pluginState,
      },
    } as unknown as EditorView;

    document.body.appendChild(host);
    host.appendChild(editorDom);
    paragraph.className = 'editor-paragraph-has-image-block';
    image.className = 'image-block-container editor-block-selected';
    paragraph.appendChild(image);
    editorDom.appendChild(paragraph);

    const hostRect = {
      x: 100,
      y: 20,
      left: 100,
      top: 20,
      right: 600,
      bottom: 420,
      width: 500,
      height: 400,
      toJSON: () => ({}),
    } as DOMRect;
    const hostRectSpy = vi.spyOn(host, 'getBoundingClientRect').mockReturnValue(hostRect);
    mockRect(editorDom, { left: 100, top: 20, right: 600, bottom: 420, width: 500, height: 400 });
    mockRect(paragraph, { left: 100, top: 80, right: 600, bottom: 180, width: 500, height: 100 });
    mockRect(image, { left: 100, top: 96, right: 100, bottom: 156, width: 0, height: 60 });

    const overlay = createBlockSelectionLineFillOverlay(view);
    expect(hostRectSpy).toHaveBeenCalledTimes(1);

    editorDom.classList.add('editor-block-selection-pending');
    pluginState.selectedBlocks = [{ from: 0, to: 1 }, { from: 1, to: 2 }];
    overlay.update(view);

    expect(hostRectSpy).toHaveBeenCalledTimes(1);
    expect(host.querySelector('.editor-block-selection-line-fill')).not.toBeNull();
    overlay.destroy();
  });

  it('refreshes line fills when selected block geometry changes without selection changes', async () => {
    let resizeCallback: ResizeObserverCallback = () => {};
    const OriginalResizeObserver = globalThis.ResizeObserver;
    class TestResizeObserver {
      constructor(callback: ResizeObserverCallback) {
        resizeCallback = callback;
      }

      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
    }
    vi.stubGlobal('ResizeObserver', TestResizeObserver);

    const host = document.createElement('div');
    const editorDom = document.createElement('div');
    const paragraph = document.createElement('p');
    const image = document.createElement('div');
    const view = {
      dom: editorDom,
      state: {
        doc: {
          content: { size: 1 },
          childCount: 0,
          child: vi.fn(),
          resolve: vi.fn(() => ({ nodeBefore: null })),
        },
        [blankAreaDragBoxPluginKey.key]: {
          selectedBlocks: [{ from: 0, to: 1 }],
        },
      },
    } as unknown as EditorView;

    let imageTop = 96;
    let imageBottom = 156;

    document.body.appendChild(host);
    host.appendChild(editorDom);
    paragraph.className = 'editor-paragraph-has-image-block';
    image.className = 'image-block-container editor-block-selected';
    image.style.setProperty('--vlaina-block-selection-bleed-x-start', '72px');
    image.style.setProperty('--vlaina-block-selection-bleed-x-end', '72px');
    paragraph.appendChild(image);
    editorDom.appendChild(paragraph);

    mockRect(host, { left: 100, top: 20, right: 600, bottom: 420, width: 500, height: 400 });
    mockRect(editorDom, { left: 100, top: 20, right: 600, bottom: 420, width: 500, height: 400 });
    mockRect(paragraph, { left: 100, top: 80, right: 600, bottom: 180, width: 500, height: 100 });
    mockRectGetter(image, () => ({
      left: 100,
      top: imageTop,
      right: 100,
      bottom: imageBottom,
      width: 0,
      height: imageBottom - imageTop,
    }));

    try {
      const overlay = createBlockSelectionLineFillOverlay(view);
      const initialFill = host.querySelector<HTMLElement>('.editor-block-selection-line-fill');
      expect(initialFill?.style.top).toBe('74px');
      expect(initialFill?.style.height).toBe('64px');

      imageTop = 126;
      imageBottom = 206;
      resizeCallback([], {} as ResizeObserver);
      await new Promise((resolve) => requestAnimationFrame(resolve));

      const refreshedFill = host.querySelector<HTMLElement>('.editor-block-selection-line-fill');
      expect(refreshedFill?.style.top).toBe('104px');
      expect(refreshedFill?.style.height).toBe('84px');

      overlay.destroy();
    } finally {
      vi.stubGlobal('ResizeObserver', OriginalResizeObserver);
    }
  });
});
