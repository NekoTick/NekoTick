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
  type MarkdownContainerLinePrefix,
  type MarkdownContainerState,
  parseMarkdownContainerFenceCloseLine,
  parseMarkdownContainerFenceLine,
  parseMarkdownContainerLinePrefix,
  parseMarkdownContainerMathFenceLine,
} from './markdownContainerParsing';

export * from './markdownContainerParsing';

export interface MarkdownProtectedLineInfo {
  containerBlockOpenLineIndexes: Set<number>;
  nonCodeProtectedLineIndexes: Set<number>;
}

export function collectNonCodeProtectedLineIndexes(
  lines: readonly string[],
  frontmatterEndIndex = getLeadingFrontmatterEndIndex(lines),
): Set<number> {
  return collectMarkdownProtectedLineInfo(lines, frontmatterEndIndex)
    .nonCodeProtectedLineIndexes;
}

export function collectMarkdownProtectedLineInfo(
  lines: readonly string[],
  frontmatterEndIndex = getLeadingFrontmatterEndIndex(lines),
): MarkdownProtectedLineInfo {
  const protectedLines = new Set<number>();
  const containerBlockOpenLineIndexes = new Set<number>();
  let activeFence: (MarkdownContainerState & { marker: string; length: number }) | null = null;
  let activeHtmlBlock: (MarkdownContainerState & HtmlBlockState) | null = null;
  let activeMathBlock: (
    MarkdownContainerState & { length: number; style: 'bracket' | 'dollar' }
  ) | null = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    if (frontmatterEndIndex !== null && index <= frontmatterEndIndex) {
      protectedLines.add(index);
      continue;
    }

    if (activeFence) {
      if (isMarkdownLineInContainer(line, activeFence)) {
        if (parseMarkdownContainerFenceCloseLine(line, activeFence)) {
          activeFence = null;
        }
        continue;
      }
      activeFence = null;
    }

    if (activeHtmlBlock) {
      const content = getMarkdownContentInContainer(line, activeHtmlBlock);
      if (content !== null) {
        protectedLines.add(index);
        if (isHtmlBlockCloseLine(content, activeHtmlBlock)) {
          activeHtmlBlock = null;
        }
        continue;
      }
      activeHtmlBlock = null;
    }

    if (activeMathBlock) {
      if (isMarkdownLineInContainer(line, activeMathBlock)) {
        protectedLines.add(index);
        if (isMarkdownContainerMathFenceCloseLine(line, activeMathBlock)) {
          activeMathBlock = null;
        }
        continue;
      }
      activeMathBlock = null;
    }

    const container = parseMarkdownContainerLinePrefix(line);
    const content = container
      ? line.slice(container.markerStart)
      : getMarkdownBlockContent(line);
    const htmlBlock = getMarkdownRawHtmlBlockClosePattern(content, {
      protectHtmlComments: true,
    });
    if (htmlBlock) {
      protectedLines.add(index);
      containerBlockOpenLineIndexes.add(index);
      activeHtmlBlock = isHtmlBlockCloseLine(content, htmlBlock) || !container
        ? null
        : { ...htmlBlock, ...toMarkdownContainerState(container) };
      continue;
    }

    const mathFence = parseMarkdownContainerMathFenceLine(line);
    if (mathFence?.kind === 'dollar') {
      protectedLines.add(index);
      containerBlockOpenLineIndexes.add(index);
      activeMathBlock = {
        blockquoteDepth: mathFence.blockquoteDepth,
        containerIndent: mathFence.containerIndent,
        length: mathFence.length,
        style: 'dollar',
      };
      continue;
    }
    if (mathFence?.kind === 'bracket-open') {
      protectedLines.add(index);
      containerBlockOpenLineIndexes.add(index);
      activeMathBlock = {
        blockquoteDepth: mathFence.blockquoteDepth,
        containerIndent: mathFence.containerIndent,
        length: mathFence.length,
        style: 'bracket',
      };
      continue;
    }

    const fence = parseMarkdownContainerFenceLine(line);
    if (fence && (fence.marker !== '`' || line.indexOf('`', fence.infoStart) === -1)) {
      containerBlockOpenLineIndexes.add(index);
      activeFence = {
        blockquoteDepth: fence.blockquoteDepth,
        containerIndent: fence.containerIndent,
        marker: fence.marker,
        length: fence.length,
      };
    }
  }

  return {
    containerBlockOpenLineIndexes,
    nonCodeProtectedLineIndexes: protectedLines,
  };
}

function toMarkdownContainerState(
  container: MarkdownContainerLinePrefix,
): MarkdownContainerState {
  return {
    blockquoteDepth: container.blockquoteDepth,
    containerIndent: container.containerIndent,
  };
}
