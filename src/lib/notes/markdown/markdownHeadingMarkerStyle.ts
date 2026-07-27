import { collectMarkdownSourceStyleLines } from './markdownSourceStyleLines';

interface HeadingReference {
  key: string;
  raw: string[];
}

const SETEXT_HEADING_UNDERLINE_PATTERN = /^(?: {0,3})(=+|-+)[ \t]*$/;
const ATX_HEADING_PATTERN = /^( {0,3})(#{1,6})[ \t]+(.+?)(?:[ \t]+#+)?[ \t]*$/;
const NON_PARAGRAPH_SETEXT_PREDECESSOR_PATTERN =
  /^(?: {4,}|\t| {0,3}(?:#{1,6}(?:[ \t]+|$)|(?:[-*_][ \t]*){3,}|`{3,}|~{3,}|\$\$|\\\[|(?:[-+*]|\d+[.)])(?:[ \t]+|$)|>|\[TOC\][ \t]*$|\*\[[^\]]+]:|\[\^[^\]]+]:|\[[^\]]+]:|:\s+\S|\|.*\|[ \t]*$))/i;

export function restoreSetextHeadingStyleFromReference(
  markdown: string,
  referenceMarkdown?: string,
): string {
  if (!referenceMarkdown || !markdown.includes('#')) return markdown;

  const referenceHeadings = collectHeadingReferences(
    referenceMarkdown.replace(/\r\n?/g, '\n').split('\n'),
  );
  if (referenceHeadings.length === 0) return markdown;

  const referenceByKey = new Map<string, string[][]>();
  for (const heading of referenceHeadings) {
    const headings = referenceByKey.get(heading.key) ?? [];
    headings.push(heading.raw);
    referenceByKey.set(heading.key, headings);
  }

  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const protectedLines = collectProtectedLines(lines);
  const output: string[] = [];
  let changed = false;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    if (protectedLines[index]) {
      output.push(line);
      continue;
    }

    const key = getAtxHeadingKey(line);
    const referenceRaw = key ? referenceByKey.get(key)?.shift() : undefined;
    if (referenceRaw) {
      output.push(...referenceRaw);
      changed ||= referenceRaw.length !== 1 || referenceRaw[0] !== line;
      continue;
    }
    output.push(line);
  }

  return changed ? output.join('\n') : markdown;
}

function collectHeadingReferences(lines: readonly string[]): HeadingReference[] {
  const headings: HeadingReference[] = [];
  const protectedLines = collectProtectedLines(lines);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    if (protectedLines[index]) continue;

    const atxKey = getAtxHeadingKey(line);
    if (atxKey) {
      headings.push({ key: atxKey, raw: [line] });
      continue;
    }

    const underlineIndex = index + 1;
    const underline = lines[underlineIndex] ?? '';
    const underlineMatch = SETEXT_HEADING_UNDERLINE_PATTERN.exec(underline);
    if (
      !underlineMatch
      || protectedLines[underlineIndex]
      || protectedLines[index]
      || !isSetextHeadingUnderlineAt(lines, underlineIndex)
    ) continue;

    const level = (underlineMatch[1] ?? '').startsWith('=') ? 1 : 2;
    headings.push({
      key: `${level}\u0000${line.trim()}`,
      raw: [line, underline],
    });
    index += 1;
  }

  return headings;
}

export function isSetextHeadingUnderlineAt(
  lines: readonly string[],
  index: number,
): boolean {
  if (!SETEXT_HEADING_UNDERLINE_PATTERN.test(lines[index] ?? '')) return false;
  const previousLine = lines[index - 1] ?? '';
  return previousLine.trim() !== ''
    && !NON_PARAGRAPH_SETEXT_PREDECESSOR_PATTERN.test(previousLine);
}

function collectProtectedLines(lines: readonly string[]): boolean[] {
  return collectMarkdownSourceStyleLines(lines.join('\n')).map((line) => line.protected);
}

function getAtxHeadingKey(line: string): string | null {
  const match = ATX_HEADING_PATTERN.exec(line);
  if (!match) return null;

  const level = (match[2] ?? '').length;
  return `${level}\u0000${(match[3] ?? '').trim()}`;
}
