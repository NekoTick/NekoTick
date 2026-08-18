import { describe, expect, it } from 'vitest';
import { Schema } from '@milkdown/kit/prose/model';
import { history, undo, undoDepth } from '@milkdown/kit/prose/history';
import { EditorState, TextSelection } from '@milkdown/kit/prose/state';
import { EDITOR_HISTORY_CONFIG } from '../../editorHistoryPolicy';
import { createHistoryBoundaryProsePlugin } from './historyBoundaryPlugin';

const schema = new Schema({
  nodes: {
    doc: { content: 'paragraph+' },
    paragraph: { content: 'text*' },
    text: {},
  },
});

function createState() {
  return EditorState.create({
    doc: schema.node('doc', null, [
      schema.node('paragraph', null, schema.text('abcdef')),
    ]),
    plugins: [history(EDITOR_HISTORY_CONFIG), createHistoryBoundaryProsePlugin()],
  });
}

describe('historyBoundaryPlugin', () => {
  it('uses the shared delay when grouping adjacent edits', () => {
    let state = createState();
    const dispatch = (transaction: Parameters<typeof state.apply>[0]) => {
      state = state.applyTransaction(transaction).state;
    };

    dispatch(state.tr.insertText('g', 7).setTime(100));
    dispatch(state.tr.insertText('h', 8).setTime(700));
    expect(undoDepth(state)).toBe(1);

    dispatch(state.tr.insertText('i', 9).setTime(1_701));
    expect(undoDepth(state)).toBe(2);
  });

  it('starts a new history group after replacing a text selection', () => {
    let state = createState();
    const dispatch = (transaction: Parameters<typeof state.apply>[0]) => {
      state = state.applyTransaction(transaction).state;
    };

    dispatch(state.tr.setSelection(TextSelection.create(state.doc, 3, 5)).setTime(100));
    dispatch(state.tr.deleteSelection().setTime(200));
    let transaction = state.tr.delete(2, 3);
    transaction = transaction
      .setSelection(TextSelection.create(transaction.doc, 2))
      .setTime(300);
    dispatch(transaction);

    expect(state.doc.textContent).toBe('aef');
    expect(undoDepth(state)).toBe(2);
    expect(undo(state, dispatch)).toBe(true);
    expect(state.doc.textContent).toBe('abef');
    expect(undo(state, dispatch)).toBe(true);
    expect(state.doc.textContent).toBe('abcdef');
  });
});
