import { describe, expect, it, vi } from 'vitest';

vi.mock('@milkdown/kit/prose/state', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@milkdown/kit/prose/state')>();
  return {
    ...actual,
    Plugin: class {
      constructor(public spec: unknown) {}
    },
    AllSelection: class {
      static create = vi.fn(() => new this());
    },
  };
});

import { handleEditorSelectAll } from './selectAllPlugin';
import { AllSelection } from '@milkdown/kit/prose/state';

describe('handleEditorSelectAll', () => {
  it('dispatches an editor-wide selection for Mod-a', () => {
    const transaction = {};
    const setSelection = vi.fn(() => transaction);
    const view = {
      dom: document.createElement('div'),
      state: {
        doc: {
          content: {
            size: 10,
          },
        },
        selection: {
          from: 1,
          to: 1,
          empty: true,
          constructor: { name: 'TextSelection' },
        },
        tr: {
          setSelection,
        },
      },
      dispatch: vi.fn(),
      focus: vi.fn(),
    } as any;
    const event = {
      key: 'a',
      ctrlKey: true,
      metaKey: false,
      altKey: false,
      shiftKey: false,
      preventDefault: vi.fn(),
    } as any;

    expect(handleEditorSelectAll(view, event)).toBe(true);
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(setSelection).toHaveBeenCalledTimes(1);
    expect(view.dispatch).toHaveBeenCalledWith(transaction);
    expect(view.focus).toHaveBeenCalledTimes(1);
  });

  it('ignores non-select-all shortcuts', () => {
    const view = {
      dom: document.createElement('div'),
      state: {
        selection: {
          from: 1,
          to: 1,
          empty: true,
          constructor: { name: 'TextSelection' },
        },
      },
      dispatch: vi.fn(),
      focus: vi.fn(),
    } as any;
    const event = {
      key: 'b',
      ctrlKey: true,
      metaKey: false,
      altKey: false,
      shiftKey: false,
      preventDefault: vi.fn(),
    } as any;

    expect(handleEditorSelectAll(view, event)).toBe(false);
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it('does not refocus a large editor after selecting all', () => {
    const transaction = {};
    const selection = Object.assign(new AllSelection({}), {
      empty: false,
      from: 0,
      to: 100_001,
    });
    const setSelection = vi.fn(() => {
      view.state.selection = selection;
      return transaction;
    });
    const view = {
      dom: document.createElement('div'),
      state: {
        doc: { content: { size: 100_001 } },
        selection: { empty: true, from: 1, to: 1 },
        tr: { setSelection },
      },
      dispatch: vi.fn(),
      focus: vi.fn(),
    } as any;
    const event = {
      key: 'a',
      ctrlKey: true,
      metaKey: false,
      altKey: false,
      shiftKey: false,
      preventDefault: vi.fn(),
    } as any;

    expect(handleEditorSelectAll(view, event)).toBe(true);
    expect(view.focus).not.toHaveBeenCalled();
  });

  it('leaves composing Mod-a to the input method', () => {
    const view = {
      dom: document.createElement('div'),
      state: {
        doc: {
          content: {
            size: 10,
          },
        },
        tr: {
          setSelection: vi.fn(),
        },
      },
      dispatch: vi.fn(),
      focus: vi.fn(),
    } as any;
    const event = {
      key: 'a',
      ctrlKey: true,
      metaKey: false,
      altKey: false,
      shiftKey: false,
      isComposing: true,
      preventDefault: vi.fn(),
    } as any;

    expect(handleEditorSelectAll(view, event)).toBe(false);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(view.dispatch).not.toHaveBeenCalled();
  });
});
