interface MarkdownParserState {
  addText: (text: string) => void;
  closeMark: (markType: any) => void;
  openMark: (markType: any, attrs?: Record<string, unknown>) => void;
  schema: { marks: Record<string, any> };
}

export type MarkdownSyntaxEdge = 'close' | 'open' | 'prefix';

export function addMarkdownSyntax(
  state: MarkdownParserState,
  text: string,
  kind: string,
  edge: MarkdownSyntaxEdge,
): void {
  const markType = state.schema.marks.markdownSyntax;
  if (!markType || !text) return;

  state.openMark(markType, { edge, kind });
  state.addText(text);
  state.closeMark(markType);
}

export function applyDelimitedInputRule(
  state: any,
  match: RegExpMatchArray,
  start: number,
  end: number,
  markName: string,
): any {
  const text = match[1];
  const markType = state.schema.marks[markName];
  const syntaxMarkType = state.schema.marks.markdownSyntax;
  if (!text || !markType || !syntaxMarkType) return null;

  const textStart = start + match[0].indexOf(text);
  const textEnd = textStart + text.length;
  const storedMarks = state.storedMarks ?? [];
  return state.tr
    .addMark(start, textStart, syntaxMarkType.create({ edge: 'open', kind: markName }))
    .addMark(textStart, textEnd, markType.create())
    .addMark(textEnd, end, syntaxMarkType.create({ edge: 'close', kind: markName }))
    .setStoredMarks(storedMarks);
}
