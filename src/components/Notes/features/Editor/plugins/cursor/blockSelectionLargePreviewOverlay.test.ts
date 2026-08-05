import type { EditorView } from '@milkdown/kit/prose/view';
import { afterEach, describe, expect, it } from 'vitest';
import { createLargeBlockSelectionPreviewOverlay } from './blockSelectionLargePreviewOverlay';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('createLargeBlockSelectionPreviewOverlay', () => {
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
