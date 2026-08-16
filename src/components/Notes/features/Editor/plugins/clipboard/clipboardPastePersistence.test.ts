import { describe, expect, it, vi } from 'vitest';
import {
  Editor,
  defaultValueCtx,
  editorViewCtx,
  remarkStringifyOptionsCtx,
  serializerCtx,
} from '@milkdown/kit/core';
import { commonmark } from '@milkdown/kit/preset/commonmark';
import { gfm, remarkGFMPlugin } from '@milkdown/kit/preset/gfm';
import {
  normalizeSerializedMarkdownDocument,
  stripTrailingNewlines,
} from '@/lib/notes/markdown/markdownSerializationUtils';
import { notesRemarkGfmOptions, notesRemarkStringifyOptions } from '../../config/stringifyOptions';
import { configureTheme } from '../../theme';
import {
  serializeLeadingFrontmatterMarkdown,
} from '../frontmatter/frontmatterMarkdown';
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
import { htmlInlineSourceTextPlugin } from '../html-inline';
import { tocPlugin } from '../toc';
import { blockAlignmentPlugin } from '../floating-toolbar';
import { markdownLinkPlugin } from '../links/markdown-link/markdownLinkPlugin';
import { deflistPlugin } from '../deflist';

const pasteBoundaryBlocks = [
  { name: 'paragraph', lines: ['Body'] },
  { name: 'heading', lines: ['## Middle'] },
  { name: 'ordered list', lines: ['1. Ordered'] },
  { name: 'bullet list', lines: ['- Bullet'] },
  { name: 'task list', lines: ['- [ ] Task'] },
  { name: 'blockquote', lines: ['> Quote'] },
  { name: 'callout', lines: ['> 💡 Callout'] },
  { name: 'thematic break', lines: ['---'] },
  { name: 'table', lines: ['|A|B|', '|-|-|', '|1|2|'] },
  { name: 'fenced code', lines: ['```ts', 'const value = 1;', '```'] },
  { name: 'display math', lines: ['$$', 'x + y', '$$'] },
  { name: 'Mermaid', lines: ['```mermaid', 'graph TD', 'A --> B', '```'] },
  { name: 'footnote definition', lines: ['[^1]: Footnote'] },
  { name: 'abbreviation definition', lines: ['*[HTML]: HyperText Markup Language'] },
  { name: 'definition list', lines: ['Term', '', ': Definition'] },
  { name: 'table of contents', lines: ['[TOC]'] },
  { name: 'video', lines: ['![video](https://example.com/video.mp4)'] },
  { name: 'image', lines: ['![alt](image.png)'] },
  { name: 'raw HTML comment', lines: ['<!-- Raw HTML -->'] },
  { name: 'block alignment comment', lines: ['<!--align:center-->'] },
];

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

async function createPasteEditor(options: { includeMarkdownLinkPlugin?: boolean } = {}) {
  const editor = Editor.make()
    .config((ctx) => {
      ctx.set(defaultValueCtx, '');
      ctx.update(remarkStringifyOptionsCtx, (prev) => ({
        ...prev,
        ...notesRemarkStringifyOptions,
      }));
      ctx.set(remarkGFMPlugin.options.key, notesRemarkGfmOptions);
    })
    .use(commonmark)
    .use(gfm)
    .use(configureTheme);

  if (options.includeMarkdownLinkPlugin) {
    editor.use(markdownLinkPlugin);
  }

  editor.use(clipboardPlugin);

  for (const plugin of [
    ...frontmatterPlugin,
    ...calloutPlugin,
    ...footnotePlugin,
    ...mathPlugin,
    ...mermaidPlugin,
    ...codePlugin,
    htmlInlineSourceTextPlugin,
    ...highlightPlugin,
    ...colorMarksPlugin,
    ...videoPlugin,
    ...tocPlugin,
    ...blockAlignmentPlugin,
    ...deflistPlugin,
  ]) {
    editor.use(plugin);
  }

  await editor.create();
  return editor;
}

async function pasteAndPersist(markdown: string) {
  const editor = await createPasteEditor();
  return pasteAndPersistWithEditor(editor, markdown);
}

async function pasteAndPersistWithEditor(editor: any, markdown: string) {
  const view = editor.ctx.get(editorViewCtx);
  expect(simulatePasteText(view, markdown)).toBe(true);

  const serializer = editor.ctx.get(serializerCtx);
  const persisted = stripTrailingNewlines(
    serializeLeadingFrontmatterMarkdown(
      normalizeSerializedMarkdownDocument(serializer(view.state.doc)),
      markdown
    )
  );

  await editor.destroy();
  return persisted;
}

describe('clipboard paste markdown persistence', () => {
  it.each([
    ['frontmatter', ['---', 'title: Demo', '---', '# Heading'].join('\n')],
    ['footnote', ['Footnote ref[^1].', '', '[^1]: Footnote body'].join('\n')],
    ['math', ['Inline $x + y$.', '', '$$', 'x^2', '$$'].join('\n')],
    ['mermaid', ['```mermaid', 'flowchart TD', 'A --> B', '```'].join('\n')],
    ['custom inline marks', '==highlight== ++underlined++ X^2^ H~2~O'],
    ['color html', '<span style="color: #123456">red</span> <mark style="background-color: #ecf6ff">bg</mark>'],
    [
      'nested color html',
      '<span style="color: #123456"><em>nested</em></span> <mark style="background-color: #ecf6ff"><strong>bold</strong></mark>',
    ],
    ['toc', '[TOC]'],
  ] as const)('preserves pasted %s markdown on save', async (_name, markdown) => {
    await expect(pasteAndPersist(markdown)).resolves.toBe(markdown);
  });

  it.each([
    [
      'image',
      '![A < B](image.png "Title & More")',
      '![A < B](image.png "Title & More")',
    ],
    [
      'video',
      '![video](https://example.com/video.mp4 "Demo video")',
      '![video](https://example.com/video.mp4 "Demo video")',
    ],
  ] as const)('persists pasted %s markdown syntax', async (_name, markdown, expected) => {
    await expect(pasteAndPersist(markdown)).resolves.toBe(expected);
  });

  it('persists pasted TSV as a standard GFM table', async () => {
    await expect(pasteAndPersist(['A\tB', '1\t2'].join('\n'))).resolves.toBe(
      ['|A|B|', '|-|-|', '|1|2|'].join('\n')
    );
  });

  it('persists pasted fullwidth-pipe tables as standard GFM tables', async () => {
    await expect(pasteAndPersist(['｜ A ｜ B ｜', '｜ --- ｜ --- ｜', '｜ 1 ｜ 2 ｜'].join('\n'))).resolves.toBe(
      ['|A|B|', '|-|-|', '|1|2|'].join('\n')
    );
  });

  it('persists pasted ordered lists that are missing marker spaces as standard markdown', async () => {
    await expect(pasteAndPersist(['0.安装更换路径', '', '1.调用笔记', '', '2.切换笔记'].join('\n'))).resolves.toBe(
      ['0. 安装更换路径', '1. 调用笔记', '2. 切换笔记'].join('\n')
    );
  });

  it('persists pasted task lists with malformed checkbox markers as standard markdown', async () => {
    await expect(pasteAndPersist(['- [] fsedf', '-[] ', '-[x]done'].join('\n'))).resolves.toBe(
      ['- [ ] fsedf', '- [ ]', '- [x] done'].join('\n')
    );
  });

  it('persists pasted common non-standard markdown line markers as standard markdown', async () => {
    await expect(pasteAndPersist(['1、苹果', '2、香蕉', '', '-苹果', '-香蕉'].join('\n'))).resolves.toBe(
      ['1. 苹果', '2. 香蕉', '- 苹果', '- 香蕉'].join('\n')
    );
    await expect(pasteAndPersist(['＃标题', '', '＞引用'].join('\n'))).resolves.toBe(
      ['# 标题', '', '> 引用'].join('\n')
    );
    await expect(pasteAndPersist(['１．苹果', '２．香蕉', '３）橘子'].join('\n'))).resolves.toBe(
      ['1. 苹果', '2. 香蕉', '3. 橘子'].join('\n')
    );
    await expect(pasteAndPersist(['• 苹果', '• 香蕉', '◦ 橘子'].join('\n'))).resolves.toBe(
      ['- 苹果', '- 香蕉', '- 橘子'].join('\n')
    );
  });

  it.each([
    ['heading before blockquote', ['# Heading', '', '> Quote'].join('\n')],
    ['adjacent headings', ['# First', '', '## Second'].join('\n')],
    ['paragraph before labelled fenced code', ['Body', '', '```code', 'code', '```'].join('\n')],
    ['labelled fenced code before heading', ['```code', 'code', '```', '', '# Heading'].join('\n')],
    [
      'adjacent labelled fenced code blocks',
      ['```ts', 'const first = 1;', '```', '', '```ecmascript', 'const second = 2;', '```'].join('\n'),
    ],
  ] as const)('preserves an authored blank line at a tight %s boundary', async (_name, markdown) => {
    await expect(pasteAndPersist(markdown)).resolves.toBe(markdown);
  });

  it.each(pasteBoundaryBlocks.flatMap((block) => [0, 1, 2].map((blankLineCount) => ({
    ...block,
    blankLineCount,
  }))))(
    'preserves $blankLineCount authored blank line(s) around pasted $name',
    async ({ lines, blankLineCount }) => {
      const blanks = Array.from({ length: blankLineCount }, () => '');
      const markdown = [
        '# Before',
        ...blanks,
        ...lines,
        ...blanks,
        '```after',
        'after',
        '```',
      ].join('\n');
      await expect(pasteAndPersist(markdown)).resolves.toBe(markdown);
    },
  );

  it.each([0, 1, 2])(
    'preserves %s authored blank line(s) after pasted frontmatter',
    async (blankLineCount) => {
      const blanks = Array.from({ length: blankLineCount }, () => '');
      const markdown = [
        '---',
        'title: Demo',
        '---',
        ...blanks,
        '# Heading',
      ].join('\n');
      await expect(pasteAndPersist(markdown)).resolves.toBe(markdown);
    },
  );

  it('persists copied bullet-prefixed numbered outlines as ordered lists without hard-break escapes', async () => {
    const pasted = [
      '• 1. emoji shortcode 没接入',
      '     editor 支持 :smile: 这类短码和 ESC 补全。我们当前没有接',
      '     入 emoji shortcode，:smile: 基本会保留为普通文本。',
      '  2. 源代码模式缺失',
      '     没看到 editor 式一键切换纯 Markdown 源码编辑模式。',
      '  3. span 元素“靠近光标自动展开源码”的体验不完整',
      '     我们有 tooltip、节点视图和编辑器，但不是 editor 那种统一',
      '     的“平时渲染，编辑时展开 Markdown 源码”。',
    ].join('\n');

    await expect(pasteAndPersist(pasted)).resolves.toBe([
      '1. emoji shortcode 没接入',
      '',
      '   editor 支持 :smile: 这类短码和 ESC 补全。我们当前没有接入 emoji shortcode，:smile: 基本会保留为普通文本。',
      '',
      '2. 源代码模式缺失',
      '',
      '   没看到 editor 式一键切换纯 Markdown 源码编辑模式。',
      '',
      '3. span 元素“靠近光标自动展开源码”的体验不完整',
      '',
      '   我们有 tooltip、节点视图和编辑器，但不是 editor 那种统一的“平时渲染，编辑时展开 Markdown 源码”。',
    ].join('\n'));
  });

  it('keeps inline self-closing video html examples visible inside pasted ordered-list prose', async () => {
    const editor = await createPasteEditor();
    const view = editor.ctx.get(editorViewCtx);
    const pasted = [
      '  12. 视频 HTML 支持弱于 editor',
      '     editor 支持 <video src="xxx.mp4" />、拖放视频和路径规',
      '  则。我们有 video 插件，但原生 HTML video 兼容、拖放和路径策',
      '  略不一定完整对齐。',
    ].join('\n');

    expect(simulatePasteText(view, pasted)).toBe(true);
    expect(view.dom.querySelector('video')).toBeNull();
    expect(view.dom.textContent).toContain('<video src="xxx.mp4" />');
    const literalHtml = Array.from(
      view.dom.querySelectorAll<HTMLElement>('span.md-html-inline.md-html-source-text')
    ).find((element) => element.textContent === '<video src="xxx.mp4" />');
    expect(literalHtml).toBeInstanceOf(HTMLElement);

    const serializer = editor.ctx.get(serializerCtx);
    const persisted = stripTrailingNewlines(
      serializeLeadingFrontmatterMarkdown(
        normalizeSerializedMarkdownDocument(serializer(view.state.doc)),
        pasted
      )
    );
    expect(persisted).toContain('<video src="xxx.mp4" />');

    await editor.destroy();
  });

  it('keeps plain html-like text visible when pasted as markdown', async () => {
    const editor = await createPasteEditor();
    const view = editor.ctx.get(editorViewCtx);
    const pasted = ['<p>', '</p>', '<div>literal', '<a></a>'].join('\n');

    expect(simulatePasteText(view, pasted)).toBe(true);
    expect(view.dom.textContent).toContain('<p>');
    expect(view.dom.textContent).toContain('</p>');
    expect(view.dom.textContent).toContain('<div>literal');
    expect(view.dom.textContent).toContain('<a></a>');
    expect(view.dom.querySelector('a')).toBeNull();

    const serializer = editor.ctx.get(serializerCtx);
    const persisted = stripTrailingNewlines(
      serializeLeadingFrontmatterMarkdown(
        normalizeSerializedMarkdownDocument(serializer(view.state.doc)),
        pasted
      )
    );
    expect(persisted).toBe(['<p>\\', '</p>\\', '<div>literal\\', '<a></a>'].join('\n'));
    expect(persisted).not.toContain('\\<');

    await editor.destroy();
  });

  it('converts copied html break tags in plain text paste to markdown line breaks', async () => {
    await expect(pasteAndPersist('第一行<br>第二行')).resolves.toBe('第一行\\\n第二行');
  });

  it('converts repeated copied html break tags in plain text paste to paragraph gaps', async () => {
    await expect(pasteAndPersist('Before<br><br>After')).resolves.toBe('Before\n\nAfter');
  });

  it.each([
    ['image', '<img src="cover.png" />', 'img'],
    ['iframe', '<iframe src="https://example.com/embed"></iframe>', 'iframe'],
    ['audio', '<audio src="demo.mp3" />', 'audio'],
  ] as const)('keeps inline %s html examples as text while pasting markdown prose', async (_name, html, selector) => {
    const editor = await createPasteEditor();
    const view = editor.ctx.get(editorViewCtx);
    const pasted = [
      '1. HTML 示例',
      `   说明里写 ${html} 不应该变成真实元素。`,
    ].join('\n');

    expect(simulatePasteText(view, pasted)).toBe(true);
    expect(view.dom.querySelector(selector)).toBeNull();
    expect(view.dom.textContent).toContain(html);

    await editor.destroy();
  });

  it('does not rewrite embedded html inside pasted fenced code blocks or inline code spans', async () => {
    const pasted = [
      '1. HTML 示例',
      '   行内代码 `<img src="cover.png" />` 应该保持代码内容。',
      '',
      '```html',
      '<iframe src="https://example.com/embed"></iframe>',
      '<video src="demo.mp4" />',
      '```',
    ].join('\n');

    const persisted = await pasteAndPersist(pasted);

    expect(persisted).toContain('`<img src="cover.png" />`');
    expect(persisted).toContain('<iframe src="https://example.com/embed"></iframe>');
    expect(persisted).toContain('<video src="demo.mp4" />');
    expect(persisted).not.toContain('\\<iframe');
    expect(persisted).not.toContain('\\<video');
  });

  it('does not rewrite embedded html inside pasted blockquote fenced code blocks', async () => {
    const pasted = [
      '> ```html',
      '> <img src="cover.png" />',
      '> <iframe src="https://example.com/embed"></iframe>',
      '> ```',
    ].join('\n');

    const persisted = await pasteAndPersist(pasted);

    expect(persisted).toContain('<img src="cover.png" />');
    expect(persisted).toContain('<iframe src="https://example.com/embed"></iframe>');
    expect(persisted).not.toContain('\\<img');
    expect(persisted).not.toContain('\\<iframe');
  });

  it('does not rewrite inline html examples inside pasted list-contained fenced code', async () => {
    const pasted = [
      '- ```html',
      '  Example <iframe src="https://example.test/embed"></iframe> stays literal.',
      '  ```',
    ].join('\n');

    const persisted = await pasteAndPersist(pasted);

    expect(persisted).toContain('Example <iframe src="https://example.test/embed"></iframe> stays literal.');
    expect(persisted).not.toContain('\\<iframe');
  });

  it('keeps standalone embedded html lines as raw html during structural markdown paste', async () => {
    const pasted = [
      '1. HTML 示例',
      '',
      '<iframe src="https://example.com/embed"></iframe>',
      '',
      '<video src="https://example.com/demo.mp4"></video>',
    ].join('\n');

    const persisted = await pasteAndPersist(pasted);

    expect(persisted).toContain('<iframe src="https://example.com/embed"></iframe>');
    expect(persisted).toContain('<video src="https://example.com/demo.mp4"></video>');
    expect(persisted).not.toContain('\\<iframe');
    expect(persisted).not.toContain('\\<video');
  });

  it('does not rewrite embedded elements inside standalone raw html wrapper lines', async () => {
    const pasted = [
      '1. HTML 示例',
      '',
      '<div><img src="https://example.com/cover.png" alt="cover"></div>',
      '',
      '<p>editor 支持 <video src="https://example.com/demo.mp4"></video></p>',
    ].join('\n');

    const persisted = await pasteAndPersist(pasted);

    expect(persisted).toContain('<div><img src="https://example.com/cover.png" alt="cover"></div>');
    expect(persisted).toContain('<p>editor 支持 <video src="https://example.com/demo.mp4"></video></p>');
    expect(persisted).not.toContain('\\<img');
    expect(persisted).not.toContain('\\<video');
  });

  it('does not rewrite embedded elements inside raw html wrappers in markdown containers', async () => {
    const pasted = [
      '> <p>引用里 <video src="https://example.com/demo.mp4"></video></p>',
      '',
      '1. <p>列表里 <img src="https://example.com/cover.png" /></p>',
      '',
      '2. <video controls><source src="https://example.com/demo.mp4" type="video/mp4"></video>',
    ].join('\n');

    const persisted = await pasteAndPersist(pasted);

    expect(persisted).toContain('<video src="https://example.com/demo.mp4"></video>');
    expect(persisted).toContain('<img src="https://example.com/cover.png"');
    expect(persisted).toContain('<video controls><source src="https://example.com/demo.mp4" type="video/mp4"></video>');
    expect(persisted).not.toContain('\\<video');
    expect(persisted).not.toContain('\\<img');
    expect(persisted).not.toContain('\\<source');
  });

  it('keeps embedded html examples inside table cells as text', async () => {
    const editor = await createPasteEditor();
    const view = editor.ctx.get(editorViewCtx);
    const pasted = [
      '| A | B |',
      '| - | - |',
      '| text | 表格里 <audio src="demo.mp3"></audio> 应该是文本 |',
    ].join('\n');

    expect(simulatePasteText(view, pasted)).toBe(true);
    expect(view.dom.querySelector('audio')).toBeNull();
    expect(view.dom.textContent).toContain('<audio src="demo.mp3"></audio>');

    await editor.destroy();
  });

  it('keeps leading embedded html examples in list prose as text when followed by prose', async () => {
    const editor = await createPasteEditor();
    const view = editor.ctx.get(editorViewCtx);
    const pasted = [
      '1. <video src="demo.mp4" /> 是 editor 支持的视频示例。',
      '2. <img src="cover.png" /> 是图片示例。',
    ].join('\n');

    expect(simulatePasteText(view, pasted)).toBe(true);
    expect(view.dom.querySelector('video')).toBeNull();
    expect(view.dom.querySelector('img')).toBeNull();
    expect(view.dom.textContent).toContain('<video src="demo.mp4" />');
    expect(view.dom.textContent).toContain('<img src="cover.png" />');

    await editor.destroy();
  });

  it('does not fold unindented prose after a bullet-prefixed number into an ordered outline item', async () => {
    const pasted = ['• 1. Release note', 'This paragraph is not part of the outline.', '2. Next'].join('\n');

    await expect(pasteAndPersist(pasted)).resolves.toBe(
      ['• 1. Release note', 'This paragraph is not part of the outline.', '2\\. Next'].join('\n')
    );
  });

  it('normalizes pasted mermaid aliases to canonical mermaid fenced code', async () => {
    await expect(pasteAndPersist(['```sequence', 'Alice->Bob: Hi', '```'].join('\n'))).resolves.toBe(
      ['```mermaid', 'sequenceDiagram', 'Alice->Bob: Hi', '```'].join('\n')
    );
  });

  it('keeps literal trailing backslashes in plain text paste', async () => {
    const pasted = [
      '7）视图模式：支持大纲和文档列表视图，方便在不同段落和不同文件之间进行切换。\\',
      '8）跨平台：支持macOS、Windows和Linux系统。\\',
      '9）目前免费：这么好用的编辑器竟然是免费的。',
    ].join('\n');

    await expect(pasteAndPersist(pasted)).resolves.toBe([
      '7）视图模式：支持大纲和文档列表视图，方便在不同段落和不同文件之间进行切换。\\\\\\',
      '8）跨平台：支持macOS、Windows和Linux系统。\\\\\\',
      '9）目前免费：这么好用的编辑器竟然是免费的。',
    ].join('\n'));
  });

  it('keeps trailing backslashes visible in the editor document after paste', async () => {
    const pasted = [
      '7）视图模式：支持大纲和文档列表视图，方便在不同段落和不同文件之间进行切换。\\',
      '8）跨平台：支持macOS、Windows和Linux系统。\\',
      '9）目前免费：这么好用的编辑器竟然是免费的。',
    ].join('\n');
    const editor = await createPasteEditor();
    const view = editor.ctx.get(editorViewCtx);

    expect(simulatePasteText(view, pasted)).toBe(true);
    expect(view.state.doc.textContent).toContain('切换。\\');
    expect(view.state.doc.textContent).toContain('系统。\\');

    await editor.destroy();
  });

  it('parses single-line markdown images before markdown link paste handling', async () => {
    const editor = await createPasteEditor({ includeMarkdownLinkPlugin: true });
    const markdown = '![百度](https://www.baidu.com/img/PCfb_5bf082d29588c07f842ccde3f97243ea.png "百度一下，你就知道")';

    await expect(pasteAndPersistWithEditor(editor, markdown)).resolves.toBe(
      markdown
    );
  });
});
