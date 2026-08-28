import { TextSelection } from '@milkdown/kit/prose/state';
import type { EditorView } from '@milkdown/kit/prose/view';
import { focusHorizontalRuleSource } from './hrBlockSelection';
import { moveSelectionAfterHorizontalRule } from './hrShortcutEnter';

function enterHorizontalRuleOnArrowUp(view: EditorView): boolean {
  const { state } = view;
  const { selection } = state;
  if (!selection.empty || selection.$from.depth !== 1) return false;
  if (selection.$from.parentOffset !== 0 || !selection.$from.parent.isTextblock) return false;
  if (typeof view.endOfTextblock === 'function' && !view.endOfTextblock('up')) return false;

  const indexAtRoot = selection.$from.index(0);
  if (indexAtRoot <= 0 || state.doc.child(indexAtRoot - 1)?.type !== state.schema.nodes.hr) {
    return false;
  }

  const hrPos = selection.$from.posAtIndex(indexAtRoot - 1, 0);
  return focusHorizontalRuleSource(view, hrPos, 'end');
}

function enterHorizontalRuleOnArrowDown(view: EditorView): boolean {
  const { state } = view;
  const { selection } = state;
  if (!selection.empty || selection.$from.depth !== 1) return false;
  if (!selection.$from.parent.isTextblock) return false;
  if (typeof view.endOfTextblock === 'function' && !view.endOfTextblock('down')) return false;

  const indexAtRoot = selection.$from.index(0);
  if (
    indexAtRoot >= state.doc.childCount - 1
    || state.doc.child(indexAtRoot + 1)?.type !== state.schema.nodes.hr
  ) return false;

  const hrPos = selection.$from.posAtIndex(indexAtRoot + 1, 0);
  return focusHorizontalRuleSource(view, hrPos, 'end');
}

function leaveHorizontalRuleOnArrowDown(view: EditorView): boolean {
  const { state } = view;
  const { selection } = state;
  if (!selection.empty || selection.$from.depth !== 1) return false;
  if (selection.$from.parent.type !== state.schema.nodes.hr) return false;

  const atBottom = selection.$from.parentOffset === selection.$from.parent.content.size
    || Boolean(view.endOfTextblock?.('down'));
  if (!atBottom) return false;

  const hrPos = selection.$from.before(1);
  const afterHrPos = hrPos + selection.$from.parent.nodeSize;
  const nextNode = state.doc.nodeAt(afterHrPos);
  if (!nextNode) {
    const tr = moveSelectionAfterHorizontalRule(
      view,
      state.tr,
      hrPos,
      selection.$from.parent,
    );
    view.dispatch(tr.scrollIntoView());
    view.focus();
    return true;
  }

  if (!nextNode.isTextblock || nextNode.type === state.schema.nodes.hr) return false;

  view.dispatch(
    state.tr
      .setSelection(TextSelection.create(state.doc, afterHrPos + 1))
      .scrollIntoView(),
  );
  view.focus();
  return true;
}

export function handleHorizontalRuleArrowNavigation(
  view: EditorView,
  direction: 'up' | 'down',
): boolean {
  return direction === 'up'
    ? enterHorizontalRuleOnArrowUp(view)
    : enterHorizontalRuleOnArrowDown(view) || leaveHorizontalRuleOnArrowDown(view);
}
