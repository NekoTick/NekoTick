import { closeHistory } from '@milkdown/kit/prose/history';
import { Plugin } from '@milkdown/kit/prose/state';
import { $prose } from '@milkdown/kit/utils';

export function createHistoryBoundaryProsePlugin(): Plugin {
  return new Plugin({
    appendTransaction(transactions, oldState, newState) {
      if (oldState.selection.empty) return null;

      const changedByHistoryAction = transactions.some(
        (transaction) => transaction.docChanged && transaction.getMeta('addToHistory') !== false,
      );
      if (!changedByHistoryAction) return null;

      return closeHistory(newState.tr).setMeta('addToHistory', false);
    },
  });
}

export const historyBoundaryPlugin = $prose(createHistoryBoundaryProsePlugin);
