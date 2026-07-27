import { describe, expect, it, vi } from 'vitest';
import { Editor, defaultValueCtx, editorViewCtx } from '@milkdown/kit/core';
import { commonmark } from '@milkdown/kit/preset/commonmark';
import { gfm } from '@milkdown/kit/preset/gfm';

import { clipboardPlugin } from './clipboardPlugin';
import { frontmatterPlugin } from '../frontmatter';
import { calloutPlugin } from '../callout';
import { footnotePlugin } from '../footnote';
import { mathPlugin } from '../math';
import { mermaidPlugin } from '../mermaid';
import { codePlugin } from '../code';
import { highlightPlugin } from '../highlight';
import { colorMarksPlugin } from '../floating-toolbar';
import { videoPlugin } from '../video';
import { deflistPlugin } from '../deflist';
import { customPlugins } from '../../config/plugins';
import { createMarkdownSyntaxFixture } from '../../../../../../../test/e2e/notesMarkdownSyntaxFixture';

const MARKDOWN_BLANK_LINE_COMMENT = '<!--vlaina-markdown-blank-line-->';

function simulatePasteText(view: any, text: string): boolean {
  return simulatePasteData(view, {
    getData(type: string) {
      return type === 'text/plain' ? text : '';
    },
  });
}

function simulatePasteData(view: any, clipboardData: { getData(type: string): string }): boolean {
  const event = {
    clipboardData,
    preventDefault: vi.fn(),
  };

  let handled = false;
  view.someProp('handleDOMEvents', (handleDOMEvents: any) => {
    const didHandle = handleDOMEvents.paste?.(view, event) ?? false;
    handled = didHandle || handled;
    return didHandle || undefined;
  });
  if (handled) return true;

  view.someProp('handlePaste', (handlePaste: any) => {
    const didHandle = handlePaste(view, event, null);
    handled = didHandle || handled;
    return didHandle || undefined;
  });
  return handled;
}

async function createPasteEditor() {
  const editor = Editor.make()
    .config((ctx) => {
      ctx.set(defaultValueCtx, '');
    })
    .use(commonmark)
    .use(gfm)
    .use(clipboardPlugin)
    .use(frontmatterPlugin)
    .use(calloutPlugin)
    .use(footnotePlugin)
    .use(mathPlugin)
    .use(mermaidPlugin)
    .use(codePlugin)
    .use(highlightPlugin)
    .use(colorMarksPlugin)
    .use(videoPlugin)
    .use(deflistPlugin);

  await editor.create();
  return editor;
}

async function createFullPasteEditor() {
  const editor = Editor.make()
    .config((ctx) => {
      ctx.set(defaultValueCtx, '');
    })
    .use(clipboardPlugin)
    .use(commonmark)
    .use(gfm);

  for (const plugin of customPlugins) {
    editor.use(plugin);
  }

  await editor.create();
  return editor;
}

describe('clipboard custom markdown paste', () => {
  it('recognizes the full supported markdown syntax fixture from an empty paragraph interior', async () => {
    const editor = await createFullPasteEditor();
    const view = editor.ctx.get(editorViewCtx);

    expect(simulatePasteText(view, createMarkdownSyntaxFixture())).toBe(true);

    const nodeNames: string[] = [];
    view.state.doc.forEach((node) => {
      nodeNames.push(node.type.name);
    });

    expect(nodeNames).toContain('frontmatter');
    expect(nodeNames).toContain('heading');
    expect(nodeNames).toContain('bullet_list');
    expect(nodeNames).toContain('ordered_list');
    expect(nodeNames).toContain('table');
    expect(nodeNames).toContain('code_block');
    expect(nodeNames).toContain('math_block');
    expect(nodeNames).toContain('mermaid');
    expect(nodeNames).toContain('footnote_definition');

    await editor.destroy();
  });

  it('recognizes pasted yaml frontmatter as a frontmatter block', async () => {
    const editor = await createPasteEditor();
    const view = editor.ctx.get(editorViewCtx);

    expect(simulatePasteText(view, ['---', 'title: Demo', '---', '# Heading'].join('\n'))).toBe(true);

    expect(view.state.doc.child(0).type.name).toBe('frontmatter');
    expect(view.state.doc.child(0).textContent).toBe('title: Demo');
    expect(view.state.doc.child(1).type.name).toBe('heading');

    await editor.destroy();
  });

  it('does not turn pasted frontmatter delimiters into extra horizontal rules', async () => {
    const editor = await createPasteEditor();
    const view = editor.ctx.get(editorViewCtx);

    const markdown = [
      '---',
      'title: Demo',
      '---',
      '',
      '# Heading',
      '',
      '---',
      '',
      '***',
      '',
      '___',
    ].join('\n');

    expect(simulatePasteText(view, markdown)).toBe(true);

    const nodeNames: string[] = [];
    view.state.doc.forEach((node) => {
      nodeNames.push(node.type.name);
    });

    expect(nodeNames[0]).toBe('frontmatter');
    expect(nodeNames.filter((name) => name === 'hr')).toHaveLength(3);

    await editor.destroy();
  });

  it('parses markdown that contains standalone raw html before the plain-html fallback', async () => {
    const editor = await createPasteEditor();
    const view = editor.ctx.get(editorViewCtx);

    const markdown = [
      '# Heading with HTML Sentinel',
      '',
      '<div class="raw-html-sentinel">Raw HTML sentinel</div>',
      '',
      '- Bullet sentinel',
    ].join('\n');

    expect(simulatePasteText(view, markdown)).toBe(true);

    const nodeNames: string[] = [];
    view.state.doc.forEach((node) => {
      nodeNames.push(node.type.name);
    });

    expect(nodeNames[0]).toBe('heading');
    expect(nodeNames).toContain('bullet_list');

    await editor.destroy();
  });

  it('reads markdown paste text from legacy Text clipboard payloads', async () => {
    const editor = await createPasteEditor();
    const view = editor.ctx.get(editorViewCtx);

    const markdown = ['# Legacy Text Payload Sentinel', '', '- Bullet sentinel'].join('\n');
    expect(simulatePasteData(view, {
      getData(type: string) {
        return type === 'Text' ? markdown : '';
      },
    })).toBe(true);

    const nodeNames: string[] = [];
    view.state.doc.forEach((node) => {
      nodeNames.push(node.type.name);
    });

    expect(nodeNames[0]).toBe('heading');
    expect(nodeNames).toContain('bullet_list');

    await editor.destroy();
  });

  it('parses markdown that contains html break tags before the plain-text break fallback', async () => {
    const editor = await createPasteEditor();
    const view = editor.ctx.get(editorViewCtx);

    const markdown = [
      '# HTML Break Markdown Sentinel',
      '',
      'Line one<br/>Line two.',
      '',
      '- Bullet sentinel',
    ].join('\n');

    expect(simulatePasteText(view, markdown)).toBe(true);

    const nodeNames: string[] = [];
    view.state.doc.forEach((node) => {
      nodeNames.push(node.type.name);
    });

    expect(nodeNames[0]).toBe('heading');
    expect(nodeNames).toContain('bullet_list');

    await editor.destroy();
  });

  it('recognizes pasted callout markdown as a callout block', async () => {
    const editor = await createPasteEditor();
    const view = editor.ctx.get(editorViewCtx);

    expect(simulatePasteText(view, ['> 💡 Tip', '>', '> Body'].join('\n'))).toBe(true);

    const callout = view.state.doc.firstChild;
    expect(callout?.type.name).toBe('callout');
    expect(callout?.textContent).toBe('TipBody');

    await editor.destroy();
  });

  it('recognizes pasted footnote references and definitions', async () => {
    const editor = await createPasteEditor();
    const view = editor.ctx.get(editorViewCtx);

    expect(simulatePasteText(view, ['Footnote ref[^1].', '', '[^1]: Footnote body'].join('\n'))).toBe(true);

    const paragraph = view.state.doc.child(0);
    const blankLine = view.state.doc.child(1);
    const footnote = view.state.doc.child(2);
    const inlineNodes: string[] = [];
    paragraph.descendants((node) => {
      inlineNodes.push(node.type.name);
    });

    expect(inlineNodes).toContain('footnote_reference');
    expect(blankLine.type.name).toBe('html_block');
    expect(blankLine.attrs.value).toBe(MARKDOWN_BLANK_LINE_COMMENT);
    expect(footnote.type.name).toBe('footnote_definition');
    expect(footnote.attrs.label).toBe('1');
    expect(footnote.textContent).toBe('Footnote body');

    await editor.destroy();
  });

  it('recognizes mixed custom markdown in one paste', async () => {
    const editor = await createPasteEditor();
    const view = editor.ctx.get(editorViewCtx);

    const markdown = [
      '---',
      'title: Mixed',
      '---',
      '> 💡 Callout',
      '',
      '$$',
      'x^2',
      '$$',
      '',
      '| A | B |',
      '| --- | --- |',
      '| 1 | 2 |',
      '',
      '```sequence',
      'Alice->Bob: Hi',
      '```',
    ].join('\n');

    expect(simulatePasteText(view, markdown)).toBe(true);

    const nodeNames: string[] = [];
    let blankLineCount = 0;
    view.state.doc.forEach((node) => {
      if (
        node.type.name === 'html_block'
        && node.attrs.value === '<!--vlaina-markdown-blank-line-->'
      ) {
        blankLineCount += 1;
        return;
      }
      nodeNames.push(node.type.name);
    });

    expect(nodeNames).toEqual(['frontmatter', 'callout', 'math_block', 'table', 'mermaid']);
    expect(blankLineCount).toBe(3);

    await editor.destroy();
  });

  it.each([
    ['adjacent headings', ['# First', '', '## Second'].join('\n')],
    [
      'adjacent fenced code blocks',
      ['```ts', 'const first = 1;', '```', '', '```js', 'const second = 2;', '```'].join('\n'),
    ],
  ])('keeps the authored blank editor node for %s', async (_name, markdown) => {
    const editor = await createPasteEditor();
    const view = editor.ctx.get(editorViewCtx);

    expect(simulatePasteText(view, markdown)).toBe(true);

    const blankLineNodes: string[] = [];
    view.state.doc.forEach((node) => {
      if (node.type.name === 'html_block') {
        blankLineNodes.push(node.attrs.value);
      }
    });
    expect(blankLineNodes).toEqual(['<!--vlaina-markdown-blank-line-->']);

    await editor.destroy();
  });

  it('recognizes pasted custom inline markdown marks', async () => {
    const editor = await createPasteEditor();
    const view = editor.ctx.get(editorViewCtx);

    expect(
      simulatePasteText(
        view,
        [
          '==highlight==',
          '++underlined++',
          'X^2^',
          'H~2~O',
          '<span style="color: #123456">red</span>',
          '<mark style="background-color: #ecf6ff">bg</mark>',
        ].join(' ')
      )
    ).toBe(true);

    const paragraph = view.state.doc.firstChild;
    const markNames = new Set<string>();
    paragraph?.descendants((node) => {
      if (!node.isText) return;
      node.marks.forEach((mark) => markNames.add(mark.type.name));
    });

    expect(markNames.has('highlight')).toBe(true);
    expect(markNames.has('underline')).toBe(true);
    expect(markNames.has('superscript')).toBe(true);
    expect(markNames.has('subscript')).toBe(true);
    expect(markNames.has('textColor')).toBe(true);
    expect(markNames.has('bgColor')).toBe(true);

    await editor.destroy();
  });

  it('recognizes pasted image markdown', async () => {
    const editor = await createPasteEditor();
    const view = editor.ctx.get(editorViewCtx);

    expect(simulatePasteText(view, '![Alt](image.png "Title")')).toBe(true);
    expect(view.state.doc.firstChild?.firstChild?.type.name).toBe('image');

    await editor.destroy();
  });

  it('recognizes pasted definition list markdown', async () => {
    const editor = await createPasteEditor();
    const view = editor.ctx.get(editorViewCtx);

    expect(simulatePasteText(view, ['Term', ': Definition'].join('\n'))).toBe(true);

    const definitionList = view.state.doc.firstChild;
    expect(definitionList?.type.name).toBe('definition_list');
    expect(definitionList?.child(0).type.name).toBe('definition_term');
    expect(definitionList?.child(0).textContent).toBe('Term');
    expect(definitionList?.child(1).type.name).toBe('definition_desc');
    expect(definitionList?.child(1).textContent).toBe('Definition');

    await editor.destroy();
  });
});
