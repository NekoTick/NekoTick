import { createSetextHeadingFromDelimiter } from '@milkdown/kit/preset/commonmark';
import { TextSelection } from '@milkdown/kit/prose/state';
import type { EditorView } from '@milkdown/kit/prose/view';
import { shouldConvertParagraphToThematicBreak } from './hrAutoParagraphUtils';
import { moveSelectionAfterInsertedNode } from '../shared/insertedNodeSelection';

const MAX_HR_SHORTCUT_TEXT_CHARS = 256;
const EDITABLE_MARKDOWN_BLANK_LINE_PLACEHOLDER = '\u200B';
const MARKDOWN_BLANK_LINE_VALUES = new Set([
  '<!--vlaina-markdown-blank-line-->',
  '<!--vlaina-rendered-html-boundary-blank-line-->',
]);

function createEditableHorizontalRule(view: EditorView) {
  const { schema } = view.state;
  const syntax = schema.marks.markdownSyntax;
  const content = syntax
    ? schema.text('---', [syntax.create({ edge: 'prefix', kind: 'hr' })])
    : undefined;
  return schema.nodes.hr.create(null, content);
}

export function moveSelectionAfterHorizontalRule(
  view: EditorView,
  tr: EditorView['state']['tr'],
  hrPos: number,
  hrNode: { nodeSize: number },
) {
  const paragraphType = view.state.schema.nodes.paragraph;
  const afterHrPos = hrPos + hrNode.nodeSize;
  const nextNode = tr.doc.nodeAt(afterHrPos);
  const hasEditableEmptyParagraph = nextNode?.type.name === 'paragraph'
    && (
      nextNode.content.size === 0
      || nextNode.textContent === EDITABLE_MARKDOWN_BLANK_LINE_PLACEHOLDER
    );
  const hasMarkdownBlankLine = nextNode?.type.name === 'html_block'
    && MARKDOWN_BLANK_LINE_VALUES.has(nextNode.attrs?.value);

  if (hasEditableEmptyParagraph) {
    return tr.setSelection(TextSelection.create(
      tr.doc,
      afterHrPos + 1 + nextNode.content.size,
    ));
  }

  if (nextNode && paragraphType && !hasMarkdownBlankLine) {
    return tr
      .insert(afterHrPos, paragraphType.create())
      .setSelection(TextSelection.create(tr.doc, afterHrPos + 1));
  }

  return moveSelectionAfterInsertedNode({
    tr,
    nodePos: hrPos,
    insertedNodeFallback: hrNode,
    paragraphType,
  });
}

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
  const hrNode = createEditableHorizontalRule(view);
  const tr = state.tr.replaceWith(
    paragraphPos,
    paragraphPos + $from.parent.nodeSize,
    hrNode,
  );
  const movedTr = moveSelectionAfterHorizontalRule(view, tr, paragraphPos, hrNode);
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
