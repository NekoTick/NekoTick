import {
  Editor,
  defaultValueCtx,
  editorViewCtx,
  remarkStringifyOptionsCtx,
  serializerCtx,
} from '@milkdown/kit/core';
import { commonmark } from '@milkdown/kit/preset/commonmark';
import { gfm, remarkGFMPlugin } from '@milkdown/kit/preset/gfm';
import { NodeSelection, TextSelection } from '@milkdown/kit/prose/state';
import { describe, expect, it } from 'vitest';
import {
  normalizeSerializedMarkdownDocument,
  stripTrailingNewlines,
} from '@/lib/notes/markdown/markdownSerializationUtils';
import { notesRemarkGfmOptions, notesRemarkStringifyOptions } from '../../config/stringifyOptions';
import { configureTheme } from '../../theme';
import { calloutPlugin } from '../callout';
import { codePlugin } from '../code';
import { toggleCodeBlockCollapsed } from '../code/codeBlockTransactions';
import { atomicBlockKeyboardNavigationPlugin } from '../cursor/atomicBlockKeyboardNavigationPlugin';
import {
  dispatchTailBlankClickAction,
  endBlankClickPlugin,
} from '../cursor/endBlankClickPlugin';
import { footnotePlugin } from '../footnote';
import { handleFootnoteDefinitionShortcutEnter } from '../footnote/footnoteInputRule';
import { frontmatterPlugin } from '../frontmatter';
import { collapsePlugin } from '../heading';
import { handleHorizontalRuleShortcutEnter } from '../hr/hrShortcutEnter';
import { mathPlugin } from '../math';
import { handleMathBlockShortcutEnter } from '../math/mathBlockEnterPlugin';
import { mermaidPlugin } from '../mermaid';
import { handleMermaidFenceEnter } from '../mermaid/mermaidEnterPlugin';
import { tocPlugin } from '../toc';
import { handleTocShortcutEnter } from '../toc/tocPlugin';
import { videoPlugin } from '../video';
import { applySlashCommand, type SlashCommandId } from '../slash/slashCommands';
import { replaceSelectionOrCurrentBlankTextBlockWithNode } from '../slash/slashInsertUtils';
import { moveSelectionAfterInsertedNode } from './insertedNodeSelection';

const blockInsertionPlugins = [
  ...calloutPlugin,
  ...codePlugin,
  ...footnotePlugin,
  ...frontmatterPlugin,
  ...mathPlugin,
  ...mermaidPlugin,
  ...tocPlugin,
  ...videoPlugin,
  atomicBlockKeyboardNavigationPlugin,
  endBlankClickPlugin,
  collapsePlugin,
];

async function createEditor(markdown = '') {
  const editor = Editor.make()
    .config((ctx) => {
      ctx.set(defaultValueCtx, markdown);
      ctx.update(remarkStringifyOptionsCtx, (prev) => ({
        ...prev,
        ...notesRemarkStringifyOptions,
      }));
      ctx.set(remarkGFMPlugin.options.key, notesRemarkGfmOptions);
    })
    .use(commonmark)
    .use(gfm)
    .use(configureTheme);

  for (const plugin of blockInsertionPlugins) {
    editor.use(plugin);
  }

  await editor.create();
  const view = editor.ctx.get(editorViewCtx);
  return { editor, view };
}

async function createEditorWithMiddleEmptyParagraph() {
  const { editor, view } = await createEditor();
  const { schema } = view.state;
  const heading = schema.nodes.heading.create({ level: 1 }, schema.text('Heading'));
  const paragraph = schema.nodes.paragraph.create();
  const code = schema.nodes.code_block.create({ language: 'code' }, schema.text('code'));
  const tr = view.state.tr.replaceWith(0, view.state.doc.content.size, [heading, paragraph, code]);
  view.dispatch(tr.setSelection(TextSelection.create(tr.doc, heading.nodeSize + 1)));
  return { editor, view };
}

type TestEditor = Awaited<ReturnType<typeof createEditor>>['editor'];

function serializeDocument(editor: TestEditor, doc: any): string {
  return stripTrailingNewlines(normalizeSerializedMarkdownDocument(
    editor.ctx.get(serializerCtx)(doc),
  ));
}

function serializeEditor(editor: TestEditor, view: any): string {
  return serializeDocument(editor, view.state.doc);
}

function expectTrailingEmptyParagraphDoesNotPersist(editor: TestEditor, view: any): void {
  const tail = view.state.doc.lastChild;
  expect(tail?.type.name).toBe('paragraph');
  expect(tail?.content.size).toBe(0);

  const tailPos = view.state.doc.content.size - (tail?.nodeSize ?? 0);
  const withoutTail = view.state.tr.delete(
    tailPos,
    view.state.doc.content.size,
  ).doc;
  expect(serializeEditor(editor, view)).toBe(serializeDocument(editor, withoutTail));
}

function setMiddleParagraphText(view: any, text: string): void {
  const heading = view.state.doc.firstChild;
  const code = view.state.doc.lastChild;
  const paragraph = view.state.schema.nodes.paragraph.create(
    null,
    view.state.schema.text(text),
  );
  if (!heading || !code) throw new Error('Expected heading and code block');

  const tr = view.state.tr.replaceWith(
    0,
    view.state.doc.content.size,
    [heading, paragraph, code],
  );
  view.dispatch(tr.setSelection(TextSelection.create(
    tr.doc,
    heading.nodeSize + 1 + text.length,
  )));
}

function setTrailingParagraphText(view: any, text: string): void {
  const { schema } = view.state;
  const heading = schema.nodes.heading.create({ level: 1 }, schema.text('Before'));
  const paragraph = schema.nodes.paragraph.create(null, schema.text(text));
  const tr = view.state.tr.replaceWith(0, view.state.doc.content.size, [heading, paragraph]);
  view.dispatch(tr.setSelection(TextSelection.create(
    tr.doc,
    heading.nodeSize + 1 + text.length,
  )));
}

function setTrailingEmptyParagraph(view: any): void {
  const { schema } = view.state;
  const heading = schema.nodes.heading.create({ level: 1 }, schema.text('Before'));
  const paragraph = schema.nodes.paragraph.create();
  const tr = view.state.tr.replaceWith(0, view.state.doc.content.size, [heading, paragraph]);
  view.dispatch(tr.setSelection(TextSelection.create(tr.doc, heading.nodeSize + 1)));
}

function typeText(view: any, input: string): void {
  for (const character of input) {
    const { from, to } = view.state.selection;
    let handled = false;
    view.someProp('handleTextInput', (handleTextInput: any) => {
      const didHandle = handleTextInput(view, from, to, character);
      handled = didHandle || handled;
      return didHandle;
    });
    if (!handled) view.dispatch(view.state.tr.insertText(character, from, to));
  }
}

function pressKey(view: any, key: string): boolean {
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
  });
  let handled = false;
  view.someProp('handleKeyDown', (handleKeyDown: any) => {
    if (handled) return handled;
    handled = handleKeyDown(view, event) || handled;
    return handled;
  });
  return handled;
}

function createCustomFollowingNode(view: any, typeName: string) {
  const { schema } = view.state;
  if (typeName === 'frontmatter') {
    return schema.nodes.frontmatter.create(null, schema.text('title: Demo'));
  }
  if (typeName === 'toc') {
    return schema.nodes.toc.create({ maxLevel: 6 });
  }
  if (typeName === 'mermaid') {
    return schema.nodes.mermaid.create({ code: 'graph TD\nA --> B' });
  }
  return null;
}

describe('block insertion content boundaries', () => {
  it.each([
    ['paragraph', 'Body', 'paragraph'],
    ['heading', '## Heading', 'heading'],
    ['ordered list', '1. Ordered', 'ordered_list'],
    ['bullet list', '- Bullet', 'bullet_list'],
    ['task list', '- [ ] Task', 'bullet_list'],
    ['blockquote', '> Quote', 'blockquote'],
    ['callout', '> 💡 Callout', 'callout'],
    [
      'frontmatter',
      ['```yaml-frontmatter vlaina-internal-frontmatter', 'title: Demo', '```'].join('\n'),
      'frontmatter',
    ],
    ['thematic break', '---', 'hr'],
    ['footnote definition', '[^1]: Footnote', 'footnote_definition'],
    ['raw HTML', '<div>Raw</div>', 'html_block'],
    ['code block', ['```ts', 'const value = 1;', '```'].join('\n'), 'code_block'],
    ['table', ['|A|B|', '|-|-|', '|1|2|'].join('\n'), 'table'],
    ['table of contents', '[TOC]', 'toc'],
    ['video', '![video](https://example.com/video.mp4)', 'video'],
    ['image', '![alt](https://example.com/image.png)', 'paragraph'],
    ['math block', ['$$', 'x + y', '$$'].join('\n'), 'math_block'],
    ['Mermaid', ['```mermaid', 'graph TD', 'A --> B', '```'].join('\n'), 'mermaid'],
  ] as const)(
    'moves selection without changing content before a following %s',
    async (_label, markdown, expectedType) => {
      const { editor, view } = await createEditor(markdown);

      try {
        const followingNode = createCustomFollowingNode(view, expectedType)
          ?? view.state.doc.firstChild;
        const insertedNode = view.state.schema.nodes.hr.create();
        if (!followingNode) throw new Error('Expected a following block');
        expect(followingNode.type.name).toBe(expectedType);

        view.dispatch(view.state.tr.replaceWith(
          0,
          view.state.doc.content.size,
          [insertedNode, followingNode],
        ));
        const originalDoc = view.state.doc;
        const movedTr = moveSelectionAfterInsertedNode({
          tr: view.state.tr,
          nodePos: 0,
          insertedNodeFallback: insertedNode,
          paragraphType: view.state.schema.nodes.paragraph,
        });

        expect(movedTr.doc.eq(originalDoc)).toBe(true);
        expect(movedTr.doc.childCount).toBe(2);
      } finally {
        await editor.destroy();
      }
    },
  );

  it('converts a following markdown blank line without adding a sibling block', async () => {
    const { editor, view } = await createEditor();

    try {
      const { schema } = view.state;
      const insertedNode = schema.nodes.hr.create();
      const blankLine = schema.nodes.html_block.create({
        value: '<!--vlaina-markdown-blank-line-->',
      });
      const heading = schema.nodes.heading.create({ level: 2 }, schema.text('After'));
      view.dispatch(view.state.tr.replaceWith(
        0,
        view.state.doc.content.size,
        [insertedNode, blankLine, heading],
      ));

      const movedTr = moveSelectionAfterInsertedNode({
        tr: view.state.tr,
        nodePos: 0,
        insertedNodeFallback: insertedNode,
        paragraphType: schema.nodes.paragraph,
      });

      expect(movedTr.doc.childCount).toBe(3);
      expect(Array.from(
        { length: movedTr.doc.childCount },
        (_, index) => movedTr.doc.child(index).type.name,
      )).toEqual(['hr', 'paragraph', 'heading']);
      expect(movedTr.doc.child(1).textContent).toBe('\u200B');
    } finally {
      await editor.destroy();
    }
  });

  it.each([
    ['callout', 'callout'],
    ['divider', 'hr'],
    ['table', 'table'],
    ['equation', 'math_block'],
    ['toc', 'toc'],
    ['mermaid', 'mermaid'],
    ['html-block', 'html_block'],
    ['footnote-definition', 'footnote_definition'],
  ] as Array<[SlashCommandId, string]>)('does not add a paragraph when inserting %s between existing blocks', async (commandId, expectedType) => {
    const { editor, view } = await createEditorWithMiddleEmptyParagraph();

    try {
      applySlashCommand(editor.ctx, commandId);

      expect(Array.from(
        { length: view.state.doc.childCount },
        (_, index) => view.state.doc.child(index).type.name,
      )).toEqual(['heading', expectedType, 'code_block']);
    } finally {
      await editor.destroy();
    }
  });

  it.each([
    ['math shortcut', '$$', 'math_block', handleMathBlockShortcutEnter],
    ['Mermaid shortcut', '```mermaid', 'mermaid', handleMermaidFenceEnter],
    ['table of contents shortcut', '[TOC]', 'toc', handleTocShortcutEnter],
    ['footnote definition shortcut', '[^1]:', 'footnote_definition', handleFootnoteDefinitionShortcutEnter],
  ] as const)('does not add a paragraph after the %s', async (_label, input, expectedType, runShortcut) => {
    const { editor, view } = await createEditorWithMiddleEmptyParagraph();

    try {
      setMiddleParagraphText(view, input);
      expect(runShortcut(view)).toBe(true);
      expect(Array.from(
        { length: view.state.doc.childCount },
        (_, index) => view.state.doc.child(index).type.name,
      )).toEqual(['heading', expectedType, 'code_block']);
    } finally {
      await editor.destroy();
    }
  });

  it('adds an empty paragraph after the thematic break shortcut when content follows', async () => {
    const { editor, view } = await createEditorWithMiddleEmptyParagraph();

    try {
      setMiddleParagraphText(view, '---');
      expect(handleHorizontalRuleShortcutEnter(view)).toBe(true);
      expect(Array.from(
        { length: view.state.doc.childCount },
        (_, index) => view.state.doc.child(index).type.name,
      )).toEqual(['heading', 'hr', 'paragraph', 'code_block']);
      expect(view.state.selection.$from.parent).toBe(view.state.doc.child(2));
    } finally {
      await editor.destroy();
    }
  });

  it('does not add a paragraph after typed video markdown', async () => {
    const { editor, view } = await createEditorWithMiddleEmptyParagraph();

    try {
      typeText(view, '![video](https://example.com/video.mp4)');
      expect(Array.from(
        { length: view.state.doc.childCount },
        (_, index) => view.state.doc.child(index).type.name,
      )).toEqual(['heading', 'video', 'code_block']);
    } finally {
      await editor.destroy();
    }
  });

  it('preserves adjacent authored blank lines when a Slash block replaces the current blank line', async () => {
    const { editor, view } = await createEditor();

    try {
      const { schema } = view.state;
      const heading = schema.nodes.heading.create({ level: 1 }, schema.text('Heading'));
      const blankLine = () => schema.nodes.html_block.create({
        value: '<!--vlaina-markdown-blank-line-->',
      });
      const editableBlankLine = schema.nodes.paragraph.create(null, schema.text('\u200B'));
      const code = schema.nodes.code_block.create({ language: 'code' }, schema.text('code'));
      const initial = [heading, blankLine(), editableBlankLine, blankLine(), code];
      const tr = view.state.tr.replaceWith(0, view.state.doc.content.size, initial);
      const editableBlankLinePos = heading.nodeSize + initial[1].nodeSize;
      view.dispatch(tr.setSelection(TextSelection.create(
        tr.doc,
        editableBlankLinePos + 2,
      )));

      const divider = schema.nodes.hr.create();
      view.dispatch(replaceSelectionOrCurrentBlankTextBlockWithNode(view.state, divider));

      expect(Array.from(
        { length: view.state.doc.childCount },
        (_, index) => view.state.doc.child(index).type.name,
      )).toEqual(['heading', 'html_block', 'hr', 'html_block', 'code_block']);
      expect(serializeEditor(editor, view)).toBe([
        '# Heading',
        '',
        '---',
        '',
        '```code',
        'code',
        '```',
      ].join('\n'));
    } finally {
      await editor.destroy();
    }
  });

  it.each([
    ['thematic break', '---', handleHorizontalRuleShortcutEnter, ['# Before', '---'].join('\n')],
    ['footnote definition', '[^1]:', handleFootnoteDefinitionShortcutEnter, ['# Before', '[^1]:'].join('\n')],
  ] as const)('does not persist the trailing cursor paragraph after a %s shortcut', async (_label, input, runShortcut, expected) => {
    const { editor, view } = await createEditor();

    try {
      setTrailingParagraphText(view, input);
      expect(runShortcut(view)).toBe(true);
      expectTrailingEmptyParagraphDoesNotPersist(editor, view);
      expect(serializeEditor(editor, view)).toBe(expected);
    } finally {
      await editor.destroy();
    }
  });

  it('does not persist the trailing cursor paragraph after typed video markdown', async () => {
    const { editor, view } = await createEditor();

    try {
      typeText(view, '![video](https://example.com/video.mp4)');
      expectTrailingEmptyParagraphDoesNotPersist(editor, view);
      expect(serializeEditor(editor, view)).toBe('![video](https://example.com/video.mp4)');
    } finally {
      await editor.destroy();
    }
  });

  it.each([
    ['math', '$$', handleMathBlockShortcutEnter],
    ['Mermaid', '```mermaid', handleMermaidFenceEnter],
    ['table of contents', '[TOC]', handleTocShortcutEnter],
  ] as const)(
    'does not persist the trailing cursor paragraph after a %s shortcut',
    async (_label, input, runShortcut) => {
      const { editor, view } = await createEditor();

      try {
        setTrailingParagraphText(view, input);
        expect(runShortcut(view)).toBe(true);
        expectTrailingEmptyParagraphDoesNotPersist(editor, view);
      } finally {
        await editor.destroy();
      }
    },
  );

  it('does not persist the trailing cursor paragraph after a Slash block insertion', async () => {
    const { editor, view } = await createEditor();

    try {
      setTrailingEmptyParagraph(view);
      applySlashCommand(editor.ctx, 'toc');
      expectTrailingEmptyParagraphDoesNotPersist(editor, view);
    } finally {
      await editor.destroy();
    }
  });

  it('does not persist the trailing cursor paragraph created by code collapse', async () => {
    const { editor, view } = await createEditor();

    try {
      const code = view.state.schema.nodes.code_block.create(
        {
          language: 'ts',
          lineNumbers: true,
          wrap: false,
          collapsed: false,
        },
        view.state.schema.text('const value = 1;'),
      );
      const tr = view.state.tr.replaceWith(0, view.state.doc.content.size, code);
      view.dispatch(tr.setSelection(TextSelection.create(tr.doc, 1)));

      toggleCodeBlockCollapsed(view, 0, false);

      expect(view.state.doc.firstChild?.attrs.collapsed).toBe(true);
      expectTrailingEmptyParagraphDoesNotPersist(editor, view);
    } finally {
      await editor.destroy();
    }
  });

  it('does not persist the trailing cursor paragraph created by atomic navigation', async () => {
    const { editor, view } = await createEditor();

    try {
      const math = view.state.schema.nodes.math_block.create({ latex: 'x + y' });
      const tr = view.state.tr.replaceWith(0, view.state.doc.content.size, math);
      view.dispatch(tr.setSelection(NodeSelection.create(tr.doc, 0)));

      expect(pressKey(view, 'ArrowDown')).toBe(true);
      expectTrailingEmptyParagraphDoesNotPersist(editor, view);
    } finally {
      await editor.destroy();
    }
  });

  it('does not persist the temporary paragraph created by a bottom blank click', async () => {
    const { editor, view } = await createEditor('# Before');

    try {
      expect(dispatchTailBlankClickAction(view)).toBe(true);
      expectTrailingEmptyParagraphDoesNotPersist(editor, view);
    } finally {
      await editor.destroy();
    }
  });

  it('does not persist the trailing cursor paragraph created when reopening a collapsed heading', async () => {
    const { editor, view } = await createEditor(['# Heading', 'Body'].join('\n'));

    try {
      const toggle = view.dom.querySelector('.heading-toggle-btn');
      if (!(toggle instanceof HTMLElement)) throw new Error('Expected heading collapse control');
      toggle.dispatchEvent(new PointerEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
      }));

      const heading = view.state.doc.firstChild;
      if (!heading) throw new Error('Expected heading');
      view.dispatch(view.state.tr.setSelection(TextSelection.create(
        view.state.doc,
        heading.nodeSize + 1,
      )));

      expectTrailingEmptyParagraphDoesNotPersist(editor, view);
    } finally {
      await editor.destroy();
    }
  });
});
