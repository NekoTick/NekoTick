import { collectMarkdownSourceStyleLines } from './markdownSourceStyleLines';

interface AutolinkReference {
  prefix: string;
  raw: string;
  value: string;
}

const AUTOLINK_PATTERN =
  /<((?:https?:\/\/|mailto:)[^\s<>"']+|[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+)>/gi;
const SAME_EMAIL_MAILTO_LINK_PATTERN =
  /(^|[^!])\[([A-Za-z0-9.!#$%&'*+/=?^_{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+)\]\(mailto:([A-Za-z0-9.!#$%&'*+/=?^_{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+)\)/gi;

export function restoreAutolinkStyleFromReference(
  markdown: string,
  referenceMarkdown?: string,
): string {
  if (!referenceMarkdown) return markdown;

  const references = collectAutolinkReferences(referenceMarkdown);
  if (references.length === 0) return markdown;

  const lines = collectMarkdownSourceStyleLines(markdown);
  let changed = false;
  for (const reference of references) {
    const didReplace = replaceFirstPlainValue(
      lines,
      reference.value,
      reference.raw,
      reference.prefix,
    );
    if (didReplace) {
      changed = true;
    }
  }
  return changed ? lines.map((line) => line.text).join('\n') : markdown;
}

function collectAutolinkReferences(markdown: string): AutolinkReference[] {
  const references: AutolinkReference[] = [];
  const lines = collectMarkdownSourceStyleLines(markdown);

  for (const line of lines) {
    if (line.protected) continue;
    const lineReferences: Array<{ column: number; reference: AutolinkReference }> = [];

    for (const match of line.text.matchAll(AUTOLINK_PATTERN)) {
      const column = match.index ?? 0;
      const raw = match[0] ?? '';
      const value = match[1] ?? '';
      if (raw && value) {
        lineReferences.push({
          column,
          reference: { prefix: line.text.slice(0, column), raw, value },
        });
      }
    }

    for (const match of line.text.matchAll(SAME_EMAIL_MAILTO_LINK_PATTERN)) {
      const leadingText = match[1] ?? '';
      const column = (match.index ?? 0) + leadingText.length;
      const raw = match[0]?.slice(leadingText.length) ?? '';
      const label = match[2] ?? '';
      const destination = match[3] ?? '';
      if (raw && label && label.toLowerCase() === destination.toLowerCase()) {
        lineReferences.push({
          column,
          reference: { prefix: line.text.slice(0, column), raw, value: label },
        });
      }
    }

    lineReferences.sort((left, right) => left.column - right.column);
    references.push(...lineReferences.map(({ reference }) => reference));
  }

  return references;
}

function replaceFirstPlainValue(
  lines: ReturnType<typeof collectMarkdownSourceStyleLines>,
  value: string,
  raw: string,
  prefix: string,
): boolean {
  for (const requireSourcePrefix of [true, false]) {
    for (const line of lines) {
      if (line.protected) continue;

      let searchStart = 0;
      while (searchStart < line.text.length) {
        const index = line.text.indexOf(value, searchStart);
        if (index < 0) break;
        searchStart = index + value.length;
        if (requireSourcePrefix && line.text.slice(0, index) !== prefix) continue;

        if (isPlainValueOccurrence(line.text, index, value, raw)) {
          line.text = `${line.text.slice(0, index)}${raw}${line.text.slice(index + value.length)}`;
          return true;
        }
      }
    }
  }

  return false;
}

function isPlainValueOccurrence(line: string, index: number, value: string, raw: string): boolean {
  if (line.slice(index, index + raw.length) === raw) return false;
  if (isInsideInlineCode(line, index)) return false;

  const before = line[index - 1] ?? '';
  const after = line[index + value.length] ?? '';
  if (before === '<' || after === '>') return false;
  if (before === '(' || before === '[' || after === ')' || after === ']') return false;
  if (isValueContinuation(before) || isValueContinuation(after)) return false;

  return true;
}

function isInsideInlineCode(line: string, index: number): boolean {
  let open = false;
  for (let cursor = 0; cursor < index; cursor += 1) {
    if (line[cursor] !== '`' || line[cursor - 1] === '\\') continue;
    open = !open;
  }
  return open;
}

function isValueContinuation(char: string): boolean {
  return /[A-Za-z0-9_/@%+~#=&-]/.test(char);
}
