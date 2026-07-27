import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  Editor,
  defaultValueCtx,
  editorViewCtx,
  remarkStringifyOptionsCtx,
  serializerCtx,
} from '@milkdown/kit/core';
import type { EditorView } from '@milkdown/kit/prose/view';
import type { Node as ProseNode } from '@milkdown/kit/prose/model';
import { commonmark } from '@milkdown/kit/preset/commonmark';
import { gfm } from '@milkdown/kit/preset/gfm';
import { applyBlockMove } from './blockControlsMove';
import { getDraggableBlockRanges } from './blockControlsInteractions';
import { resolveBlockMoveContext } from './blockControlsMoveCore';
import type { BlockRange } from './blockSelectionUtils';
import { collectSelectableBlockRanges } from './blockUnitResolver';
import { notesRemarkStringifyOptions } from '../../config/stringifyOptions';
import { serializeEditorMarkdownSnapshot } from '../../utils/pendingMarkdownUpdate';
import { frontmatterPlugin } from '../frontmatter';
import { mathPlugin } from '../math';
import { mermaidPlugin } from '../mermaid';
import { createTableNodeFromPipeCells } from '../table/pipeTableShortcut';

async function createEditor(markdown: string) {
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
    .use(frontmatterPlugin)
    .use(mathPlugin)
    .use(mermaidPlugin);

  await editor.create();
  return editor;
}

afterEach(() => {
  document.body.innerHTML = '';
});

function normalizeMarkdown(markdown: string): string {
  return markdown.replace(/\n+$/, '');
}

function extractSemanticLines(markdown: string): string[] {
  return normalizeMarkdown(markdown)
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0)
    .map((line) => line.replace(/^\s*(?:[-+*]|\d+\.)\s+(?:\[(?: |x|X)\]\s+)?/, ''))
    .sort();
}

function expectSemanticContentPreserved(before: string, after: string): void {
  expect(extractSemanticLines(after)).toEqual(extractSemanticLines(before));
}

function expectSingleOccurrence(markdown: string, text: string): void {
  expect(markdown.match(new RegExp(text, 'g'))).toHaveLength(1);
}

function isCodeBlockRange(view: EditorView, range: { from: number }): boolean {
  try {
    return view.state.doc.resolve(range.from).nodeAfter?.type.name === 'code_block';
  } catch {
    return false;
  }
}

function replaceDocument(view: EditorView, nodes: ProseNode[]): void {
  view.dispatch(view.state.tr.replaceWith(0, view.state.doc.content.size, nodes));
}

function createParagraphNode(view: EditorView, text: string): ProseNode {
  return view.state.schema.nodes.paragraph.create(null, view.state.schema.text(text));
}

function createMarkdownBlankLineNode(view: EditorView): ProseNode {
  const htmlBlockType = view.state.schema.nodes.html_block;
  if (htmlBlockType) {
    return htmlBlockType.create({ value: '<!--vlaina-markdown-blank-line-->' });
  }
  return view.state.schema.nodes.paragraph.create();
}

function createRenderedHtmlBoundaryBlankLineNode(view: EditorView): ProseNode {
  const htmlBlockType = view.state.schema.nodes.html_block;
  if (htmlBlockType) {
    return htmlBlockType.create({ value: '<!--vlaina-rendered-html-boundary-blank-line-->' });
  }
  return view.state.schema.nodes.paragraph.create();
}

function findTopLevelBlockByText(view: EditorView, text: string): BlockRange {
  let result: BlockRange | null = null;
  view.state.doc.forEach((node, offset) => {
    if (result || node.textContent !== text) return;
    result = { from: offset, to: offset + node.nodeSize };
  });
  if (!result) {
    throw new Error(`Expected top-level block with text ${text}`);
  }
  return result;
}

function topLevelTextContents(view: EditorView): string[] {
  return Array.from({ length: view.state.doc.childCount }, (_, index) => (
    view.state.doc.child(index).textContent
  ));
}

function createPreviewBlockNode(view: EditorView, typeName: 'math_block' | 'mermaid' | 'table'): ProseNode {
  if (typeName === 'table') {
    const table = createTableNodeFromPipeCells(view.state.schema, ['A', 'B']);
    if (!table) {
      throw new Error('Expected table schema');
    }
    return table;
  }

  const nodeType = view.state.schema.nodes[typeName];
  if (!nodeType) {
    throw new Error(`Expected ${typeName} schema`);
  }

  return typeName === 'math_block'
    ? nodeType.create({ latex: 'x^2' })
    : nodeType.create({ code: 'graph TD\nA --> B' });
}

function hasDescendantOfType(node: ProseNode, typeName: string): boolean {
  let found = false;
  node.descendants((descendant) => {
    if (descendant.type.name === typeName) {
      found = true;
      return false;
    }
    return true;
  });
  return found;
}

describe('applyBlockMove content integrity', () => {
  it('reorders top-level paragraphs without duplicating or dropping content', async () => {
    const markdown = 'A\n\nB\n\nC';
    const editor = await createEditor(markdown);
    const view = editor.ctx.get(editorViewCtx);
    const serializer = editor.ctx.get(serializerCtx);
    const blocks = collectSelectableBlockRanges(view.state.doc);
    const userInputListener = vi.fn();

    view.dom.addEventListener('editor:block-user-input', userInputListener);

    expect(applyBlockMove(view, [blocks[0]], view.state.doc.content.size)).toBe(true);
    expect(userInputListener).toHaveBeenCalledTimes(1);
    expect(normalizeMarkdown(serializer(view.state.doc))).toBe('B\n\nC\n\nA');
    expectSemanticContentPreserved(markdown, serializer(view.state.doc));

    view.dom.removeEventListener('editor:block-user-input', userInputListener);
    await editor.destroy();
  });

  it('removes a redundant target markdown blank-line block for ordinary paragraph moves', async () => {
    const editor = await createEditor('');
    const view = editor.ctx.get(editorViewCtx);
    const serializer = editor.ctx.get(serializerCtx);

    replaceDocument(view, [
      createParagraphNode(view, 'A'),
      createMarkdownBlankLineNode(view),
      createParagraphNode(view, 'B'),
      createParagraphNode(view, 'C'),
    ]);

    const cBlock = findTopLevelBlockByText(view, 'C');
    const bBlock = findTopLevelBlockByText(view, 'B');
    expect(applyBlockMove(view, [cBlock], bBlock.from)).toBe(true);

    expect(topLevelTextContents(view)).toEqual(['A', 'C', 'B']);
    expect(normalizeMarkdown(serializer(view.state.doc))).toBe('A\n\nC\n\nB');

    await editor.destroy();
  });

  it('removes a redundant source markdown blank-line block for ordinary paragraph moves', async () => {
    const editor = await createEditor('');
    const view = editor.ctx.get(editorViewCtx);
    const serializer = editor.ctx.get(serializerCtx);

    replaceDocument(view, [
      createParagraphNode(view, 'A'),
      createMarkdownBlankLineNode(view),
      createParagraphNode(view, 'B'),
      createParagraphNode(view, 'C'),
    ]);

    const aBlock = findTopLevelBlockByText(view, 'A');
    expect(applyBlockMove(view, [aBlock], view.state.doc.content.size)).toBe(true);

    expect(topLevelTextContents(view)).toEqual(['B', 'C', 'A']);
    expect(normalizeMarkdown(serializer(view.state.doc))).toBe('B\n\nC\n\nA');

    await editor.destroy();
  });

  it('places the cursor at the end of a moved paragraph', async () => {
    const editor = await createEditor('A\n\nB\n\nC');
    const view = editor.ctx.get(editorViewCtx);
    const blocks = collectSelectableBlockRanges(view.state.doc);

    expect(applyBlockMove(view, [blocks[0]], view.state.doc.content.size)).toBe(true);
    expect(view.state.selection.empty).toBe(true);
    expect(view.state.selection.$from.parent.textContent).toBe('A');
    expect(view.state.selection.$from.parentOffset).toBe(1);

    await editor.destroy();
  });

  it('places the cursor at the end of the last moved paragraph for multi-block moves', async () => {
    const editor = await createEditor('A\n\nB\n\nC');
    const view = editor.ctx.get(editorViewCtx);
    const blocks = collectSelectableBlockRanges(view.state.doc);

    expect(applyBlockMove(view, [blocks[0], blocks[1]], view.state.doc.content.size)).toBe(true);
    expect(view.state.selection.empty).toBe(true);
    expect(view.state.selection.$from.parent.textContent).toBe('B');
    expect(view.state.selection.$from.parentOffset).toBe(1);

    await editor.destroy();
  });

  it('reorders hard-break paragraph line blocks within the same paragraph', async () => {
    const editor = await createEditor('A\\\nB\\\nC');
    const view = editor.ctx.get(editorViewCtx);
    const blocks = collectSelectableBlockRanges(view.state.doc);

    expect(blocks.length).toBeGreaterThanOrEqual(3);
    expect(applyBlockMove(view, [blocks[0]], blocks[1].to)).toBe(true);
    expect(view.state.doc.textBetween(0, view.state.doc.content.size, '\n', '\n')).toBe('B\nA\nC');

    await editor.destroy();
  });

  it('moves hard-break paragraph lines out to a regular block boundary', async () => {
    const editor = await createEditor('A\\\nB\\\nC\n\nTail');
    const view = editor.ctx.get(editorViewCtx);
    const serializer = editor.ctx.get(serializerCtx);
    const blocks = collectSelectableBlockRanges(view.state.doc);

    expect(blocks.length).toBeGreaterThanOrEqual(4);
    expect(applyBlockMove(view, [blocks[1]], view.state.doc.content.size)).toBe(true);
    expect(normalizeMarkdown(serializer(view.state.doc))).toBe('A\\\nC\n\nTail\n\nB');

    await editor.destroy();
  });

  it('moves regular blocks into a hard-break paragraph line boundary', async () => {
    const editor = await createEditor('A\\\nB\n\nTail');
    const view = editor.ctx.get(editorViewCtx);
    const serializer = editor.ctx.get(serializerCtx);
    const blocks = collectSelectableBlockRanges(view.state.doc);

    expect(blocks.length).toBeGreaterThanOrEqual(3);
    expect(applyBlockMove(view, [blocks[2]], blocks[1].from)).toBe(true);
    expect(normalizeMarkdown(serializer(view.state.doc))).toBe('A<br />\n\nTail\n\nB');

    await editor.destroy();
  });

  it('converts leading frontmatter to plain text when it is moved away from the top', async () => {
    const editor = await createEditor('Body\n\nTail');
    const view = editor.ctx.get(editorViewCtx);
    const serializer = editor.ctx.get(serializerCtx);
    const bodyNodes: ProseNode[] = [];
    view.state.doc.forEach((node) => {
      bodyNodes.push(node);
    });
    replaceDocument(view, [
      view.state.schema.nodes.frontmatter.create(null, view.state.schema.text('title: Demo')),
      createMarkdownBlankLineNode(view),
      ...bodyNodes,
    ]);

    const blocks = collectSelectableBlockRanges(view.state.doc);

    expect(view.state.doc.resolve(blocks[0].from).nodeAfter?.type.name).toBe('frontmatter');

    const draggedRanges = getDraggableBlockRanges(view, [blocks[0]]);
    expect(draggedRanges).toEqual([blocks[0]]);
    expect(applyBlockMove(view, draggedRanges, view.state.doc.content.size)).toBe(true);
    expect(Array.from({ length: view.state.doc.childCount }, (_, index) => (
      view.state.doc.child(index).type.name
    ))).toEqual(['paragraph', 'paragraph', 'html_block', 'paragraph']);
    expect(Array.from({ length: view.state.doc.childCount }, (_, index) => (
      view.state.doc.child(index).textContent
    ))).toEqual(['Body', 'Tail', '', 'title: Demo']);
    expect(serializeEditorMarkdownSnapshot(serializer(view.state.doc), 'Body\n\nTail')).toBe(
      'Body\nTail\n\ntitle: Demo',
    );

    const movedBlocks = collectSelectableBlockRanges(view.state.doc);
    expect(applyBlockMove(view, movedBlocks.slice(-1), 0)).toBe(true);
    expect(view.state.doc.child(0).type.name).toBe('paragraph');
    expect(view.state.doc.child(0).textContent).toBe('title: Demo');
    expect(normalizeMarkdown(serializer(view.state.doc))).not.toContain('---');

    await editor.destroy();
  });

  it('keeps managed frontmatter when visible frontmatter text is moved into the body', async () => {
    const referenceMarkdown = [
      '---',
      'hi',
      '',
      'vlaina_cover: "./assets/13.jpg" x=50 y=38.56146469049695 height=200 scale=1',
      'vlaina_icon: "hero"',
      '---',
      '1',
      '',
      '2',
    ].join('\n');
    const editor = await createEditor('1\n\n2');
    const view = editor.ctx.get(editorViewCtx);
    const serializer = editor.ctx.get(serializerCtx);
    const userInputListener = vi.fn();
    const bodyNodes: ProseNode[] = [];
    view.state.doc.forEach((node) => {
      bodyNodes.push(node);
    });
    replaceDocument(view, [
      view.state.schema.nodes.frontmatter.create(null, view.state.schema.text('hi')),
      ...bodyNodes,
    ]);

    let twoFrom = 0;
    view.state.doc.forEach((node, offset) => {
      if (node.textContent === '2') {
        twoFrom = offset;
      }
    });
    const blocks = collectSelectableBlockRanges(view.state.doc);

    expect(view.state.doc.resolve(blocks[0].from).nodeAfter?.type.name).toBe('frontmatter');
    expect(view.state.doc.resolve(blocks[0].from).nodeAfter?.textContent).toBe('hi');

    const draggedRanges = getDraggableBlockRanges(view, [blocks[0]]);
    view.dom.addEventListener('editor:block-user-input', userInputListener);

    expect(applyBlockMove(view, draggedRanges, twoFrom)).toBe(true);
    expect(userInputListener).toHaveBeenCalledTimes(1);
    expect(serializer(view.state.doc).match(/vlaina-markdown-blank-line/g)).toHaveLength(2);
    expect(normalizeMarkdown(serializeEditorMarkdownSnapshot(serializer(view.state.doc), referenceMarkdown))).toBe([
      '---',
      'vlaina_cover: "./assets/13.jpg" x=50 y=38.56146469049695 height=200 scale=1',
      'vlaina_icon: "hero"',
      '---',
      '1',
      '',
      'hi',
      '',
      '2',
    ].join('\n'));

    view.dom.removeEventListener('editor:block-user-input', userInputListener);
    await editor.destroy();
  });

  it('keeps paragraph boundaries when moved frontmatter becomes body text', async () => {
    const referenceMarkdown = [
      '---',
      'hi',
      '',
      'vlaina_cover: "./assets/13.jpg" x=50 y=38.56146469049695 height=200 scale=1',
      'vlaina_icon: "hero"',
      '---',
      '1',
      '',
      '2',
    ].join('\n');
    const editor = await createEditor('');
    const view = editor.ctx.get(editorViewCtx);
    const serializer = editor.ctx.get(serializerCtx);

    replaceDocument(view, [
      view.state.schema.nodes.frontmatter.create(null, view.state.schema.text('hi')),
      createParagraphNode(view, '1'),
      createRenderedHtmlBoundaryBlankLineNode(view),
      createParagraphNode(view, '2'),
    ]);

    const blocks = collectSelectableBlockRanges(view.state.doc);
    const draggedRanges = getDraggableBlockRanges(view, [blocks[0]]);
    const twoBlock = findTopLevelBlockByText(view, '2');

    expect(applyBlockMove(view, draggedRanges, twoBlock.from)).toBe(true);
    expect(topLevelTextContents(view)).toEqual(['1', '', 'hi', '', '2']);
    expect(normalizeMarkdown(serializeEditorMarkdownSnapshot(serializer(view.state.doc), referenceMarkdown))).toBe([
      '---',
      'vlaina_cover: "./assets/13.jpg" x=50 y=38.56146469049695 height=200 scale=1',
      'vlaina_icon: "hero"',
      '---',
      '1',
      '',
      'hi',
      '',
      '2',
    ].join('\n'));

    await editor.destroy();
  });

  it('reorders adjacent list items without changing the item set', async () => {
    const markdown = '- A\n- B\n- C';
    const editor = await createEditor(markdown);
    const view = editor.ctx.get(editorViewCtx);
    const serializer = editor.ctx.get(serializerCtx);
    const blocks = collectSelectableBlockRanges(view.state.doc);

    expect(applyBlockMove(view, [blocks[0], blocks[1]], view.state.doc.content.size)).toBe(true);
    expectSemanticContentPreserved(markdown, serializer(view.state.doc));

    await editor.destroy();
  });

  it('moves a parent list item head without duplicating or losing its child item', async () => {
    const markdown = '- Parent\n  - Child\n- Sibling';
    const editor = await createEditor(markdown);
    const view = editor.ctx.get(editorViewCtx);
    const serializer = editor.ctx.get(serializerCtx);
    const blocks = collectSelectableBlockRanges(view.state.doc);

    expect(blocks).toHaveLength(3);
    expect(applyBlockMove(view, [blocks[0]], view.state.doc.content.size)).toBe(true);
    const nextMarkdown = normalizeMarkdown(serializer(view.state.doc));
    expectSemanticContentPreserved(markdown, nextMarkdown);
    expectSingleOccurrence(nextMarkdown, 'Parent');
    expectSingleOccurrence(nextMarkdown, 'Child');
    expectSingleOccurrence(nextMarkdown, 'Sibling');

    await editor.destroy();
  });

  it('moves a parent block together with its nested child exactly once', async () => {
    const markdown = '- Parent\n  - Child\n- Sibling';
    const editor = await createEditor(markdown);
    const view = editor.ctx.get(editorViewCtx);
    const serializer = editor.ctx.get(serializerCtx);
    const blocks = collectSelectableBlockRanges(view.state.doc);

    expect(blocks).toHaveLength(3);
    expect(applyBlockMove(view, [blocks[0], blocks[1]], view.state.doc.content.size)).toBe(true);
    const nextMarkdown = normalizeMarkdown(serializer(view.state.doc));
    expectSemanticContentPreserved(markdown, nextMarkdown);
    expectSingleOccurrence(nextMarkdown, 'Parent');
    expectSingleOccurrence(nextMarkdown, 'Child');
    expectSingleOccurrence(nextMarkdown, 'Sibling');
    expect(nextMarkdown).toMatch(/\n\s+(?:[-+*]|\d+\.)\s+Child/);

    await editor.destroy();
  });

  it('moves a parent block with multiple nested children without duplicating any child', async () => {
    const markdown = '- Parent\n  - Child A\n  - Child B\n- Sibling';
    const editor = await createEditor(markdown);
    const view = editor.ctx.get(editorViewCtx);
    const serializer = editor.ctx.get(serializerCtx);
    const blocks = collectSelectableBlockRanges(view.state.doc);
    expect(blocks).toHaveLength(4);
    expect(applyBlockMove(view, [blocks[0], blocks[1], blocks[2]], view.state.doc.content.size)).toBe(true);
    const nextMarkdown = normalizeMarkdown(serializer(view.state.doc));
    expectSemanticContentPreserved(markdown, nextMarkdown);
    expectSingleOccurrence(nextMarkdown, 'Parent');
    expectSingleOccurrence(nextMarkdown, 'Child A');
    expectSingleOccurrence(nextMarkdown, 'Child B');
    expectSingleOccurrence(nextMarkdown, 'Sibling');
    expect(nextMarkdown).toMatch(/\n\s+(?:[-+*]|\d+\.)\s+Child A/);
    expect(nextMarkdown).toMatch(/\n\s+(?:[-+*]|\d+\.)\s+Child B/);

    await editor.destroy();
  });

  it('moves mixed paragraph and list selections without changing semantic content', async () => {
    const markdown = 'Intro\n\nMiddle\n\n- Parent\n  - Child\n\nOutro';
    const editor = await createEditor(markdown);
    const view = editor.ctx.get(editorViewCtx);
    const serializer = editor.ctx.get(serializerCtx);
    const blocks = collectSelectableBlockRanges(view.state.doc);
    expect(blocks).toHaveLength(5);
    const draggedRanges = getDraggableBlockRanges(view, [blocks[1], blocks[2], blocks[3]]);
    const originalDraggedRanges = draggedRanges.map((range) => ({ ...range }));
    expect(resolveBlockMoveContext(view, draggedRanges, view.state.doc.content.size)).not.toBeNull();
    expect(draggedRanges).toEqual(originalDraggedRanges);

    expect(applyBlockMove(view, draggedRanges, view.state.doc.content.size)).toBe(true);
    const nextMarkdown = normalizeMarkdown(serializer(view.state.doc));
    expectSemanticContentPreserved(markdown, nextMarkdown);
    expectSingleOccurrence(nextMarkdown, 'Middle');
    expectSingleOccurrence(nextMarkdown, 'Parent');
    expectSingleOccurrence(nextMarkdown, 'Child');
    expectSingleOccurrence(nextMarkdown, 'Intro');
    expectSingleOccurrence(nextMarkdown, 'Outro');

    await editor.destroy();
  });

  it('drags a code block out of a list item without moving the list item', async () => {
    const markdown = '- Item\n  ```ts\n  console.log(1)\n  ```\n\nTail';
    const editor = await createEditor(markdown);
    const view = editor.ctx.get(editorViewCtx);
    const serializer = editor.ctx.get(serializerCtx);
    const blocks = collectSelectableBlockRanges(view.state.doc);
    const codeBlock = blocks.find((range) => isCodeBlockRange(view, range));

    expect(codeBlock).toBeDefined();
    const draggedRanges = getDraggableBlockRanges(view, [codeBlock!]);
    expect(draggedRanges).toEqual([codeBlock]);

    expect(applyBlockMove(view, draggedRanges, view.state.doc.content.size)).toBe(true);
    const nextMarkdown = normalizeMarkdown(serializer(view.state.doc));
    expect(nextMarkdown).toContain('- Item');
    expect(nextMarkdown).toContain('Tail');
    expect(nextMarkdown).toContain('```ts\nconsole.log(1)\n```');
    expect(nextMarkdown.indexOf('- Item')).toBeLessThan(nextMarkdown.indexOf('Tail'));
    expect(nextMarkdown.indexOf('Tail')).toBeLessThan(nextMarkdown.indexOf('```ts'));

    await editor.destroy();
  });

  it.each([
    'math_block',
    'mermaid',
    'table',
  ] as const)('drags a %s block out of a list item without moving the list item', async (typeName) => {
    const editor = await createEditor('');
    const view = editor.ctx.get(editorViewCtx);
    const { schema } = view.state;
    replaceDocument(view, [
      schema.nodes.bullet_list.create(null, [
        schema.nodes.list_item.create(null, [
          schema.nodes.paragraph.create(null, schema.text('Item')),
          createPreviewBlockNode(view, typeName),
        ]),
      ]),
      schema.nodes.paragraph.create(null, schema.text('Tail')),
    ]);
    const blocks = collectSelectableBlockRanges(view.state.doc);
    const previewBlock = blocks.find((range) => view.state.doc.resolve(range.from).nodeAfter?.type.name === typeName);

    expect(previewBlock).toBeDefined();
    const draggedRanges = getDraggableBlockRanges(view, [previewBlock!]);
    expect(draggedRanges).toEqual([previewBlock]);

    expect(applyBlockMove(view, draggedRanges, view.state.doc.content.size)).toBe(true);
    expect(view.state.doc.child(0).type.name).toBe('bullet_list');
    expect(view.state.doc.child(0).textContent).toContain('Item');
    expect(hasDescendantOfType(view.state.doc.child(0), typeName)).toBe(false);
    expect(view.state.doc.child(1).type.name).toBe('paragraph');
    expect(view.state.doc.child(1).textContent).toBe('Tail');
    expect(view.state.doc.child(2).type.name).toBe(typeName);

    await editor.destroy();
  });

  it('drags a whole list item with its code block when the list item range is selected', async () => {
    const markdown = '- Item\n  ```ts\n  console.log(1)\n  ```\n\nTail';
    const editor = await createEditor(markdown);
    const view = editor.ctx.get(editorViewCtx);
    const serializer = editor.ctx.get(serializerCtx);
    const blocks = collectSelectableBlockRanges(view.state.doc);
    const listItem = blocks.find((range) => {
      try {
        return view.state.doc.resolve(range.from).nodeAfter?.type.name === 'list_item';
      } catch {
        return false;
      }
    });

    expect(listItem).toBeDefined();
    const draggedRanges = getDraggableBlockRanges(view, [listItem!]);
    expect(draggedRanges).toEqual([listItem]);

    expect(applyBlockMove(view, draggedRanges, view.state.doc.content.size)).toBe(true);
    const nextMarkdown = normalizeMarkdown(serializer(view.state.doc));
    expect(nextMarkdown).toContain('Tail');
    expect(nextMarkdown).toContain('- Item');
    expect(nextMarkdown).toContain('```ts');
    expect(nextMarkdown).toContain('console.log(1)');
    expect(nextMarkdown.indexOf('Tail')).toBeLessThan(nextMarkdown.indexOf('- Item'));
    expect(nextMarkdown.indexOf('- Item')).toBeLessThan(nextMarkdown.indexOf('```ts'));

    await editor.destroy();
  });
});
