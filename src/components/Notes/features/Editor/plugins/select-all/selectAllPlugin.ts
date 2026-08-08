import * as proseState from '@milkdown/kit/prose/state';
import { Plugin } from '@milkdown/kit/prose/state';
import type { EditorView } from '@milkdown/kit/prose/view';
import { $prose } from '@milkdown/kit/utils';
import { isLargeEditorSelection } from '../selection/textSelectionOverlayState';

const AllSelection = (
  proseState as typeof proseState & {
    AllSelection: (new (doc: unknown) => unknown) & {
      create?: (doc: unknown) => unknown;
    };
  }
).AllSelection;

function isSelectAllShortcut(event: KeyboardEvent): boolean {
  return (
    !event.isComposing &&
    (event.metaKey || event.ctrlKey) &&
    !event.altKey &&
    !event.shiftKey &&
    event.key.toLowerCase() === 'a'
  );
}

function createAllSelection(doc: unknown) {
  if (typeof AllSelection.create === 'function') {
    return AllSelection.create(doc);
  }

  return new AllSelection(doc);
}

export function handleEditorSelectAll(view: EditorView, event: KeyboardEvent): boolean {
  if (!isSelectAllShortcut(event)) return false;

  event.preventDefault();
  view.dispatch(view.state.tr.setSelection(createAllSelection(view.state.doc) as never));
  if (!isLargeEditorSelection(view.state)) {
    view.focus();
  }
  return true;
}

export const selectAllPlugin = $prose(() => new Plugin({
  props: {
    handleKeyDown(view, event) {
      return handleEditorSelectAll(view, event);
    },
  },
}));
