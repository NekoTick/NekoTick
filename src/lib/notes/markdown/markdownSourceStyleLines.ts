import { mapMarkdownOutsideProtectedBlocks } from './markdownProtectedBlocks';

export interface MarkdownSourceStyleLine {
  protected: boolean;
  text: string;
}

export function collectMarkdownSourceStyleLines(markdown: string): MarkdownSourceStyleLine[] {
  const normalized = markdown.replace(/\r\n?/g, '\n');
  const lines = normalized.split('\n');
  const editableLines = Array.from({ length: lines.length }, () => false);

  mapMarkdownOutsideProtectedBlocks(normalized, (line, index) => {
    editableLines[index] = true;
    return line;
  });

  return lines.map((text, index) => ({
    protected: !editableLines[index],
    text,
  }));
}
