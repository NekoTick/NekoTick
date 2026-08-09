import { afterEach, describe, expect, it, vi } from 'vitest';
import { Selection } from '@milkdown/kit/prose/state';
import {
  isClickInBottomBlankSpace,
  isCursorAtCodeBlockEnd,
  isSelectionFullyInsideNode,
  moveSelectionAfterNode,
} from './codeBlockSelectionUtils';

describe('isCursorAtCodeBlockEnd', () => {
  it('returns true when cursor is collapsed at code block end', () => {
    const selection = {
      empty: true,
      from: 10,
      to: 10,
      $from: {
        parent: { type: { name: 'code_block' }, content: { size: 8 } },
        parentOffset: 8,
      },
    } as const;

    expect(isCursorAtCodeBlockEnd(selection as never)).toBe(true);
  });

  it('returns false for non-code blocks or non-end positions', () => {
    const notCodeSelection = {
      empty: true,
      from: 10,
      to: 10,
      $from: {
        parent: { type: { name: 'paragraph' }, content: { size: 8 } },
        parentOffset: 8,
      },
    } as const;

    const notEndSelection = {
      empty: true,
      from: 10,
      to: 10,
      $from: {
        parent: { type: { name: 'code_block' }, content: { size: 8 } },
        parentOffset: 3,
      },
    } as const;

    expect(isCursorAtCodeBlockEnd(notCodeSelection as never)).toBe(false);
    expect(isCursorAtCodeBlockEnd(notEndSelection as never)).toBe(false);
  });
});

describe('isSelectionFullyInsideNode', () => {
  it('returns true only when selection is fully inside node content range', () => {
    expect(isSelectionFullyInsideNode({ from: 11, to: 18 }, 10, 10)).toBe(true);
    expect(isSelectionFullyInsideNode({ from: 10, to: 18 }, 10, 10)).toBe(false);
    expect(isSelectionFullyInsideNode({ from: 11, to: 20 }, 10, 10)).toBe(false);
  });
});

describe('moveSelectionAfterNode', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function createMockTransaction(options: {
    docSize: number;
    hasParagraph: boolean;
  }) {
    const paragraphFactory = options.hasParagraph
      ? { create: () => ({ type: 'paragraph' }) }
      : undefined;

    const tr: any = {
      doc: {
        content: { size: options.docSize },
        type: { schema: { nodes: { paragraph: paragraphFactory } } },
        resolve: (pos: number) => ({ pos }),
      },
      insert: vi.fn((pos: number) => {
        tr.lastInsertPos = pos;
        return tr;
      }),
      setSelection: vi.fn((selection: unknown) => {
        tr.lastSelection = selection;
        return tr;
      }),
    };

    return tr;
  }

  it('moves selection directly after node when document has following content', () => {
    const nearSpy = vi
      .spyOn(Selection, 'near')
      .mockImplementation((resolvedPos: any, bias?: number) => ({ resolvedPos, bias }) as any);
    const tr = createMockTransaction({ docSize: 100, hasParagraph: true });

    moveSelectionAfterNode(tr, 10, 10);

    expect(tr.insert).not.toHaveBeenCalled();
    expect(nearSpy).toHaveBeenCalledWith({ pos: 20 }, 1);
    expect(tr.setSelection).toHaveBeenCalledTimes(1);
  });

  it('inserts paragraph and moves selection when node is at document end', () => {
    const nearSpy = vi
      .spyOn(Selection, 'near')
      .mockImplementation((resolvedPos: any, bias?: number) => ({ resolvedPos, bias }) as any);
    const tr = createMockTransaction({ docSize: 20, hasParagraph: true });

    moveSelectionAfterNode(tr, 10, 10);

    expect(tr.insert).toHaveBeenCalledWith(20, { type: 'paragraph' });
    expect(nearSpy).toHaveBeenCalledWith({ pos: 21 }, 1);
    expect(tr.setSelection).toHaveBeenCalledTimes(1);
  });

  it('falls back near node start when paragraph type is unavailable', () => {
    const nearSpy = vi
      .spyOn(Selection, 'near')
      .mockImplementation((resolvedPos: any, bias?: number) => ({ resolvedPos, bias }) as any);
    const tr = createMockTransaction({ docSize: 20, hasParagraph: false });

    moveSelectionAfterNode(tr, 10, 10);

    expect(tr.insert).not.toHaveBeenCalled();
    expect(nearSpy).toHaveBeenCalledWith({ pos: 10 }, -1);
    expect(tr.setSelection).toHaveBeenCalledTimes(1);
  });
});

describe('isClickInBottomBlankSpace', () => {
  it('returns true only when click is below the last rendered block', () => {
    const root = document.createElement('div');
    const child = document.createElement('div');
    root.appendChild(child);

    vi.spyOn(child, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 100,
      height: 100,
      right: 100,
      bottom: 100,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });

    expect(isClickInBottomBlankSpace(root, 100)).toBe(false);
    expect(isClickInBottomBlankSpace(root, 101)).toBe(true);
  });

  it('returns false when editor has no rendered block', () => {
    const root = document.createElement('div');
    expect(isClickInBottomBlankSpace(root, 999)).toBe(false);
  });

  it('uses the last visible block when collapsed heading content reaches the document tail', () => {
    const root = document.createElement('div');
    const visible = document.createElement('h2');
    const collapsed = document.createElement('ul');
    visible.getBoundingClientRect = () => ({ bottom: 100 } as DOMRect);
    collapsed.className = 'heading-collapsed-content';
    collapsed.getBoundingClientRect = () => {
      throw new Error('Collapsed tail blocks should not be measured');
    };
    root.append(visible, collapsed);

    expect(isClickInBottomBlankSpace(root, 90)).toBe(false);
    expect(isClickInBottomBlankSpace(root, 110)).toBe(true);
  });
});
