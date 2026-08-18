import { describe, expect, it, vi } from 'vitest';
import {
  resolveNestedListPointerScanRoot,
  startNestedListPointerSelection,
} from './nestedListPointerCaretPlugin';

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

  it('does not scan nested list text for an ordinary top-level heading', () => {
    const editor = document.createElement('div');
    editor.innerHTML = '<h1><span>Heading</span></h1><ul><li><ul><li>Nested item</li></ul></li></ul>';
    const headingText = editor.querySelector('h1 > span');
    const view = { dom: editor } as any;

    expect(resolveNestedListPointerScanRoot(view, headingText, 100, 20)).toBeNull();
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

  it('ignores released-button movement and cleans up the session on blur', () => {
    const editor = document.createElement('div');
    editor.innerHTML = '<ul><li><ul><li>Nested item</li></ul></li></ul>';
    document.body.appendChild(editor);
    const tr = {
      setSelection: vi.fn(() => tr),
      scrollIntoView: vi.fn(() => tr),
    };
    const doc = {
      content: { size: 20 },
      resolve: vi.fn(() => ({ parent: { inlineContent: true } })),
    };
    const view = {
      dom: editor,
      state: { doc, tr },
      dispatch: vi.fn(),
      focus: vi.fn(),
      posAtCoords: vi.fn(() => ({ pos: 8 })),
    } as any;
    const removeSpy = vi.spyOn(document, 'removeEventListener');

    startNestedListPointerSelection(
      view,
      new MouseEvent('mousedown', { button: 0, buttons: 1, clientX: 10, clientY: 10 }),
      5,
      editor,
    );
    const hoverMove = new MouseEvent('mousemove', {
      bubbles: true,
      buttons: 0,
      cancelable: true,
      clientX: 80,
      clientY: 40,
    });
    document.dispatchEvent(hoverMove);

    expect(hoverMove.defaultPrevented).toBe(false);
    expect(view.posAtCoords).not.toHaveBeenCalled();

    window.dispatchEvent(new Event('blur'));
    expect(removeSpy).toHaveBeenCalledWith('mousemove', expect.any(Function), true);

    editor.remove();
    removeSpy.mockRestore();
  });
});
