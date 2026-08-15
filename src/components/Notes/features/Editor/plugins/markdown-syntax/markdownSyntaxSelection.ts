import type { EditorState } from '@milkdown/kit/prose/state';

export function getSelectedMarkdownSyntaxText(state: EditorState): string | null {
  const { doc, selection } = state;
  const syntaxMarkType = state.schema.marks.markdownSyntax;
  if (
    selection.empty
    || !syntaxMarkType
    || !doc.rangeHasMark(selection.from, selection.to, syntaxMarkType)
  ) return null;

  let containsInlineAtom = false;
  doc.nodesBetween(selection.from, selection.to, (node) => {
    if (node.isInline && !node.isText) {
      containsInlineAtom = true;
      return false;
    }
    return !containsInlineAtom;
  });
  return containsInlineAtom
    ? null
    : doc.textBetween(selection.from, selection.to, '\n', '');
}
