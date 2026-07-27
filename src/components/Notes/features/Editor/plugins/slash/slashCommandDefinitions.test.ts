import { describe, expect, it, vi } from 'vitest';
import {
  Editor,
  defaultValueCtx,
  editorViewCtx,
  remarkStringifyOptionsCtx,
  serializerCtx,
} from '@milkdown/kit/core';
import { commonmark } from '@milkdown/kit/preset/commonmark';
import { NodeSelection, TextSelection } from '@milkdown/kit/prose/state';
import { icons } from '@/components/ui/icons/registry';
import { normalizeSerializedMarkdownDocument, stripTrailingNewlines } from '@/lib/notes/markdown/markdownSerializationUtils';
import { themeDomStyleTokens } from '@/styles/themeTokens';
import { notesRemarkStringifyOptions } from '../../config/stringifyOptions';
import { htmlBlockEditorPluginKey } from '../html-block/htmlBlockEditorPlugin';
import { mathPlugin } from '../math';
import { mermaidPlugin } from '../mermaid';
import { tocPlugin } from '../toc';
import { applySlashCommand } from './slashCommands';
import {
  collectFootnoteIds,
  getNextFootnoteDefId,
  getNextFootnoteRefId,
  slashCommandDefinitions,
} from './slashCommandDefinitions';
import { getSlashTextRange } from './slashState';

function createDoc(
  nodes: Array<{ type: string; id?: string; label?: string }>,
  onVisit?: () => void
) {
  return {
    descendants(callback: (node: any) => boolean | void) {
      for (const node of nodes) {
        onVisit?.();
        const result = callback({
          type: { name: node.type },
          attrs: {
            ...(node.id ? { id: node.id } : {}),
            ...(node.label ? { label: node.label } : {}),
          },
        });
        if (result === false) break;
      }
    },
  };
}

function createTreeDoc(
  nodes: Array<{ type: string; id?: string; label?: string }>,
  onAccess?: () => void
) {
  return {
    childCount: nodes.length,
    child(index: number) {
      const node = nodes[index];
      if (!node) return null;
      onAccess?.();
      return {
        childCount: 0,
        type: { name: node.type },
        attrs: {
          ...(node.id ? { id: node.id } : {}),
          ...(node.label ? { label: node.label } : {}),
        },
      };
    },
  };
}

describe('slashCommandDefinitions', () => {
  it('uses unique menu and command ids', () => {
    const ids = slashCommandDefinitions.map((definition) => definition.id);
    const commandIds = slashCommandDefinitions.map((definition) => definition.commandId);

    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(commandIds).size).toBe(commandIds.length);
  });

  it('uses registered icon names', () => {
    for (const definition of slashCommandDefinitions) {
      expect(icons[definition.icon], definition.id).toBeDefined();
    }
  });

  it('persists an empty slash-created heading without adding closing marker text', async () => {
    const editor = Editor.make()
      .config((ctx) => {
        ctx.set(defaultValueCtx, '');
        ctx.update(remarkStringifyOptionsCtx, (prev) => ({
          ...prev,
          ...notesRemarkStringifyOptions,
        }));
      })
      .use(commonmark);

    await editor.create();
    applySlashCommand(editor.ctx, 'heading-1');

    const view = editor.ctx.get(editorViewCtx);
    const serializer = editor.ctx.get(serializerCtx);
    const normalized = stripTrailingNewlines(
      normalizeSerializedMarkdownDocument(serializer(view.state.doc))
    );

    expect(view.state.doc.firstChild?.type.name).toBe('heading');
    expect(normalized).toBe('#');

    await editor.destroy();
  });

  it('keeps common writing commands before advanced inserts', () => {
    const ids = slashCommandDefinitions.map((definition) => definition.id as string);

    expect(ids).toEqual([
      'heading-1',
      'heading-2',
      'heading-3',
      'heading-4',
      'heading-5',
      'heading-6',
      'task-list',
      'ordered-list',
      'bullet-list',
      'quote',
      'callout',
      'divider',
      'code-block',
      'table',
      'image',
      'emoji',
      'frontmatter',
      'equation',
      'inline-math',
      'toc',
      'mermaid',
      'html-block',
      'footnote',
      'footnote-definition',
      'abbreviation',
      'video',
    ]);

    expect(ids.includes('text')).toBe(false);
  });

  it('uses the note header heart icon for the emoji command', () => {
    expect(slashCommandDefinitions.find((definition) => definition.id === 'emoji')?.icon).toBe('misc.heart');
  });

  it('inserts an empty HTML block and opens the shared HTML editor from slash', () => {
    const htmlNode = { type: { name: 'html_block' }, attrs: { value: '' } };
    const domDispatchEvent = vi.fn();
    const dispatch = vi.fn();
    const htmlBlockCreate = vi.fn(() => htmlNode);
    const tr = {
      doc: {
        content: { size: 20 },
        nodeAt: vi.fn(() => htmlNode),
        nodesBetween: vi.fn(),
      },
      mapping: {
        map: vi.fn(() => 7),
      },
      replaceSelectionWith: vi.fn(() => tr),
      setMeta: vi.fn(() => tr),
      scrollIntoView: vi.fn(() => tr),
    };
    const view = {
      coordsAtPos: vi.fn(() => ({ left: 12, bottom: 34 })),
      dispatch,
      dom: { dispatchEvent: domDispatchEvent },
      state: {
        selection: { from: 5 },
        schema: {
          nodes: {
            html_block: {
              create: htmlBlockCreate,
            },
          },
        },
        tr,
      },
    };
    const ctx = { get: vi.fn(() => view) };

    applySlashCommand(ctx as never, 'html-block');

    expect(htmlBlockCreate).toHaveBeenCalledWith({ value: '' });
    expect(tr.replaceSelectionWith).toHaveBeenCalledWith(htmlNode);
    expect(tr.setMeta).toHaveBeenCalledWith(htmlBlockEditorPluginKey, {
      isOpen: true,
      value: '',
      nodePos: 7,
      position: {
        x: 12,
        y: 34 + themeDomStyleTokens.editorPopupAnchorOffsetPx,
      },
    });
    expect(tr.scrollIntoView).toHaveBeenCalled();
    expect(domDispatchEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'editor:block-user-input' }));
    expect(dispatch).toHaveBeenCalledWith(tr);
  });

  it('replaces a middle empty paragraph with an HTML block without adding another gap', async () => {
    const editor = Editor.make()
      .config((ctx) => {
        ctx.set(defaultValueCtx, '');
      })
      .use(commonmark);

    await editor.create();
    const view = editor.ctx.get(editorViewCtx);
    const { schema } = view.state;
    const paragraph = schema.nodes.paragraph;
    const htmlBlock = schema.nodes.html_block;
    expect(paragraph).toBeDefined();
    expect(htmlBlock).toBeDefined();

    view.dispatch(view.state.tr.replaceWith(0, view.state.doc.content.size, [
      paragraph.create(null, schema.text('hi')),
      paragraph.create(),
      paragraph.create(null, schema.text('1')),
    ]));

    let emptyParagraphPos = -1;
    view.state.doc.forEach((node, offset) => {
      if (emptyParagraphPos >= 0) return;
      if (node.type.name === 'paragraph' && node.content.size === 0) {
        emptyParagraphPos = offset;
      }
    });
    expect(emptyParagraphPos).toBeGreaterThanOrEqual(0);
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, emptyParagraphPos + 1)));

    applySlashCommand(editor.ctx, 'html-block');

    const children: Array<{ type: string; text: string; value?: string }> = [];
    view.state.doc.forEach((node) => {
      children.push({
        type: node.type.name,
        text: node.textContent,
        value: typeof node.attrs.value === 'string' ? node.attrs.value : undefined,
      });
    });
    expect(children).toEqual([
      { type: 'paragraph', text: 'hi', value: undefined },
      { type: 'html_block', text: '', value: '' },
      { type: 'paragraph', text: '1', value: undefined },
    ]);

    await editor.destroy();
  });

  it('replaces a middle editable blank-line slash query without preserving the zero-width gap', async () => {
    const editor = Editor.make()
      .config((ctx) => {
        ctx.set(defaultValueCtx, '');
      })
      .use(commonmark);

    await editor.create();
    const view = editor.ctx.get(editorViewCtx);
    const { schema } = view.state;
    const paragraph = schema.nodes.paragraph;
    const editableBlankSlashText = '\u200B/html';
    view.dispatch(view.state.tr.replaceWith(0, view.state.doc.content.size, [
      paragraph.create(null, schema.text('hi')),
      paragraph.create(null, schema.text(editableBlankSlashText)),
      paragraph.create(null, schema.text('1')),
    ]));

    let slashParagraphPos = -1;
    view.state.doc.forEach((node, offset) => {
      if (slashParagraphPos >= 0) return;
      if (node.textContent === editableBlankSlashText) {
        slashParagraphPos = offset;
      }
    });
    expect(slashParagraphPos).toBeGreaterThanOrEqual(0);
    view.dispatch(
      view.state.tr.setSelection(
        TextSelection.create(view.state.doc, slashParagraphPos + 1 + editableBlankSlashText.length)
      )
    );

    const slashRange = getSlashTextRange(view);
    expect(slashRange).not.toBeNull();
    view.dispatch(view.state.tr.delete(slashRange!.deleteFrom, slashRange!.deleteTo));
    applySlashCommand(editor.ctx, 'html-block');

    const children: Array<{ type: string; text: string; value?: string }> = [];
    view.state.doc.forEach((node) => {
      children.push({
        type: node.type.name,
        text: node.textContent,
        value: typeof node.attrs.value === 'string' ? node.attrs.value : undefined,
      });
    });
    expect(children).toEqual([
      { type: 'paragraph', text: 'hi', value: undefined },
      { type: 'html_block', text: '', value: '' },
      { type: 'paragraph', text: '1', value: undefined },
    ]);

    await editor.destroy();
  });

  it('replaces the following empty paragraph when inserting an HTML block from the previous line end', async () => {
    const editor = Editor.make()
      .config((ctx) => {
        ctx.set(defaultValueCtx, '');
      })
      .use(commonmark);

    await editor.create();
    const view = editor.ctx.get(editorViewCtx);
    const { schema } = view.state;
    const paragraph = schema.nodes.paragraph;
    expect(paragraph).toBeDefined();

    view.dispatch(view.state.tr.replaceWith(0, view.state.doc.content.size, [
      paragraph.create(null, schema.text('hi/html')),
      paragraph.create(),
      paragraph.create(null, schema.text('1')),
    ]));

    const slashEndPos = 1 + 'hi/html'.length;
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, slashEndPos)));
    const slashRange = getSlashTextRange(view);
    expect(slashRange).not.toBeNull();
    view.dispatch(view.state.tr.delete(slashRange!.deleteFrom, slashRange!.deleteTo));
    applySlashCommand(editor.ctx, 'html-block');

    const children: Array<{ type: string; text: string; value?: string }> = [];
    view.state.doc.forEach((node) => {
      children.push({
        type: node.type.name,
        text: node.textContent,
        value: typeof node.attrs.value === 'string' ? node.attrs.value : undefined,
      });
    });
    expect(children).toEqual([
      { type: 'paragraph', text: 'hi', value: undefined },
      { type: 'html_block', text: '', value: '' },
      { type: 'paragraph', text: '1', value: undefined },
    ]);

    await editor.destroy();
  });

  it('replaces a middle empty slash paragraph and its editable blank-line boundaries', async () => {
    const editor = Editor.make()
      .config((ctx) => {
        ctx.set(defaultValueCtx, '');
      })
      .use(commonmark);

    await editor.create();
    const view = editor.ctx.get(editorViewCtx);
    const { schema } = view.state;
    const paragraph = schema.nodes.paragraph;
    const htmlBlock = schema.nodes.html_block;
    const markdownBlankLineValue = '<!--vlaina-markdown-blank-line-->';
    view.dispatch(view.state.tr.replaceWith(0, view.state.doc.content.size, [
      paragraph.create(null, schema.text('hi')),
      htmlBlock.create({ value: markdownBlankLineValue }),
      paragraph.create(),
      htmlBlock.create({ value: markdownBlankLineValue }),
      paragraph.create(null, schema.text('1')),
    ]));

    let emptyParagraphPos = -1;
    view.state.doc.forEach((node, offset) => {
      if (emptyParagraphPos >= 0) return;
      if (node.type.name === 'paragraph' && node.content.size === 0) {
        emptyParagraphPos = offset;
      }
    });
    expect(emptyParagraphPos).toBeGreaterThanOrEqual(0);
    view.dispatch(
      view.state.tr.setSelection(
        TextSelection.create(view.state.doc, emptyParagraphPos + 1)
      )
    );

    applySlashCommand(editor.ctx, 'html-block');

    const children: Array<{ type: string; text: string; value?: string }> = [];
    view.state.doc.forEach((node) => {
      children.push({
        type: node.type.name,
        text: node.textContent,
        value: typeof node.attrs.value === 'string' ? node.attrs.value : undefined,
      });
    });
    expect(children).toEqual([
      { type: 'paragraph', text: 'hi', value: undefined },
      { type: 'html_block', text: '', value: markdownBlankLineValue },
      { type: 'html_block', text: '', value: '' },
      { type: 'html_block', text: '', value: markdownBlankLineValue },
      { type: 'paragraph', text: '1', value: undefined },
    ]);

    await editor.destroy();
  });

  it('replaces an editable blank-line slash query and its blank-line boundaries', async () => {
    const editor = Editor.make()
      .config((ctx) => {
        ctx.set(defaultValueCtx, '');
      })
      .use(commonmark);

    await editor.create();
    const view = editor.ctx.get(editorViewCtx);
    const { schema } = view.state;
    const paragraph = schema.nodes.paragraph;
    const htmlBlock = schema.nodes.html_block;
    const editableBlankSlashText = '\u200B/html';
    const markdownBlankLineValue = '<!--vlaina-markdown-blank-line-->';
    view.dispatch(view.state.tr.replaceWith(0, view.state.doc.content.size, [
      paragraph.create(null, schema.text('hi')),
      htmlBlock.create({ value: markdownBlankLineValue }),
      paragraph.create(null, schema.text(editableBlankSlashText)),
      htmlBlock.create({ value: markdownBlankLineValue }),
      paragraph.create(null, schema.text('1')),
    ]));

    let slashParagraphPos = -1;
    view.state.doc.forEach((node, offset) => {
      if (slashParagraphPos >= 0) return;
      if (node.textContent === editableBlankSlashText) {
        slashParagraphPos = offset;
      }
    });
    expect(slashParagraphPos).toBeGreaterThanOrEqual(0);
    view.dispatch(
      view.state.tr.setSelection(
        TextSelection.create(view.state.doc, slashParagraphPos + 1 + editableBlankSlashText.length)
      )
    );

    const slashRange = getSlashTextRange(view);
    expect(slashRange).not.toBeNull();
    view.dispatch(view.state.tr.delete(slashRange!.deleteFrom, slashRange!.deleteTo));
    applySlashCommand(editor.ctx, 'html-block');

    const children: Array<{ type: string; text: string; value?: string }> = [];
    view.state.doc.forEach((node) => {
      children.push({
        type: node.type.name,
        text: node.textContent,
        value: typeof node.attrs.value === 'string' ? node.attrs.value : undefined,
      });
    });
    expect(children).toEqual([
      { type: 'paragraph', text: 'hi', value: undefined },
      { type: 'html_block', text: '', value: markdownBlankLineValue },
      { type: 'html_block', text: '', value: '' },
      { type: 'html_block', text: '', value: markdownBlankLineValue },
      { type: 'paragraph', text: '1', value: undefined },
    ]);

    await editor.destroy();
  });

  it('selects the abbreviation placeholder after inserting the abbreviation template', async () => {
    const editor = Editor.make()
      .config((ctx) => {
        ctx.set(defaultValueCtx, '');
      })
      .use(commonmark);

    await editor.create();
    applySlashCommand(editor.ctx, 'abbreviation');

    const view = editor.ctx.get(editorViewCtx);
    expect(view.state.doc.textContent).toBe('*[ABBR]: Full phrase');
    expect(view.state.selection).toBeInstanceOf(TextSelection);
    expect(view.state.selection.empty).toBe(false);
    expect(view.state.doc.textBetween(view.state.selection.from, view.state.selection.to)).toBe('ABBR');

    await editor.destroy();
  });

  it.each([
    { commandId: 'equation' as const, expectedNodeType: 'math_block' },
    { commandId: 'inline-math' as const, expectedNodeType: 'math_inline' },
    { commandId: 'mermaid' as const, expectedNodeType: 'mermaid' },
    { commandId: 'toc' as const, expectedNodeType: 'toc' },
  ])('moves the selection off a slash-created $commandId node before opening its editor', async ({
    commandId,
    expectedNodeType,
  }) => {
    const editor = Editor.make()
      .config((ctx) => {
        ctx.set(defaultValueCtx, '');
      })
      .use(commonmark);

    for (const plugin of [...mathPlugin, ...mermaidPlugin, ...tocPlugin]) {
      editor.use(plugin);
    }

    await editor.create();
    applySlashCommand(editor.ctx, commandId);

    const view = editor.ctx.get(editorViewCtx);
    const nodes: string[] = [];
    view.state.doc.descendants((node) => {
      nodes.push(node.type.name);
    });

    expect(nodes).toContain(expectedNodeType);
    expect(view.state.selection).toBeInstanceOf(TextSelection);
    expect(view.state.selection).not.toBeInstanceOf(NodeSelection);

    await editor.destroy();
  });
});

describe('footnote id helpers', () => {
  it('collects footnote references and definitions separately', () => {
    const ids = collectFootnoteIds(createDoc([
      { type: 'footnote_ref', id: '1' },
      { type: 'footnote_def', id: '2' },
      { type: 'paragraph' },
    ]));

    expect(Array.from(ids.refs)).toEqual(['1']);
    expect(Array.from(ids.defs)).toEqual(['2']);
  });

  it('collects active GFM footnote labels separately', () => {
    const ids = collectFootnoteIds(createDoc([
      { type: 'footnote_reference', label: '1' },
      { type: 'footnote_definition', label: '2' },
      { type: 'paragraph' },
    ]));

    expect(Array.from(ids.refs)).toEqual(['1']);
    expect(Array.from(ids.defs)).toEqual(['2']);
  });

  it('allocates the next reference id after existing refs and defs', () => {
    expect(getNextFootnoteRefId(createDoc([
      { type: 'footnote_ref', id: '1' },
      { type: 'footnote_def', id: '2' },
    ]))).toBe('3');
  });

  it('uses the first reference without a definition for new definitions', () => {
    expect(getNextFootnoteDefId(createDoc([
      { type: 'footnote_ref', id: '1' },
      { type: 'footnote_ref', id: '2' },
      { type: 'footnote_def', id: '2' },
    ]))).toBe('1');
  });

  it('keeps nonnumeric pending references deterministic after numeric ids', () => {
    expect(getNextFootnoteDefId(createDoc([
      { type: 'footnote_ref', id: 'b-note' },
      { type: 'footnote_ref', id: '2' },
      { type: 'footnote_ref', id: 'a-note' },
      { type: 'footnote_def', id: '2' },
    ]))).toBe('a-note');
  });

  it('caps footnote id scans by node count', () => {
    let accessed = 0;
    const ids = collectFootnoteIds(createTreeDoc([
      { type: 'paragraph' },
      { type: 'paragraph' },
      { type: 'footnote_ref', id: 'later' },
    ], () => {
      accessed += 1;
    }), 2);

    expect(Array.from(ids.refs)).toEqual([]);
    expect(accessed).toBe(2);
  });

  it('caps collected footnote ids in one pass', () => {
    let visited = 0;
    const ids = collectFootnoteIds(createDoc([
      { type: 'footnote_ref', id: '1' },
      { type: 'footnote_ref', id: '2' },
      { type: 'footnote_ref', id: '3' },
    ], () => {
      visited += 1;
    }), 10, 2);

    expect(Array.from(ids.refs)).toEqual(['1', '2']);
    expect(visited).toBe(2);
  });
});
