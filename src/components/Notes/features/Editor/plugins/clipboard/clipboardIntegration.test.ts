import { afterEach, describe, expect, it } from 'vitest';
import { Editor, defaultValueCtx, editorViewCtx, serializerCtx } from '@milkdown/kit/core';
import { commonmark } from '@milkdown/kit/preset/commonmark';
import { gfm } from '@milkdown/kit/preset/gfm';
import type { EditorView } from '@milkdown/kit/prose/view';

import { clipboardPlugin } from './clipboardPlugin';

type ClipboardEditor = ReturnType<typeof Editor.make>;

const editors: ClipboardEditor[] = [];

afterEach(async () => {
  while (editors.length > 0) {
    const editor = editors.pop();
    await editor?.destroy();
  }
  document.body.innerHTML = '';
});

async function createClipboardEditor(initialMarkdown = ''): Promise<ClipboardEditor> {
  const host = document.createElement('div');
  document.body.appendChild(host);

  const editor = Editor.make()
    .config((ctx) => {
      ctx.set(defaultValueCtx, initialMarkdown);
    })
    .use(commonmark)
    .use(gfm)
    .use(clipboardPlugin);

  await editor.create();
  editors.push(editor);
  return editor;
}

function transformPastedHtml(view: EditorView, html: string): string {
  let transformed = html;

  view.someProp('transformPastedHTML', (handler: (value: string, view: EditorView) => string) => {
    transformed = handler(transformed, view);
    return true;
  });

  return transformed;
}

function dispatchClipboardPaste(view: EditorView, text: string, html: string): Event {
  const event = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', {
    value: {
      files: [],
      items: [],
      types: ['text/plain', 'text/html'],
      getData(type: string) {
        if (type === 'text/plain') return text;
        if (type === 'text/html') return html;
        return '';
      },
    },
  });
  view.dom.dispatchEvent(event);
  return event;
}

describe('clipboard integration', () => {
  it('registers transformPastedHTML on the editor view and strips executable html', async () => {
    const editor = await createClipboardEditor();
    const view = editor.ctx.get(editorViewCtx) as EditorView;

    const result = transformPastedHtml(
      view,
      '<p onclick="evil()">safe</p><script>alert(1)</script><img src="https://example.com/a.png" onerror="alert(1)">',
    );

    expect(result).toBe('<p>safe</p><img src="https://example.com/a.png">');
  });

  it('hardens realistic web clipboard fragments before the editor parses them', async () => {
    const editor = await createClipboardEditor();
    const view = editor.ctx.get(editorViewCtx) as EditorView;

    const result = transformPastedHtml(
      view,
      `
        <div class="article" data-block="1">
          <h2 id="headline">Title</h2>
          <p style="color:red">copy <a href="https://example.com/post" target="_blank" data-track="1">link</a></p>
          <iframe src="https://example.com/embed" sandbox="allow-same-origin allow-top-navigation"></iframe>
        </div>
      `,
    );

    expect(result).toContain('<h2>Title</h2>');
    expect(result).toContain('<p>copy <a href="https://example.com/post">link</a></p>');
    expect(result).toContain('<iframe src="https://example.com/embed" sandbox="allow-scripts" referrerpolicy="no-referrer"></iframe>');
    expect(result).not.toContain('class=');
    expect(result).not.toContain('data-');
    expect(result).not.toContain('id=');
    expect(result).not.toContain('allow-top-navigation');
  });

  it('drops external clipboard text colors that can become unreadable in the note theme', async () => {
    const editor = await createClipboardEditor();
    const view = editor.ctx.get(editorViewCtx) as EditorView;
    const text = 'Annual plan for \uFFE5139 (less than \uFFE511.6/month)';
    const html = `<span style="color: rgb(255, 255, 255)">${text}</span>`;

    expect(transformPastedHtml(view, html)).toBe(`<span>${text}</span>`);

    const event = dispatchClipboardPaste(view, text, html);
    expect(event.defaultPrevented).toBe(true);
    expect(view.state.doc.textContent).toBe(text);
    expect(editor.ctx.get(serializerCtx)(view.state.doc).trim()).toBe(text);
  });

  it('keeps semantic formatting while dropping external presentation styles', async () => {
    const editor = await createClipboardEditor();
    const view = editor.ctx.get(editorViewCtx) as EditorView;

    const result = transformPastedHtml(
      view,
      [
        '<p align="center" style="color:white; background:black; font-size:42px;',
        'opacity:0.4; text-align:center; font-weight:700; font-style:italic;',
        'text-decoration:underline">Formatted text</p>',
      ].join(''),
    );

    expect(result).toBe(
      '<p style="font-weight: 700; font-style: italic; text-decoration: underline">Formatted text</p>',
    );
  });

  it('persists semantic clipboard formatting after source presentation styles are removed', async () => {
    const editor = await createClipboardEditor();
    const view = editor.ctx.get(editorViewCtx) as EditorView;
    const text = 'Bold italic deleted link';
    const html = [
      '<p><span style="font-weight:700; color:red">Bold</span> ',
      '<span style="font-style:italic; background:black">italic</span> ',
      '<s style="color:white">deleted</s> ',
      '<a href="https://example.com" style="color:blue">link</a></p>',
    ].join('');

    const event = dispatchClipboardPaste(view, text, html);

    expect(event.defaultPrevented).toBe(true);
    expect(editor.ctx.get(serializerCtx)(view.state.doc).trim()).toBe(
      '**Bold** *italic* ~~deleted~~ [link](https://example.com)',
    );
  });

  it('keeps text decoration semantics without source decoration appearance', async () => {
    const editor = await createClipboardEditor();
    const view = editor.ctx.get(editorViewCtx) as EditorView;

    const result = transformPastedHtml(
      view,
      '<span style="text-decoration: underline wavy red 3px">Underlined</span>',
    );

    expect(result).toBe('<span style="text-decoration: underline">Underlined</span>');
  });

  it('does not reveal hidden clipboard content when presentation styles are removed', async () => {
    const editor = await createClipboardEditor();
    const view = editor.ctx.get(editorViewCtx) as EditorView;

    const result = transformPastedHtml(
      view,
      [
        '<p>Visible ',
        '<span hidden>hidden attribute</span>',
        '<span style="display:none">display hidden</span>',
        '<span style="visibility:hidden">visibility hidden</span>',
        '<span style="opacity:0">transparent hidden</span>',
        '<span style="opacity:0%">percentage hidden</span>',
        'text</p>',
      ].join(''),
    );

    expect(result).toBe('<p>Visible text</p>');
  });

  it.each([
    {
      source: 'Google Docs',
      html: [
        '<p style="margin:0; color:rgb(32, 33, 36); background-color:white">',
        '<span style="font-weight:700; font-size:11pt">Docs bold</span></p>',
      ].join(''),
      expected: '<p><span style="font-weight: 700">Docs bold</span></p>',
    },
    {
      source: 'Word',
      html: [
        '<p class="MsoNormal" align="center" style="margin:0; text-align:center">',
        '<b style="font-weight:normal">Office normal</b> <strong>Office bold</strong></p>',
      ].join(''),
      expected: '<p><b style="font-weight: normal">Office normal</b> <strong>Office bold</strong></p>',
    },
    {
      source: 'Notion',
      html: [
        '<ul style="color:white; background:black"><li>',
        '<span style="color:white">Item</span> ',
        '<a href="https://example.com/page" style="color:blue">Link</a>',
        '</li></ul>',
      ].join(''),
      expected: '<ul><li><span>Item</span> <a href="https://example.com/page">Link</a></li></ul>',
    },
  ])('normalizes common $source clipboard HTML', async ({ html, expected }) => {
    const editor = await createClipboardEditor();
    const view = editor.ctx.get(editorViewCtx) as EditorView;

    expect(transformPastedHtml(view, html)).toBe(expected);
  });

  it('preserves table cell alignment without keeping table theme colors', async () => {
    const editor = await createClipboardEditor();
    const view = editor.ctx.get(editorViewCtx) as EditorView;

    const result = transformPastedHtml(
      view,
      [
        '<table><thead><tr>',
        '<th style="color:white; background:black; text-align:center">Name</th>',
        '<th align="right">Score</th>',
        '</tr></thead></table>',
      ].join(''),
    );

    expect(result).toBe(
      '<table><thead><tr><th style="text-align: center">Name</th><th style="text-align: right">Score</th></tr></thead></table>',
    );
  });

  it('unwraps navigation links from image-only clipboard HTML', async () => {
    const editor = await createClipboardEditor();
    const view = editor.ctx.get(editorViewCtx) as EditorView;

    const result = transformPastedHtml(
      view,
      '<a href="https://example.test/page"><img src="https://images.example.test/copied.png" alt="Copied"></a>',
    );

    expect(result).toBe('<img src="https://images.example.test/copied.png" alt="Copied">');
  });

  it('drops local iframe targets while keeping public sandboxed embeds during editor paste sanitization', async () => {
    const editor = await createClipboardEditor();
    const view = editor.ctx.get(editorViewCtx) as EditorView;

    const result = transformPastedHtml(
      view,
      [
        '<iframe src="http://127.0.0.1:3000/embed"></iframe>',
        '<iframe src="http://192.168.1.8/embed"></iframe>',
        '<iframe src="https://example.com/embed"></iframe>',
      ].join(''),
    );

    expect(result).toBe('<iframe src="https://example.com/embed" sandbox="allow-scripts" referrerpolicy="no-referrer"></iframe>');
  });
});
