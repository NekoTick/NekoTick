import {
  buildMarkdownTextBlock,
  type MarkdownMeasurementBlock,
  type TextBlockVariant,
} from './chatAssistantMarkdownTypography';
import {
  getMarkdownFenceState,
  isMarkdownFenceClose,
  type MarkdownFenceState,
} from '@/lib/markdown/markdownFence';
import {
  MARKDOWN_BLOCKQUOTE_CONTENT_INSET,
  MARKDOWN_BLOCKQUOTE_PADDING_Y,
  MARKDOWN_LIST_CONTENT_INSET,
  MARKDOWN_LIST_ITEM_MARGIN_Y,
  MARKDOWN_LIST_MARGIN_Y,
} from '@/components/common/markdown/markdownMetrics';
import { setCacheEntry, touchCacheEntry } from '@/lib/cache/lru';
import { stripChatMessageImageTokens } from '@/lib/ai/chatImageSourcePolicy';
import {
  collectMarkdownSectionLines,
  readNormalizedMarkdownLine,
} from './chatAssistantMarkdownLineScanner';
import {
  getVideoImageTokens,
  MAX_LAYOUT_VIDEO_IMAGE_TOKENS,
  stripVideoImageTokens,
} from './chatAssistantMarkdownVideoTokens';

const HR_RE = /^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/;
const HEADING_RE = /^\s{0,3}(#{1,6})\s+(.*)$/;
const BLOCKQUOTE_RE = /^\s{0,3}>\s?/;
const LIST_MARKER_RE = /^\s{0,3}(?:[-+*]|\d+\.)\s+/;
const TASK_MARKER_RE = /^\s{0,3}(?:[-+*]|\d+\.)\s+\[(?: |x|X)\]\s+/;
const TABLE_ROW_RE = /^\s*\|.*\|\s*$/;

const PARSED_ASSISTANT_MARKDOWN_CACHE_LIMIT = 200;
const MAX_CACHED_MARKDOWN_BLOCK_CHARS = 50_000;
const MAX_ASSISTANT_MARKDOWN_MEASUREMENT_TEXT_CHARS = 50_000;
export const MAX_ASSISTANT_MARKDOWN_MEASUREMENT_SCAN_CHARS = 200_000;
export const MAX_ASSISTANT_MARKDOWN_MEASUREMENT_BLOCKS = 5_000;
const HEADING_VARIANTS: TextBlockVariant[] = [
  'heading-1',
  'heading-2',
  'heading-3',
  'heading-4',
  'heading-5',
  'heading-6',
];

const parsedMarkdownBlocksCache = new Map<string, MarkdownMeasurementBlock[]>();

export { getMarkdownFenceState, isMarkdownFenceClose, type MarkdownFenceState };

function getHeadingVariant(depth: number): TextBlockVariant {
  return HEADING_VARIANTS[depth - 1] ?? 'heading-6';
}

function pushMeasurementBlock(
  blocks: MarkdownMeasurementBlock[],
  block: MarkdownMeasurementBlock,
): boolean {
  if (blocks.length >= MAX_ASSISTANT_MARKDOWN_MEASUREMENT_BLOCKS) {
    return false;
  }
  blocks.push(block);
  return true;
}

function buildBoundedMarkdownTextBlock(
  text: string,
  variant: TextBlockVariant,
  widthInset: number = 0,
  extraHeight: number = 0,
): MarkdownMeasurementBlock | null {
  return buildMarkdownTextBlock(
    text.length > MAX_ASSISTANT_MARKDOWN_MEASUREMENT_TEXT_CHARS
      ? text.slice(0, MAX_ASSISTANT_MARKDOWN_MEASUREMENT_TEXT_CHARS)
      : text,
    variant,
    widthInset,
    extraHeight,
  );
}

export function parseMarkdownMeasurementBlocks(markdown: string): MarkdownMeasurementBlock[] {
  const shouldCache = markdown.length <= MAX_CACHED_MARKDOWN_BLOCK_CHARS;
  if (shouldCache) {
    const cached = touchCacheEntry(parsedMarkdownBlocksCache, markdown);
    if (cached) {
      return cached;
    }
  }

  const blocks: MarkdownMeasurementBlock[] = [];
  let offset = 0;
  const scanEnd = Math.min(markdown.length, MAX_ASSISTANT_MARKDOWN_MEASUREMENT_SCAN_CHARS);

  while (blocks.length < MAX_ASSISTANT_MARKDOWN_MEASUREMENT_BLOCKS) {
    const current = readNormalizedMarkdownLine(markdown, offset, scanEnd);
    if (!current) {
      break;
    }

    const line = current.line;
    if (!line.trim()) {
      offset = current.nextOffset;
      continue;
    }

    const fence = getMarkdownFenceState(line);
    if (fence) {
      const codeLines: string[] = [];
      offset = current.nextOffset;

      while (true) {
        const codeLine = readNormalizedMarkdownLine(markdown, offset, scanEnd);
        if (!codeLine) {
          break;
        }
        if (isMarkdownFenceClose(codeLine.line, fence)) {
          offset = codeLine.nextOffset;
          break;
        }
        codeLines.push(codeLine.line);
        offset = codeLine.nextOffset;
      }

      pushMeasurementBlock(blocks, {
        kind: 'code',
        code: codeLines.join('\n'),
        widthInset: 0,
      });
      continue;
    }

    if (HR_RE.test(line)) {
      pushMeasurementBlock(blocks, {
        kind: 'rule',
        widthInset: 0,
      });
      offset = current.nextOffset;
      continue;
    }

    const headingMatch = HEADING_RE.exec(line);
    if (headingMatch) {
      const depth = headingMatch[1]!.length;
      const text = headingMatch[2] ?? '';
      const block = buildBoundedMarkdownTextBlock(text, getHeadingVariant(depth));
      if (block) {
        pushMeasurementBlock(blocks, block);
      }
      offset = current.nextOffset;
      continue;
    }

    const { endOffset, lines: sectionLines } = collectMarkdownSectionLines(
      markdown,
      offset,
      scanEnd,
      (sectionLine) => getMarkdownFenceState(sectionLine) !== null || HEADING_RE.test(sectionLine) || HR_RE.test(sectionLine),
    );
    if (sectionLines.length === 0) {
      offset = current.nextOffset;
      continue;
    }

    const sectionMarkdown = sectionLines.join('\n');
    const videoTokens = getVideoImageTokens(sectionMarkdown);
    const videoTokenCount = videoTokens.length;
    if (videoTokenCount > 0) {
      const textWithoutMedia = stripChatMessageImageTokens(
        stripVideoImageTokens(sectionMarkdown, videoTokens),
        { maxTokens: MAX_LAYOUT_VIDEO_IMAGE_TOKENS },
      ).trim();
      if (textWithoutMedia) {
        const block = buildBoundedMarkdownTextBlock(textWithoutMedia, 'body');
        if (block) {
          pushMeasurementBlock(blocks, block);
        }
      }
      for (
        let videoIndex = 0;
        videoIndex < videoTokenCount && blocks.length < MAX_ASSISTANT_MARKDOWN_MEASUREMENT_BLOCKS;
        videoIndex += 1
      ) {
        pushMeasurementBlock(blocks, {
          kind: 'video',
          widthInset: 0,
        });
      }
      offset = endOffset;
      continue;
    }

    if (sectionLines.every((sectionLine) => BLOCKQUOTE_RE.test(sectionLine))) {
      const text = sectionLines
        .map((sectionLine) => sectionLine.replace(BLOCKQUOTE_RE, ''))
        .join('\n');
      const block = buildBoundedMarkdownTextBlock(
        text,
        'body',
        MARKDOWN_BLOCKQUOTE_CONTENT_INSET,
        MARKDOWN_BLOCKQUOTE_PADDING_Y,
      );
      if (block) {
        pushMeasurementBlock(blocks, block);
      }
      offset = endOffset;
      continue;
    }

    if (
      sectionLines.length >= 2 &&
      TABLE_ROW_RE.test(sectionLines[0]!) &&
      /^\s*\|?[:\- ]+\|[:\-| ]+\s*$/.test(sectionLines[1]!)
    ) {
      pushMeasurementBlock(blocks, {
        kind: 'table',
        rowCount: Math.max(1, sectionLines.length - 1),
        widthInset: 0,
      });
      offset = endOffset;
      continue;
    }

    if (sectionLines.some((sectionLine) => LIST_MARKER_RE.test(sectionLine))) {
      const itemCount = sectionLines.filter((sectionLine) => LIST_MARKER_RE.test(sectionLine)).length;
      const text = sectionLines
        .map((sectionLine) =>
          sectionLine
            .replace(TASK_MARKER_RE, '')
            .replace(LIST_MARKER_RE, '')
            .trimEnd(),
        )
        .join('\n');
      const block = buildBoundedMarkdownTextBlock(
        text,
        'body',
        MARKDOWN_LIST_CONTENT_INSET,
        MARKDOWN_LIST_MARGIN_Y + itemCount * MARKDOWN_LIST_ITEM_MARGIN_Y,
      );
      if (block) {
        pushMeasurementBlock(blocks, block);
      }
      offset = endOffset;
      continue;
    }

    const paragraph = buildBoundedMarkdownTextBlock(sectionLines.join(' '), 'body');
    if (paragraph) {
      pushMeasurementBlock(blocks, paragraph);
    }
    offset = endOffset;
  }

  if (shouldCache) {
    setCacheEntry(parsedMarkdownBlocksCache, markdown, blocks, PARSED_ASSISTANT_MARKDOWN_CACHE_LIMIT);
  }
  return blocks;
}
