import { createSetextHeadingFromDelimiter } from '@milkdown/kit/preset/commonmark';
import type { EditorView } from '@milkdown/kit/prose/view';
import { shouldConvertParagraphToThematicBreak } from './hrAutoParagraphUtils';
import { moveSelectionAfterInsertedNode } from '../shared/insertedNodeSelection';

const MAX_HR_SHORTCUT_TEXT_CHARS = 256;

function shouldPreserveLeadingFrontmatterShortcut(view: EditorView): boolean {
  const { selection } = view.state;
  const parentDepth = selection.$from.depth - 1;
  if (parentDepth !== 0 || selection.$from.index(parentDepth) !== 0) return false;
  if (selection.$from.parent.content.size !== 3) return false;

  return selection.$from.parent.textBetween(0, 3, '', '') === '---';
}

export function handleHorizontalRuleShortcutEnter(view: EditorView): boolean {
  const { state } = view;
  const { selection } = state;
  if (!selection.empty || shouldPreserveLeadingFrontmatterShortcut(view)) return false;

  const paragraphType = state.schema.nodes.paragraph;
  if (!paragraphType || selection.$from.parent.type !== paragraphType) return false;

  const parent = selection.$from.parent;
  const offset = selection.$from.parentOffset;
  if (parent.content.size > MAX_HR_SHORTCUT_TEXT_CHARS) return false;
  const text = parent.textBetween(0, parent.content.size, '', '');
  if (!shouldConvertParagraphToThematicBreak(text, offset)) return false;

  const hrType = state.schema.nodes.hr;
  if (!hrType) return false;

  const { $from } = selection;
  const paragraphPos = $from.before();
  const hrNode = hrType.create();
  const tr = state.tr.replaceWith(
    paragraphPos,
    paragraphPos + $from.parent.nodeSize,
    hrNode,
  );
  const movedTr = moveSelectionAfterInsertedNode({
    tr,
    nodePos: paragraphPos,
    insertedNodeFallback: hrNode,
    paragraphType,
  });
  view.dispatch(movedTr.scrollIntoView());
  return true;
}

export function handleMarkdownBlockShortcutEnter(view: EditorView): boolean {
  const headingType = view.state.schema.nodes.heading;
  const paragraphType = view.state.schema.nodes.paragraph;
  if (
    headingType
    && paragraphType
    && createSetextHeadingFromDelimiter(
      headingType,
      paragraphType,
    )(view.state, view.dispatch.bind(view), view)
  ) {
    return true;
  }

  return handleHorizontalRuleShortcutEnter(view);
}
