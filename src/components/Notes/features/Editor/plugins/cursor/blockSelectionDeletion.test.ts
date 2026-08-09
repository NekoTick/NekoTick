import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  Editor,
  defaultValueCtx,
  editorViewCtx,
  remarkStringifyOptionsCtx,
  serializerCtx,
} from '@milkdown/kit/core';
import type { Node as ProseNode } from '@milkdown/kit/prose/model';
import { TextSelection } from '@milkdown/kit/prose/state';
import type { EditorView } from '@milkdown/kit/prose/view';
import { commonmark } from '@milkdown/kit/preset/commonmark';
import { gfm } from '@milkdown/kit/preset/gfm';
import {
  normalizeSerializedMarkdownDocument,
  preserveMarkdownBlankLinesForEditor,
  stripTrailingNewlines,
} from '@/lib/notes/markdown/markdownSerializationUtils';
import { notesRemarkStringifyOptions } from '../../config/stringifyOptions';
import { collectSelectableBlockRanges } from './blockUnitResolver';
import { deleteSelectedBlocks } from './blockSelectionDeletion';
import { EDITABLE_MARKDOWN_BLANK_LINE_PLACEHOLDER } from './markdownBlankLineInteraction';
import { codePlugin } from '../code';
import { createTableNodeFromPipeCells } from '../table/pipeTableShortcut';
import { mathPlugin } from '../math';
import { mermaidPlugin } from '../mermaid';
import { listTabIndentPlugin } from '../task-list';

async function createEditor(markdown: string) {
  const editor = Editor.make()
    .config((ctx) => {
      ctx.set(defaultValueCtx, markdown);
    })
    .use(commonmark)
    .use(gfm)
    .use(mathPlugin)
    .use(mermaidPlugin)
    .use(codePlugin)
    .use(listTabIndentPlugin);

  await editor.create();
  return editor;
}

async function createSerializableEditor(markdown: string) {
  const editor = Editor.make()
    .config((ctx) => {
      ctx.set(defaultValueCtx, preserveMarkdownBlankLinesForEditor(
        normalizeSerializedMarkdownDocument(markdown)
      ));
      ctx.update(remarkStringifyOptionsCtx, (prev) => ({
        ...prev,
        ...notesRemarkStringifyOptions,
      }));
    })
    .use(commonmark)
    .use(gfm)
    .use(mathPlugin)
    .use(mermaidPlugin)
    .use(codePlugin)
    .use(listTabIndentPlugin);

  await editor.create();
  return editor;
}

function serializeNormalizedEditorMarkdown(editor: ReturnType<typeof Editor.make>): string {
  const view = editor.ctx.get(editorViewCtx);
  const serializer = editor.ctx.get(serializerCtx);
  return stripTrailingNewlines(normalizeSerializedMarkdownDocument(serializer(view.state.doc)));
}

function replaceDocument(view: EditorView, nodes: ProseNode[]): void {
  view.dispatch(view.state.tr.replaceWith(0, view.state.doc.content.size, nodes));
}

function createTableNode(view: EditorView): ProseNode {
  const table = createTableNodeFromPipeCells(view.state.schema, ['A', 'B']);
  if (!table) {
    throw new Error('Expected table schema');
  }
  return table;
}

function createCodeBlockNode(view: EditorView, text = 'const value = 1;'): ProseNode {
  const codeBlockType = view.state.schema.nodes.code_block;
  if (!codeBlockType) {
    throw new Error('Expected code block schema');
  }
  return codeBlockType.create({ language: 'ts' }, view.state.schema.text(text));
}

function createPreviewBlockNode(view: EditorView, typeName: 'math_block' | 'mermaid' | 'table'): ProseNode {
  if (typeName === 'table') {
    return createTableNode(view);
  }

  const nodeType = view.state.schema.nodes[typeName];
  if (!nodeType) {
    throw new Error(`Expected ${typeName} schema`);
  }

  return typeName === 'math_block'
    ? nodeType.create({ latex: 'x^2' })
    : nodeType.create({ code: 'graph TD\nA --> B' });
}

function findBlockByText(view: EditorView, text: string) {
  const blocks = collectSelectableBlockRanges(view.state.doc);
  return blocks.find((range) => view.state.doc.resolve(range.from).nodeAfter?.textContent === text);
}

afterEach(() => {
  document.body.innerHTML = '';
});

function replaceWithOrderedListGapAndTaskList(view: EditorView): void {
  const { schema } = view.state;
  const orderedItem = schema.nodes.list_item.create(null, [
    schema.nodes.paragraph.create(null, schema.text('1')),
  ]);
  const taskItem = schema.nodes.list_item.create({ checked: false }, [
    schema.nodes.paragraph.create(null, schema.text('1')),
  ]);

  view.dispatch(view.state.tr.replaceWith(0, view.state.doc.content.size, [
    schema.nodes.ordered_list.create(null, [orderedItem]),
    schema.nodes.paragraph.create(),
    schema.nodes.bullet_list.create(null, [taskItem]),
  ]));
}

function replaceWithOrderedListGapAndOrderedList(view: EditorView): void {
  const { schema } = view.state;
  const firstItem = schema.nodes.list_item.create({ label: '1.', listType: 'ordered' }, [
    schema.nodes.paragraph.create(null, schema.text('one')),
  ]);
  const secondItem = schema.nodes.list_item.create({ label: '1.', listType: 'ordered' }, [
    schema.nodes.paragraph.create(null, schema.text('two')),
  ]);

  view.dispatch(view.state.tr.replaceWith(0, view.state.doc.content.size, [
    schema.nodes.ordered_list.create(null, [firstItem]),
    schema.nodes.paragraph.create(),
    schema.nodes.ordered_list.create(null, [secondItem]),
  ]));
}

describe('deleteSelectedBlocks', () => {
  it('focuses the editor after deletion', async () => {
    const editor = await createEditor('A\n\nB');
    const view = editor.ctx.get(editorViewCtx);
    const blocks = collectSelectableBlockRanges(view.state.doc);

    const focusSpy = vi.spyOn(view, 'focus');
    const requestAnimationFrameSpy = vi.spyOn(window, 'requestAnimationFrame');

    expect(deleteSelectedBlocks(view, [blocks[0]], (tr) => tr)).toBe(true);
    expect(focusSpy).toHaveBeenCalledTimes(1);
    expect(requestAnimationFrameSpy).not.toHaveBeenCalled();
    expect(view.state.doc.textContent).toBe('B');

    requestAnimationFrameSpy.mockRestore();
    await editor.destroy();
  });

  it('marks block deletion as user input so autosave can persist it', async () => {
    const editor = await createEditor('A\n\nB');
    const view = editor.ctx.get(editorViewCtx);
    const blocks = collectSelectableBlockRanges(view.state.doc);
    const userInputListener = vi.fn();

    view.dom.addEventListener('editor:block-user-input', userInputListener);

    expect(deleteSelectedBlocks(view, [blocks[0]], (tr) => tr)).toBe(true);
    expect(userInputListener).toHaveBeenCalledTimes(1);
    expect(view.state.doc.textContent).toBe('B');

    view.dom.removeEventListener('editor:block-user-input', userInputListener);
    await editor.destroy();
  });

  it('places the cursor at the next paragraph tail after deleting a middle block', async () => {
    const editor = await createEditor('A\n\nB\n\nC');
    const view = editor.ctx.get(editorViewCtx);
    const blocks = collectSelectableBlockRanges(view.state.doc);

    expect(deleteSelectedBlocks(view, [blocks[1]], (tr) => tr)).toBe(true);

    expect(view.state.doc.textContent).toBe('AC');
    expect(view.state.selection).toBeInstanceOf(TextSelection);
    expect(view.state.selection.$from.parent.textContent).toBe('C');
    expect(view.state.selection.$from.parentOffset).toBe(1);

    await editor.destroy();
  });

  it('places the cursor at the next paragraph tail after deleting the top block', async () => {
    const editor = await createEditor('A\n\nB\n\nC');
    const view = editor.ctx.get(editorViewCtx);
    const blocks = collectSelectableBlockRanges(view.state.doc);

    expect(deleteSelectedBlocks(view, [blocks[0]], (tr) => tr)).toBe(true);

    expect(view.state.doc.textContent).toBe('BC');
    expect(view.state.selection).toBeInstanceOf(TextSelection);
    expect(view.state.selection.$from.parent.textContent).toBe('B');
    expect(view.state.selection.$from.parentOffset).toBe(1);

    await editor.destroy();
  });

  it('places the cursor on the following markdown blank line after deleting an ordered list block', async () => {
    const editor = await createSerializableEditor([
      '16. 文字宽高比改为100%',
      '',
      '',
      '',
      '我[xs](ds)',
      'i',
      '的',
    ].join('\n'));
    const view = editor.ctx.get(editorViewCtx);
    const targetBlock = findBlockByText(view, '文字宽高比改为100%');

    expect(targetBlock).toBeDefined();
    expect(deleteSelectedBlocks(view, [targetBlock!], (tr) => tr)).toBe(true);

    expect(view.state.selection).toBeInstanceOf(TextSelection);
    expect(view.state.selection.$from.parent.textContent).toBe(EDITABLE_MARKDOWN_BLANK_LINE_PLACEHOLDER);
    expect(view.state.selection.$from.parentOffset).toBe(EDITABLE_MARKDOWN_BLANK_LINE_PLACEHOLDER.length);
    expect(view.state.selection.$from.parent).toBe(view.state.doc.child(0));
    expect(view.state.doc.lastChild?.textContent).toContain('我xs');
    expect(view.state.doc.lastChild?.textContent).toContain('的');

    await editor.destroy();
  });

  it('places the cursor on the blank line after deleting the last item from a remaining ordered list', async () => {
    const markdown = [
      '15. 保留',
      '16. 文字宽高比改为100%',
      '',
      '',
      '我[xs](ds)',
      'i',
      '的',
    ].join('\n');
    const editor = await createSerializableEditor(markdown);
    const view = editor.ctx.get(editorViewCtx);
    const targetBlock = findBlockByText(view, '文字宽高比改为100%');

    expect(serializeNormalizedEditorMarkdown(editor)).toBe(markdown);
    expect(targetBlock).toBeDefined();
    expect(deleteSelectedBlocks(view, [targetBlock!], (tr) => tr)).toBe(true);

    expect(view.state.doc.child(0).type.name).toBe('ordered_list');
    expect(view.state.doc.child(0).textContent).toBe('保留');
    expect(view.state.doc.child(1).type.name).toBe('paragraph');
    expect(view.state.doc.child(1).textContent).toBe(EDITABLE_MARKDOWN_BLANK_LINE_PLACEHOLDER);
    expect(view.state.selection.$from.parent).toBe(view.state.doc.child(1));
    expect(view.state.selection.$from.parentOffset).toBe(EDITABLE_MARKDOWN_BLANK_LINE_PLACEHOLDER.length);

    const persisted = serializeNormalizedEditorMarkdown(editor);
    expect(persisted).toContain('保留');
    expect(persisted).not.toContain('文字宽高比改为100%');
    expect(persisted).not.toContain(EDITABLE_MARKDOWN_BLANK_LINE_PLACEHOLDER);
    expect(persisted).toMatch(/保留\n\n\n我\[xs\]\(ds\)/);

    const reopened = await createSerializableEditor(persisted);
    const reopenedView = reopened.ctx.get(editorViewCtx);
    expect(reopenedView.state.doc.child(0).type.name).toBe('ordered_list');
    expect(reopenedView.state.doc.child(1).type.name).toBe('html_block');
    expect(reopenedView.state.doc.child(2).type.name).toBe('paragraph');
    expect(reopenedView.state.doc.lastChild?.textContent).toContain('我xs');

    await reopened.destroy();
    await editor.destroy();
  });

  it('keeps the cursor in the list when a later item remains before the following blank line', async () => {
    const editor = await createSerializableEditor([
      '1. 一',
      '2. 删除',
      '3. 三',
      '',
      '',
      '列表后正文',
    ].join('\n'));
    const view = editor.ctx.get(editorViewCtx);
    const targetBlock = findBlockByText(view, '删除');

    expect(targetBlock).toBeDefined();
    expect(deleteSelectedBlocks(view, [targetBlock!], (tr) => tr)).toBe(true);

    expect(view.state.selection.$from.parent.textContent).toBe('三');
    expect(view.state.selection.$from.parentOffset).toBe(1);
    expect(view.state.doc.child(0).type.name).toBe('ordered_list');
    expect(view.state.doc.child(0).childCount).toBe(2);
    expect(view.state.doc.child(1).type.name).toBe('html_block');

    await editor.destroy();
  });

  it('keeps the cursor at the deleted line boundary inside a hard-break paragraph', async () => {
    const editor = await createEditor('');
    const view = editor.ctx.get(editorViewCtx);
    const { schema } = view.state;
    const hardbreakType = schema.nodes.hardbreak ?? schema.nodes.hard_break;

    expect(hardbreakType).toBeDefined();
    replaceDocument(view, [
      schema.nodes.paragraph.create(null, [
        schema.text('16. 文字宽高比改为100%'),
        hardbreakType.create(),
        hardbreakType.create(),
        schema.text('我'),
        hardbreakType.create(),
        schema.text('i'),
        hardbreakType.create(),
        schema.text('的'),
      ]),
    ]);
    const blocks = collectSelectableBlockRanges(view.state.doc);

    expect(blocks).toHaveLength(5);
    expect(deleteSelectedBlocks(view, [blocks[0]], (tr) => tr)).toBe(true);

    expect(view.state.selection).toBeInstanceOf(TextSelection);
    expect(view.state.selection.$from.parent).toBe(view.state.doc.child(0));
    expect(view.state.selection.$from.parentOffset).toBe(0);
    expect(view.state.selection.$from.parent.textContent).toContain('我');
    expect(view.state.selection.$from.parent.textContent).toContain('的');

    await editor.destroy();
  });

  it('places the cursor at the next paragraph tail after deleting adjacent middle blocks', async () => {
    const editor = await createEditor('A\n\nB\n\nC\n\nD');
    const view = editor.ctx.get(editorViewCtx);
    const blocks = collectSelectableBlockRanges(view.state.doc);

    expect(deleteSelectedBlocks(view, [blocks[1], blocks[2]], (tr) => tr)).toBe(true);

    expect(view.state.doc.textContent).toBe('AD');
    expect(view.state.selection).toBeInstanceOf(TextSelection);
    expect(view.state.selection.$from.parent.textContent).toBe('D');
    expect(view.state.selection.$from.parentOffset).toBe(1);

    await editor.destroy();
  });

  it('places the cursor at the previous paragraph tail after deleting the last block', async () => {
    const editor = await createEditor('A\n\nB\n\nC');
    const view = editor.ctx.get(editorViewCtx);
    const blocks = collectSelectableBlockRanges(view.state.doc);

    expect(deleteSelectedBlocks(view, [blocks[2]], (tr) => tr)).toBe(true);

    expect(view.state.doc.textContent).toBe('AB');
    expect(view.state.selection).toBeInstanceOf(TextSelection);
    expect(view.state.selection.$from.parent.textContent).toBe('B');
    expect(view.state.selection.$from.parentOffset).toBe(1);

    await editor.destroy();
  });

  it('creates an empty paragraph with the cursor at its tail after deleting the only block', async () => {
    const editor = await createEditor('A');
    const view = editor.ctx.get(editorViewCtx);
    const blocks = collectSelectableBlockRanges(view.state.doc);

    expect(deleteSelectedBlocks(view, [blocks[0]], (tr) => tr)).toBe(true);

    expect(view.state.doc.childCount).toBe(1);
    expect(view.state.doc.child(0).type.name).toBe('paragraph');
    expect(view.state.doc.child(0).textContent).toBe('');
    expect(view.state.selection).toBeInstanceOf(TextSelection);
    expect(view.state.selection.$from.parentOffset).toBe(0);

    await editor.destroy();
  });

  it('places the cursor at the next paragraph tail after deleting the block below a horizontal rule', async () => {
    const editor = await createEditor(['Before', '', '---', '', 'Delete me', '', 'After'].join('\n'));
    const view = editor.ctx.get(editorViewCtx);
    const targetBlock = findBlockByText(view, 'Delete me');

    expect(targetBlock).toBeDefined();
    expect(deleteSelectedBlocks(view, [targetBlock!], (tr) => tr)).toBe(true);

    expect(view.state.selection).toBeInstanceOf(TextSelection);
    expect(view.state.selection.$from.parent.textContent).toBe('After');
    expect(view.state.selection.$from.parentOffset).toBe(5);
    expect(view.state.doc.textContent).toContain('Before');
    expect(view.state.doc.textContent).toContain('After');
    expect(view.state.doc.textContent).not.toContain('Delete me');

    await editor.destroy();
  });

  it('places the cursor at the next paragraph tail after deleting the block above a horizontal rule', async () => {
    const editor = await createEditor(['Delete me', '', '---', '', 'After'].join('\n'));
    const view = editor.ctx.get(editorViewCtx);
    const targetBlock = findBlockByText(view, 'Delete me');

    expect(targetBlock).toBeDefined();
    expect(deleteSelectedBlocks(view, [targetBlock!], (tr) => tr)).toBe(true);

    expect(view.state.selection).toBeInstanceOf(TextSelection);
    expect(view.state.selection.$from.parent.textContent).toBe('After');
    expect(view.state.selection.$from.parentOffset).toBe(5);
    expect(view.state.doc.textContent).toContain('After');
    expect(view.state.doc.textContent).not.toContain('Delete me');

    await editor.destroy();
  });

  it('skips consecutive horizontal rules when placing the cursor after deleting a block above them', async () => {
    const editor = await createEditor(['Delete me', '', '---', '', '---', '', 'After'].join('\n'));
    const view = editor.ctx.get(editorViewCtx);
    const targetBlock = findBlockByText(view, 'Delete me');

    expect(targetBlock).toBeDefined();
    expect(deleteSelectedBlocks(view, [targetBlock!], (tr) => tr)).toBe(true);

    expect(view.state.selection).toBeInstanceOf(TextSelection);
    expect(view.state.selection.$from.parent.textContent).toBe('After');
    expect(view.state.selection.$from.parentOffset).toBe(5);
    expect(view.state.doc.textContent).toContain('After');
    expect(view.state.doc.textContent).not.toContain('Delete me');

    await editor.destroy();
  });

  it('places the cursor on a markdown blank line after skipped horizontal rules', async () => {
    const editor = await createEditor('');
    const view = editor.ctx.get(editorViewCtx);
    const { schema } = view.state;

    replaceDocument(view, [
      schema.nodes.paragraph.create(null, schema.text('Delete me')),
      schema.nodes.hr.create(),
      schema.nodes.html_block.create({ value: '<!--vlaina-markdown-blank-line-->' }),
      schema.nodes.paragraph.create(null, schema.text('After')),
    ]);
    const targetBlock = findBlockByText(view, 'Delete me');

    expect(targetBlock).toBeDefined();
    expect(deleteSelectedBlocks(view, [targetBlock!], (tr) => tr)).toBe(true);

    expect(view.state.selection).toBeInstanceOf(TextSelection);
    expect(view.state.doc.child(0).type.name).toBe('hr');
    expect(view.state.doc.child(1).type.name).toBe('paragraph');
    expect(view.state.doc.child(1).textContent).toBe(EDITABLE_MARKDOWN_BLANK_LINE_PLACEHOLDER);
    expect(view.state.doc.child(2).textContent).toBe('After');
    expect(view.state.selection.$from.parent).toBe(view.state.doc.child(1));
    expect(view.state.selection.$from.parentOffset).toBe(EDITABLE_MARKDOWN_BLANK_LINE_PLACEHOLDER.length);

    await editor.destroy();
  });

  it('keeps the cursor out of a following code block after block-deleting text below a table', async () => {
    const editor = await createEditor('');
    const view = editor.ctx.get(editorViewCtx);
    const { schema } = view.state;
    replaceDocument(view, [
      createTableNode(view),
      schema.nodes.paragraph.create(null, schema.text('delete me')),
      createCodeBlockNode(view),
    ]);
    const blocks = collectSelectableBlockRanges(view.state.doc);

    expect(blocks.map((block) => view.state.doc.nodeAt(block.from)?.type.name)).toEqual([
      'table',
      'paragraph',
      'code_block',
    ]);
    expect(deleteSelectedBlocks(view, [blocks[1]], (tr) => tr)).toBe(true);

    expect(view.state.doc.childCount).toBe(3);
    expect(view.state.doc.child(0).type.name).toBe('table');
    expect(view.state.doc.child(1).type.name).toBe('paragraph');
    expect(view.state.doc.child(1).textContent).toBe('');
    expect(view.state.doc.child(2).type.name).toBe('code_block');
    expect(view.state.selection).toBeInstanceOf(TextSelection);
    expect(view.state.selection.$from.parent.type.name).toBe('paragraph');

    await editor.destroy();
  });

  it('places the cursor on the deleted line after cutting the last adjacent formula block', async () => {
    const editor = await createEditor(['$$', 'a', '$$', '', '$$', 'b', '$$', '', '$$', 'c', '$$'].join('\n'));
    const view = editor.ctx.get(editorViewCtx);
    const blocks = collectSelectableBlockRanges(view.state.doc);

    expect(blocks).toHaveLength(3);
    expect(deleteSelectedBlocks(view, [blocks[2]], (tr) => tr)).toBe(true);

    expect(view.state.doc.childCount).toBe(3);
    expect(view.state.doc.child(0).type.name).toBe('math_block');
    expect(view.state.doc.child(1).type.name).toBe('math_block');
    expect(view.state.doc.child(2).type.name).toBe('paragraph');
    expect(view.state.selection).toBeInstanceOf(TextSelection);
    expect(view.state.selection.from).toBe(view.state.doc.content.size - 1);

    await editor.destroy();
  });

  it('does not leak markdown blank placeholders into the previous formula after deleting an adjacent formula', async () => {
    const markdown = ['$$', 'hi', '$$', '', '$$', 'bye', '$$'].join('\n');
    const editor = await createSerializableEditor(markdown);
    const view = editor.ctx.get(editorViewCtx);
    const blocks = collectSelectableBlockRanges(view.state.doc);
    const lastMathBlock = blocks.find((block) => {
      const node = view.state.doc.resolve(block.from).nodeAfter;
      return node?.type.name === 'math_block' && node.attrs.latex === 'bye';
    });

    expect(lastMathBlock).toBeDefined();
    expect(deleteSelectedBlocks(view, [lastMathBlock!], (tr) => tr)).toBe(true);

    const persisted = serializeNormalizedEditorMarkdown(editor);
    expect(persisted).toBe(['$$', 'hi', '$$'].join('\n'));
    expect(persisted).not.toContain('vlaina-markdown-blank-line');

    const reopened = await createSerializableEditor(persisted);
    const reopenedView = reopened.ctx.get(editorViewCtx);
    const firstNode = reopenedView.state.doc.child(0);

    expect(firstNode.type.name).toBe('math_block');
    expect(firstNode.attrs.latex).toBe('hi');

    await reopened.destroy();
    await editor.destroy();
  });

  it('places the cursor on the deleted line after cutting the last adjacent diagram block', async () => {
    const editor = await createEditor([
      '```mermaid',
      'graph TD',
      'A',
      '```',
      '',
      '```mermaid',
      'graph TD',
      'B',
      '```',
      '',
      '```mermaid',
      'graph TD',
      'C',
      '```',
    ].join('\n'));
    const view = editor.ctx.get(editorViewCtx);
    const blocks = collectSelectableBlockRanges(view.state.doc);

    expect(blocks).toHaveLength(3);
    expect(deleteSelectedBlocks(view, [blocks[2]], (tr) => tr)).toBe(true);

    expect(view.state.doc.childCount).toBe(3);
    expect(view.state.doc.child(0).type.name).toBe('mermaid');
    expect(view.state.doc.child(1).type.name).toBe('mermaid');
    expect(view.state.doc.child(2).type.name).toBe('paragraph');
    expect(view.state.selection).toBeInstanceOf(TextSelection);
    expect(view.state.selection.from).toBe(view.state.doc.content.size - 1);

    await editor.destroy();
  });

  it('removes a selected ordered list item without leaving an empty paragraph', async () => {
    const editor = await createEditor(['1. 1', '2. 2', '3. 3'].join('\n'));
    const view = editor.ctx.get(editorViewCtx);
    const blocks = collectSelectableBlockRanges(view.state.doc);

    expect(blocks).toHaveLength(3);
    expect(deleteSelectedBlocks(view, [blocks[1]], (tr) => tr)).toBe(true);

    expect(view.state.doc.childCount).toBe(1);
    const list = view.state.doc.child(0);
    expect(list.type.name).toBe('ordered_list');
    expect(list.childCount).toBe(2);
    expect(list.child(0).textContent).toBe('1');
    expect(list.child(1).textContent).toBe('3');
    expect(list.child(0).attrs.label).toBe('1.');
    expect(list.child(1).attrs.label).toBe('2.');
    expect(view.state.selection).toBeInstanceOf(TextSelection);

    await editor.destroy();
  });

  it('removes consecutive selected ordered list items', async () => {
    const editor = await createEditor(['1. 1', '2. 2', '3. 3'].join('\n'));
    const view = editor.ctx.get(editorViewCtx);
    const blocks = collectSelectableBlockRanges(view.state.doc);

    expect(blocks).toHaveLength(3);
    expect(deleteSelectedBlocks(view, [blocks[0], blocks[1]], (tr) => tr)).toBe(true);

    expect(view.state.doc.childCount).toBe(1);
    const list = view.state.doc.child(0);
    expect(list.type.name).toBe('ordered_list');
    expect(list.childCount).toBe(1);
    expect(list.child(0).textContent).toBe('3');
    expect(list.child(0).attrs.label).toBe('1.');
    expect(view.state.selection).toBeInstanceOf(TextSelection);

    await editor.destroy();
  });

  it('removes a selected task list item without leaving an empty paragraph', async () => {
    const editor = await createEditor(['- [ ] 1', '- [ ] 2', '- [ ] 3'].join('\n'));
    const view = editor.ctx.get(editorViewCtx);
    const blocks = collectSelectableBlockRanges(view.state.doc);

    expect(blocks).toHaveLength(3);
    expect(deleteSelectedBlocks(view, [blocks[1]], (tr) => tr)).toBe(true);

    expect(view.state.doc.childCount).toBe(1);
    const list = view.state.doc.child(0);
    expect(list.type.name).toBe('bullet_list');
    expect(list.childCount).toBe(2);
    expect(list.child(0).type.name).toBe('list_item');
    expect(list.child(0).attrs.checked).toBe(false);
    expect(list.child(0).textContent).toBe('1');
    expect(list.child(1).attrs.checked).toBe(false);
    expect(list.child(1).textContent).toBe('3');
    expect(view.state.selection).toBeInstanceOf(TextSelection);

    await editor.destroy();
  });

  it('removes only a selected code block inside a list item', async () => {
    const editor = await createEditor(['- Item', '  ```ts', '  console.log(1)', '  ```', '- Next'].join('\n'));
    const view = editor.ctx.get(editorViewCtx);
    const blocks = collectSelectableBlockRanges(view.state.doc);
    const codeBlock = blocks.find((range) => view.state.doc.resolve(range.from).nodeAfter?.type.name === 'code_block');

    expect(codeBlock).toBeDefined();
    expect(deleteSelectedBlocks(view, [codeBlock!], (tr) => tr)).toBe(true);

    expect(view.state.doc.textContent).toContain('Item');
    expect(view.state.doc.textContent).toContain('Next');
    expect(view.state.doc.textContent).not.toContain('console.log');
    expect(view.state.doc.child(0).type.name).toBe('bullet_list');
    expect(view.state.doc.child(0).childCount).toBe(2);

    await editor.destroy();
  });

  it.each([
    'math_block',
    'mermaid',
    'table',
  ] as const)('removes only a selected %s block inside a list item', async (typeName) => {
    const editor = await createEditor('');
    const view = editor.ctx.get(editorViewCtx);
    const { schema } = view.state;
    replaceDocument(view, [
      schema.nodes.bullet_list.create(null, [
        schema.nodes.list_item.create(null, [
          schema.nodes.paragraph.create(null, schema.text('Item')),
          createPreviewBlockNode(view, typeName),
        ]),
        schema.nodes.list_item.create(null, [
          schema.nodes.paragraph.create(null, schema.text('Next')),
        ]),
      ]),
    ]);
    const blocks = collectSelectableBlockRanges(view.state.doc);
    const previewBlock = blocks.find((range) => view.state.doc.resolve(range.from).nodeAfter?.type.name === typeName);

    expect(previewBlock).toBeDefined();
    expect(deleteSelectedBlocks(view, [previewBlock!], (tr) => tr)).toBe(true);

    let hasDeletedType = false;
    view.state.doc.descendants((node) => {
      if (node.type.name === typeName) {
        hasDeletedType = true;
        return false;
      }
      return true;
    });

    expect(view.state.doc.textContent).toContain('Item');
    expect(view.state.doc.textContent).toContain('Next');
    expect(hasDeletedType).toBe(false);
    expect(view.state.doc.child(0).type.name).toBe('bullet_list');
    expect(view.state.doc.child(0).childCount).toBe(2);

    await editor.destroy();
  });

  it('removes a whole list item with its inner code block when the list item range is selected', async () => {
    const editor = await createEditor(['- Item', '  ```ts', '  console.log(1)', '  ```', '- Next'].join('\n'));
    const view = editor.ctx.get(editorViewCtx);
    const blocks = collectSelectableBlockRanges(view.state.doc);
    const listItem = blocks.find((range) => view.state.doc.resolve(range.from).nodeAfter?.type.name === 'list_item');

    expect(listItem).toBeDefined();
    expect(deleteSelectedBlocks(view, [listItem!], (tr) => tr)).toBe(true);

    expect(view.state.doc.textContent).not.toContain('Item');
    expect(view.state.doc.textContent).not.toContain('console.log');
    expect(view.state.doc.textContent).toContain('Next');
    expect(view.state.doc.child(0).type.name).toBe('bullet_list');
    expect(view.state.doc.child(0).childCount).toBe(1);

    await editor.destroy();
  });

  it('removes a selected empty paragraph between ordered and task lists', async () => {
    const editor = await createEditor('');
    const view = editor.ctx.get(editorViewCtx);
    replaceWithOrderedListGapAndTaskList(view);
    const blocks = collectSelectableBlockRanges(view.state.doc);

    expect(blocks).toHaveLength(3);
    expect(deleteSelectedBlocks(view, [blocks[1]], (tr) => tr)).toBe(true);

    expect(view.state.doc.childCount).toBe(2);
    expect(view.state.doc.child(0).type.name).toBe('ordered_list');
    expect(view.state.doc.child(1).type.name).toBe('bullet_list');
    expect(view.state.doc.child(0).textContent).toBe('1');
    expect(view.state.doc.child(1).textContent).toBe('1');
    expect(view.state.selection).toBeInstanceOf(TextSelection);

    await editor.destroy();
  });

  it('merges ordered lists after block-deleting the selected empty paragraph between them', async () => {
    const editor = await createEditor('');
    const view = editor.ctx.get(editorViewCtx);
    replaceWithOrderedListGapAndOrderedList(view);
    const blocks = collectSelectableBlockRanges(view.state.doc);

    expect(blocks).toHaveLength(3);
    expect(deleteSelectedBlocks(view, [blocks[1]], (tr) => tr)).toBe(true);

    expect(view.state.doc.childCount).toBe(1);
    const list = view.state.doc.child(0);
    expect(list.type.name).toBe('ordered_list');
    expect(list.childCount).toBe(2);
    expect(list.child(0).textContent).toBe('one');
    expect(list.child(1).textContent).toBe('two');
    expect(list.child(0).attrs.label).toBe('1.');
    expect(list.child(1).attrs.label).toBe('2.');
    expect(view.state.selection).toBeInstanceOf(TextSelection);

    await editor.destroy();
  });

  it('deletes a selected list gap placeholder instead of the following ordered item', async () => {
    const editor = await createEditor('');
    const view = editor.ctx.get(editorViewCtx);
    const { schema } = view.state;

    replaceDocument(view, [
      schema.nodes.ordered_list.create(null, [
        schema.nodes.list_item.create({ label: '1.', listType: 'ordered' }, [
          schema.nodes.paragraph.create(null, schema.text('1')),
        ]),
      ]),
      schema.nodes.bullet_list.create(null, [
        schema.nodes.list_item.create({ label: '•', listType: 'bullet' }, [
          schema.nodes.paragraph.create(null, schema.text('\u2800')),
        ]),
      ]),
      schema.nodes.ordered_list.create({ order: 3 }, [
        schema.nodes.list_item.create({ label: '3.', listType: 'ordered' }, [
          schema.nodes.paragraph.create(null, schema.text('3')),
        ]),
      ]),
    ]);

    const blocks = collectSelectableBlockRanges(view.state.doc);

    expect(blocks).toHaveLength(3);
    expect(view.state.doc.resolve(blocks[1].from).nodeAfter?.textContent).toBe('\u2800');
    expect(deleteSelectedBlocks(view, [blocks[1]], (tr) => tr)).toBe(true);

    expect(view.state.doc.childCount).toBe(1);
    expect(view.state.doc.child(0).type.name).toBe('ordered_list');
    expect(view.state.doc.child(0).childCount).toBe(2);
    expect(view.state.doc.child(0).child(0).textContent).toBe('1');
    expect(view.state.doc.child(0).child(1).textContent).toBe('3');

    await editor.destroy();
  });
});
