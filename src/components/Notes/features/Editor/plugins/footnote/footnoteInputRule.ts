import { $inputRule } from '@milkdown/kit/utils';
import { InputRule } from '@milkdown/kit/prose/inputrules';
import { Fragment } from '@milkdown/kit/prose/model';
import type { EditorView } from '@milkdown/kit/prose/view';
import { normalizeFootnoteLabel } from './footnoteLabels';
import { moveSelectionAfterInsertedNode } from '../shared/insertedNodeSelection';
import { markEditorUserInput } from '../shared/userInputEvents';

type UndoableInputRule = InputRule & { undoable?: boolean };

export const MAX_FOOTNOTE_REF_INPUT_PREFIX_CHECK_CHARS = 256;

export function hasNonBlankFootnoteRefInputPrefix(
  doc: { textBetween: (from: number, to: number) => string },
  lineStart: number,
  start: number
): boolean {
  const textBefore = doc.textBetween(
    Math.max(lineStart, start - MAX_FOOTNOTE_REF_INPUT_PREFIX_CHECK_CHARS),
    start
  );
  return textBefore.trim() !== '';
}

export const footnoteRefInputRule = $inputRule(() => {
  const rule = new InputRule(
    /\[\^([^\]]+)\]$/,
    (state, match, start, end) => {
      const id = normalizeFootnoteLabel(match[1]);
      if (!id) return null;

      const $pos = state.doc.resolve(start);
      const lineStart = $pos.start();

      if (!hasNonBlankFootnoteRefInputPrefix(state.doc, lineStart, start)) return null;

      const { tr, schema } = state;
      const nodeType = schema.nodes.footnote_reference ?? schema.nodes.footnote_ref;
      if (!nodeType) return null;
      const attrs = nodeType.name === 'footnote_reference' ? { label: id } : { id };

      return tr
        .delete(start, end)
        .replaceSelectionWith(nodeType.create(attrs));
    }
  );
  (rule as UndoableInputRule).undoable = false;
  return rule;
});

const footnoteReferencePattern = /\[\^([^\]\n]+)\]$/;

export function handleFootnoteReferenceTextInput(
  view: EditorView,
  from: number,
  to: number,
  text: string,
): boolean {
  if (view.composing || text !== ']' || from !== to) return false;

  const { state } = view;
  const { selection } = state;
  if (!selection.empty || from !== selection.from || to !== selection.to) return false;

  const parent = selection.$from.parent;
  if (!parent.inlineContent || parent.type.spec.code) return false;
  const parentOffset = selection.$from.parentOffset;
  const suffix = parent.textBetween(parentOffset, parent.content.size, '', '');
  if (suffix !== '' && suffix !== ']') return false;

  const textBefore = parent.textBetween(
    Math.max(0, parentOffset - MAX_FOOTNOTE_REF_INPUT_PREFIX_CHECK_CHARS),
    parentOffset,
    undefined,
    '\uFFFC',
  ) + text;
  const match = footnoteReferencePattern.exec(textBefore);
  const id = normalizeFootnoteLabel(match?.[1]);
  if (!match || !id) return false;

  const start = from - (match[0].length - text.length);
  if (!hasNonBlankFootnoteRefInputPrefix(state.doc, selection.$from.start(), start)) {
    return false;
  }

  const nodeType = state.schema.nodes.footnote_reference ?? state.schema.nodes.footnote_ref;
  if (!nodeType) return false;
  const attrs = nodeType.name === 'footnote_reference' ? { label: id } : { id };
  const replaceTo = suffix ? to + suffix.length : to;
  markEditorUserInput(view);
  view.dispatch(state.tr.replaceWith(start, replaceTo, nodeType.create(attrs)));
  return true;
}

const MAX_FOOTNOTE_DEF_SHORTCUT_CHARS = 8_192;
const footnoteDefinitionPrefixPattern = /^(\[\^([^\]]+)\]:[ \t]*)/;

export function handleFootnoteDefinitionShortcutEnter(view: EditorView): boolean {
  const { state } = view;
  const { selection } = state;
  if (!selection.empty || selection.$from.depth < 1) return false;

  const paragraphType = state.schema.nodes.paragraph;
  const source = selection.$from.parent;
  if (!paragraphType || source.type !== paragraphType) return false;
  if (selection.$from.parentOffset !== source.content.size) return false;
  if (source.content.size > MAX_FOOTNOTE_DEF_SHORTCUT_CHARS) return false;

  const text = source.textBetween(0, source.content.size, '', '');
  const match = footnoteDefinitionPrefixPattern.exec(text);
  const id = normalizeFootnoteLabel(match?.[2]);
  if (!match || !id) return false;

  const footnoteType = state.schema.nodes.footnote_definition
    ?? state.schema.nodes.footnote_def;
  if (!footnoteType) return false;

  const body = paragraphType.create(null, source.content.cut(match[1].length));
  const attrs = footnoteType.name === 'footnote_definition'
    ? { label: id }
    : { id };
  const footnote = footnoteType.create(attrs, [body]);
  const trailingParagraph = paragraphType.create();
  const parentDepth = selection.$from.depth - 1;
  const parent = selection.$from.node(parentDepth);
  const fromIndex = selection.$from.index(parentDepth);
  const hasFollowingSibling = fromIndex + 1 < parent.childCount;
  const replacement = Fragment.fromArray(
    hasFollowingSibling ? [footnote] : [footnote, trailingParagraph],
  );
  if (!parent.canReplace(fromIndex, selection.$from.indexAfter(parentDepth), replacement)) {
    return false;
  }

  const from = selection.$from.before(selection.$from.depth);
  const to = selection.$from.after(selection.$from.depth);
  const tr = state.tr.replaceWith(from, to, replacement);
  const movedTr = moveSelectionAfterInsertedNode({
    tr,
    nodePos: from,
    insertedNodeFallback: footnote,
    paragraphType,
  });
  view.dispatch(movedTr.scrollIntoView());
  return true;
}
