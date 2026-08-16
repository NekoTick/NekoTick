import { describe, expect, it, vi } from 'vitest';
import { cancelMermaidEditorSession, saveMermaidEditorSession } from './mermaidEditorSessionActions';

describe('mermaidEditorSessionActions', () => {
  it('removes a new diagram when cancelling after editing its draft', () => {
    const transaction = {
      delete: vi.fn(() => transaction),
      setMeta: vi.fn(() => 'closed-transaction'),
      setNodeMarkup: vi.fn(() => transaction),
    };
    const editorView = {
      state: {
        doc: {
          nodeAt: vi.fn(() => ({
            type: { name: 'mermaid' },
            attrs: { code: '' },
          })),
        },
        tr: transaction,
      },
      dispatch: vi.fn(),
      focus: vi.fn(),
    };

    cancelMermaidEditorSession({
      editorView: editorView as never,
      refs: {
        textareaElement: {
          value: 'graph TD\nA --> B',
        } as HTMLTextAreaElement,
        draftValue: '',
        initialValue: '',
      },
      getEditorState: () => ({
        isOpen: true,
        nodePos: 4,
        code: '',
        position: { x: 0, y: 0 },
        openSource: 'new-empty-block',
      }),
      resetSessionDom: vi.fn(),
    });

    expect(transaction.delete).toHaveBeenCalledWith(4, 5);
    expect(transaction.setNodeMarkup).not.toHaveBeenCalled();
  });

  it('removes a new diagram when saving an untouched starter directive', () => {
    const transaction = {
      delete: vi.fn(() => transaction),
      setMeta: vi.fn(() => 'closed-transaction'),
      setNodeMarkup: vi.fn(() => transaction),
    };
    const dispatch = vi.fn();
    const editorView = {
      state: {
        doc: {
          nodeAt: vi.fn(() => ({
            type: { name: 'mermaid' },
            attrs: { code: 'sequenceDiagram\n' },
          })),
        },
        tr: transaction,
      },
      dispatch,
      focus: vi.fn(),
    };

    saveMermaidEditorSession({
      editorView: editorView as never,
      refs: {
        textareaElement: {
          value: 'sequenceDiagram\n',
        } as HTMLTextAreaElement,
        draftValue: '',
        initialValue: 'sequenceDiagram\n',
      },
      getEditorState: () => ({
        isOpen: true,
        nodePos: 4,
        code: 'sequenceDiagram\n',
        position: { x: 0, y: 0 },
        openSource: 'new-empty-block',
      }),
      resetSessionDom: vi.fn(),
    });

    expect(transaction.delete).toHaveBeenCalledWith(4, 5);
    expect(transaction.setNodeMarkup).not.toHaveBeenCalled();
  });

  it('saves pasted fenced Mermaid editor input as normalized diagram code', () => {
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
            type: { name: 'mermaid' },
            attrs: { code: '' },
          })),
        },
        tr: transaction,
      },
      dispatch,
      focus: vi.fn(),
    };

    saveMermaidEditorSession({
      editorView: editorView as never,
      refs: {
        textareaElement: {
          value: [
            '```sequence',
            'Alice->Bob: Hello Bob, how are you?',
            'Note right of Bob: Bob thinks',
            'Bob-->Alice: I am good thanks!',
            '```',
          ].join('\n'),
        } as HTMLTextAreaElement,
        draftValue: '',
        initialValue: '',
      },
      getEditorState: () => ({
        isOpen: true,
        nodePos: 4,
        code: '',
        position: { x: 0, y: 0 },
        openSource: 'existing-node',
      }),
      resetSessionDom: vi.fn(),
    });

    expect(setNodeMarkup).toHaveBeenCalledWith(4, undefined, {
      code: [
        'sequenceDiagram',
        'Alice->Bob: Hello Bob, how are you?',
        'Note right of Bob: Bob thinks',
        'Bob-->Alice: I am good thanks!',
      ].join('\n'),
    });
  });

  it('saves classic flowchart editor input without converting the source', () => {
    const setNodeMarkup = vi.fn();
    const transaction = {
      setMeta: vi.fn(() => 'closed-transaction'),
      setNodeMarkup,
    };
    setNodeMarkup.mockReturnValue(transaction);
    const code = [
      'st=>start: 开始框',
      'op=>operation: 处理框',
      'cond=>condition: 判断框(是或否?)',
      'st->op->cond',
    ].join('\n');
    const editorView = {
      state: {
        doc: {
          nodeAt: vi.fn(() => ({
            type: { name: 'mermaid' },
            attrs: { code: '' },
          })),
        },
        tr: transaction,
      },
      dispatch: vi.fn(),
      focus: vi.fn(),
    };

    saveMermaidEditorSession({
      editorView: editorView as never,
      refs: {
        textareaElement: {
          value: code,
        } as HTMLTextAreaElement,
        draftValue: '',
        initialValue: '',
      },
      getEditorState: () => ({
        isOpen: true,
        nodePos: 4,
        code: '',
        position: { x: 0, y: 0 },
        openSource: 'existing-node',
      }),
      resetSessionDom: vi.fn(),
    });

    expect(setNodeMarkup).toHaveBeenCalledWith(4, undefined, { code });
  });
});
