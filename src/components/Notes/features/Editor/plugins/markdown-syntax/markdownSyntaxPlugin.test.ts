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
});
