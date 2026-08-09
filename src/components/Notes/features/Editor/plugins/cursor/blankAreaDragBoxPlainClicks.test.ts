import { describe, expect, it, vi } from 'vitest';
import { Editor, defaultValueCtx, editorViewCtx } from '@milkdown/kit/core';
import { commonmark } from '@milkdown/kit/preset/commonmark';
import { gfm } from '@milkdown/kit/preset/gfm';
import { TextSelection } from '@milkdown/kit/prose/state';
import { resolveTextblockLineEndPlainClick } from './listParagraphEndPlainClick';
import {
  clearTextSelectionForDragSession,
  resolveInsideBlockTrailingPlainClick,
  startInsideBlockTrailingPlainClickSession,
} from './blankAreaDragBoxPlainClicks';

function createHarness(nextContent: 'paragraph' | 'list' | 'none' = 'paragraph') {
  const editor = document.createElement('div');
  const list = document.createElement('ol');
  const item = document.createElement('li');
  const paragraph = document.createElement('p');
  paragraph.textContent = 'pasted log ending index.css';
  item.appendChild(paragraph);
  if (nextContent === 'paragraph') {
    const nextParagraph = document.createElement('p');
    nextParagraph.textContent = '8:08 next pasted log line';
    item.appendChild(nextParagraph);
  } else if (nextContent === 'list') {
    item.appendChild(document.createElement('ol'));
  }
  list.appendChild(item);
  editor.appendChild(list);
  document.body.appendChild(editor);

  const parentSize = paragraph.textContent.length;
  const resolved = {
    depth: 3,
    parent: {
      isTextblock: true,
      content: { size: parentSize },
      type: { name: 'paragraph' },
    },
    parentOffset: parentSize,
    before: vi.fn(() => 2),
  };
  const view = {
    dom: editor,
    posAtCoords: vi.fn(() => ({ pos: 30 })),
    coordsAtPos: vi.fn(() => ({ left: 480, right: 480, top: 40, bottom: 60 })),
    state: { doc: { resolve: vi.fn(() => resolved) } },
  } as any;
  const event = new MouseEvent('mousedown', {
    button: 0,
    clientX: 523,
    clientY: 52,
  });
  Object.defineProperty(event, 'target', { configurable: true, value: paragraph });

  return { editor, event, view };
}

describe('resolveTextblockLineEndPlainClick', () => {
  it('does not map document coordinates when the pointer hits text content', () => {
    const { editor, event, view } = createHarness();
    view.state.doc.descendants = vi.fn();
    const rangeRects = vi.spyOn(Range.prototype, 'getClientRects').mockReturnValue({
      0: {
        bottom: 60,
        height: 20,
        left: 500,
        right: 540,
        top: 40,
        width: 40,
      },
      item: (index: number) => index === 0 ? ({
        bottom: 60,
        height: 20,
        left: 500,
        right: 540,
        top: 40,
        width: 40,
      } as DOMRect) : null,
      length: 1,
    } as DOMRectList);

    try {
      expect(resolveInsideBlockTrailingPlainClick(view, event)).toBeNull();
      expect(view.posAtCoords).not.toHaveBeenCalled();
    } finally {
      rangeRects.mockRestore();
      editor.remove();
    }
  });

  it('leaves the trailing text gutter available for native drag selection', () => {
    const { editor, event, view } = createHarness();
    view.state.doc.descendants = vi.fn();
    const rangeRects = vi.spyOn(Range.prototype, 'getClientRects').mockReturnValue({
      0: {
        bottom: 60,
        height: 20,
        left: 440,
        right: 480,
        top: 40,
        width: 40,
      },
      item: (index: number) => index === 0 ? ({
        bottom: 60,
        height: 20,
        left: 440,
        right: 480,
        top: 40,
        width: 40,
      } as DOMRect) : null,
      length: 1,
    } as DOMRectList);

    try {
      expect(resolveInsideBlockTrailingPlainClick(view, event)).toBeNull();
      expect(view.posAtCoords).not.toHaveBeenCalled();
    } finally {
      rangeRects.mockRestore();
      editor.remove();
    }
  });

  it('targets the current paragraph end before a following pasted list paragraph', () => {
    const { editor, event, view } = createHarness();

    expect(resolveTextblockLineEndPlainClick(view, event)).toEqual({
      targetPos: 30,
      bias: -1,
      blockFrom: 2,
    });

    editor.remove();
  });

  it.each(['none', 'list'] as const)('targets the paragraph end when followed by %s', (nextContent) => {
    const { editor, event, view } = createHarness(nextContent);

    expect(resolveTextblockLineEndPlainClick(view, event)).toEqual({
      targetPos: 30,
      bias: -1,
      blockFrom: 2,
    });

    editor.remove();
  });

  it.each(['hardbreak', 'hard_break'] as const)(
    'targets a non-final textblock line end before %s',
    (breakName) => {
      const { editor, event, view } = createHarness();
      const parentSize = 36;
      view.state.doc.resolve.mockReturnValue({
        depth: 3,
        parent: {
          isTextblock: true,
          content: { size: parentSize },
          type: { name: 'paragraph' },
        },
        parentOffset: 29,
        nodeAfter: { type: { name: breakName } },
        before: vi.fn(() => 2),
      });

      expect(resolveTextblockLineEndPlainClick(view, event)).toEqual({
        targetPos: 30,
        bias: -1,
        blockFrom: 2,
      });

      editor.remove();
    }
  );

  it('targets a hard-break line end inside a non-list nested textblock', () => {
    const { editor, event, view } = createHarness();
    const paragraph = editor.querySelector('p');
    const blockquote = document.createElement('blockquote');
    blockquote.append(paragraph!);
    editor.replaceChildren(blockquote);
    view.state.doc.resolve.mockReturnValue({
      depth: 2,
      parent: {
        isTextblock: true,
        content: { size: 36 },
        type: { name: 'paragraph' },
      },
      parentOffset: 29,
      nodeAfter: { type: { name: 'hardbreak' } },
      before: vi.fn(() => 2),
    });

    expect(resolveTextblockLineEndPlainClick(view, event)).toEqual({
      targetPos: 30,
      bias: -1,
      blockFrom: 2,
    });

    editor.remove();
  });

  it('resolves the textblock line when the blank surface target is its list item', () => {
    const { editor, event, view } = createHarness();
    const listItem = editor.querySelector('li');
    Object.defineProperty(event, 'target', { configurable: true, value: listItem });
    view.state.doc.resolve.mockReturnValue({
      depth: 3,
      parent: {
        isTextblock: true,
        content: { size: 36 },
        type: { name: 'paragraph' },
      },
      parentOffset: 29,
      nodeAfter: { type: { name: 'hardbreak' } },
      before: vi.fn(() => 2),
    });

    expect(resolveTextblockLineEndPlainClick(view, event)).toEqual({
      targetPos: 30,
      bias: -1,
      blockFrom: 2,
    });

    editor.remove();
  });

  it('keeps the exact browser position at an ordinary wrapped-line end', () => {
    const { editor, event, view } = createHarness();
    view.state.doc.resolve.mockReturnValue({
      depth: 3,
      parent: {
        isTextblock: true,
        content: { size: 36 },
        type: { name: 'paragraph' },
      },
      parentOffset: 29,
      nodeAfter: { type: { name: 'text' } },
      before: vi.fn(() => 2),
    });
    view.coordsAtPos.mockImplementation((pos: number) => (
      pos === 37
        ? { left: 420, right: 420, top: 70, bottom: 90 }
        : { left: 480, right: 480, top: 40, bottom: 60 }
    ));

    expect(resolveTextblockLineEndPlainClick(view, event)).toEqual({
      targetPos: 30,
      bias: -1,
      blockFrom: 2,
    });
    editor.remove();
  });

  it('uses the textblock end when the browser reports an interior position on its final line', () => {
    const { editor, event, view } = createHarness();
    view.state.doc.resolve.mockReturnValue({
      depth: 3,
      parent: {
        isTextblock: true,
        content: { size: 36 },
        type: { name: 'paragraph' },
      },
      parentOffset: 29,
      nodeAfter: { type: { name: 'text' } },
      before: vi.fn(() => 2),
    });

    expect(resolveTextblockLineEndPlainClick(view, event)).toEqual({
      targetPos: 37,
      bias: -1,
      blockFrom: 2,
    });
    editor.remove();
  });

  it('keeps an exact line-end position from the same editor external gutter', () => {
    const { editor, event, view } = createHarness();
    const externalBlank = document.createElement('div');
    document.body.appendChild(externalBlank);
    Object.defineProperty(event, 'target', { configurable: true, value: externalBlank });

    expect(resolveTextblockLineEndPlainClick(view, event)).toEqual({
      targetPos: 30,
      bias: -1,
      blockFrom: 2,
    });

    externalBlank.remove();
    editor.remove();
  });

  it('leaves editable markdown blank-line placeholders to visual block resolution', () => {
    const { editor, event, view } = createHarness();
    view.state.doc.resolve.mockReturnValue({
      depth: 1,
      parent: {
        isTextblock: true,
        content: { size: 1 },
        textBetween: vi.fn(() => '\u200B'),
        type: { name: 'paragraph' },
      },
      parentOffset: 1,
      before: vi.fn(() => 2),
    });

    expect(resolveTextblockLineEndPlainClick(view, event)).toBeNull();

    editor.remove();
  });

  it('leaves interactive targets to their own pointer handlers', () => {
    const { editor, event, view } = createHarness();
    const button = document.createElement('button');
    editor.appendChild(button);
    Object.defineProperty(event, 'target', { configurable: true, value: button });

    expect(resolveTextblockLineEndPlainClick(view, event)).toBeNull();

    editor.remove();
  });

  it('leaves text clicks to native selection', () => {
    const finalParagraph = createHarness('none');
    Object.defineProperty(finalParagraph.event, 'clientX', { configurable: true, value: 484 });
    expect(resolveTextblockLineEndPlainClick(finalParagraph.view, finalParagraph.event)).toBeNull();
    finalParagraph.editor.remove();
  });
});

describe('clearTextSelectionForDragSession', () => {
  it('keeps the collapsed caret at an exact hard-break line edge', async () => {
    const editor = Editor.make()
      .config((ctx) => {
        ctx.set(defaultValueCtx, 'Alpha  \nBeta');
      })
      .use(commonmark)
      .use(gfm);
    await editor.create();
    const view = editor.ctx.get(editorViewCtx);

    try {
      let hardBreakPos: number | null = null;
      view.state.doc.descendants((node, pos) => {
        if (node.type.name !== 'hardbreak' && node.type.name !== 'hard_break') return true;
        hardBreakPos = pos;
        return false;
      });
      expect(hardBreakPos).not.toBeNull();

      view.dispatch(view.state.tr.setSelection(
        TextSelection.create(view.state.doc, hardBreakPos!, hardBreakPos! + 1)
      ));
      clearTextSelectionForDragSession(view);

      expect(view.state.selection).toBeInstanceOf(TextSelection);
      expect(view.state.selection.from).toBe(hardBreakPos);
      expect(view.state.selection.to).toBe(hardBreakPos);
    } finally {
      await editor.destroy();
    }
  });
});

describe('startInsideBlockTrailingPlainClickSession', () => {
  it('moves directly from the first line to a later line end on pointer down', async () => {
    const editor = Editor.make().use(commonmark).use(gfm);
    await editor.create();
    const view = editor.ctx.get(editorViewCtx);

    try {
      const { paragraph } = view.state.schema.nodes;
      const firstText = view.state.schema.text('first');
      const secondText = view.state.schema.text('second');
      const first = paragraph.create(null, firstText);
      const second = paragraph.create(null, secondText);
      const secondFrom = first.nodeSize;
      const tr = view.state.tr.replaceWith(
        0,
        view.state.doc.content.size,
        [first, second],
      );
      view.dispatch(tr.setSelection(TextSelection.create(tr.doc, 1 + firstText.nodeSize)));

      const event = new MouseEvent('mousedown', {
        button: 0,
        cancelable: true,
        clientX: 400,
        clientY: 80,
      });
      const stop = startInsideBlockTrailingPlainClickSession(view, event, {
        blockFrom: secondFrom,
        targetPos: secondFrom + 1 + secondText.nodeSize,
        bias: -1,
      });

      expect(event.defaultPrevented).toBe(true);
      expect(view.state.selection.from).toBe(secondFrom + 1 + secondText.nodeSize);
      expect(view.state.selection.to).toBe(secondFrom + 1 + secondText.nodeSize);
      stop();
    } finally {
      await editor.destroy();
    }
  });

  it('focuses an empty text block before the first typed character can reach a neighbor', async () => {
    const editor = Editor.make().use(commonmark).use(gfm);
    await editor.create();
    const view = editor.ctx.get(editorViewCtx);

    try {
      const { paragraph } = view.state.schema.nodes;
      const before = paragraph.create(null, view.state.schema.text('before'));
      const empty = paragraph.create();
      const after = paragraph.create(null, view.state.schema.text('after'));
      const emptyPos = before.nodeSize;
      const tr = view.state.tr.replaceWith(
        0,
        view.state.doc.content.size,
        [before, empty, after],
      );
      view.dispatch(tr.setSelection(TextSelection.create(tr.doc, emptyPos + empty.nodeSize + 1)));

      const event = new MouseEvent('mousedown', { button: 0, cancelable: true });
      const stop = startInsideBlockTrailingPlainClickSession(view, event, {
        blockFrom: emptyPos,
        targetPos: emptyPos + 1,
        bias: -1,
      });

      expect(event.defaultPrevented).toBe(true);
      expect(view.state.selection.from).toBe(emptyPos + 1);
      stop();
    } finally {
      await editor.destroy();
    }
  });
});
