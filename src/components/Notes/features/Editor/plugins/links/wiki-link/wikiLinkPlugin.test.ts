import { describe, expect, it } from 'vitest';
import {
  Editor,
  defaultValueCtx,
  editorViewCtx,
  remarkStringifyOptionsCtx,
  serializerCtx,
} from '@milkdown/kit/core';
import { commonmark } from '@milkdown/kit/preset/commonmark';
import { history, redo, undo } from '@milkdown/kit/prose/history';
import { TextSelection } from '@milkdown/kit/prose/state';
import { $prose } from '@milkdown/kit/utils';
import { wikiLinkPlugin, wikiLinkExpansionPluginKey } from './wikiLinkPlugin';
import { WIKI_LINK_POINTER_SELECTION_META } from './wikiLinkInteraction';
import { resolveWikiLinkNotePath } from './wikiLinkResolver';
import type { FileTreeNode } from '@/stores/notes/types';

const historyPlugin = $prose(() => history());

async function createEditor(markdown: string) {
  const editor = Editor.make()
    .config((ctx) => {
      ctx.set(defaultValueCtx, markdown);
      ctx.update(remarkStringifyOptionsCtx, (options) => ({
        ...options,
        bullet: '-',
      }));
    })
    .use(commonmark)
    .use(historyPlugin)
    .use(wikiLinkPlugin);
  await editor.create();
  return editor;
}

describe('wikiLinkPlugin', () => {
  it('parses editable wiki links and preserves their markdown syntax', async () => {
    const editor = await createEditor('See [[Project Alpha]] and [[Project Beta|the beta note]].');
    const view = editor.ctx.get(editorViewCtx);
    const links = Array.from(view.dom.querySelectorAll<HTMLElement>('[data-wiki-link-target]'));

    expect(links.map((link) => [link.dataset.wikiLinkTarget, link.textContent])).toEqual([
      ['Project Alpha', 'Project Alpha'],
      ['Project Beta', 'the beta note'],
    ]);
    expect(links.every((link) => link.getAttribute('contenteditable') !== 'false')).toBe(true);
    expect(editor.ctx.get(serializerCtx)(view.state.doc).trimEnd()).toBe(
      'See [[Project Alpha]] and [[Project Beta|the beta note]].',
    );

    await editor.destroy();
  });

  it('leaves escaped wiki-link syntax as plain text', async () => {
    const editor = await createEditor(String.raw`Keep \[[Project Alpha]] literal.`);
    const view = editor.ctx.get(editorViewCtx);

    expect(view.dom.querySelector('[data-wiki-link-target]')).toBeNull();
    expect(view.dom.textContent).toContain('Keep [[Project Alpha]] literal.');

    await editor.destroy();
  });

  it('expands the active wiki link into editable markdown syntax', async () => {
    const editor = await createEditor('See [[Project Beta|the beta note]].');
    const view = editor.ctx.get(editorViewCtx);
    let linkStartPosition: number | null = null;
    let linkTextPosition: number | null = null;

    view.state.doc.nodesBetween(0, view.state.doc.content.size, (node, pos) => {
      if (linkTextPosition !== null || !node.isText) return;
      if (node.marks.some((mark) => mark.type.name === 'wiki_link')) {
        linkStartPosition = pos;
        linkTextPosition = pos + 1;
      }
    });

    expect(linkStartPosition).not.toBeNull();
    expect(linkTextPosition).not.toBeNull();
    view.dispatch(
      view.state.tr
        .setSelection(TextSelection.create(view.state.doc, linkTextPosition!))
        .setMeta(WIKI_LINK_POINTER_SELECTION_META, true),
    );
    expect(view.dom.querySelector('.wiki-link-expanded')).toBeNull();

    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, linkTextPosition!)));

    const expandedLink = view.dom.querySelector<HTMLElement>('.wiki-link-expanded');
    const source = '[[Project Beta|the beta note]]';
    const expandedRange = wikiLinkExpansionPluginKey.getState(view.state)?.expanded;
    expect(expandedLink).toHaveAttribute('data-wiki-link-expanded', 'true');
    expect(expandedLink).toHaveAttribute('data-wiki-link-target', 'Project Beta');
    expect(expandedLink?.textContent).toBe(source);
    expect(expandedRange).toEqual({
      from: linkStartPosition,
      to: linkStartPosition! + source.length,
    });
    expect(wikiLinkExpansionPluginKey.getState(view.state)?.decorations.find()).toHaveLength(1);
    expect(view.state.selection.from).toBe(linkStartPosition! + '[[Project Beta|'.length + 1);
    expect(editor.ctx.get(serializerCtx)(view.state.doc).trimEnd()).toBe(
      'See [[Project Beta|the beta note]].',
    );

    const betweenClosingBrackets = expandedRange!.to - 1;
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, betweenClosingBrackets)));
    expect(view.state.selection.from).toBe(betweenClosingBrackets);
    expect(view.dom.querySelector('.wiki-link-expanded')?.textContent).toBe(source);

    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, expandedRange!.to)));
    expect(view.state.selection.from).toBe(expandedRange!.to);
    expect(view.dom.querySelector('.wiki-link-expanded')?.textContent).toBe(source);

    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, expandedRange!.from)));
    view.dom.dispatchEvent(new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'ArrowRight',
    }));
    expect(view.state.selection.from).toBe(expandedRange!.from + 1);

    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, expandedRange!.to)));
    view.dom.dispatchEvent(new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'ArrowLeft',
    }));
    expect(view.state.selection.from).toBe(expandedRange!.to - 1);

    const aliasFrom = linkStartPosition! + '[[Project Beta|'.length;
    const aliasTo = aliasFrom + 'the beta note'.length;
    view.dispatch(view.state.tr.insertText('renamed', aliasFrom, aliasTo));
    expect(view.dom.querySelector('.wiki-link-expanded')?.textContent).toBe(
      '[[Project Beta|renamed]]',
    );
    expect(editor.ctx.get(serializerCtx)(view.state.doc).trimEnd()).toBe(
      'See [[Project Beta|renamed]].',
    );

    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1)));
    expect(view.dom.querySelector('.wiki-link-expanded')).toBeNull();
    expect(view.dom.querySelector('[data-wiki-link-target="Project Beta"]')?.textContent).toBe('renamed');
    expect(editor.ctx.get(serializerCtx)(view.state.doc).trimEnd()).toBe(
      'See [[Project Beta|renamed]].',
    );

    await editor.destroy();
  });

  it('keeps invalid edited wiki-link source as ordinary text when the cursor leaves', async () => {
    const editor = await createEditor('See [[Project Beta|the beta note]].');
    const view = editor.ctx.get(editorViewCtx);
    let linkPosition: number | null = null;

    view.state.doc.nodesBetween(0, view.state.doc.content.size, (node, pos) => {
      if (linkPosition === null && node.isText && node.marks.some((mark) => mark.type.name === 'wiki_link')) {
        linkPosition = pos + 1;
      }
    });

    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, linkPosition!)));
    const expanded = wikiLinkExpansionPluginKey.getState(view.state)?.expanded;
    expect(expanded).not.toBeNull();

    view.dispatch(view.state.tr.delete(expanded!.to - 1, expanded!.to));
    expect(view.dom.querySelector('.wiki-link-expanded')?.textContent).toBe(
      '[[Project Beta|the beta note]',
    );

    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1)));
    expect(view.dom.querySelector('.wiki-link-expanded')).toBeNull();
    expect(view.dom.querySelector('[data-wiki-link-target]')).toBeNull();
    expect(view.dom.textContent).toContain('[[Project Beta|the beta note]');

    await editor.destroy();
  });

  it('updates the wiki-link target after editing valid expanded source', async () => {
    const editor = await createEditor('See [[Project Beta|the beta note]].');
    const view = editor.ctx.get(editorViewCtx);
    let linkPosition: number | null = null;

    view.state.doc.nodesBetween(0, view.state.doc.content.size, (node, pos) => {
      if (linkPosition === null && node.isText && node.marks.some((mark) => mark.type.name === 'wiki_link')) {
        linkPosition = pos;
      }
    });

    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, linkPosition! + 1)));
    const expanded = wikiLinkExpansionPluginKey.getState(view.state)?.expanded;
    const targetFrom = expanded!.from + 2;
    const targetTo = targetFrom + 'Project Beta'.length;
    view.dispatch(view.state.tr.insertText('Project Gamma', targetFrom, targetTo));
    expect(view.dom.querySelector('.wiki-link-expanded')).toHaveAttribute(
      'data-wiki-link-target',
      'Project Gamma',
    );

    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1)));
    const collapsedLink = view.dom.querySelector<HTMLElement>('[data-wiki-link-target]');
    expect(collapsedLink).toHaveAttribute('data-wiki-link-target', 'Project Gamma');
    expect(collapsedLink?.textContent).toBe('the beta note');
    expect(editor.ctx.get(serializerCtx)(view.state.doc).trimEnd()).toBe(
      'See [[Project Gamma|the beta note]].',
    );

    await editor.destroy();
  });

  it('keeps wiki-link source expanded across undo and redo', async () => {
    const editor = await createEditor('See [[Project Beta|the beta note]].');
    const view = editor.ctx.get(editorViewCtx);
    let linkPosition: number | null = null;

    view.state.doc.nodesBetween(0, view.state.doc.content.size, (node, pos) => {
      if (linkPosition === null && node.isText && node.marks.some((mark) => mark.type.name === 'wiki_link')) {
        linkPosition = pos;
      }
    });

    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, linkPosition! + 1)));
    const expanded = wikiLinkExpansionPluginKey.getState(view.state)?.expanded;
    const targetFrom = expanded!.from + 2;
    const targetTo = targetFrom + 'Project Beta'.length;
    view.dispatch(
      view.state.tr
        .setSelection(TextSelection.create(view.state.doc, targetFrom, targetTo))
        .insertText('Project Gamma'),
    );
    expect(view.dom.querySelector('.wiki-link-expanded')?.textContent).toBe(
      '[[Project Gamma|the beta note]]',
    );

    expect(undo(view.state, view.dispatch)).toBe(true);
    expect(view.dom.querySelector('.wiki-link-expanded')?.textContent).toBe(
      '[[Project Beta|the beta note]]',
    );

    expect(redo(view.state, view.dispatch)).toBe(true);
    expect(view.dom.querySelector('.wiki-link-expanded')?.textContent).toBe(
      '[[Project Gamma|the beta note]]',
    );

    await editor.destroy();
  });

  it('prefers the link under the cursor at an adjacent-link boundary', async () => {
    const editor = await createEditor('[[First]][[Second]].');
    const view = editor.ctx.get(editorViewCtx);
    const ranges: Array<{ from: number; to: number }> = [];

    view.state.doc.nodesBetween(0, view.state.doc.content.size, (node, pos) => {
      if (!node.isText || !node.marks.some((mark) => mark.type.name === 'wiki_link')) return;
      ranges.push({ from: pos, to: pos + node.nodeSize });
    });

    expect(ranges).toHaveLength(2);
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, ranges[0]!.to)));

    const expandedLink = view.dom.querySelector<HTMLElement>('.wiki-link-expanded');
    expect(expandedLink).toHaveAttribute('data-wiki-link-target', 'Second');
    expect(expandedLink?.textContent).toBe('[[Second]]');

    await editor.destroy();
  });
});

describe('resolveWikiLinkNotePath', () => {
  const nodes: FileTreeNode[] = [
    {
      id: 'root-project',
      name: 'Project.md',
      path: 'Project.md',
      isFolder: false,
    },
    {
      id: 'docs',
      name: 'docs',
      path: 'docs',
      isFolder: true,
      expanded: true,
      children: [{
        id: 'docs-project',
        name: 'Project.md',
        path: 'docs/Project.md',
        isFolder: false,
      }],
    },
  ];

  it('matches titles case-insensitively and prefers the current directory', () => {
    expect(resolveWikiLinkNotePath('project', nodes, 'docs/current.md')).toBe('docs/Project.md');
    expect(resolveWikiLinkNotePath('PROJECT', nodes, 'other/current.md')).toBe('Project.md');
  });

  it('returns null for missing titles', () => {
    expect(resolveWikiLinkNotePath('Missing', nodes, 'docs/current.md')).toBeNull();
  });
});
