import { describe, expect, it, vi } from 'vitest';
import { createVisibleLargeSelectionRanges } from './largeSelectionHighlightRanges';

function rect(top: number, bottom: number): DOMRect {
  return {
    bottom,
    height: bottom - top,
    left: 20,
    right: 420,
    top,
    width: 400,
    x: 20,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

describe('createVisibleLargeSelectionRanges', () => {
  it('does not measure collapsed blocks while resolving the visible selection window', () => {
    const scrollRoot = document.createElement('div');
    const editor = document.createElement('div');
    const first = document.createElement('h1');
    const collapsedHeadingBlock = document.createElement('p');
    const collapsedListBlock = document.createElement('ul');
    const last = document.createElement('p');

    scrollRoot.setAttribute('data-note-scroll-root', 'true');
    editor.append(first, collapsedHeadingBlock, collapsedListBlock, last);
    scrollRoot.appendChild(editor);
    document.body.appendChild(scrollRoot);
    editor.getBoundingClientRect = () => rect(20, 180);
    scrollRoot.getBoundingClientRect = () => rect(0, 200);
    first.getBoundingClientRect = () => rect(20, 44);
    last.getBoundingClientRect = () => rect(80, 104);
    collapsedHeadingBlock.className = 'heading-collapsed-content';
    collapsedListBlock.className = 'editor-collapsed-content';
    collapsedHeadingBlock.getBoundingClientRect = vi.fn(() => {
      throw new Error('Collapsed heading blocks should not be measured');
    });
    collapsedListBlock.getBoundingClientRect = vi.fn(() => {
      throw new Error('Collapsed list blocks should not be measured');
    });

    try {
      const result = createVisibleLargeSelectionRanges({
        dom: editor,
        root: {
          getSelection: () => ({ anchorNode: first }),
        },
      } as any, { type: 'all' });

      expect(result.elements).toEqual([first, last]);
      expect(collapsedHeadingBlock.getBoundingClientRect).not.toHaveBeenCalled();
      expect(collapsedListBlock.getBoundingClientRect).not.toHaveBeenCalled();
    } finally {
      scrollRoot.remove();
    }
  });
});
