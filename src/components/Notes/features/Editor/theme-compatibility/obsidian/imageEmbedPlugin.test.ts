import { describe, expect, it } from 'vitest';
import {
  Editor,
  defaultValueCtx,
  editorViewCtx,
  serializerCtx,
} from '@milkdown/kit/core';
import { commonmark } from '@milkdown/kit/preset/commonmark';
import { gfm } from '@milkdown/kit/preset/gfm';
import type { EditorView } from '@milkdown/kit/prose/view';
import { configureTheme } from '../../theme';
import {
  obsidianImageEmbedInputPlugin,
  obsidianImageEmbedPlugin,
} from './imageEmbedPlugin';
import { remarkObsidianImageEmbeds } from '@/components/common/markdown/theme-compatibility/obsidian/imageEmbed';

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

function createEditor(markdown = '') {
  return Editor.make()
    .config((ctx) => ctx.set(defaultValueCtx, markdown))
    .use(commonmark)
    .use(gfm)
    .use(configureTheme)
    .use(obsidianImageEmbedPlugin)
    .use(obsidianImageEmbedInputPlugin);
}

describe('Obsidian image embed input', () => {
  it('opens the bare Obsidian image syntax as an image node', async () => {
    const editor = createEditor('![[1.png]]');
    await editor.create();

    expect(editor.ctx.get(editorViewCtx).state.doc.firstChild?.firstChild?.attrs).toMatchObject({
      src: '1.png',
      persistedSrc: '1.png',
      obsidianEmbed: { src: '1.png', alias: '' },
    });
    expect(editor.ctx.get(serializerCtx)(editor.ctx.get(editorViewCtx).state.doc).trim()).toBe('![[1.png]]');

    await editor.destroy();
  });

  it('preserves aliases and size aliases across editor round trips', async () => {
    const aliasEditor = createEditor('![[attachments/demo.png|Local image]]');
    await aliasEditor.create();
    const aliasView = aliasEditor.ctx.get(editorViewCtx);
    expect(aliasEditor.ctx.get(serializerCtx)(aliasView.state.doc).trim()).toBe(
      '![[attachments/demo.png|Local image]]',
    );
    await aliasEditor.destroy();

    const sizeEditor = createEditor('![[attachments/demo.png|300x200]]');
    await sizeEditor.create();
    const sizeView = sizeEditor.ctx.get(editorViewCtx);
    expect(sizeView.state.doc.firstChild?.firstChild?.attrs).toMatchObject({
      alt: '',
      width: '300px',
      obsidianEmbed: { size: '300x200', height: 200 },
    });
    expect(sizeEditor.ctx.get(serializerCtx)(sizeView.state.doc).trim()).toBe(
      '![[attachments/demo.png|300x200]]',
    );
    await sizeEditor.destroy();
  });

  it('keeps standard Markdown image destinations and titles unchanged', async () => {
    const editor = createEditor('![Image](image.png "Title")');
    await editor.create();

    expect(editor.ctx.get(serializerCtx)(editor.ctx.get(editorViewCtx).state.doc).trim()).toBe(
      '![Image](image.png "Title")',
    );

    await editor.destroy();
  });

  it('updates an Obsidian alias without changing the embed syntax', async () => {
    const editor = createEditor('![[demo.png|Old caption]]');
    await editor.create();
    const view = editor.ctx.get(editorViewCtx);
    const image = view.state.doc.firstChild?.firstChild;
    view.dispatch(view.state.tr.setNodeMarkup(1, undefined, {
      ...image?.attrs,
      alt: 'New caption',
    }));

    expect(editor.ctx.get(serializerCtx)(view.state.doc).trim()).toBe('![[demo.png|New caption]]');
    await editor.destroy();
  });

  it('supports Obsidian ico image embeds', async () => {
    const editor = createEditor('![[favicon.ico]]');
    await editor.create();

    expect(editor.ctx.get(editorViewCtx).state.doc.firstChild?.firstChild?.attrs.src).toBe('favicon.ico');
    expect(editor.ctx.get(serializerCtx)(editor.ctx.get(editorViewCtx).state.doc).trim()).toBe(
      '![[favicon.ico]]',
    );
    await editor.destroy();
  });

  it('escapes the Obsidian alias separator inside tables', async () => {
    const editor = createEditor('| Image |\n| --- |\n| ![[demo.png\\|300]] |');
    await editor.create();
    const view = editor.ctx.get(editorViewCtx);

    expect(view.state.doc.firstChild?.type.name).toBe('table');
    expect(editor.ctx.get(serializerCtx)(view.state.doc)).toContain('![[demo.png\\|300]]');
    await editor.destroy();
  });

  it('does not transform image-like syntax inside code nodes', () => {
    const tree = {
      type: 'root',
      children: [{ type: 'code', value: 'literal ![[attachments/demo.png]]' }],
    };

    remarkObsidianImageEmbeds()(tree);

    expect(tree.children).toEqual([
      { type: 'code', value: 'literal ![[attachments/demo.png]]' },
    ]);
  });

  it('keeps escaped image embeds as source text while transforming later embeds', () => {
    const raw = String.raw`\![[literal.png]] ![[real.png]]`;
    const tree = {
      type: 'root',
      children: [{
        type: 'paragraph',
        children: [{
          type: 'text',
          value: '![[literal.png]] ![[real.png]]',
          position: { start: { offset: 0 }, end: { offset: raw.length } },
        }],
      }],
    };

    remarkObsidianImageEmbeds()(tree, { value: raw });

    expect(tree.children[0]?.children).toMatchObject([
      { type: 'text', value: '![[literal.png]] ' },
      { type: 'image', url: 'real.png' },
    ]);
  });

  it('creates an editable image from typed embed syntax', async () => {
    const editor = createEditor();
    await editor.create();

    const view = editor.ctx.get(editorViewCtx);
    typeText(view, 'Before ![[attachments/demo.png|Local image]] after');

    const image = view.state.doc.firstChild?.child(1);
    expect(image?.type.name).toBe('image');
    expect(image?.attrs).toMatchObject({
      src: 'attachments/demo.png',
      alt: 'Local image',
      persistedSrc: 'attachments/demo.png',
    });
    expect(editor.ctx.get(serializerCtx)(view.state.doc).trim()).toBe(
      'Before ![[attachments/demo.png|Local image]] after',
    );

    await editor.destroy();
  });

  it('keeps invalid or non-image embeds as source text', async () => {
    const editor = createEditor();
    await editor.create();

    const view = editor.ctx.get(editorViewCtx);
    typeText(view, '![[notes/demo.md]] ![[http://127.0.0.1/private.png]]');

    expect(view.state.doc.firstChild?.textContent).toBe(
      '![[notes/demo.md]] ![[http://127.0.0.1/private.png]]',
    );
    expect(view.state.doc.firstChild?.childCount).toBe(1);

    await editor.destroy();
  });
});
