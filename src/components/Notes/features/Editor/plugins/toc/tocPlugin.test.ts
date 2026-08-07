import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  defaultValueCtx,
  Editor,
  editorViewCtx,
} from '@milkdown/kit/core';
import { commonmark } from '@milkdown/kit/preset/commonmark';
import { NodeSelection, TextSelection } from '@milkdown/kit/prose/state';
import { handleTocShortcutEnter, tocPlugin } from './tocPlugin';
import { isTocShortcutText } from './tocShortcut';

describe('tocShortcut', () => {
  it('matches toc shortcuts case-insensitively after trimming', () => {
    expect(isTocShortcutText('[toc]')).toBe(true);
    expect(isTocShortcutText(' [TOC] ')).toBe(true);
    expect(isTocShortcutText('{:toc}')).toBe(true);
    expect(isTocShortcutText(' {:TOC} ')).toBe(true);
    expect(isTocShortcutText('[toc')).toBe(false);
    expect(isTocShortcutText('{toc}')).toBe(false);
  });
});

function createView() {
  const tr = {
    replaceWith: vi.fn(() => tr),
    scrollIntoView: vi.fn(() => tr),
  };

  const view = {
    state: {
      selection: {
        empty: true,
        $from: {
          depth: 1,
          parentOffset: 5,
          parent: {
            type: { name: 'paragraph' },
            attrs: {},
            textContent: '[toc]',
            textBetween: vi.fn(() => '[toc]'),
            content: { size: 5 },
            nodeSize: 7,
          },
          node: vi.fn((depth: number) => {
            if (depth === 0) {
              return { canReplaceWith: vi.fn(() => true) };
            }
            return null;
          }),
          index: vi.fn(() => 0),
          before: vi.fn(() => 4),
        },
      },
      schema: {
        nodes: {
          toc: {
            create: vi.fn((attrs: unknown) => ({ attrs })),
          },
        },
      },
      tr,
    },
    dispatch: vi.fn(),
  };

  return { view, tr };
}

describe('handleTocShortcutEnter', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('converts a standalone [toc] paragraph into a toc node on Enter', () => {
    const { view, tr } = createView();
    Object.defineProperty(view.state.selection.$from.parent, 'textContent', {
      configurable: true,
      get() {
        throw new Error('aggregate paragraph textContent should not be read');
      },
    });

    expect(handleTocShortcutEnter(view as never)).toBe(true);
    expect(view.state.selection.$from.parent.textBetween).toHaveBeenCalledWith(0, 5, '', '');
    expect(view.state.schema.nodes.toc.create).toHaveBeenCalledWith({ maxLevel: 6 });
    expect(tr.replaceWith).toHaveBeenCalledWith(4, 11, { attrs: { maxLevel: 6 } });
    expect(view.dispatch).toHaveBeenCalledWith(tr);
  });

  it('moves the cursor after a toc node created from the Enter shortcut', async () => {
    const editor = Editor.make()
      .config((ctx) => {
        ctx.set(defaultValueCtx, '');
      })
      .use(commonmark)
      .use(tocPlugin);

    await editor.create();

    try {
      const view = editor.ctx.get(editorViewCtx);
      const paragraph = view.state.schema.nodes.paragraph.create(
        null,
        view.state.schema.text('[TOC]')
      );
      view.dispatch(view.state.tr.replaceWith(0, view.state.doc.content.size, paragraph));
      view.dispatch(view.state.tr.setSelection(
        TextSelection.create(view.state.doc, 1 + '[TOC]'.length)
      ));

      expect(handleTocShortcutEnter(view)).toBe(true);
      expect(view.state.selection).toBeInstanceOf(TextSelection);
      expect(view.state.selection).not.toBeInstanceOf(NodeSelection);
      expect(view.state.doc.child(0).type.name).toBe('toc');
      expect(view.state.doc.child(1).type.name).toBe('paragraph');
    } finally {
      await editor.destroy();
    }
  });

  it('moves a toc click to the exact heading text end', async () => {
    const editor = Editor.make()
      .config((ctx) => {
        ctx.set(defaultValueCtx, '');
      })
      .use(commonmark)
      .use(tocPlugin);

    await editor.create();

    try {
      const view = editor.ctx.get(editorViewCtx);
      const toc = view.state.schema.nodes.toc.create({ maxLevel: 6 });
      const heading = view.state.schema.nodes.heading.create(
        { level: 1 },
        view.state.schema.text('Exact heading target'),
      );
      view.dispatch(view.state.tr.replaceWith(0, view.state.doc.content.size, [toc, heading]));
      let headingPos = -1;
      view.state.doc.descendants((node, pos) => {
        if (node.type.name === 'heading') {
          headingPos = pos;
          return false;
        }
        return true;
      });
      const link = view.dom.querySelector<HTMLElement>('.toc-link[data-heading-pos]');
      expect(link).not.toBeNull();
      const headingDom = view.nodeDOM(headingPos);
      expect(headingDom).toBeInstanceOf(HTMLElement);
      const scrollIntoView = vi.fn();
      (headingDom as HTMLElement).scrollIntoView = scrollIntoView;

      link!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

      expect(view.state.selection).toBeInstanceOf(TextSelection);
      expect(view.state.selection.from).toBe(headingPos + heading.nodeSize - 1);
      expect(view.state.selection.to).toBe(headingPos + heading.nodeSize - 1);
      expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'auto', block: 'start' });
    } finally {
      await editor.destroy();
    }
  });

  it('converts a standalone {:toc} paragraph into a toc node on Enter', () => {
    const { view, tr } = createView();
    view.state.selection.$from.parent.textContent = '{:toc}';
    view.state.selection.$from.parent.textBetween = vi.fn(() => '{:toc}');
    view.state.selection.$from.parentOffset = 6;
    view.state.selection.$from.parent.content.size = 6;
    view.state.selection.$from.parent.nodeSize = 8;

    expect(handleTocShortcutEnter(view as never)).toBe(true);
    expect(view.state.schema.nodes.toc.create).toHaveBeenCalledWith({ maxLevel: 6 });
    expect(tr.replaceWith).toHaveBeenCalledWith(4, 12, { attrs: { maxLevel: 6 } });
    expect(view.dispatch).toHaveBeenCalledWith(tr);
  });

  it('returns false when the paragraph text is not a toc shortcut', () => {
    const { view } = createView();
    view.state.selection.$from.parent.textContent = '[to]';
    view.state.selection.$from.parent.textBetween = vi.fn(() => '[to]');

    expect(handleTocShortcutEnter(view as never)).toBe(false);
    expect(view.dispatch).not.toHaveBeenCalled();
  });

  it('returns false when the toc shortcut was escaped in markdown', () => {
    const { view } = createView();
    view.state.selection.$from.parent.attrs = { vlainaEscapedBlockSyntax: 'toc' };

    expect(handleTocShortcutEnter(view as never)).toBe(false);
    expect(view.dispatch).not.toHaveBeenCalled();
  });

  it('returns false when the cursor is not at the end of the paragraph', () => {
    const { view } = createView();
    view.state.selection.$from.parentOffset = 2;

    expect(handleTocShortcutEnter(view as never)).toBe(false);
    expect(view.dispatch).not.toHaveBeenCalled();
  });

  it('does not read oversized paragraph text while checking toc shortcuts', () => {
    const { view } = createView();
    view.state.selection.$from.parent = {
      ...view.state.selection.$from.parent,
      content: { size: 33 },
      nodeSize: 35,
      get textContent(): string {
        throw new Error('textContent should not be read for oversized toc shortcuts');
      },
    };
    view.state.selection.$from.parentOffset = 33;

    expect(handleTocShortcutEnter(view as never)).toBe(false);
    expect(view.dispatch).not.toHaveBeenCalled();
  });
});
