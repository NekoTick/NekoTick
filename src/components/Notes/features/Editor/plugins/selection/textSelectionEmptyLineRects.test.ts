import { describe, expect, it, vi } from 'vitest';
import { getSelectedEmptyLineSelectionRect } from './textSelectionEmptyLineRects';

function rect({
  bottom,
  left,
  right,
  top,
}: {
  bottom: number;
  left: number;
  right: number;
  top: number;
}): DOMRect {
  return {
    bottom,
    height: bottom - top,
    left,
    right,
    top,
    width: right - left,
    x: left,
    y: top,
    toJSON: () => ({}),
  };
}

function createView(element: HTMLElement, selection = { from: 1, to: 10 }) {
  const parent = document.createElement('div');
  parent.appendChild(element);
  return {
    posAtDOM: vi.fn((_node: Node, offset: number) => offset === 0 ? 4 : 7),
    state: { selection },
  };
}

describe('getSelectedEmptyLineSelectionRect', () => {
  it('paints a selected markdown blank-line block with the Obsidian-style narrow marker', () => {
    const blankLine = document.createElement('div');
    blankLine.dataset.type = 'html-block';
    blankLine.dataset.value = '<!--vlaina-markdown-blank-line-->';
    blankLine.style.setProperty('--vlaina-size-4px', '4px');
    blankLine.getBoundingClientRect = () => rect({
      bottom: 48,
      left: 16,
      right: 216,
      top: 28,
    });
    const view = createView(blankLine);

    expect(getSelectedEmptyLineSelectionRect(view as never, blankLine)).toEqual({
      bottom: 48,
      left: 16,
      right: 20,
      top: 28,
    });
  });

  it('paints selected empty paragraphs without treating an adjacent boundary as selected', () => {
    const paragraph = document.createElement('p');
    paragraph.textContent = '\u200B';
    paragraph.getBoundingClientRect = () => rect({
      bottom: 40,
      left: 12,
      right: 112,
      top: 20,
    });
    const selectedView = createView(paragraph);
    const boundaryView = createView(paragraph, { from: 1, to: 4 });

    expect(getSelectedEmptyLineSelectionRect(selectedView as never, paragraph)).toMatchObject({
      bottom: 40,
      left: 12,
      right: 16,
      top: 20,
    });
    expect(getSelectedEmptyLineSelectionRect(boundaryView as never, paragraph)).toBeNull();
  });

  it('does not paint hidden structural placeholders as blank lines', () => {
    const tightHeading = document.createElement('div');
    tightHeading.dataset.type = 'html-block';
    tightHeading.dataset.value = '<!--vlaina-markdown-tight-heading-->';
    tightHeading.getBoundingClientRect = () => rect({
      bottom: 20,
      left: 10,
      right: 110,
      top: 10,
    });

    expect(getSelectedEmptyLineSelectionRect(
      createView(tightHeading) as never,
      tightHeading,
    )).toBeNull();
  });
});
