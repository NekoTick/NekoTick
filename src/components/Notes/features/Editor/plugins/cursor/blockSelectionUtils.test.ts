import { afterEach, describe, expect, it } from 'vitest';
import { Editor, defaultValueCtx, editorViewCtx } from '@milkdown/kit/core';
import { commonmark } from '@milkdown/kit/preset/commonmark';
import { gfm } from '@milkdown/kit/preset/gfm';
import * as ProseModel from '@milkdown/kit/prose/model';
import type { Node as ProseNode } from '@milkdown/kit/prose/model';
import type { Decoration } from '@milkdown/kit/prose/view';
import { RAW_MARKDOWN_LINK_TEXT_CLASS } from '../links/markdown-link/markdownLinkConfig';
import {
  clampViewportRectTop,
  convertBlockRectsToDocumentSpace,
  createBlockRectYIndex,
  convertViewportDragRectToDocumentRect,
  createBlockSelectionDecorations,
  createBlockSelectionPreviewSurfaceDecorations,
  createDragSelectionRect,
  getBlockSelectionDecorationClass,
  getDisplayBlockRangesForDecorations,
  getBlockRangesKey,
  isRectIntersecting,
  LARGE_BLOCK_SELECTION_RENDERING_THRESHOLD,
  normalizeBlockRanges,
  preferNestedBlockRanges,
  preferNestedBlockRangesUnlessHeaderIntersects,
  pruneContainedBlockRanges,
  resolveDisplayedDragViewportRect,
  resolveIntersectedBlockRanges,
  resolveIntersectedBlockRangesFromYIndex,
  type BlockRect,
} from './blockSelectionUtils';
import { collectSelectableBlockRanges } from './blockUnitResolver';

async function createEditor(markdown: string) {
  const editor = Editor.make()
    .config((ctx) => {
      ctx.set(defaultValueCtx, markdown);
    })
    .use(commonmark)
    .use(gfm);

  await editor.create();
  return editor;
}

const RichSelectionSchemaCtor = (ProseModel as any).Schema;
const richSelectionSchema = new RichSelectionSchemaCtor({
  nodes: {
    doc: { content: 'block+' },
    paragraph: {
      group: 'block',
      content: 'text*',
      toDOM: () => ['p', 0],
      parseDOM: [{ tag: 'p' }],
    },
    heading: {
      group: 'block',
      content: 'text*',
      attrs: { level: { default: 2 } },
      toDOM: () => ['h2', 0],
      parseDOM: [{ tag: 'h2' }],
    },
    html_block: {
      group: 'block',
      content: 'text*',
      code: true,
      isolating: true,
      marks: '',
      attrs: {
        value: { default: null },
      },
      toDOM: () => ['div', { 'data-type': 'html-block' }, 0],
      parseDOM: [{ tag: 'div[data-type="html-block"]', preserveWhitespace: 'full' }],
    },
    math_block: {
      group: 'block',
      content: 'text*',
      code: true,
      isolating: true,
      marks: '',
      toDOM: () => ['div', { 'data-type': 'math-block' }, 0],
      parseDOM: [{ tag: 'div[data-type="math-block"]', preserveWhitespace: 'full' }],
    },
    blockquote: {
      group: 'block',
      content: 'block+',
      toDOM: () => ['blockquote', 0],
      parseDOM: [{ tag: 'blockquote' }],
    },
    callout: {
      group: 'block',
      content: 'block+',
      toDOM: () => ['div', { 'data-type': 'callout' }, 0],
      parseDOM: [{ tag: 'div[data-type="callout"]' }],
    },
    footnote_def: {
      group: 'block',
      content: 'block+',
      toDOM: () => ['div', { class: 'footnote-def' }, 0],
      parseDOM: [{ tag: 'div.footnote-def' }],
    },
    mermaid: {
      group: 'block',
      content: 'text*',
      code: true,
      isolating: true,
      marks: '',
      toDOM: () => ['div', { 'data-type': 'mermaid' }, 0],
      parseDOM: [{ tag: 'div[data-type="mermaid"]', preserveWhitespace: 'full' }],
    },
    text: { group: 'inline' },
  },
});

function richSelectionTextNode(text: string) {
  return text ? richSelectionSchema.text(text) : undefined;
}

function richSelectionParagraph(text: string) {
  return richSelectionSchema.nodes.paragraph.create(null, richSelectionTextNode(text));
}

function richSelectionHtmlBlock(value: string) {
  return richSelectionSchema.nodes.html_block.create({ value }, richSelectionTextNode(value));
}

function richSelectionRichBlock(typeName: 'math_block' | 'mermaid', text: string) {
  return richSelectionSchema.nodes[typeName].create(null, richSelectionTextNode(text));
}

function richSelectionDocWith(nodes: ProseNode[]) {
  return richSelectionSchema.nodes.doc.create(null, nodes);
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('blockSelectionUtils', () => {
  it('normalizes drag rectangle in any direction', () => {
    expect(createDragSelectionRect(100, 80, 20, 10)).toEqual({
      left: 20,
      top: 10,
      right: 100,
      bottom: 80,
    });
  });

  it('requires positive overlap instead of selecting on touching edges', () => {
    expect(
      isRectIntersecting(
        { left: 0, top: 0, right: 10, bottom: 10 },
        { left: 10, top: 5, right: 20, bottom: 15 },
      ),
    ).toBe(false);

    expect(
      isRectIntersecting(
        { left: 0, top: 0, right: 10, bottom: 10 },
        { left: 9, top: 5, right: 20, bottom: 15 },
      ),
    ).toBe(true);
  });

  it('allows line-shaped drag selections only when they pass through block interiors', () => {
    const block = { left: 0, top: 0, right: 100, bottom: 20 };

    expect(
      isRectIntersecting(block, {
        left: 10,
        top: 10,
        right: 90,
        bottom: 10,
      }),
    ).toBe(true);

    expect(
      isRectIntersecting(block, {
        left: 50,
        top: 5,
        right: 50,
        bottom: 15,
      }),
    ).toBe(true);

    expect(
      isRectIntersecting(block, {
        left: 10,
        top: 20,
        right: 90,
        bottom: 20,
      }),
    ).toBe(false);
  });

  it('normalizes and deduplicates block ranges', () => {
    const ranges = normalizeBlockRanges([
      { from: 10, to: 20 },
      { from: 4, to: 8 },
      { from: 10, to: 20 },
      { from: 8, to: 8 },
    ]);

    expect(ranges).toEqual([
      { from: 4, to: 8 },
      { from: 10, to: 20 },
    ]);
  });

  it('drops ranges fully contained by an outer selected block', () => {
    expect(pruneContainedBlockRanges([
      { from: 0, to: 30 },
      { from: 8, to: 17 },
      { from: 18, to: 27 },
      { from: 30, to: 37 },
    ])).toEqual([
      { from: 0, to: 30 },
      { from: 30, to: 37 },
    ]);
  });

  it('prefers nested ranges when a child block and containing list item are both selected', () => {
    expect(preferNestedBlockRanges([
      { from: 22, to: 29 },
      { from: 26, to: 28 },
    ])).toEqual([{ from: 26, to: 28 }]);
  });

  it('prefers deepest nested ranges across sibling containers', () => {
    expect(preferNestedBlockRanges([
      { from: 0, to: 100 },
      { from: 10, to: 40 },
      { from: 18, to: 24 },
      { from: 50, to: 90 },
      { from: 60, to: 70 },
      { from: 92, to: 98 },
    ])).toEqual([
      { from: 18, to: 24 },
      { from: 60, to: 70 },
      { from: 92, to: 98 },
    ]);
  });

  it('keeps nested preference when a drag rect stays inside a selected child block', () => {
    const blocks: BlockRect[] = [
      { from: 26, to: 28, left: 0, top: 120, right: 100, bottom: 180 },
      { from: 22, to: 29, left: 0, top: 80, right: 100, bottom: 180 },
    ];

    expect(preferNestedBlockRangesUnlessHeaderIntersects(
      [
        { from: 22, to: 29 },
        { from: 26, to: 28 },
      ],
      blocks,
      { left: 0, top: 130, right: 100, bottom: 170 },
    )).toEqual([{ from: 26, to: 28 }]);
  });

  it('preserves a containing list item when dragging from a child block into its header area', () => {
    const blocks: BlockRect[] = [
      { from: 26, to: 28, left: 0, top: 120, right: 100, bottom: 180 },
      { from: 22, to: 29, left: 0, top: 80, right: 100, bottom: 180 },
    ];

    expect(preferNestedBlockRangesUnlessHeaderIntersects(
      [
        { from: 22, to: 29 },
        { from: 26, to: 28 },
      ],
      blocks,
      { left: 0, top: 90, right: 100, bottom: 170 },
    )).toEqual([{ from: 22, to: 29 }]);
  });

  it('preserves only intersected parent containers when checking nested header overlap', () => {
    const blocks: BlockRect[] = [
      { from: 10, to: 14, left: 0, top: 40, right: 100, bottom: 60 },
      { from: 0, to: 20, left: 0, top: 20, right: 100, bottom: 60 },
      { from: 40, to: 44, left: 0, top: 120, right: 100, bottom: 140 },
      { from: 30, to: 50, left: 0, top: 100, right: 100, bottom: 140 },
    ];

    expect(preferNestedBlockRangesUnlessHeaderIntersects(
      [
        { from: 0, to: 20 },
        { from: 10, to: 14 },
        { from: 30, to: 50 },
        { from: 40, to: 44 },
      ],
      blocks,
      { left: 0, top: 110, right: 100, bottom: 140 },
    )).toEqual([
      { from: 10, to: 14 },
      { from: 30, to: 50 },
    ]);
  });

  it('converts drag rectangles into document space across scroll changes', () => {
    expect(
      convertViewportDragRectToDocumentRect(
        { left: 80, top: 120, right: 20, bottom: 40 },
        80,
        120,
        10,
        20,
        50,
        70,
      ),
    ).toEqual({ left: 70, top: 110, right: 90, bottom: 140 });

    expect(
      resolveDisplayedDragViewportRect(
        { left: 80, top: 120, right: 20, bottom: 40 },
        80,
        120,
        10,
        20,
        50,
        70,
      ),
    ).toEqual({ left: 20, top: 40, right: 40, bottom: 70 });
  });

  it('clamps displayed drag rectangles below the editor viewport top', () => {
    expect(clampViewportRectTop(
      { left: 20, top: -12, right: 80, bottom: 64 },
      40,
    )).toEqual({ left: 20, top: 40, right: 80, bottom: 64 });

    expect(clampViewportRectTop(
      { left: 20, top: -12, right: 80, bottom: 24 },
      40,
    )).toEqual({ left: 20, top: 40, right: 80, bottom: 40 });
  });

  it('converts block rects into document space', () => {
    expect(
      convertBlockRectsToDocumentSpace([{ from: 1, to: 2, left: 10, top: 20, right: 30, bottom: 40 }], 5, 7),
    ).toEqual([{ from: 1, to: 2, left: 15, top: 27, right: 35, bottom: 47 }]);

    expect(
      convertBlockRectsToDocumentSpace([
        {
          from: 1,
          to: 2,
          left: 10,
          top: 20,
          right: 80,
          bottom: 40,
          contentLeft: 30,
          contentRight: 50,
        },
      ], 5, 7),
    ).toEqual([
      {
        from: 1,
        to: 2,
        left: 15,
        top: 27,
        right: 85,
        bottom: 47,
        contentLeft: 35,
        contentRight: 55,
      },
    ]);
  });

  it('selects only intersected blocks and returns ordered ranges', () => {
    const blocks: BlockRect[] = [
      { from: 20, to: 30, left: 0, top: 70, right: 100, bottom: 90 },
      { from: 0, to: 10, left: 0, top: 0, right: 100, bottom: 20 },
      { from: 10, to: 20, left: 0, top: 30, right: 100, bottom: 50 },
    ];

    const result = resolveIntersectedBlockRanges(blocks, {
      left: 10,
      top: 10,
      right: 90,
      bottom: 75,
    });

    expect(result).toEqual([
      { from: 0, to: 10 },
      { from: 10, to: 20 },
      { from: 20, to: 30 },
    ]);
    expect(getBlockRangesKey(result)).toBe('0:10|10:20|20:30');
  });

  it('selects the same intersected blocks through the y-axis index', () => {
    const blocks: BlockRect[] = [
      { from: 20, to: 30, left: 0, top: 70, right: 100, bottom: 90 },
      { from: 0, to: 10, left: 0, top: 0, right: 100, bottom: 20 },
      { from: 10, to: 20, left: 0, top: 30, right: 100, bottom: 50 },
      { from: 30, to: 40, left: 0, top: 120, right: 100, bottom: 140 },
    ];
    const selectionRect = {
      left: 10,
      top: 10,
      right: 90,
      bottom: 75,
    };

    expect(resolveIntersectedBlockRangesFromYIndex(
      createBlockRectYIndex(blocks),
      selectionRect,
    )).toEqual(resolveIntersectedBlockRanges(blocks, selectionRect));
  });

  it('does not select the previous block when dragging from the gap below it', () => {
    const blocks: BlockRect[] = [
      { from: 0, to: 10, left: 0, top: 0, right: 100, bottom: 20 },
      { from: 10, to: 20, left: 0, top: 30, right: 100, bottom: 50 },
    ];

    expect(
      resolveIntersectedBlockRanges(blocks, {
        left: 10,
        top: 20,
        right: 90,
        bottom: 35,
      }),
    ).toEqual([{ from: 10, to: 20 }]);
  });

  it('matches common block drag selection gestures from surrounding blank space', () => {
    const blocks: BlockRect[] = [
      { from: 0, to: 10, left: 100, top: 0, right: 500, bottom: 24 },
      { from: 10, to: 20, left: 100, top: 36, right: 500, bottom: 60 },
      { from: 20, to: 30, left: 100, top: 72, right: 500, bottom: 96 },
    ];

    expect(resolveIntersectedBlockRanges(blocks, {
      left: 20,
      top: 8,
      right: 160,
      bottom: 44,
    })).toEqual([
      { from: 0, to: 10 },
      { from: 10, to: 20 },
    ]);

    expect(resolveIntersectedBlockRanges(blocks, {
      left: 20,
      top: 48,
      right: 160,
      bottom: 84,
    })).toEqual([
      { from: 10, to: 20 },
      { from: 20, to: 30 },
    ]);

    expect(resolveIntersectedBlockRanges(blocks, {
      left: 20,
      top: 48,
      right: 160,
      bottom: 48,
    })).toEqual([{ from: 10, to: 20 }]);
  });

  it('renders standalone image paragraphs using the image node range', async () => {
    const editor = await createEditor('![](./demo.png)');
    const view = editor.ctx.get(editorViewCtx);
    const displayRanges = getDisplayBlockRangesForDecorations(view.state.doc, [{ from: 0, to: 3 }]);

    expect(displayRanges).toEqual([{ from: 1, to: 2 }]);

    await editor.destroy();
  });

  it('does not decorate zero-width hardbreak nodes when selecting hard-break paragraph lines', async () => {
    const editor = await createEditor('alpha\\\nbravo');
    const view = editor.ctx.get(editorViewCtx);
    const decorations = createBlockSelectionDecorations(view.state.doc, [{ from: 1, to: 7 }]);

    expect(decorations.find().map((decoration: Decoration) => ({
      from: decoration.from,
      to: decoration.to,
      class: (decoration.type as any).attrs?.class,
    }))).toEqual([{
      from: 1,
      to: 6,
      class: 'editor-block-selected md-focus editor-block-selected-textlike editor-block-selected-inline-line',
    }]);
    expect(view.state.doc.resolve(7).nodeBefore?.type.name).toBe('hardbreak');

    await editor.destroy();
  });

  it('marks hard-break paragraph lines as inline line selections', async () => {
    const editor = await createEditor('底线（-/=）方式（**不推荐**）：\\\n语法说明如下。');
    const view = editor.ctx.get(editorViewCtx);
    const hardBreakPos = (() => {
      let pos = -1;
      view.state.doc.descendants((node, nodePos) => {
        if (node.type.name === 'hardbreak' || node.type.name === 'hard_break') {
          pos = nodePos;
          return false;
        }
        return true;
      });
      return pos;
    })();
    const decorations = createBlockSelectionDecorations(view.state.doc, [{ from: 1, to: hardBreakPos + 1 }]);

    expect(decorations.find().map((decoration: Decoration) => (decoration.type as any).attrs?.class)).toEqual([
      'editor-block-selected md-focus editor-block-selected-textlike editor-block-selected-inline-line',
    ]);

    await editor.destroy();
  });

  it('uses inline decoration for full text-node ranges inside hard-break paragraphs', async () => {
    const editor = await createEditor('alpha\\\nbravo');
    const view = editor.ctx.get(editorViewCtx);
    let lineFrom = -1;
    let lineTo = -1;
    view.state.doc.descendants((node, pos) => {
      if (node.isText && node.text === 'bravo') {
        lineFrom = pos;
        lineTo = pos + node.nodeSize;
        return false;
      }
      return true;
    });
    const decorations = createBlockSelectionDecorations(view.state.doc, [{ from: lineFrom, to: lineTo }]);

    expect(decorations.find().map((decoration: Decoration) => ({
      from: decoration.from,
      to: decoration.to,
    }))).toEqual([{ from: lineFrom, to: lineTo }]);

    await editor.destroy();
  });

  it('marks inline selected link text so block selection keeps link color', async () => {
    const editor = await createEditor('我[xs](ds)我');
    const view = editor.ctx.get(editorViewCtx);
    let linkTextFrom = -1;
    let linkTextTo = -1;

    view.state.doc.descendants((node, pos) => {
      if (node.isText && node.text === 'xs' && node.marks.some((mark) => mark.type.name === 'link')) {
        linkTextFrom = pos;
        linkTextTo = pos + node.nodeSize;
        return false;
      }
      return true;
    });
    expect(linkTextFrom).toBeGreaterThanOrEqual(0);

    const decorations = createBlockSelectionDecorations(view.state.doc, [{ from: linkTextFrom, to: linkTextTo }]);
    const className = String((decorations.find()[0]?.type as any).attrs?.class ?? '');

    expect(className).toContain('editor-block-selected-inline-line');
    expect(className).toContain(RAW_MARKDOWN_LINK_TEXT_CLASS);

    await editor.destroy();
  });

  it('marks only linked text as link-colored inside a mixed inline selection', async () => {
    const editor = await createEditor('我[xs](ds)我');
    const view = editor.ctx.get(editorViewCtx);
    let plainTextFrom = -1;
    let linkTextFrom = -1;
    let linkTextTo = -1;

    view.state.doc.descendants((node, pos) => {
      if (!node.isText) return true;
      if (plainTextFrom < 0 && node.text === '我' && node.marks.every((mark) => mark.type.name !== 'link')) {
        plainTextFrom = pos;
      }
      if (node.text === 'xs' && node.marks.some((mark) => mark.type.name === 'link')) {
        linkTextFrom = pos;
        linkTextTo = pos + node.nodeSize;
      }
      return plainTextFrom < 0 || linkTextFrom < 0 || linkTextTo < 0;
    });
    expect(plainTextFrom).toBeGreaterThanOrEqual(0);
    expect(linkTextFrom).toBeGreaterThan(plainTextFrom);
    expect(linkTextTo).toBeGreaterThan(plainTextFrom);

    const decorations = createBlockSelectionDecorations(view.state.doc, [{ from: plainTextFrom, to: linkTextTo }]);
    const decorationRows = decorations.find().map((decoration: Decoration) => ({
      from: decoration.from,
      to: decoration.to,
      className: String((decoration.type as any).attrs?.class ?? ''),
    }));
    const fullRangeDecoration = decorationRows.find((decoration) =>
      decoration.from === plainTextFrom && decoration.to === linkTextTo
    );
    const linkRangeDecoration = decorationRows.find((decoration) =>
      decoration.from === linkTextFrom && decoration.to === linkTextTo
    );

    expect(fullRangeDecoration?.className, JSON.stringify(decorationRows, null, 2))
      .toContain('editor-block-selected-inline-line');
    expect(fullRangeDecoration?.className, JSON.stringify(decorationRows, null, 2))
      .not.toContain(RAW_MARKDOWN_LINK_TEXT_CLASS);
    expect(linkRangeDecoration?.className, JSON.stringify(decorationRows, null, 2))
      .toBe(RAW_MARKDOWN_LINK_TEXT_CLASS);

    await editor.destroy();
  });

  it('marks adjacent text-like blocks without relying on CSS sibling scans', async () => {
    const editor = await createEditor(['alpha', '', 'bravo', '', 'charlie'].join('\n'));
    const view = editor.ctx.get(editorViewCtx);
    const ranges: Array<{ from: number; to: number }> = [];
    view.state.doc.forEach((node, offset) => {
      ranges.push({ from: offset, to: offset + node.nodeSize });
    });

    const decorations = createBlockSelectionDecorations(view.state.doc, ranges.slice(0, 2));
    const classes = decorations.find().map((decoration: Decoration) =>
      String((decoration.type as any).attrs?.class ?? '')
    );

    expect(classes[0]).toContain('editor-block-selected-textlike');
    expect(classes[0]).toContain('editor-block-selected-has-next');
    expect(classes[0]).not.toContain('editor-block-selected-has-previous');
    expect(classes[1]).toContain('editor-block-selected-textlike');
    expect(classes[1]).toContain('editor-block-selected-has-previous');
    expect(classes[1]).not.toContain('editor-block-selected-has-next');

    await editor.destroy();
  });

  it('marks hard-break paragraph edges adjacent across paragraph boundary tokens', async () => {
    const editor = await createEditor(['alpha\\', 'bravo', '', 'charlie'].join('\n'));
    const view = editor.ctx.get(editorViewCtx);
    const ranges = collectSelectableBlockRanges(view.state.doc);

    expect(ranges).toHaveLength(3);

    const decorations = createBlockSelectionDecorations(view.state.doc, ranges);
    const decorationRows = decorations.find().map((decoration: Decoration) => ({
      from: decoration.from,
      to: decoration.to,
      className: String((decoration.type as any).attrs?.class ?? ''),
    }));
    const classByFrom = new Map(decorationRows.map((row) => [row.from, row.className]));

    expect(classByFrom.get(ranges[0].from), JSON.stringify(decorationRows, null, 2))
      .toContain('editor-block-selected-has-next');
    expect(classByFrom.get(ranges[1].from), JSON.stringify(decorationRows, null, 2))
      .toContain('editor-block-selected-has-previous');
    expect(classByFrom.get(ranges[1].from), JSON.stringify(decorationRows, null, 2))
      .toContain('editor-block-selected-has-next');
    expect(classByFrom.get(ranges[2].from), JSON.stringify(decorationRows, null, 2))
      .toContain('editor-block-selected-has-previous');

    await editor.destroy();
  });

  it('marks editable blank paragraphs adjacent to following paragraph inline ranges', () => {
    const doc = richSelectionDocWith([
      richSelectionParagraph(''),
      richSelectionParagraph('next'),
    ]);
    const selectedRanges = [
      { from: 0, to: 2 },
      { from: 3, to: 5 },
    ];
    const decorations = createBlockSelectionDecorations(doc, selectedRanges);
    const decorationRows = decorations.find().map((decoration: Decoration) => ({
      from: decoration.from,
      to: decoration.to,
      className: String((decoration.type as any).attrs?.class ?? ''),
    }));
    const classByFrom = new Map(decorationRows.map((row) => [row.from, row.className]));

    expect(classByFrom.get(selectedRanges[0].from), JSON.stringify(decorationRows, null, 2))
      .toContain('editor-block-selected-has-next');
    expect(classByFrom.get(selectedRanges[1].from), JSON.stringify(decorationRows, null, 2))
      .toContain('editor-block-selected-has-previous');
  });

  it('marks preserved blank-line blocks adjacent to following paragraph inline ranges', () => {
    const blankLine = '<!--vlaina-markdown-blank-line-->';
    const doc = richSelectionDocWith([
      richSelectionHtmlBlock(blankLine),
      richSelectionParagraph('next'),
    ]);
    const rows: Array<{ from: number; label: string; to: number }> = [];
    doc.forEach((node: ProseNode, offset: number) => {
      if (node.type.name === 'paragraph') {
        rows.push({
          from: offset + 1,
          label: node.textContent,
          to: offset + node.nodeSize - 1,
        });
        return;
      }

      rows.push({
        from: offset,
        label: typeof node.attrs?.value === 'string' ? node.attrs.value : node.textContent,
        to: offset + node.nodeSize,
      });
    });

    const decorations = createBlockSelectionDecorations(
      doc,
      rows.map(({ from, to }) => ({ from, to })),
    );
    const classByLabel = new Map(rows.map((row) => {
      const decoration = decorations.find(row.from, row.to).find((candidate: Decoration) =>
        candidate.from === row.from && candidate.to === row.to
      );
      return [
        row.label,
        String((decoration?.type as any)?.attrs?.class ?? ''),
      ];
    }));

    expect(classByLabel.get(blankLine), JSON.stringify(Object.fromEntries(classByLabel), null, 2))
      .toContain('editor-block-selected-has-next');
    expect(classByLabel.get('next'), JSON.stringify(Object.fromEntries(classByLabel), null, 2))
      .toContain('editor-block-selected-has-previous');
  });

  it('keeps large selections on the lightweight decoration path', async () => {
    const markdown = Array.from(
      { length: LARGE_BLOCK_SELECTION_RENDERING_THRESHOLD },
      (_, index) => `paragraph ${index}`
    ).join('\n\n');
    const editor = await createEditor(markdown);
    const view = editor.ctx.get(editorViewCtx);
    const ranges: Array<{ from: number; to: number }> = [];
    view.state.doc.forEach((node, offset) => {
      ranges.push({ from: offset, to: offset + node.nodeSize });
    });

    const decorations = createBlockSelectionDecorations(view.state.doc, ranges);
    const classes = decorations.find().map((decoration: Decoration) =>
      String((decoration.type as any).attrs?.class ?? '')
    );

    expect(classes).toHaveLength(LARGE_BLOCK_SELECTION_RENDERING_THRESHOLD);
    expect(classes[0]).toBe('editor-block-selected md-focus editor-block-selected-large-item editor-block-selected-large-textlike editor-block-selected-has-next');
    expect(classes.some((className) => className.includes('editor-block-selected-textlike'))).toBe(false);
    expect(classes.every((className) => className.includes('editor-block-selected-large-textlike'))).toBe(true);
    expect(classes[1]).toContain('editor-block-selected-has-next');
    expect(classes[1]).toContain('editor-block-selected-has-previous');
    expect(classes.at(-1)).not.toContain('editor-block-selected-has-next');
    expect(classes.at(-1)).toContain('editor-block-selected-has-previous');
    expect(classes.some((className) => className.includes('editor-block-selected-parent-marker'))).toBe(false);

    await editor.destroy();
  });

  it('marks selected horizontal rule wrappers without CSS child scans', async () => {
    const markdown = [
      ...Array.from(
        { length: LARGE_BLOCK_SELECTION_RENDERING_THRESHOLD - 1 },
        (_, index) => `paragraph ${index}`,
      ),
      '---',
    ].join('\n\n');
    const editor = await createEditor(markdown);
    const view = editor.ctx.get(editorViewCtx);
    const ranges: Array<{ from: number; to: number; nodeType: string }> = [];
    view.state.doc.forEach((node, offset) => {
      ranges.push({
        from: offset,
        to: offset + node.nodeSize,
        nodeType: node.type.name,
      });
    });

    const decorations = createBlockSelectionDecorations(view.state.doc, ranges);
    const hrRange = ranges.find((range) => range.nodeType === 'hr');
    const hrClass = decorations.find().find((decoration: Decoration) => (
      decoration.from === hrRange?.from && decoration.to === hrRange?.to
    ));

    expect(hrRange).toBeDefined();
    expect(String((hrClass?.type as any)?.attrs?.class ?? '')).toContain('editor-block-selected-hr-wrapper');

    await editor.destroy();
  });

  it('marks hard-break inline ranges on the large selection path for line-fill ownership', async () => {
    const markdown = Array.from(
      { length: LARGE_BLOCK_SELECTION_RENDERING_THRESHOLD },
      (_, index) => `paragraph ${index} first line\\\nparagraph ${index} second line`,
    ).join('\n\n');
    const editor = await createEditor(markdown);
    const view = editor.ctx.get(editorViewCtx);
    const ranges = collectSelectableBlockRanges(view.state.doc).slice(0, LARGE_BLOCK_SELECTION_RENDERING_THRESHOLD);

    const decorations = createBlockSelectionDecorations(view.state.doc, ranges);
    const lineMarkers = decorations.find();

    expect(lineMarkers).toHaveLength(LARGE_BLOCK_SELECTION_RENDERING_THRESHOLD);
    expect(lineMarkers.every((decoration: Decoration) => decoration.widget)).toBe(true);
    expect(lineMarkers.every((decoration: Decoration) => decoration.spec.blockSelectionLineMarker === true)).toBe(true);

    await editor.destroy();
  });

  it('marks only linked text inside mixed inline ranges on the large selection path', async () => {
    const markdown = [
      '我[xs](ds)我\\\nline 2',
      ...Array.from(
        { length: LARGE_BLOCK_SELECTION_RENDERING_THRESHOLD - 1 },
        (_, index) => `paragraph ${index}`,
      ),
    ].join('\n\n');
    const editor = await createEditor(markdown);
    const view = editor.ctx.get(editorViewCtx);
    const selectableRanges = collectSelectableBlockRanges(view.state.doc);
    const linkLineRange = selectableRanges.find((range) =>
      view.state.doc.textBetween(range.from, range.to, '\n').includes('xs')
    );
    let linkTextFrom = -1;
    let linkTextTo = -1;

    view.state.doc.descendants((node, pos) => {
      if (node.isText && node.text === 'xs' && node.marks.some((mark) => mark.type.name === 'link')) {
        linkTextFrom = pos;
        linkTextTo = pos + node.nodeSize;
        return false;
      }
      return true;
    });
    expect(linkLineRange).toBeDefined();
    expect(linkTextFrom).toBeGreaterThanOrEqual(0);

    const ranges = [
      linkLineRange!,
      ...selectableRanges.filter((range) => range !== linkLineRange),
    ].slice(0, LARGE_BLOCK_SELECTION_RENDERING_THRESHOLD);
    const decorations = createBlockSelectionDecorations(view.state.doc, ranges);
    const decorationRows = decorations.find().map((decoration: Decoration) => ({
      from: decoration.from,
      to: decoration.to,
      className: String((decoration.type as any).attrs?.class ?? ''),
    }));
    const linkRangeDecoration = decorationRows.find((decoration) =>
      decoration.from === linkTextFrom && decoration.to === linkTextTo
    );
    const mixedLineDecoration = decorationRows.find((decoration) =>
      decoration.from === linkLineRange!.from && decoration.className.includes('editor-block-selected-large-textlike')
    );

    expect(mixedLineDecoration?.className, JSON.stringify(decorationRows, null, 2))
      .toContain('editor-block-selected-inline-line');
    expect(mixedLineDecoration?.className, JSON.stringify(decorationRows, null, 2))
      .not.toContain(RAW_MARKDOWN_LINK_TEXT_CLASS);
    expect(linkRangeDecoration?.className, JSON.stringify(decorationRows, null, 2))
      .toBe(RAW_MARKDOWN_LINK_TEXT_CLASS);

    await editor.destroy();
  });

  it('marks rich blocks on the large selection path so they keep a visible selection surface', async () => {
    const markdown = [
      ...Array.from(
        { length: LARGE_BLOCK_SELECTION_RENDERING_THRESHOLD - 1 },
        (_, index) => `paragraph ${index}`,
      ),
      '```js\nconst value = 1;\n```',
    ].join('\n\n');
    const editor = await createEditor(markdown);
    const view = editor.ctx.get(editorViewCtx);
    const ranges: Array<{ from: number; to: number }> = [];
    view.state.doc.forEach((node, offset) => {
      ranges.push({ from: offset, to: offset + node.nodeSize });
    });

    const decorations = createBlockSelectionDecorations(view.state.doc, ranges);
    const classes = decorations.find().map((decoration: Decoration) =>
      String((decoration.type as any).attrs?.class ?? '')
    );

    expect(classes).toHaveLength(LARGE_BLOCK_SELECTION_RENDERING_THRESHOLD);
    expect(classes.filter((className) => className.includes('editor-block-selected-large-rich'))).toHaveLength(1);
    expect(classes.at(-1)).toBe('editor-block-selected md-focus editor-block-selected-large-item editor-block-selected-large-rich editor-block-selected-has-previous');
    expect(classes.slice(0, -1).every((className) => className.includes('editor-block-selected-large-textlike'))).toBe(true);
    expect(classes[0]).toContain('editor-block-selected-has-next');
    expect(classes[0]).not.toContain('editor-block-selected-has-previous');
    expect(classes.at(-2)).toContain('editor-block-selected-has-next');
    expect(classes.at(-2)).toContain('editor-block-selected-has-previous');

    await editor.destroy();
  });

  it('marks containers that hide rich children during a deferred preview', () => {
    const doc = richSelectionDocWith([
      richSelectionSchema.nodes.blockquote.create(null, [
        richSelectionParagraph('quote container'),
        richSelectionRichBlock('math_block', 'E = mc^2'),
      ]),
      richSelectionSchema.nodes.blockquote.create(null, [
        richSelectionParagraph('plain quote container'),
      ]),
      richSelectionSchema.nodes.callout.create(null, [
        richSelectionParagraph('callout container'),
      ]),
      richSelectionSchema.nodes.footnote_def.create(null, [
        richSelectionParagraph('footnote container'),
      ]),
      richSelectionSchema.nodes.heading.create({ level: 2 }, [
        richSelectionTextNode('heading container')!,
      ]),
    ]);
    const ranges: Array<{ from: number; to: number }> = [];
    doc.forEach((node: ProseNode, offset: number) => {
      ranges.push({ from: offset, to: offset + node.nodeSize });
    });

    const decorations = createBlockSelectionPreviewSurfaceDecorations(doc, ranges);

    expect(decorations.find().map((decoration: Decoration) => `${decoration.from}:${decoration.to}`))
      .toEqual([
        `${ranges[0]!.from}:${ranges[0]!.to}`,
        `${ranges[2]!.from}:${ranges[2]!.to}`,
        `${ranges[3]!.from}:${ranges[3]!.to}`,
        `${ranges[4]!.from}:${ranges[4]!.to}`,
      ]);
  });

  it('marks atomic rich node types on the large selection path', () => {
    const richNodeTypes = ['html_block', 'math_block', 'mermaid'] as const;
    const doc = richSelectionDocWith([
      ...Array.from(
        { length: LARGE_BLOCK_SELECTION_RENDERING_THRESHOLD - richNodeTypes.length },
        (_, index) => richSelectionParagraph(`paragraph ${index}`),
      ),
      richSelectionHtmlBlock('<div>large html block</div>'),
      richSelectionRichBlock('math_block', 'E = mc^2'),
      richSelectionRichBlock('mermaid', 'flowchart TD\nA --> B'),
    ]);
    const rows: Array<{ from: number; nodeType: string; to: number }> = [];
    doc.forEach((node: ProseNode, offset: number) => {
      rows.push({
        from: offset,
        nodeType: node.type.name,
        to: offset + node.nodeSize,
      });
    });

    const decorations = createBlockSelectionDecorations(
      doc,
      rows.map(({ from, to }) => ({ from, to })),
    );
    const classByRange = new Map(decorations.find().map((decoration: Decoration) => [
      `${decoration.from}:${decoration.to}`,
      String((decoration.type as any).attrs?.class ?? ''),
    ]));
    const classByNodeType = new Map(rows.map((row) => [
      row.nodeType,
      classByRange.get(`${row.from}:${row.to}`) ?? '',
    ]));
    const classes = Array.from(classByRange.values());

    expect(rows).toHaveLength(LARGE_BLOCK_SELECTION_RENDERING_THRESHOLD);
    expect(classes.filter((className) => className.includes('editor-block-selected-large-rich')))
      .toHaveLength(richNodeTypes.length);
    expect(classes.filter((className) => className.includes('editor-block-selected-large-textlike')))
      .toHaveLength(LARGE_BLOCK_SELECTION_RENDERING_THRESHOLD - richNodeTypes.length);
    for (const nodeType of richNodeTypes) {
      const className = classByNodeType.get(nodeType);
      expect(className, `${nodeType} selection class`).toContain('editor-block-selected-large-rich');
      expect(className, `${nodeType} selection class`).not.toContain('editor-block-selected-large-textlike');
    }
  });

  it('keeps non-rendering html blocks text-like on the large selection path', () => {
    const richHtml = '<div>large html block</div>';
    const literalComment = '<!--literal comment-->';
    const blankLine = '<!--vlaina-markdown-blank-line-->';
    const doc = richSelectionDocWith([
      ...Array.from(
        { length: LARGE_BLOCK_SELECTION_RENDERING_THRESHOLD - 3 },
        (_, index) => richSelectionParagraph(`paragraph ${index}`),
      ),
      richSelectionHtmlBlock(richHtml),
      richSelectionHtmlBlock(literalComment),
      richSelectionHtmlBlock(blankLine),
    ]);
    const rows: Array<{ from: number; label: string; to: number }> = [];
    doc.forEach((node: ProseNode, offset: number) => {
      rows.push({
        from: offset,
        label: typeof node.attrs?.value === 'string' ? node.attrs.value : node.textContent,
        to: offset + node.nodeSize,
      });
    });

    const decorations = createBlockSelectionDecorations(
      doc,
      rows.map(({ from, to }) => ({ from, to })),
    );
    const classByLabel = new Map(rows.map((row) => {
      const decoration = decorations.find(row.from, row.to).find((candidate: Decoration) =>
        candidate.from === row.from && candidate.to === row.to
      );
      return [
        row.label,
        String((decoration?.type as any)?.attrs?.class ?? ''),
      ];
    }));

    expect(classByLabel.get(richHtml), JSON.stringify(Object.fromEntries(classByLabel), null, 2))
      .toContain('editor-block-selected-large-rich');
    expect(classByLabel.get(literalComment), JSON.stringify(Object.fromEntries(classByLabel), null, 2))
      .toContain('editor-block-selected-large-textlike');
    expect(classByLabel.get(literalComment), JSON.stringify(Object.fromEntries(classByLabel), null, 2))
      .not.toContain('editor-block-selected-large-rich');
    expect(classByLabel.get(blankLine), JSON.stringify(Object.fromEntries(classByLabel), null, 2))
      .toContain('editor-block-selected-large-textlike');
    expect(classByLabel.get(blankLine), JSON.stringify(Object.fromEntries(classByLabel), null, 2))
      .not.toContain('editor-block-selected-large-rich');
  });

  it('marks parent containers for marker styling without relying on CSS child scans', async () => {
    const editor = await createEditor(['- alpha', '', '> bravo'].join('\n'));
    const view = editor.ctx.get(editorViewCtx);
    let listItemRange: { from: number; to: number } | null = null;
    let listParagraphRange: { from: number; to: number } | null = null;
    let blockquoteRange: { from: number; to: number } | null = null;
    let quoteParagraphRange: { from: number; to: number } | null = null;

    view.state.doc.descendants((node, pos) => {
      if (node.type.name === 'list_item' && node.textContent === 'alpha') {
        listItemRange = { from: pos, to: pos + node.nodeSize };
      }
      if (node.type.name === 'paragraph' && node.textContent === 'alpha') {
        listParagraphRange = { from: pos, to: pos + node.nodeSize };
      }
      if (node.type.name === 'blockquote' && node.textContent === 'bravo') {
        blockquoteRange = { from: pos, to: pos + node.nodeSize };
      }
      if (node.type.name === 'paragraph' && node.textContent === 'bravo') {
        quoteParagraphRange = { from: pos, to: pos + node.nodeSize };
      }
    });

    expect(listItemRange).not.toBeNull();
    expect(listParagraphRange).not.toBeNull();
    expect(blockquoteRange).not.toBeNull();
    expect(quoteParagraphRange).not.toBeNull();

    const decorations = createBlockSelectionDecorations(view.state.doc, [
      listParagraphRange!,
      quoteParagraphRange!,
    ]);
    const classesByRange = new Map(decorations.find().map((decoration: Decoration) => [
      `${decoration.from}:${decoration.to}`,
      String((decoration.type as any).attrs?.class ?? ''),
    ]));

    expect(classesByRange.get(`${listParagraphRange!.from}:${listParagraphRange!.to}`))
      .toContain('editor-block-selected');
    expect(classesByRange.get(`${listItemRange!.from}:${listItemRange!.to}`))
      .toContain('editor-block-selected-parent-marker');
    expect(classesByRange.get(`${listItemRange!.from}:${listItemRange!.to}`)?.split(/\s+/))
      .not.toContain('editor-block-selected');
    expect(classesByRange.get(`${quoteParagraphRange!.from}:${quoteParagraphRange!.to}`))
      .toContain('editor-block-selected');
    expect(classesByRange.get(`${blockquoteRange!.from}:${blockquoteRange!.to}`))
      .toContain('editor-block-selected-parent-marker');

    await editor.destroy();
  });

  it('does not mark list parent markers when selecting continuation paragraphs', async () => {
    const editor = await createEditor([
      '1. parent marker sentinel',
      '',
      '   continuation marker sentinel',
    ].join('\n'));
    const view = editor.ctx.get(editorViewCtx);
    let listItemRange: { from: number; to: number } | null = null;
    let continuationParagraphRange: { from: number; to: number } | null = null;

    view.state.doc.descendants((node, pos) => {
      if (node.type.name === 'list_item' && node.textContent.includes('parent marker sentinel')) {
        listItemRange = { from: pos, to: pos + node.nodeSize };
      }
      if (node.type.name === 'paragraph' && node.textContent === 'continuation marker sentinel') {
        continuationParagraphRange = { from: pos, to: pos + node.nodeSize };
      }
    });

    expect(listItemRange).not.toBeNull();
    expect(continuationParagraphRange).not.toBeNull();

    const decorations = createBlockSelectionDecorations(view.state.doc, [continuationParagraphRange!]);
    const classesByRange = new Map(decorations.find().map((decoration: Decoration) => [
      `${decoration.from}:${decoration.to}`,
      String((decoration.type as any).attrs?.class ?? ''),
    ]));

    expect(classesByRange.get(`${continuationParagraphRange!.from}:${continuationParagraphRange!.to}`))
      .toContain('editor-block-selected');
    expect(classesByRange.get(`${listItemRange!.from}:${listItemRange!.to}`) ?? '')
      .not.toContain('editor-block-selected-parent-marker');

    await editor.destroy();
  });

  // doc: bullet_list(14)[ list_item(12)[ paragraph(4), code_block(6) ] ]
  // Range A: { from:1, to:13 } — whole list item; pos=1 resolves to list_item
  // Range B: { from:6, to:12 } — code block alone; pos=6 resolves to code_block (not list_item)
  it('expands whole-item range (Range A) to full list_item decoration', () => {
    const listItemNode = { type: { name: 'list_item' }, nodeSize: 12 };
    const codeBlockNode = { type: { name: 'code_block' }, nodeSize: 6 };

    function makeDoc(resolveResult: { nodeAfter: typeof listItemNode | typeof codeBlockNode | null }) {
      return {
        content: { size: 14 },
        resolve(_pos: number) {
          return {
            nodeAfter: resolveResult.nodeAfter,
          };
        },
      } as any;
    }

    // Range A: from=1, to=13; nodeAfter at pos=1 is list_item → should expand to [1, 1+12=13]
    const docA = makeDoc({ nodeAfter: listItemNode });
    const rangesA = getDisplayBlockRangesForDecorations(docA, [{ from: 1, to: 13 }]);
    expect(rangesA).toEqual([{ from: 1, to: 13 }]);

    // Range B: from=6, to=12; nodeAfter at pos=6 is code_block (not list_item) → no expansion
    const docB = makeDoc({ nodeAfter: codeBlockNode });
    const rangesB = getDisplayBlockRangesForDecorations(docB, [{ from: 6, to: 12 }]);
    expect(rangesB).toEqual([{ from: 6, to: 12 }]);
  });

  it('marks complex list children as contained only when their list item is also selected', () => {
    const listItemNode = { type: { name: 'list_item' }, nodeSize: 12 };
    const codeBlockNode = { type: { name: 'code_block' }, nodeSize: 6 };

    const doc = {
      content: { size: 14 },
      resolve(_pos: number) {
        return {
          depth: 2,
          nodeAfter: codeBlockNode,
          node(depth: number) {
            return depth === 1 ? listItemNode : { type: { name: 'doc' }, nodeSize: 14 };
          },
          before(depth: number) {
            return depth === 1 ? 1 : 0;
          },
        };
      },
    } as any;

    expect(
      getBlockSelectionDecorationClass(doc, { from: 6, to: 12 }, [
        { from: 1, to: 13 },
        { from: 6, to: 12 },
      ]),
    ).toBe('editor-block-selected md-focus editor-block-selected-contained');

    expect(
      getBlockSelectionDecorationClass(doc, { from: 6, to: 12 }, [
        { from: 6, to: 12 },
      ]),
    ).toBe('editor-block-selected md-focus');
  });

  it('builds detailed block selection decorations below the lightweight threshold', async () => {
    const editor = await createEditor('');
    const view = editor.ctx.get(editorViewCtx);
    const { schema } = view.state;
    const list = schema.nodes.bullet_list.create(null, Array.from({ length: 24 }, (_, index) =>
      schema.nodes.list_item.create({ label: '•', listType: 'bullet' }, [
        schema.nodes.paragraph.create(null, schema.text(`item ${index}`)),
        schema.nodes.code_block.create(null, schema.text(`code ${index}`)),
      ])
    ));
    view.dispatch(view.state.tr.replaceWith(0, view.state.doc.content.size, list));

    const ranges: Array<{ from: number; to: number }> = [];
    view.state.doc.descendants((node, pos) => {
      if (node.type.name === 'list_item' || node.type.name === 'code_block') {
        ranges.push({ from: pos, to: pos + node.nodeSize });
      }
      return true;
    });

    const decorations = createBlockSelectionDecorations(view.state.doc, ranges);
    const classesByRange = new Map(decorations.find().map((decoration: Decoration) => [
      `${decoration.from}:${decoration.to}`,
      String((decoration.type as any).attrs?.class ?? ''),
    ]));
    expect(decorations.find()).toHaveLength(ranges.length);
    let foundSelectedListItemWithCodeBlock = false;
    for (const range of ranges) {
      const classes = classesByRange.get(`${range.from}:${range.to}`) ?? '';
      if (!classes.includes('editor-block-selected') || classes.includes('editor-block-selected-contained')) {
        continue;
      }
      expect(classes).toContain('editor-block-selected-has-direct-code-block');
      foundSelectedListItemWithCodeBlock = true;
      break;
    }
    expect(foundSelectedListItemWithCodeBlock).toBe(true);
    expect(
      decorations.find().some((decoration: Decoration) => {
        const classes = String((decoration.type as any).attrs?.class ?? '').split(/\s+/);
        return classes.includes('editor-block-selected') && classes.includes('editor-block-selected-contained');
      }),
    ).toBe(true);

    await editor.destroy();
  });

  it('marks selected rich parents without relying on CSS child scans', async () => {
    const editor = await createEditor('![](./demo.png) caption');
    const view = editor.ctx.get(editorViewCtx);
    const paragraphRange = (() => {
      let range: { from: number; to: number } | null = null;
      view.state.doc.descendants((node, pos) => {
        if (node.type.name === 'paragraph') {
          range = { from: pos, to: pos + node.nodeSize };
          return false;
        }
        return true;
      });
      return range;
    })();

    expect(paragraphRange).not.toBeNull();

    const decorations = createBlockSelectionDecorations(view.state.doc, [paragraphRange!]);
    const classes = String((decorations.find()[0]?.type as any)?.attrs?.class ?? '');

    expect(classes).toContain('editor-block-selected-has-direct-image');

    await editor.destroy();
  });
});
