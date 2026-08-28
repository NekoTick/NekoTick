import { $prose } from '@milkdown/kit/utils';
import {
  NodeSelection,
  Plugin,
  PluginKey,
  Selection,
  TextSelection,
} from '@milkdown/kit/prose/state';
import type { EditorView } from '@milkdown/kit/prose/view';
import {
  focusHorizontalRuleSource,
  resolveHorizontalRuleNodePos,
} from './hrBlockSelection';
import {
  handleHorizontalRuleShortcutEnter,
  handleMarkdownBlockShortcutEnter,
  moveSelectionAfterHorizontalRule,
} from './hrShortcutEnter';
import { handleHorizontalRuleArrowNavigation } from './hrArrowNavigation';

export { handleHorizontalRuleShortcutEnter };

export const hrAutoParagraphPluginKey = new PluginKey('hrAutoParagraph');

function preventNestedForwardDeleteIntoHorizontalRule(view: EditorView, key: string): boolean {
  const { state } = view;
  const { selection } = state;
  if (
    key !== 'Delete'
    || !selection.empty
    || selection.$from.depth < 3
    || selection.$from.parentOffset !== selection.$from.parent.content.size
  ) return false;

  let insideList = false;
  for (let depth = 1; depth < selection.$from.depth; depth += 1) {
    const ancestor = selection.$from.node(depth);
    if (ancestor.type.name !== 'bullet_list' && ancestor.type.name !== 'ordered_list') continue;
    insideList = true;
    if (ancestor.lastChild !== selection.$from.node(depth + 1)) return false;
  }
  if (!insideList) return false;

  return state.doc.child(selection.$from.index(0) + 1)?.type === state.schema.nodes.hr;
}

function insertParagraphAfterActiveHorizontalRule(view: EditorView): boolean {
  const { state } = view;
  const { selection } = state;
  if (!selection.empty || selection.$from.depth !== 1) return false;
  if (selection.$from.parent.type !== state.schema.nodes.hr) return false;

  const hrPos = selection.$from.before(1);
  const movedTr = moveSelectionAfterHorizontalRule(
    view,
    state.tr,
    hrPos,
    selection.$from.parent,
  );
  view.dispatch(movedTr.scrollIntoView());
  return true;
}

function findTextSelectionFromBoundary(
  doc: EditorView['state']['doc'],
  pos: number,
  direction: -1 | 1
): TextSelection | null {
  const selection = Selection.findFrom(
    doc.resolve(Math.max(0, Math.min(pos, doc.content.size))),
    direction,
    true
  );
  return selection instanceof TextSelection ? selection : null;
}

function deleteAdjacentHorizontalRule(view: EditorView, key: string): boolean {
  const { state } = view;
  const { selection } = state;
  if (!selection.empty) return false;
  if (selection.$from.depth !== 1) return false;
  if (!selection.$from.parent.isTextblock) return false;

  const isBackwardDelete = key === 'Backspace' || key === 'Delete';
  const isForwardDelete = key === 'Delete';
  if (!isBackwardDelete && !isForwardDelete) return false;

  const indexAtRoot = selection.$from.index(0);

  if (isBackwardDelete && selection.$from.parentOffset === 0 && indexAtRoot > 0) {
    const prevNode = state.doc.child(indexAtRoot - 1);
    if (prevNode.type === state.schema.nodes.hr) {
      const from = selection.$from.posAtIndex(indexAtRoot - 1, 0);
      if (selection.$from.parent.content.size === 0) {
        const paragraphFrom = selection.$from.before();
        const paragraphTo = paragraphFrom + selection.$from.parent.nodeSize;
        let tr = state.tr.delete(paragraphFrom, paragraphTo);
        const hrTo = from;
        const textSelection = findTextSelectionFromBoundary(
          tr.doc,
          hrTo,
          -1
        ) ?? findTextSelectionFromBoundary(
          tr.doc,
          hrTo,
          1
        );
        if (textSelection) {
          tr = tr.setSelection(textSelection);
        } else {
          const paragraphType = tr.doc.type.schema.nodes.paragraph;
          if (paragraphType) {
            tr = tr
              .insert(hrTo, paragraphType.create())
              .setSelection(TextSelection.create(tr.doc, hrTo + 1));
          }
        }
        view.dispatch(tr);
        return true;
      }

      const to = from + prevNode.nodeSize;
      view.dispatch(state.tr.delete(from, to).scrollIntoView());
      return true;
    }
  }

  if (isForwardDelete && selection.$from.parentOffset === selection.$from.parent.content.size && indexAtRoot < state.doc.childCount - 1) {
    const nextNode = state.doc.child(indexAtRoot + 1);
    if (nextNode.type === state.schema.nodes.hr) {
      const from = selection.$from.posAtIndex(indexAtRoot + 1, 0);
      const to = from + nextNode.nodeSize;
      view.dispatch(state.tr.delete(from, to).scrollIntoView());
      return true;
    }
  }

  return false;
}

function deleteSelectedHorizontalRule(view: EditorView, key: string): boolean {
  if (key !== 'Backspace' && key !== 'Delete') return false;

  const { state } = view;
  const { selection } = state;
  if (!(selection instanceof NodeSelection)) return false;
  if (selection.node.type !== state.schema.nodes.hr) return false;

  const anchorHint = selection.from;
  let tr = state.tr.deleteSelection();

  if (tr.doc.content.size === 0) {
    const paragraphType = tr.doc.type.schema.nodes.paragraph;
    if (paragraphType) {
      tr = tr.insert(0, paragraphType.create());
    }
  }

  const targetPos = Math.max(0, Math.min(anchorHint, tr.doc.content.size));
  tr = tr.setSelection(Selection.near(tr.doc.resolve(targetPos), -1));
  view.dispatch(tr.scrollIntoView());
  view.focus();
  return true;
}

export const hrAutoParagraphPlugin = $prose(() => {
  return new Plugin({
    key: hrAutoParagraphPluginKey,
    props: {
      handleKeyDown(view, event) {
        if (event.metaKey || event.ctrlKey || event.altKey) return false;
        if (event.isComposing) return false;

        if (event.key === 'Enter') {
          const handled = event.shiftKey
            ? handleHorizontalRuleShortcutEnter(view)
            : insertParagraphAfterActiveHorizontalRule(view)
              || handleMarkdownBlockShortcutEnter(view);
          if (!handled) return false;
          event.preventDefault();
          return true;
        }

        if (event.shiftKey) return false;

        if (event.key === 'ArrowUp') {
          if (!handleHorizontalRuleArrowNavigation(view, 'up')) return false;
          event.preventDefault();
          return true;
        }

        if (event.key === 'ArrowDown') {
          if (!handleHorizontalRuleArrowNavigation(view, 'down')) return false;
          event.preventDefault();
          return true;
        }

        if (event.key === 'Backspace' || event.key === 'Delete') {
          if (deleteSelectedHorizontalRule(view, event.key)) {
            event.preventDefault();
            return true;
          }

          if (preventNestedForwardDeleteIntoHorizontalRule(view, event.key)) {
            event.preventDefault();
            return true;
          }

          if (!deleteAdjacentHorizontalRule(view, event.key)) return false;
          event.preventDefault();
          return true;
        }

        return false;
      },
      handleDOMEvents: {
        mousedown(view, event) {
          if (!(event instanceof MouseEvent)) return false;
          if (event.button !== 0) return false;
          const hrPos = resolveHorizontalRuleNodePos(view, event.target);
          if (hrPos === null) return false;

          if (!focusHorizontalRuleSource(view, hrPos)) return false;
          event.preventDefault();
          return true;
        },
      },
    },
  });
});
