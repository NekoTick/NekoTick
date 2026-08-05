import { describe, expect, it } from 'vitest';
import { resolveNestedListPointerScanRoot } from './nestedListPointerCaretPlugin';

describe('resolveNestedListPointerScanRoot', () => {
  it('does not map pointer coordinates for a top-level paragraph', () => {
    const editor = document.createElement('div');
    editor.innerHTML = '<p class="cm-line">Ordinary paragraph</p><ul><li><p class="cm-line">List paragraph</p></li></ul>';
    const paragraph = editor.querySelector('p');
    let positionLookupCount = 0;
    const view = {
      dom: editor,
      posAtCoords: () => {
        positionLookupCount += 1;
        return { pos: 10 };
      },
    } as any;

    expect(resolveNestedListPointerScanRoot(view, paragraph, 100, 20)).toBeNull();
    expect(positionLookupCount).toBe(0);
  });

  it('does not claim an outer list paragraph that has nested list descendants', () => {
    const editor = document.createElement('div');
    editor.innerHTML = '<ul><li class="HyperMD-list-line cm-line"><p class="cm-line">Outer paragraph</p><ul><li><p class="cm-line">Nested paragraph</p></li></ul></li></ul>';
    const outerParagraph = editor.querySelector('ul > li > p');
    const view = {
      dom: editor,
      posAtCoords: () => ({ pos: 10 }),
      posAtDOM: (_node: Node, offset: number) => offset === 0 ? 3 : 18,
    } as any;

    expect(resolveNestedListPointerScanRoot(view, outerParagraph, 100, 20)).toBeNull();
  });

  it('keeps handling nested text and list-container hits', () => {
    const editor = document.createElement('div');
    editor.innerHTML = '<ul><li class="HyperMD-list-line cm-line"><p class="cm-line">Outer paragraph</p><ul><li><p class="cm-line">Nested paragraph</p></li></ul></li></ul>';
    const nestedList = editor.querySelector('li > ul');
    const nestedParagraph = nestedList?.querySelector('p');
    const outerListItem = editor.querySelector('ul > li');
    const nestedListItem = nestedList?.querySelector('li');
    const view = { dom: editor } as any;

    expect(resolveNestedListPointerScanRoot(view, nestedParagraph ?? null, 100, 20)).toBe(nestedListItem);
    expect(resolveNestedListPointerScanRoot(view, nestedList, 100, 20)).toBe(outerListItem);
    expect(resolveNestedListPointerScanRoot(view, outerListItem, 100, 20)).toBe(outerListItem);
  });
});
