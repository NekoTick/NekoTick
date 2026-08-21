import type { EditorView } from '@milkdown/kit/prose/view';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearCurrentEditorBlockPositionSnapshot,
  setCurrentEditorBlockPositionSnapshot,
} from '../../utils/editorBlockPositionCache';
import {
  blankAreaDragBoxPluginKey,
  EMPTY_BLOCK_SELECTION_PLUGIN_STATE,
} from './blockSelectionPluginState';
import {
  getBlockSelectionPreviewElements,
  setBlockSelectionPreviewElements,
} from './blockSelectionInteractionState';
import { createLargeBlockSelectionPreviewOverlay } from './blockSelectionLargePreviewOverlay';

afterEach(() => {
  clearCurrentEditorBlockPositionSnapshot();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('createLargeBlockSelectionPreviewOverlay', () => {
  it('stores preview elements without mutating editor content', () => {
    const dom = document.createElement('div');
    const paragraph = document.createElement('p');
    const codeBlock = document.createElement('div');
    dom.append(paragraph, codeBlock);

    setBlockSelectionPreviewElements(dom, [paragraph, codeBlock]);

    expect(getBlockSelectionPreviewElements(dom)).toEqual([paragraph, codeBlock]);

    setBlockSelectionPreviewElements(dom, null);
    expect(getBlockSelectionPreviewElements(dom)).toBeNull();
  });

  it('does not mutate drag-owned preview surfaces', () => {
    const host = document.createElement('div');
    const dom = document.createElement('div');
    const surface = document.createElement('p');
    dom.classList.add('editor-block-selection-drag-preview-active');
    surface.classList.add('editor-block-selection-preview-surface');
    dom.appendChild(surface);
    host.appendChild(dom);
    document.body.appendChild(host);
    setBlockSelectionPreviewElements(dom, [surface]);
    const view = {
      dom,
      state: {
        doc: { childCount: 1 },
      },
    } as unknown as EditorView;
    const overlay = createLargeBlockSelectionPreviewOverlay(view);

    try {
      overlay.update(view);
      expect(surface).toHaveClass('editor-block-selection-preview-surface');

      dom.classList.remove('editor-block-selection-drag-preview-active');
      overlay.update(view);
      expect(surface).toHaveClass('editor-block-selection-preview-surface');

      setBlockSelectionPreviewElements(dom, null);
      expect(surface).toHaveClass('editor-block-selection-preview-surface');
    } finally {
      overlay.destroy();
    }
  });

  it('does not repeat cleared preview attribute writes during unrelated view updates', async () => {
    const host = document.createElement('div');
    const dom = document.createElement('div');
    host.appendChild(dom);
    document.body.appendChild(host);
    const view = {
      dom,
      state: {
        doc: { childCount: 1 },
      },
    } as unknown as EditorView;
    const overlay = createLargeBlockSelectionPreviewOverlay(view);
    const layer = host.querySelector('[data-editor-block-selection-committed-preview="true"]');
    const mutations: MutationRecord[] = [];
    const observer = new MutationObserver((records) => mutations.push(...records));
    observer.observe(host, {
      attributes: true,
      subtree: true,
      attributeFilter: ['class', 'data-selection-count'],
    });

    try {
      overlay.update(view);
      overlay.update(view);
      await Promise.resolve();

      expect(layer?.getAttribute('data-selection-count')).toBe('0');
      expect(mutations).toHaveLength(0);
    } finally {
      observer.disconnect();
      overlay.destroy();
    }
  });

  it('skips geometry frames until a large block preview is active', () => {
    const host = document.createElement('div');
    const dom = document.createElement('div');
    host.appendChild(dom);
    document.body.appendChild(host);
    const state: Record<string, any> = {
      doc: { childCount: 64 },
    };
    const view = { dom, state } as unknown as EditorView;
    const requestAnimationFrameSpy = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation(() => 1);
    const overlay = createLargeBlockSelectionPreviewOverlay(view);
    requestAnimationFrameSpy.mockClear();

    try {
      window.dispatchEvent(new Event('resize'));
      expect(requestAnimationFrameSpy).not.toHaveBeenCalled();

      state[blankAreaDragBoxPluginKey.key] = {
        ...EMPTY_BLOCK_SELECTION_PLUGIN_STATE,
        selectedBlocks: Array.from({ length: 32 }, (_, index) => ({
          from: index * 2,
          to: index * 2 + 1,
        })),
      };
      window.dispatchEvent(new Event('resize'));

      expect(requestAnimationFrameSpy).toHaveBeenCalledTimes(1);
    } finally {
      overlay.destroy();
    }
  });

  it('refreshes the path when its coordinate frame moves', async () => {
    const createRect = (left: number, top: number, right: number, bottom: number): DOMRect => ({
      bottom,
      height: bottom - top,
      left,
      right,
      top,
      width: right - left,
      x: left,
      y: top,
      toJSON: () => ({}),
    } as DOMRect);
    const host = document.createElement('div');
    const dom = document.createElement('div');
    const ranges = Array.from({ length: 32 }, (_, index) => ({
      from: index,
      to: index + 1,
    }));
    const elements = ranges.map(() => document.createElement('p'));
    dom.append(...elements);
    host.appendChild(dom);
    document.body.appendChild(host);

    let hostLeft = 0;
    host.getBoundingClientRect = () => createRect(hostLeft, 0, hostLeft + 800, 600);
    dom.getBoundingClientRect = () => createRect(100, 0, 700, 500);
    const paragraph = {
      childCount: 0,
      isText: false,
      nodeSize: 1,
      type: { name: 'paragraph' },
    };
    const editorDoc = {
      childCount: 64,
      content: { size: ranges.length },
      resolve: () => ({ nodeAfter: paragraph }),
    };
    const state: Record<string, any> = {
      doc: editorDoc,
      [blankAreaDragBoxPluginKey.key]: {
        ...EMPTY_BLOCK_SELECTION_PLUGIN_STATE,
        selectedBlocks: ranges,
      },
    };
    const view = { dom, state } as unknown as EditorView;
    const blocks = ranges.map((range, index) => {
      const rect = createRect(100, 20 + index * 12, 700, 28 + index * 12);
      elements[index].getBoundingClientRect = () => rect;
      return {
        ...range,
        element: elements[index],
        rect,
        documentLeft: rect.left,
        documentRight: rect.right,
        documentTop: rect.top,
        documentBottom: rect.bottom,
        tagName: 'P',
        headingLevel: null,
        headingId: null,
        headingText: null,
      };
    });
    setCurrentEditorBlockPositionSnapshot({
      version: 1,
      view,
      doc: editorDoc as never,
      editorRoot: dom,
      editorRect: dom.getBoundingClientRect(),
      scrollRoot: null,
      scrollLeft: 0,
      scrollTop: 0,
      blocks,
      blockIndex: new Map(blocks.map((block) => [`${block.from}:${block.to}`, block])),
      headings: [],
    });
    const overlay = createLargeBlockSelectionPreviewOverlay(view);

    try {
      const path = host.querySelector<SVGPathElement>(
        '[data-editor-block-selection-committed-preview="true"] path',
      );
      const initialPath = path?.getAttribute('d');
      expect(initialPath).toBeTruthy();

      hostLeft = 20;
      window.dispatchEvent(new Event('resize'));
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

      expect(path?.getAttribute('d')).not.toBe(initialPath);
    } finally {
      overlay.destroy();
    }
  });
});
