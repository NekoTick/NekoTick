import { afterEach, describe, expect, it } from 'vitest';
import {
  Editor,
  defaultValueCtx,
  editorViewCtx,
  remarkStringifyOptionsCtx,
  serializerCtx,
} from '@milkdown/kit/core';
import { TextSelection } from '@milkdown/kit/prose/state';
import { commonmark } from '@milkdown/kit/preset/commonmark';
import { gfm } from '@milkdown/kit/preset/gfm';
import { history } from '@milkdown/kit/plugin/history';
import { listener } from '@milkdown/kit/plugin/listener';
import { tableBlock } from '@milkdown/kit/component/table-block';

import { notesRemarkStringifyOptions } from '../../config/stringifyOptions';
import { customPlugins } from '../../config/plugins';
import { configureTheme } from '../../theme';
import {
  normalizeAlternativeMathBlockFences,
  normalizeSerializedMarkdownDocument,
  preserveMarkdownBlankLinesForEditor,
  stripTrailingNewlines,
} from '@/lib/notes/markdown/markdownSerializationUtils';
import { normalizeLeadingFrontmatterMarkdown } from '../../plugins/frontmatter/frontmatterMarkdown';

type TestEditor = ReturnType<typeof Editor.make>;

const editors: TestEditor[] = [];

afterEach(async () => {
  while (editors.length > 0) {
    await editors.pop()?.destroy();
  }
  document.body.innerHTML = '';
});

async function openMarkdown(markdown: string) {
  const defaultValue = preserveMarkdownBlankLinesForEditor(
    normalizeLeadingFrontmatterMarkdown(
      normalizeAlternativeMathBlockFences(markdown)
    )
  );
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
    .use(configureTheme);
  editor.use(tableBlock);
  editor.use(customPlugins);

  await editor.create();
  editors.push(editor);

  const view = editor.ctx.get(editorViewCtx);
  const serializer = editor.ctx.get(serializerCtx);
  return {
    view,
    dom: view.dom,
    persisted: stripTrailingNewlines(normalizeSerializedMarkdownDocument(serializer(view.state.doc))),
  };
}

describe('markdown security when opening notes', () => {
  it('does not render executable or local-file markdown links as anchors', async () => {
    const result = await openMarkdown([
      '[javascript](javascript:alert(1))',
      '[data](data:text/html;base64,PHNjcmlwdD4=)',
      '[file](file:///etc/passwd)',
      '[windows](C:\\Windows\\win.ini)',
      '[protocol](//example.com/path)',
      '[safe](https://example.com/docs)',
      '[mail](mailto:user@example.com)',
      '[relative](docs/safe.md)',
    ].join(' '));

    const hrefs = Array.from(result.dom.querySelectorAll('a')).map((anchor) => anchor.getAttribute('href'));

    expect(hrefs).toContain('https://example.com/docs');
    expect(hrefs).toContain('mailto:user@example.com');
    expect(hrefs).toContain('docs/safe.md');
    expect(hrefs.some((href) => href?.startsWith('javascript:'))).toBe(false);
    expect(hrefs.some((href) => href?.startsWith('data:'))).toBe(false);
    expect(hrefs.some((href) => href?.startsWith('file:'))).toBe(false);
    expect(hrefs.some((href) => href?.startsWith('//'))).toBe(false);
    const anchorTexts = Array.from(result.dom.querySelectorAll('a')).map((anchor) => anchor.textContent);
    expect(anchorTexts).not.toEqual(expect.arrayContaining(['javascript', 'data', 'file', 'windows', 'protocol']));
    expect(result.persisted).toContain('javascript:alert');
    expect(result.persisted).toContain('file:///etc/passwd');
    expect(result.persisted).toContain('](//example.com');
  });

  it('only auto-loads sanitized relative and public remote image sources', async () => {
    const result = await openMarkdown([
      '![javascript](javascript:alert(1))',
      '![data](data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+)',
      '![asset](asset://localhost/secret.png)',
      '![file](file:///etc/passwd)',
      '![unix](/etc/passwd)',
      '![localhost](http://127.0.0.1:3000/secret.png)',
      '![short-ip](http://127.1/secret.png)',
      '![integer-ip](http://2130706433/secret.png)',
      '![private](http://192.168.1.8/secret.png)',
      '![safe](https://example.com/safe.png)',
      '![relative](images/safe.png)',
      '<img src="javascript:alert(1)" alt="raw-js">',
      '<img src="/etc/passwd" alt="raw-unix">',
      '<img src="http://localhost:3000/secret.png" alt="raw-local">',
      '<img src="http://0177.0.0.1/secret.png" alt="raw-octal">',
      '<img src="//127.0.0.1:3000/secret.png" alt="raw-protocol-relative">',
      '<picture><source srcset="data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+ 1x"><img src="https://example.com/fallback.png"></picture>',
      '<picture><source srcset="//127.0.0.1:3000/secret.png 1x"><img src="https://example.com/fallback.png"></picture>',
    ].join('\n\n'));

    const srcs = Array.from(result.dom.querySelectorAll('img, .image-block-container'))
      .map((image) => image.getAttribute('src'));
    const srcsets = Array.from(result.dom.querySelectorAll('source')).map((source) => source.getAttribute('srcset'));

    expect(srcs).toContain('https://example.com/safe.png');
    expect(srcs).toContain('images/safe.png');
    expect(srcs.some((src) => src?.startsWith('javascript:'))).toBe(false);
    expect(srcs.some((src) => src?.startsWith('data:'))).toBe(false);
    expect(srcs.some((src) => src?.startsWith('asset:'))).toBe(false);
    expect(srcs.some((src) => src?.startsWith('file:'))).toBe(false);
    expect(srcs.some((src) => src === '/etc/passwd')).toBe(false);
    expect(srcs.some((src) => src?.includes('127.0.0.1') || src?.includes('localhost'))).toBe(false);
    expect(srcs.some((src) => src?.includes('127.1') || src?.includes('2130706433') || src?.includes('0177.'))).toBe(false);
    expect(srcs.some((src) => src?.includes('192.168.'))).toBe(false);
    expect(srcsets.some((srcset) => srcset?.includes('data:image') || srcset?.includes('127.0.0.1'))).toBe(false);
    expect(result.persisted).toContain('![safe](https://example.com/safe.png)');
    expect(result.persisted).toContain('![javascript](javascript:alert');
    expect(result.persisted).toContain('![file](file:///etc/passwd)');
    expect(result.persisted).toContain('![localhost](http://127.0.0.1:3000/secret.png)');
  });

  it('sanitizes unsafe link marks before rendering DOM anchors', async () => {
    const result = await openMarkdown('unsafe link');
    const { state, dispatch } = result.view;
    const linkMark = state.schema.marks.link;
    const tr = state.tr
      .setSelection(TextSelection.create(state.doc, 1, state.doc.content.size - 1))
      .addMark(1, state.doc.content.size - 1, linkMark.create({ href: 'javascript:alert(1)' }));

    dispatch(tr);

    expect(result.dom.querySelector('a')).toBeNull();
    expect(result.dom.textContent).toContain('unsafe link');
    expect(result.dom.innerHTML).not.toContain('javascript:');
  });

  it('keeps nested raw html source while suppressing parser-promoted descendants', async () => {
    const markdown = [
      '<svg><svg><img src="https://example.com/hidden.png"></svg>',
      '<img src="https://example.com/leaked.png"></svg>',
      '<img src="https://example.com/real.png">',
    ].join('\n\n');
    const result = await openMarkdown(markdown);

    const srcs = Array.from(result.dom.querySelectorAll('img, .image-block-container'))
      .map((image) => image.getAttribute('src'))
      .filter((src): src is string => Boolean(src));
    expect(srcs).toEqual(['https://example.com/real.png']);
    expect(result.dom.innerHTML).not.toContain('hidden.png');
    expect(result.dom.innerHTML).not.toContain('leaked.png');
    expect(result.persisted).toBe(markdown);
  });

  it('does not promote markdown or custom inline syntax inside dropped raw html', async () => {
    const markdown = [
      '<svg>',
      '# Hidden heading',
      '![hidden](https://example.com/hidden-markdown.png)',
      '<mark>Hidden mark</mark>',
      '</svg>',
      '# Visible heading',
    ].join('\n\n');
    const result = await openMarkdown(markdown);

    expect(result.dom.textContent).not.toContain('Hidden heading');
    expect(result.dom.textContent).not.toContain('Hidden mark');
    expect(result.dom.querySelector('[src="https://example.com/hidden-markdown.png"]')).toBeNull();
    expect(result.dom.textContent).toContain('Visible heading');
    expect(result.persisted).toBe(markdown);
  });

  it('sanitizes raw html values across the full notes editor plugin stack', async () => {
    const result = await openMarkdown([
      '<script>alert("inline-script")</script>',
      '<svg><img src="https://example.com/svg-leak.png"></svg>',
      '<math><img src="https://example.com/math-leak.png"></math>',
      '<noscript><img src="https://example.com/noscript-leak.png"></noscript>',
      '<img src="https://example.com/safe.png" onerror="alert(1)" data-secret="token">',
      '<a href="javascript:alert(1)" onclick="alert(2)">bad link</a>',
      '<a href="https://example.com/safe">safe link</a>',
      '<iframe src="javascript:alert(1)" allow="camera *"></iframe>',
      '<iframe src="https://example.com/embed" sandbox="allow-same-origin allow-popups" allow="fullscreen; camera *; clipboard-write" srcdoc="<script>alert(1)</script>"></iframe>',
      '<video src="http://127.0.0.1/private.mp4" poster="file:///etc/passwd"></video>',
      '<audio src="https://example.com/safe.mp3" oncanplay="alert(1)"></audio>',
      '<object data="https://example.com/plugin"></object>',
      '<embed src="https://example.com/plugin">',
      '<span style="color: red; background: url(javascript:alert(1)); position: fixed" onclick="evil()">styled</span>',
      '<abbr title="javascript:alert(1)">abbr</abbr>',
      '<time datetime="data:text/html,<script>alert(1)</script>">time</time>',
      '<picture><source srcset="//127.0.0.1:3000/private.webp 1x"><img src="https://example.com/fallback.png"></picture>',
    ].join('\n\n'));

    const html = result.dom.innerHTML;
    const persisted = result.persisted;
    const unsafeNeedles = [
      '<script',
      '<object',
      '<embed',
      'inline-script',
      'svg-leak',
      'math-leak',
      'noscript-leak',
      'javascript:',
      'onclick',
      'onerror',
      'oncanplay',
      'data-secret',
      'srcdoc',
      'file:///etc/passwd',
      '127.0.0.1',
      'camera',
      'position: fixed',
      'url(',
    ];

    for (const needle of unsafeNeedles) expect(html).not.toContain(needle);
    for (const needle of unsafeNeedles) expect(persisted).toContain(needle);

    expect(result.dom.querySelector('.image-block-container[src="https://example.com/safe.png"]')).toBeInstanceOf(HTMLElement);
    expect(result.dom.querySelector('a[href="https://example.com/safe"]')?.textContent).toBe('safe link');

    const safeIframe = result.dom.querySelector('iframe[src="https://example.com/embed"]');
    expect(safeIframe).toBeInstanceOf(HTMLIFrameElement);
    expect(safeIframe?.getAttribute('sandbox')).toBe('allow-scripts allow-popups');
    expect(safeIframe?.getAttribute('allow')).toBe('fullscreen; clipboard-write');
    expect(safeIframe?.getAttribute('referrerpolicy')).toBe('no-referrer');

    expect(result.dom.querySelector('audio[src="https://example.com/safe.mp3"]')).toBeInstanceOf(HTMLAudioElement);
    expect(result.dom.querySelector('span[style="color: red"]')?.textContent).toBe('styled');
    expect(result.dom.querySelector('abbr')?.hasAttribute('title')).toBe(false);
    expect(result.dom.querySelector('time')?.hasAttribute('datetime')).toBe(false);
    expect(result.dom.querySelector('source')?.hasAttribute('srcset')).toBe(false);

    const rawHtmlValues = Array.from(result.dom.querySelectorAll<HTMLElement>('[data-type="html"], [data-type="html-block"]'))
      .map((element) => element.dataset.value ?? '');
    for (const value of rawHtmlValues) {
      for (const needle of unsafeNeedles) {
        expect(value).not.toContain(needle);
      }
    }
  });

  it('does not treat non-rendering raw html prefixes as a sanitizer bypass', async () => {
    const result = await openMarkdown([
      '<!-- harmless --><script>alert("comment-prefix")</script>',
      '<!doctype html><img src="javascript:alert(1)" alt="doctype-prefix">',
      '<?xml version="1.0"?><iframe src="http://127.0.0.1:3000/admin"></iframe>',
      '<![CDATA[x]]><svg><img src="https://example.com/cdata-leak.png"></svg>',
      '<!--before--><img src="javascript:alert(1)" alt="comment-sandwich"><!--after-->',
      '<?before?><iframe src="javascript:alert(1)"></iframe><?after?>',
      '<![CDATA[before]]><svg><img src="https://example.com/cdata-sandwich.png"></svg><![CDATA[after]]>',
    ].join('\n\n'));

    for (const needle of [
      '<script',
      'comment-prefix',
      'javascript:',
      '127.0.0.1',
      '<iframe',
      '<svg',
      'cdata-leak',
      'cdata-sandwich',
    ]) {
      expect(result.dom.innerHTML).not.toContain(needle);
      expect(result.persisted).toContain(needle);
    }
  });
});
