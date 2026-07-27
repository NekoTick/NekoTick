import { NodeSelection, TextSelection, type EditorState } from '@milkdown/kit/prose/state';
import type { EditorView } from '@milkdown/kit/prose/view';
import { Decoration, DecorationSet } from '@milkdown/kit/prose/view';
import { blankAreaDragBoxPluginKey, CLEAR_BLOCKS_ACTION } from './blockSelectionPluginState';
import {
  EDITABLE_MARKDOWN_BLANK_LINE_CLASS,
  isEditableMarkdownBlankLineNode,
  isMarkdownBlankLinePlaceholderNode,
  MAX_EDITABLE_MARKDOWN_BLANK_LINE_DECORATIONS
} from './markdownBlankLineShared';

const editableMarkdownBlankLineDecorationsCache = new WeakMap<EditorState['doc'], DecorationSet>();

export function handleMarkdownBlankLineTextInput(
  view: EditorView,
  from: number,
  to: number,
  text: string,
): boolean {
  const { selection, schema } = view.state;
  if (selection instanceof NodeSelection) {
    if (selection.from !== from || selection.to !== to) return false;
    if (!isMarkdownBlankLinePlaceholderNode(selection.node)) {
      return false;
    }

    const paragraphType = schema.nodes.paragraph;
    if (!paragraphType) return false;

    const paragraph = paragraphType.create(
      null,
      text.length > 0 ? schema.text(text) : undefined
    );
    let tr = view.state.tr.replaceWith(selection.from, selection.to, paragraph);
    tr = tr
      .setSelection(TextSelection.create(tr.doc, selection.from + 1 + text.length))
      .setMeta(blankAreaDragBoxPluginKey, CLEAR_BLOCKS_ACTION);
    view.dispatch(tr.scrollIntoView());
    return true;
  }

  if (!(selection instanceof TextSelection)) return false;
  if (selection.from !== from || selection.to !== to) return false;
  if (selection.$from.parent !== selection.$to.parent) return false;
  if (!isEditableMarkdownBlankLineNode(selection.$from.parent)) return false;

  const paragraphStart = selection.$from.before();
  const replaceFrom = selection.empty ? paragraphStart + 1 : selection.from;
  const replaceTo = selection.empty ? paragraphStart + 2 : selection.to;
  let tr = view.state.tr.insertText(text, replaceFrom, replaceTo);
  tr = tr
    .setSelection(TextSelection.create(tr.doc, replaceFrom + text.length))
    .setMeta(blankAreaDragBoxPluginKey, CLEAR_BLOCKS_ACTION);
  view.dispatch(tr.scrollIntoView());
  return true;
}

export function createEditableMarkdownBlankLineDecorations(doc: EditorState['doc']): DecorationSet {
  const cached = editableMarkdownBlankLineDecorationsCache.get(doc);
  if (cached) return cached;

  const decorations: Decoration[] = [];
  const childCount = typeof doc.childCount === 'number' ? doc.childCount : 0;
  let offset = 0;
  for (
    let index = 0;
    index < childCount && decorations.length < MAX_EDITABLE_MARKDOWN_BLANK_LINE_DECORATIONS;
    index += 1
  ) {
    const node = doc.child(index);
    if (isEditableMarkdownBlankLineNode(node)) {
      decorations.push(Decoration.node(offset, offset + node.nodeSize, {
        class: EDITABLE_MARKDOWN_BLANK_LINE_CLASS,
      }));
    }
    offset += node.nodeSize;
  }
  const decorationSet = decorations.length > 0 ? DecorationSet.create(doc, decorations) : DecorationSet.empty;
  editableMarkdownBlankLineDecorationsCache.set(doc, decorationSet);
  return decorationSet;
}
