import { describe, expect, it, vi } from 'vitest';
import { Editor, defaultValueCtx, editorViewCtx } from '@milkdown/kit/core';
import type { Node as ProseNode } from '@milkdown/kit/prose/model';
import { NodeSelection, TextSelection } from '@milkdown/kit/prose/state';
import type { EditorView } from '@milkdown/kit/prose/view';
import { commonmark } from '@milkdown/kit/preset/commonmark';
import { gfm } from '@milkdown/kit/preset/gfm';
import { EDITABLE_LIST_GAP_PLACEHOLDER } from '../task-list/listTabIndentPlugin';
import { createTableNodeFromPipeCells } from '../table/pipeTableShortcut';
import {
  appendMarkdownBlankLineNodeSelectionRecoveryTransaction,
  MAX_MARKDOWN_BLANK_LINE_NODE_POS_SCAN_NODES,
  createEditableMarkdownBlankLineDecorations,
  findEditableMarkdownBlankLineElement,
  handleMarkdownBlankLineDeletion,
  handleMarkdownBlankLineKeyboardNavigation,
  isEditableMarkdownBlankLineNode,
  resolveMarkdownBlankLineTargetAtCoords,
  resolveMarkdownBlankLineNodePos,
} from './markdownBlankLineInteraction';

const MARKDOWN_BLANK_LINE_VALUE = '<!--vlaina-markdown-blank-line-->';
const RENDERED_HTML_BOUNDARY_BLANK_LINE_VALUE = '<!--vlaina-rendered-html-boundary-blank-line-->';
const EDITABLE_MARKDOWN_BLANK_LINE_PLACEHOLDER = '\u200B';

async function createEditor(markdown: string) {
  const editor = Editor.make()
    .config((ctx) => {
      ctx.set(defaultValueCtx, markdown);
    })
    .use(commonmark)
    .use(gfm);

  await editor.create();
  return editor;
}

function replaceDocument(view: EditorView, nodes: ProseNode[]): void {
  view.dispatch(view.state.tr.replaceWith(0, view.state.doc.content.size, nodes));
}

function replaceWithBlankLineDocument(view: EditorView): void {
  const { schema } = view.state;
  const paragraphType = schema.nodes.paragraph;
  const htmlBlockType = schema.nodes.html_block;
  if (!paragraphType || !htmlBlockType) {
    throw new Error('Expected paragraph and html_block schema nodes');
  }

  replaceDocument(view, [
    paragraphType.create(null, schema.text('Alpha')),
    htmlBlockType.create({ value: MARKDOWN_BLANK_LINE_VALUE }),
    paragraphType.create(null, schema.text('Beta')),
  ]);
}

function createEditableBlankLineParagraph(view: EditorView): ProseNode {
  const { schema } = view.state;
  const paragraphType = schema.nodes.paragraph;
  if (!paragraphType) {
    throw new Error('Expected paragraph schema node');
  }

  return paragraphType.create(null, schema.text(EDITABLE_MARKDOWN_BLANK_LINE_PLACEHOLDER));
}

function replaceWithEditableBlankLineDocument(view: EditorView): void {
  const { schema } = view.state;
  const paragraphType = schema.nodes.paragraph;
  if (!paragraphType) {
    throw new Error('Expected paragraph schema node');
  }

  replaceDocument(view, [
    paragraphType.create(null, schema.text('Alpha')),
    createEditableBlankLineParagraph(view),
    paragraphType.create(null, schema.text('Beta')),
  ]);
}

function replaceWithHtmlBlockAndEditableBlankLineDocument(view: EditorView): void {
  const { schema } = view.state;
  const paragraphType = schema.nodes.paragraph;
  const htmlBlockType = schema.nodes.html_block;
  if (!paragraphType || !htmlBlockType) {
    throw new Error('Expected paragraph and html_block schema nodes');
  }

  replaceDocument(view, [
    htmlBlockType.create({ value: '<p>HTML</p>' }),
    createEditableBlankLineParagraph(view),
    paragraphType.create(null, schema.text('Beta')),
  ]);
}

function replaceWithListAndEditableBlankLineDocument(view: EditorView): void {
  const { schema } = view.state;
  const paragraphType = schema.nodes.paragraph;
  const listItemType = schema.nodes.list_item;
  const bulletListType = schema.nodes.bullet_list;
  if (!paragraphType || !listItemType || !bulletListType) {
    throw new Error('Expected list schema nodes');
  }

  replaceDocument(view, [
    bulletListType.create(null, [
      listItemType.create(null, [
        paragraphType.create(null, schema.text('List item')),
      ]),
    ]),
    createEditableBlankLineParagraph(view),
    paragraphType.create(null, schema.text('Beta')),
  ]);
}

function replaceWithPersistedAndEditableBlankLineDocument(view: EditorView): void {
  const { schema } = view.state;
  const paragraphType = schema.nodes.paragraph;
  const htmlBlockType = schema.nodes.html_block;
  if (!paragraphType || !htmlBlockType) {
    throw new Error('Expected paragraph and html_block schema nodes');
  }

  replaceDocument(view, [
    paragraphType.create(null, schema.text('Alpha')),
    htmlBlockType.create({ value: MARKDOWN_BLANK_LINE_VALUE }),
    createEditableBlankLineParagraph(view),
    paragraphType.create(null, schema.text('Beta')),
  ]);
}

function replaceWithLeadingEditableAndPersistedBlankLineDocument(view: EditorView): void {
  const { schema } = view.state;
  const paragraphType = schema.nodes.paragraph;
  const htmlBlockType = schema.nodes.html_block;
  if (!paragraphType || !htmlBlockType) {
    throw new Error('Expected paragraph and html_block schema nodes');
  }

  replaceDocument(view, [
    createEditableBlankLineParagraph(view),
    htmlBlockType.create({ value: MARKDOWN_BLANK_LINE_VALUE }),
    paragraphType.create(null, schema.text('Beta')),
  ]);
}

function replaceWithLeadingEmptyAndPersistedBlankLineDocument(view: EditorView): void {
  const { schema } = view.state;
  const paragraphType = schema.nodes.paragraph;
  const htmlBlockType = schema.nodes.html_block;
  if (!paragraphType || !htmlBlockType) {
    throw new Error('Expected paragraph and html_block schema nodes');
  }

  replaceDocument(view, [
    paragraphType.create(),
    htmlBlockType.create({ value: MARKDOWN_BLANK_LINE_VALUE }),
    paragraphType.create(null, schema.text('Beta')),
  ]);
}

function createBlockquote(view: EditorView, text: string): ProseNode {
  const { schema } = view.state;
  const paragraphType = schema.nodes.paragraph;
  const blockquoteType = schema.nodes.blockquote;
  if (!paragraphType || !blockquoteType) {
    throw new Error('Expected paragraph and blockquote schema nodes');
  }

  return blockquoteType.create(null, paragraphType.create(null, schema.text(text)));
}

function createNestedBlockquote(view: EditorView): ProseNode {
  const { schema } = view.state;
  const paragraphType = schema.nodes.paragraph;
  const blockquoteType = schema.nodes.blockquote;
  if (!paragraphType || !blockquoteType) {
    throw new Error('Expected paragraph and blockquote schema nodes');
  }

  return blockquoteType.create(null, [
    paragraphType.create(null, schema.text('h')),
    blockquoteType.create(null, paragraphType.create(null, schema.text('i'))),
  ]);
}

function createMarkdownBlankLine(view: EditorView): ProseNode {
  const htmlBlockType = view.state.schema.nodes.html_block;
  if (!htmlBlockType) {
    throw new Error('Expected html_block schema node');
  }

  return htmlBlockType.create({ value: MARKDOWN_BLANK_LINE_VALUE });
}

function createHeading(view: EditorView, text: string, level = 1): ProseNode {
  const headingType = view.state.schema.nodes.heading;
  if (!headingType) {
    throw new Error('Expected heading schema node');
  }

  return headingType.create({ level }, view.state.schema.text(text));
}

function createBulletList(view: EditorView): ProseNode | null {
  const { schema } = view.state;
  const { bullet_list: bulletListType, list_item: listItemType, paragraph: paragraphType } = schema.nodes;
  if (!bulletListType || !listItemType || !paragraphType) return null;

  return bulletListType.create(null, [
    listItemType.create(null, [
      paragraphType.create(null, schema.text('Bullet item')),
    ]),
  ]);
}

function createOrderedList(view: EditorView): ProseNode | null {
  const { schema } = view.state;
  const { ordered_list: orderedListType, list_item: listItemType, paragraph: paragraphType } = schema.nodes;
  if (!orderedListType || !listItemType || !paragraphType) return null;

  return orderedListType.create(null, [
    listItemType.create(null, [
      paragraphType.create(null, schema.text('Ordered item')),
    ]),
  ]);
}

function createOrderedListGap(view: EditorView): ProseNode {
  const { schema } = view.state;
  const { ordered_list: orderedListType, list_item: listItemType, paragraph: paragraphType } = schema.nodes;
  if (!orderedListType || !listItemType || !paragraphType) {
    throw new Error('Expected ordered list schema nodes');
  }

  return orderedListType.create(null, [
    listItemType.create({ label: '1.', listType: 'ordered' }, [
      paragraphType.create(null, schema.text(EDITABLE_LIST_GAP_PLACEHOLDER)),
    ]),
  ]);
}

function createSupportedStructuralBlockCases(view: EditorView): Array<{
  label: string;
  typeName: string;
  node: ProseNode;
}> {
  const { schema } = view.state;
  const cases: Array<{ label: string; typeName: string; node: ProseNode }> = [];
  const add = (label: string, typeName: string, node: ProseNode | null | undefined) => {
    if (node) cases.push({ label, typeName, node });
  };

  add('heading', 'heading', createHeading(view, 'Structural heading'));
  add('blockquote', 'blockquote', schema.nodes.blockquote?.create(null, [
    schema.nodes.paragraph.create(null, schema.text('Quote')),
  ]));
  add('hr', 'hr', schema.nodes.hr?.create());
  add('html_block', 'html_block', schema.nodes.html_block?.create({ value: '<div>HTML</div>' }));
  add('code_block', 'code_block', schema.nodes.code_block?.create(null, schema.text('const value = 1;')));
  add('bullet_list', 'bullet_list', createBulletList(view));
  add('ordered_list', 'ordered_list', createOrderedList(view));
  add('table', 'table', createTableNodeFromPipeCells(schema, ['A', 'B']));

  return cases;
}

function replaceWithBlankLineBeforeBlockquoteDocument(view: EditorView): void {
  replaceDocument(view, [
    createMarkdownBlankLine(view),
    createBlockquote(view, 'Quote'),
  ]);
}

function replaceWithBlankLineAfterBlockquoteDocument(view: EditorView): void {
  replaceDocument(view, [
    createBlockquote(view, 'Quote'),
    createMarkdownBlankLine(view),
  ]);
}

function replaceWithNestedBlockquoteAndEditableBlankLineDocument(view: EditorView): void {
  replaceDocument(view, [
    createNestedBlockquote(view),
    createEditableBlankLineParagraph(view),
  ]);
}

function topLevelNodePos(view: EditorView, matcher: (node: ProseNode) => boolean, occurrence = 0): number {
  let seen = 0;
  let found: number | null = null;
  view.state.doc.forEach((node, offset) => {
    if (found !== null || !matcher(node)) return;
    if (seen === occurrence) {
      found = offset;
      return;
    }
    seen += 1;
  });
  if (found === null) {
    throw new Error('Expected matching top-level node');
  }
  return found;
}

function createArrowEvent(key: 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight'): KeyboardEvent {
  return new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
  });
}

function createDeleteEvent(key: 'Backspace' | 'Delete'): KeyboardEvent {
  return new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
  });
}

function blockquoteTextStartPos(view: EditorView): number {
  const blockquotePos = topLevelNodePos(view, (node) => node.type.name === 'blockquote');
  return blockquotePos + 2;
}

describe('markdownBlankLineInteraction', () => {
  it('caches editable markdown blank line decorations for the same doc instance', async () => {
    const editor = await createEditor('Alpha');
    const view = editor.ctx.get(editorViewCtx);

    const first = createEditableMarkdownBlankLineDecorations(view.state.doc);
    const second = createEditableMarkdownBlankLineDecorations(view.state.doc);

    expect(second).toBe(first);

    await editor.destroy();
  });

  it('detects editable blank line nodes without aggregating paragraph textContent', () => {
    const paragraph = {
      content: { size: EDITABLE_MARKDOWN_BLANK_LINE_PLACEHOLDER.length },
      nodeSize: 3,
      textBetween: vi.fn(() => EDITABLE_MARKDOWN_BLANK_LINE_PLACEHOLDER),
      type: { name: 'paragraph' },
      get textContent() {
        throw new Error('aggregate paragraph textContent should not be read');
      },
    };

    expect(isEditableMarkdownBlankLineNode(paragraph)).toBe(true);
    expect(paragraph.textBetween).toHaveBeenCalledWith(0, EDITABLE_MARKDOWN_BLANK_LINE_PLACEHOLDER.length, '\0', '\0');
  });

  it('finds editable blank line paragraphs without materializing all root children', () => {
    const root = document.createElement('div');
    root.appendChild(document.createElement('div'));
    const blankLine = document.createElement('p');
    blankLine.textContent = EDITABLE_MARKDOWN_BLANK_LINE_PLACEHOLDER;
    root.appendChild(blankLine);

    const arrayFrom = vi.spyOn(Array, 'from').mockImplementation(() => {
      throw new Error('Array.from should not be used for root children');
    });

    const result = findEditableMarkdownBlankLineElement(root);
    arrayFrom.mockRestore();

    expect(result).toBe(blankLine);
  });

  it('resolves pointer-events-none markdown blank line targets by click coordinates', () => {
    const root = document.createElement('div');
    const precedingBlock = document.createElement('ol');
    const firstBlankLine = document.createElement('div');
    firstBlankLine.setAttribute('data-type', 'html-block');
    firstBlankLine.setAttribute('data-value', MARKDOWN_BLANK_LINE_VALUE);
    const secondBlankLine = document.createElement('div');
    secondBlankLine.setAttribute('data-type', 'html-block');
    secondBlankLine.setAttribute('data-value', MARKDOWN_BLANK_LINE_VALUE);
    root.append(precedingBlock, firstBlankLine, secondBlankLine);
    const rectSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function getRect(this: HTMLElement) {
      if (this === root) {
        return {
          x: 0,
          y: 0,
          top: 0,
          left: 0,
          right: 500,
          bottom: 200,
          width: 500,
          height: 200,
          toJSON: () => ({}),
        } as DOMRect;
      }
      if (this === firstBlankLine) {
        return {
          x: 10,
          y: 20,
          top: 20,
          left: 10,
          right: 310,
          bottom: 44,
          width: 300,
          height: 24,
          toJSON: () => ({}),
        } as DOMRect;
      }
      if (this === precedingBlock) {
        return {
          x: 10,
          y: 0,
          top: 0,
          left: 10,
          right: 310,
          bottom: 12,
          width: 300,
          height: 12,
          toJSON: () => ({}),
        } as DOMRect;
      }
      if (this === secondBlankLine) {
        return {
          x: 10,
          y: 60,
          top: 60,
          left: 10,
          right: 310,
          bottom: 84,
          width: 300,
          height: 24,
          toJSON: () => ({}),
        } as DOMRect;
      }
      return {
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: 0,
        height: 0,
        toJSON: () => ({}),
      } as DOMRect;
    });

    try {
      expect(resolveMarkdownBlankLineTargetAtCoords({ dom: root } as any, 120, 14)).toBe(firstBlankLine);
      expect(resolveMarkdownBlankLineTargetAtCoords({ dom: root } as any, 120, 32)).toBe(firstBlankLine);
      expect(resolveMarkdownBlankLineTargetAtCoords({ dom: root } as any, 4, 32)).toBe(firstBlankLine);
      expect(resolveMarkdownBlankLineTargetAtCoords({ dom: root } as any, 496, 32)).toBe(firstBlankLine);
      expect(resolveMarkdownBlankLineTargetAtCoords({ dom: root } as any, 120, 72)).toBe(secondBlankLine);
      expect(resolveMarkdownBlankLineTargetAtCoords({ dom: root } as any, 496, 72)).toBe(secondBlankLine);
      expect(resolveMarkdownBlankLineTargetAtCoords({ dom: root } as any, 120, 120)).toBeNull();
      expect(resolveMarkdownBlankLineTargetAtCoords({ dom: root } as any, 520, 32)).toBeNull();
    } finally {
      rectSpy.mockRestore();
    }
  });

  it('resolves markdown blank line clicks through editor width when the blank line has no own width', () => {
    const root = document.createElement('div');
    const blankLine = document.createElement('div');
    blankLine.setAttribute('data-type', 'html-block');
    blankLine.setAttribute('data-value', MARKDOWN_BLANK_LINE_VALUE);
    root.append(blankLine);

    const rectSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function getRect(this: HTMLElement) {
      if (this === root) {
        return {
          x: 0,
          y: 0,
          top: 0,
          left: 0,
          right: 500,
          bottom: 200,
          width: 500,
          height: 200,
          toJSON: () => ({}),
        } as DOMRect;
      }
      if (this === blankLine) {
        return {
          x: 10,
          y: 20,
          top: 20,
          left: 10,
          right: 10,
          bottom: 44,
          width: 0,
          height: 24,
          toJSON: () => ({}),
        } as DOMRect;
      }
      return {
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: 0,
        height: 0,
        toJSON: () => ({}),
      } as DOMRect;
    });

    try {
      expect(resolveMarkdownBlankLineTargetAtCoords({ dom: root } as any, 250, 32)).toBe(blankLine);
    } finally {
      rectSpy.mockRestore();
    }
  });

  it('does not scan distant blank lines for an internal text target', () => {
    const root = document.createElement('div');
    const paragraph = document.createElement('p');
    const paragraphText = document.createElement('span');
    paragraph.append(paragraphText);
    const separator = document.createElement('div');
    const blankLine = document.createElement('div');
    blankLine.setAttribute('data-type', 'html-block');
    blankLine.setAttribute('data-value', MARKDOWN_BLANK_LINE_VALUE);
    root.append(paragraph, separator, blankLine);
    const blankLineRect = vi.spyOn(blankLine, 'getBoundingClientRect');

    expect(resolveMarkdownBlankLineTargetAtCoords(
      { dom: root } as any,
      120,
      32,
      paragraphText,
    )).toBeNull();
    expect(blankLineRect).not.toHaveBeenCalled();
  });

  it('stops fallback document scanning after resolving the matching blank line DOM node', () => {
    const blankLine = document.createElement('div');
    const otherBlankLine = document.createElement('div');
    const accessedChildren: number[] = [];
    const nodes = [
      {
        attrs: {},
        nodeSize: 2,
        type: { name: 'paragraph' },
      },
      {
        attrs: { value: MARKDOWN_BLANK_LINE_VALUE },
        nodeSize: 1,
        type: { name: 'html_block' },
      },
      {
        attrs: { value: MARKDOWN_BLANK_LINE_VALUE },
        nodeSize: 1,
        type: { name: 'html_block' },
      },
    ];
    const doc = {
      child(index: number) {
        accessedChildren.push(index);
        if (index >= 2) {
          throw new Error('Document scan should stop after the matching node');
        }
        return nodes[index];
      },
      childCount: nodes.length,
      nodeAt: vi.fn(),
    };
    const view = {
      nodeDOM(pos: number) {
        return pos === 2 ? blankLine : otherBlankLine;
      },
      posAtDOM: vi.fn(() => {
        throw new Error('Force fallback scan');
      }),
      state: { doc },
    };

    expect(resolveMarkdownBlankLineNodePos(view as any, blankLine)).toBe(2);
    expect(accessedChildren).toEqual([0, 1]);
  });

  it('resolves rendered HTML boundary blank line placeholder node positions', () => {
    const blankLine = document.createElement('div');
    const node = {
      attrs: { value: RENDERED_HTML_BOUNDARY_BLANK_LINE_VALUE },
      nodeSize: 1,
      type: { name: 'html_block' },
    };
    const view = {
      nodeDOM: vi.fn(() => blankLine),
      posAtDOM: vi.fn(() => 2),
      state: {
        doc: {
          nodeAt: vi.fn(() => node),
        },
      },
    };

    expect(resolveMarkdownBlankLineNodePos(view as any, blankLine)).toBe(2);
  });

  it('resolves rendered HTML boundary blank line placeholder positions during fallback scans', () => {
    const blankLine = document.createElement('div');
    const otherBlankLine = document.createElement('div');
    const nodes = [
      {
        attrs: {},
        nodeSize: 2,
        type: { name: 'paragraph' },
      },
      {
        attrs: { value: RENDERED_HTML_BOUNDARY_BLANK_LINE_VALUE },
        nodeSize: 1,
        type: { name: 'html_block' },
      },
    ];
    const doc = {
      child(index: number) {
        return nodes[index];
      },
      childCount: nodes.length,
      nodeAt: vi.fn(),
    };
    const view = {
      nodeDOM(pos: number) {
        return pos === 2 ? blankLine : otherBlankLine;
      },
      posAtDOM: vi.fn(() => {
        throw new Error('Force fallback scan');
      }),
      state: { doc },
    };

    expect(resolveMarkdownBlankLineNodePos(view as any, blankLine)).toBe(2);
  });

  it('caps fallback blank line node position scans by node count', () => {
    const blankLine = document.createElement('div');
    let accessed = 0;
    const doc = {
      child(index: number) {
        accessed += 1;
        if (index < MAX_MARKDOWN_BLANK_LINE_NODE_POS_SCAN_NODES) {
          return {
            attrs: {},
            nodeSize: 1,
            type: { name: 'paragraph' },
          };
        }
        return {
          attrs: { value: MARKDOWN_BLANK_LINE_VALUE },
          nodeSize: 1,
          type: { name: 'html_block' },
        };
      },
      childCount: MAX_MARKDOWN_BLANK_LINE_NODE_POS_SCAN_NODES + 1,
      nodeAt: vi.fn(),
    };
    const view = {
      nodeDOM: vi.fn(() => blankLine),
      posAtDOM: vi.fn(() => {
        throw new Error('Force fallback scan');
      }),
      state: { doc },
    };

    expect(resolveMarkdownBlankLineNodePos(view as any, blankLine)).toBeNull();
    expect(accessed).toBe(MAX_MARKDOWN_BLANK_LINE_NODE_POS_SCAN_NODES);
    expect(view.nodeDOM).not.toHaveBeenCalled();
  });

  it('converts an adjacent markdown blank line to an editable paragraph on ArrowDown instead of selecting the block', async () => {
    const editor = await createEditor('Alpha');
    const view = editor.ctx.get(editorViewCtx);

    try {
      replaceWithBlankLineDocument(view);
      const firstParagraphPos = topLevelNodePos(view, (node) => node.type.name === 'paragraph' && node.textContent === 'Alpha');
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, firstParagraphPos + 1 + 'Alpha'.length)));

      const event = createArrowEvent('ArrowDown');
      const handled = handleMarkdownBlankLineKeyboardNavigation(view, event);

      expect(handled).toBe(true);
      expect(event.defaultPrevented).toBe(true);
      expect(view.state.selection).toBeInstanceOf(TextSelection);
      expect(view.state.selection).not.toBeInstanceOf(NodeSelection);
      expect(view.state.selection.empty).toBe(true);
      expect(view.state.doc.child(1).type.name).toBe('paragraph');
      expect(view.state.doc.child(1).textContent).toBe(EDITABLE_MARKDOWN_BLANK_LINE_PLACEHOLDER);
      expect(view.state.selection.$from.parent).toBe(view.state.doc.child(1));
    } finally {
      await editor.destroy();
    }
  });

  it('deletes an adjacent persisted blank line on Delete from an editable leading blank line without selecting it', async () => {
    const editor = await createEditor('Alpha');
    const view = editor.ctx.get(editorViewCtx);

    try {
      replaceWithLeadingEditableAndPersistedBlankLineDocument(view);
      view.dispatch(view.state.tr.setSelection(TextSelection.create(
        view.state.doc,
        1 + EDITABLE_MARKDOWN_BLANK_LINE_PLACEHOLDER.length,
      )));

      const event = createDeleteEvent('Delete');
      const handled = handleMarkdownBlankLineDeletion(view, event);

      expect(handled).toBe(true);
      expect(event.defaultPrevented).toBe(true);
      expect(view.state.selection).toBeInstanceOf(TextSelection);
      expect(view.state.selection).not.toBeInstanceOf(NodeSelection);
      expect(view.state.doc.childCount).toBe(2);
      expect(view.state.doc.child(0).type.name).toBe('paragraph');
      expect(view.state.doc.child(0).textContent).toBe(EDITABLE_MARKDOWN_BLANK_LINE_PLACEHOLDER);
      expect(view.state.doc.child(1).textContent).toBe('Beta');
    } finally {
      await editor.destroy();
    }
  });

  it('moves focus to the note title after deleting the top editable blank line', async () => {
    const editor = await createEditor('Alpha');
    const view = editor.ctx.get(editorViewCtx);
    const titleInput = document.createElement('textarea');
    titleInput.setAttribute('data-note-title-input', 'true');
    titleInput.value = 'Title';
    document.body.append(titleInput);

    try {
      const { schema } = view.state;
      replaceDocument(view, [
        createEditableBlankLineParagraph(view),
        schema.nodes.paragraph.create(null, schema.text('Body')),
      ]);
      view.dispatch(view.state.tr.setSelection(TextSelection.create(
        view.state.doc,
        1 + EDITABLE_MARKDOWN_BLANK_LINE_PLACEHOLDER.length,
      )));

      const event = createDeleteEvent('Backspace');
      const handled = handleMarkdownBlankLineDeletion(view, event);

      expect(handled).toBe(true);
      expect(event.defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(titleInput);
      expect(titleInput.selectionStart).toBe(titleInput.value.length);
      expect(titleInput.selectionEnd).toBe(titleInput.value.length);
      expect(view.state.doc.childCount).toBe(1);
      expect(view.state.doc.child(0).textContent).toBe('Body');
    } finally {
      titleInput.remove();
      await editor.destroy();
    }
  });

  it('moves focus to the note title after Backspace deletes a top persisted blank line', async () => {
    const editor = await createEditor('Alpha');
    const view = editor.ctx.get(editorViewCtx);
    const titleInput = document.createElement('textarea');
    titleInput.setAttribute('data-note-title-input', 'true');
    titleInput.value = 'Title';
    document.body.append(titleInput);

    try {
      const { schema } = view.state;
      replaceDocument(view, [
        createMarkdownBlankLine(view),
        schema.nodes.paragraph.create(null, schema.text('Body')),
      ]);
      const bodyPos = topLevelNodePos(view, (node) => node.type.name === 'paragraph' && node.textContent === 'Body');
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, bodyPos + 1)));

      const event = createDeleteEvent('Backspace');
      const handled = handleMarkdownBlankLineDeletion(view, event);

      expect(handled).toBe(true);
      expect(event.defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(titleInput);
      expect(titleInput.selectionStart).toBe(titleInput.value.length);
      expect(titleInput.selectionEnd).toBe(titleInput.value.length);
      expect(view.state.doc.childCount).toBe(1);
      expect(view.state.doc.child(0).textContent).toBe('Body');
    } finally {
      titleInput.remove();
      await editor.destroy();
    }
  });

  it('moves focus to the note title from a top ordered list gap', async () => {
    const editor = await createEditor('Alpha');
    const view = editor.ctx.get(editorViewCtx);
    const titleInput = document.createElement('textarea');
    titleInput.setAttribute('data-note-title-input', 'true');
    titleInput.value = 'Title';
    document.body.append(titleInput);

    try {
      replaceDocument(view, [createOrderedListGap(view)]);
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 3)));

      const event = createDeleteEvent('Backspace');
      const handled = handleMarkdownBlankLineDeletion(view, event);

      expect(handled).toBe(true);
      expect(event.defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(titleInput);
      expect(titleInput.selectionStart).toBe(titleInput.value.length);
      expect(titleInput.selectionEnd).toBe(titleInput.value.length);
      expect(view.state.doc.childCount).toBe(1);
      expect(view.state.doc.child(0).type.name).toBe('paragraph');
      expect(view.state.doc.child(0).content.size).toBe(0);
    } finally {
      titleInput.remove();
      await editor.destroy();
    }
  });

  it('moves focus to the note title after deleting a top list gap paragraph', async () => {
    const editor = await createEditor('Alpha');
    const view = editor.ctx.get(editorViewCtx);
    const titleInput = document.createElement('textarea');
    titleInput.setAttribute('data-note-title-input', 'true');
    titleInput.value = 'Title';
    document.body.append(titleInput);

    try {
      const { schema } = view.state;
      replaceDocument(view, [
        schema.nodes.paragraph.create(null, schema.text(EDITABLE_LIST_GAP_PLACEHOLDER)),
        createOrderedListGap(view),
      ]);
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1)));

      const event = createDeleteEvent('Backspace');
      const handled = handleMarkdownBlankLineDeletion(view, event);

      expect(handled).toBe(true);
      expect(event.defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(titleInput);
      expect(titleInput.selectionStart).toBe(titleInput.value.length);
      expect(titleInput.selectionEnd).toBe(titleInput.value.length);
      expect(view.state.doc.childCount).toBe(1);
      expect(view.state.doc.child(0).type.name).toBe('ordered_list');
    } finally {
      titleInput.remove();
      await editor.destroy();
    }
  });

  it('merges an empty leading paragraph with the next persisted blank line on Backspace without selecting it', async () => {
    const editor = await createEditor('Alpha');
    const view = editor.ctx.get(editorViewCtx);

    try {
      replaceWithLeadingEmptyAndPersistedBlankLineDocument(view);
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1)));

      const event = createDeleteEvent('Backspace');
      const handled = handleMarkdownBlankLineDeletion(view, event);

      expect(handled).toBe(true);
      expect(event.defaultPrevented).toBe(true);
      expect(view.state.selection).toBeInstanceOf(TextSelection);
      expect(view.state.selection).not.toBeInstanceOf(NodeSelection);
      expect(view.state.doc.childCount).toBe(2);
      expect(view.state.doc.child(0).type.name).toBe('paragraph');
      expect(view.state.doc.child(0).textContent).toBe(EDITABLE_MARKDOWN_BLANK_LINE_PLACEHOLDER);
      expect(view.state.doc.child(1).textContent).toBe('Beta');
      expect(view.state.selection.$from.parent).toBe(view.state.doc.child(0));
    } finally {
      await editor.destroy();
    }
  });

  it('deletes an editable blank line above a heading without moving the cursor into the heading', async () => {
    const editor = await createEditor('Alpha');
    const view = editor.ctx.get(editorViewCtx);

    try {
      const { schema } = view.state;
      replaceDocument(view, [
        schema.nodes.paragraph.create(null, schema.text('Intro')),
        createEditableBlankLineParagraph(view),
        createHeading(view, 'Heading after blank'),
      ]);
      const blankLinePos = topLevelNodePos(
        view,
        (node) => node.type.name === 'paragraph' && node.textContent === EDITABLE_MARKDOWN_BLANK_LINE_PLACEHOLDER,
      );
      view.dispatch(
        view.state.tr.setSelection(TextSelection.create(
          view.state.doc,
          blankLinePos + 1 + EDITABLE_MARKDOWN_BLANK_LINE_PLACEHOLDER.length,
        )),
      );

      const event = createDeleteEvent('Delete');
      const handled = handleMarkdownBlankLineDeletion(view, event);

      expect(handled).toBe(true);
      expect(event.defaultPrevented).toBe(true);
      expect(view.state.doc.childCount).toBe(2);
      expect(view.state.doc.child(0).textContent).toBe('Intro');
      expect(view.state.doc.child(1).type.name).toBe('heading');
      expect(view.state.selection).toBeInstanceOf(TextSelection);
      expect(view.state.selection).not.toBeInstanceOf(NodeSelection);
      expect(view.state.selection.$from.parent.type.name).toBe('paragraph');
      expect(view.state.selection.$from.parentOffset).toBe('Intro'.length);
    } finally {
      await editor.destroy();
    }
  });

  it.each(['Backspace', 'Delete'] as const)(
    'deletes an editable blank line below a heading on %s and moves the cursor to the heading end',
    async (key) => {
      const editor = await createEditor('Alpha');
      const view = editor.ctx.get(editorViewCtx);

      try {
        const { schema } = view.state;
        replaceDocument(view, [
          createHeading(view, 'Heading before blank'),
          createEditableBlankLineParagraph(view),
          schema.nodes.paragraph.create(null, schema.text('Body')),
        ]);
        const blankLinePos = topLevelNodePos(
          view,
          (node) => node.type.name === 'paragraph' && node.textContent === EDITABLE_MARKDOWN_BLANK_LINE_PLACEHOLDER,
        );
        view.dispatch(view.state.tr.setSelection(TextSelection.create(
          view.state.doc,
          blankLinePos + 1 + EDITABLE_MARKDOWN_BLANK_LINE_PLACEHOLDER.length,
        )));

        const event = createDeleteEvent(key);
        const handled = handleMarkdownBlankLineDeletion(view, event);

        expect(handled).toBe(true);
        expect(event.defaultPrevented).toBe(true);
        expect(view.state.doc.childCount).toBe(2);
        expect(view.state.doc.child(0).type.name).toBe('heading');
        expect(view.state.doc.child(1).textContent).toBe('Body');
        expect(view.state.selection).toBeInstanceOf(TextSelection);
        expect(view.state.selection).not.toBeInstanceOf(NodeSelection);
        expect(view.state.selection.$from.parent.type.name).toBe('heading');
        expect(view.state.selection.$from.parentOffset).toBe('Heading before blank'.length);
      } finally {
        await editor.destroy();
      }
    }
  );

  it.each(['Backspace', 'Delete'] as const)(
    'deletes a terminal editable blank line below a heading on %s and moves the cursor to the heading end',
    async (key) => {
      const editor = await createEditor('Alpha');
      const view = editor.ctx.get(editorViewCtx);

      try {
        replaceDocument(view, [
          createHeading(view, 'Heading before blank'),
          createEditableBlankLineParagraph(view),
        ]);
        const blankLinePos = topLevelNodePos(
          view,
          (node) => node.type.name === 'paragraph' && node.textContent === EDITABLE_MARKDOWN_BLANK_LINE_PLACEHOLDER,
        );
        view.dispatch(view.state.tr.setSelection(TextSelection.create(
          view.state.doc,
          blankLinePos + 1 + EDITABLE_MARKDOWN_BLANK_LINE_PLACEHOLDER.length,
        )));

        const event = createDeleteEvent(key);
        const handled = handleMarkdownBlankLineDeletion(view, event);

        expect(handled).toBe(true);
        expect(event.defaultPrevented).toBe(true);
        expect(view.state.doc.childCount).toBe(1);
        expect(view.state.doc.child(0).type.name).toBe('heading');
        expect(view.state.selection).toBeInstanceOf(TextSelection);
        expect(view.state.selection).not.toBeInstanceOf(NodeSelection);
        expect(view.state.selection.$from.parent.type.name).toBe('heading');
        expect(view.state.selection.$from.parentOffset).toBe('Heading before blank'.length);
      } finally {
        await editor.destroy();
      }
    }
  );

  it('deletes editable blank lines beside representative structural blocks without moving the cursor into them', async () => {
    const editor = await createEditor('Alpha');
    const view = editor.ctx.get(editorViewCtx);

    try {
      const { schema } = view.state;
      const cases = createSupportedStructuralBlockCases(view);
      expect(cases.map((testCase) => testCase.label)).toEqual(
        expect.arrayContaining(['heading', 'blockquote', 'hr', 'html_block', 'code_block', 'bullet_list', 'ordered_list']),
      );

      for (const testCase of cases) {
        const beforeText = `Before ${testCase.label}`;
        replaceDocument(view, [
          schema.nodes.paragraph.create(null, schema.text(beforeText)),
          createEditableBlankLineParagraph(view),
          testCase.node,
        ]);
        const blankLinePos = topLevelNodePos(
          view,
          (node) => node.type.name === 'paragraph' && node.textContent === EDITABLE_MARKDOWN_BLANK_LINE_PLACEHOLDER,
        );
        view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, blankLinePos + 1)));

        const deleteEvent = createDeleteEvent('Delete');
        const deleteHandled = handleMarkdownBlankLineDeletion(view, deleteEvent);

        expect(deleteHandled, `${testCase.label} above on Delete`).toBe(true);
        expect(deleteEvent.defaultPrevented, `${testCase.label} above on Delete`).toBe(true);
        expect(view.state.selection, `${testCase.label} above on Delete`).toBeInstanceOf(TextSelection);
        expect(view.state.selection, `${testCase.label} above on Delete`).not.toBeInstanceOf(NodeSelection);
        expect(view.state.selection.$from.depth, `${testCase.label} above on Delete`).toBe(1);
        expect(view.state.selection.$from.parent.type.name, `${testCase.label} above on Delete`).toBe('paragraph');
        expect(view.state.selection.$from.parent.textContent, `${testCase.label} above on Delete`).toBe(beforeText);
        expect(view.state.selection.$from.parentOffset, `${testCase.label} above on Delete`).toBe(beforeText.length);

        const afterText = `After ${testCase.label}`;
        replaceDocument(view, [
          testCase.node,
          createEditableBlankLineParagraph(view),
          schema.nodes.paragraph.create(null, schema.text(afterText)),
        ]);
        const nextBlankLinePos = topLevelNodePos(
          view,
          (node) => node.type.name === 'paragraph' && node.textContent === EDITABLE_MARKDOWN_BLANK_LINE_PLACEHOLDER,
        );
        view.dispatch(
          view.state.tr.setSelection(TextSelection.create(
            view.state.doc,
            nextBlankLinePos + 1 + EDITABLE_MARKDOWN_BLANK_LINE_PLACEHOLDER.length,
          )),
        );

        const backspaceEvent = createDeleteEvent('Backspace');
        const backspaceHandled = handleMarkdownBlankLineDeletion(view, backspaceEvent);

        expect(backspaceHandled, `${testCase.label} below on Backspace`).toBe(true);
        expect(backspaceEvent.defaultPrevented, `${testCase.label} below on Backspace`).toBe(true);
        expect(view.state.selection, `${testCase.label} below on Backspace`).toBeInstanceOf(TextSelection);
        expect(view.state.selection, `${testCase.label} below on Backspace`).not.toBeInstanceOf(NodeSelection);
        expect(view.state.selection.$from.depth, `${testCase.label} below on Backspace`).toBe(1);
        if (testCase.typeName === 'heading') {
          expect(view.state.selection.$from.parent.type.name, `${testCase.label} below on Backspace`).toBe('heading');
          expect(view.state.selection.$from.parent.textContent, `${testCase.label} below on Backspace`).toBe('Structural heading');
          expect(view.state.selection.$from.parentOffset, `${testCase.label} below on Backspace`).toBe('Structural heading'.length);
        } else {
          expect(view.state.selection.$from.parent.type.name, `${testCase.label} below on Backspace`).toBe('paragraph');
          expect(view.state.selection.$from.parent.textContent, `${testCase.label} below on Backspace`).toBe(afterText);
          expect(view.state.selection.$from.parentOffset, `${testCase.label} below on Backspace`).toBe(0);
        }
      }
    } finally {
      await editor.destroy();
    }
  });

  it('deletes an editable blank line between structural blocks when there is no plain paragraph cursor target', async () => {
    const editor = await createEditor('Alpha');
    const view = editor.ctx.get(editorViewCtx);

    try {
      const structuralPairs = [
        {
          label: 'heading to blockquote',
          createNodes: () => [
            createHeading(view, 'Heading before blank'),
            view.state.schema.nodes.blockquote.create(null, [
              view.state.schema.nodes.paragraph.create(null, view.state.schema.text('Quote')),
            ]),
          ],
          expectedBackspaceText: 'Heading before blank',
          expectedBackspaceOffset: 'Heading before blank'.length,
          expectedDeleteText: 'Quote',
          expectedDeleteOffset: 0,
          expectedNodeNames: ['heading', 'blockquote'],
        },
        {
          label: 'heading to ordered list',
          createNodes: () => [
            createHeading(view, 'Heading before blank'),
            createOrderedList(view),
          ],
          expectedBackspaceText: 'Heading before blank',
          expectedBackspaceOffset: 'Heading before blank'.length,
          expectedDeleteText: 'Ordered item',
          expectedDeleteOffset: 0,
          expectedNodeNames: ['heading', 'ordered_list'],
        },
        {
          label: 'horizontal rule to ordered list',
          createNodes: () => [
            view.state.schema.nodes.hr.create(null, view.state.schema.text('---')),
            createOrderedList(view),
          ],
          expectedBackspaceText: 'Ordered item',
          expectedBackspaceOffset: 'Ordered item'.length,
          expectedDeleteText: 'Ordered item',
          expectedDeleteOffset: 'Ordered item'.length,
          expectedNodeNames: ['hr', 'ordered_list'],
        },
      ];

      for (const testCase of structuralPairs) {
        for (const { key, offset } of [
          { key: 'Delete' as const, offset: 0 },
          { key: 'Delete' as const, offset: EDITABLE_MARKDOWN_BLANK_LINE_PLACEHOLDER.length },
          { key: 'Backspace' as const, offset: 0 },
          { key: 'Backspace' as const, offset: EDITABLE_MARKDOWN_BLANK_LINE_PLACEHOLDER.length },
        ]) {
          const [previousNode, nextNode] = testCase.createNodes();
          replaceDocument(view, [
            previousNode,
            createEditableBlankLineParagraph(view),
            nextNode,
          ].filter((node): node is ProseNode => Boolean(node)));
          const blankLinePos = topLevelNodePos(
            view,
            (node) => node.type.name === 'paragraph' && node.textContent === EDITABLE_MARKDOWN_BLANK_LINE_PLACEHOLDER,
          );
          const cursorPos = blankLinePos + 1 + offset;
          view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, cursorPos)));

          const event = createDeleteEvent(key);
          const handled = handleMarkdownBlankLineDeletion(view, event);

          const label = `${testCase.label} ${key} at placeholder offset ${offset}`;
          expect(handled, label).toBe(true);
          expect(event.defaultPrevented, label).toBe(true);
          expect(view.state.doc.childCount, label).toBe(2);
          expect(Array.from({ length: view.state.doc.childCount }, (_, index) => view.state.doc.child(index).type.name), label)
            .toEqual(testCase.expectedNodeNames);
          expect(view.state.selection, label).toBeInstanceOf(TextSelection);
          expect(view.state.selection, label).not.toBeInstanceOf(NodeSelection);
          expect(view.state.selection.$from.parent.textContent, label).toBe(
            key === 'Backspace' ? testCase.expectedBackspaceText : testCase.expectedDeleteText,
          );
          expect(view.state.selection.$from.parentOffset, label).toBe(
            key === 'Backspace' ? testCase.expectedBackspaceOffset : testCase.expectedDeleteOffset,
          );
        }
      }
    } finally {
      await editor.destroy();
    }
  });

  it('keeps a leading editable blank line before an html block even when a later paragraph exists', async () => {
    const editor = await createEditor('Alpha');
    const view = editor.ctx.get(editorViewCtx);

    try {
      const { schema } = view.state;
      replaceDocument(view, [
        createEditableBlankLineParagraph(view),
        schema.nodes.html_block.create({ value: '<details>\n<summary>Title</summary>' }),
        schema.nodes.paragraph.create(null, schema.text('Content')),
      ]);

      for (const index of [1, 2]) {
        const blankLinePos = topLevelNodePos(
          view,
          (node) => node.type.name === 'paragraph' && node.textContent === EDITABLE_MARKDOWN_BLANK_LINE_PLACEHOLDER,
        );
        view.dispatch(
          view.state.tr.setSelection(TextSelection.create(
            view.state.doc,
            blankLinePos + 1 + EDITABLE_MARKDOWN_BLANK_LINE_PLACEHOLDER.length,
          )),
        );

        const event = createDeleteEvent('Delete');
        const handled = handleMarkdownBlankLineDeletion(view, event);

        expect(handled, `Delete ${index}`).toBe(true);
        expect(event.defaultPrevented, `Delete ${index}`).toBe(true);
        expect(view.state.doc.childCount, `Delete ${index}`).toBe(3);
        expect(view.state.doc.child(0).type.name, `Delete ${index}`).toBe('paragraph');
        expect(view.state.doc.child(0).textContent, `Delete ${index}`).toBe(EDITABLE_MARKDOWN_BLANK_LINE_PLACEHOLDER);
        expect(view.state.doc.child(1).type.name, `Delete ${index}`).toBe('html_block');
        expect(view.state.doc.child(2).textContent, `Delete ${index}`).toBe('Content');
        expect(view.state.selection, `Delete ${index}`).toBeInstanceOf(TextSelection);
        expect(view.state.selection.$from.parent, `Delete ${index}`).toBe(view.state.doc.child(0));
      }
    } finally {
      await editor.destroy();
    }
  });

  it('deletes an editable blank line next to a plain paragraph without deleting placeholder text first', async () => {
    const editor = await createEditor('Alpha');
    const view = editor.ctx.get(editorViewCtx);

    try {
      const { schema } = view.state;
      replaceDocument(view, [
        createEditableBlankLineParagraph(view),
        schema.nodes.paragraph.create(null, schema.text('Body')),
      ]);
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1)));

      const deleteEvent = createDeleteEvent('Delete');
      const deleteHandled = handleMarkdownBlankLineDeletion(view, deleteEvent);

      expect(deleteHandled).toBe(true);
      expect(deleteEvent.defaultPrevented).toBe(true);
      expect(view.state.doc.childCount).toBe(1);
      expect(view.state.doc.child(0).type.name).toBe('paragraph');
      expect(view.state.doc.child(0).textContent).toBe('Body');
      expect(view.state.selection).toBeInstanceOf(TextSelection);
      expect(view.state.selection.$from.parent).toBe(view.state.doc.child(0));
      expect(view.state.selection.$from.parentOffset).toBe(0);

      replaceDocument(view, [
        schema.nodes.paragraph.create(null, schema.text('Intro')),
        createEditableBlankLineParagraph(view),
      ]);
      const blankLinePos = topLevelNodePos(
        view,
        (node) => node.type.name === 'paragraph' && node.textContent === EDITABLE_MARKDOWN_BLANK_LINE_PLACEHOLDER,
      );
      view.dispatch(
        view.state.tr.setSelection(TextSelection.create(
          view.state.doc,
          blankLinePos + 1 + EDITABLE_MARKDOWN_BLANK_LINE_PLACEHOLDER.length,
        )),
      );

      const backspaceEvent = createDeleteEvent('Backspace');
      const backspaceHandled = handleMarkdownBlankLineDeletion(view, backspaceEvent);

      expect(backspaceHandled).toBe(true);
      expect(backspaceEvent.defaultPrevented).toBe(true);
      expect(view.state.doc.childCount).toBe(1);
      expect(view.state.doc.child(0).type.name).toBe('paragraph');
      expect(view.state.doc.child(0).textContent).toBe('Intro');
      expect(view.state.selection).toBeInstanceOf(TextSelection);
      expect(view.state.selection.$from.parent).toBe(view.state.doc.child(0));
      expect(view.state.selection.$from.parentOffset).toBe('Intro'.length);
    } finally {
      await editor.destroy();
    }
  });

  it.each([
    ['Backspace', 0],
    ['Backspace', EDITABLE_MARKDOWN_BLANK_LINE_PLACEHOLDER.length],
    ['Delete', 0],
    ['Delete', EDITABLE_MARKDOWN_BLANK_LINE_PLACEHOLDER.length],
  ] as const)('places the cursor at the previous paragraph end after %s deletes a middle blank line at offset %s', async (key, offset) => {
    const editor = await createEditor('1.2\n\n3.4');
    const view = editor.ctx.get(editorViewCtx);

    try {
      const { schema } = view.state;
      replaceDocument(view, [
        schema.nodes.paragraph.create(null, schema.text('1.2')),
        createEditableBlankLineParagraph(view),
        schema.nodes.paragraph.create(null, schema.text('3.4')),
      ]);
      const blankLinePos = topLevelNodePos(
        view,
        (node) => node.type.name === 'paragraph' && node.textContent === EDITABLE_MARKDOWN_BLANK_LINE_PLACEHOLDER,
      );
      view.dispatch(view.state.tr.setSelection(TextSelection.create(
        view.state.doc,
        blankLinePos + 1 + offset,
      )));

      const event = createDeleteEvent(key);
      const handled = handleMarkdownBlankLineDeletion(view, event);

      expect(handled).toBe(true);
      expect(event.defaultPrevented).toBe(true);
      expect(view.state.doc.childCount).toBe(2);
      expect(view.state.doc.child(0).textContent).toBe('1.2');
      expect(view.state.doc.child(1).textContent).toBe('3.4');
      expect(view.state.selection.$from.parent).toBe(view.state.doc.child(0));
      expect(view.state.selection.$from.parentOffset).toBe('1.2'.length);
    } finally {
      await editor.destroy();
    }
  });

  it('keeps terminal editable blank-line deletion from consuming adjacent paragraph text', async () => {
    const editor = await createEditor('Alpha');
    const view = editor.ctx.get(editorViewCtx);

    try {
      const { schema } = view.state;
      for (const { key, nodes, blankOccurrence, offset, expectedText } of [
        {
          key: 'Backspace' as const,
          nodes: [
            createEditableBlankLineParagraph(view),
            schema.nodes.paragraph.create(null, schema.text('Body')),
          ],
          blankOccurrence: 0,
          offset: EDITABLE_MARKDOWN_BLANK_LINE_PLACEHOLDER.length,
          expectedText: 'Body',
        },
        {
          key: 'Delete' as const,
          nodes: [
            schema.nodes.paragraph.create(null, schema.text('Intro')),
            createEditableBlankLineParagraph(view),
          ],
          blankOccurrence: 0,
          offset: 0,
          expectedText: 'Intro',
        },
      ]) {
        replaceDocument(view, nodes);
        const blankLinePos = topLevelNodePos(
          view,
          (node) => node.type.name === 'paragraph' && node.textContent === EDITABLE_MARKDOWN_BLANK_LINE_PLACEHOLDER,
          blankOccurrence,
        );
        view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, blankLinePos + 1 + offset)));

        const event = createDeleteEvent(key);
        const handled = handleMarkdownBlankLineDeletion(view, event);

        expect(handled, key).toBe(true);
        expect(event.defaultPrevented, key).toBe(true);
        expect(view.state.doc.childCount, key).toBe(2);
        expect(view.state.doc.textContent, key).toContain(expectedText);
        expect(view.state.selection, key).toBeInstanceOf(TextSelection);
        expect(view.state.selection.$from.parent.textContent, key).toBe(EDITABLE_MARKDOWN_BLANK_LINE_PLACEHOLDER);
      }
    } finally {
      await editor.destroy();
    }
  });

  it('deletes a native-selected markdown blank line and restores a text cursor', async () => {
    const editor = await createEditor('Alpha');
    const view = editor.ctx.get(editorViewCtx);

    try {
      replaceWithBlankLineDocument(view);
      const blankLinePos = topLevelNodePos(view, (node) => (
        node.type.name === 'html_block' && node.attrs.value === MARKDOWN_BLANK_LINE_VALUE
      ));
      view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, blankLinePos)));

      const event = createDeleteEvent('Delete');
      const handled = handleMarkdownBlankLineDeletion(view, event);

      expect(handled).toBe(true);
      expect(event.defaultPrevented).toBe(true);
      expect(view.state.selection).toBeInstanceOf(TextSelection);
      expect(view.state.selection).not.toBeInstanceOf(NodeSelection);
      expect(view.state.doc.childCount).toBe(2);
      expect(view.state.doc.child(0).textContent).toBe('Alpha');
      expect(view.state.doc.child(1).textContent).toBe('Beta');
    } finally {
      await editor.destroy();
    }
  });

  it('places the cursor at the previous paragraph end after deleting a selected middle markdown blank line', async () => {
    const editor = await createEditor('1.2\n\n3.4');
    const view = editor.ctx.get(editorViewCtx);

    try {
      const { schema } = view.state;
      replaceDocument(view, [
        schema.nodes.paragraph.create(null, schema.text('1.2')),
        schema.nodes.html_block.create({ value: MARKDOWN_BLANK_LINE_VALUE }),
        schema.nodes.paragraph.create(null, schema.text('3.4')),
      ]);
      const blankLinePos = topLevelNodePos(view, (node) => (
        node.type.name === 'html_block' && node.attrs.value === MARKDOWN_BLANK_LINE_VALUE
      ));
      view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, blankLinePos)));

      const event = createDeleteEvent('Delete');
      const handled = handleMarkdownBlankLineDeletion(view, event);

      expect(handled).toBe(true);
      expect(event.defaultPrevented).toBe(true);
      expect(view.state.doc.childCount).toBe(2);
      expect(view.state.doc.child(0).textContent).toBe('1.2');
      expect(view.state.doc.child(1).textContent).toBe('3.4');
      expect(view.state.selection).toBeInstanceOf(TextSelection);
      expect(view.state.selection.$from.parent).toBe(view.state.doc.child(0));
      expect(view.state.selection.$from.parentOffset).toBe('1.2'.length);
    } finally {
      await editor.destroy();
    }
  });

  it('moves native-selected leading markdown blank line deletion into the next blank line', async () => {
    const editor = await createEditor('Alpha');
    const view = editor.ctx.get(editorViewCtx);

    try {
      const { schema } = view.state;
      replaceDocument(view, [
        createMarkdownBlankLine(view),
        createMarkdownBlankLine(view),
        schema.nodes.paragraph.create(null, schema.text('Body')),
      ]);
      view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, 0)));

      const event = createDeleteEvent('Backspace');
      const handled = handleMarkdownBlankLineDeletion(view, event);

      expect(handled).toBe(true);
      expect(event.defaultPrevented).toBe(true);
      expect(view.state.doc.childCount).toBe(2);
      expect(view.state.doc.child(0).type.name).toBe('paragraph');
      expect(view.state.doc.child(0).textContent).toBe(EDITABLE_MARKDOWN_BLANK_LINE_PLACEHOLDER);
      expect(view.state.doc.child(1).textContent).toBe('Body');
      expect(view.state.selection).toBeInstanceOf(TextSelection);
      expect(view.state.selection.$from.parent).toBe(view.state.doc.child(0));
    } finally {
      await editor.destroy();
    }
  });

  it.each(['Backspace', 'Delete'] as const)(
    'converts a selected markdown blank line before an html block when %s has no text cursor target',
    async (key) => {
      const editor = await createEditor('Alpha');
      const view = editor.ctx.get(editorViewCtx);

      try {
        const { schema } = view.state;
        replaceDocument(view, [
          schema.nodes.html_block.create({ value: MARKDOWN_BLANK_LINE_VALUE }),
          schema.nodes.html_block.create({ value: '<details><summary>Title</summary></details>' }),
        ]);
        view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, 0)));

        const event = createDeleteEvent(key);
        const handled = handleMarkdownBlankLineDeletion(view, event);

        expect(handled).toBe(true);
        expect(event.defaultPrevented).toBe(true);
        expect(view.state.selection).toBeInstanceOf(TextSelection);
        expect(view.state.selection).not.toBeInstanceOf(NodeSelection);
        expect(view.state.doc.childCount).toBe(2);
        expect(view.state.doc.child(0).type.name).toBe('paragraph');
        expect(view.state.doc.child(0).textContent).toBe(EDITABLE_MARKDOWN_BLANK_LINE_PLACEHOLDER);
        expect(view.state.doc.child(1).type.name).toBe('html_block');
        expect(view.state.doc.child(1).attrs.value).toContain('<summary>Title</summary>');
      } finally {
        await editor.destroy();
      }
    }
  );

  it('recovers an accidental native blank-line selection after Delete from an editable blank line', async () => {
    const editor = await createEditor('Alpha');
    const view = editor.ctx.get(editorViewCtx);

    try {
      replaceWithLeadingEditableAndPersistedBlankLineDocument(view);
      view.dispatch(view.state.tr.setSelection(TextSelection.create(
        view.state.doc,
        1 + EDITABLE_MARKDOWN_BLANK_LINE_PLACEHOLDER.length,
      )));
      const oldState = view.state;
      const blankLinePos = topLevelNodePos(view, (node) => (
        node.type.name === 'html_block' && node.attrs.value === MARKDOWN_BLANK_LINE_VALUE
      ));
      view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, blankLinePos)));

      const recovery = appendMarkdownBlankLineNodeSelectionRecoveryTransaction(oldState, view.state);
      expect(recovery).not.toBeNull();
      view.dispatch(recovery!);

      expect(view.state.selection).toBeInstanceOf(TextSelection);
      expect(view.state.selection).not.toBeInstanceOf(NodeSelection);
      expect(view.state.doc.childCount).toBe(2);
      expect(view.state.doc.child(0).textContent).toBe(EDITABLE_MARKDOWN_BLANK_LINE_PLACEHOLDER);
      expect(view.state.doc.child(1).textContent).toBe('Beta');
    } finally {
      await editor.destroy();
    }
  });

  it('recovers an accidental native blank-line selection after Backspace removes an empty leading paragraph', async () => {
    const editor = await createEditor('Alpha');
    const view = editor.ctx.get(editorViewCtx);

    try {
      replaceWithLeadingEmptyAndPersistedBlankLineDocument(view);
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1)));
      const oldState = view.state;
      const tr = view.state.tr.delete(0, view.state.doc.child(0).nodeSize);
      view.dispatch(tr.setSelection(NodeSelection.create(tr.doc, 0)));

      const recovery = appendMarkdownBlankLineNodeSelectionRecoveryTransaction(oldState, view.state);
      expect(recovery).not.toBeNull();
      view.dispatch(recovery!);

      expect(view.state.selection).toBeInstanceOf(TextSelection);
      expect(view.state.selection).not.toBeInstanceOf(NodeSelection);
      expect(view.state.doc.childCount).toBe(2);
      expect(view.state.doc.child(0).textContent).toBe(EDITABLE_MARKDOWN_BLANK_LINE_PLACEHOLDER);
      expect(view.state.doc.child(1).textContent).toBe('Beta');
    } finally {
      await editor.destroy();
    }
  });

  it('converts an adjacent markdown blank line to an editable paragraph on ArrowUp instead of selecting the block', async () => {
    const editor = await createEditor('Alpha');
    const view = editor.ctx.get(editorViewCtx);

    try {
      replaceWithBlankLineDocument(view);
      const betaParagraphPos = topLevelNodePos(view, (node) => node.type.name === 'paragraph' && node.textContent === 'Beta');
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, betaParagraphPos + 1)));

      const event = createArrowEvent('ArrowUp');
      const handled = handleMarkdownBlankLineKeyboardNavigation(view, event);

      expect(handled).toBe(true);
      expect(event.defaultPrevented).toBe(true);
      expect(view.state.selection).toBeInstanceOf(TextSelection);
      expect(view.state.selection).not.toBeInstanceOf(NodeSelection);
      expect(view.state.selection.empty).toBe(true);
      expect(view.state.doc.child(1).type.name).toBe('paragraph');
      expect(view.state.doc.child(1).textContent).toBe(EDITABLE_MARKDOWN_BLANK_LINE_PLACEHOLDER);
      expect(view.state.selection.$from.parent).toBe(view.state.doc.child(1));
    } finally {
      await editor.destroy();
    }
  });

  it('converts a markdown blank line before a blockquote on ArrowLeft from the quote start', async () => {
    const editor = await createEditor('Alpha');
    const view = editor.ctx.get(editorViewCtx);

    try {
      replaceWithBlankLineBeforeBlockquoteDocument(view);
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, blockquoteTextStartPos(view))));

      const event = createArrowEvent('ArrowLeft');
      const handled = handleMarkdownBlankLineKeyboardNavigation(view, event);

      expect(handled).toBe(true);
      expect(event.defaultPrevented).toBe(true);
      expect(view.state.selection).toBeInstanceOf(TextSelection);
      expect(view.state.selection).not.toBeInstanceOf(NodeSelection);
      expect(view.state.selection.empty).toBe(true);
      expect(view.state.doc.child(0).type.name).toBe('paragraph');
      expect(view.state.doc.child(0).textContent).toBe(EDITABLE_MARKDOWN_BLANK_LINE_PLACEHOLDER);
      expect(view.state.selection.$from.parent).toBe(view.state.doc.child(0));
    } finally {
      await editor.destroy();
    }
  });

  it('converts a markdown blank line after a blockquote on ArrowRight from the quote end', async () => {
    const editor = await createEditor('Alpha');
    const view = editor.ctx.get(editorViewCtx);

    try {
      replaceWithBlankLineAfterBlockquoteDocument(view);
      view.dispatch(view.state.tr.setSelection(TextSelection.create(
        view.state.doc,
        blockquoteTextStartPos(view) + 'Quote'.length,
      )));

      const event = createArrowEvent('ArrowRight');
      const handled = handleMarkdownBlankLineKeyboardNavigation(view, event);

      expect(handled).toBe(true);
      expect(event.defaultPrevented).toBe(true);
      expect(view.state.selection).toBeInstanceOf(TextSelection);
      expect(view.state.selection).not.toBeInstanceOf(NodeSelection);
      expect(view.state.selection.empty).toBe(true);
      expect(view.state.doc.child(1).type.name).toBe('paragraph');
      expect(view.state.doc.child(1).textContent).toBe(EDITABLE_MARKDOWN_BLANK_LINE_PLACEHOLDER);
      expect(view.state.selection.$from.parent).toBe(view.state.doc.child(1));
    } finally {
      await editor.destroy();
    }
  });

  it('moves from an editable markdown blank line to the previous paragraph end on ArrowUp', async () => {
    const editor = await createEditor('Alpha');
    const view = editor.ctx.get(editorViewCtx);

    try {
      replaceWithEditableBlankLineDocument(view);
      const blankLinePos = topLevelNodePos(
        view,
        (node) => node.type.name === 'paragraph' && node.textContent === EDITABLE_MARKDOWN_BLANK_LINE_PLACEHOLDER,
      );
      view.dispatch(
        view.state.tr.setSelection(TextSelection.create(
          view.state.doc,
          blankLinePos + 1 + EDITABLE_MARKDOWN_BLANK_LINE_PLACEHOLDER.length,
        )),
      );

      const event = createArrowEvent('ArrowUp');
      const handled = handleMarkdownBlankLineKeyboardNavigation(view, event);

      expect(handled).toBe(true);
      expect(event.defaultPrevented).toBe(true);
      expect(view.state.selection).toBeInstanceOf(TextSelection);
      expect(view.state.selection.empty).toBe(true);
      expect(view.state.selection.$from.parent.textContent).toBe('Alpha');
      expect(view.state.selection.$from.parentOffset).toBe('Alpha'.length);
    } finally {
      await editor.destroy();
    }
  });

  it('selects an adjacent navigable HTML block when ArrowUp leaves an editable markdown blank line', async () => {
    const editor = await createEditor('Alpha');
    const view = editor.ctx.get(editorViewCtx);

    try {
      replaceWithHtmlBlockAndEditableBlankLineDocument(view);
      const blankLinePos = topLevelNodePos(
        view,
        (node) => node.type.name === 'paragraph' && node.textContent === EDITABLE_MARKDOWN_BLANK_LINE_PLACEHOLDER,
      );
      view.dispatch(
        view.state.tr.setSelection(TextSelection.create(
          view.state.doc,
          blankLinePos + 1 + EDITABLE_MARKDOWN_BLANK_LINE_PLACEHOLDER.length,
        )),
      );

      const event = createArrowEvent('ArrowUp');
      const handled = handleMarkdownBlankLineKeyboardNavigation(view, event);

      expect(handled).toBe(true);
      expect(event.defaultPrevented).toBe(true);
      expect(view.state.selection).toBeInstanceOf(NodeSelection);
      expect((view.state.selection as NodeSelection).node.type.name).toBe('html_block');
      expect((view.state.selection as NodeSelection).node.attrs.value).toBe('<p>HTML</p>');
      expect(view.state.doc.child(1).type.name).toBe('paragraph');
      expect(view.state.doc.child(1).textContent).toBe(EDITABLE_MARKDOWN_BLANK_LINE_PLACEHOLDER);
    } finally {
      await editor.destroy();
    }
  });

  it('moves from an editable markdown blank line to the next paragraph start on ArrowDown', async () => {
    const editor = await createEditor('Alpha');
    const view = editor.ctx.get(editorViewCtx);

    try {
      replaceWithEditableBlankLineDocument(view);
      const blankLinePos = topLevelNodePos(
        view,
        (node) => node.type.name === 'paragraph' && node.textContent === EDITABLE_MARKDOWN_BLANK_LINE_PLACEHOLDER,
      );
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, blankLinePos + 1)));

      const event = createArrowEvent('ArrowDown');
      const handled = handleMarkdownBlankLineKeyboardNavigation(view, event);

      expect(handled).toBe(true);
      expect(event.defaultPrevented).toBe(true);
      expect(view.state.selection).toBeInstanceOf(TextSelection);
      expect(view.state.selection.empty).toBe(true);
      expect(view.state.selection.$from.parent.textContent).toBe('Beta');
      expect(view.state.selection.$from.parentOffset).toBe(0);
    } finally {
      await editor.destroy();
    }
  });

  it('moves from an editable markdown blank line to the horizontal rule source end on ArrowDown', async () => {
    const editor = await createEditor('Alpha');
    const view = editor.ctx.get(editorViewCtx);

    try {
      const { schema } = view.state;
      replaceDocument(view, [
        schema.nodes.paragraph.create(null, schema.text('Alpha')),
        createEditableBlankLineParagraph(view),
        schema.nodes.hr.create(null, schema.text('---')),
      ]);
      const blankLinePos = topLevelNodePos(
        view,
        (node) => node.type.name === 'paragraph' && node.textContent === EDITABLE_MARKDOWN_BLANK_LINE_PLACEHOLDER,
      );
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, blankLinePos + 1)));

      const event = createArrowEvent('ArrowDown');
      const handled = handleMarkdownBlankLineKeyboardNavigation(view, event);

      expect(handled).toBe(true);
      expect(event.defaultPrevented).toBe(true);
      expect(view.state.selection.$from.parent.type.name).toBe('hr');
      expect(view.state.selection.$from.parentOffset).toBe(3);
    } finally {
      await editor.destroy();
    }
  });

  it('moves from an editable markdown blank line to the previous list item end on ArrowUp', async () => {
    const editor = await createEditor('Alpha');
    const view = editor.ctx.get(editorViewCtx);

    try {
      replaceWithListAndEditableBlankLineDocument(view);
      const blankLinePos = topLevelNodePos(
        view,
        (node) => node.type.name === 'paragraph' && node.textContent === EDITABLE_MARKDOWN_BLANK_LINE_PLACEHOLDER,
      );
      view.dispatch(
        view.state.tr.setSelection(TextSelection.create(
          view.state.doc,
          blankLinePos + 1 + EDITABLE_MARKDOWN_BLANK_LINE_PLACEHOLDER.length,
        )),
      );

      const event = createArrowEvent('ArrowUp');
      const handled = handleMarkdownBlankLineKeyboardNavigation(view, event);

      expect(handled).toBe(true);
      expect(event.defaultPrevented).toBe(true);
      expect(view.state.selection).toBeInstanceOf(TextSelection);
      expect(view.state.selection.empty).toBe(true);
      expect(view.state.selection.$from.parent.textContent).toBe('List item');
      expect(view.state.selection.$from.parentOffset).toBe('List item'.length);
    } finally {
      await editor.destroy();
    }
  });

  it('moves from an editable markdown blank line to the nested blockquote line end on ArrowUp', async () => {
    const editor = await createEditor('Alpha');
    const view = editor.ctx.get(editorViewCtx);

    try {
      replaceWithNestedBlockquoteAndEditableBlankLineDocument(view);
      const blankLinePos = topLevelNodePos(
        view,
        (node) => node.type.name === 'paragraph' && node.textContent === EDITABLE_MARKDOWN_BLANK_LINE_PLACEHOLDER,
      );
      view.dispatch(
        view.state.tr.setSelection(TextSelection.create(
          view.state.doc,
          blankLinePos + 1 + EDITABLE_MARKDOWN_BLANK_LINE_PLACEHOLDER.length,
        )),
      );

      const event = createArrowEvent('ArrowUp');
      const handled = handleMarkdownBlankLineKeyboardNavigation(view, event);

      expect(handled).toBe(true);
      expect(event.defaultPrevented).toBe(true);
      expect(view.state.selection).toBeInstanceOf(TextSelection);
      expect(view.state.selection.empty).toBe(true);
      expect(view.state.selection.$from.parent.textContent).toBe('i');
      expect(view.state.selection.$from.parentOffset).toBe('i'.length);
    } finally {
      await editor.destroy();
    }
  });

  it('moves from an editable markdown blank line into an adjacent persisted blank line on ArrowUp', async () => {
    const editor = await createEditor('Alpha');
    const view = editor.ctx.get(editorViewCtx);

    try {
      replaceWithPersistedAndEditableBlankLineDocument(view);
      const blankLinePos = topLevelNodePos(
        view,
        (node) => node.type.name === 'paragraph' && node.textContent === EDITABLE_MARKDOWN_BLANK_LINE_PLACEHOLDER,
      );
      view.dispatch(
        view.state.tr.setSelection(TextSelection.create(
          view.state.doc,
          blankLinePos + 1 + EDITABLE_MARKDOWN_BLANK_LINE_PLACEHOLDER.length,
        )),
      );

      const event = createArrowEvent('ArrowUp');
      const handled = handleMarkdownBlankLineKeyboardNavigation(view, event);

      expect(handled).toBe(true);
      expect(event.defaultPrevented).toBe(true);
      expect(view.state.selection).toBeInstanceOf(TextSelection);
      expect(view.state.selection).not.toBeInstanceOf(NodeSelection);
      expect(view.state.selection.empty).toBe(true);
      expect(view.state.doc.child(1).type.name).toBe('paragraph');
      expect(view.state.doc.child(1).textContent).toBe(EDITABLE_MARKDOWN_BLANK_LINE_PLACEHOLDER);
      expect(view.state.selection.$from.parent).toBe(view.state.doc.child(1));
    } finally {
      await editor.destroy();
    }
  });
});
