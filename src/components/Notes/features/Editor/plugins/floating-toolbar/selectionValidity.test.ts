import { describe, expect, it, vi } from 'vitest';
import { Editor, defaultValueCtx, editorViewCtx } from '@milkdown/kit/core';
import { commonmark } from '@milkdown/kit/preset/commonmark';
import { TextSelection } from '@milkdown/kit/prose/state';
import { hasUsableTextRange, hasUsableTextSelection } from './selectionValidity';
import { MAX_EDITOR_SELECTION_TEXT_CHARS } from '../shared/selectionTextLimits';

async function createEditor(markdown: string) {
  const editor = Editor.make()
    .config((ctx) => {
      ctx.set(defaultValueCtx, markdown);
    })
    .use(commonmark);

  await editor.create();
  return editor;
}

type FakeNode = {
  isText?: boolean;
  nodeSize: number;
  text?: string;
  type: { name: string };
};

function createDocWithSelectedNodes(
  entries: Array<{ node: FakeNode; parent: FakeNode | null; pos: number }>
) {
  return {
    content: { size: 128 },
    nodesBetween: vi.fn((
      _from: number,
      _to: number,
      callback: (node: FakeNode, pos: number, parent: FakeNode | null) => void
    ) => {
      entries.forEach((entry) => callback(entry.node, entry.pos, entry.parent));
    }),
    textBetween: vi.fn(() => {
      throw new Error('textBetween should not be used when node scanning is available');
    }),
  };
}

describe('selectionValidity', () => {
  it('treats a real text selection as usable', async () => {
    const editor = await createEditor('hello');
    const view = editor.ctx.get(editorViewCtx);
    const selection = TextSelection.create(view.state.doc, 1, 6);

    expect(hasUsableTextSelection(selection, view.state.doc)).toBe(true);

    await editor.destroy();
  });

  it('rejects selections that only contain markdown syntax', async () => {
    const editor = await createEditor('# Heading');
    const view = editor.ctx.get(editorViewCtx);
    let syntaxFrom = -1;
    let syntaxTo = -1;

    view.state.doc.descendants((node, pos) => {
      if (
        syntaxFrom >= 0
        || !node.isText
        || !node.text
        || !node.marks.some((mark) => mark.type.name === 'markdownSyntax')
      ) {
        return true;
      }
      syntaxFrom = pos;
      syntaxTo = pos + node.nodeSize;
      return true;
    });

    expect(syntaxFrom).toBeGreaterThanOrEqual(0);
    expect(hasUsableTextSelection(
      TextSelection.create(view.state.doc, syntaxFrom, syntaxFrom + 1),
      view.state.doc,
    )).toBe(false);
    expect(hasUsableTextSelection(
      TextSelection.create(view.state.doc, syntaxFrom, syntaxTo + 1),
      view.state.doc,
    )).toBe(true);

    await editor.destroy();
  });

  it('rejects text selections that only contain frontmatter text', () => {
    const frontmatterNode = { type: { name: 'frontmatter' }, nodeSize: 13 };
    const doc = createDocWithSelectedNodes([
      {
        node: frontmatterNode,
        parent: { type: { name: 'doc' }, nodeSize: 128 },
        pos: 0,
      },
      {
        node: {
          isText: true,
          nodeSize: 11,
          text: 'title: Demo',
          type: { name: 'text' },
        },
        parent: frontmatterNode,
        pos: 1,
      },
    ]);

    expect(hasUsableTextRange(doc as never, 1, 12)).toBe(false);
    expect(doc.textBetween).not.toHaveBeenCalled();
  });

  it('keeps code block text selections usable for the reduced toolbar', () => {
    const codeBlockNode = { type: { name: 'code_block' }, nodeSize: 13 };
    const doc = createDocWithSelectedNodes([
      {
        node: codeBlockNode,
        parent: { type: { name: 'doc' }, nodeSize: 128 },
        pos: 0,
      },
      {
        node: {
          isText: true,
          nodeSize: 11,
          text: 'const a = 1',
          type: { name: 'text' },
        },
        parent: codeBlockNode,
        pos: 1,
      },
    ]);

    expect(hasUsableTextRange(doc as never, 1, 12)).toBe(true);
  });

  it('accepts selections that include body text after frontmatter', () => {
    const frontmatterNode = { type: { name: 'frontmatter' }, nodeSize: 13 };
    const paragraphNode = { type: { name: 'paragraph' }, nodeSize: 6 };
    const doc = createDocWithSelectedNodes([
      {
        node: frontmatterNode,
        parent: { type: { name: 'doc' }, nodeSize: 128 },
        pos: 0,
      },
      {
        node: {
          isText: true,
          nodeSize: 11,
          text: 'title: Demo',
          type: { name: 'text' },
        },
        parent: frontmatterNode,
        pos: 1,
      },
      {
        node: paragraphNode,
        parent: { type: { name: 'doc' }, nodeSize: 128 },
        pos: 13,
      },
      {
        node: {
          isText: true,
          nodeSize: 4,
          text: 'Body',
          type: { name: 'text' },
        },
        parent: paragraphNode,
        pos: 14,
      },
    ]);

    expect(hasUsableTextRange(doc as never, 1, 18)).toBe(true);
  });

  it('rejects a non-empty range that only covers an empty paragraph boundary', async () => {
    const editor = await createEditor('');
    const view = editor.ctx.get(editorViewCtx);

    expect(hasUsableTextRange(view.state.doc, 0, view.state.doc.content.size)).toBe(false);

    await editor.destroy();
  });

  it('rejects a text-containing range whose endpoint is a structural boundary', async () => {
    const editor = await createEditor('hello');
    const view = editor.ctx.get(editorViewCtx);

    expect(hasUsableTextRange(view.state.doc, 0, 6)).toBe(false);

    await editor.destroy();
  });

  it('rejects whitespace-only text selections', async () => {
    const editor = await createEditor('a   b');
    const view = editor.ctx.get(editorViewCtx);
    const selection = TextSelection.create(view.state.doc, 2, 5);

    expect(hasUsableTextSelection(selection, view.state.doc)).toBe(false);

    await editor.destroy();
  });

  it('bounds text extraction for large selection checks', () => {
    const textBetween = vi.fn(() => 'hello');
    const doc = {
      content: { size: MAX_EDITOR_SELECTION_TEXT_CHARS + 100 },
      textBetween,
    };

    expect(hasUsableTextRange(doc as never, 0, MAX_EDITOR_SELECTION_TEXT_CHARS + 100)).toBe(true);
    expect(textBetween).toHaveBeenCalledWith(0, MAX_EDITOR_SELECTION_TEXT_CHARS, '\n', '\n');
  });
});
