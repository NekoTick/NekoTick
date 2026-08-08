import { describe, expect, it, vi } from 'vitest';
import * as ProseModel from '@milkdown/kit/prose/model';
import { TextSelection } from '@milkdown/kit/prose/state';
import { syncEditorSelectionFromDOM } from './editorSelection';

function createView() {
  const SchemaCtor = (ProseModel as any).Schema;
  const schema = new SchemaCtor({
    nodes: {
      doc: { content: 'paragraph' },
      paragraph: { content: 'text*', toDOM: () => ['p', 0], parseDOM: [{ tag: 'p' }] },
      text: { group: 'inline' },
    },
  });
  const doc = schema.node('doc', null, [schema.node('paragraph', null, [schema.text('m的')])]);
  const dom = document.createElement('div');
  const textNode = document.createTextNode('m的');
  dom.appendChild(textNode);
  document.body.appendChild(dom);
  const dispatch = vi.fn();
  const view = {
    dom,
    state: {
      doc,
      selection: TextSelection.create(doc, 2),
      tr: { setSelection: (selection: unknown) => ({ setMeta: () => ({ selection }) }) },
    },
    posAtDOM: (_node: Node, offset: number) => offset + 1,
    dispatch,
  };
  return { dispatch, dom, textNode, view };
}

describe('syncEditorSelectionFromDOM', () => {
  it('copies the native caret into the editor state before window blur', () => {
    const { dispatch, dom, textNode, view } = createView();
    const selection = document.getSelection()!;
    const range = document.createRange();
    range.setStart(textNode, 2);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);

    expect(selection.anchorNode).toBe(textNode);
    expect(view.posAtDOM(textNode, 2)).toBe(3);
    expect(syncEditorSelectionFromDOM(view as never)).toBe(true);
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dom.contains(selection.anchorNode)).toBe(true);
    dom.remove();
  });

  it('does not import a selection outside the editor', () => {
    const { dispatch, dom, view } = createView();
    const outside = document.createTextNode('outside');
    document.body.appendChild(outside);
    const selection = document.getSelection()!;
    const range = document.createRange();
    range.setStart(outside, 1);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);

    expect(syncEditorSelectionFromDOM(view as never)).toBe(false);
    expect(dispatch).not.toHaveBeenCalled();
    outside.remove();
    dom.remove();
  });

  it('does not create a text selection from a structural DOM boundary', () => {
    const { dispatch, dom, view } = createView();
    const selection = document.getSelection()!;
    const range = document.createRange();
    range.setStart(dom, 0);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    view.posAtDOM = vi.fn(() => 0);

    expect(syncEditorSelectionFromDOM(view as never)).toBe(false);
    expect(dispatch).not.toHaveBeenCalled();
    dom.remove();
  });

  it('does not import selections from embedded CodeMirror editors', () => {
    const { dispatch, dom, view } = createView();
    const codeMirror = document.createElement('div');
    codeMirror.className = 'cm-editor';
    const codeText = document.createTextNode('title: note');
    codeMirror.appendChild(codeText);
    dom.appendChild(codeMirror);
    const selection = document.getSelection()!;
    const range = document.createRange();
    range.selectNodeContents(codeText);
    selection.removeAllRanges();
    selection.addRange(range);

    expect(syncEditorSelectionFromDOM(view as never)).toBe(false);
    expect(dispatch).not.toHaveBeenCalled();

    selection.removeAllRanges();
    dom.remove();
  });
});
