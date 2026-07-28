import { preserveMarkdownBlankLinesForEditor } from '@/lib/notes/markdown/markdownEditorBlankLines';
import {
  getMarkdownContentInContainer,
  isMarkdownContainerMathFenceCloseLine,
  isMarkdownLineInContainer,
  parseMarkdownContainerLinePrefix,
  parseMarkdownContainerMathFenceLine,
} from '@/lib/notes/markdown/markdownContainerParsing';
import {
  getMarkdownRawHtmlBlockClosePattern,
  isHtmlBlockCloseLine,
} from '@/lib/notes/markdown/markdownProtectedHtmlBlocks';
import { collectMarkdownProtectedLineInfo } from '@/lib/notes/markdown/markdownFenceProtectedLines';
import { isAlignmentCommentLine } from '@/lib/notes/markdown/markdownBlankLineBoundaries';
import { parseMermaidFenceLanguage } from '@/components/common/markdown/mermaidLanguage';
import {
  canStartIndentedCodeBlock,
  findFenceEnd,
  findLeadingFrontmatterEnd,
  isAtxHeadingLine,
  isBlank,
  isBlockStart,
  isBodyLineBoundary,
  isFenceClosingLine,
  isFenceStart,
  isHiddenDefinitionLine,
  isIndentedCodeLine,
  isListItemLine,
  isNonNumberedMarkdownBodyLinePlaceholder,
  isNumberedMarkdownBodyLinePlaceholder,
  isSetextHeadingStart,
  isTableSeparatorLine,
  isThematicBreakLine,
  isUnsupportedSelfClosingRawMediaLine,
  normalizeLineEndings,
} from './bodyLineNumberSyntax';
export {
  isInternalMarkdownBodyLinePlaceholder,
  isNonNumberedMarkdownBodyLinePlaceholder,
  isNumberedMarkdownBodyLinePlaceholder,
} from './bodyLineNumberSyntax';

function isBlankAdjacentToUnsupportedSelfClosingRawMedia(lines: readonly string[], index: number): boolean {
  const line = lines[index] ?? '';
  if (!isBlank(line) && !isNumberedMarkdownBodyLinePlaceholder(line)) return false;

  return isUnsupportedSelfClosingRawMediaLine(lines[index - 1] ?? '')
    || isUnsupportedSelfClosingRawMediaLine(lines[index + 1] ?? '');
}

function findUnsupportedSelfClosingRawMediaGroupEnd(
  lines: readonly string[],
  startIndex: number,
): number {
  let endIndex = startIndex;
  let cursor = startIndex + 1;

  while (cursor < lines.length) {
    while (cursor < lines.length && isBodyLineBoundary(lines[cursor] ?? '')) {
      cursor += 1;
    }
    if (!isUnsupportedSelfClosingRawMediaLine(lines[cursor] ?? '')) break;
    endIndex = cursor;
    cursor += 1;
  }

  return endIndex;
}

function findParagraphEnd(lines: readonly string[], startIndex: number): number {
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    if (isBodyLineBoundary(lines[index] ?? '')) {
      return index - 1;
    }

    if (
      (!isAlignmentCommentLine(lines[index] ?? '') && findRawHtmlBlockEnd(lines, index) !== null)
      || isUnsupportedSelfClosingRawMediaLine(lines[index] ?? '')
    ) {
      return index - 1;
    }

    if (isBlockStart(lines[index] ?? '', lines[index + 1])) {
      return index - 1;
    }
  }

  return lines.length - 1;
}

function findQuoteEnd(lines: readonly string[], startIndex: number): number {
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    if (isBodyLineBoundary(line) || !/^\s{0,3}>/.test(line)) {
      return index - 1;
    }
  }

  return lines.length - 1;
}

function findIndentedCodeEnd(lines: readonly string[], startIndex: number): number {
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    if (isBodyLineBoundary(line) || !isIndentedCodeLine(line)) {
      return index - 1;
    }
  }

  return lines.length - 1;
}

function findTableEnd(lines: readonly string[], startIndex: number): number {
  for (let index = startIndex + 2; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    if (isBodyLineBoundary(line) || !line.includes('|')) {
      return index - 1;
    }
  }

  return lines.length - 1;
}

function findMathBlockEnd(lines: readonly string[], startIndex: number): number | null {
  const fence = parseMarkdownContainerMathFenceLine(lines[startIndex] ?? '');
  if (!fence || fence.kind === 'bracket-close') return null;

  const state = {
    blockquoteDepth: fence.blockquoteDepth,
    containerIndent: fence.containerIndent,
    length: fence.length,
    style: fence.kind === 'dollar' ? 'dollar' as const : 'bracket' as const,
  };
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    if (!isMarkdownLineInContainer(line, state)) return null;
    if (isMarkdownContainerMathFenceCloseLine(line, state)) return index;
  }

  return null;
}

function findRawHtmlBlockEnd(lines: readonly string[], startIndex: number): number | null {
  const openingLine = lines[startIndex] ?? '';
  const container = parseMarkdownContainerLinePrefix(openingLine);
  if (!container) return null;
  if (container.blockquoteDepth > 0 || container.containerIndent > 0) return null;

  const openingContent = openingLine.slice(container.markerStart);
  const htmlBlock = getMarkdownRawHtmlBlockClosePattern(openingContent, {
    protectHtmlComments: true,
  });
  if (!htmlBlock) return null;
  if (isHtmlBlockCloseLine(openingContent, htmlBlock)) return startIndex;

  const state = {
    ...htmlBlock,
    blockquoteDepth: container.blockquoteDepth,
    containerIndent: container.containerIndent,
  };
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const content = getMarkdownContentInContainer(lines[index] ?? '', state);
    if (content === null) return index - 1;
    if (isHtmlBlockCloseLine(content, state)) return index;
  }

  return lines.length - 1;
}

function buildBodySourceLineNumbers(lines: readonly string[], bodyStartIndex: number): Array<number | null> {
  const sourceLineNumbers = new Array<number | null>(lines.length).fill(null);
  let sourceLineNumber = 1;

  for (let index = bodyStartIndex; index < lines.length; index += 1) {
    if (isNonNumberedMarkdownBodyLinePlaceholder(lines[index] ?? '')) {
      continue;
    }

    sourceLineNumbers[index] = sourceLineNumber;
    sourceLineNumber += 1;
  }

  return sourceLineNumbers;
}

function parseTopLevelKey(line: string): string | null {
  const match = /^([A-Za-z0-9_-]+)\s*:/.exec(line);
  return match?.[1] ?? null;
}

function hasOnlyHiddenManagedFrontmatter(lines: readonly string[], frontmatterEnd: number): boolean {
  let hasManagedLine = false;
  for (let index = 1; index < frontmatterEnd; index += 1) {
    const line = lines[index] ?? '';
    if (line.trim() === '') {
      continue;
    }

    const key = parseTopLevelKey(line);
    if (!key?.startsWith('vlaina_')) {
      return false;
    }
    hasManagedLine = true;
  }
  return hasManagedLine;
}

function getBodyStartIndex(lines: readonly string[], frontmatterEnd: number): number {
  if (frontmatterEnd < 0) {
    return 0;
  }

  let bodyStartIndex = frontmatterEnd + 1;
  if (
    hasOnlyHiddenManagedFrontmatter(lines, frontmatterEnd)
    && isBodyLineBoundary(lines[bodyStartIndex] ?? '')
  ) {
    bodyStartIndex += 1;
  }
  return bodyStartIndex;
}

export function getMarkdownBodyLineNumbers(markdown: string): number[] {
  const lines = normalizeLineEndings(preserveMarkdownBlankLinesForEditor(markdown)).split('\n');
  const lineNumbers: number[] = [];
  const frontmatterEnd = findLeadingFrontmatterEnd(lines);
  let index = getBodyStartIndex(lines, frontmatterEnd);
  const sourceLineNumbers = buildBodySourceLineNumbers(lines, index);
  const protectedLineInfo = collectMarkdownProtectedLineInfo(lines, frontmatterEnd);
  const pushLineNumber = (lineIndex: number) => {
    const sourceLineNumber = sourceLineNumbers[lineIndex];
    if (sourceLineNumber !== null && sourceLineNumber !== undefined) {
      lineNumbers.push(sourceLineNumber);
    }
  };
  const pushLineNumberRange = (startIndex: number, endExclusive: number) => {
    for (let lineIndex = startIndex; lineIndex < endExclusive; lineIndex += 1) {
      pushLineNumber(lineIndex);
    }
  };

  while (index < lines.length) {
    const line = lines[index] ?? '';
    const nextLine = lines[index + 1];

    if (isNumberedMarkdownBodyLinePlaceholder(line)) {
      if (isBlankAdjacentToUnsupportedSelfClosingRawMedia(lines, index)) {
        index += 1;
        continue;
      }
      pushLineNumber(index);
      index += 1;
      continue;
    }

    if (isNonNumberedMarkdownBodyLinePlaceholder(line)) {
      index += 1;
      continue;
    }

    if (isBodyLineBoundary(line)) {
      index += 1;
      continue;
    }

    if (isAlignmentCommentLine(line)) {
      index += 1;
      continue;
    }

    const rawHtmlBlockEndIndex = findRawHtmlBlockEnd(lines, index);
    if (rawHtmlBlockEndIndex !== null) {
      pushLineNumber(index);
      index = rawHtmlBlockEndIndex + 1;
      continue;
    }

    if (
      protectedLineInfo.nonCodeProtectedLineIndexes.has(index)
      && !protectedLineInfo.containerBlockOpenLineIndexes.has(index)
    ) {
      index += 1;
      continue;
    }

    if (isUnsupportedSelfClosingRawMediaLine(line)) {
      pushLineNumber(index);
      index = findUnsupportedSelfClosingRawMediaGroupEnd(lines, index) + 1;
      continue;
    }

    if (isHiddenDefinitionLine(line)) {
      index += 1;
      continue;
    }

    const mathBlockEndIndex = findMathBlockEnd(lines, index);
    if (mathBlockEndIndex !== null) {
      pushLineNumber(index);
      index = mathBlockEndIndex + 1;
      continue;
    }

    if (isFenceStart(line)) {
      const fenceEndIndex = findFenceEnd(lines, index);
      if (parseMermaidFenceLanguage(line) !== null) {
        pushLineNumber(index);
      } else {
        const contentStartIndex = index + 1;
        const contentEndExclusive = isFenceClosingLine(lines, index, fenceEndIndex)
          ? fenceEndIndex
          : fenceEndIndex + 1;
        if (contentEndExclusive > contentStartIndex) {
          pushLineNumberRange(contentStartIndex, contentEndExclusive);
        } else {
          pushLineNumber(index);
        }
      }
      index = fenceEndIndex + 1;
      continue;
    }

    if (isListItemLine(line)) {
      pushLineNumber(index);
      index += 1;
      continue;
    }

    if (isSetextHeadingStart(line, nextLine)) {
      pushLineNumber(index);
      index += 2;
      continue;
    }

    if (canStartIndentedCodeBlock(lines, index)) {
      const codeEndIndex = findIndentedCodeEnd(lines, index);
      pushLineNumberRange(index, codeEndIndex + 1);
      index = codeEndIndex + 1;
      continue;
    }

    if (/^\s{2,}\S/.test(line)) {
      index += 1;
      continue;
    }

    if (/^\s{0,3}>/.test(line)) {
      pushLineNumber(index);
      index = findQuoteEnd(lines, index) + 1;
      continue;
    }

    if (line.includes('|') && nextLine && isTableSeparatorLine(nextLine)) {
      const tableEndIndex = findTableEnd(lines, index);
      pushLineNumber(index);
      pushLineNumberRange(index + 2, tableEndIndex + 1);
      index = tableEndIndex + 1;
      continue;
    }

    pushLineNumber(index);

    if (isAtxHeadingLine(line) || isThematicBreakLine(line)) {
      index += 1;
      continue;
    }

    index = findParagraphEnd(lines, index) + 1;
  }

  return lineNumbers;
}
