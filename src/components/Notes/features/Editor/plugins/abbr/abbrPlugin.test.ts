import { describe, expect, it } from 'vitest';
import { Editor, defaultValueCtx, editorViewCtx } from '@milkdown/kit/core';
import { commonmark } from '@milkdown/kit/preset/commonmark';
import { gfm } from '@milkdown/kit/preset/gfm';
import type { Node as ProseMirrorNode } from '@milkdown/kit/prose/model';
import type { Decoration } from '@milkdown/kit/prose/view';
import { configureTheme } from '../../theme';
import {
  MAX_ABBR_DECORATIONS,
  MAX_ABBR_TEXT_SCAN_CHARS,
  MAX_ABBR_TITLE_CHARS,
  abbrPlugin,
  abbrPluginKey,
  extractAbbrDefinitions,
  findAbbrUsages,
  findAbbrUsagesInRange,
  normalizeAbbrTitle,
  transactionMayAffectAbbrDecorations,
} from './abbrPlugin';

interface FakeAbbrNode {
  child?: (index: number) => FakeAbbrNode | null | undefined;
  childCount?: number;
  isText?: boolean;
  nodeSize?: number;
  text?: string;
}

function createTextNode(text: string): FakeAbbrNode {
  return {
    isText: true,
    nodeSize: text.length,
    text,
  };
}

function createDocNode(children: FakeAbbrNode[], onAccess?: () => void): FakeAbbrNode {
  return {
    childCount: children.length,
    child(index) {
      onAccess?.();
      return children[index];
    },
  };
}

function findTextPosition(doc: ProseMirrorNode, text: string, edge: 'start' | 'end'): number {
  let result = -1;
  doc.descendants((node, pos) => {
    if (!node.isText) {
      return true;
    }
    const index = (node.text ?? '').indexOf(text);
    if (index < 0) {
      return true;
    }
    result = pos + index + (edge === 'end' ? text.length : 0);
    return false;
  });

  if (result < 0) {
    throw new Error(`Text not found: ${text}`);
  }
  return result;
}

function findUsageDecorations(view: { state: { doc: ProseMirrorNode } }): Decoration[] {
  return (abbrPluginKey.getState(view.state)?.find() ?? []).filter((decoration: Decoration) => (
    (decoration.type as any).attrs?.nodeName === 'abbr'
  ));
}

describe('abbrPlugin', () => {
  it('bounds abbreviation title metadata', () => {
    expect(normalizeAbbrTitle('HyperText Markup Language')).toBe('HyperText Markup Language');
    expect(normalizeAbbrTitle('x'.repeat(MAX_ABBR_TITLE_CHARS + 1))).toHaveLength(MAX_ABBR_TITLE_CHARS);
    expect(normalizeAbbrTitle(null)).toBe('');
  });

  it('stops collecting definitions when the node scan budget is exhausted', () => {
    const doc = createDocNode([
      createTextNode('plain text'),
      createTextNode('*[HTML]: HyperText Markup Language'),
    ]);

    expect(extractAbbrDefinitions(doc, 1)).toEqual([]);
  });

  it('skips definition extraction in overlong text nodes', () => {
    const doc = createDocNode([
      createTextNode(`${'x'.repeat(MAX_ABBR_TEXT_SCAN_CHARS)}\n*[HTML]: HyperText Markup Language`),
    ]);

    expect(extractAbbrDefinitions(doc)).toEqual([]);
  });

  it('stops collecting usages when the node scan budget is exhausted', () => {
    const doc = createDocNode([
      createTextNode('plain text'),
      createTextNode('HTML usage'),
    ]);

    expect(findAbbrUsages(doc, [{ abbr: 'HTML', fullText: 'HyperText Markup Language' }], 1)).toEqual([]);
  });

  it('collects abbreviation usages through the requested local range', () => {
    const nodesBetween = (from: number, to: number, callback: (
      node: FakeAbbrNode,
      pos: number,
      parent: FakeAbbrNode,
    ) => void) => {
      expect({ from, to }).toEqual({ from: 20, to: 80 });
      callback(createTextNode('Local HTML usage'), 24, {});
    };
    const doc = {
      content: { size: 120 },
      nodesBetween,
    };

    expect(findAbbrUsagesInRange(
      doc,
      [{ abbr: 'HTML', fullText: 'HyperText Markup Language' }],
      20,
      80,
    )).toEqual([{
      start: 30,
      end: 34,
      fullText: 'HyperText Markup Language',
    }]);
  });

  it('stops local abbreviation usage scans at the node budget', () => {
    let scanned = 0;
    const doc = {
      content: { size: 120 },
      nodesBetween: (_from: number, _to: number, callback: (
        node: FakeAbbrNode,
        pos: number,
        parent: FakeAbbrNode,
      ) => boolean | void) => {
        for (let index = 0; index < 5; index += 1) {
          scanned += 1;
          const shouldContinue = callback(createTextNode('Local HTML usage'), index * 20, {});
          if (shouldContinue === false) break;
        }
      },
    };

    expect(findAbbrUsagesInRange(
      doc,
      [{ abbr: 'HTML', fullText: 'HyperText Markup Language' }],
      0,
      120,
      1,
    )).toHaveLength(1);
    expect(scanned).toBe(2);
  });

  it('skips usage matching in overlong text nodes', () => {
    const doc = createDocNode([
      createTextNode(`${'x'.repeat(MAX_ABBR_TEXT_SCAN_CHARS)} HTML`),
    ]);

    expect(findAbbrUsages(doc, [{ abbr: 'HTML', fullText: 'HyperText Markup Language' }])).toEqual([]);
  });

  it('stops scanning usage nodes after the decoration cap is reached', () => {
    let accessed = 0;
    const children: FakeAbbrNode[] = [];
    for (let index = 0; index < MAX_ABBR_DECORATIONS + 2; index += 1) {
      children.push(createTextNode('HTML '));
    }

    const usages = findAbbrUsages(
      createDocNode(children, () => {
        accessed += 1;
      }),
      [{ abbr: 'HTML', fullText: 'HyperText Markup Language' }],
    );

    expect(usages).toHaveLength(MAX_ABBR_DECORATIONS);
    expect(accessed).toBe(MAX_ABBR_DECORATIONS);
  });

  it('decorates ordinary abbreviation usage without touching definitions or code', async () => {
    const editor = Editor.make()
      .config((ctx) => {
        ctx.set(defaultValueCtx, [
          '*[HTML]: HyperText Markup Language',
          '',
          'HTML and `HTML`.',
          '',
          '```',
          'HTML',
          '```',
        ].join('\n'));
      })
      .use(commonmark);

    for (const plugin of abbrPlugin) {
      editor.use(plugin);
    }

    await editor.create();
    const view = editor.ctx.get(editorViewCtx);
    const decorations = findUsageDecorations(view);

    expect(decorations.map((decoration: Decoration) => ({
      text: view.state.doc.textBetween(decoration.from, decoration.to),
      title: (decoration.type as any).attrs?.title,
    }))).toEqual([{
      text: 'HTML',
      title: 'HyperText Markup Language',
    }]);

    await editor.destroy();
  });

  it('ignores escaped abbreviation definition paragraphs', async () => {
    const editor = Editor.make()
      .config((ctx) => {
        ctx.set(defaultValueCtx, '');
      })
      .use(commonmark)
      .use(gfm)
      .use(configureTheme);

    for (const plugin of abbrPlugin) {
      editor.use(plugin);
    }

    await editor.create();
    const view = editor.ctx.get(editorViewCtx);
    const { schema } = view.state;
    const escapedDefinition = schema.nodes.paragraph.create(
      { vlainaEscapedBlockSyntax: 'abbrDefinition' },
      schema.text('*[HTML]: HyperText Markup Language')
    );
    const usage = schema.nodes.paragraph.create(null, schema.text('HTML usage'));

    view.dispatch(view.state.tr.replaceWith(0, view.state.doc.content.size, [escapedDefinition, usage]));

    const decorations = findUsageDecorations(view);
    expect(decorations).toEqual([]);

    await editor.destroy();
  });

  it('caps abbreviation usage decorations in large notes', async () => {
    const editor = Editor.make()
      .config((ctx) => {
        ctx.set(defaultValueCtx, [
          '*[HTML]: HyperText Markup Language',
          '',
          Array.from({ length: 1100 }, () => 'HTML').join(' '),
        ].join('\n'));
      })
      .use(commonmark);

    for (const plugin of abbrPlugin) {
      editor.use(plugin);
    }

    await editor.create();
    const view = editor.ctx.get(editorViewCtx);
    const decorations = findUsageDecorations(view);

    expect(decorations).toHaveLength(1000);

    await editor.destroy();
  });

  it('maps existing decorations for unrelated typing when no abbreviation can change', async () => {
    const editor = Editor.make()
      .config((ctx) => {
        ctx.set(defaultValueCtx, [
          '*[HTML]: HyperText Markup Language',
          '',
          'HTML usage',
          '',
          'Target paragraph',
        ].join('\n'));
      })
      .use(commonmark);

    for (const plugin of abbrPlugin) {
      editor.use(plugin);
    }

    await editor.create();
    const view = editor.ctx.get(editorViewCtx);
    const previous = abbrPluginKey.getState(view.state);
    expect(findUsageDecorations(view)).toHaveLength(1);

    const tr = view.state.tr.insertText(
      ' smooth input',
      findTextPosition(view.state.doc, 'Target paragraph', 'end'),
    );

    expect(transactionMayAffectAbbrDecorations(previous!, tr, view.state.doc, tr.doc)).toBe(false);

    await editor.destroy();
  });

  it('rebuilds decorations when typing text that matches a known abbreviation', async () => {
    const editor = Editor.make()
      .config((ctx) => {
        ctx.set(defaultValueCtx, [
          '*[HTML]: HyperText Markup Language',
          '',
          'Target paragraph',
        ].join('\n'));
      })
      .use(commonmark);

    for (const plugin of abbrPlugin) {
      editor.use(plugin);
    }

    await editor.create();
    const view = editor.ctx.get(editorViewCtx);
    const previous = abbrPluginKey.getState(view.state);
    const tr = view.state.tr.insertText(
      ' HTML',
      findTextPosition(view.state.doc, 'Target paragraph', 'end'),
    );

    expect(transactionMayAffectAbbrDecorations(previous!, tr, view.state.doc, tr.doc)).toBe(true);
    view.dispatch(tr);

    const decorations = findUsageDecorations(view);
    expect(decorations.map((decoration: Decoration) => (
      view.state.doc.textBetween(decoration.from, decoration.to)
    ))).toEqual(['HTML']);

    await editor.destroy();
  });

  it('rebuilds decorations when typing an abbreviation definition prefix', async () => {
    const editor = Editor.make()
      .config((ctx) => {
        ctx.set(defaultValueCtx, 'Definition line');
      })
      .use(commonmark);

    for (const plugin of abbrPlugin) {
      editor.use(plugin);
    }

    await editor.create();
    const view = editor.ctx.get(editorViewCtx);
    const previous = abbrPluginKey.getState(view.state);
    const tr = view.state.tr.insertText(
      '*[HTML]: ',
      findTextPosition(view.state.doc, 'Definition line', 'start'),
    );

    expect(transactionMayAffectAbbrDecorations(previous!, tr, view.state.doc, tr.doc)).toBe(true);

    await editor.destroy();
  });
});
