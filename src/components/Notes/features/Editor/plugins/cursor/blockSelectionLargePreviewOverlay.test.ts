import type { EditorView } from '@milkdown/kit/prose/view';
import { afterEach, describe, expect, it } from 'vitest';
import {
  getBlockSelectionPreviewElements,
  setBlockSelectionPreviewElements,
} from './blockSelectionInteractionState';
import { createLargeBlockSelectionPreviewOverlay } from './blockSelectionLargePreviewOverlay';

afterEach(() => {
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
});
