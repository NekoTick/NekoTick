import type { ChatMessage } from '@/lib/ai/types';
import { parseThinkingContent } from '@/lib/ai/stripThinkingContent';
import {
  buildParsedAssistantMarkdown,
  stripRenderableImageTokens,
  type ParsedAssistantMarkdown,
} from './chatAssistantMarkdownBlocks';
import {
  setCacheEntry,
  touchCacheEntry,
} from '@/lib/cache/lru';

const THINK_OPEN_TAG = '<think>';
const PARSED_ASSISTANT_MARKDOWN_CACHE_LIMIT = 200;
const STREAMING_ASSISTANT_MARKDOWN_CACHE_LIMIT = 80;
const MAX_CACHED_ASSISTANT_MARKDOWN_CHARS = 50_000;

export type ThinkingSections = {
  body: string;
  isComplete: boolean;
  markdown: string;
};

function stripTrailingTagPrefix(content: string, tag: string): { content: string; stripped: boolean } {
  for (let length = tag.length - 1; length > 0; length -= 1) {
    if (endsWithAsciiCaseInsensitivePrefix(content, tag, length)) {
      return {
        content: content.slice(0, -length),
        stripped: true,
      };
    }
  }

  return { content, stripped: false };
}

function endsWithAsciiCaseInsensitivePrefix(content: string, tag: string, length: number): boolean {
  if (content.length < length) return false;
  const start = content.length - length;

  for (let index = 0; index < length; index += 1) {
    if (content[start + index]?.toLowerCase() !== tag[index]?.toLowerCase()) {
      return false;
    }
  }

  return true;
}

const parsedAssistantMarkdownCache = new Map<string, ParsedAssistantMarkdown>();
const streamingAssistantMarkdownCache = new Map<string, ParsedAssistantMarkdown>();

function getStreamingAssistantMarkdownCacheKey(message: ChatMessage): string {
  return `${message.id}\u0000${message.currentVersionIndex}`;
}

function canCacheAssistantMarkdown(markdown: string): boolean {
  return markdown.length <= MAX_CACHED_ASSISTANT_MARKDOWN_CHARS;
}

function cacheParsedAssistantMarkdown(
  cacheKey: string,
  markdown: string,
  parsed: ParsedAssistantMarkdown,
): void {
  if (!canCacheAssistantMarkdown(markdown)) {
    streamingAssistantMarkdownCache.delete(cacheKey);
    return;
  }

  setCacheEntry(parsedAssistantMarkdownCache, markdown, parsed, PARSED_ASSISTANT_MARKDOWN_CACHE_LIMIT);
  setCacheEntry(streamingAssistantMarkdownCache, cacheKey, parsed, STREAMING_ASSISTANT_MARKDOWN_CACHE_LIMIT);
}

export function extractThinkingSections(content: string): ThinkingSections {
  if (!content.includes('<')) {
    return {
      body: '',
      isComplete: true,
      markdown: content,
    };
  }

  const parsed = parseThinkingContent(content);

  if (!parsed.hasThinking) {
    const stripped = stripTrailingTagPrefix(content, THINK_OPEN_TAG);
    if (stripped.stripped) {
      return {
        body: '',
        isComplete: false,
        markdown: stripped.content,
      };
    }

    return {
      body: '',
      isComplete: true,
      markdown: content,
    };
  }

  return {
    body: parsed.parts.join('\n\n'),
    isComplete: parsed.isComplete,
    markdown: parsed.visible,
  };
}

export function getParsedAssistantMarkdown(
  message: ChatMessage,
  markdown: string,
): ParsedAssistantMarkdown {
  const cacheKey = getStreamingAssistantMarkdownCacheKey(message);
  if (canCacheAssistantMarkdown(markdown)) {
    const cached = touchCacheEntry(parsedAssistantMarkdownCache, markdown);
    if (cached) {
      setCacheEntry(
        streamingAssistantMarkdownCache,
        cacheKey,
        cached,
        STREAMING_ASSISTANT_MARKDOWN_CACHE_LIMIT,
      );
      return cached;
    }
  }

  const incrementalSource = canCacheAssistantMarkdown(markdown)
    ? touchCacheEntry(streamingAssistantMarkdownCache, cacheKey)
    : undefined;
  if (incrementalSource && markdown.startsWith(incrementalSource.rawMarkdown)) {
    const renderableMarkdown = stripRenderableImageTokens(markdown);
    if (!renderableMarkdown.startsWith(incrementalSource.renderableMarkdown)) {
      const parsed = buildParsedAssistantMarkdown(markdown, renderableMarkdown);
      cacheParsedAssistantMarkdown(cacheKey, markdown, parsed);
      return parsed;
    }

    const tailSuffix = renderableMarkdown.slice(incrementalSource.renderableMarkdown.length);
    const tailParsed = buildParsedAssistantMarkdown(
      markdown,
      incrementalSource.tailRenderableMarkdown + tailSuffix,
    );
    const parsed = {
      ...tailParsed,
      blocks: [...incrementalSource.stableBlocks, ...tailParsed.blocks],
      renderableMarkdown,
      stableBlocks: [...incrementalSource.stableBlocks, ...tailParsed.stableBlocks],
      stableBlockHeightCache: new Map<string, number>(),
    };
    cacheParsedAssistantMarkdown(cacheKey, markdown, parsed);
    return parsed;
  }

  const parsed = buildParsedAssistantMarkdown(
    markdown,
    stripRenderableImageTokens(markdown),
  );
  cacheParsedAssistantMarkdown(cacheKey, markdown, parsed);
  return parsed;
}
