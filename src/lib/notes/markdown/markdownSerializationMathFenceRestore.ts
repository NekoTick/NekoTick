import { mapMarkdownOutsideProtectedSegments } from './markdownProtectedBlocks';
import {
  getAlternativeMathBlockClose,
  getAlternativeMathBlockOpen,
  isLatexLikeMathBlock,
  parseStandaloneMathBlockLine,
  stripSingleTrailingBackslash,
} from './markdownSerializationMathFences';
import {
  isMarkdownLineInContainer,
  type MarkdownContainerMathFenceLine,
  parseMarkdownContainerMathFenceLine,
  parseMarkdownContainerMathFenceLineInContainer,
} from './markdownFenceProtectedLines';
import {
  DollarMathFenceMatch,
  MathBlockFenceReference, MathBlockFenceReferenceIndex,
} from './markdownSerializationShared';

export function restoreMathBlockFenceStylesFromReference(markdown: string, reference: string): string {
  const references = collectMathBlockFenceReferences(reference);
  if (references.length === 0) return markdown;

  const referenceIndex = createMathBlockFenceReferenceIndex(references);
  let nextReferenceIndex = 0;
  return mapMarkdownOutsideProtectedSegments(markdown, (segment) => {
    const lines = segment.split('\n');
    const dollarFenceMatches = collectDollarMathFenceMatches(lines);
    const output: string[] = [];

    for (let index = 0; index < lines.length; index += 1) {
      const match = dollarFenceMatches.get(index);
      if (!match) {
        output.push(lines[index]);
        continue;
      }

      const referenceMatch = takeMatchingMathBlockFenceReference(
        references,
        referenceIndex,
        normalizeMathBlockLatex(joinLineRange(lines, index + 1, match.closeIndex)),
        nextReferenceIndex
      );
      nextReferenceIndex = referenceMatch.nextIndex;

      const singleLineLatex = match.closeIndex === index + 2
        ? stripMathContainerPrefix(lines[index + 1] ?? '', match.contentPrefix)
        : null;
      const referenceFence = referenceMatch.reference;
      if (referenceFence?.style === 'dollar-inline' && singleLineLatex !== null) {
        output.push(`${match.prefix}$$${singleLineLatex}$$`);
      } else if (referenceFence?.style === 'bracket-inline' && singleLineLatex !== null) {
        output.push(`${match.prefix}\\[${singleLineLatex}\\]`);
      } else if (referenceFence?.style === 'bracket') {
        output.push(`${match.prefix}\\[`);
        for (let cursor = index + 1; cursor < match.closeIndex; cursor += 1) {
          output.push(lines[cursor] ?? '');
        }
        output.push(`${match.closePrefix}\\]`);
      } else if (
        referenceFence?.style === 'dollar'
        && referenceFence.openFenceLength !== undefined
        && referenceFence.closeFenceLength !== undefined
      ) {
        output.push(`${match.prefix}${'$'.repeat(referenceFence.openFenceLength)}`);
        for (let cursor = index + 1; cursor < match.closeIndex; cursor += 1) {
          output.push(lines[cursor] ?? '');
        }
        output.push(`${match.closePrefix}${'$'.repeat(referenceFence.closeFenceLength)}`);
      } else {
        for (let cursor = index; cursor <= match.closeIndex; cursor += 1) {
          output.push(lines[cursor] ?? '');
        }
      }
      index = match.closeIndex;
    }

    return output.join('\n');
  }, { protectMathBlocks: false });
}

export function takeMatchingMathBlockFenceReference(
  references: readonly MathBlockFenceReference[],
  referenceIndex: MathBlockFenceReferenceIndex,
  latex: string,
  startIndex: number
): { nextIndex: number; reference: MathBlockFenceReference | null } {
  const direct = references[startIndex];
  if (direct && referenceIndex.normalizedLatexes[startIndex] === latex) {
    return { reference: direct, nextIndex: startIndex + 1 };
  }

  const matchIndex = findNextMathBlockFenceReferenceIndex(
    referenceIndex.byLatex.get(latex) ?? [],
    startIndex
  );
  if (matchIndex !== null) {
    return { reference: references[matchIndex] ?? null, nextIndex: matchIndex + 1 };
  }

  return { reference: null, nextIndex: startIndex };
}

export function createMathBlockFenceReferenceIndex(
  references: readonly MathBlockFenceReference[]
): MathBlockFenceReferenceIndex {
  const byLatex = new Map<string, number[]>();
  const normalizedLatexes: string[] = [];

  references.forEach((reference, index) => {
    const latex = normalizeMathBlockLatex(reference.latex);
    normalizedLatexes.push(latex);
    const indexes = byLatex.get(latex);
    if (indexes) {
      indexes.push(index);
    } else {
      byLatex.set(latex, [index]);
    }
  });

  return { byLatex, normalizedLatexes };
}

export function findNextMathBlockFenceReferenceIndex(
  indexes: readonly number[],
  startIndex: number
): number | null {
  let low = 0;
  let high = indexes.length - 1;
  let result: number | null = null;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const index = indexes[mid] ?? 0;
    if (index <= startIndex) {
      low = mid + 1;
    } else {
      result = index;
      high = mid - 1;
    }
  }

  return result;
}

export function collectDollarMathFenceMatches(lines: readonly string[]): Map<number, DollarMathFenceMatch> {
  const matches = new Map<number, DollarMathFenceMatch>();
  let active: {
    blockquoteDepth: number;
    containerIndent: number;
    contentPrefix: string;
    length: number;
    openIndex: number;
    prefix: string;
  } | null = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    if (active && !isMarkdownLineInContainer(line, active)) {
      active = null;
    }
    const fence: MarkdownContainerMathFenceLine | null = active
      ? parseMarkdownContainerMathFenceLineInContainer(line, active)
      : parseMarkdownContainerMathFenceLine(line);
    if (active) {
      if (
        fence?.kind !== 'dollar'
        || fence.blockquoteDepth !== active.blockquoteDepth
        || fence.length < active.length
      ) {
        continue;
      }

      matches.set(active.openIndex, {
        closeFenceLength: fence.length,
        closeIndex: index,
        closePrefix: line.slice(0, fence.markerStart),
        contentPrefix: active.contentPrefix,
        openFenceLength: active.length,
        prefix: active.prefix,
      });
      active = null;
      continue;
    }

    if (fence?.kind === 'dollar') {
      active = {
        blockquoteDepth: fence.blockquoteDepth,
        containerIndent: fence.containerIndent,
        contentPrefix: fence.continuationPrefix,
        length: fence.length,
        openIndex: index,
        prefix: line.slice(0, fence.markerStart),
      };
    }
  }

  return matches;
}

export function joinLineRange(lines: readonly string[], start: number, end: number): string {
  let output = '';
  for (let index = start; index < end; index += 1) {
    if (index > start) output += '\n';
    output += lines[index] ?? '';
  }
  return output;
}

export function collectMathBlockFenceReferences(markdown: string): MathBlockFenceReference[] {
  const references: MathBlockFenceReference[] = [];
  mapMarkdownOutsideProtectedSegments(markdown, (segment) => {
    collectMathBlockFenceReferencesFromSegment(segment, references);
    return segment;
  }, { protectMathBlocks: false });
  return references;
}

export function collectMathBlockFenceReferencesFromSegment(
  segment: string,
  references: MathBlockFenceReference[]
): void {
  const lines = segment.split('\n');
  const dollarFenceMatches = collectDollarMathFenceMatches(lines);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    const standalone = parseStandaloneMathBlockLine(line);
    if (standalone) {
      references.push({
        latex: `${standalone.continuationPrefix}${standalone.latex}`,
        style: standalone.style,
      });
      continue;
    }

    const dollarMatch = dollarFenceMatches.get(index);
    if (dollarMatch) {
      references.push({
        closeFenceLength: dollarMatch.closeFenceLength,
        latex: joinLineRange(lines, index + 1, dollarMatch.closeIndex),
        openFenceLength: dollarMatch.openFenceLength,
        style: 'dollar',
      });
      index = dollarMatch.closeIndex;
      continue;
    }

    const alternativeOpen = getAlternativeMathBlockOpen(line);
    if (!alternativeOpen) continue;

    const pendingFence = alternativeOpen;
    const content: string[] = [];
    let closeIndex = -1;
    let inlineCloseContent: string | null = null;

    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      if (!isMarkdownLineInContainer(lines[cursor] ?? '', pendingFence)) break;
      const close = getAlternativeMathBlockClose(lines[cursor], pendingFence);
      if (close) {
        inlineCloseContent = close.contentLine;
        if (close.bracketClose && inlineCloseContent === null && content.length > 0) {
          const lastIndex = content.length - 1;
          content[lastIndex] = stripSingleTrailingBackslash(content[lastIndex] ?? '');
        } else if (close.bracketClose && inlineCloseContent !== null) {
          inlineCloseContent = stripSingleTrailingBackslash(inlineCloseContent);
        }
        closeIndex = cursor;
        break;
      }
      content.push(lines[cursor]);
    }

    if (closeIndex < 0) continue;
    const fullContent = inlineCloseContent === null ? content : [...content, inlineCloseContent];
    if (!pendingFence.bracketOnlyFence || isLatexLikeMathBlock(fullContent)) {
      references.push({
        latex: fullContent.join('\n'),
        style: 'bracket',
      });
      index = closeIndex;
    }
  }
}

function stripMathContainerPrefix(line: string, prefix: string): string {
  return prefix && line.startsWith(prefix) ? line.slice(prefix.length) : line;
}

export function normalizeMathBlockLatex(latex: string): string {
  return latex.replace(/\r\n?/g, '\n').trim();
}
