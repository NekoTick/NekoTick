import { Selection, TextSelection } from '@milkdown/kit/prose/state';
import { describe, expect, it, vi } from 'vitest';
import {
  applyBlankAreaPlainClickSelection,
  resolveBlankAreaPlainClickAction,
  resolveInsideBlockTrailingPlainClickAction,
} from './blankAreaPlainClick';

describe('resolveBlankAreaPlainClickAction', () => {
  const blockRects = [
    { from: 0, to: 5, left: 100, right: 420, top: 40, bottom: 64 },
    { from: 6, to: 14, left: 120, right: 460, top: 84, bottom: 112 },
    { from: 15, to: 21, left: 100, right: 420, top: 132, bottom: 156 },
  ];

  it('focuses the nearest block start when clicking in the left blank area', () => {
    expect(
      resolveBlankAreaPlainClickAction({
        blockRects,
        clientX: 36,
        clientY: 92,
      })
    ).toEqual({
      targetPos: 7,
      bias: 1,
      blockFrom: 6,
    });
  });

  it('focuses the nearest block end when clicking in the right blank area', () => {
    expect(
      resolveBlankAreaPlainClickAction({
        blockRects,
        clientX: 720,
        clientY: 92,
      })
    ).toEqual({
      targetPos: 13,
      bias: -1,
      blockFrom: 6,
    });
  });

  it('uses content bounds instead of the full block hit area for right-side blank clicks', () => {
    expect(
      resolveBlankAreaPlainClickAction({
        blockRects: [
          {
            from: 0,
            to: 8,
            left: 20,
            right: 620,
            contentLeft: 100,
            contentRight: 180,
            top: 40,
            bottom: 64,
          },
        ],
        clientX: 260,
        clientY: 52,
      })
    ).toEqual({
      targetPos: 7,
      bias: -1,
      blockFrom: 0,
    });
  });

  it('uses the clicked visual line bounds for right-side blank clicks in wrapped blocks', () => {
    expect(
      resolveBlankAreaPlainClickAction({
        blockRects: [
          {
            from: 1,
            to: 38,
            left: 20,
            right: 900,
            contentLeft: 398,
            contentRight: 840,
            contentLineRects: [
              { left: 398, top: 436, right: 840, bottom: 456 },
              { left: 398, top: 461, right: 517, bottom: 481 },
            ],
            top: 434,
            bottom: 484,
          },
        ],
        clientX: 613,
        clientY: 483,
      })
    ).toEqual({
      targetPos: 37,
      bias: -1,
      blockFrom: 1,
    });
  });

  it('uses exact inline line boundaries for hard-break paragraph blocks', () => {
    expect(
      resolveBlankAreaPlainClickAction({
        blockRects: [
          {
            from: 66,
            to: 96,
            caretRange: { from: 66, to: 96 },
            left: 388,
            right: 849,
            contentLeft: 388,
            contentRight: 460,
            contentLineRects: [
              { left: 388, top: 607, right: 460, bottom: 642 },
            ],
            top: 607,
            bottom: 642,
          },
        ],
        clientX: 546,
        clientY: 636,
      })
    ).toEqual({
      targetPos: 96,
      bias: -1,
      blockFrom: 66,
    });
  });

  it('chooses the nearest visual line when line slack overlaps', () => {
    expect(
      resolveBlankAreaPlainClickAction({
        blockRects: [
          {
            from: 1,
            to: 38,
            left: 20,
            right: 900,
            contentLeft: 398,
            contentRight: 840,
            contentLineRects: [
              { left: 398, top: 436, right: 840, bottom: 456 },
              { left: 398, top: 459, right: 517, bottom: 479 },
            ],
            top: 434,
            bottom: 482,
          },
        ],
        clientX: 613,
        clientY: 459,
      })
    ).toEqual({
      targetPos: 37,
      bias: -1,
      blockFrom: 1,
    });
  });

  it('prefers the later block when a list rect overlaps the following blank paragraph', () => {
    expect(
      resolveBlankAreaPlainClickAction({
        blockRects: [
          {
            from: 1,
            to: 12,
            left: 40,
            right: 620,
            contentLeft: 96,
            contentRight: 180,
            top: 80,
            bottom: 128,
          },
          {
            from: 13,
            to: 15,
            left: 40,
            right: 620,
            contentLeft: 40,
            contentRight: 620,
            top: 104,
            bottom: 128,
          },
        ],
        clientX: 44,
        clientY: 116,
      })
    ).toEqual({
      targetPos: 14,
      bias: 1,
      blockFrom: 13,
    });
  });

  it('prefers a later block whose visible inline text overflows into the clicked row', () => {
    expect(
      resolveBlankAreaPlainClickAction({
        blockRects: [
          { from: 10, to: 18, left: 40, right: 620, top: 340, bottom: 365 },
          {
            from: 20,
            to: 32,
            left: 40,
            right: 620,
            contentLineRects: [{ left: 100, top: 352, right: 200, bottom: 367 }],
            top: 365,
            bottom: 390,
          },
        ],
        clientX: 720,
        clientY: 362,
      })
    ).toEqual({
      targetPos: 31,
      bias: -1,
      blockFrom: 20,
    });
  });

  it('falls back to the first block when clicking above all blocks', () => {
    expect(
      resolveBlankAreaPlainClickAction({
        blockRects,
        clientX: 24,
        clientY: 8,
      })
    ).toEqual({
      targetPos: 1,
      bias: 1,
      blockFrom: 0,
    });
  });

  it('returns null when there are no selectable blocks', () => {
    expect(
      resolveBlankAreaPlainClickAction({
        blockRects: [],
        clientX: 0,
        clientY: 0,
      })
    ).toBeNull();
  });
});

describe('resolveInsideBlockTrailingPlainClickAction', () => {
  it('focuses the block end when clicking inside a wide list item after its text content', () => {
    expect(
      resolveInsideBlockTrailingPlainClickAction({
        blockRects: [
          {
            from: 4,
            to: 12,
            left: 40,
            right: 620,
            contentLeft: 96,
            contentRight: 180,
            top: 80,
            bottom: 104,
            allowInsideTrailingClick: true,
          },
        ],
        clientX: 320,
        clientY: 92,
      })
    ).toEqual({
      targetPos: 11,
      bias: -1,
      blockFrom: 4,
    });
  });

  it('focuses a paragraph end when clicking trailing blank space after its inline content', () => {
    expect(
      resolveInsideBlockTrailingPlainClickAction({
        blockRects: [
          {
            from: 0,
            to: 8,
            left: 40,
            right: 620,
            contentLeft: 96,
            contentRight: 180,
            top: 80,
            bottom: 104,
            allowInsideTrailingClick: true,
          },
          {
            from: 8,
            to: 16,
            left: 40,
            right: 620,
            contentLeft: 96,
            contentRight: 220,
            top: 116,
            bottom: 140,
            allowInsideTrailingClick: true,
          },
        ],
        clientX: 320,
        clientY: 92,
      })
    ).toEqual({
      targetPos: 7,
      bias: -1,
      blockFrom: 0,
    });
  });

  it('leaves normal text clicks to the editor native handler', () => {
    expect(
      resolveInsideBlockTrailingPlainClickAction({
        blockRects: [
          {
            from: 4,
            to: 12,
            left: 40,
            right: 620,
            contentLeft: 96,
            contentRight: 180,
            top: 80,
            bottom: 104,
            allowInsideTrailingClick: true,
          },
        ],
        clientX: 160,
        clientY: 92,
      })
    ).toBeNull();
  });

  it('leaves clicks near the text end to the editor native handler', () => {
    expect(
      resolveInsideBlockTrailingPlainClickAction({
        blockRects: [
          {
            from: 4,
            to: 12,
            left: 40,
            right: 620,
            contentLeft: 96,
            contentRight: 180,
            top: 80,
            bottom: 104,
            allowInsideTrailingClick: true,
          },
        ],
        clientX: 196,
        clientY: 92,
      })
    ).toBeNull();
  });

  it('focuses the previous list item end when clicking the right-side gap before the next item', () => {
    expect(
      resolveInsideBlockTrailingPlainClickAction({
        blockRects: [
          {
            from: 4,
            to: 12,
            left: 40,
            right: 620,
            contentLeft: 96,
            contentRight: 180,
            top: 80,
            bottom: 104,
            allowInsideTrailingClick: true,
          },
          {
            from: 12,
            to: 20,
            left: 40,
            right: 620,
            contentLeft: 96,
            contentRight: 220,
            top: 116,
            bottom: 140,
            allowInsideTrailingClick: true,
          },
        ],
        clientX: 320,
        clientY: 110,
      })
    ).toEqual({
      targetPos: 11,
      bias: -1,
      blockFrom: 4,
    });
  });

  it('uses the clicked visual line end for wrapped list item trailing space', () => {
    expect(
      resolveInsideBlockTrailingPlainClickAction({
        blockRects: [
          {
            from: 4,
            to: 24,
            left: 40,
            right: 620,
            contentLeft: 96,
            contentRight: 360,
            contentLineRects: [
              { left: 96, top: 80, right: 180, bottom: 100 },
              { left: 96, top: 104, right: 360, bottom: 124 },
            ],
            top: 80,
            bottom: 124,
            allowInsideTrailingClick: true,
          },
        ],
        clientX: 208,
        clientY: 90,
      })
    ).toEqual({
      targetPos: 23,
      bias: -1,
      blockFrom: 4,
    });
  });

  it('uses the clicked visual line start for list item leading space', () => {
    expect(
      resolveInsideBlockTrailingPlainClickAction({
        blockRects: [
          {
            from: 4,
            to: 24,
            left: 40,
            right: 620,
            contentLeft: 96,
            contentRight: 180,
            contentLineRects: [
              { left: 96, top: 80, right: 180, bottom: 100 },
            ],
            top: 80,
            bottom: 104,
            allowInsideTrailingClick: true,
          },
        ],
        clientX: 88,
        clientY: 90,
      })
    ).toEqual({
      targetPos: 5,
      bias: 1,
      blockFrom: 4,
    });
  });

  it('uses the clicked visual line start for the narrow task checkbox-to-text gap', () => {
    expect(
      resolveInsideBlockTrailingPlainClickAction({
        blockRects: [
          {
            from: 4,
            to: 24,
            left: 40,
            right: 620,
            contentLeft: 96,
            contentRight: 180,
            contentLineRects: [
              { left: 96, top: 80, right: 180, bottom: 100 },
            ],
            top: 80,
            bottom: 104,
            allowInsideTrailingClick: true,
          },
        ],
        clientX: 95,
        clientY: 90,
      })
    ).toEqual({
      targetPos: 5,
      bias: 1,
      blockFrom: 4,
    });
  });

  it('prefers a later visible line that overflows into an earlier blank block', () => {
    expect(
      resolveInsideBlockTrailingPlainClickAction({
        blockRects: [
          {
            from: 10,
            to: 12,
            left: 40,
            right: 620,
            contentLeft: 96,
            contentRight: 96,
            top: 340,
            bottom: 365,
            allowInsideTrailingClick: true,
          },
          {
            from: 12,
            to: 30,
            caretRange: { from: 13, to: 29 },
            left: 40,
            right: 620,
            contentLeft: 96,
            contentRight: 220,
            contentLineRects: [
              { left: 96, top: 352, right: 220, bottom: 367 },
            ],
            top: 365,
            bottom: 390,
            allowInsideTrailingClick: true,
          },
        ],
        clientX: 320,
        clientY: 362,
      })
    ).toEqual({
      targetPos: 29,
      bias: -1,
      blockFrom: 12,
    });
  });

  it('leaves left-side list item gaps to the editor native handler', () => {
    expect(
      resolveInsideBlockTrailingPlainClickAction({
        blockRects: [
          {
            from: 4,
            to: 12,
            left: 40,
            right: 620,
            contentLeft: 96,
            contentRight: 180,
            top: 80,
            bottom: 104,
            allowInsideTrailingClick: true,
          },
          {
            from: 12,
            to: 20,
            left: 40,
            right: 620,
            contentLeft: 96,
            contentRight: 220,
            top: 116,
            bottom: 140,
            allowInsideTrailingClick: true,
          },
        ],
        clientX: 120,
        clientY: 110,
      })
    ).toBeNull();
  });

  it('focuses regular paragraph ends when paragraph trailing clicks are enabled', () => {
    expect(
      resolveInsideBlockTrailingPlainClickAction({
        blockRects: [
          {
            from: 4,
            to: 12,
            left: 40,
            right: 620,
            contentLeft: 96,
            contentRight: 180,
            top: 80,
            bottom: 104,
            allowInsideTrailingClick: true,
          },
        ],
        clientX: 320,
        clientY: 92,
      })
    ).toEqual({
      targetPos: 11,
      bias: -1,
      blockFrom: 4,
    });
  });

  it('uses the exact final inline line end for paragraph trailing clicks', () => {
    expect(
      resolveInsideBlockTrailingPlainClickAction({
        blockRects: [
          {
            from: 106,
            to: 112,
            caretRange: { from: 106, to: 112 },
            left: 388,
            right: 849,
            contentLeft: 388,
            contentRight: 562,
            top: 792,
            bottom: 827,
            allowInsideTrailingClick: true,
          },
        ],
        clientX: 643,
        clientY: 817,
      })
    ).toEqual({
      targetPos: 112,
      bias: -1,
      blockFrom: 106,
    });
  });

  it('uses the caret range for the clicked hard-break line when line rects share one paragraph', () => {
    const sharedLineRects = [
      { left: 388, top: 607, right: 460, bottom: 642 },
      { left: 388, top: 650, right: 512, bottom: 685 },
    ];
    expect(
      resolveInsideBlockTrailingPlainClickAction({
        blockRects: [
          {
            from: 66,
            to: 73,
            caretRange: { from: 66, to: 72 },
            left: 388,
            right: 849,
            contentLeft: 388,
            contentRight: 512,
            contentLineRects: sharedLineRects,
            top: 607,
            bottom: 642,
            allowInsideTrailingClick: true,
          },
          {
            from: 73,
            to: 81,
            caretRange: { from: 73, to: 80 },
            left: 388,
            right: 849,
            contentLeft: 388,
            contentRight: 512,
            contentLineRects: sharedLineRects,
            top: 650,
            bottom: 685,
            allowInsideTrailingClick: true,
          },
        ],
        clientX: 600,
        clientY: 668,
      })
    ).toEqual({
      targetPos: 80,
      bias: -1,
      blockFrom: 73,
    });
  });

  it('keeps a first hard-break line click on its own caret range when line rects are shared', () => {
    const sharedLineRects = [
      { left: 388, top: 607, right: 460, bottom: 642 },
      { left: 388, top: 650, right: 512, bottom: 685 },
    ];
    expect(
      resolveInsideBlockTrailingPlainClickAction({
        blockRects: [
          {
            from: 66,
            to: 73,
            caretRange: { from: 66, to: 72 },
            left: 388,
            right: 849,
            contentLeft: 388,
            contentRight: 512,
            contentLineRects: sharedLineRects,
            top: 607,
            bottom: 642,
            allowInsideTrailingClick: true,
          },
          {
            from: 73,
            to: 81,
            caretRange: { from: 73, to: 80 },
            left: 388,
            right: 849,
            contentLeft: 388,
            contentRight: 512,
            contentLineRects: sharedLineRects,
            top: 650,
            bottom: 685,
            allowInsideTrailingClick: true,
          },
        ],
        clientX: 600,
        clientY: 624,
      })
    ).toEqual({
      targetPos: 72,
      bias: -1,
      blockFrom: 66,
    });
  });
});

describe('applyBlankAreaPlainClickSelection', () => {
  it('places list item right-side blank clicks at the head paragraph end, not nested child end', () => {
    const selection = Object.create(TextSelection.prototype);
    const setSelection = vi.fn().mockImplementation(() => tr);
    const createSpy = vi.spyOn(TextSelection, 'create').mockReturnValue(selection as any);
    const nearSpy = vi.spyOn(Selection, 'near');
    const tr = {
      doc: {
        content: { size: 100 },
        nodeAt: vi.fn().mockReturnValue({
          type: { name: 'list_item' },
          firstChild: {
            type: { name: 'paragraph' },
            isTextblock: true,
            inlineContent: true,
            content: { size: 18 },
          },
        }),
      },
      setSelection,
    } as any;

    applyBlankAreaPlainClickSelection(tr, {
      targetPos: 99,
      bias: -1,
      blockFrom: 4,
    });

    expect(createSpy).toHaveBeenCalledWith(tr.doc, 24);
    expect(setSelection).toHaveBeenCalledWith(selection);
    expect(nearSpy).not.toHaveBeenCalled();
    createSpy.mockRestore();
    nearSpy.mockRestore();
  });

  it('places list item left-side blank clicks at the head paragraph start', () => {
    const selection = Object.create(TextSelection.prototype);
    const setSelection = vi.fn().mockImplementation(() => tr);
    const createSpy = vi.spyOn(TextSelection, 'create').mockReturnValue(selection as any);
    const nearSpy = vi.spyOn(Selection, 'near');
    const tr = {
      doc: {
        content: { size: 100 },
        nodeAt: vi.fn().mockReturnValue({
          type: { name: 'list_item' },
          firstChild: {
            type: { name: 'paragraph' },
            isTextblock: true,
            inlineContent: true,
            content: { size: 18 },
          },
        }),
      },
      setSelection,
    } as any;

    applyBlankAreaPlainClickSelection(tr, {
      targetPos: 5,
      bias: 1,
      blockFrom: 4,
    });

    expect(createSpy).toHaveBeenCalledWith(tr.doc, 6);
    expect(setSelection).toHaveBeenCalledWith(selection);
    expect(nearSpy).not.toHaveBeenCalled();
    createSpy.mockRestore();
    nearSpy.mockRestore();
  });

  it('clamps the requested position into the current document before resolving selection', () => {
    const resolved = { pos: 10, parent: { inlineContent: false } };
    const selection = { from: 10, to: 10, empty: true };
    const setSelection = vi.fn().mockImplementation(() => tr);
    const resolve = vi.fn().mockReturnValue(resolved);
    const nearSpy = vi.spyOn(Selection, 'near').mockReturnValue(selection as any);
    const tr = {
      doc: {
        content: { size: 10 },
        nodeAt: vi.fn().mockReturnValue({ type: { name: 'paragraph' } }),
        resolve,
      },
      setSelection,
    } as any;

    applyBlankAreaPlainClickSelection(tr, {
      targetPos: 99,
      bias: -1,
      blockFrom: 0,
    });

    expect(resolve).toHaveBeenCalledWith(10);
    expect(nearSpy).toHaveBeenCalledWith(resolved, -1);
    expect(setSelection).toHaveBeenCalledWith(selection);
    nearSpy.mockRestore();
  });

  it('keeps exact inline caret positions instead of resolving one character backward', () => {
    const selection = Object.create(TextSelection.prototype);
    const setSelection = vi.fn().mockImplementation(() => tr);
    const createSpy = vi.spyOn(TextSelection, 'create').mockReturnValue(selection as any);
    const nearSpy = vi.spyOn(Selection, 'near');
    const tr = {
      doc: {
        content: { size: 120 },
        nodeAt: vi.fn().mockReturnValue({ type: { name: 'paragraph' } }),
        resolve: vi.fn().mockReturnValue({ parent: { inlineContent: true } }),
      },
      setSelection,
    } as any;

    applyBlankAreaPlainClickSelection(tr, {
      targetPos: 112,
      bias: -1,
      blockFrom: 106,
    });

    expect(createSpy).toHaveBeenCalledWith(tr.doc, 112);
    expect(setSelection).toHaveBeenCalledWith(selection);
    expect(nearSpy).not.toHaveBeenCalled();
    createSpy.mockRestore();
    nearSpy.mockRestore();
  });

  it('moves atomic diagram side clicks to nearby text instead of selecting the diagram node', () => {
    const textSelection = Object.create(TextSelection.prototype);
    const setSelection = vi.fn().mockImplementation(() => tr);
    const blockStart = { pos: 5 };
    const blockEnd = { pos: 6 };
    const findFromSpy = vi.spyOn(Selection, 'findFrom')
      .mockReturnValueOnce(textSelection)
      .mockReturnValueOnce(null);
    const tr = {
      doc: {
        content: { size: 10 },
        nodeAt: vi.fn().mockReturnValue({ type: { name: 'mermaid' }, nodeSize: 1 }),
        resolve: vi.fn()
          .mockReturnValueOnce(blockStart)
          .mockReturnValueOnce(blockEnd),
      },
      setSelection,
    } as any;

    applyBlankAreaPlainClickSelection(tr, {
      targetPos: 6,
      bias: 1,
      blockFrom: 5,
    });

    expect(findFromSpy).toHaveBeenCalledWith(blockStart, -1, true);
    expect(setSelection).toHaveBeenCalledWith(textSelection);
    findFromSpy.mockRestore();
  });

  it('does not create a node selection for atomic diagram side clicks when no text cursor is nearby', () => {
    const setSelection = vi.fn().mockImplementation(() => tr);
    const findFromSpy = vi.spyOn(Selection, 'findFrom').mockReturnValue(null);
    const tr = {
      doc: {
        content: { size: 10 },
        nodeAt: vi.fn().mockReturnValue({ type: { name: 'math_block' }, nodeSize: 1 }),
        resolve: vi.fn().mockReturnValue({}),
      },
      setSelection,
    } as any;

    expect(applyBlankAreaPlainClickSelection(tr, {
      targetPos: 6,
      bias: 1,
      blockFrom: 5,
    })).toBe(tr);

    expect(findFromSpy).toHaveBeenCalledTimes(2);
    expect(setSelection).not.toHaveBeenCalled();
    findFromSpy.mockRestore();
  });
});
