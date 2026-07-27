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

function createEditor() {
  return Editor.make()
    .config((ctx) => ctx.set(defaultValueCtx, ''))
    .use(commonmark)
    .use(gfm)
    .use(configureTheme)
    .use(obsidianImageEmbedPlugin)
    .use(obsidianImageEmbedInputPlugin);
}

describe('Obsidian image embed input', () => {
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
      'Before ![Local image](attachments/demo.png) after',
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
