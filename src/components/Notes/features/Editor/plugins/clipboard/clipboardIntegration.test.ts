import { afterEach, describe, expect, it } from 'vitest';
import { Editor, defaultValueCtx, editorViewCtx } from '@milkdown/kit/core';
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
    expect(result).toContain('<p style="color: red">copy <a href="https://example.com/post">link</a></p>');
    expect(result).toContain('<iframe src="https://example.com/embed" sandbox="allow-scripts" referrerpolicy="no-referrer"></iframe>');
    expect(result).not.toContain('class=');
    expect(result).not.toContain('data-');
    expect(result).not.toContain('id=');
    expect(result).not.toContain('allow-top-navigation');
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
