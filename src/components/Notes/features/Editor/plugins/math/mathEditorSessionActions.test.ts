import { describe, expect, it, vi } from 'vitest';
import { cancelMathEditorSession, saveMathEditorSession } from './mathEditorSessionActions';

describe('mathEditorSessionActions', () => {
  it('removes a new math block when cancelling after editing its draft', () => {
    const transaction = {
      delete: vi.fn(() => transaction),
      setMeta: vi.fn(() => 'closed-transaction'),
      setNodeMarkup: vi.fn(() => transaction),
    };
    const editorView = {
      state: {
        doc: {
          nodeAt: vi.fn(() => ({
            type: { name: 'math_block' },
            attrs: { latex: '' },
          })),
        },
        tr: transaction,
      },
      dispatch: vi.fn(),
      focus: vi.fn(),
    };

    cancelMathEditorSession({
      editorView: editorView as never,
      refs: {
        textareaElement: {
          value: 'x + y',
        } as HTMLTextAreaElement,
        draftValue: '',
        initialValue: '',
      },
      getEditorState: () => ({
        isOpen: true,
        nodePos: 4,
        latex: '',
        displayMode: true,
        position: { x: 0, y: 0 },
        openSource: 'new-empty-block',
      }),
      resetSessionDom: vi.fn(),
    });

    expect(transaction.delete).toHaveBeenCalledWith(4, 5);
    expect(transaction.setNodeMarkup).not.toHaveBeenCalled();
  });

  it('saves edited inline math latex back to the math node attrs', () => {
    const setNodeMarkup = vi.fn();
    const transaction = {
      setMeta: vi.fn(() => 'closed-transaction'),
      setNodeMarkup,
    };
    setNodeMarkup.mockReturnValue(transaction);
    const dispatch = vi.fn();
    const editorView = {
      state: {
        doc: {
          nodeAt: vi.fn(() => ({
            type: { name: 'math_inline' },
            attrs: { latex: 'x', id: 'math-1' },
          })),
        },
        tr: transaction,
      },
      dispatch,
      focus: vi.fn(),
    };

    saveMathEditorSession({
      editorView: editorView as never,
      refs: {
        textareaElement: {
          value: 'x + y',
        } as HTMLTextAreaElement,
        draftValue: '',
        initialValue: 'x',
      },
      getEditorState: () => ({
        isOpen: true,
        nodePos: 4,
        latex: 'x',
        displayMode: false,
        position: { x: 0, y: 0 },
        openSource: 'existing-node',
      }),
      resetSessionDom: vi.fn(),
    });

    expect(setNodeMarkup).toHaveBeenCalledWith(4, undefined, {
      latex: 'x + y',
      id: 'math-1',
    });
  });

  it('removes a math node when saving empty latex', () => {
    const transaction = {
      delete: vi.fn(() => transaction),
      setMeta: vi.fn(() => 'closed-transaction'),
      setNodeMarkup: vi.fn(() => transaction),
    };
    const editorView = {
      state: {
        doc: {
          nodeAt: vi.fn(() => ({
            type: { name: 'math_block' },
            attrs: { latex: 'x' },
          })),
        },
        tr: transaction,
      },
      dispatch: vi.fn(),
      focus: vi.fn(),
    };

    saveMathEditorSession({
      editorView: editorView as never,
      refs: {
        textareaElement: {
          value: '  ',
        } as HTMLTextAreaElement,
        draftValue: '',
        initialValue: 'x',
      },
      getEditorState: () => ({
        isOpen: true,
        nodePos: 4,
        latex: 'x',
        displayMode: true,
        position: { x: 0, y: 0 },
        openSource: 'existing-node',
      }),
      resetSessionDom: vi.fn(),
    });

    expect(transaction.delete).toHaveBeenCalledWith(4, 5);
    expect(transaction.setNodeMarkup).not.toHaveBeenCalled();
  });
});
