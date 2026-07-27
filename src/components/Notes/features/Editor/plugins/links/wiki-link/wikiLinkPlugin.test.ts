import { describe, expect, it } from 'vitest';
import {
  Editor,
  defaultValueCtx,
  editorViewCtx,
  remarkStringifyOptionsCtx,
  serializerCtx,
} from '@milkdown/kit/core';
import { commonmark } from '@milkdown/kit/preset/commonmark';
import { gfm } from '@milkdown/kit/preset/gfm';
import { history, redo, undo } from '@milkdown/kit/prose/history';
import { TextSelection } from '@milkdown/kit/prose/state';
import { $prose } from '@milkdown/kit/utils';
import { wikiLinkPlugin, wikiLinkExpansionPluginKey } from './wikiLinkPlugin';
import {
  WIKI_LINK_POINTER_SELECTION_META,
  wikiLinkPointerSessionPluginKey,
} from './wikiLinkInteraction';
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
    .use(gfm)
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

  it('escapes alias separators when serializing wiki links in GFM table cells', async () => {
    const markdown = [
      '| Context | Link |',
      '| --- | --- |',
      '| Table | [[Table Target\\|table \\| alias]] |',
    ].join('\n');
    const editor = await createEditor(markdown);
    const view = editor.ctx.get(editorViewCtx);

    expect(view.dom.querySelector('[data-wiki-link-target="Table Target"]')?.textContent)
      .toBe('table | alias');
    let linkPosition: number | null = null;
    view.state.doc.nodesBetween(0, view.state.doc.content.size, (node, pos) => {
      if (linkPosition !== null || !node.isText) return;
      if (node.marks.some((mark) => (
        mark.type.name === 'wiki_link' && mark.attrs.target === 'Table Target'
      ))) {
        linkPosition = pos + 1;
      }
    });
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, linkPosition!)));
    const expanded = wikiLinkExpansionPluginKey.getState(view.state)?.expanded;
    const aliasFrom = expanded!.from + '[[Table Target|'.length;
    const aliasTo = aliasFrom + 'table | alias'.length;
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, aliasFrom, aliasTo)));
    let handled = false;
    view.someProp('handleTextInput', (handleTextInput: any) => {
      handled = handleTextInput(view, aliasFrom, aliasTo, 'edited | table') || handled;
      return handled;
    });
    expect(handled).toBe(true);

    const serialized = editor.ctx.get(serializerCtx)(view.state.doc).trimEnd();
    expect(serialized).toContain('[[Table Target\\|edited \\| table]]');
    await editor.destroy();

    const reopened = await createEditor(serialized);
    const reopenedView = reopened.ctx.get(editorViewCtx);
    expect(reopenedView.dom.querySelector('[data-wiki-link-target="Table Target"]')?.textContent)
      .toBe('edited | table');
    await reopened.destroy();
  });

  it('preserves surrounding inline marks while expanding, editing, and folding wiki links', async () => {
    const originalMarkdown = [
      'Outside',
      '**[[Bold Target|bold alias]]**',
      '*[[Italic Target|italic alias]]*',
      '~~[[Strike Target|strike alias]]~~',
    ].join(' ');
    const editor = await createEditor(originalMarkdown);
    const view = editor.ctx.get(editorViewCtx);
    const serializer = editor.ctx.get(serializerCtx);
    let expectedMarkdown = originalMarkdown;

    const expandTarget = (target: string) => {
      let position: number | null = null;
      view.state.doc.nodesBetween(0, view.state.doc.content.size, (node, pos) => {
        if (position !== null || !node.isText) return;
        if (node.marks.some((mark) => (
          mark.type.name === 'wiki_link' && mark.attrs.target === target
        ))) {
          position = pos + 1;
        }
      });
      expect(position).not.toBeNull();
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, position!)));
    };

    expandTarget('Bold Target');
    expect(view.dom.querySelector('.wiki-link-expanded')?.textContent)
      .toBe('[[Bold Target|bold alias]]');
    expect(serializer(view.state.doc).trimEnd()).toBe(expectedMarkdown);

    const expanded = wikiLinkExpansionPluginKey.getState(view.state)?.expanded;
    const aliasFrom = expanded!.from + '[[Bold Target|'.length;
    const aliasTo = aliasFrom + 'bold alias'.length;
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, aliasFrom, aliasTo)));
    let handled = false;
    view.someProp('handleTextInput', (handleTextInput: any) => {
      handled = handleTextInput(view, aliasFrom, aliasTo, 'edited bold') || handled;
      return handled;
    });
    expect(handled).toBe(true);
    expectedMarkdown = expectedMarkdown.replace('bold alias', 'edited bold');
    expect(serializer(view.state.doc).trimEnd()).toBe(expectedMarkdown);

    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1)));
    expect(view.dom.querySelector('.wiki-link-expanded')).toBeNull();
    expect(serializer(view.state.doc).trimEnd()).toBe(expectedMarkdown);
    expect(view.dom.querySelector('[data-wiki-link-target="Bold Target"]')?.closest('strong'))
      .not.toBeNull();

    for (const { target, source, ancestor } of [
      {
        target: 'Italic Target',
        source: '[[Italic Target|italic alias]]',
        ancestor: 'em',
      },
      {
        target: 'Strike Target',
        source: '[[Strike Target|strike alias]]',
        ancestor: 'del',
      },
    ]) {
      expandTarget(target);
      expect(view.dom.querySelector('.wiki-link-expanded')?.textContent).toBe(source);
      expect(serializer(view.state.doc).trimEnd()).toBe(expectedMarkdown);
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1)));
      expect(view.dom.querySelector('.wiki-link-expanded')).toBeNull();
      expect(view.dom.querySelector(`[data-wiki-link-target="${target}"]`)?.closest(ancestor))
        .not.toBeNull();
      expect(serializer(view.state.doc).trimEnd()).toBe(expectedMarkdown);
    }

    await editor.destroy();
  });

  it('does not parse wiki-link text inside protected markdown syntax', async () => {
    const markdown = [
      '`[[Inline Code]]`',
      '![alt [[Image Text]]](image.png)',
      '[outer [[Nested Link]]](https://example.test/docs)',
      String.raw`\[[Escaped Link]]`,
      '',
      '```md',
      '[[Fenced Code]]',
      '```',
    ].join('\n');
    const editor = await createEditor(markdown);
    const view = editor.ctx.get(editorViewCtx);
    const serializer = editor.ctx.get(serializerCtx);

    expect(view.dom.querySelector('[data-wiki-link-target]')).toBeNull();
    expect(serializer(view.state.doc).trimEnd()).toBe([
      '`[[Inline Code]]`',
      String.raw`![alt \[\[Image Text\]\]](image.png)`,
      String.raw`[outer \[\[Nested Link\]\]](https://example.test/docs)`,
      String.raw`\[\[Escaped Link]]`,
      '',
      '```md',
      '[[Fenced Code]]',
      '```',
    ].join('\n'));

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

  it('keeps expanded source open across a native pointer selection transition', async () => {
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

    view.dispatch(view.state.tr
      .setSelection(TextSelection.create(view.state.doc, 1))
      .setMeta(wikiLinkPointerSessionPluginKey, true));
    expect(wikiLinkExpansionPluginKey.getState(view.state)?.expanded).toEqual(expanded);

    view.dispatch(view.state.tr
      .setSelection(TextSelection.create(view.state.doc, expanded!.from + 1, expanded!.to - 1))
      .setMeta(wikiLinkPointerSessionPluginKey, false));
    expect(wikiLinkExpansionPluginKey.getState(view.state)?.expanded).toEqual(expanded);

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

  it('expands another wiki link after leaving a previously expanded link', async () => {
    const editor = await createEditor('[[First]] then [[Second]].');
    const view = editor.ctx.get(editorViewCtx);
    const ranges: Array<{ from: number; to: number }> = [];

    view.state.doc.nodesBetween(0, view.state.doc.content.size, (node, pos) => {
      if (!node.isText || !node.marks.some((mark) => mark.type.name === 'wiki_link')) return;
      ranges.push({ from: pos, to: pos + node.nodeSize });
    });

    expect(ranges).toHaveLength(2);
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, ranges[0]!.from + 1)));
    expect(view.dom.querySelector('.wiki-link-expanded')?.textContent).toBe('[[First]]');

    const expandedFirst = wikiLinkExpansionPluginKey.getState(view.state)?.expanded;
    expect(expandedFirst).not.toBeNull();
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, expandedFirst!.to + 1)));
    expect(view.dom.querySelector('.wiki-link-expanded')).toBeNull();

    const secondLink = Array.from(view.dom.querySelectorAll<HTMLElement>('.wiki-link'))
      .find((link) => link.dataset.wikiLinkTarget === 'Second');
    expect(secondLink).not.toBeNull();
    const secondPos = view.posAtDOM(secondLink!.firstChild!, 1);
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, secondPos)));

    expect(view.dom.querySelector('.wiki-link-expanded')?.textContent).toBe('[[Second]]');
    const firstCollapsed = Array.from(view.dom.querySelectorAll<HTMLElement>('.wiki-link'))
      .find((link) => link.dataset.wikiLinkTarget === 'First');
    expect(firstCollapsed?.textContent).toBe('First');

    await editor.destroy();
  });

  it('prefers the next link at the end boundary of a previously folded link', async () => {
    const editor = await createEditor('Before [[First]][[Second]] after.');
    const view = editor.ctx.get(editorViewCtx);
    let firstPos: number | null = null;

    view.state.doc.nodesBetween(0, view.state.doc.content.size, (node, pos) => {
      if (firstPos !== null || !node.isText) return;
      if (node.marks.some((mark) => mark.type.name === 'wiki_link' && mark.attrs.target === 'First')) {
        firstPos = pos;
      }
    });

    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, firstPos! + 1)));
    expect(view.dom.querySelector('.wiki-link-expanded')?.textContent).toBe('[[First]]');
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1)));
    const collapsedFirst = wikiLinkExpansionPluginKey.getState(view.state)?.collapsed[0];
    expect(collapsedFirst).not.toBeNull();

    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, collapsedFirst!.to)));

    expect(view.dom.querySelector('.wiki-link-expanded')).toHaveAttribute(
      'data-wiki-link-target',
      'Second',
    );

    await editor.destroy();
  });

  it('drops a folded range when bulk editing makes its source invalid', async () => {
    const editor = await createEditor('Before [[First]] after.');
    const view = editor.ctx.get(editorViewCtx);
    let firstPos: number | null = null;

    view.state.doc.nodesBetween(0, view.state.doc.content.size, (node, pos) => {
      if (firstPos === null && node.isText && node.marks.some((mark) => mark.type.name === 'wiki_link')) {
        firstPos = pos;
      }
    });
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, firstPos! + 1)));
    const expanded = wikiLinkExpansionPluginKey.getState(view.state)?.expanded;
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1)));
    const collapsed = wikiLinkExpansionPluginKey.getState(view.state)?.collapsed[0];
    expect(collapsed).toEqual(expanded);

    view.dispatch(view.state.tr.delete(collapsed!.to - 1, collapsed!.to));

    expect(wikiLinkExpansionPluginKey.getState(view.state)?.collapsed).toEqual([]);
    expect(view.dom.querySelector('.wiki-link')).toBeNull();
    expect(view.dom.textContent).toContain('[[First]');

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
