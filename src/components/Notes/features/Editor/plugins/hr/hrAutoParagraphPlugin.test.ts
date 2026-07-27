import { describe, expect, it, vi } from 'vitest';
import {
  defaultValueCtx,
  Editor,
  editorViewCtx,
} from '@milkdown/kit/core';
import { NodeSelection, TextSelection } from '@milkdown/kit/prose/state';
import type { EditorView } from '@milkdown/kit/prose/view';
import { commonmark } from '@milkdown/kit/preset/commonmark';

import { blankAreaDragBoxPlugin } from '../cursor/blankAreaDragBoxPlugin';
import { getBlockSelectionPluginState } from '../cursor/blockSelectionPluginState';
import { handleHorizontalRuleShortcutEnter, hrAutoParagraphPlugin } from './hrAutoParagraphPlugin';

function createEditor(defaultValue = '') {
  return Editor.make()
    .config((ctx) => {
      ctx.set(defaultValueCtx, defaultValue);
    })
    .use(commonmark)
    .use(hrAutoParagraphPlugin);
}

function createEditorWithBlockSelection(defaultValue = '') {
  return Editor.make()
    .config((ctx) => {
      ctx.set(defaultValueCtx, defaultValue);
    })
    .use(commonmark)
    .use(blankAreaDragBoxPlugin)
    .use(hrAutoParagraphPlugin);
}

function typeText(view: EditorView, input: string): void {
  for (const text of input) {
    const { from, to } = view.state.selection;
    let handled = false;

    view.someProp('handleTextInput', (handleTextInput: any) => {
      handled = handleTextInput(view, from, to, text) || handled;
    });

    if (!handled) {
      view.dispatch(view.state.tr.insertText(text, from, to));
    }
  }
}

function setTextSelection(view: EditorView, fromOffset: number, toOffset = fromOffset): void {
  view.dispatch(
    view.state.tr.setSelection(
      TextSelection.create(view.state.doc, 1 + fromOffset, 1 + toOffset),
    ),
  );
}

function pressKey(
  view: EditorView,
  key: string,
  options?: {
    altKey?: boolean;
    ctrlKey?: boolean;
    isComposing?: boolean;
    metaKey?: boolean;
    shiftKey?: boolean;
  },
): boolean {
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
    altKey: options?.altKey,
    ctrlKey: options?.ctrlKey,
    metaKey: options?.metaKey,
    shiftKey: options?.shiftKey,
  });
  if (options?.isComposing) {
    Object.defineProperty(event, 'isComposing', { value: true });
  }

  let handled = false;

  view.someProp('handleKeyDown', (handleKeyDown: any) => {
    if (handled) {
      return handled;
    }
    handled = handleKeyDown(view, event) || handled;
    return handled;
  });

  return handled;
}

function dispatchPluginMouseDown(view: EditorView, target: EventTarget): boolean {
  const event = new MouseEvent('mousedown', {
    button: 0,
    bubbles: true,
    cancelable: true,
  });
  Object.defineProperty(event, 'target', {
    configurable: true,
    value: target,
  });

  let handled = false;
  view.someProp('handleDOMEvents', (handleDOMEvents: any) => {
    if (handled) return handled;
    handled = handleDOMEvents.mousedown?.(view, event) || handled;
    return handled;
  });

  return handled;
}

function replaceLastParagraphText(view: EditorView, text: string): void {
  let paragraphPos = 0;
  view.state.doc.forEach((_node, offset, index) => {
    if (index === view.state.doc.childCount - 1) {
      paragraphPos = offset;
    }
  });

  const paragraph = view.state.doc.lastChild;
  if (!paragraph) {
    return;
  }

  const from = paragraphPos + 1;
  const to = from + paragraph.content.size;
  const tr = view.state.tr.insertText(text, from, to);
  tr.setSelection(TextSelection.create(tr.doc, from + text.length));
  view.dispatch(tr);
}

function hasHorizontalRule(view: EditorView): boolean {
  for (let index = 0; index < view.state.doc.childCount; index += 1) {
    if (view.state.doc.child(index)?.type.name === 'hr') {
      return true;
    }
  }

  return false;
}

function findHorizontalRulePos(view: EditorView): number | null {
  let foundPos: number | null = null;
  view.state.doc.forEach((node, offset) => {
    if (foundPos === null && node.type.name === 'hr') {
      foundPos = offset;
    }
  });

  return foundPos;
}

function findTextStartPos(view: EditorView, text: string): number {
  let foundPos: number | null = null;
  view.state.doc.descendants((node, pos) => {
    if (foundPos !== null) return false;
    if (!node.isText) return true;
    const index = node.text?.indexOf(text) ?? -1;
    if (index >= 0) {
      foundPos = pos + index;
      return false;
    }
    return true;
  });

  if (foundPos === null) {
    throw new Error(`Expected text "${text}" in document`);
  }

  return foundPos;
}

describe('hrAutoParagraphPlugin', () => {
  it('lets the commonmark keymap create a setext heading before the thematic break shortcut', async () => {
    const editor = createEditor();

    await editor.create();

    const view = editor.ctx.get(editorViewCtx);
    typeText(view, 'Setext heading');
    expect(pressKey(view, 'Enter')).toBe(true);
    typeText(view, '---');

    expect(pressKey(view, 'Enter')).toBe(true);
    expect(view.state.doc.child(0).type.name).toBe('heading');
    expect(view.state.doc.child(0).attrs.level).toBe(2);
    expect(view.state.doc.child(0).textContent).toBe('Setext heading');
    expect(view.state.doc.child(1).type.name).toBe('paragraph');
    expect(hasHorizontalRule(view)).toBe(false);

    await editor.destroy();
  });

  it('does not add a paragraph when creating a setext heading before an existing block', async () => {
    const editor = createEditor();

    await editor.create();

    const view = editor.ctx.get(editorViewCtx);
    const { schema } = view.state;
    const source = schema.nodes.paragraph.create(null, schema.text('Setext heading'));
    const delimiter = schema.nodes.paragraph.create(null, schema.text('---'));
    const code = schema.nodes.code_block.create(null, schema.text('code'));
    const tr = view.state.tr.replaceWith(0, view.state.doc.content.size, [source, delimiter, code]);
    view.dispatch(tr.setSelection(TextSelection.create(
      tr.doc,
      source.nodeSize + delimiter.nodeSize - 1,
    )));

    expect(pressKey(view, 'Enter')).toBe(true);
    expect(Array.from(
      { length: view.state.doc.childCount },
      (_, index) => view.state.doc.child(index).type.name,
    )).toEqual(['heading', 'code_block']);
    expect(view.state.doc.firstChild?.textContent).toBe('Setext heading');

    await editor.destroy();
  });

  it('keeps --- as plain text until Enter is pressed', async () => {
    const editor = createEditor();

    await editor.create();

    const view = editor.ctx.get(editorViewCtx);

    typeText(view, '---');

    expect(view.state.doc.childCount).toBe(1);
    expect(view.state.doc.firstChild?.type.name).toBe('paragraph');
    expect(view.state.doc.firstChild?.textContent).toBe('---');

    await editor.destroy();
  });

  it('converts a standalone thematic break line on Enter outside the frontmatter slot', async () => {
    const editor = createEditor('before\n\nplaceholder');

    await editor.create();

    const view = editor.ctx.get(editorViewCtx);
    replaceLastParagraphText(view, '---');

    expect(handleHorizontalRuleShortcutEnter(view)).toBe(true);
    expect(view.state.doc.childCount).toBe(3);
    expect(view.state.doc.child(1).type.name).toBe('hr');
    expect(view.state.doc.child(2).type.name).toBe('paragraph');

    await editor.destroy();
  });

  it('converts a short thematic break without reading aggregate paragraph textContent', async () => {
    const editor = createEditor('before\n\nplaceholder');

    await editor.create();

    const view = editor.ctx.get(editorViewCtx);
    replaceLastParagraphText(view, '---');
    const paragraph = view.state.selection.$from.parent;
    const textBetween = vi.spyOn(paragraph, 'textBetween');
    Object.defineProperty(paragraph, 'textContent', {
      configurable: true,
      get() {
        throw new Error('aggregate paragraph textContent should not be read');
      },
    });

    expect(handleHorizontalRuleShortcutEnter(view)).toBe(true);
    expect(textBetween).toHaveBeenCalledWith(0, paragraph.content.size, '', '');
    expect(view.state.doc.child(1).type.name).toBe('hr');

    await editor.destroy();
  });

  it('converts *** on Enter as a thematic break', async () => {
    const editor = createEditor();

    await editor.create();

    const view = editor.ctx.get(editorViewCtx);
    typeText(view, '***');

    expect(handleHorizontalRuleShortcutEnter(view)).toBe(true);
    expect(view.state.doc.childCount).toBe(2);
    expect(view.state.doc.child(0).type.name).toBe('hr');
    expect(view.state.doc.child(1).type.name).toBe('paragraph');

    await editor.destroy();
  });

  it('converts ___ on Enter as a thematic break', async () => {
    const editor = createEditor();

    await editor.create();

    const view = editor.ctx.get(editorViewCtx);
    typeText(view, '___');

    expect(handleHorizontalRuleShortcutEnter(view)).toBe(true);
    expect(view.state.doc.childCount).toBe(2);
    expect(view.state.doc.child(0).type.name).toBe('hr');
    expect(view.state.doc.child(1).type.name).toBe('paragraph');

    await editor.destroy();
  });

  it('converts spaced thematic break text on Enter', async () => {
    const editor = createEditor();

    await editor.create();

    const view = editor.ctx.get(editorViewCtx);
    replaceLastParagraphText(view, '- - -');

    expect(handleHorizontalRuleShortcutEnter(view)).toBe(true);
    expect(view.state.doc.childCount).toBe(2);
    expect(view.state.doc.child(0).type.name).toBe('hr');
    expect(view.state.doc.child(1).type.name).toBe('paragraph');

    await editor.destroy();
  });

  it('does not convert non-standalone text on Enter', async () => {
    const editor = createEditor();

    await editor.create();

    const view = editor.ctx.get(editorViewCtx);

    typeText(view, '---text---');

    expect(handleHorizontalRuleShortcutEnter(view)).toBe(false);
    expect(view.state.doc.childCount).toBe(1);
    expect(view.state.doc.firstChild?.type.name).toBe('paragraph');
    expect(view.state.doc.firstChild?.textContent).toBe('---text---');

    await editor.destroy();
  });

  it('does not convert --- at the leading frontmatter slot', async () => {
    const editor = createEditor('placeholder');

    await editor.create();

    const view = editor.ctx.get(editorViewCtx);
    replaceLastParagraphText(view, '---');

    expect(handleHorizontalRuleShortcutEnter(view)).toBe(false);
    expect(view.state.doc.childCount).toBe(1);
    expect(view.state.doc.firstChild?.type.name).toBe('paragraph');
    expect(view.state.doc.firstChild?.textContent).toBe('---');

    await editor.destroy();
  });

  it('does not convert when the cursor is not at the end of the line', async () => {
    const editor = createEditor();

    await editor.create();

    const view = editor.ctx.get(editorViewCtx);
    typeText(view, '---');
    setTextSelection(view, 2);

    expect(handleHorizontalRuleShortcutEnter(view)).toBe(false);
    expect(view.state.doc.childCount).toBe(1);
    expect(view.state.doc.firstChild?.type.name).toBe('paragraph');
    expect(view.state.doc.firstChild?.textContent).toBe('---');

    await editor.destroy();
  });

  it('does not convert when a text range is selected', async () => {
    const editor = createEditor();

    await editor.create();

    const view = editor.ctx.get(editorViewCtx);
    typeText(view, '---');
    setTextSelection(view, 0, 3);

    expect(handleHorizontalRuleShortcutEnter(view)).toBe(false);
    expect(view.state.doc.childCount).toBe(1);
    expect(view.state.doc.firstChild?.type.name).toBe('paragraph');
    expect(view.state.doc.firstChild?.textContent).toBe('---');

    await editor.destroy();
  });

  it('does not convert to a thematic break while the user is composing input', async () => {
    const editor = createEditor();

    await editor.create();

    const view = editor.ctx.get(editorViewCtx);
    typeText(view, '---');

    pressKey(view, 'Enter', { isComposing: true });
    expect(hasHorizontalRule(view)).toBe(false);

    await editor.destroy();
  });

  it('does not read oversized first paragraph text while checking shortcuts', () => {
    const parent = {
      type: { name: 'paragraph' },
      content: { size: 257 },
      get textContent() {
        throw new Error('textContent should not be read for oversized hr shortcuts');
      },
    };
    const view = {
      state: {
        selection: {
          empty: true,
          $from: {
            depth: 1,
            index: vi.fn(() => 0),
            parent,
            parentOffset: 257,
          },
        },
        schema: { nodes: { paragraph: parent.type } },
      },
    };

    expect(handleHorizontalRuleShortcutEnter(view as never)).toBe(false);
  });

  it('does not convert to a thematic break for modified Enter shortcuts', async () => {
    const editor = createEditor();

    await editor.create();

    const view = editor.ctx.get(editorViewCtx);
    typeText(view, '---');

    pressKey(view, 'Enter', { shiftKey: true });
    expect(hasHorizontalRule(view)).toBe(false);

    await editor.destroy();
  });

  it('removes the generated empty paragraph without selecting the preceding horizontal rule', async () => {
    const editor = createEditor('before\n\nplaceholder');

    await editor.create();

    const view = editor.ctx.get(editorViewCtx);
    replaceLastParagraphText(view, '---');

    expect(handleHorizontalRuleShortcutEnter(view)).toBe(true);
    expect(view.state.doc.childCount).toBe(3);
    expect(view.state.doc.child(1).type.name).toBe('hr');
    expect(view.state.doc.child(2).type.name).toBe('paragraph');

    expect(pressKey(view, 'Backspace')).toBe(true);
    expect(view.state.doc.childCount).toBe(2);
    expect(view.state.doc.child(1).type.name).toBe('hr');
    expect(view.state.selection).toBeInstanceOf(TextSelection);
    expect(view.state.selection).not.toBeInstanceOf(NodeSelection);
    expect(view.state.selection.$from.parent.textContent).toBe('before');
    expect(view.state.selection.$from.parentOffset).toBe('before'.length);

    await editor.destroy();
  });

  it('deletes a selected horizontal rule and moves the cursor to the preceding text block end', async () => {
    const editor = createEditor('before\n\n---\n\nafter');

    await editor.create();

    const view = editor.ctx.get(editorViewCtx);
    const hrPos = findHorizontalRulePos(view);

    expect(hrPos).not.toBeNull();
    if (hrPos === null) {
      throw new Error('Expected horizontal rule position');
    }

    if (hrPos === null) {
      throw new Error('Expected horizontal rule selection target');
    }

    view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, hrPos)));

    let focusCalled = false;
    const originalBlur = view.dom.blur.bind(view.dom);
    const originalFocus = view.focus.bind(view);
    view.dom.blur = () => {
      originalBlur();
    };
    view.focus = () => {
      focusCalled = true;
      originalFocus();
    };

    expect(pressKey(view, 'Delete')).toBe(true);
    expect(hasHorizontalRule(view)).toBe(false);
    expect(focusCalled).toBe(true);
    expect(view.state.selection).toBeInstanceOf(TextSelection);
    expect(view.state.selection.from).toBe(7);
    expect(view.state.selection.to).toBe(7);

    view.dom.blur = originalBlur;
    view.focus = originalFocus;

    await editor.destroy();
  });

  it('selects the horizontal rule through the shared block selection when the rendered rule is clicked', async () => {
    const editor = createEditorWithBlockSelection('before\n\n---\n\nafter');

    await editor.create();

    const view = editor.ctx.get(editorViewCtx);
    const hr = view.dom.querySelector('hr');
    expect(hr).toBeInstanceOf(HTMLElement);

    const handled = dispatchPluginMouseDown(view, hr!);

    expect(handled).toBe(true);
    const hrPos = findHorizontalRulePos(view);
    expect(hrPos).not.toBeNull();
    if (hrPos === null) {
      throw new Error('Expected horizontal rule position');
    }
    expect(view.state.selection).not.toBeInstanceOf(NodeSelection);
    expect(getBlockSelectionPluginState(view.state).selectedBlocks).toEqual([
      { from: hrPos, to: hrPos + 1 },
    ]);

    await editor.destroy();
  });

  it('does not skip a preceding horizontal rule when ArrowUp starts inside a list item', async () => {
    const editor = createEditor('before\n\n---\n\n1. 1\n2. 2');

    await editor.create();

    const view = editor.ctx.get(editorViewCtx);
    const secondItemTextPos = findTextStartPos(view, '2');
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, secondItemTextPos)));

    expect(pressKey(view, 'ArrowUp')).toBe(false);
    expect(view.state.selection.from).toBe(secondItemTextPos);
    expect(view.state.selection.$from.parent.textContent).toBe('2');

    await editor.destroy();
  });

  it('does not skip a following horizontal rule when ArrowDown starts inside a list item', async () => {
    const editor = createEditor('1. 1\n2. 2\n\n---\n\nafter');

    await editor.create();

    const view = editor.ctx.get(editorViewCtx);
    const secondItemTextPos = findTextStartPos(view, '2');
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, secondItemTextPos + 1)));

    expect(pressKey(view, 'ArrowDown')).toBe(false);
    expect(view.state.selection.from).toBe(secondItemTextPos + 1);
    expect(view.state.selection.$from.parent.textContent).toBe('2');

    await editor.destroy();
  });

  it('skips a preceding horizontal rule to the previous paragraph end on ArrowUp', async () => {
    const editor = createEditor('before\n\n---\n\nafter');

    await editor.create();

    const view = editor.ctx.get(editorViewCtx);
    const afterTextPos = findTextStartPos(view, 'after');
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, afterTextPos)));
    vi.spyOn(view, 'endOfTextblock').mockReturnValue(true);

    expect(pressKey(view, 'ArrowUp')).toBe(true);
    expect(view.state.selection).toBeInstanceOf(TextSelection);
    expect(view.state.selection.$from.parent.textContent).toBe('before');
    expect(view.state.selection.$from.parentOffset).toBe('before'.length);

    await editor.destroy();
  });

  it('leaves composing ArrowUp to the input method', async () => {
    const editor = createEditor('before\n\n---\n\nafter');

    await editor.create();

    const view = editor.ctx.get(editorViewCtx);
    const afterTextPos = findTextStartPos(view, 'after');
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, afterTextPos)));
    vi.spyOn(view, 'endOfTextblock').mockReturnValue(true);

    expect(pressKey(view, 'ArrowUp', { isComposing: true })).toBe(false);
    expect(view.state.selection.$from.parent.textContent).toBe('after');

    await editor.destroy();
  });

  it('skips a following horizontal rule to the next paragraph start on ArrowDown', async () => {
    const editor = createEditor('before\n\n---\n\nafter');

    await editor.create();

    const view = editor.ctx.get(editorViewCtx);
    const beforeTextPos = findTextStartPos(view, 'before');
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, beforeTextPos + 'before'.length)));
    vi.spyOn(view, 'endOfTextblock').mockReturnValue(true);

    expect(pressKey(view, 'ArrowDown')).toBe(true);
    expect(view.state.selection).toBeInstanceOf(TextSelection);
    expect(view.state.selection.$from.parent.textContent).toBe('after');
    expect(view.state.selection.$from.parentOffset).toBe(0);

    await editor.destroy();
  });

  it('does not delete a preceding horizontal rule when Backspace starts inside a list item', async () => {
    const editor = createEditor('before\n\n---\n\n1. 1\n2. 2');

    await editor.create();

    const view = editor.ctx.get(editorViewCtx);
    const firstItemTextPos = findTextStartPos(view, '1');
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, firstItemTextPos)));

    pressKey(view, 'Backspace');
    expect(hasHorizontalRule(view)).toBe(true);

    await editor.destroy();
  });

  it('does not delete a following horizontal rule when Delete starts inside a list item', async () => {
    const editor = createEditor('1. 1\n2. 2\n\n---\n\nafter');

    await editor.create();

    const view = editor.ctx.get(editorViewCtx);
    const secondItemTextPos = findTextStartPos(view, '2');
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, secondItemTextPos + 1)));

    pressKey(view, 'Delete');
    expect(hasHorizontalRule(view)).toBe(true);

    await editor.destroy();
  });
});
