import { Selection } from '@milkdown/kit/prose/state';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createCollapsedCodeBlockSelectionGuardTransaction,
  findCodeBlockContext,
  shouldDeferPassiveCodeMirrorInitialization,
} from './codeBlockProsePlugins';

describe('codeBlockProsePlugins', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('finds the nearest code block context from the selection depth', () => {
    const codeBlockNode = { type: { name: 'code_block' } };
    const paragraphNode = { type: { name: 'paragraph' } };
    const state = {
      selection: {
        $from: {
          depth: 2,
          node: vi.fn((depth: number) => (depth === 2 ? paragraphNode : codeBlockNode)),
          before: vi.fn(() => 10),
        },
      },
    };

    expect(findCodeBlockContext(state as never)).toEqual({
      node: codeBlockNode,
      pos: 10,
    });
  });

  it('defers passive CodeMirror initialization only for code-dense documents', () => {
    const createDoc = (codeBlockCount: number) => ({
      descendants: (callback: (node: { type: { name: string } }) => boolean) => {
        Array.from({ length: codeBlockCount }, () => ({ type: { name: 'code_block' } }))
          .forEach(callback);
      },
    });

    expect(shouldDeferPassiveCodeMirrorInitialization(createDoc(39) as never)).toBe(false);
    expect(shouldDeferPassiveCodeMirrorInitialization(createDoc(40) as never)).toBe(true);
  });

  it('creates a redirect transaction when selection lands inside a collapsed code block', () => {
    const nearSpy = vi
      .spyOn(Selection, 'near')
      .mockReturnValue({ type: 'selection' } as never);
    const tr = {
      doc: {
        content: { size: 20 },
        type: { schema: { nodes: { paragraph: { create: () => ({ type: 'paragraph' }) } } } },
        resolve: (pos: number) => ({ pos }),
      },
      insert: vi.fn(() => tr),
      setSelection: vi.fn(() => tr),
      scrollIntoView: vi.fn(() => tr),
    };
    const codeBlockNode = {
      type: { name: 'code_block' },
      attrs: { collapsed: true },
      nodeSize: 10,
    };
    const state = {
      selection: {
        $from: {
          depth: 1,
          node: vi.fn(() => codeBlockNode),
          before: vi.fn(() => 10),
        },
      },
      tr,
    };

    expect(createCollapsedCodeBlockSelectionGuardTransaction(state as never)).toBe(tr);
    expect(nearSpy).toHaveBeenCalled();
    expect(tr.setSelection).toHaveBeenCalledWith({ type: 'selection' });
    expect(tr.scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it('returns null when selection is not inside a collapsed code block', () => {
    const state = {
      selection: {
        $from: {
          depth: 1,
          node: vi.fn(() => ({
            type: { name: 'code_block' },
            attrs: { collapsed: false },
            nodeSize: 10,
          })),
          before: vi.fn(() => 10),
        },
      },
      tr: {},
    };

    expect(createCollapsedCodeBlockSelectionGuardTransaction(state as never)).toBeNull();
  });
});
