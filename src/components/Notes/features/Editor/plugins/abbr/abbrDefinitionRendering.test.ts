import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  defaultValueCtx,
  Editor,
  editorViewCtx,
  serializerCtx,
} from '@milkdown/kit/core';
import { TextSelection } from '@milkdown/kit/prose/state';
import { commonmark } from '@milkdown/kit/preset/commonmark';
import { gfm } from '@milkdown/kit/preset/gfm';
import { configureTheme } from '../../theme';
import { highlightPlugin } from '../highlight/highlightPlugin';
import { markdownSyntaxPlugin } from '../markdown-syntax';
import { abbrPlugin } from './abbrPlugin';

const markdown = [
  '*[HTML]: HyperText Markup Language',
  '',
  '*[API]: Application Programming Interface',
  '',
  '*[C++]: C Plus Plus',
  '',
  'Plain paragraph',
].join('\n');

async function createEditor(value: string) {
  const editor = Editor.make()
    .config((ctx) => {
      ctx.set(defaultValueCtx, value);
    })
    .use(commonmark)
    .use(gfm)
    .use(configureTheme)
    .use(highlightPlugin)
    .use(abbrPlugin)
    .use(markdownSyntaxPlugin);
  await editor.create();
  return editor;
}

describe('abbreviation definition rendering', () => {
  it('renders definition rows while preserving selectable Markdown source', async () => {
    const editor = await createEditor(markdown);
    const view = editor.ctx.get(editorViewCtx);

    expect([...view.dom.querySelectorAll('.abbr-definition-term')].map((node) => node.textContent)).toEqual([
      'HTML',
      'API',
      'C++',
    ]);
    expect([...view.dom.querySelectorAll('.abbr-definition-syntax')].map((node) => node.textContent)).toEqual([
      '*[',
      ']',
      '*[',
      ']',
      '*[',
      ']',
    ]);
    expect(view.dom.querySelectorAll('.abbr-definition-line')).toHaveLength(3);
    expect(editor.ctx.get(serializerCtx)(view.state.doc).trim()).toBe(markdown);

    const definitionBlocks: Array<{ from: number; to: number }> = [];
    view.state.doc.descendants((node, pos) => {
      if (node.type.name === 'paragraph' && node.textContent.startsWith('*[')) {
        definitionBlocks.push({ from: pos + 1, to: pos + node.nodeSize - 1 });
      }
      return true;
    });

    view.dispatch(view.state.tr.setSelection(TextSelection.create(
      view.state.doc,
      definitionBlocks[0]!.from,
      definitionBlocks.at(-1)!.to,
    )));

    expect(view.dom.querySelectorAll('.abbr-definition-line.markdown-source-expanded')).toHaveLength(3);

    await editor.destroy();
  });

  it('leaves escaped definition syntax unstyled', async () => {
    const editor = await createEditor('\\*[HTML]: HyperText Markup Language');
    const view = editor.ctx.get(editorViewCtx);

    expect(view.dom.querySelector('.abbr-definition-line')).toBeNull();

    await editor.destroy();
  });

  it('uses the requested centralized colors', () => {
    const theme = readFileSync(resolve(process.cwd(), 'src/styles/theme.css'), 'utf8');
    const styles = readFileSync(resolve(
      process.cwd(),
      'src/components/Notes/features/Editor/styles/markdown.css',
    ), 'utf8');

    expect(theme).toContain('--vlaina-markdown-color-abbr-definition-term: #54aeff;');
    expect(theme).toContain('--vlaina-markdown-color-abbr-definition-text: #f77daa;');
    expect(styles).toContain('color: var(--vlaina-markdown-color-abbr-definition-term);');
    expect(styles).toContain('color: var(--vlaina-markdown-color-abbr-definition-text);');
  });
});
