import type { EditorView } from '@milkdown/kit/prose/view';

const TAG_TOKEN_PATTERN_AT_CURSOR = /(?:^|[^\p{L}\p{N}_/-])#([\p{L}\p{N}_/-][\p{L}\p{N}_/-]*)$/u;
const TAG_TOKEN_CONTINUATION_PATTERN = /^[\p{L}\p{N}_/-]$/u;
const MAX_TAG_TOKEN_BOUNDARY_LOOKBEHIND_CHARS = 256;

export function isTagTokenBoundaryAtTextblock(
  parent: { content?: { size?: number }; textBetween: (from: number, to: number, blockSeparator?: string, leafText?: string) => string },
  offset: number,
): boolean {
  const contentSize = parent.content?.size;
  if (typeof contentSize !== 'number' || offset < 0 || offset > contentSize) {
    return false;
  }

  const beforeStart = Math.max(0, offset - MAX_TAG_TOKEN_BOUNDARY_LOOKBEHIND_CHARS);
  const before = parent.textBetween(beforeStart, offset, '\0', '\0');
  const afterEnd = Math.min(contentSize, offset + 1);
  const nextChar = offset < contentSize ? parent.textBetween(offset, afterEnd, '\0', '\0') : '';
  const tokenBeforeCursor = TAG_TOKEN_PATTERN_AT_CURSOR.exec(before)?.[0] ?? '';

  return Boolean(
    tokenBeforeCursor &&
    (!nextChar || !TAG_TOKEN_CONTINUATION_PATTERN.test(nextChar)),
  );
}

export function isTagTokenBoundary(view: EditorView): boolean {
  const { selection } = view.state;
  if (!selection.empty || !selection.$from.parent.isTextblock) {
    return false;
  }

  return isTagTokenBoundaryAtTextblock(selection.$from.parent, selection.$from.parentOffset);
}

export function isHorizontalRuleSourceEnd(view: EditorView): boolean {
  const { selection } = view.state;
  if (
    !selection.empty
    || selection.$from.parent.type.name !== 'hr'
    || selection.$from.parentOffset !== selection.$from.parent.content.size
  ) return false;

  return selection.$from.nodeBefore?.marks.some((mark) => (
    mark.type.name === 'markdownSyntax' && mark.attrs.kind === 'hr'
  )) === true;
}
