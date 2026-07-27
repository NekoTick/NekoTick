import { mapMarkdownOutsideProtectedSegments } from './markdownProtectedBlocks';
import {
  getMarkdownContentInContainer,
  isMarkdownLineInContainer,
  type MarkdownContainerState,
  parseMarkdownContainerFenceCloseLine,
  parseMarkdownContainerFenceLine,
  parseMarkdownContainerLinePrefix,
} from './markdownFenceProtectedLines';
import {
  GENERIC_HTML_BLOCK_OPEN_LINE_PATTERN,
  GENERIC_HTML_BLOCK_TAGS,
  GenericHtmlSpacingFenceState,
  MarkdownFenceLine,
  RAW_HTML_BLOCK_OPEN_LINE_PATTERN
} from './markdownSerializationShared';

type HtmlSpacingBlockState = MarkdownContainerState & { tagName: string };

export function normalizeGenericHtmlBlockClosingSpacing(text: string): string {
  if (!text.includes('</')) return text;

  return mapMarkdownOutsideProtectedSegments(
    text,
    (segment) => normalizeGenericHtmlBlockClosingSpacingSegment(segment),
    { protectHtmlBlocks: false },
  );
}

export function normalizeGenericHtmlBlockClosingSpacingSegment(text: string): string {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const output: string[] = [];
  let activeFence: GenericHtmlSpacingFenceState | null = null;
  let activeGenericBlock: HtmlSpacingBlockState | null = null;
  let activeRawBlock: HtmlSpacingBlockState | null = null;

  for (const line of lines) {
    if (activeFence) {
      if (isMarkdownLineInContainer(line, activeFence)) {
        output.push(line);
        if (isGenericHtmlSpacingFenceClose(line, activeFence)) {
          activeFence = null;
        }
        continue;
      }
      activeFence = null;
    }

    if (activeRawBlock) {
      const content = getMarkdownContentInContainer(line, activeRawBlock);
      if (content !== null) {
        output.push(line);
        if (new RegExp(`</${activeRawBlock.tagName}(?:\\s[^>]*)?>`, 'i').test(content)) {
          activeRawBlock = null;
        }
        continue;
      }
      activeRawBlock = null;
    }

    if (activeGenericBlock) {
      const content = getMarkdownContentInContainer(line, activeGenericBlock);
      if (content !== null) {
        const closePattern = new RegExp(`^(?: {0,3})<\\/${activeGenericBlock.tagName}\\s*>\\s*$`, 'i');
        const isCloseLine = closePattern.test(content);
        if (isCloseLine && output[output.length - 1] === '') {
          output.pop();
        }
        output.push(line);
        if (isCloseLine) {
          activeGenericBlock = null;
        }
        continue;
      }
      activeGenericBlock = null;
    }

    output.push(line);

    activeFence = getGenericHtmlSpacingFenceOpen(line);
    if (activeFence) {
      continue;
    }

    const container = parseMarkdownContainerLinePrefix(line);
    if (!container) continue;
    const content = line.slice(container.markerStart);
    const rawTagName = RAW_HTML_BLOCK_OPEN_LINE_PATTERN.exec(content)?.[1]?.toLowerCase();
    if (rawTagName && !new RegExp(`</${rawTagName}(?:\\s[^>]*)?>`, 'i').test(content)) {
      activeRawBlock = {
        blockquoteDepth: container.blockquoteDepth,
        containerIndent: container.containerIndent,
        tagName: rawTagName,
      };
      continue;
    }

    const openTagName = GENERIC_HTML_BLOCK_OPEN_LINE_PATTERN.exec(content)?.[1]?.toLowerCase();
    if (
      openTagName &&
      GENERIC_HTML_BLOCK_TAGS.has(openTagName) &&
      !/\/>\s*$/.test(content)
    ) {
      activeGenericBlock = {
        blockquoteDepth: container.blockquoteDepth,
        containerIndent: container.containerIndent,
        tagName: openTagName,
      };
    }
  }

  return output.join('\n');
}

export function getGenericHtmlSpacingFenceOpen(content: string): GenericHtmlSpacingFenceState | null {
  const fence = parseGenericHtmlSpacingFenceLine(content);
  if (!fence) return null;
  if (fence.marker === '`' && content.indexOf('`', fence.infoStart) !== -1) return null;
  return {
    blockquoteDepth: fence.blockquoteDepth,
    containerIndent: fence.containerIndent,
    marker: fence.marker,
    length: fence.length,
  };
}

export function isGenericHtmlSpacingFenceClose(
  content: string,
  activeFence: GenericHtmlSpacingFenceState,
): boolean {
  return parseMarkdownContainerFenceCloseLine(content, activeFence) !== null;
}

export function parseGenericHtmlSpacingFenceLine(
  content: string,
  options?: { maxIndent?: number; stripListMarker?: boolean },
): MarkdownFenceLine | null {
  return parseMarkdownContainerFenceLine(content, options);
}
