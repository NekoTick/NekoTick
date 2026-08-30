import { Editor, defaultValueCtx, editorViewCtx } from '@milkdown/kit/core';
import { TextSelection } from '@milkdown/kit/prose/state';
import { commonmark } from '@milkdown/kit/preset/commonmark';
import { describe, expect, it } from 'vitest';
import { handleLeadingEmptyParagraphBackspace } from './leadingEmptyParagraphBackspace';

describe('handleLeadingEmptyParagraphBackspace', () => {
  it('deletes a leading empty paragraph and moves the cursor to the next paragraph end', async () => {
    const editor = Editor.make()
      .config((ctx) => ctx.set(defaultValueCtx, 'Body'))
      .use(commonmark);
    await editor.create();
    const view = editor.ctx.get(editorViewCtx);

    try {
      const paragraph = view.state.schema.nodes.paragraph;
      view.dispatch(view.state.tr.replaceWith(0, view.state.doc.content.size, [
        paragraph.create(),
        paragraph.create(null, view.state.schema.text('Body')),
      ]));
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1)));
      const event = new KeyboardEvent('keydown', {
        key: 'Backspace',
        bubbles: true,
        cancelable: true,
      });

      expect(handleLeadingEmptyParagraphBackspace(view, event)).toBe(true);
      expect(event.defaultPrevented).toBe(true);
      expect(view.state.doc.childCount).toBe(1);
      expect(view.state.doc.firstChild?.textContent).toBe('Body');
      expect(view.state.selection.$from.parentOffset).toBe('Body'.length);
    } finally {
      await editor.destroy();
    }
  });

  it('leaves an unmarked Backspace to the IME while the editor composition is active', async () => {
    const editor = Editor.make()
      .config((ctx) => ctx.set(defaultValueCtx, 'Body'))
      .use(commonmark);
    await editor.create();
    const view = editor.ctx.get(editorViewCtx);

    try {
      const paragraph = view.state.schema.nodes.paragraph;
      view.dispatch(view.state.tr.replaceWith(0, view.state.doc.content.size, [
        paragraph.create(),
        paragraph.create(null, view.state.schema.text('Body')),
      ]));
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1)));
      view.dom.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
      expect(view.composing).toBe(true);
      const event = new KeyboardEvent('keydown', {
        key: 'Backspace',
        bubbles: true,
        cancelable: true,
      });

      expect(handleLeadingEmptyParagraphBackspace(view, event)).toBe(false);
      expect(event.defaultPrevented).toBe(false);
      expect(view.state.doc.childCount).toBe(2);
      view.dom.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
    } finally {
      await editor.destroy();
    }
  });

  it.each([
    ['ordered list', '1. First\n2. Second', 'ordered_list', 'First'],
    ['bullet list', '- First\n- Second', 'bullet_list', 'First'],
    ['blockquote', '> Quote', 'blockquote', 'Quote'],
    ['heading', '# Heading', 'heading', 'Heading'],
  ])('moves to the first text line end when a %s follows the leading empty paragraph', async (
    _label,
    markdown,
    expectedBlockType,
    expectedText,
  ) => {
    const editor = Editor.make()
      .config((ctx) => ctx.set(defaultValueCtx, markdown))
      .use(commonmark);
    await editor.create();
    const view = editor.ctx.get(editorViewCtx);

    try {
      const paragraph = view.state.schema.nodes.paragraph;
      const nextBlock = view.state.doc.firstChild;
      if (!nextBlock) throw new Error('Expected next block');
      view.dispatch(view.state.tr.replaceWith(0, view.state.doc.content.size, [
        paragraph.create(),
        nextBlock,
      ]));
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1)));
      const event = new KeyboardEvent('keydown', {
        key: 'Backspace',
        bubbles: true,
        cancelable: true,
      });

      expect(handleLeadingEmptyParagraphBackspace(view, event)).toBe(true);
      expect(view.state.doc.firstChild?.type.name).toBe(expectedBlockType);
      expect(view.state.selection.$from.parent.textContent).toBe(expectedText);
      expect(view.state.selection.$from.parentOffset).toBe(expectedText.length);
    } finally {
      await editor.destroy();
    }
  });

  it('does not intercept an empty paragraph outside the document start', async () => {
    const editor = Editor.make()
      .config((ctx) => ctx.set(defaultValueCtx, 'Intro\n\nBody'))
      .use(commonmark);
    await editor.create();
    const view = editor.ctx.get(editorViewCtx);

    try {
      const paragraph = view.state.schema.nodes.paragraph;
      view.dispatch(view.state.tr.replaceWith(0, view.state.doc.content.size, [
        paragraph.create(null, view.state.schema.text('Intro')),
        paragraph.create(),
        paragraph.create(null, view.state.schema.text('Body')),
      ]));
      const emptyParagraphPos = view.state.doc.child(0).nodeSize;
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, emptyParagraphPos + 1)));

      const handled = handleLeadingEmptyParagraphBackspace(view, new KeyboardEvent('keydown', {
        key: 'Backspace',
        cancelable: true,
      }));

      expect(handled).toBe(false);
      expect(view.state.doc.childCount).toBe(3);
    } finally {
      await editor.destroy();
    }
  });

  it('does not skip a non-editable first block to reach later text', async () => {
    const editor = Editor.make()
      .config((ctx) => ctx.set(defaultValueCtx, '---\n\nBody'))
      .use(commonmark);
    await editor.create();
    const view = editor.ctx.get(editorViewCtx);

    try {
      const paragraph = view.state.schema.nodes.paragraph;
      const horizontalRule = view.state.doc.firstChild;
      if (!horizontalRule) throw new Error('Expected horizontal rule');
      view.dispatch(view.state.tr.replaceWith(0, view.state.doc.content.size, [
        paragraph.create(),
        horizontalRule,
        paragraph.create(null, view.state.schema.text('Body')),
      ]));
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1)));

      const handled = handleLeadingEmptyParagraphBackspace(view, new KeyboardEvent('keydown', {
        key: 'Backspace',
        cancelable: true,
      }));

      expect(handled).toBe(false);
      expect(view.state.doc.childCount).toBe(3);
      expect(view.state.selection.from).toBe(1);
    } finally {
      await editor.destroy();
    }
  });
});
