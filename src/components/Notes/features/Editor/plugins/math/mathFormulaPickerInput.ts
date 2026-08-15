export function insertMathFormulaSnippet(textarea: HTMLTextAreaElement, snippet: string) {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const selected = textarea.value.slice(start, end);
  const inserted = selected && snippet.includes('{}')
    ? snippet.replace('{}', `{${selected}}`)
    : snippet;

  textarea.setRangeText(inserted, start, end, 'end');
  const firstPlaceholder = inserted.indexOf('{}');
  const cursor = firstPlaceholder >= 0
    ? start + firstPlaceholder + 1
    : start + inserted.length;
  textarea.setSelectionRange(cursor, cursor);
  textarea.focus();
}

export function jumpToMathFormulaPlaceholder(
  textarea: HTMLTextAreaElement,
  backwards: boolean,
) {
  const cursor = textarea.selectionStart;
  const placeholders = Array.from(textarea.value.matchAll(/\{\s*\}/g), (match) => ({
    start: match.index,
    end: match.index + match[0].length,
  }));
  const target = backwards
    ? placeholders.filter((placeholder) => placeholder.end < cursor).at(-1)
    : placeholders.find((placeholder) => placeholder.start >= cursor);
  if (!target) return false;
  textarea.setSelectionRange(target.start + 1, target.end - 1);
  return true;
}
