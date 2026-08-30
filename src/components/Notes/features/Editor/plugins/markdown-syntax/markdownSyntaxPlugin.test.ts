import { describe, expect, it } from 'vitest';
import {
  defaultValueCtx,
  Editor,
  editorViewCtx,
  serializerCtx,
} from '@milkdown/kit/core';
import type { Node as ProseNode } from '@milkdown/kit/prose/model';
import { TextSelection } from '@milkdown/kit/prose/state';
import { commonmark } from '@milkdown/kit/preset/commonmark';
import { gfm } from '@milkdown/kit/preset/gfm';
import { extractHeadings } from '../toc/tocViewUtils';
import { highlightPlugin } from '../highlight/highlightPlugin';
import { setLink } from '../floating-toolbar/commands';
import {
  editExistingLink,
  editLinkAtPosition,
  removeExistingLink,
  unlinkExistingLink,
} from '../links/tooltip/linkTooltipTransactions';
import { getSelectedMarkdownSyntaxText } from './markdownSyntaxSelection';
import { markdownSyntaxPlugin } from './markdownSyntaxPlugin';

interface SyntaxRun {
  edge: string;
  from: number;
  kind: string;
  text: string;
  to: number;
}

function collectSyntaxRuns(doc: ProseNode): SyntaxRun[] {
  const runs: SyntaxRun[] = [];
  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return true;
    const mark = node.marks.find((candidate) => candidate.type.name === 'markdownSyntax');
    if (!mark) return true;
    runs.push({
      edge: String(mark.attrs.edge),
      from: pos,
      kind: String(mark.attrs.kind),
      text: node.text,
      to: pos + node.text.length,
    });
    return true;
  });
  return runs;
}

async function createEditor(markdown: string) {
  const editor = Editor.make()
    .config((ctx) => {
      ctx.set(defaultValueCtx, markdown);
    })
    .use(commonmark)
    .use(gfm)
    .use(highlightPlugin)
    .use(markdownSyntaxPlugin);
  await editor.create();
  return editor;
}

describe('markdownSyntaxPlugin', () => {
  it('keeps heading source punctuation as selectable text without changing semantics', async () => {
    const editor = await createEditor('## 123');
    const view = editor.ctx.get(editorViewCtx);
    const heading = view.state.doc.firstChild!;
    const prefix = collectSyntaxRuns(view.state.doc)[0]!;

    expect(heading.textContent).toBe('## 123');
    expect(prefix).toMatchObject({
      edge: 'prefix',
      kind: 'heading',
      text: '## ',
    });

    view.dispatch(view.state.tr.setSelection(TextSelection.create(
      view.state.doc,
      prefix.from,
      prefix.to,
    )));

    expect(getSelectedMarkdownSyntaxText(view.state)).toBe('## ');
    expect(editor.ctx.get(serializerCtx)(view.state.doc).trim()).toBe('## 123');
    expect(extractHeadings(view.state.doc)).toMatchObject([{ level: 2, text: '123' }]);
    expect(view.dom.querySelector('h2')?.id).toBe('123');
  });

  it('expands syntax for every textblock in a multi-block selection', async () => {
    const editor = await createEditor('### 3\n#### 4\n##### 5');
    const view = editor.ctx.get(editorViewCtx);
    const headings: Array<{ from: number; nodeSize: number }> = [];
    view.state.doc.descendants((node, pos) => {
      if (node.type.name === 'heading') headings.push({ from: pos, nodeSize: node.nodeSize });
      return true;
    });

    view.dispatch(view.state.tr.setSelection(TextSelection.create(
      view.state.doc,
      headings[0]!.from + 1,
      headings[2]!.from + headings[2]!.nodeSize - 1,
    )));

    expect(view.dom.querySelectorAll('.markdown-source-expanded')).toHaveLength(3);
    expect(view.dom.querySelectorAll('.markdown-syntax-selected')).toHaveLength(3);
  });

  it('keeps marker-only headings visible', async () => {
    const editor = await createEditor(['#', '##', '###', '####', '#####', '######', '# Heading'].join('\n'));
    const view = editor.ctx.get(editorViewCtx);

    expect(view.dom.querySelectorAll('.markdown-empty-heading')).toHaveLength(6);
    expect(view.dom.querySelector('h1:last-child')).not.toHaveClass('markdown-empty-heading');
  });

  it('preserves nested semantic marks while exposing every delimiter', async () => {
    const editor = await createEditor('**bold ==mark==**');
    const view = editor.ctx.get(editorViewCtx);
    const runs = collectSyntaxRuns(view.state.doc);
    const markedText: Record<string, string[]> = {};

    view.state.doc.descendants((node) => {
      if (!node.isText || !node.text || node.marks.some((mark) => mark.type.name === 'markdownSyntax')) {
        return true;
      }
      markedText[node.text] = node.marks.map((mark) => mark.type.name).sort();
      return true;
    });

    expect(view.state.doc.textContent).toBe('**bold ==mark==**');
    expect(runs.map(({ kind, text }) => ({ kind, text }))).toEqual([
      { kind: 'strong', text: '**' },
      { kind: 'highlight', text: '==' },
      { kind: 'highlight', text: '==' },
      { kind: 'strong', text: '**' },
    ]);
    expect(markedText['bold ']).toEqual(['strong']);
    expect(markedText.mark).toEqual(['highlight', 'strong']);
    expect(editor.ctx.get(serializerCtx)(view.state.doc).trim()).toBe('**bold ==mark==**');
  });

  it('reparses edited delimiters and keeps link destinations selectable', async () => {
    const strongEditor = await createEditor('**bold**');
    const strongView = strongEditor.ctx.get(editorViewCtx);

    strongView.dispatch(strongView.state.tr.delete(1, 3));

    const strong = strongView.state.schema.marks.strong;
    expect(strong).toBeDefined();
    expect(strongView.state.doc.textContent).toBe('bold**');
    expect(strongView.state.doc.rangeHasMark(
      0,
      strongView.state.doc.content.size,
      strong!,
    )).toBe(false);

    const linkEditor = await createEditor('[Docs](https://example.test/path)');
    const linkView = linkEditor.ctx.get(editorViewCtx);
    const closing = collectSyntaxRuns(linkView.state.doc)
      .find(({ edge, kind }) => edge === 'close' && kind === 'link')!;
    const url = 'https://example.test/path';
    const urlFrom = closing.from + closing.text.indexOf(url);

    linkView.dispatch(linkView.state.tr.setSelection(TextSelection.create(
      linkView.state.doc,
      urlFrom,
      urlFrom + url.length,
    )));

    expect(getSelectedMarkdownSyntaxText(linkView.state)).toBe(url);
  });

  it('updates link destination syntax after editing a link from the tooltip', async () => {
    const editor = await createEditor('[Docs](https://example.test/old)');
    const view = editor.ctx.get(editorViewCtx);
    const link = view.dom.querySelector('a');
    expect(link).not.toBeNull();
    expect(editExistingLink(
      view,
      link!,
      'Docs',
      'https://example.test/new',
    )).not.toBeNull();

    expect(view.dom.querySelector('a')).toHaveAttribute('href', 'https://example.test/new');
    const closing = collectSyntaxRuns(view.state.doc).find(({ kind, edge }) => (
      kind === 'link' && edge === 'close'
    ));
    expect(closing?.text).toBe('](https://example.test/new)');
    expect(view.state.selection.from).toBe(closing?.to);
    expect(editor.ctx.get(serializerCtx)(view.state.doc).trim())
      .toBe('[Docs](https://example.test/new)');

    view.dispatch(view.state.tr.insertText('x'));

    expect(editor.ctx.get(serializerCtx)(view.state.doc).trim())
      .toBe('[Docs](https://example.test/new)x');
  });

  it('preserves link titles and label formatting when editing only the URL', async () => {
    const editor = await createEditor('[**Docs**](https://example.test/old "Docs title")');
    const view = editor.ctx.get(editorViewCtx);
    const link = view.dom.querySelector('a');
    expect(editExistingLink(view, link!, 'Docs', 'https://example.test/new')).not.toBeNull();
    expect(editor.ctx.get(serializerCtx)(view.state.doc).trim())
      .toBe('**[Docs](https://example.test/new "Docs title")**');
    expect(view.dom.querySelector('strong a')).toHaveTextContent('Docs');
  });

  it('keeps formatted link content when clearing its URL', async () => {
    const editor = await createEditor('[**Docs**](https://example.test/old)');
    const view = editor.ctx.get(editorViewCtx);
    const link = view.dom.querySelector('a');

    expect(editExistingLink(view, link!, 'Docs', '')).not.toBeNull();
    expect(editor.ctx.get(serializerCtx)(view.state.doc).trim()).toBe('**Docs**');
    expect(view.dom.querySelector('strong')?.textContent).toBe('Docs');
  });

  it('removes Markdown link syntax when unlinking while preserving the label', async () => {
    const editor = await createEditor('Before [**Docs**](https://example.test) after');
    const view = editor.ctx.get(editorViewCtx);
    const link = view.dom.querySelector('a');

    expect(unlinkExistingLink(view, link!)).toBe(true);
    expect(editor.ctx.get(serializerCtx)(view.state.doc).trim()).toBe('Before **Docs** after');
    expect(view.dom.querySelector('a')).toBeNull();
  });

  it('removes Markdown link syntax when toggling the toolbar link off', async () => {
    const editor = await createEditor('Before [**Docs**](https://example.test) after');
    const view = editor.ctx.get(editorViewCtx);
    let from = -1;
    let to = -1;
    view.state.doc.descendants((node, pos) => {
      if (node.isText && node.text === 'Docs') {
        from = pos;
        to = pos + node.nodeSize;
      }
      return true;
    });

    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, from, to)));
    setLink(view, null);

    expect(editor.ctx.get(serializerCtx)(view.state.doc).trim()).toBe('Before **Docs** after');
    expect(view.dom.querySelector('a')).toBeNull();
  });

  it('removes the complete Markdown link when deleting from the tooltip', async () => {
    const editor = await createEditor('Before [Docs](https://example.test "Docs title") after');
    const view = editor.ctx.get(editorViewCtx);
    const link = view.dom.querySelector('a');

    expect(removeExistingLink(view, link!)).toBe(true);
    expect(editor.ctx.get(serializerCtx)(view.state.doc).trim()).toBe('Before  after');
  });

  it('preserves linked images when editing or deleting their outer link', async () => {
    const markdown = '[![alt](https://images.example.test/a.png)](https://example.test)';
    const editor = await createEditor(markdown);
    const view = editor.ctx.get(editorViewCtx);
    const link = view.dom.querySelector('a');

    expect(editExistingLink(view, link!, 'alt', 'https://example.test/new')).not.toBeNull();
    expect(editor.ctx.get(serializerCtx)(view.state.doc).trim())
      .toBe('[![alt](https://images.example.test/a.png)](https://example.test/new)');

    const removeEditor = await createEditor(markdown);
    const removeView = removeEditor.ctx.get(editorViewCtx);
    expect(removeExistingLink(removeView, removeView.dom.querySelector('a')!)).toBe(true);
    expect(editor.ctx.get(serializerCtx)(removeView.state.doc).trim()).toBe('');
  });

  it('does not create one link across blocks or Markdown syntax', async () => {
    const editor = await createEditor('first\n\nsecond');
    const view = editor.ctx.get(editorViewCtx);
    const firstFrom = view.state.doc.textContent.indexOf('first');
    const secondFrom = view.state.doc.textContent.indexOf('second');
    let firstPos = -1;
    let secondPos = -1;
    view.state.doc.descendants((node, pos) => {
      if (!node.isText) return true;
      if (node.text?.includes('first')) firstPos = pos;
      if (node.text?.includes('second')) secondPos = pos;
      return true;
    });

    expect(firstFrom).toBe(0);
    expect(secondFrom).toBeGreaterThan(firstFrom);
    expect(editLinkAtPosition(view, firstPos, secondPos + 'second'.length, 'first second', 'https://example.test')).toBeNull();
    expect(editor.ctx.get(serializerCtx)(view.state.doc).trim()).toBe('first\n\nsecond');

    const syntaxEditor = await createEditor('**bold** plain');
    const syntaxView = syntaxEditor.ctx.get(editorViewCtx);
    let syntaxFrom = -1;
    let syntaxTo = -1;
    syntaxView.state.doc.descendants((node, pos) => {
      if (!node.isText || !node.text) return true;
      if (node.marks.some((mark) => mark.type.name === 'markdownSyntax')) {
        syntaxFrom = syntaxFrom < 0 ? pos : syntaxFrom;
        syntaxTo = pos + node.nodeSize;
      }
      return true;
    });

    expect(editLinkAtPosition(syntaxView, syntaxFrom, syntaxTo + 1, 'bold', 'https://example.test')).toBeNull();
    expect(syntaxEditor.ctx.get(serializerCtx)(syntaxView.state.doc).trim()).toBe('**bold** plain');
  });

  it.each([
    ['paragraph', '1', '[1](2)x'],
    ['heading', '# 1', '# [1](2)x'],
    ['bullet list', '- 1', '* [1](2)x'],
    ['blockquote', '> 1', '> [1](2)x'],
  ])('places the caret after newly created %s link syntax and keeps the source stable', async (
    _label,
    markdown,
    expectedMarkdown,
  ) => {
    const editor = await createEditor(markdown);
    const view = editor.ctx.get(editorViewCtx);
    let textFrom = -1;
    view.state.doc.descendants((node, pos) => {
      if (
        node.isText &&
        node.text === '1' &&
        !node.marks.some((mark) => mark.type.name === 'markdownSyntax')
      ) {
        textFrom = pos;
      }
      return textFrom < 0;
    });

    expect(textFrom).toBeGreaterThan(0);
    expect(editLinkAtPosition(view, textFrom, textFrom + 1, '1', '2')).not.toBeNull();

    const closing = collectSyntaxRuns(view.state.doc)
      .find(({ edge, kind }) => edge === 'close' && kind === 'link')!;
    expect(closing.text).toBe('](2)');
    expect(view.state.selection.from).toBe(closing.to);
    expect(view.state.selection.empty).toBe(true);

    view.dispatch(view.state.tr.insertText('x'));

    expect(editor.ctx.get(serializerCtx)(view.state.doc).trim()).toBe(expectedMarkdown);
  });

  it('escapes the updated tooltip URL in the link destination syntax', async () => {
    const editor = await createEditor('[Docs](https://example.test/old)');
    const view = editor.ctx.get(editorViewCtx);
    const link = view.dom.querySelector('a');

    expect(editExistingLink(
      view,
      link!,
      'Docs',
      'https://example.test/new(path)',
    )).not.toBeNull();

    expect(collectSyntaxRuns(view.state.doc).find(({ kind, edge }) => (
      kind === 'link' && edge === 'close'
    ))?.text).toBe('](<https://example.test/new(path)>)');
    expect(editor.ctx.get(serializerCtx)(view.state.doc).trim())
      .toBe('[Docs](https://example.test/new\\(path\\))');
  });

  it('removes link syntax when the tooltip URL is cleared', async () => {
    const editor = await createEditor('[Docs](https://example.test/old)');
    const view = editor.ctx.get(editorViewCtx);
    const link = view.dom.querySelector('a');

    expect(editExistingLink(view, link!, 'Docs', '')).not.toBeNull();

    expect(view.dom.querySelector('a')).toBeNull();
    expect(collectSyntaxRuns(view.state.doc).filter(({ kind }) => kind === 'link')).toEqual([]);
    expect(view.state.selection.empty).toBe(true);
    expect(editor.ctx.get(serializerCtx)(view.state.doc).trim()).toBe('Docs');

    view.dispatch(view.state.tr.insertText('x'));

    expect(editor.ctx.get(serializerCtx)(view.state.doc).trim()).toBe('Docsx');
  });
});
