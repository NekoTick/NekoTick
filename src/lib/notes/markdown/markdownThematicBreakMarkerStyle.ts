import { getLeadingFrontmatterEndIndex } from './markdownProtectedFrontmatter';
import { isSetextHeadingUnderlineAt } from './markdownHeadingMarkerStyle';
import {
  collectNonCodeProtectedLineIndexes,
  isMarkdownLineInContainer,
  parseMarkdownContainerFenceCloseLine,
  parseMarkdownContainerFenceLine,
} from './markdownFenceProtectedLines';

interface ThematicBreakLine {
  index: number;
  raw: string;
}

interface ThematicBreakCollection {
  breaks: ThematicBreakLine[];
  setextPairs: Map<string, number>;
}

const THEMATIC_BREAK_LINE_PATTERN = /^(?: {0,3})(?:[-*_][ \t]*){3,}$/;

export function restoreThematicBreakMarkerStyleFromReference(
  markdown: string,
  referenceMarkdown?: string,
): string {
  if (!referenceMarkdown || !markdown.includes('---')) return markdown;

  const referenceLines = referenceMarkdown.replace(/\r\n?/g, '\n').split('\n');
  const frontmatterEndIndex = getLeadingFrontmatterEndIndex(referenceLines);
  const referenceCollection = collectThematicBreakLines(referenceLines, frontmatterEndIndex);
  const referenceBreaks = referenceCollection.breaks;
  if (referenceBreaks.every((line) => line.raw.trim() === '---')) return markdown;

  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const outputFrontmatterEndIndex = frontmatterEndIndex === null
    ? null
    : getLeadingFrontmatterEndIndex(lines);
  const breaks = collectThematicBreakLines(
    lines,
    outputFrontmatterEndIndex,
    referenceCollection.setextPairs,
  ).breaks;
  if (breaks.length !== referenceBreaks.length) return markdown;

  let changed = false;
  for (let index = 0; index < breaks.length; index += 1) {
    const line = breaks[index];
    const referenceLine = referenceBreaks[index];
    if (
      !line
      || !referenceLine
      || referenceLine.raw.trim() === '---'
      || line.raw === referenceLine.raw
    ) continue;
    lines[line.index] = referenceLine.raw;
    changed = true;
  }

  return changed ? lines.join('\n') : markdown;
}

function collectThematicBreakLines(
  lines: readonly string[],
  frontmatterEndIndex = getLeadingFrontmatterEndIndex(lines),
  referenceSetextPairs?: ReadonlyMap<string, number>,
): ThematicBreakCollection {
  const breaks: ThematicBreakLine[] = [];
  const setextPairs = new Map<string, number>();
  const remainingReferenceSetextPairs = referenceSetextPairs
    ? new Map(referenceSetextPairs)
    : null;
  const nonCodeProtectedLines = collectNonCodeProtectedLineIndexes(lines, frontmatterEndIndex);
  let activeFence: {
    blockquoteDepth: number;
    containerIndent: number;
    marker: string;
    length: number;
  } | null = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';

    if (nonCodeProtectedLines.has(index)) continue;

    if (activeFence && !isMarkdownLineInContainer(line, activeFence)) {
      activeFence = null;
    }
    if (activeFence) {
      if (parseMarkdownContainerFenceCloseLine(line, activeFence)) {
        activeFence = null;
      }
      continue;
    }
    const fence = parseMarkdownContainerFenceLine(line);
    if (fence && (fence.marker !== '`' || line.indexOf('`', fence.infoStart) === -1)) {
      activeFence = {
        blockquoteDepth: fence.blockquoteDepth,
        containerIndent: fence.containerIndent,
        marker: fence.marker,
        length: fence.length,
      };
      continue;
    }

    if (!THEMATIC_BREAK_LINE_PATTERN.test(line)) continue;

    const setextPair = `${lines[index - 1] ?? ''}\u0000${line}`;
    const isSetextUnderline = remainingReferenceSetextPairs
      ? consumeSetextPair(remainingReferenceSetextPairs, setextPair)
      : !nonCodeProtectedLines.has(index - 1)
        && isSetextHeadingUnderlineAt(lines, index);
    if (isSetextUnderline) {
      if (!referenceSetextPairs) {
        setextPairs.set(setextPair, (setextPairs.get(setextPair) ?? 0) + 1);
      }
      continue;
    }

    breaks.push({ index, raw: line });
  }

  return { breaks, setextPairs };
}

function consumeSetextPair(pairs: Map<string, number>, key: string): boolean {
  const count = pairs.get(key) ?? 0;
  if (count === 0) return false;
  if (count === 1) {
    pairs.delete(key);
  } else {
    pairs.set(key, count - 1);
  }
  return true;
}
