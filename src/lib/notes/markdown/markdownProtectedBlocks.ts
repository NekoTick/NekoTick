import { getMarkdownBlockContent } from '@/lib/markdown/markdownHtmlBlockClassification';
import {
  getMarkdownRawHtmlBlockClosePattern,
  isHtmlBlockCloseLine,
  type HtmlBlockState,
} from './markdownProtectedHtmlBlocks';
import { getLeadingFrontmatterEndIndex } from './markdownProtectedFrontmatter';
import {
  getMarkdownContentInContainer,
  isMarkdownContainerMathFenceCloseLine,
  isMarkdownLineInContainer,
  type MarkdownContainerState,
  parseMarkdownContainerFenceCloseLine,
  parseMarkdownContainerFenceLine,
  parseMarkdownContainerMathFenceLine,
  parseMarkdownContainerLinePrefix,
} from './markdownFenceProtectedLines';

const INDENTED_CODE_LINE_PATTERN = /^(?: {4,}|\t)/;
const LIST_ITEM_LINE_PATTERN = /^([ \t]*)(?:[-+*]|\d+[.)])(?:[ \t]+|$)/;

type FenceState = MarkdownContainerState & { marker: string; length: number };
type MathBlockState = MarkdownContainerState & {
  length: number;
  style: 'dollar' | 'bracket';
};
type HtmlBlockContainerState = MarkdownContainerState & HtmlBlockState;

interface ProtectedSegmentOptions {
  protectHtmlBlocks?: boolean;
  protectHtmlComments?: boolean;
  protectMathBlocks?: boolean;
}

export function mapMarkdownOutsideProtectedBlocks(
  text: string,
  transformLine: (line: string, index: number, lines: readonly string[]) => string,
  options?: ProtectedSegmentOptions,
): string {
  return mapMarkdownOutsideProtectedSegments(
    text,
    (segment, startIndex, lines) => segment
      .split('\n')
      .map((line, offset) => transformLine(line, startIndex + offset, lines))
      .join('\n'),
    options,
  );
}

export function mapMarkdownOutsideProtectedSegments(
  text: string,
  transformSegment: (segment: string, startIndex: number, lines: readonly string[]) => string,
  options: ProtectedSegmentOptions = {},
): string {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  let nextNonBlankContentByIndex: Array<string | null> | null = null;
  const frontmatterEndIndex = getLeadingFrontmatterEndIndex(lines);
  const protectHtmlBlocks = options.protectHtmlBlocks !== false;
  const output: string[] = [];
  let segment: string[] = [];
  let segmentStartIndex = 0;
  let activeFence: FenceState | null = null;
  let activeHtmlBlock: HtmlBlockContainerState | null = null;
  let activeUnprotectedHtmlBlock: HtmlBlockContainerState | null = null;
  let activeMathBlock: MathBlockState | null = null;
  let activeIndentedCode = false;
  const protectHtmlComments = options.protectHtmlComments !== false;
  const protectMathBlocks = options.protectMathBlocks !== false;

  const flushSegment = (nextIndex: number) => {
    if (segment.length === 0) {
      segmentStartIndex = nextIndex;
      return;
    }
    output.push(transformSegment(segment.join('\n'), segmentStartIndex, lines));
    segment = [];
    segmentStartIndex = nextIndex;
  };

  lines.forEach((line, index) => {
    if (frontmatterEndIndex !== null && index <= frontmatterEndIndex) {
      flushSegment(index + 1);
      output.push(line);
      return;
    }

    if (activeUnprotectedHtmlBlock) {
      const content = getMarkdownContentInContainer(line, activeUnprotectedHtmlBlock);
      if (content !== null) {
        if (segment.length === 0) segmentStartIndex = index;
        segment.push(line);
        if (isHtmlBlockCloseLine(content, activeUnprotectedHtmlBlock)) {
          activeUnprotectedHtmlBlock = null;
        }
        return;
      }
      activeUnprotectedHtmlBlock = null;
    }

    if (activeIndentedCode) {
      const content = getMarkdownBlockContent(line);
      if (
        isIndentedCodeBlockLine(content)
        || keepsIndentedCodeBlockOpen(
          content,
          (nextNonBlankContentByIndex ??= getNextNonBlankMarkdownBlockContentByIndex(lines))[index]
        )
      ) {
        flushSegment(index + 1);
        output.push(line);
        return;
      }
      activeIndentedCode = false;
    }

    if (protectHtmlBlocks && activeHtmlBlock) {
      const content = getMarkdownContentInContainer(line, activeHtmlBlock);
      if (content !== null) {
        flushSegment(index + 1);
        output.push(line);
        if (isHtmlBlockCloseLine(content, activeHtmlBlock)) {
          activeHtmlBlock = null;
        }
        return;
      }
      activeHtmlBlock = null;
    }

    if (activeFence) {
      if (isMarkdownLineInContainer(line, activeFence)) {
        flushSegment(index + 1);
        output.push(line);
        activeFence = nextFenceState(line, activeFence);
        return;
      }
      activeFence = null;
    }

    if (protectMathBlocks && activeMathBlock) {
      if (isMarkdownLineInContainer(line, activeMathBlock)) {
        flushSegment(index + 1);
        output.push(line);
        activeMathBlock = nextMathBlockState(line, activeMathBlock);
        return;
      }
      activeMathBlock = null;
    }

    const container = parseMarkdownContainerLinePrefix(line);
    const content = container
      ? line.slice(container.markerStart)
      : getMarkdownBlockContent(line);
    if (
      isIndentedCodeBlockLine(content)
      && canStartIndentedCodeBlock(lines, index)
      && !isNestedListItemInListContext(lines, index)
    ) {
      flushSegment(index + 1);
      output.push(line);
      activeIndentedCode = true;
      return;
    }

    const htmlBlock = getMarkdownRawHtmlBlockClosePattern(content, { protectHtmlComments });
    if (htmlBlock) {
      const nextHtmlBlock = isHtmlBlockCloseLine(content, htmlBlock) || !container
        ? null
        : {
            ...htmlBlock,
            blockquoteDepth: container.blockquoteDepth,
            containerIndent: container.containerIndent,
          };
      if (protectHtmlBlocks) {
        flushSegment(index + 1);
        output.push(line);
        activeHtmlBlock = nextHtmlBlock;
      } else {
        if (segment.length === 0) segmentStartIndex = index;
        segment.push(line);
        activeUnprotectedHtmlBlock = nextHtmlBlock;
      }
      return;
    }

    if (parseMarkdownContainerFenceLine(line)) {
      flushSegment(index + 1);
      output.push(line);
      activeFence = nextFenceState(line, null);
      return;
    }

    const mathBlock = protectMathBlocks ? nextMathBlockState(line, null) : null;
    if (mathBlock) {
      flushSegment(index + 1);
      output.push(line);
      activeMathBlock = mathBlock;
      return;
    }

    if (segment.length === 0) {
      segmentStartIndex = index;
    }
    segment.push(line);
  });

  flushSegment(lines.length);
  return output.join('\n');
}

function nextMathBlockState(line: string, activeMathBlock: MathBlockState | null): MathBlockState | null {
  if (activeMathBlock) {
    return isMarkdownContainerMathFenceCloseLine(line, activeMathBlock)
      ? null
      : activeMathBlock;
  }

  const mathFence = parseMarkdownContainerMathFenceLine(line);
  if (mathFence?.kind === 'dollar') {
    return {
      blockquoteDepth: mathFence.blockquoteDepth,
      containerIndent: mathFence.containerIndent,
      length: mathFence.length,
      style: 'dollar',
    };
  }

  if (mathFence?.kind === 'bracket-open') {
    return {
      blockquoteDepth: mathFence.blockquoteDepth,
      containerIndent: mathFence.containerIndent,
      length: mathFence.length,
      style: 'bracket',
    };
  }

  return null;
}

function nextFenceState(line: string, activeFence: FenceState | null): FenceState | null {
  if (activeFence) {
    return parseMarkdownContainerFenceCloseLine(line, activeFence) ? null : activeFence;
  }

  const fence = parseMarkdownContainerFenceLine(line);
  if (!fence) return null;
  if (!activeFence && isValidMarkdownFenceOpener(line, fence)) {
    return {
      blockquoteDepth: fence.blockquoteDepth,
      containerIndent: fence.containerIndent,
      marker: fence.marker,
      length: fence.length,
    };
  }
  return activeFence;
}

function isIndentedCodeBlockLine(line: string): boolean {
  return INDENTED_CODE_LINE_PATTERN.test(line);
}

function canStartIndentedCodeBlock(lines: readonly string[], index: number): boolean {
  const previousLine = getMarkdownBlockContent(lines[index - 1] ?? '');
  return index === 0 || previousLine.trim() === '';
}

function isNestedListItemInListContext(lines: readonly string[], index: number): boolean {
  const line = lines[index] ?? '';
  const content = getMarkdownBlockContent(line);
  if (!LIST_ITEM_LINE_PATTERN.test(content)) return false;

  const blockquoteDepth = countBlockquoteMarkers(line, content);
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const previousLine = lines[cursor] ?? '';
    const previousContent = getMarkdownBlockContent(previousLine);
    if (previousContent.trim() === '') continue;
    if (countBlockquoteMarkers(previousLine, previousContent) !== blockquoteDepth) return false;
    if (LIST_ITEM_LINE_PATTERN.test(previousContent)) return true;
    if (INDENTED_CODE_LINE_PATTERN.test(previousContent)) continue;
    return false;
  }

  return false;
}

function countBlockquoteMarkers(line: string, content: string): number {
  const prefixLength = line.length - content.length;
  let count = 0;
  for (let index = 0; index < prefixLength; index += 1) {
    if (line[index] === '>') count += 1;
  }
  return count;
}

function keepsIndentedCodeBlockOpen(content: string, next: string | null | undefined): boolean {
  return content.trim() === '' && next != null && INDENTED_CODE_LINE_PATTERN.test(next);
}

function getNextNonBlankMarkdownBlockContentByIndex(lines: readonly string[]): Array<string | null> {
  const nextNonBlankContentByIndex = Array<string | null>(lines.length).fill(null);
  let nextNonBlankContent: string | null = null;

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    nextNonBlankContentByIndex[index] = nextNonBlankContent;
    const content = getMarkdownBlockContent(lines[index] ?? '');
    if (content.trim() !== '') {
      nextNonBlankContent = content;
    }
  }

  return nextNonBlankContentByIndex;
}

function isValidMarkdownFenceOpener(
  line: string,
  fence: { infoStart: number; marker: string },
): boolean {
  return fence.marker !== '`' || line.indexOf('`', fence.infoStart) === -1;
}
