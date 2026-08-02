import type { ChatMessage } from '@/lib/ai/types';
import { measureTextBlockHeight } from '@/lib/text-layout';
import {
  MARKDOWN_BODY_FONT_SIZE,
  getMarkdownBodyFont,
  getMarkdownBodyLineHeight,
} from '@/components/common/markdown/markdownMetrics';
import { getChatContentWidth, normalizeChatContainerWidth } from './chatWidthBuckets';
import {
  estimateAssistantMessageHeight,
  estimateChatLoadingHeight,
} from './chatAssistantMessageLayout';
import {
  MAX_CHAT_MESSAGE_IMAGE_SOURCE_ENTRIES,
  MAX_CHAT_MESSAGE_IMAGE_SOURCES,
} from '@/components/Chat/common/messageClipboard';
import {
  extractChatMessageImageSources,
  stripChatMessageImageTokens,
} from '@/lib/ai/chatImageSourcePolicy';
import {
  COLLAPSED_USER_MESSAGE_VISIBLE_LINES,
  getLongUserMessagePreviewText,
} from '@/components/Chat/features/Messages/components/userMessageCollapse';
import { themeChatLayoutTokens } from '@/styles/themeTokens';

const USER_BUBBLE_PADDING_X = 32;
const USER_BUBBLE_PADDING_Y = 12;
const USER_TOOLBAR_HEIGHT = 30;

type EstimatedChatMessageHeightOptions = {
  containerWidth: number;
  fontSize?: number;
  isStreaming: boolean;
};

const MAX_ESTIMATED_TEXT_SCAN_CHARS = 1600;
const APPROXIMATE_LONG_TEXT_CHARS_PER_LINE = 72;
const APPROXIMATE_LONG_TEXT_EXTRA_LINE_HEIGHT = 0.78;

function clampEstimatedText(content: string): string {
  if (content.length <= MAX_ESTIMATED_TEXT_SCAN_CHARS) {
    return content;
  }

  return content.slice(0, MAX_ESTIMATED_TEXT_SCAN_CHARS);
}

function estimateLongTextRemainderHeight(content: string, fontSize: number): number {
  if (content.length <= MAX_ESTIMATED_TEXT_SCAN_CHARS) {
    return 0;
  }

  const remainingChars = content.length - MAX_ESTIMATED_TEXT_SCAN_CHARS;
  return Math.ceil(remainingChars / APPROXIMATE_LONG_TEXT_CHARS_PER_LINE)
    * getMarkdownBodyLineHeight(fontSize)
    * APPROXIMATE_LONG_TEXT_EXTRA_LINE_HEIGHT;
}

function countRenderableImages(content: string): number {
  return extractChatMessageImageSources(clampEstimatedText(content), {
    maxSources: MAX_CHAT_MESSAGE_IMAGE_SOURCES,
    maxTokens: MAX_CHAT_MESSAGE_IMAGE_SOURCE_ENTRIES,
  }).length;
}

function estimateUserImageGridHeight(imageCount: number, contentWidth: number): number {
  if (imageCount <= 0) return 0;
  if (imageCount === 1) return themeChatLayoutTokens.userMessageSingleImageMaxHeightPx;

  const gap = themeChatLayoutTokens.userMessageContentGapPx;
  const tileSize = themeChatLayoutTokens.userMessageMultipleImageTileSizePx;
  const gridWidth = Math.max(1, Math.floor(
    contentWidth * themeChatLayoutTokens.userMessageMaxWidthRatio,
  ));
  const columns = Math.max(1, Math.floor((gridWidth + gap) / (tileSize + gap)));
  const rows = Math.ceil(imageCount / columns);
  return rows * tileSize + Math.max(0, rows - 1) * gap;
}

function estimateUserMessageHeight(
  message: ChatMessage,
  containerWidth: number,
  isStreaming: boolean,
  fontSize: number,
): number {
  const lineHeight = getMarkdownBodyLineHeight(fontSize);
  const contentWidth = getChatContentWidth(containerWidth);
  const bubbleWidth = Math.max(
    120,
    Math.floor(contentWidth * themeChatLayoutTokens.userMessageMaxWidthRatio),
  );
  const textWidth = Math.max(1, bubbleWidth - USER_BUBBLE_PADDING_X);
  const fullText = stripChatMessageImageTokens(clampEstimatedText(message.content), {
    maxTokens: MAX_CHAT_MESSAGE_IMAGE_SOURCE_ENTRIES,
  }).trim();
  const collapsedPreview = getLongUserMessagePreviewText(fullText);
  const text = collapsedPreview ?? fullText;
  const imageCount = countRenderableImages(message.content);

  let height = 0;

  if (imageCount > 0) {
    height += estimateUserImageGridHeight(imageCount, contentWidth);
  }

  if (text.length > 0) {
    if (height > 0) {
      height += themeChatLayoutTokens.userMessageContentGapPx;
    }
    const measuredTextHeight = measureTextBlockHeight(text, textWidth, {
      font: getMarkdownBodyFont(fontSize),
      lineHeight,
      minHeight: lineHeight,
      prepareOptions: { whiteSpace: 'pre-wrap' },
    }) + (collapsedPreview === null
      ? estimateLongTextRemainderHeight(message.content, fontSize)
      : 0);
    const collapsedTextHeight = lineHeight * COLLAPSED_USER_MESSAGE_VISIBLE_LINES;
    const isLongMessage = collapsedPreview !== null || measuredTextHeight > collapsedTextHeight;
    height += Math.min(measuredTextHeight, collapsedTextHeight)
      + (isLongMessage
        ? lineHeight + USER_BUBBLE_PADDING_Y + themeChatLayoutTokens.userMessageContentGapPx
        : 0)
      + USER_BUBBLE_PADDING_Y;
  }

  if (height === 0) {
    height = lineHeight + USER_BUBBLE_PADDING_Y;
  }

  return height + (isStreaming ? 0 : USER_TOOLBAR_HEIGHT);
}

export { estimateChatLoadingHeight };

export function estimateChatMessageHeight(
  message: ChatMessage,
  { containerWidth, fontSize = MARKDOWN_BODY_FONT_SIZE, isStreaming }: EstimatedChatMessageHeightOptions,
): number {
  const normalizedWidth = normalizeChatContainerWidth(containerWidth);
  if (message.role === 'user') {
    return estimateUserMessageHeight(message, normalizedWidth, isStreaming, fontSize);
  }

  return estimateAssistantMessageHeight(message, normalizedWidth, isStreaming, fontSize);
}
