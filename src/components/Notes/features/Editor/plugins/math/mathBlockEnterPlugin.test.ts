import { describe, expect, it, vi } from 'vitest';
import {
  defaultValueCtx,
  Editor,
  editorViewCtx,
} from '@milkdown/kit/core';
import { commonmark } from '@milkdown/kit/preset/commonmark';
import { NodeSelection, TextSelection } from '@milkdown/kit/prose/state';
import { handleMathBlockShortcutEnter } from './mathBlockEnterPlugin';
import { mathEditorPluginKey } from './mathEditorPluginKey';
import { mathPlugin } from './index';

function createView(args?: {
  text?: string;
  parentTypeName?: string;
  empty?: boolean;
  parentOffset?: number;
  canReplaceWith?: boolean;
  hasMathBlock?: boolean;
  coordsAtPosThrows?: boolean;
  throwOnTextContent?: boolean;
}) {
  const text = args?.text ?? '$$';
  const parentTypeName = args?.parentTypeName ?? 'paragraph';
  const empty = args?.empty ?? true;
  const parentOffset = args?.parentOffset ?? text.length;
  const canReplaceWith = args?.canReplaceWith ?? true;
  const hasMathBlock = args?.hasMathBlock ?? true;
  const tr = {
    replaceWith: vi.fn(() => tr),
    setMeta: vi.fn(() => tr),
    scrollIntoView: vi.fn(() => tr),
  };
  const mathBlockType = {
    create: vi.fn((attrs: { latex: string }) => ({ type: 'math_block', attrs })),
  };
  const dispatch = vi.fn();
  const parent = {
    type: { name: parentTypeName },
    textBetween: vi.fn(() => text),
    get textContent() {
      if (args?.throwOnTextContent) {
        throw new Error('aggregate paragraph textContent should not be read');
      }
      return text;
    },
    content: { size: text.length },
    nodeSize: text.length + 2,
  };
  const view = {
    state: {
      selection: {
        empty,
        from: 8,
        $from: {
          depth: 1,
          parentOffset,
          before: vi.fn(() => 4),
          index: vi.fn(() => 0),
          node: vi.fn(() => ({
            canReplaceWith: vi.fn(() => canReplaceWith),
          })),
          parent,
        },
      },
      schema: {
        nodes: {
          math_block: hasMathBlock ? mathBlockType : undefined,
        },
      },
      tr,
    },
    dispatch,
    coordsAtPos: args?.coordsAtPosThrows
      ? vi.fn(() => {
          throw new Error('coords');
        })
      : vi.fn(() => ({
          left: 120,
          bottom: 200,
        })),
  };

  return {
    view,
    tr,
    dispatch,
    mathBlockType,
  };
}

describe('mathBlockEnterPlugin', () => {
  it('converts a shortcut-only paragraph into a math block and opens the editor', () => {
    const { view, tr, dispatch, mathBlockType } = createView({ text: '￥￥', throwOnTextContent: true });

    expect(handleMathBlockShortcutEnter(view as never)).toBe(true);
    expect(view.state.selection.$from.parent.textBetween).toHaveBeenCalledWith(0, 2, '', '');
    expect(mathBlockType.create).toHaveBeenCalledWith({ latex: '' });
    expect(tr.replaceWith).toHaveBeenCalledWith(4, 8, {
      type: 'math_block',
      attrs: { latex: '' },
    });
    expect(tr.setMeta).toHaveBeenCalledWith(mathEditorPluginKey, {
      isOpen: true,
      latex: '',
      displayMode: true,
      position: { x: 120, y: 208 },
      nodePos: 4,
      openSource: 'new-empty-block',
    });
    expect(dispatch).toHaveBeenCalledWith(tr);
  });

  it('moves the cursor after a math block created from the Enter shortcut', async () => {
    const editor = Editor.make()
      .config((ctx) => {
        ctx.set(defaultValueCtx, '');
      })
      .use(commonmark);

    for (const plugin of mathPlugin) {
      editor.use(plugin);
    }

    await editor.create();

    try {
      const view = editor.ctx.get(editorViewCtx);
      const paragraph = view.state.schema.nodes.paragraph.create(
        null,
        view.state.schema.text('$$')
      );
      view.dispatch(view.state.tr.replaceWith(0, view.state.doc.content.size, paragraph));
      view.dispatch(view.state.tr.setSelection(
        TextSelection.create(view.state.doc, 1 + '$$'.length)
      ));

      expect(handleMathBlockShortcutEnter(view)).toBe(true);
      expect(view.state.selection).toBeInstanceOf(TextSelection);
      expect(view.state.selection).not.toBeInstanceOf(NodeSelection);
      expect(view.state.doc.child(0).type.name).toBe('math_block');
      expect(view.state.doc.child(1).type.name).toBe('paragraph');
    } finally {
      await editor.destroy();
    }
  });

  it('keeps the cursor out of a following heading after a math block shortcut', async () => {
    const editor = Editor.make()
      .config((ctx) => {
        ctx.set(defaultValueCtx, '');
      })
      .use(commonmark);

    for (const plugin of mathPlugin) {
      editor.use(plugin);
    }

    await editor.create();

    try {
      const view = editor.ctx.get(editorViewCtx);
      const paragraph = view.state.schema.nodes.paragraph.create(
        null,
        view.state.schema.text('$$')
      );
      const heading = view.state.schema.nodes.heading.create(
        { level: 1 },
        view.state.schema.text('Heading')
      );
      view.dispatch(view.state.tr.replaceWith(0, view.state.doc.content.size, [paragraph, heading]));
      view.dispatch(view.state.tr.setSelection(
        TextSelection.create(view.state.doc, 1 + '$$'.length)
      ));

      expect(handleMathBlockShortcutEnter(view)).toBe(true);
      expect(view.state.doc.childCount).toBe(2);
      expect(view.state.doc.child(0).type.name).toBe('math_block');
      expect(view.state.doc.child(1).type.name).toBe('heading');
      expect(view.state.doc.child(1).textContent).toBe('Heading');
      expect(view.state.selection).toBeInstanceOf(NodeSelection);
      expect((view.state.selection as NodeSelection).node).toBe(view.state.doc.child(0));
    } finally {
      await editor.destroy();
    }
  });

  it('uses a following markdown blank line as the cursor target before a heading', async () => {
    const editor = Editor.make()
      .config((ctx) => {
        ctx.set(defaultValueCtx, '');
      })
      .use(commonmark);

    for (const plugin of mathPlugin) {
      editor.use(plugin);
    }

    await editor.create();

    try {
      const view = editor.ctx.get(editorViewCtx);
      const paragraph = view.state.schema.nodes.paragraph.create(
        null,
        view.state.schema.text('$$')
      );
      const blankLine = view.state.schema.nodes.html_block.create({
        value: '<!--vlaina-markdown-blank-line-->',
      });
      const heading = view.state.schema.nodes.heading.create(
        { level: 1 },
        view.state.schema.text('Heading')
      );
      view.dispatch(view.state.tr.replaceWith(0, view.state.doc.content.size, [
        paragraph,
        blankLine,
        heading,
      ]));
      view.dispatch(view.state.tr.setSelection(
        TextSelection.create(view.state.doc, 1 + '$$'.length)
      ));

      expect(handleMathBlockShortcutEnter(view)).toBe(true);
      expect(view.state.doc.childCount).toBe(3);
      expect(view.state.doc.child(0).type.name).toBe('math_block');
      expect(view.state.doc.child(1).type.name).toBe('paragraph');
      expect(view.state.doc.child(1).textContent).toBe('\u200B');
      expect(view.state.doc.child(2).type.name).toBe('heading');
      expect(view.state.selection).toBeInstanceOf(TextSelection);
      expect(view.state.selection.$from.parent).toBe(view.state.doc.child(1));
    } finally {
      await editor.destroy();
    }
  });

  it('converts a bracket shortcut-only paragraph into a math block and opens the editor', () => {
    const { view, tr, dispatch, mathBlockType } = createView({ text: '\\[' });

    expect(handleMathBlockShortcutEnter(view as never)).toBe(true);
    expect(mathBlockType.create).toHaveBeenCalledWith({ latex: '' });
    expect(tr.replaceWith).toHaveBeenCalledWith(4, 8, {
      type: 'math_block',
      attrs: { latex: '' },
    });
    expect(dispatch).toHaveBeenCalledWith(tr);
  });


  it('falls back to a safe popup position when coordinates cannot be resolved', () => {
    const { view, tr } = createView({ coordsAtPosThrows: true });

    expect(handleMathBlockShortcutEnter(view as never)).toBe(true);
    expect(tr.setMeta).toHaveBeenCalledWith(
      mathEditorPluginKey,
      expect.objectContaining({
        position: { x: 16, y: 16 },
      })
    );
  });

  it('does not convert when the paragraph contains more than the shortcut marker', () => {
    const { view, dispatch } = createView({ text: '$$x' });

    expect(handleMathBlockShortcutEnter(view as never)).toBe(false);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('does not read oversized paragraph text while checking math shortcuts', () => {
    const { view, dispatch } = createView({
      text: 'x'.repeat(129),
      throwOnTextContent: true,
    });

    expect(handleMathBlockShortcutEnter(view as never)).toBe(false);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('does not convert when the cursor is not at the end of the paragraph', () => {
    const { view, dispatch } = createView({ parentOffset: 1 });

    expect(handleMathBlockShortcutEnter(view as never)).toBe(false);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('does not convert when the current node is not a paragraph', () => {
    const { view, dispatch } = createView({ parentTypeName: 'heading' });

    expect(handleMathBlockShortcutEnter(view as never)).toBe(false);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('does not convert when the selection is not collapsed', () => {
    const { view, dispatch } = createView({ empty: false });

    expect(handleMathBlockShortcutEnter(view as never)).toBe(false);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('does not convert when the schema cannot create a math block', () => {
    const { view, dispatch } = createView({ hasMathBlock: false });

    expect(handleMathBlockShortcutEnter(view as never)).toBe(false);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('does not convert when the surrounding container rejects a math block replacement', () => {
    const { view, dispatch } = createView({ canReplaceWith: false });

    expect(handleMathBlockShortcutEnter(view as never)).toBe(false);
    expect(dispatch).not.toHaveBeenCalled();
  });
});
