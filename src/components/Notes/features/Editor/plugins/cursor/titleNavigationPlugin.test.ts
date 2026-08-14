import { describe, expect, it, vi } from 'vitest';
import { defaultValueCtx, Editor, editorViewCtx } from '@milkdown/kit/core';
import { TextSelection } from '@milkdown/kit/prose/state';
import type { EditorView } from '@milkdown/kit/prose/view';
import { commonmark } from '@milkdown/kit/preset/commonmark';

const mocks = vi.hoisted(() => ({
  focusNoteTitleInputAtEnd: vi.fn(() => true),
}));

vi.mock('../../utils/titleInputDom', () => ({
  focusNoteTitleInputAtEnd: mocks.focusNoteTitleInputAtEnd,
}));

import { titleNavigationPlugin } from './titleNavigationPlugin';

async function createEditor(markdown = 'first line') {
  const editor = Editor.make()
    .config((ctx) => {
      ctx.set(defaultValueCtx, markdown);
    })
    .use(commonmark)
    .use(titleNavigationPlugin);
  await editor.create();
  const view = editor.ctx.get(editorViewCtx);
  vi.spyOn(view, 'endOfTextblock').mockReturnValue(true);
  return { editor, view };
}

function pressKey(view: EditorView, key: 'ArrowUp' | 'Backspace', init: KeyboardEventInit = {}) {
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
    ...init,
  });
  let handled = false;
  view.someProp('handleKeyDown', (handleKeyDown: any) => {
    handled = handleKeyDown(view, event) || handled;
    return handled;
  });
  return { event, handled };
}

describe('titleNavigationPlugin', () => {
  it('moves to the title for plain ArrowUp at the first visual line', async () => {
    const { editor, view } = await createEditor();

    const result = pressKey(view, 'ArrowUp');

    expect(result.handled).toBe(true);
    expect(result.event.defaultPrevented).toBe(true);
    expect(mocks.focusNoteTitleInputAtEnd).toHaveBeenCalledOnce();
    await editor.destroy();
  });

  it.each([
    { shiftKey: true },
    { ctrlKey: true },
    { metaKey: true },
    { altKey: true },
  ])('leaves modified ArrowUp to text selection: %o', async (init) => {
    mocks.focusNoteTitleInputAtEnd.mockClear();
    const { editor, view } = await createEditor();

    const result = pressKey(view, 'ArrowUp', init);

    expect(result.handled).toBe(false);
    expect(result.event.defaultPrevented).toBe(false);
    expect(mocks.focusNoteTitleInputAtEnd).not.toHaveBeenCalled();
    await editor.destroy();
  });

  it('moves to the title for Backspace at the start of the first body paragraph', async () => {
    mocks.focusNoteTitleInputAtEnd.mockClear();
    const { editor, view } = await createEditor();
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1)));

    const result = pressKey(view, 'Backspace');

    expect(result.handled).toBe(true);
    expect(result.event.defaultPrevented).toBe(true);
    expect(mocks.focusNoteTitleInputAtEnd).toHaveBeenCalledOnce();
    expect(view.state.doc.textContent).toBe('first line');
    await editor.destroy();
  });

  it.each([
    {
      label: 'inside the first paragraph',
      markdown: 'first line',
      selectionPos: (view: EditorView) => 2,
      init: {},
    },
    {
      label: 'at the start of the second paragraph',
      markdown: 'first line\n\nsecond line',
      selectionPos: (view: EditorView) => (view.state.doc.firstChild?.nodeSize ?? 0) + 1,
      init: {},
    },
    {
      label: 'at the start of a heading',
      markdown: '# first line',
      selectionPos: (view: EditorView) => 1,
      init: {},
    },
    {
      label: 'with a modifier',
      markdown: 'first line',
      selectionPos: (view: EditorView) => 1,
      init: { ctrlKey: true },
    },
  ])('leaves Backspace to the editor $label', async ({ markdown, selectionPos, init }) => {
    mocks.focusNoteTitleInputAtEnd.mockClear();
    const { editor, view } = await createEditor(markdown);
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, selectionPos(view))));

    const result = pressKey(view, 'Backspace', init);

    expect(result.event.defaultPrevented).toBe(false);
    expect(mocks.focusNoteTitleInputAtEnd).not.toHaveBeenCalled();
    await editor.destroy();
  });
});
