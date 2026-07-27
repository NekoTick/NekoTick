import {
  collectMarkdownSourceStyleLines,
  type MarkdownSourceStyleLine,
} from './markdownSourceStyleLines';

interface ReferenceDefinition {
  blankLineCountAfter: number;
  blankLineCountBefore: number;
  destination: string;
  endIndex: number;
  index: number;
  label: string;
  lines: string[];
  nextAnchor: string | null;
  previousAnchor: string | null;
  title: string;
}

interface ReferenceDefinitions {
  all: ReferenceDefinition[];
  byLabel: Map<string, ReferenceDefinition>;
}

interface ReferenceUsage {
  definition: ReferenceDefinition;
  prefix: string;
  raw: string;
  text: string;
}

const REFERENCE_DEFINITION_PATTERN = /^(?: {0,3})\[((?:\\.|[^\\\]\n])+)\]:[ \t]*(.*)$/;
const FULL_OR_COLLAPSED_REFERENCE_LINK_PATTERN = /(^|[^!])\[([^\]\n]+)]\[([^\]\n]*)]/g;
const SHORTCUT_REFERENCE_LINK_PATTERN = /(^|[^!\]])\[([^\]\n]+)](?![[(])/g;

export function restoreReferenceLinkStyleFromReference(
  markdown: string,
  referenceMarkdown?: string,
): string {
  if (!referenceMarkdown || !referenceMarkdown.includes(']:')) return markdown;

  const definitions = collectReferenceDefinitions(referenceMarkdown);
  if (definitions.all.length === 0) return markdown;

  const usages = collectReferenceUsages(referenceMarkdown, definitions);
  const lines = collectMarkdownSourceStyleLines(markdown);

  for (const usage of usages) {
    replaceFirstInlineLink(lines, usage);
  }

  const outputLines = lines.map((line) => line.text);
  insertMissingDefinitions(outputLines, definitions.all);
  const output = outputLines.join('\n');
  return output === markdown ? markdown : output;
}

export function collectMarkdownReferenceLinkDestinations(markdown: string): string[] {
  if (!markdown.includes(']:')) return [];
  const definitions = collectReferenceDefinitions(markdown);
  if (definitions.all.length === 0) return [];
  return collectReferenceUsages(markdown, definitions).map((usage) => usage.definition.destination);
}

function collectReferenceDefinitions(markdown: string): ReferenceDefinitions {
  const all: ReferenceDefinition[] = [];
  const byLabel = new Map<string, ReferenceDefinition>();
  const lines = collectMarkdownSourceStyleLines(markdown);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line || line.protected) continue;

    const match = REFERENCE_DEFINITION_PATTERN.exec(line.text);
    if (!match) continue;

    const parsed = parseReferenceDefinition(lines, index, match[2] ?? '');
    if (!parsed) continue;

    const definition = {
      blankLineCountAfter: countAdjacentBlankLines(lines, parsed.endIndex + 1, 1),
      blankLineCountBefore: countAdjacentBlankLines(lines, index - 1, -1),
      destination: parsed.destination,
      endIndex: parsed.endIndex,
      index,
      label: match[1] ?? '',
      lines: lines.slice(index, parsed.endIndex + 1).map(({ text }) => text),
      nextAnchor: findAdjacentNonBlankLine(lines, parsed.endIndex + 1, 1),
      previousAnchor: findAdjacentNonBlankLine(lines, index - 1, -1),
      title: parsed.title,
    };
    all.push(definition);

    const normalizedLabel = normalizeReferenceLabel(definition.label);
    if (!byLabel.has(normalizedLabel)) {
      byLabel.set(normalizedLabel, definition);
    }
    index = parsed.endIndex;
  }

  return { all, byLabel };
}

function collectReferenceUsages(
  markdown: string,
  definitions: ReferenceDefinitions,
): ReferenceUsage[] {
  const usages: ReferenceUsage[] = [];
  const lines = collectMarkdownSourceStyleLines(markdown);
  const definitionLineIndexes = new Set(definitions.all.flatMap((definition) =>
    Array.from(
      { length: definition.endIndex - definition.index + 1 },
      (_, offset) => definition.index + offset,
    )
  ));

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line || line.protected || definitionLineIndexes.has(index)) continue;
    const lineUsages: Array<{ column: number; usage: ReferenceUsage }> = [];

    for (const match of line.text.matchAll(FULL_OR_COLLAPSED_REFERENCE_LINK_PATTERN)) {
      const leadingText = match[1] ?? '';
      const column = (match.index ?? 0) + leadingText.length;
      const raw = match[0].slice(leadingText.length);
      const text = match[2] ?? '';
      const label = match[3] || text;
      const definition = definitions.byLabel.get(normalizeReferenceLabel(label));
      if (definition) {
        lineUsages.push({
          column,
          usage: { definition, prefix: line.text.slice(0, column), raw, text },
        });
      }
    }

    for (const match of line.text.matchAll(SHORTCUT_REFERENCE_LINK_PATTERN)) {
      const leadingText = match[1] ?? '';
      const column = (match.index ?? 0) + leadingText.length;
      const raw = match[0].slice(leadingText.length);
      if (raw.includes('][')) continue;

      const text = match[2] ?? '';
      const definition = definitions.byLabel.get(normalizeReferenceLabel(text));
      if (definition) {
        lineUsages.push({
          column,
          usage: { definition, prefix: line.text.slice(0, column), raw, text },
        });
      }
    }

    lineUsages.sort((left, right) => left.column - right.column);
    usages.push(...lineUsages.map(({ usage }) => usage));
  }

  return usages;
}

function replaceFirstInlineLink(
  lines: ReturnType<typeof collectMarkdownSourceStyleLines>,
  usage: ReferenceUsage,
): boolean {
  const candidates = createInlineLinkCandidates(usage);

  for (const requireSourcePrefix of [true, false]) {
    for (const line of lines) {
      if (line.protected) continue;

      for (const candidate of candidates) {
        let searchStart = 0;
        while (searchStart < line.text.length) {
          const index = line.text.indexOf(candidate, searchStart);
          if (index < 0) break;
          searchStart = index + candidate.length;
          if (isInsideInlineCode(line.text, index)) continue;
          if (requireSourcePrefix && line.text.slice(0, index) !== usage.prefix) continue;

          line.text = `${line.text.slice(0, index)}${usage.raw}${line.text.slice(index + candidate.length)}`;
          return true;
        }
      }
    }
  }

  return false;
}

function createInlineLinkCandidates(usage: ReferenceUsage): string[] {
  const title = usage.definition.title ? ` ${usage.definition.title}` : '';
  const textCandidates = Array.from(new Set([
    usage.text,
    usage.text.replace(/\\([[\]])/g, '$1'),
  ]));
  const destinationCandidates = createDestinationCandidates(usage.definition.destination);

  return textCandidates.flatMap((text) =>
    destinationCandidates.map((destination) => `[${text}](${destination}${title})`)
  );
}

function createDestinationCandidates(destination: string): string[] {
  const formatted = formatInlineDestination(destination);
  return Array.from(new Set([
    formatted,
    formatted.replace(/&/g, '\\&'),
  ]));
}

function insertMissingDefinitions(
  lines: string[],
  definitions: readonly ReferenceDefinition[],
): void {
  const existingDefinitionCounts = countExistingDefinitionBlocks(lines, definitions);

  if (lines.length === 1 && lines[0] === '') {
    lines.length = 0;
  }

  for (const definition of definitions) {
    const key = definition.lines.join('\n');
    const existingCount = existingDefinitionCounts.get(key) ?? 0;
    if (existingCount > 0) {
      existingDefinitionCounts.set(key, existingCount - 1);
      continue;
    }

    insertMissingDefinition(lines, definition);
  }
}

function insertMissingDefinition(lines: string[], definition: ReferenceDefinition): void {
  const nextAnchorIndex = definition.nextAnchor === null
    ? -1
    : lines.indexOf(definition.nextAnchor);
  const previousAnchorIndex = definition.previousAnchor === null
    ? -1
    : findLastLineIndex(lines, definition.previousAnchor, nextAnchorIndex < 0 ? lines.length : nextAnchorIndex);
  const blankLinesBefore = Array.from({ length: definition.blankLineCountBefore }, () => '');
  const blankLinesAfter = Array.from({ length: definition.blankLineCountAfter }, () => '');
  const replacement = [...blankLinesBefore, ...definition.lines, ...blankLinesAfter];

  if (previousAnchorIndex >= 0) {
    const regionStart = previousAnchorIndex + 1;
    let regionEnd = regionStart;
    while (regionEnd < lines.length && (lines[regionEnd] ?? '').trim() === '') {
      regionEnd += 1;
    }
    lines.splice(regionStart, regionEnd - regionStart, ...replacement);
    return;
  }

  if (nextAnchorIndex >= 0) {
    let regionStart = nextAnchorIndex;
    while (regionStart > 0 && (lines[regionStart - 1] ?? '').trim() === '') {
      regionStart -= 1;
    }
    lines.splice(regionStart, nextAnchorIndex - regionStart, ...replacement);
    return;
  }

  const insertIndex = Math.min(definition.index, lines.length);
  lines.splice(insertIndex, 0, ...replacement);
}

function findLastLineIndex(lines: readonly string[], value: string, endExclusive: number): number {
  for (let index = Math.min(endExclusive, lines.length) - 1; index >= 0; index -= 1) {
    if (lines[index] === value) return index;
  }
  return -1;
}

function findAdjacentNonBlankLine(
  lines: readonly MarkdownSourceStyleLine[],
  startIndex: number,
  direction: -1 | 1,
): string | null {
  for (
    let index = startIndex;
    index >= 0 && index < lines.length;
    index += direction
  ) {
    const line = lines[index]?.text ?? '';
    if (line.trim() !== '') return line;
  }
  return null;
}

function countAdjacentBlankLines(
  lines: readonly MarkdownSourceStyleLine[],
  startIndex: number,
  direction: -1 | 1,
): number {
  let count = 0;
  for (
    let index = startIndex;
    index >= 0 && index < lines.length && (lines[index]?.text ?? '').trim() === '';
    index += direction
  ) {
    count += 1;
  }
  return count;
}

function countExistingDefinitionBlocks(
  lines: readonly string[],
  definitions: readonly ReferenceDefinition[],
): Map<string, number> {
  const counts = new Map<string, number>();
  const uniqueDefinitions = new Map(definitions.map((definition) => [
    definition.lines.join('\n'),
    definition.lines,
  ]));

  for (const [key, definitionLines] of uniqueDefinitions) {
    let count = 0;
    for (let index = 0; index <= lines.length - definitionLines.length; index += 1) {
      if (definitionLines.every((line, offset) => lines[index + offset] === line)) {
        count += 1;
        index += definitionLines.length - 1;
      }
    }
    counts.set(key, count);
  }

  return counts;
}

function parseReferenceDefinition(
  lines: readonly MarkdownSourceStyleLine[],
  index: number,
  firstLineRest: string,
): { destination: string; endIndex: number; title: string } | null {
  let destinationIndex = index;
  let rest = firstLineRest;
  if (rest.trim() === '') {
    destinationIndex += 1;
    const destinationLine = lines[destinationIndex];
    if (!destinationLine || destinationLine.protected || destinationLine.text.trim() === '') {
      return null;
    }
    rest = destinationLine.text;
  }

  const parsed = parseDefinitionRest(rest);
  if (!parsed) return null;

  let endIndex = destinationIndex;
  let title = parsed.title;
  if (!title) {
    const titleLine = lines[destinationIndex + 1];
    const titleSource = titleLine?.text.trim() ?? '';
    if (titleLine && !titleLine.protected && isReferenceTitleSource(titleSource)) {
      title = titleSource;
      endIndex += 1;
    }
  }

  return {
    destination: parsed.destination,
    endIndex,
    title,
  };
}

function parseDefinitionRest(rest: string): { destination: string; title: string } | null {
  const trimmed = rest.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('<')) {
    const closeIndex = findUnescapedCharacter(trimmed, '>');
    if (closeIndex < 0) return null;
    const title = trimmed.slice(closeIndex + 1).trim();
    if (title && !isReferenceTitleSource(title)) return null;
    return {
      destination: trimmed.slice(1, closeIndex),
      title,
    };
  }

  const match = /^(\S+)(?:[ \t]+(.+))?$/.exec(trimmed);
  if (!match) return null;
  const title = (match[2] ?? '').trim();
  if (title && !isReferenceTitleSource(title)) return null;

  return {
    destination: match[1] ?? '',
    title,
  };
}

function findUnescapedCharacter(value: string, character: string): number {
  for (let index = 1; index < value.length; index += 1) {
    if (value[index] === character && value[index - 1] !== '\\') return index;
  }
  return -1;
}

function isReferenceTitleSource(value: string): boolean {
  return /^(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\((?:\\.|[^)\\])*\))$/.test(value);
}

function formatInlineDestination(destination: string): string {
  return /[\s()]/.test(destination) ? `<${destination}>` : destination;
}

function normalizeReferenceLabel(label: string): string {
  return label.trim().replace(/\s+/g, ' ').toLowerCase();
}

function isInsideInlineCode(line: string, index: number): boolean {
  let open = false;
  for (let cursor = 0; cursor < index; cursor += 1) {
    if (line[cursor] !== '`' || line[cursor - 1] === '\\') continue;
    open = !open;
  }
  return open;
}
