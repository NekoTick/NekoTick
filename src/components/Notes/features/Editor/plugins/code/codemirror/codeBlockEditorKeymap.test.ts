import { afterEach, describe, expect, it, vi } from 'vitest';

const blockSelectionMocks = vi.hoisted(() => ({
  deleteSelectedBlocks: vi.fn(() => true),
  writeTextToClipboard: vi.fn(() => Promise.resolve(true)),
  getBlockSelectionPluginState: vi.fn(() => ({ selectedBlocks: [] })),
  blankAreaDragBoxPluginKey: { key: 'blank-area-drag-box' },
  clearBlocksAction: { type: 'clear-blocks' },
}));

vi.mock('@milkdown/kit/prose/state', () => ({
  TextSelection: {
    near: vi.fn(() => 'text-selection'),
    create: vi.fn(() => 'created-text-selection'),
  },
  AllSelection: {
    create: vi.fn(() => 'all-selection'),
  },
}));

vi.mock('../../cursor/blockSelectionCommands', () => ({
  deleteSelectedBlocks: blockSelectionMocks.deleteSelectedBlocks,
  writeTextToClipboard: blockSelectionMocks.writeTextToClipboard,
}));

vi.mock('../../cursor/blockSelectionPluginState', () => ({
  blankAreaDragBoxPluginKey: blockSelectionMocks.blankAreaDragBoxPluginKey,
  CLEAR_BLOCKS_ACTION: blockSelectionMocks.clearBlocksAction,
  getBlockSelectionPluginState: blockSelectionMocks.getBlockSelectionPluginState,
}));

import {
  createCodeBlockEditorClipboardHandlers,
  createCodeBlockEditorKeymap,
} from './codeBlockEditorKeymap';

describe('createCodeBlockEditorKeymap', () => {
  afterEach(() => {
    vi.clearAllMocks();
    blockSelectionMocks.writeTextToClipboard.mockResolvedValue(true);
  });

  it('deletes the outer block selection before CodeMirror handles Backspace', () => {
    const selectedBlocks = [{ from: 4, to: 10 }];
    blockSelectionMocks.getBlockSelectionPluginState.mockReturnValueOnce({ selectedBlocks } as never);
    const focus = vi.fn();
    const view = {
      state: { id: 'state' },
      dom: document.createElement('div'),
      focus,
    };

    const keymaps = createCodeBlockEditorKeymap({
      getCodeMirror: () => ({}) as never,
      view: view as never,
      getNode: () => ({}) as never,
      getPos: () => 0,
    });

    const backspace = keymaps.find((binding) => binding.key === 'Backspace');

    expect(backspace?.run?.({} as never)).toBe(true);
    expect(blockSelectionMocks.deleteSelectedBlocks).toHaveBeenCalledWith(
      view,
      selectedBlocks,
      expect.any(Function)
    );
    expect(focus).not.toHaveBeenCalled();
  });

  it('deletes a leading empty line in a multiline code block on Backspace', () => {
    const dispatch = vi.fn();
    const focus = vi.fn();
    const cm = {
      dispatch,
      focus,
      state: {
        doc: {
          lines: 2,
          line: vi.fn((lineNumber: number) => (
            lineNumber === 1
              ? { from: 0, to: 0, length: 0, text: '' }
              : { from: 1, to: 5, length: 4, text: 'code' }
          )),
        },
        selection: {
          ranges: [
            {
              from: 0,
              to: 0,
              anchor: 0,
              head: 0,
              empty: true,
            },
          ],
        },
      },
    };

    const keymaps = createCodeBlockEditorKeymap({
      getCodeMirror: () => cm as never,
      view: { state: { id: 'state' } } as never,
      getNode: () => ({}) as never,
      getPos: () => 0,
    });

    const backspaces = keymaps.filter((binding) => binding.key === 'Backspace');

    expect(backspaces[0]?.run?.({} as never)).toBe(false);
    expect(backspaces[1]?.run?.({} as never)).toBe(true);
    expect(cm.state.doc.line).toHaveBeenCalledWith(1);
    expect(cm.state.doc.line).toHaveBeenCalledWith(2);
    expect(dispatch).toHaveBeenCalledWith({
      changes: { from: 0, to: 1, insert: '' },
      selection: { anchor: 4, head: 4 },
    });
    expect(focus).toHaveBeenCalledTimes(1);
  });

  it('leaves modified vertical arrows to the platform selection behavior', () => {
    const keymaps = createCodeBlockEditorKeymap({
      getCodeMirror: () => ({}) as never,
      view: { state: { id: 'state' } } as never,
      getNode: () => ({}) as never,
      getPos: () => 0,
    });

    const keys = keymaps.map((binding) => binding.key);
    expect(keys).not.toContain('Mod-ArrowUp');
    expect(keys).not.toContain('Mod-ArrowDown');
    expect(keys).not.toContain('Ctrl-ArrowUp');
    expect(keys).not.toContain('Ctrl-ArrowDown');
    expect(keys).not.toContain('Ctrl-Shift-ArrowUp');
    expect(keys).not.toContain('Ctrl-Shift-ArrowDown');
    expect(keys).not.toContain('Shift-Ctrl-ArrowUp');
    expect(keys).not.toContain('Shift-Ctrl-ArrowDown');
  });

  it('selects all content inside CodeMirror on Mod-a', () => {
    const dispatch = vi.fn();
    const focus = vi.fn();
    const cm = {
      dispatch,
      focus,
      state: {
        doc: {
          length: 12,
        },
        selection: {
          main: {
            from: 2,
            to: 4,
          },
        },
      },
    };

    const keymaps = createCodeBlockEditorKeymap({
      getCodeMirror: () => cm as never,
      view: {
        state: {
          selection: {
            from: 2,
            to: 2,
            empty: true,
            constructor: { name: 'TextSelection' },
          },
        },
      } as never,
      getNode: () => ({}) as never,
      getPos: () => 0,
    });

    const selectAll = keymaps.find((binding) => binding.key === 'Mod-a');

    expect(selectAll?.run?.({} as never)).toBe(true);
    expect(dispatch).toHaveBeenCalledWith({
      selection: {
        anchor: 0,
        head: 12,
      },
    });
    expect(focus).toHaveBeenCalledTimes(1);
  });

  it('returns false for Mod-a when CodeMirror is unavailable', () => {
    const keymaps = createCodeBlockEditorKeymap({
      getCodeMirror: () => undefined,
      view: {
        state: {
          selection: {
            from: 2,
            to: 2,
            empty: true,
            constructor: { name: 'TextSelection' },
          },
        },
      } as never,
      getNode: () => ({}) as never,
      getPos: () => 0,
    });

    const selectAll = keymaps.find((binding) => binding.key === 'Mod-a');

    expect(selectAll?.run?.({} as never)).toBe(false);
  });

  it('escalates to editor-wide selection on the second Mod-a', () => {
    const cmFocus = vi.fn();
    const editorDispatch = vi.fn();
    const editorFocus = vi.fn();
    const transaction = {};
    const setSelection = vi.fn(() => transaction);
    const cm = {
      dispatch: vi.fn(),
      focus: cmFocus,
      state: {
        doc: {
          length: 12,
        },
        selection: {
          main: {
            from: 0,
            to: 12,
          },
        },
      },
    };

    const keymaps = createCodeBlockEditorKeymap({
      getCodeMirror: () => cm as never,
      view: {
        state: {
          selection: {
            from: 2,
            to: 2,
            empty: true,
            constructor: { name: 'TextSelection' },
          },
          doc: {},
          tr: {
            setSelection,
          },
        },
        dispatch: editorDispatch,
        focus: editorFocus,
      } as never,
      getNode: () => ({}) as never,
      getPos: () => 0,
    });

    const selectAll = keymaps.find((binding) => binding.key === 'Mod-a');

    expect(selectAll?.run?.({} as never)).toBe(true);
    expect(setSelection).toHaveBeenCalledTimes(1);
    expect(editorDispatch).toHaveBeenCalledWith(transaction);
    expect(editorFocus).toHaveBeenCalledTimes(1);
    expect(cm.dispatch).not.toHaveBeenCalled();
    expect(cmFocus).not.toHaveBeenCalled();
  });

  it('copies the CodeMirror selection and collapses mirrored selections after success', async () => {
    const cmDispatch = vi.fn();
    const editorDispatch = vi.fn();
    const editorFocus = vi.fn();
    const transaction = {
      scrollIntoView: vi.fn(() => transaction),
    };
    const setSelection = vi.fn(() => transaction);
    const cm = {
      dispatch: cmDispatch,
      state: {
        doc: {
          sliceString: (from: number, to: number) => '0123456789'.slice(from, to),
        },
        sliceDoc: (from: number, to: number) => '0123456789'.slice(from, to),
        selection: {
          main: {
            from: 2,
            to: 5,
            head: 5,
            empty: false,
          },
          ranges: [
            {
              from: 2,
              to: 5,
              empty: false,
            },
          ],
        },
      },
    };

    const keymaps = createCodeBlockEditorKeymap({
      getCodeMirror: () => cm as never,
      view: {
        state: {
          doc: {},
          tr: {
            setSelection,
          },
        },
        dispatch: editorDispatch,
        focus: editorFocus,
      } as never,
      getNode: () => ({ textContent: '0123456789' }) as never,
      getPos: () => 10,
    });

    const copy = keymaps.find((binding) => binding.key === 'Mod-c');

    expect(copy?.run?.({} as never)).toBe(true);
    await Promise.resolve();

    expect(blockSelectionMocks.writeTextToClipboard).toHaveBeenCalledWith('234');
    expect(cmDispatch).toHaveBeenCalledWith({
      selection: {
        anchor: 5,
        head: 5,
      },
    });
    expect(setSelection).toHaveBeenCalledWith('created-text-selection');
    expect(transaction.scrollIntoView).toHaveBeenCalledTimes(1);
    expect(editorDispatch).toHaveBeenCalledWith(transaction);
    expect(editorFocus).toHaveBeenCalledTimes(1);
  });

  it('does not collapse selections when CodeMirror copy fails', async () => {
    blockSelectionMocks.writeTextToClipboard.mockResolvedValueOnce(false);
    const cmDispatch = vi.fn();
    const editorDispatch = vi.fn();
    const cm = {
      dispatch: cmDispatch,
      state: {
        sliceDoc: (from: number, to: number) => '0123456789'.slice(from, to),
        selection: {
          main: { from: 2, to: 5, head: 5, empty: false },
          ranges: [{ from: 2, to: 5, empty: false }],
        },
      },
    };

    const keymaps = createCodeBlockEditorKeymap({
      getCodeMirror: () => cm as never,
      view: {
        state: { doc: {}, tr: { setSelection: vi.fn() } },
        dispatch: editorDispatch,
        focus: vi.fn(),
      } as never,
      getNode: () => ({ textContent: '0123456789' }) as never,
      getPos: () => 10,
    });

    const copy = keymaps.find((binding) => binding.key === 'Mod-c');

    expect(copy?.run?.({} as never)).toBe(true);
    await Promise.resolve();

    expect(cmDispatch).not.toHaveBeenCalled();
    expect(editorDispatch).not.toHaveBeenCalled();
  });

  it('cuts the CodeMirror selection only after clipboard write succeeds', async () => {
    const editorDispatch = vi.fn();
    const editorFocus = vi.fn();
    const cmFocus = vi.fn();
    const transaction = {
      scrollIntoView: vi.fn(() => transaction),
    };
    const setSelection = vi.fn(() => transaction);
    const selectionRange = { from: 2, to: 5, empty: false };
    const cm = {
      dispatch: vi.fn((spec: { changes?: unknown; range?: { from: number; to: number; empty: boolean; head: number } }) => {
        cm.state.selection.main = spec.range ?? { from: 2, to: 2, head: 2, empty: true };
      }),
      focus: cmFocus,
      state: {
        sliceDoc: (from: number, to: number) => '0123456789'.slice(from, to),
        changeByRange: vi.fn((callback: (range: typeof selectionRange) => unknown) => callback(selectionRange)),
        selection: {
          main: { from: 2, to: 5, head: 5, empty: false },
          ranges: [selectionRange],
        },
      },
    };

    const keymaps = createCodeBlockEditorKeymap({
      getCodeMirror: () => cm as never,
      view: {
        editable: true,
        state: {
          doc: {},
          tr: {
            setSelection,
          },
        },
        dispatch: editorDispatch,
        focus: editorFocus,
      } as never,
      getNode: () => ({ textContent: '0123456789' }) as never,
      getPos: () => 10,
    });

    const cut = keymaps.find((binding) => binding.key === 'Mod-x');

    expect(cut?.run?.({} as never)).toBe(true);
    await Promise.resolve();

    expect(blockSelectionMocks.writeTextToClipboard).toHaveBeenCalledWith('234');
    expect(cm.state.changeByRange).toHaveBeenCalledTimes(1);
    expect(cm.dispatch).toHaveBeenCalledWith({
      changes: { from: 2, to: 5, insert: '' },
      range: expect.objectContaining({ from: 2, to: 2 }),
    });
    expect(setSelection).toHaveBeenCalledWith('created-text-selection');
    expect(editorDispatch).toHaveBeenCalledWith(transaction);
    expect(editorFocus).not.toHaveBeenCalled();
    expect(cmFocus).toHaveBeenCalledTimes(1);
  });

  it('does not cut CodeMirror content when clipboard write fails', async () => {
    blockSelectionMocks.writeTextToClipboard.mockResolvedValueOnce(false);
    const cmDispatch = vi.fn();
    const cm = {
      dispatch: cmDispatch,
      state: {
        sliceDoc: (from: number, to: number) => '0123456789'.slice(from, to),
        changeByRange: vi.fn(),
        selection: {
          main: { from: 2, to: 5, head: 5, empty: false },
          ranges: [{ from: 2, to: 5, empty: false }],
        },
      },
    };
    const editorDispatch = vi.fn();

    const keymaps = createCodeBlockEditorKeymap({
      getCodeMirror: () => cm as never,
      view: {
        editable: true,
        state: { doc: {}, tr: { setSelection: vi.fn() } },
        dispatch: editorDispatch,
        focus: vi.fn(),
      } as never,
      getNode: () => ({ textContent: '0123456789' }) as never,
      getPos: () => 10,
    });

    const cut = keymaps.find((binding) => binding.key === 'Mod-x');

    expect(cut?.run?.({} as never)).toBe(true);
    await Promise.resolve();

    expect(cmDispatch).not.toHaveBeenCalled();
    expect(editorDispatch).not.toHaveBeenCalled();
  });

  it('does not cut CodeMirror content when the selection changes before clipboard write succeeds', async () => {
    let resolveClipboard: (didCopy: boolean) => void = () => undefined;
    blockSelectionMocks.writeTextToClipboard.mockReturnValueOnce(new Promise<boolean>((resolve) => {
      resolveClipboard = resolve;
    }));
    const cmDispatch = vi.fn();
    const cm = {
      dispatch: cmDispatch,
      state: {
        sliceDoc: (from: number, to: number) => '0123456789'.slice(from, to),
        changeByRange: vi.fn(),
        selection: {
          main: { from: 2, to: 5, head: 5, empty: false },
          ranges: [{ from: 2, to: 5, empty: false }],
        },
      },
    };
    const editorDispatch = vi.fn();

    const keymaps = createCodeBlockEditorKeymap({
      getCodeMirror: () => cm as never,
      view: {
        editable: true,
        state: { doc: {}, tr: { setSelection: vi.fn() } },
        dispatch: editorDispatch,
        focus: vi.fn(),
      } as never,
      getNode: () => ({ textContent: '0123456789' }) as never,
      getPos: () => 10,
    });

    const cut = keymaps.find((binding) => binding.key === 'Mod-x');

    expect(cut?.run?.({} as never)).toBe(true);
    expect(blockSelectionMocks.writeTextToClipboard).toHaveBeenCalledWith('234');

    cm.state.selection = {
      main: { from: 6, to: 9, head: 9, empty: false },
      ranges: [{ from: 6, to: 9, empty: false }],
    };
    resolveClipboard(true);
    await Promise.resolve();

    expect(cm.state.changeByRange).not.toHaveBeenCalled();
    expect(cmDispatch).not.toHaveBeenCalled();
    expect(editorDispatch).not.toHaveBeenCalled();
  });

  it('does not cut CodeMirror content while the editor is readonly', () => {
    const cm = {
      dispatch: vi.fn(),
      state: {
        sliceDoc: (from: number, to: number) => '0123456789'.slice(from, to),
        selection: {
          main: { from: 2, to: 5, head: 5, empty: false },
          ranges: [{ from: 2, to: 5, empty: false }],
        },
      },
    };

    const keymaps = createCodeBlockEditorKeymap({
      getCodeMirror: () => cm as never,
      view: {
        editable: false,
      } as never,
      getNode: () => ({ textContent: '0123456789' }) as never,
      getPos: () => 10,
    });

    const cut = keymaps.find((binding) => binding.key === 'Mod-x');

    expect(cut?.run?.({} as never)).toBe(false);
    expect(blockSelectionMocks.writeTextToClipboard).not.toHaveBeenCalled();
    expect(cm.dispatch).not.toHaveBeenCalled();
  });

  it('handles native CodeMirror copy events and collapses mirrored selections', () => {
    const cmDispatch = vi.fn();
    const editorDispatch = vi.fn();
    const editorFocus = vi.fn();
    const transaction = {
      scrollIntoView: vi.fn(() => transaction),
    };
    const setSelection = vi.fn(() => transaction);
    const event = {
      preventDefault: vi.fn(),
      clipboardData: {
        setData: vi.fn(),
      },
    } as unknown as ClipboardEvent;
    const cm = {
      dispatch: cmDispatch,
      state: {
        sliceDoc: (from: number, to: number) => '0123456789'.slice(from, to),
        selection: {
          main: { from: 2, to: 5, head: 5, empty: false },
          ranges: [{ from: 2, to: 5, empty: false }],
        },
      },
    };

    const textBetween = vi.fn(() => '0123456789');
    const handlers = createCodeBlockEditorClipboardHandlers({
      view: {
        state: {
          doc: {},
          tr: { setSelection },
        },
        dispatch: editorDispatch,
        focus: editorFocus,
      } as never,
      getNode: () => ({
        content: { size: 10 },
        textBetween,
        get textContent() {
          throw new Error('aggregate code block textContent should not be read');
        },
      }) as never,
      getPos: () => 10,
    });

    expect(handlers.copy?.call(undefined, event, cm as never)).toBe(true);

    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(event.clipboardData?.setData).toHaveBeenCalledWith('text/plain', '234');
    expect(blockSelectionMocks.writeTextToClipboard).not.toHaveBeenCalled();
    expect(cmDispatch).toHaveBeenCalledWith({
      selection: {
        anchor: 5,
        head: 5,
      },
    });
    expect(textBetween).toHaveBeenCalledWith(0, 10, '\n', '\n');
    expect(setSelection).toHaveBeenCalledWith('created-text-selection');
    expect(editorDispatch).toHaveBeenCalledWith(transaction);
    expect(editorFocus).toHaveBeenCalledTimes(1);
  });

  it('handles native CodeMirror cut events and deletes the selected content', () => {
    const editorDispatch = vi.fn();
    const transaction = {
      scrollIntoView: vi.fn(() => transaction),
    };
    const setSelection = vi.fn(() => transaction);
    const selectionRange = { from: 2, to: 5, empty: false };
    const event = {
      preventDefault: vi.fn(),
      clipboardData: {
        setData: vi.fn(),
      },
    } as unknown as ClipboardEvent;
    const cm = {
      dispatch: vi.fn(),
      focus: vi.fn(),
      state: {
        sliceDoc: (from: number, to: number) => '0123456789'.slice(from, to),
        changeByRange: vi.fn((callback: (range: typeof selectionRange) => unknown) => callback(selectionRange)),
        selection: {
          main: { from: 2, to: 5, head: 5, empty: false },
          ranges: [selectionRange],
        },
      },
    };

    const handlers = createCodeBlockEditorClipboardHandlers({
      view: {
        editable: true,
        state: {
          doc: {},
          tr: { setSelection },
        },
        dispatch: editorDispatch,
        focus: vi.fn(),
      } as never,
      getNode: () => ({ textContent: '0123456789' }) as never,
      getPos: () => 10,
    });

    expect(handlers.cut?.call(undefined, event, cm as never)).toBe(true);

    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(event.clipboardData?.setData).toHaveBeenCalledWith('text/plain', '234');
    expect(blockSelectionMocks.writeTextToClipboard).not.toHaveBeenCalled();
    expect(cm.dispatch).toHaveBeenCalledWith({
      changes: { from: 2, to: 5, insert: '' },
      range: expect.objectContaining({ from: 2, to: 2 }),
    });
    expect(editorDispatch).toHaveBeenCalledWith(transaction);
    expect(cm.focus).toHaveBeenCalledTimes(1);
  });

  it('blocks image clipboard companion text in CodeMirror while leaving ordinary text paste native', () => {
    const file = new File(['image'], 'code.png', { type: 'image/png' });
    const handlers = createCodeBlockEditorClipboardHandlers({
      view: {} as never,
      getNode: () => ({ textContent: 'const value = 1;' }) as never,
      getPos: () => 10,
    });
    const imageEvent = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      clipboardData: {
        items: [{ kind: 'file', type: 'image/png', getAsFile: () => file }],
        files: [file],
        getData: () => 'https://example.test/companion',
      },
    } as unknown as ClipboardEvent;
    const htmlImageEvent = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      clipboardData: {
        items: [],
        files: [],
        getData: (type: string) => type === 'text/html'
          ? '<img src="https://images.example.test/code.png">'
          : 'https://example.test/companion',
      },
    } as unknown as ClipboardEvent;
    const textEvent = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      clipboardData: {
        items: [],
        files: [],
        getData: () => 'ordinary code',
      },
    } as unknown as ClipboardEvent;

    expect(handlers.paste?.call(undefined, imageEvent, {} as never)).toBe(true);
    expect(imageEvent.preventDefault).toHaveBeenCalledTimes(1);
    expect(imageEvent.stopPropagation).toHaveBeenCalledTimes(1);
    expect(handlers.paste?.call(undefined, htmlImageEvent, {} as never)).toBe(true);
    expect(htmlImageEvent.preventDefault).toHaveBeenCalledTimes(1);
    expect(htmlImageEvent.stopPropagation).toHaveBeenCalledTimes(1);
    expect(handlers.paste?.call(undefined, textEvent, {} as never)).toBe(false);
    expect(textEvent.preventDefault).not.toHaveBeenCalled();

    const dropEvent = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      dataTransfer: imageEvent.clipboardData,
    } as unknown as DragEvent;
    expect(handlers.drop?.call(undefined, dropEvent, {} as never)).toBe(true);
    expect(dropEvent.preventDefault).toHaveBeenCalledTimes(1);
  });
});
