import { describe, expect, it, vi } from 'vitest';
import { Editor, defaultValueCtx, editorViewCtx } from '@milkdown/kit/core';
import { commonmark } from '@milkdown/kit/preset/commonmark';
import { gfm } from '@milkdown/kit/preset/gfm';

import { clipboardPlugin } from './clipboardPlugin';
import { blockAlignmentPlugin, colorMarksPlugin } from '../floating-toolbar';
import { calloutPlugin } from '../callout';
import { codePlugin } from '../code';
import { footnotePlugin } from '../footnote';
import { frontmatterPlugin } from '../frontmatter';
import { highlightPlugin } from '../highlight';
import { mathPlugin } from '../math';
import { mermaidPlugin } from '../mermaid';
import { tocPlugin } from '../toc';
import { videoPlugin } from '../video';

type ClipboardEditor = ReturnType<typeof Editor.make>;
const MARKDOWN_BLANK_LINE_COMMENT = '<!--vlaina-markdown-blank-line-->';

interface PasteSyntaxTodo {
  name: string;
  markdown: string;
  expectDoc: (doc: any) => void;
}

function simulatePasteText(view: any, text: string): boolean {
  const event = {
    clipboardData: {
      getData(type: string) {
        return type === 'text/plain' ? text : '';
      },
    },
    preventDefault: vi.fn(),
  };

  let handled = false;
  view.someProp('handlePaste', (handlePaste: any) => {
    const didHandle = handlePaste(view, event, null);
    handled = didHandle || handled;
    return didHandle || undefined;
  });
  return handled;
}

async function createPasteEditor(): Promise<ClipboardEditor> {
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
    .use(tocPlugin)
    .use(blockAlignmentPlugin);

  await editor.create();
  return editor;
}

function topLevelNodeNames(doc: any): string[] {
  return topLevelContentNodes(doc).map((node) => node.type.name);
}

function topLevelContentNodes(doc: any): any[] {
  const nodes: any[] = [];
  doc.forEach((node: any) => {
    if (node.type.name === 'html_block' && node.attrs.value === MARKDOWN_BLANK_LINE_COMMENT) {
      return;
    }
    nodes.push(node);
  });
  return nodes;
}

function markNamesInDoc(doc: any): Set<string> {
  const names = new Set<string>();
  doc.descendants((node: any) => {
    if (!node.isText) return;
    node.marks.forEach((mark: any) => names.add(mark.type.name));
  });
  return names;
}

const pasteSyntaxTodo: PasteSyntaxTodo[] = [
  {
    name: 'atx headings',
    markdown: ['# Heading 1', '### Heading 3', '###### Heading 6'].join('\n'),
    expectDoc: (doc) => {
      expect(topLevelNodeNames(doc)).toEqual(['heading', 'heading', 'heading']);
      expect(doc.child(0).attrs.level).toBe(1);
      expect(doc.child(1).attrs.level).toBe(3);
      expect(doc.child(2).attrs.level).toBe(6);
    },
  },
  {
    name: 'setext headings',
    markdown: ['Heading 1', '========='].join('\n'),
    expectDoc: (doc) => {
      expect(topLevelNodeNames(doc)).toEqual(['heading']);
      expect(doc.child(0).attrs.level).toBe(1);
    },
  },
  {
    name: 'inline marks links and image',
    markdown: '**bold** *italic* ~~strike~~ `code` [link](https://example.com) ![alt](image.png)',
    expectDoc: (doc) => {
      expect(doc.firstChild.type.name).toBe('paragraph');
      expect(Array.from(markNamesInDoc(doc))).toEqual(expect.arrayContaining(['strong', 'emphasis', 'strike_through', 'inlineCode', 'link']));
      expect(doc.firstChild.lastChild.type.name).toBe('image');
    },
  },
  {
    name: 'reference links autolinks and definitions',
    markdown: ['Read [Docs][docs] and <https://example.com>.', '', '[docs]: https://example.com/docs "Docs"'].join('\n'),
    expectDoc: (doc) => {
      expect(doc.firstChild.type.name).toBe('paragraph');
      expect(markNamesInDoc(doc).has('link')).toBe(true);
    },
  },
  {
    name: 'unordered ordered and task lists',
    markdown: ['- bullet', '  - nested', '- [x] done', '', '3. third', '4. fourth'].join('\n'),
    expectDoc: (doc) => {
      const nodes = topLevelContentNodes(doc);
      expect(topLevelNodeNames(doc)).toEqual(['bullet_list', 'ordered_list']);
      expect(nodes[0].child(1).attrs.checked).toBe(true);
      expect(nodes[1].attrs.order).toBe(3);
    },
  },
  {
    name: 'blockquotes with nested list and code',
    markdown: ['> Intro', '>', '> - item', '>', '> ```ts', '> const value = 1;', '> ```'].join('\n'),
    expectDoc: (doc) => {
      expect(doc.firstChild.type.name).toBe('blockquote');
      expect(topLevelNodeNames(doc.firstChild)).toEqual(['paragraph', 'bullet_list', 'code_block']);
    },
  },
  {
    name: 'tables',
    markdown: ['| A | B |', '| --- | ---: |', '| `a | b` | **bold** |'].join('\n'),
    expectDoc: (doc) => {
      expect(doc.firstChild.type.name).toBe('table');
      expect(doc.firstChild.childCount).toBe(2);
    },
  },
  {
    name: 'fenced code blocks',
    markdown: ['```ts', 'const value = 1;', '```'].join('\n'),
    expectDoc: (doc) => {
      expect(doc.firstChild.type.name).toBe('code_block');
      expect(doc.firstChild.attrs.language).toBe('ts');
      expect(doc.firstChild.textContent).toBe('const value = 1;');
    },
  },
  {
    name: 'math block and inline math',
    markdown: ['Inline $x + y$.', '', '$$', '\\frac{1}{2}', '$$'].join('\n'),
    expectDoc: (doc) => {
      const nodes = topLevelContentNodes(doc);
      expect(topLevelNodeNames(doc)).toEqual(['paragraph', 'math_block']);
      const inlineNodeNames: string[] = [];
      nodes[0].descendants((node: any) => inlineNodeNames.push(node.type.name));
      expect(inlineNodeNames).toContain('math_inline');
      expect(nodes[1].attrs.latex).toBe('\\frac{1}{2}');
    },
  },
  {
    name: 'frontmatter',
    markdown: ['---', 'title: Demo', 'tags:', '  - notes', '---', '# Heading'].join('\n'),
    expectDoc: (doc) => {
      expect(topLevelNodeNames(doc)).toEqual(['frontmatter', 'heading']);
      expect(doc.firstChild.textContent).toContain('title: Demo');
    },
  },
  {
    name: 'callout blockquotes',
    markdown: ['> 💡 Tip', '>', '> Body'].join('\n'),
    expectDoc: (doc) => {
      expect(doc.firstChild.type.name).toBe('callout');
      expect(doc.firstChild.textContent).toBe('TipBody');
    },
  },
  {
    name: 'footnotes',
    markdown: ['Footnote ref[^1].', '', '[^1]: Footnote body'].join('\n'),
    expectDoc: (doc) => {
      const nodes = topLevelContentNodes(doc);
      expect(topLevelNodeNames(doc)).toEqual(['paragraph', 'footnote_definition']);
      expect(nodes[1].attrs.label).toBe('1');
    },
  },
  {
    name: 'custom inline marks',
    markdown: [
      '==highlight==',
      '++underline++',
      'X^2^',
      'H~2~O',
      '<span style="color: #123456">red</span>',
      '<mark style="background-color: #ecf6ff">bg</mark>',
    ].join(' '),
    expectDoc: (doc) => {
      expect(Array.from(markNamesInDoc(doc))).toEqual(expect.arrayContaining([
        'highlight',
        'underline',
        'superscript',
        'subscript',
        'textColor',
        'bgColor',
      ]));
    },
  },
  {
    name: 'mermaid and diagram aliases',
    markdown: ['```sequence', 'Alice->Bob: Hi', '```'].join('\n'),
    expectDoc: (doc) => {
      expect(doc.firstChild.type.name).toBe('mermaid');
      expect(doc.firstChild.attrs.code).toContain('sequenceDiagram');
    },
  },
  {
    name: 'table of contents shortcut',
    markdown: '[TOC]',
    expectDoc: (doc) => {
      expect(doc.firstChild.type.name).toBe('toc');
    },
  },
  {
    name: 'video image syntax',
    markdown: '![video](https://example.com/video.mp4 "Demo video")',
    expectDoc: (doc) => {
      expect(doc.firstChild.type.name).toBe('video');
    },
  },
  {
    name: 'horizontal rules',
    markdown: ['before', '', '---', '', 'after'].join('\n'),
    expectDoc: (doc) => {
      expect(topLevelNodeNames(doc)).toEqual(['paragraph', 'hr', 'paragraph']);
    },
  },
  {
    name: 'hard breaks',
    markdown: ['before\\', 'after'].join('\n'),
    expectDoc: (doc) => {
      const inlineNames: string[] = [];
      doc.firstChild.descendants((node: any) => inlineNames.push(node.type.name));
      expect(inlineNames).toContain('hardbreak');
    },
  },
];

describe('notes paste syntax todo', () => {
  it.each(pasteSyntaxTodo)('recognizes pasted $name', async ({ markdown, expectDoc }) => {
    const editor = await createPasteEditor();
    const view = editor.ctx.get(editorViewCtx);

    try {
      expect(simulatePasteText(view, markdown)).toBe(true);
      expectDoc(view.state.doc);
    } finally {
      await editor.destroy();
    }
  });
});
