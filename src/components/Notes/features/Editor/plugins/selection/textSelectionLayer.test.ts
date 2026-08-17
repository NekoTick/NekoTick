import { describe, expect, it, vi } from 'vitest';
import { installTextSelectionLayer } from './textSelectionLayer';
import { mergeTextSelectionLayerRects } from './textSelectionLayerRects';

describe('mergeTextSelectionLayerRects', () => {
  it('merges touching fragments on the same visual line', () => {
    expect(mergeTextSelectionLayerRects([
      { bottom: 30, left: 40, right: 70, top: 10 },
      { bottom: 30, left: 10, right: 40.5, top: 10 },
      { bottom: 50, left: 10, right: 20, top: 30 },
    ])).toEqual([
      { bottom: 30, left: 10, right: 70, top: 10 },
      { bottom: 50, left: 10, right: 20, top: 30 },
    ]);
  });

  it('keeps real horizontal gaps and different line boxes separate', () => {
    expect(mergeTextSelectionLayerRects([
      { bottom: 30, left: 10, right: 20, top: 10 },
      { bottom: 30, left: 21, right: 30, top: 10 },
      { bottom: 31, left: 30, right: 40, top: 10 },
    ])).toHaveLength(3);
  });

  it('does not schedule selection geometry while the editor selection is empty', () => {
    const scrollRoot = document.createElement('div');
    scrollRoot.dataset.noteScrollRoot = 'true';
    const host = document.createElement('div');
    const dom = document.createElement('div');
    host.appendChild(dom);
    scrollRoot.appendChild(host);
    document.body.appendChild(scrollRoot);
    const requestAnimationFrameSpy = vi.spyOn(window, 'requestAnimationFrame');
    const view = {
      dom,
      state: {
        doc: {},
        selection: {
          empty: true,
          eq: () => true,
        },
      },
    };

    const layer = installTextSelectionLayer(view as never);
    requestAnimationFrameSpy.mockClear();
    scrollRoot.dispatchEvent(new Event('scroll'));

    expect(requestAnimationFrameSpy).not.toHaveBeenCalled();

    layer.destroy();
    requestAnimationFrameSpy.mockRestore();
    scrollRoot.remove();
  });
});
