import { Editor, defaultValueCtx, editorViewCtx, remarkStringifyOptionsCtx, serializerCtx } from '@milkdown/kit/core';
import { commonmark } from '@milkdown/kit/preset/commonmark';
import { gfm } from '@milkdown/kit/preset/gfm';
import { NodeSelection, TextSelection } from '@milkdown/kit/prose/state';
import { describe, expect, it } from 'vitest';
import { notesRemarkStringifyOptions } from '../../config/stringifyOptions';
import { blankAreaDragBoxPlugin } from './blankAreaDragBoxPlugin';
import {
  normalizeSerializedMarkdownDocument,
  preserveMarkdownBlankLinesForEditor,
  stripTrailingNewlines,
} from '@/lib/notes/markdown/markdownSerializationUtils';

function typeText(view: any, input: string): void {
  for (const character of input) {
    const { from, to } = view.state.selection;
    let handled = false;
    view.someProp('handleTextInput', (handleTextInput: any) => {
      handled = handleTextInput(view, from, to, character) || handled;
    });
    if (!handled) view.dispatch(view.state.tr.insertText(character, from, to));
  }
}

describe('fresh paragraph text input', () => {
  async function createEditor(
    markdown = ['# 1', '', '```code', 'code', '```'].join('\n'),
  ) {
    const editor = Editor.make()
      .config((ctx) => {
        ctx.set(defaultValueCtx, markdown);
        ctx.update(remarkStringifyOptionsCtx, (prev) => ({
          ...prev,
          ...notesRemarkStringifyOptions,
        }));
      })
      .use(commonmark)
      .use(gfm)
      .use(blankAreaDragBoxPlugin);
    await editor.create();
    return editor;
  }

  function placeFreshParagraph(view: any): void {
    const { schema } = view.state;
    const heading = view.state.doc.firstChild;
    const codeBlock = view.state.doc.lastChild;
    const paragraph = schema.nodes.paragraph;
    if (!heading || !codeBlock || !paragraph) throw new Error('Expected heading, code block, and paragraph');

    let tr = view.state.tr.replaceWith(
      0,
      view.state.doc.content.size,
      schema.nodes.doc.create(null, [heading, paragraph.create(), codeBlock]).content,
    );
    tr = tr.setSelection(TextSelection.create(tr.doc, heading.nodeSize + 1));
    view.dispatch(tr);
  }

  it('does not create boundary blank blocks when inserting a list between a heading and code', async () => {
    const editor = await createEditor();
    const view = editor.ctx.get(editorViewCtx);

    try {
      placeFreshParagraph(view);

      typeText(view, '1. ');

      expect(Array.from({ length: view.state.doc.childCount }, (_, index) => view.state.doc.child(index).type.name))
        .toEqual(['heading', 'ordered_list', 'code_block']);
      const serialized = stripTrailingNewlines(
        normalizeSerializedMarkdownDocument(editor.ctx.get(serializerCtx)(view.state.doc)),
      );
      expect(serialized).toBe(['# 1', '1.', '```code', 'code', '```'].join('\n'));
      const reopened = await createEditor(preserveMarkdownBlankLinesForEditor(serialized));
      try {
        const reopenedView = reopened.ctx.get(editorViewCtx);
        expect(Array.from(
          { length: reopenedView.state.doc.childCount },
          (_, index) => reopenedView.state.doc.child(index).type.name,
        )).toEqual(['heading', 'ordered_list', 'code_block']);
      } finally {
        await reopened.destroy();
      }
    } finally {
      await editor.destroy();
    }
  });

  it('consumes an authored blank line when list input starts on that line', async () => {
    const editor = await createEditor([
      '# 1',
      '<!--vlaina-markdown-blank-line-->',
      '```code',
      'code',
      '```',
    ].join('\n'));
    const view = editor.ctx.get(editorViewCtx);

    try {
      const blankLinePos = view.state.doc.firstChild?.nodeSize ?? 0;
      view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, blankLinePos)));

      typeText(view, '1. ');

      expect(Array.from({ length: view.state.doc.childCount }, (_, index) => view.state.doc.child(index).type.name))
        .toEqual(['heading', 'ordered_list', 'code_block']);
      const serialized = stripTrailingNewlines(
        normalizeSerializedMarkdownDocument(editor.ctx.get(serializerCtx)(view.state.doc)),
      );
      expect(serialized).toBe(['# 1', '1.', '```code', 'code', '```'].join('\n'));
    } finally {
      await editor.destroy();
    }
  });

  it('does not create boundary blank blocks for native text transactions', async () => {
    const editor = await createEditor();
    const view = editor.ctx.get(editorViewCtx);

    try {
      placeFreshParagraph(view);
      view.dispatch(view.state.tr.insertText('Inserted', view.state.selection.from));

      expect(Array.from({ length: view.state.doc.childCount }, (_, index) => view.state.doc.child(index).type.name))
        .toEqual(['heading', 'paragraph', 'code_block']);
      expect(view.state.doc.child(1).textContent).toBe('Inserted');
      const serialized = stripTrailingNewlines(
        normalizeSerializedMarkdownDocument(editor.ctx.get(serializerCtx)(view.state.doc)),
      );
      expect(serialized).toBe(['# 1', 'Inserted', '```code', 'code', '```'].join('\n'));
    } finally {
      await editor.destroy();
    }
  });

  it.each([
    ['ordered list', '1. ', 'ordered_list'],
    ['bullet list', '- ', 'bullet_list'],
    ['blockquote', '> ', 'blockquote'],
    ['heading', '# ', 'heading'],
    ['code block', '``` ', 'code_block'],
    ['table', '|2x2| ', 'table'],
    ['task list', '- [ ] ', 'bullet_list'],
  ] as const)('keeps %s input as one block between structural neighbors', async (_label, input, expectedType) => {
    const editor = await createEditor();
    const view = editor.ctx.get(editorViewCtx);

    try {
      placeFreshParagraph(view);
      typeText(view, input);

      expect(view.state.doc.childCount).toBe(3);
      expect(view.state.doc.child(1).type.name).toBe(expectedType);
      expect(view.state.doc.child(0).type.name).toBe('heading');
      expect(view.state.doc.child(2).type.name).toBe('code_block');

      const serialized = stripTrailingNewlines(
        normalizeSerializedMarkdownDocument(editor.ctx.get(serializerCtx)(view.state.doc)),
      );
      const reopened = await createEditor(preserveMarkdownBlankLinesForEditor(serialized));
      try {
        const reopenedView = reopened.ctx.get(editorViewCtx);
        expect(reopenedView.state.doc.childCount).toBe(3);
        expect(reopenedView.state.doc.child(1).type.name).toBe(expectedType);
        expect(reopenedView.state.doc.child(0).type.name).toBe('heading');
        expect(reopenedView.state.doc.child(2).type.name).toBe('code_block');
      } finally {
        await reopened.destroy();
      }
    } finally {
      await editor.destroy();
    }
  });

  it('parses a top-level empty list item followed directly by fenced code as sibling blocks', async () => {
    const editor = Editor.make()
      .config((ctx) => {
        ctx.set(defaultValueCtx, ['# 1', '1.', '```code', 'code', '```'].join('\n'));
      })
      .use(commonmark)
      .use(gfm);
    await editor.create();

    try {
      const view = editor.ctx.get(editorViewCtx);
      expect(Array.from({ length: view.state.doc.childCount }, (_, index) => view.state.doc.child(index).type.name))
        .toEqual(['heading', 'ordered_list', 'code_block']);
    } finally {
      await editor.destroy();
    }
  });
});
