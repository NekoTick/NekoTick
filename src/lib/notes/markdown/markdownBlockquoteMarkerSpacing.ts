import {
  collectMarkdownSourceStyleLines,
  type MarkdownSourceStyleLine,
} from './markdownSourceStyleLines';

interface MarkdownLineBlock {
  canonical: string;
  end: number;
  raw: string[];
  start: number;
}

interface ParsedBlockquoteLine {
  content: string;
  depth: number;
}


export function restoreBlockquoteMarkerSpacingFromReference(
  markdown: string,
  referenceMarkdown?: string,
): string {
  if (!referenceMarkdown || !markdown.includes('>') || !referenceMarkdown.includes('>')) {
    return markdown;
  }

  const referenceBlocks = collectBlockquoteBlocks(referenceMarkdown.replace(/\r\n?/g, '\n'));
  if (referenceBlocks.length === 0) return markdown;

  const referenceByCanonical = new Map<string, string[][]>();
  let hasSourceSpacingToRestore = false;
  for (const block of referenceBlocks) {
    hasSourceSpacingToRestore ||= block.raw.some(hasCompactBlockquoteMarker);
    const blocks = referenceByCanonical.get(block.canonical) ?? [];
    blocks.push(block.raw);
    referenceByCanonical.set(block.canonical, blocks);
  }
  if (!hasSourceSpacingToRestore) return markdown;

  const lines = collectMarkdownSourceStyleLines(markdown);
  const blocks = collectBlockquoteBlocksFromLines(lines);
  if (blocks.length === 0) return markdown;

  let changed = false;
  const output: string[] = [];
  let cursor = 0;

  for (const block of blocks) {
    output.push(...lines.slice(cursor, block.start).map((line) => line.text));
    const referenceRaw = referenceByCanonical.get(block.canonical)?.shift();
    if (referenceRaw && referenceRaw.join('\n') !== block.raw.join('\n')) {
      output.push(...referenceRaw);
      changed = true;
    } else {
      output.push(...block.raw);
    }
    cursor = block.end;
  }

  output.push(...lines.slice(cursor).map((line) => line.text));
  return changed ? output.join('\n') : markdown;
}

function collectBlockquoteBlocks(markdown: string): MarkdownLineBlock[] {
  return collectBlockquoteBlocksFromLines(collectMarkdownSourceStyleLines(markdown));
}

function collectBlockquoteBlocksFromLines(lines: readonly MarkdownSourceStyleLine[]): MarkdownLineBlock[] {
  const blocks: MarkdownLineBlock[] = [];

  for (let index = 0; index < lines.length;) {
    const line = lines[index];
    if (!line || line.protected || !parseBlockquoteLine(line.text)) {
      index += 1;
      continue;
    }

    const start = index;
    while (
      index < lines.length
      && !lines[index]?.protected
      && parseBlockquoteLine(lines[index]?.text ?? '')
    ) {
      index += 1;
    }

    const raw = lines.slice(start, index).map((line) => line.text);
    const canonical = canonicalizeBlockquoteLines(raw);
    if (canonical) {
      blocks.push({ canonical, end: index, raw, start });
    }
  }

  return blocks;
}

function canonicalizeBlockquoteLines(lines: readonly string[]): string {
  return lines
    .map((line) => {
      const parsed = parseBlockquoteLine(line);
      if (!parsed || parsed.content.trim() === '') return null;
      return `${'>'.repeat(parsed.depth)}${parsed.content}`;
    })
    .filter((line): line is string => line !== null)
    .join('\n');
}

function parseBlockquoteLine(line: string): ParsedBlockquoteLine | null {
  let cursor = 0;
  while (cursor < line.length && cursor < 4 && line[cursor] === ' ') {
    cursor += 1;
  }
  if (cursor > 3 || line[cursor] !== '>') return null;

  let depth = 0;
  while (line[cursor] === '>') {
    depth += 1;
    cursor += 1;
    if (line[cursor] === ' ' || line[cursor] === '\t') {
      cursor += 1;
    }
  }

  return { content: line.slice(cursor), depth };
}

function hasCompactBlockquoteMarker(line: string): boolean {
  let cursor = 0;
  while (cursor < line.length && cursor < 4 && line[cursor] === ' ') {
    cursor += 1;
  }
  if (cursor > 3 || line[cursor] !== '>') return false;

  while (line[cursor] === '>') {
    cursor += 1;
    const next = line[cursor];
    if (next && next !== ' ' && next !== '\t') {
      return true;
    }
    if (next === ' ' || next === '\t') {
      cursor += 1;
    }
  }

  return false;
}
