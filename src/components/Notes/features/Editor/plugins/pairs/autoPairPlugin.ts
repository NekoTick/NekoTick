import { Plugin, TextSelection } from '@milkdown/kit/prose/state';
import { $prose } from '@milkdown/kit/utils';

import { clipboardPluginKey } from '../clipboard';
import { handleAutoPairBackspace, handleAutoPairDelete } from './pairBackspace';
import {
  autoPairPluginKey,
  autoPairPluginState,
  createAddAutoClosersMeta,
  findRecoverableAutoCloserFromSelection,
  getAutoInsertedClosers,
  hasAutoInsertedCloserAt,
  transactionSkippedAutoCloser,
} from './pairState';
import { handleAutoPairTextInput } from './pairTextInput';

export const autoPairPlugin = $prose(() => new Plugin({
  key: autoPairPluginKey,
  state: autoPairPluginState,
  appendTransaction(transactions, oldState, newState) {
    if (!transactions.some((tr) => tr.docChanged)) return;
    if (transactions.some(transactionSkippedAutoCloser)) return;

    const oldClosers = getAutoInsertedClosers(oldState);
    if (oldClosers.length === 0) return;

    const recoverableCloser = findRecoverableAutoCloserFromSelection(newState.selection);
    if (!recoverableCloser) return;

    const shouldRestoreClipboardCursor = transactions.some((tr) => tr.getMeta(clipboardPluginKey));
    const hasTrackedCloser = hasAutoInsertedCloserAt(newState, recoverableCloser.pos, recoverableCloser.close);
    if (!shouldRestoreClipboardCursor && hasTrackedCloser) return;

    const tr = newState.tr.setSelection(TextSelection.create(newState.doc, recoverableCloser.pos));
    if (!hasTrackedCloser) {
      tr.setMeta(autoPairPluginKey, createAddAutoClosersMeta([recoverableCloser]));
    }
    return tr;
  },
  props: {
    handleTextInput(view, from, to, text) {
      return handleAutoPairTextInput(view, from, to, text);
    },
    handleKeyDown(view, event) {
      if (event.isComposing) return false;
      if (handleAutoPairBackspace(view, event)) return true;
      return handleAutoPairDelete(view, event);
    },
  },
}));
