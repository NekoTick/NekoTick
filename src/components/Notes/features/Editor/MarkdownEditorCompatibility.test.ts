import { describe, expect, it } from 'vitest';
import { act, waitFor } from '@testing-library/react';
import {
  Editor,
  defaultValueCtx,
  editorViewCtx,
  parserCtx,
  remarkStringifyOptionsCtx,
  serializerCtx,
} from '@milkdown/kit/core';
import { commonmark } from '@milkdown/kit/preset/commonmark';
import { gfm } from '@milkdown/kit/preset/gfm';
import { history } from '@milkdown/kit/plugin/history';
import { listener } from '@milkdown/kit/plugin/listener';
import { tableBlock } from '@milkdown/kit/component/table-block';
import { GapCursor } from '@milkdown/kit/prose/gapcursor';
import type { EditorView } from '@milkdown/kit/prose/view';
import type { Node as ProseNode } from '@milkdown/kit/prose/model';
import { redo, undo } from '@milkdown/kit/prose/history';
import { TextSelection } from '@milkdown/kit/prose/state';
import { notesRemarkStringifyOptions } from './config/stringifyOptions';
import { customPlugins } from './config/plugins';
import { configureTheme } from './theme';
import {
  normalizeAlternativeMathBlockFences,
  preserveMarkdownBlankLinesForEditor,
} from '@/lib/notes/markdown/markdownSerializationUtils';
import { normalizeLeadingFrontmatterMarkdown } from './plugins/frontmatter/frontmatterMarkdown';
import {
  isEditorMarkdownEquivalentToNoteContent,
  normalizeInitialEditorSelection,
  replaceEditorMarkdown,
} from './milkdownEditorMarkdownReplacement';
import { wikiLinkExpansionPluginKey } from './plugins/links/wiki-link/wikiLinkExpansionPlugin';
import { serializeEditorMarkdownSnapshot } from './utils/pendingMarkdownUpdate';

function typeText(view: EditorView, input: string): void {
  for (const text of input) {
    const { from, to } = view.state.selection;
    let handled = false;
    view.someProp('handleTextInput', (handleTextInput: any) => {
      handled = handleTextInput(view, from, to, text) || handled;
      return handled;
    });
    if (!handled) view.dispatch(view.state.tr.insertText(text, from, to));
  }
}

function pressEnter(view: EditorView): boolean {
  const event = new KeyboardEvent('keydown', {
    key: 'Enter',
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

function prepareEditorMarkdown(markdown: string): string {
  return preserveMarkdownBlankLinesForEditor(
    normalizeLeadingFrontmatterMarkdown(
      normalizeAlternativeMathBlockFences(markdown)
    )
  );
}

function stripSourceBoundaryMetadata(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripSourceBoundaryMetadata);
  if (!value || typeof value !== 'object') return value;

  return Object.fromEntries(
    Object.entries(value).flatMap(([key, nestedValue]) =>
      key === 'vlainaSourceTightBefore' || key === 'vlainaSourceHtmlBlankLineCountAfter'
        ? []
        : [[key, stripSourceBoundaryMetadata(nestedValue)]]
    )
  );
}

async function createEditor(markdown: string) {
  const defaultValue = prepareEditorMarkdown(markdown);
  const editor = Editor.make()
    .config((ctx) => {
      ctx.set(defaultValueCtx, defaultValue);
      ctx.update(remarkStringifyOptionsCtx, (prev) => ({
        ...prev,
        ...notesRemarkStringifyOptions,
      }));
    })
    .use(commonmark)
    .use(gfm)
    .use(history)
    .use(listener)
    .use(configureTheme)
    .use(tableBlock)
    .use(customPlugins);

  await act(async () => {
    await editor.create();
  });
  return editor;
}

async function destroyEditor(editor: { destroy: () => Promise<unknown> | unknown }) {
  await act(async () => {
    await editor.destroy();
  });
}

describe('MarkdownEditor compatibility', () => {
  it('opens a horizontal-rule-only document with a gap cursor without changing Markdown', async () => {
    const source = '---';
    const editor = await createEditor(source);
    const view = editor.ctx.get(editorViewCtx);
    const serializer = editor.ctx.get(serializerCtx);

    expect(normalizeInitialEditorSelection(view)).toBe(true);
    expect(view.state.selection).toBeInstanceOf(GapCursor);
    expect(view.state.selection.from).toBe(view.state.doc.content.size);
    expect(isEditorMarkdownEquivalentToNoteContent(serializer(view.state.doc), source)).toBe(true);

    expect(replaceEditorMarkdown(editor.ctx, source)).toBe(true);
    expect(view.state.selection).toBeInstanceOf(GapCursor);
    expect(view.state.selection.from).toBe(view.state.doc.content.size);

    await destroyEditor(editor);
  });

  it('keeps authored punctuation escapes when rich text is appended', async () => {
    const source = [
      'Authored escapes:',
      'left\\!right left\\@right left\\_right left\\|right',
      '\\# literal heading',
      '2\\. literal list item',
      '\\*literal emphasis\\*',
    ].join('\n');
    const editor = await createEditor(source);
    const view = editor.ctx.get(editorViewCtx);
    const serializer = editor.ctx.get(serializerCtx);

    view.dispatch(view.state.tr.setSelection(TextSelection.atEnd(view.state.doc)));
    typeText(view, ' edited');

    const rawSerialized = serializer(view.state.doc);
    expect(serializeEditorMarkdownSnapshot(rawSerialized, source)).toBe(
      `${source} edited`,
    );
    await destroyEditor(editor);
  });

  it.each([
    {
      name: 'unescaped input',
      source: [
        '<img src="./assets/example.png" alt="Example" width="61%" />Intro',
        '2. Second item',
        '3. Third item',
        '4. Fourth item',
      ].join('\n'),
    },
    {
      name: 'legacy serializer escapes',
      source: [
        '<img src="./assets/example.png" alt="Example" width="61%" />Intro',
        '2\\. Second item',
        '3\\. Third item',
        '4\\. Fourth item',
      ].join('\n'),
    },
  ])('reopens an interrupted ordered list without synthetic backslashes: $name', async ({ source }) => {
    const expected = [
      '<img src="./assets/example.png" alt="Example" width="61%" />Intro',
      '',
      '2. Second item',
      '3. Third item',
      '4. Fourth item',
    ].join('\n');
    const editor = await createEditor(source);
    const view = editor.ctx.get(editorViewCtx);
    const serializer = editor.ctx.get(serializerCtx);

    expect(view.state.doc.childCount).toBe(2);
    expect(view.state.doc.child(1).type.name).toBe('ordered_list');
    expect(view.state.doc.child(1).attrs.order).toBe(2);
    expect(serializeEditorMarkdownSnapshot(serializer(view.state.doc), source)).toBe(expected);
    await destroyEditor(editor);

    const reopenedEditor = await createEditor(expected);
    const reopenedView = reopenedEditor.ctx.get(editorViewCtx);
    const reopenedSerializer = reopenedEditor.ctx.get(serializerCtx);

    expect(reopenedView.state.doc.child(1).type.name).toBe('ordered_list');
    expect(serializeEditorMarkdownSnapshot(reopenedSerializer(reopenedView.state.doc), expected))
      .toBe(expected);
    await destroyEditor(reopenedEditor);
  });

  it('reopens an interrupted blockquote ordered list without synthetic backslashes', async () => {
    const source = ['> Intro', '> 2\\. Second item', '> 3\\. Third item'].join('\n');
    const expected = ['> Intro', '>', '> 2. Second item', '> 3. Third item'].join('\n');
    const editor = await createEditor(source);
    const view = editor.ctx.get(editorViewCtx);
    const serializer = editor.ctx.get(serializerCtx);
    const blockquote = view.state.doc.firstChild;

    expect(blockquote?.type.name).toBe('blockquote');
    expect(blockquote?.child(1).type.name).toBe('ordered_list');
    expect(blockquote?.child(1).attrs.order).toBe(2);
    expect(serializeEditorMarkdownSnapshot(serializer(view.state.doc), source)).toBe(expected);
    await destroyEditor(editor);

    const reopenedEditor = await createEditor(expected);
    const reopenedView = reopenedEditor.ctx.get(editorViewCtx);
    const reopenedSerializer = reopenedEditor.ctx.get(serializerCtx);

    expect(reopenedView.state.doc.firstChild?.child(1).type.name).toBe('ordered_list');
    expect(serializeEditorMarkdownSnapshot(reopenedSerializer(reopenedView.state.doc), expected))
      .toBe(expected);
    await destroyEditor(reopenedEditor);
  });

  it('keeps image paragraph spacing before a later heading across reload', async () => {
    const markdown = [
      '![Image](image.png "Title")',
      '',
      'Hard break  ',
      'continued.',
      '',
      '',
      'Setext heading',
      '----------------',
    ].join('\n');
    const editor = await createEditor(markdown);
    const view = editor.ctx.get(editorViewCtx);
    const serializer = editor.ctx.get(serializerCtx);

    expect(serializeEditorMarkdownSnapshot(serializer(view.state.doc), markdown)).toBe(markdown);
    await destroyEditor(editor);

    const reopenedEditor = await createEditor(markdown);
    const reopenedView = reopenedEditor.ctx.get(editorViewCtx);
    const reopenedSerializer = reopenedEditor.ctx.get(serializerCtx);

    expect(serializeEditorMarkdownSnapshot(reopenedSerializer(reopenedView.state.doc), markdown))
      .toBe(markdown);
    await destroyEditor(reopenedEditor);
  });

  it.each([
    ['table of contents before a thematic break', ['[TOC]', '___']],
    ['list code before an HTML comment', [
      '7. ```md',
      '   code',
      '   ```',
      '',
      '<!-- User comment -->',
    ]],
    ['frontmatter before an HTML processing instruction', [
      '---',
      'title: Example',
      '---',
      '',
      '<?note value?>',
    ]],
    ['list raw HTML before a table', [
      '- <textarea>',
      '  raw HTML',
      '  </textarea>',
      '| Key | Value |',
      '| --- | ----: |',
      '| row |     1 |',
    ]],
    ['footnote raw HTML before an image', [
      'Footnote[^html].',
      '',
      '[^html]: <textarea>',
      '    raw HTML',
      '    </textarea>',
      '![Image](image.png)',
    ]],
  ])('keeps %s byte-stable across reload', async (_label, lines) => {
    const markdown = lines.join('\n');
    const editor = await createEditor(markdown);
    const view = editor.ctx.get(editorViewCtx);
    const serializer = editor.ctx.get(serializerCtx);

    expect(serializeEditorMarkdownSnapshot(serializer(view.state.doc), markdown)).toBe(markdown);
    await destroyEditor(editor);

    const reopenedEditor = await createEditor(markdown);
    const reopenedView = reopenedEditor.ctx.get(editorViewCtx);
    const reopenedSerializer = reopenedEditor.ctx.get(serializerCtx);

    expect(serializeEditorMarkdownSnapshot(reopenedSerializer(reopenedView.state.doc), markdown))
      .toBe(markdown);
    await destroyEditor(reopenedEditor);
  });

  it.each([
    ['list math', ['> - \\[', '>   x = y', '>   \\]', 'Body']],
    ['fenced code', ['> ```', '> code', '> ```', 'Body']],
    ['heading', ['> ## Heading', 'Body']],
    ['nested heading', ['> > ## Heading', 'Body']],
  ])('keeps the tight boundary after a blockquote ending in %s', async (_label, lines) => {
    const markdown = lines.join('\n');
    const editor = await createEditor(markdown);
    const view = editor.ctx.get(editorViewCtx);
    const serializer = editor.ctx.get(serializerCtx);

    expect(view.state.doc.childCount).toBe(2);
    expect(serializeEditorMarkdownSnapshot(serializer(view.state.doc), markdown)).toBe(markdown);
    await destroyEditor(editor);

    const reopenedEditor = await createEditor(markdown);
    const reopenedView = reopenedEditor.ctx.get(editorViewCtx);
    const reopenedSerializer = reopenedEditor.ctx.get(serializerCtx);

    expect(reopenedView.state.doc.childCount).toBe(2);
    expect(serializeEditorMarkdownSnapshot(reopenedSerializer(reopenedView.state.doc), markdown))
      .toBe(markdown);
    await destroyEditor(reopenedEditor);
  });

  it.each([
    ['root dollar math', '$$x = y$$'],
    ['ordered-list dollar math', '7. $$x = y$$'],
    ['bullet-list bracket math', '- \\[x = y\\]'],
  ])('keeps a blank between %s and an image across reload', async (_label, math) => {
    const markdown = [math, '', '![Image](image.png "Title")'].join('\n');
    const editor = await createEditor(markdown);
    const view = editor.ctx.get(editorViewCtx);
    const serializer = editor.ctx.get(serializerCtx);

    expect(serializeEditorMarkdownSnapshot(serializer(view.state.doc), markdown)).toBe(markdown);
    await destroyEditor(editor);

    const reopenedEditor = await createEditor(markdown);
    const reopenedView = reopenedEditor.ctx.get(editorViewCtx);
    const reopenedSerializer = reopenedEditor.ctx.get(serializerCtx);

    expect(serializeEditorMarkdownSnapshot(reopenedSerializer(reopenedView.state.doc), markdown))
      .toBe(markdown);
    await destroyEditor(reopenedEditor);
  });

  it('preserves user-authored comments that share editor placeholder names', async () => {
    const markdown = [
      '# User comments',
      '<!--vlaina-markdown-blank-line-->',
      '<!--vlaina-markdown-tight-heading-->',
      '<!--vlaina-rendered-html-boundary-blank-line-->',
      '<!--vlaina-user-authored-internal-comment:literal-->',
      '$$',
      '<!--vlaina-markdown-blank-line-->',
      '$$',
      '- Parent',
      '  - $$',
      '    <!--vlaina-markdown-tight-heading-->',
      '    $$',
      '',
      'After comments.',
    ].join('\n');
    const editor = await createEditor(markdown);
    const view = editor.ctx.get(editorViewCtx);
    const serializer = editor.ctx.get(serializerCtx);

    expect(serializeEditorMarkdownSnapshot(serializer(view.state.doc), markdown)).toBe(markdown);
    await destroyEditor(editor);
  });

  it('keeps the reported mixed-list note equivalent after serialization', async () => {
    const markdown = [
      '1. 国内的==下载蹭小青==蛙',
      '2. 买域名',
      '   1. vlaina.io',
      '   2. vlaina.cn',
      '   3. vlaina.md',
      '',
      'sk-test-randomized-placeholder-token-1234567890',
      'm',
      '😁',
      '放但是发生的”我”在”的“的',
    ].join('\n');
    const editor = await createEditor(markdown);
    const view = editor.ctx.get(editorViewCtx);
    const serializer = editor.ctx.get(serializerCtx);
    const serialized = serializer(view.state.doc);
    expect(isEditorMarkdownEquivalentToNoteContent(serialized, markdown)).toBe(true);
    await destroyEditor(editor);
  });

  it('migrates a legacy escaped number run and continues the ordered list across reload', async () => {
    const markdown = [
      '7\\. Position limits',
      '8\\. Project credits',
      '9\\. Window sizing',
      '10\\. C rewrite',
    ].join('\n');
    const migrated = [
      '7. Position limits',
      '8. Project credits',
      '9. Window sizing',
      '10. C rewrite',
      '11. test',
    ].join('\n');
    const editor = await createEditor(markdown);
    const view = editor.ctx.get(editorViewCtx);
    const serializer = editor.ctx.get(serializerCtx);

    expect(view.state.doc.childCount).toBe(1);
    expect(view.state.doc.firstChild?.type.name).toBe('ordered_list');
    expect(view.state.doc.firstChild?.attrs.order).toBe(7);
    view.dispatch(view.state.tr.setSelection(TextSelection.atEnd(view.state.doc)));
    expect(pressEnter(view)).toBe(true);
    typeText(view, 'test');

    expect(view.state.doc.lastChild?.type.name).toBe('ordered_list');
    const saved = serializeEditorMarkdownSnapshot(serializer(view.state.doc), markdown);
    expect(saved).toBe(migrated);

    await destroyEditor(editor);

    const reopenedEditor = await createEditor(saved);
    const reopenedView = reopenedEditor.ctx.get(editorViewCtx);
    const reopenedSerializer = reopenedEditor.ctx.get(serializerCtx);

    expect(reopenedView.state.doc.childCount).toBe(1);
    expect(reopenedView.state.doc.lastChild?.type.name).toBe('ordered_list');
    expect(serializeEditorMarkdownSnapshot(reopenedSerializer(reopenedView.state.doc), saved)).toBe(saved);
    await destroyEditor(reopenedEditor);
  });

  it.each([
    ['ordered list', '1. ', 'ordered_list', '1.', '\n\n'],
    ['custom-start ordered list', '11. ', 'ordered_list', '11.', '\n\n'],
    ['bullet list', '- ', 'bullet_list', '-', '\n\n'],
    ['task list', '- [ ] ', 'bullet_list', '- [ ]', '\n'],
  ])('keeps a newly typed empty %s after a paragraph across reload', async (
    _label,
    input,
    listNodeType,
    marker,
    separator,
  ) => {
    const markdown = 'Paragraph before the list.';
    const editor = await createEditor(markdown);
    const view = editor.ctx.get(editorViewCtx);
    const serializer = editor.ctx.get(serializerCtx);

    view.dispatch(view.state.tr.setSelection(TextSelection.atEnd(view.state.doc)));
    expect(pressEnter(view)).toBe(true);
    typeText(view, input);

    expect(view.state.doc.lastChild?.type.name).toBe(listNodeType);
    const saved = serializeEditorMarkdownSnapshot(serializer(view.state.doc), markdown);
    expect(saved).toBe(`${markdown}${separator}${marker}`);

    await destroyEditor(editor);

    const reopenedEditor = await createEditor(saved);
    const reopenedView = reopenedEditor.ctx.get(editorViewCtx);

    expect(reopenedView.state.doc.childCount).toBe(2);
    expect(reopenedView.state.doc.lastChild?.type.name).toBe(listNodeType);
    await destroyEditor(reopenedEditor);
  });

  it('keeps editor-created root-block boundaries stable across reload', async () => {
    const blockCases = [
      ['heading', '## Heading'],
      ['empty heading', '##'],
      ['ordered list', '1. Ordered'],
      ['zero-start ordered list', '0. Ordered'],
      ['custom-start ordered list', '11. Ordered'],
      ['maximum-start ordered list', '999999999. Ordered'],
      ['parenthesized ordered list', '7) Ordered'],
      ['bullet list', '- Bullet'],
      ['multiline bullet list', ['- First line', '  continuation'].join('\n')],
      ['nested bullet list', ['- Parent', '  - Child'].join('\n')],
      ['list with fenced code', [
        '- Item',
        '',
        '  ```ts',
        '  const value = 1;',
        '  ```',
      ].join('\n')],
      ['task list', '- [ ] Task'],
      ['blockquote', '> Quote'],
      ['empty blockquote', '>'],
      ['callout', '> 💡 Callout'],
      ['thematic break', '---'],
      ['table', ['| A | B |', '| - | - |', '| 1 | 2 |'].join('\n')],
      ['fenced code', ['```ts', 'const value = 1;', '```'].join('\n')],
      ['empty fenced code', ['```', '```'].join('\n')],
      ['indented code', '    const value = 1;'],
      ['display math', ['$$', 'x + y', '$$'].join('\n')],
      ['empty display math', ['$$', '$$'].join('\n')],
      ['footnote definition', '[^note]: Footnote body.'],
      ['multi-paragraph footnote definition', [
        '[^note]: First paragraph.',
        '',
        '    Second paragraph.',
      ].join('\n')],
      ['definition list', ['Term', '', ': Definition'].join('\n')],
      ['table of contents', '[TOC]'],
      ['video', '![video](https://example.test/video.mp4)'],
      ['image', '![alt](image.png)'],
      ['Mermaid', ['```mermaid', 'flowchart TD', 'A --> B', '```'].join('\n')],
      ['HTML comment', '<!-- User comment -->'],
      ['HTML processing instruction', '<?note value?>'],
      ['HTML declaration', '<!doctype html>'],
      ['raw HTML', ['<pre>', 'raw', '</pre>'].join('\n')],
    ] as const;
    const editor = await createEditor('');

    try {
      const view = editor.ctx.get(editorViewCtx);
      const parser = editor.ctx.get(parserCtx);
      const serializer = editor.ctx.get(serializerCtx);
      const paragraph = parser('Paragraph boundary.').firstChild;
      expect(paragraph).not.toBeNull();
      const unstableBoundaries: Array<{
        actual: string;
        boundary: string;
        expected: string;
        pipeline: 'markdown-parser' | 'editor-reopen';
        serialized: string;
        saved: string;
      }> = [];
      const parsedBlockCases = blockCases.map(([name, markdown]) => {
        const blockDoc = parser(markdown);
        expect(blockDoc.childCount, name).toBe(1);
        const block = blockDoc.firstChild;
        expect(block, name).not.toBeNull();
        return { block: block!, name };
      });

      const checkBoundary = (
        leftName: string,
        left: ProseNode,
        rightName: string,
        right: ProseNode,
      ) => {
        const generatedDoc = view.state.schema.topNodeType.create(null, [left, right]);
        const serialized = serializer(generatedDoc);
        const saved = serializeEditorMarkdownSnapshot(serialized, '');
        const generatedJson = stripSourceBoundaryMetadata(generatedDoc.toJSON());
        const reopenedDocs = [
          ['markdown-parser', parser(saved)],
          ['editor-reopen', parser(prepareEditorMarkdown(saved))],
        ] as const;

        for (const [pipeline, reopenedDoc] of reopenedDocs) {
          const reopenedJson = stripSourceBoundaryMetadata(reopenedDoc.toJSON());
          if (JSON.stringify(reopenedJson) !== JSON.stringify(generatedJson)) {
            unstableBoundaries.push({
              actual: reopenedDoc.toString(),
              boundary: `${leftName} -> ${rightName}`,
              expected: generatedDoc.toString(),
              pipeline,
              serialized,
              saved,
            });
          }
        }
      };

      for (const { block, name } of parsedBlockCases) {
        checkBoundary(name, block, 'paragraph', paragraph!);
        checkBoundary('paragraph', paragraph!, name, block);
      }

      const pairwiseNames = new Set([
        'heading',
        'custom-start ordered list',
        'bullet list',
        'task list',
        'blockquote',
        'callout',
        'thematic break',
        'table',
        'fenced code',
        'display math',
        'footnote definition',
        'definition list',
        'table of contents',
        'video',
        'image',
        'Mermaid',
        'HTML comment',
        'HTML processing instruction',
        'HTML declaration',
        'raw HTML',
      ]);
      const pairwiseCases = parsedBlockCases.filter(({ name }) => pairwiseNames.has(name));
      for (const left of pairwiseCases) {
        for (const right of pairwiseCases) {
          if (left.block.type === right.block.type) continue;
          checkBoundary(left.name, left.block, right.name, right.block);
        }
      }

      expect(unstableBoundaries).toEqual([]);
    } finally {
      await destroyEditor(editor);
    }
  });

  it('opens supported math delimiters and math code fences as editable math nodes', async () => {
    const editor = await createEditor([
      'Inline \\(x+y\\).',
      '',
      '\\[',
      '\\ce{H2O}',
      '\\]',
      '',
      '$$x^2$$',
      '',
      '```math',
      '\\frac{1}{2}',
      '```',
      '',
      '```latex',
      '\\documentclass{article}',
      '```',
    ].join('\n'));
    const view = editor.ctx.get(editorViewCtx);

    expect(view.dom.querySelectorAll('[data-type="math-inline"]')).toHaveLength(1);
    expect(view.dom.querySelectorAll('[data-type="math-block"]')).toHaveLength(3);
    expect(view.dom.querySelector('[data-type="math-block"] .math-error')).toBeNull();
    expect(view.dom.querySelector('.code-block-container[data-language="tex"]')).toBeInstanceOf(HTMLElement);

    await destroyEditor(editor);
  });

  it('adds Typora and Obsidian theme alias classes to the editor root', async () => {
    const editor = await createEditor('# Theme aliases');

    const view = editor.ctx.get(editorViewCtx);
    const themeRoot = view.dom.closest<HTMLElement>('[data-markdown-theme-root="true"]')
      ?? view.dom.querySelector<HTMLElement>('[data-markdown-theme-root="true"]');

    expect(themeRoot).toBeInstanceOf(HTMLElement);
    expect(themeRoot?.id).toBe('write');
    expect(themeRoot?.classList.contains('done')).toBe(true);
    expect(themeRoot?.classList.contains('max')).toBe(true);
    expect(themeRoot?.classList.contains('markdown-preview-view')).toBe(true);
    expect(themeRoot?.classList.contains('markdown-rendered')).toBe(true);
    expect(themeRoot?.classList.contains('markdown-reading-view')).toBe(true);
    expect(themeRoot?.classList.contains('markdown-preview-section')).toBe(true);
    expect(themeRoot?.classList.contains('markdown-source-view')).toBe(true);
    expect(themeRoot?.classList.contains('cm-s-obsidian')).toBe(true);
    expect(themeRoot?.classList.contains('mod-cm6')).toBe(true);
    expect(themeRoot?.classList.contains('is-live-preview')).toBe(true);
    expect(themeRoot?.classList.contains('is-readable-line-width')).toBe(true);
    await destroyEditor(editor);
  });

  it('adds Typora and Obsidian theme alias classes to common markdown nodes', async () => {
    const editor = await createEditor([
      '---',
      'title: Demo',
      '---',
      '',
      '# Heading',
      '',
      'Paragraph with `inline code`, #project/tag, [external](https://example.com), [wx](weixin://), and [local](docs/page.md).',
      '',
      '> quote',
      '',
      '---',
      '',
      '- bullet item',
      '1. ordered item',
      '',
      '- [x] done',
      '',
      '![Alt](./assets/demo.png)',
      '',
      '> 💡 Important note',
      '',
      '$$',
      'x^2',
      '$$',
      '',
      '```ts',
      'const a = 1;',
      '```',
      '',
      '<div>',
      '<p>HTML Block</p>',
      '</div>',
    ].join('\n'));

    const view = editor.ctx.get(editorViewCtx);

    const frontmatter = view.dom.querySelector('.frontmatter-block-container.md-meta-block');
    expect(frontmatter).toBeInstanceOf(HTMLElement);

    const heading = view.dom.querySelector('h1');
    expect(heading?.classList.contains('HyperMD-header')).toBe(true);
    expect(heading?.classList.contains('HyperMD-header-1')).toBe(true);
    expect(heading?.classList.contains('cm-header')).toBe(true);
    expect(heading?.classList.contains('cm-header-1')).toBe(true);
    expect(heading?.classList.contains('cm-line')).toBe(true);

    const paragraph = view.dom.querySelector('p.md-p.cm-line');
    expect(paragraph).toBeInstanceOf(HTMLParagraphElement);
    expect(paragraph?.textContent).toContain('Paragraph with');
    expect(paragraph?.classList.contains('first-p')).toBe(false);

    const inlineCode = view.dom.querySelector('p code.v-std-code.cm-inline-code');
    expect(inlineCode).toBeInstanceOf(HTMLElement);
    expect(inlineCode?.textContent).toBe('inline code');

    const tagToken = view.dom.querySelector('.editor-tag-token.tag.cm-hashtag.cm-meta.v-tag[data-editor-tag-token="true"]');
    expect(tagToken).toBeInstanceOf(HTMLElement);
    expect(tagToken?.textContent).toBe('#project/tag');

    const externalLink = view.dom.querySelector('a[href="https://example.com"].external-link');
    expect(externalLink).toBeInstanceOf(HTMLAnchorElement);
    const weixinLink = view.dom.querySelector('a[href="weixin://"].external-link');
    expect(weixinLink).toBeInstanceOf(HTMLAnchorElement);
    const localLink = view.dom.querySelector('a[href="docs/page.md"]');
    expect(localLink).toBeInstanceOf(HTMLAnchorElement);
    expect(localLink?.classList.contains('external-link')).toBe(false);
    expect(localLink?.classList.contains('internal-link')).toBe(true);

    const quote = view.dom.querySelector('blockquote');
    expect(quote?.classList.contains('v-q')).toBe(true);
    expect(quote?.classList.contains('HyperMD-quote')).toBe(true);
    expect(quote?.classList.contains('cm-hmd-indent-in-quote')).toBe(true);
    expect(quote?.classList.contains('cm-line')).toBe(true);

    const hr = view.dom.querySelector('.md-hr[data-type="hr"] > hr');
    expect(hr).toBeInstanceOf(HTMLHRElement);

    const listItems = Array.from(view.dom.querySelectorAll('li.HyperMD-list-line.cm-line'));
    expect(listItems.length).toBeGreaterThanOrEqual(3);

    const checkedTask = view.dom.querySelector('li.md-task-list-item.task-list-item.HyperMD-task-line.is-checked');
    expect(checkedTask).toBeInstanceOf(HTMLLIElement);
    expect(checkedTask?.classList.contains('HyperMD-list-line')).toBe(true);
    expect(checkedTask?.classList.contains('cm-line')).toBe(true);
    expect(checkedTask?.getAttribute('data-task')).toBe('x');
    expect(checkedTask?.getAttribute('data-checked')).toBe('true');
    expect(checkedTask?.closest('ul')?.classList.contains('contains-task-list')).toBe(true);
    expect(checkedTask?.closest('ul')?.classList.contains('has-list-bullet')).toBe(true);

    const image = view.dom.querySelector('.image-block-container.md-image.image-embed[data-src="./assets/demo.png"]');
    expect(image).toBeInstanceOf(HTMLElement);
    expect(image?.getAttribute('src')).toBe('./assets/demo.png');

    const callout = view.dom.querySelector('.callout[data-callout][data-callout-metadata]');
    expect(callout).toBeInstanceOf(HTMLElement);
    expect(callout?.classList.contains('md-alert')).toBe(true);
    expect(callout?.classList.contains('md-alert-warning')).toBe(true);
    const calloutTitle = callout?.querySelector('.callout-title');
    expect(calloutTitle).toBeInstanceOf(HTMLElement);
    expect(calloutTitle?.classList.contains('md-alert-text-container')).toBe(true);
    expect(calloutTitle?.classList.contains('md-alert-text')).toBe(true);
    expect(calloutTitle?.classList.contains('md-alert-text-warning')).toBe(true);
    expect(callout?.querySelector('.callout-title-inner')).toBeInstanceOf(HTMLElement);
    expect(callout?.querySelector('.callout-content')).toBeInstanceOf(HTMLElement);

    const mathBlock = view.dom.querySelector('.math-block-wrapper.md-math-block.md-fences-math.md-math-container.md-diagram-panel-preview[data-type="math-block"][lang="math"]');
    expect(mathBlock).toBeInstanceOf(HTMLElement);

    const codeBlock = view.dom.querySelector('.code-block-container.md-fences.HyperMD-codeblock.HyperMD-codeblock-bg.language-ts[data-language="ts"][lang="ts"]');
    expect(codeBlock).toBeInstanceOf(HTMLElement);
    expect(codeBlock?.querySelector('.code-block-editable.CodeMirror.cm-s-inner.cm-s-obsidian')).toBeInstanceOf(HTMLElement);
    await waitFor(() => {
      expect(codeBlock?.querySelector('.code-block-flair')).toBeInstanceOf(HTMLElement);
      expect(codeBlock?.querySelector('.copy-code-button')).toBeInstanceOf(HTMLButtonElement);
    });

    const htmlBlock = Array.from(
      view.dom.querySelectorAll<HTMLElement>('[data-type="html-block"].md-htmlblock.md-htmlblock-container')
    ).find((element) => element.dataset.value?.includes('HTML Block'));
    expect(htmlBlock).toBeInstanceOf(HTMLElement);
    expect(htmlBlock?.textContent).toContain('HTML Block');

    await destroyEditor(editor);
  });

  it('adds VLOOK inline semantic classes for Typora theme reuse', async () => {
    const editor = await createEditor([
      '*`rd tag`*',
      '',
      '*og name `value`*',
      '',
      '*==step==*',
      '',
      '*^Filters^*',
      '',
      '**Important Title**',
      '',
      '++Underline Title++',
      '',
      '==Standalone Highlight==',
      '',
      '*Standalone Emphasis*',
      '',
      'prefix *==bu stepwise==* suffix',
      '',
      '***gn coating***',
    ].join('\n'));

    const view = editor.ctx.get(editorViewCtx);

    const tag = view.dom.querySelector('.v-tag');
    expect(tag?.textContent).toBe('rd tag');
    expect(tag?.classList.contains('rd')).toBe(true);
    expect(tag?.classList.contains('em')).toBe(true);

    const badgeName = view.dom.querySelector('.v-badge-name');
    expect(badgeName?.textContent?.replace(/\s+/g, ' ')).toContain('og name');
    expect(badgeName?.classList.contains('og')).toBe(true);
    expect(view.dom.querySelector('.v-badge-value')?.textContent).toBe('value');

    expect(view.dom.querySelector('.v-caption.vlook-caption-block')?.textContent).toBe('step');
    expect(view.dom.querySelector('.v-caption .v-cap-1')?.textContent).toBe('step');

    const tabCaption = view.dom.querySelector('.vlook-tab-caption .v-tab-caption-label');
    expect(tabCaption).toBeInstanceOf(HTMLElement);
    expect(tabCaption?.textContent).toBe('Filters');

    expect(view.dom.querySelector('.vlook-strong-block strong')?.textContent).toBe('Important Title');
    expect(view.dom.querySelector('.vlook-underline-block u')?.textContent).toBe('Underline Title');
    expect(view.dom.querySelector('.vlook-highlight-block mark')?.textContent).toBe('Standalone Highlight');
    expect(view.dom.querySelector('.vlook-emphasis-block em')?.textContent).toBe('Standalone Emphasis');

    const stepwise = view.dom.querySelector('.v-stepwise');
    expect(stepwise?.textContent).toBe('bu stepwise');
    expect(stepwise?.classList.contains('bu')).toBe(true);

    const coating = view.dom.querySelector('.v-coating');
    expect(coating?.textContent).toBe('gn coating');
    expect(coating?.classList.contains('gn')).toBe(true);
    expect(coating?.classList.contains('em')).toBe(true);

    await destroyEditor(editor);
  });

  it('adds VLOOK quote semantic classes for Typora theme reuse', async () => {
    const editor = await createEditor([
      '> rd warning quote',
      '',
      '> *og emphasized quote*',
      '',
      '> **Quote Title**',
      '>',
      '> body',
    ].join('\n'));

    const view = editor.ctx.get(editorViewCtx);
    const quotes = Array.from(view.dom.querySelectorAll('blockquote.v-q'));

    expect(quotes[0]?.classList.contains('rd')).toBe(true);
    expect(quotes[0]?.classList.contains('em')).toBe(false);
    expect(quotes[1]?.classList.contains('og')).toBe(true);
    expect(quotes[1]?.classList.contains('em')).toBe(true);
    expect(quotes[2]?.querySelector('p:first-child > strong:only-child')?.textContent).toBe('Quote Title');

    await destroyEditor(editor);
  });

  it('adds VLOOK table semantic classes for Typora theme reuse', async () => {
    const editor = await createEditor([
      '| **Name** | Amount | Rate | Done | Empty | Long | Span |',
      '| --- | ---: | ---: | :---: | --- | --- | --- |',
      '| Ada | $12.50 | -4% | [x] | | this cell contains enough words to use the VLOOK long-cell table style | *<mark style="background-color: #ecf6ff">merged look</mark>* |',
    ].join('\n'));

    const view = editor.ctx.get(editorViewCtx);
    const tableBlock = view.dom.querySelector('.milkdown-table-block.v-freeze.auto');
    expect(tableBlock).toBeInstanceOf(HTMLElement);
    expect(tableBlock?.classList.contains('table-figure')).toBe(true);

    const table = tableBlock?.querySelector('table');
    expect(table).toBeInstanceOf(HTMLTableElement);

    const amount = Array.from(view.dom.querySelectorAll<HTMLElement>('td'))
      .find((cell) => cell.textContent?.includes('$12.50'));
    expect(amount?.classList.contains('v-tbl-col-fmt-num')).toBe(true);
    expect(amount?.querySelector('.v-tbl-col-fmt-currency')?.textContent).toBe('$');
    expect(amount?.querySelector('.v-tbl-col-fmt-num-decimal')?.textContent).toBe('.50');

    const rate = Array.from(view.dom.querySelectorAll<HTMLElement>('td'))
      .find((cell) => cell.textContent?.includes('-4%'));
    expect(rate?.classList.contains('v-tbl-col-fmt-num')).toBe(true);
    expect(rate?.querySelector('.v-tbl-col-fmt-percent')?.textContent).toBe('%');
    expect(rate?.classList.contains('v-tbl-col-fmt-num-negative')).toBe(true);

    const checkbox = view.dom.querySelector<HTMLElement>('td.v-tbl-col-fmt-chkbox[data-vlook-checkbox="checked"]');
    expect(checkbox?.textContent).toContain('[x]');
    expect(
      checkbox?.querySelector('.v-svg-input-checkbox[data-vlook-checkbox="checked"]')
    ).toBeInstanceOf(HTMLElement);

    expect(view.dom.querySelector('td.v-empty-cell')).toBeInstanceOf(HTMLTableCellElement);
    expect(view.dom.querySelector('td.v-long')).toBeInstanceOf(HTMLTableCellElement);
    expect(view.dom.querySelector('td.v-table-colspan-all')).toBeInstanceOf(HTMLTableCellElement);
    expect(view.dom.querySelector('td.td-span mark')).toBeInstanceOf(HTMLElement);

    await destroyEditor(editor);
  });

  it('adds VLOOK static layout classes for captions, cards, media, and kbd buttons', async () => {
    const editor = await createEditor([
      '*==Table Data==*',
      '',
      '| Name | Amount |',
      '| --- | ---: |',
      '| Ada | 12 |',
      '',
      '*==Code Example==*',
      '',
      '```ts',
      'const answer = 42;',
      '```',
      '',
      '> ![Cover](./cover.png#card)',
      '>',
      '> **Card Title**',
      '>',
      '> Card body',
      '',
      '> ![Wide Cover](./wide-cover.png#cardd)',
      '>',
      '> **Dual Card Title**',
      '>',
      '> Dual card body',
      '',
      '[<kbd>Open</kbd>](https://example.com)',
      '',
      '<iframe src="https://example.com/embed"></iframe>',
      '',
      '<details open>',
      '<summary>Fold Title</summary>',
      '<p>Fold body</p>',
      '</details>',
      '',
      '<div class="v-page-break"></div>',
    ].join('\n'));

    const view = editor.ctx.get(editorViewCtx);

    const tableCaption = view.dom.querySelector('.v-caption.vlook-caption-block.table .v-cap-1');
    expect(tableCaption).toBeInstanceOf(HTMLElement);
    expect(tableCaption?.textContent).toBe('Table Data');
    expect(view.dom.querySelector('.milkdown-table-block.table-figure.vlook-caption-target-table')).toBeInstanceOf(HTMLElement);

    const codeCaption = view.dom.querySelector('.v-caption.vlook-caption-block.codeblock .v-cap-1');
    expect(codeCaption).toBeInstanceOf(HTMLElement);
    expect(codeCaption?.textContent).toBe('Code Example');
    expect(view.dom.querySelector('.code-block-container.md-fences.vlook-caption-target-codeblock')).toBeInstanceOf(HTMLElement);
    expect(view.dom.querySelector('.vlook-caption-gap')).toBeInstanceOf(HTMLElement);

    const postCard = view.dom.querySelector('blockquote.v-q.v-post-card');
    expect(postCard).toBeInstanceOf(HTMLElement);
    expect(postCard?.classList.contains('vlook-post-card')).toBe(true);
    expect(postCard?.querySelector('.v-card-title')?.textContent).toContain('Card Title');
    expect(postCard?.querySelector('.v-card-text')?.textContent).toContain('Card body');
    expect(postCard?.querySelector('.v-card-image .image-block-container[src="./cover.png#card"]')).toBeInstanceOf(HTMLElement);

    const dualPostCard = view.dom.querySelector('blockquote.v-q.vlook-post-card-dual');
    expect(dualPostCard).toBeInstanceOf(HTMLElement);
    expect(dualPostCard?.querySelector('.v-card-title')?.textContent).toContain('Dual Card Title');
    expect(dualPostCard?.querySelector('.v-card-image .image-block-container[src="./wide-cover.png#cardd"]')).toBeInstanceOf(HTMLElement);

    const kbdButton = view.dom.querySelector('span[data-type="html"].vlook-kbd-html.v-btn kbd');
    expect(kbdButton).toBeInstanceOf(HTMLElement);
    expect(kbdButton?.textContent).toBe('Open');

    expect(view.dom.querySelector('.md-htmlblock.v-caption.iframe.vlook-media-html-block iframe')).toBeInstanceOf(HTMLIFrameElement);
    expect(view.dom.querySelector('.md-htmlblock details[open] > summary')).toBeInstanceOf(HTMLElement);
    expect(view.dom.querySelector('.md-htmlblock details[open]')?.textContent).toContain('Fold body');
    expect(view.dom.querySelector('.md-htmlblock.v-page-break.vlook-page-break')).toBeInstanceOf(HTMLElement);

    await destroyEditor(editor);
  });

  it('adds VLOOK column classes across preserved blank-line placeholders', async () => {
    const editor = await createEditor([
      'Intro',
      '',
      '---',
      '',
      '- Alpha',
      '- Beta',
      '',
      '---',
      '',
      '---',
      '',
      '> Left',
      '',
      '> Middle',
      '',
      '> Right',
    ].join('\n'));

    const view = editor.ctx.get(editorViewCtx);

    const columnMarkers = Array.from(view.dom.querySelectorAll('.md-hr.v-column.vlook-column-marker'));
    expect(columnMarkers).toHaveLength(3);

    const columnGaps = Array.from(view.dom.querySelectorAll('.vlook-column-gap'));
    expect(columnGaps.length).toBeGreaterThanOrEqual(3);

    const list = view.dom.querySelector('ul.vlook-column-block.vlook-column-2.vlook-column-list.vlook-column-first');
    expect(list).toBeInstanceOf(HTMLUListElement);
    expect(list?.textContent).toContain('Alpha');

    const quotes = Array.from(view.dom.querySelectorAll('blockquote.v-q.vlook-column-3.vlook-column-quote'));
    expect(quotes).toHaveLength(3);
    expect(quotes[0]?.classList.contains('vlook-column-first')).toBe(true);
    expect(quotes[1]?.classList.contains('vlook-column-item-2')).toBe(true);
    expect(quotes[2]?.classList.contains('vlook-column-item-3')).toBe(true);

    await destroyEditor(editor);
  });

  it('adds VLOOK first block and table figure classes for Typora layout rules', async () => {
    const editor = await createEditor([
      'Intro paragraph',
      '',
      '- First list item',
      '',
      '| Name | Amount |',
      '| --- | ---: |',
      '| Ada | 12 |',
    ].join('\n'));

    const view = editor.ctx.get(editorViewCtx);

    const firstParagraph = view.dom.querySelector('p.md-p.cm-line.first-p');
    expect(firstParagraph).toBeInstanceOf(HTMLParagraphElement);
    expect(firstParagraph?.textContent).toBe('Intro paragraph');

    const list = view.dom.querySelector('ul.has-list-bullet');
    expect(list).toBeInstanceOf(HTMLUListElement);
    expect(list?.classList.contains('first-p')).toBe(false);

    const tableBlock = view.dom.querySelector('.milkdown-table-block.table-figure');
    expect(tableBlock).toBeInstanceOf(HTMLElement);
    expect(tableBlock?.querySelector('table.children')).toBeInstanceOf(HTMLTableElement);

    await destroyEditor(editor);
  });

  it('opens markdown containing generated TOC and HTML underline nodes', async () => {
    const editor = await createEditor([
      '# 概述',
      '',
      '[TOC]',
      '',
      '## 下划线',
      '',
      '<u>下划线</u>',
    ].join('\n'));

    const view = editor.ctx.get(editorViewCtx);
    await waitFor(() => {
      expect(view.dom.querySelector('.toc-block.md-toc')).toBeInstanceOf(HTMLElement);
      expect(view.dom.querySelector('.toc-content.md-toc-content')).toBeInstanceOf(HTMLElement);
      expect(view.dom.querySelector('.toc-item.md-toc-item.md-toc-h1')).toBeInstanceOf(HTMLElement);
      expect(view.dom.querySelector('.toc-link.md-toc-inner')).toBeInstanceOf(HTMLAnchorElement);
    });
    expect(view.state.doc.textContent).toContain('下划线');
    await destroyEditor(editor);
  });

  it('opens markdown containing video image syntax as a video node', async () => {
    const editor = await createEditor('![video](https://example.com/video.mp4 "Demo")');

    const view = editor.ctx.get(editorViewCtx);
    expect(view.dom.querySelector('.video-block[data-type="video"]')).toBeInstanceOf(HTMLElement);
    await destroyEditor(editor);
  });

  it('opens Obsidian image embeds as editable image nodes', async () => {
    const editor = await createEditor('Before ![[附件/images.png|Local image]] after');

    const view = editor.ctx.get(editorViewCtx);
    const image = view.dom.querySelector('.image-block-container[data-src="附件/images.png"][data-alt="Local image"]');
    expect(image).toBeInstanceOf(HTMLElement);
    expect(view.state.doc.textContent).toContain('Before');
    expect(view.state.doc.textContent).toContain('after');
    await destroyEditor(editor);
  });

  it('creates editable image nodes from typed Obsidian embeds', async () => {
    const editor = await createEditor('');
    const view = editor.ctx.get(editorViewCtx);

    await act(async () => {
      typeText(view, 'Before ![[attachments/demo.png|Local image]] after');
      await Promise.resolve();
    });

    const image = view.dom.querySelector(
      '.image-block-container[data-src="attachments/demo.png"][data-alt="Local image"]',
    );
    expect(image).toBeInstanceOf(HTMLElement);
    expect(editor.ctx.get(serializerCtx)(view.state.doc).trim()).toBe(
      'Before ![Local image](attachments/demo.png) after',
    );
    await destroyEditor(editor);
  });

  it('edits and reopens wiki links across combined inline and block syntax', async () => {
    type SyntaxCase = {
      target: string;
      alias: string;
      editedAlias: string;
      ancestors: string[];
      markdown: string[];
      serializedSource?: string;
    };
    const syntaxCase = (
      target: string,
      alias: string,
      render: (source: string) => string | string[],
      ancestors: string[],
      serializedSource?: string,
    ): SyntaxCase => {
      const markdown = render(`[[${target}|${alias}]]`);
      return {
        target,
        alias,
        editedAlias: `edited ${alias}`,
        ancestors,
        markdown: Array.isArray(markdown) ? markdown : [markdown],
        serializedSource,
      };
    };
    const cases = [
      syntaxCase('Nested Standard Target', 'nested standard', (source) => `***${source}***`, ['strong', 'em']),
      syntaxCase('Nested Custom Target', 'nested custom', (source) => `**==${source}==**`, ['strong', 'mark']),
      syntaxCase('Text Color Target', 'text color', (source) => `<span style="color: #123456">${source}</span>`, ['span[data-text-color]']),
      syntaxCase('Background Color Target', 'background color', (source) => `<mark style="background-color: #ecf6ff">${source}</mark>`, ['mark[data-bg-color]']),
      syntaxCase('Heading Target', 'heading alias', (source) => `## Heading ${source}`, ['h2']),
      syntaxCase('Quote Target', 'quote alias', (source) => `> Quote ${source}`, ['blockquote']),
      syntaxCase('Bullet Target', 'bullet alias', (source) => `- Bullet ${source}`, ['ul']),
      syntaxCase('Ordered Target', 'ordered alias', (source) => `1. Ordered ${source}`, ['ol']),
      syntaxCase('Task Target', 'task alias', (source) => `- [ ] Task ${source}`, ['li']),
      syntaxCase('Callout Target', 'callout alias', (source) => `> 💡 Callout ${source}`, ['.callout']),
      syntaxCase('Table Target', 'table alias', (source) => [
        '| Context | Link |',
        '| --- | --- |',
        `| Table | ${source.replace('|', '\\|')} |`,
      ], ['td'], '[[Table Target\\|edited table alias]]'),
      syntaxCase('Footnote Target', 'footnote alias', (source) => [
        'Footnote reference [^wiki-audit].',
        '',
        `[^wiki-audit]: ${source}`,
      ], ['.footnote-def, [data-type="footnote_definition"]']),
      syntaxCase('Definition Term Target', 'definition term', (source) => [
        `Term ${source}`,
        ': Definition body',
      ], ['dt']),
      syntaxCase('Definition Description Target', 'definition description', (source) => [
        'Description term',
        `: Definition ${source}`,
      ], ['dd']),
      syntaxCase('Hard Break Target', 'hard break alias', (source) => [
        `Hard break ${source}\\`,
        'continuation',
      ], ['p']),
      syntaxCase('Adjacent Target', 'adjacent alias', (source) => (
        `[ordinary](https://example.test) ${source} #combo/tag`
      ), ['p']),
    ];
    const markdown = [
      'Outside audit anchor.',
      '',
      ...cases.flatMap((testCase) => [...testCase.markdown, '']),
    ].join('\n');
    const editor = await createEditor(markdown);
    const view = editor.ctx.get(editorViewCtx);
    const serializer = editor.ctx.get(serializerCtx);

    const expandTarget = (target: string) => {
      let position: number | null = null;
      view.state.doc.nodesBetween(0, view.state.doc.content.size, (node, pos) => {
        if (position !== null || !node.isText) return;
        if (node.marks.some((mark) => (
          mark.type.name === 'wiki_link' && mark.attrs.target === target
        ))) {
          position = pos + 1;
        }
      });
      expect(position, `Expected editable wiki link for ${target}`).not.toBeNull();
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, position!)));
    };

    for (const testCase of cases) {
      expandTarget(testCase.target);
      const source = `[[${testCase.target}|${testCase.alias}]]`;
      const expanded = wikiLinkExpansionPluginKey.getState(view.state)?.expanded;
      expect(view.dom.querySelector('.wiki-link-expanded')?.textContent).toBe(source);
      expect(expanded).not.toBeNull();

      const aliasFrom = expanded!.from + `[[${testCase.target}|`.length;
      view.dispatch(view.state.tr.setSelection(TextSelection.create(
        view.state.doc,
        aliasFrom,
        aliasFrom + testCase.alias.length,
      )));
      typeText(view, testCase.editedAlias);

      const editedSource = `[[${testCase.target}|${testCase.editedAlias}]]`;
      expect(view.dom.querySelector('.wiki-link-expanded')?.textContent).toBe(editedSource);
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1)));
      expect(view.dom.querySelector('.wiki-link-expanded')).toBeNull();
      const collapsed = view.dom.querySelector<HTMLElement>(
        `[data-wiki-link-target="${testCase.target}"]`,
      );
      expect(collapsed?.textContent).toBe(testCase.editedAlias);
      for (const ancestor of testCase.ancestors) {
        expect(collapsed?.closest(ancestor), `${testCase.target} should remain inside ${ancestor}`)
          .not.toBeNull();
      }
      expect(serializer(view.state.doc)).toContain(testCase.serializedSource ?? editedSource);
    }

    const serialized = serializer(view.state.doc);
    await destroyEditor(editor);

    const reopenedEditor = await createEditor(serialized);
    const reopenedView = reopenedEditor.ctx.get(editorViewCtx);
    for (const testCase of cases) {
      const link = reopenedView.dom.querySelector<HTMLElement>(
        `[data-wiki-link-target="${testCase.target}"]`,
      );
      expect(link?.textContent).toBe(testCase.editedAlias);
      for (const ancestor of testCase.ancestors) {
        expect(link?.closest(ancestor), `${testCase.target} should reopen inside ${ancestor}`)
          .not.toBeNull();
      }
      if (testCase.target === 'Task Target') {
        expect(link?.closest('li')?.getAttribute('data-task')).toBe(' ');
      }
    }
    await destroyEditor(reopenedEditor);
  });

  it.each([
    {
      name: 'image',
      input: '![Undo image](https://example.com/undo.png)',
      nodeName: 'image',
    },
    {
      name: 'video',
      input: '![video](https://example.com/undo.mp4)',
      nodeName: 'video',
    },
    {
      name: 'footnote reference',
      input: 'Undo reference [^undo-ref]',
      nodeName: 'footnote_reference',
    },
  ])('keeps typed $name conversion stable through undo and redo', async ({ input, nodeName }) => {
    const editor = await createEditor('');
    const view = editor.ctx.get(editorViewCtx);

    await act(async () => {
      typeText(view, input);
      await Promise.resolve();
    });
    const countNodes = () => {
      let count = 0;
      view.state.doc.descendants((node) => {
        if (node.type.name === nodeName || (nodeName === 'footnote_reference' && node.type.name === 'footnote_ref')) {
          count += 1;
        }
        return true;
      });
      return count;
    };

    expect(countNodes()).toBe(1);
    await act(async () => {
      expect(undo(view.state, view.dispatch)).toBe(true);
      await Promise.resolve();
    });
    expect(countNodes()).toBe(0);
    await act(async () => {
      expect(redo(view.state, view.dispatch)).toBe(true);
      await Promise.resolve();
    });
    expect(countNodes()).toBe(1);

    await destroyEditor(editor);
  });

  it.each([
    {
      name: 'callout',
      input: '> 💡 Undo callout',
      nodeName: 'callout',
    },
    {
      name: 'backslash hard break',
      input: 'Undo hard break\\',
      nodeName: 'hardbreak',
    },
  ])('keeps typed $name Enter conversion stable through undo and redo', async ({ input, nodeName }) => {
    const editor = await createEditor('');
    const view = editor.ctx.get(editorViewCtx);

    await act(async () => {
      typeText(view, input);
      expect(pressEnter(view)).toBe(true);
      await Promise.resolve();
    });
    const countNodes = () => {
      let count = 0;
      view.state.doc.descendants((node) => {
        if (node.type.name === nodeName) count += 1;
        return true;
      });
      return count;
    };

    expect(countNodes()).toBe(1);
    await act(async () => {
      expect(undo(view.state, view.dispatch)).toBe(true);
      await Promise.resolve();
    });
    expect(countNodes()).toBe(0);
    await act(async () => {
      expect(redo(view.state, view.dispatch)).toBe(true);
      await Promise.resolve();
    });
    expect(countNodes()).toBe(1);

    await destroyEditor(editor);
  });

  it('opens markdown containing footnote reference and definition nodes', async () => {
    const editor = await createEditor(['Footnote ref[^1].', '', '[^1]: Footnote body'].join('\n'));

    const view = editor.ctx.get(editorViewCtx);
    expect(view.dom.querySelector('sup.footnote-ref.md-footnote')).toBeInstanceOf(HTMLElement);
    expect(view.dom.querySelector('.footnote-def.footnote-line')).toBeInstanceOf(HTMLElement);
    await destroyEditor(editor);
  });

  it.each([
    {
      name: 'definition list',
      markdown: ['Term', '', ': Definition'].join('\n'),
      expectedText: 'TermDefinition',
    },
    {
      name: 'abbreviation',
      markdown: ['*[HTML]: HyperText Markup Language', '', 'HTML demo'].join('\n'),
      expectedText: 'HTML demo',
    },
    {
      name: 'callout container',
      markdown: ['> 💡 Important note'].join('\n'),
      expectedText: 'Important note',
    },
    {
      name: 'inline marks',
      markdown: '==highlight== ^sup^ ~sub~ ++under++ <mark>html</mark> <sup>x</sup> <sub>y</sub> <u>z</u>',
      expectedText: 'highlightsupsubunderhtmlxyz',
    },
    {
      name: 'inline color marks',
      markdown: '<span style="color: #123456">text color</span> <mark style="background-color: #ecf6ff">bg color</mark>',
      expectedText: 'text color bg color',
    },
    {
      name: 'block alignment comments',
      markdown: ['Centered paragraph', '<!--align:center-->', '', '## Right heading', '<!--align:right-->'].join('\n'),
      expectedText: 'Centered paragraphRight heading',
    },
  ])('opens markdown containing $name nodes', async ({ markdown, expectedText }) => {
    const editor = await createEditor(markdown);

    const view = editor.ctx.get(editorViewCtx);
    expect(view.state.doc.textContent.replace(/\s+/g, '')).toContain(expectedText.replace(/\s+/g, ''));
    await destroyEditor(editor);
  });

  it('does not decorate escaped definition-list markers as definition lists', async () => {
    const editor = await createEditor(['Term', '', '\\: Definition'].join('\n'));

    const view = editor.ctx.get(editorViewCtx);
    expect(view.dom.querySelector('.editor-dl-term')).toBeNull();
    expect(view.dom.querySelector('.editor-dl-desc')).toBeNull();
    await destroyEditor(editor);
  });

  it('serializes definition lists back to markdown without nested paragraphs', async () => {
    const markdown = ['Term', '', ': Definition'].join('\n');
    const editor = await createEditor(markdown);
    const serializer = editor.ctx.get(serializerCtx);
    const view = editor.ctx.get(editorViewCtx);

    expect(serializer(view.state.doc).trim()).toBe(markdown);

    await destroyEditor(editor);
  });

});
