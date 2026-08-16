import { createStoredAttachmentFromSource } from '@/lib/storage/attachmentStorage';
import type { ChatMessageContent, ChatMessageContentPart } from '@/lib/ai/types';
import {
  parseMarkdownAndHtmlImageTokens,
  stripImageTokens,
  type ImageToken,
} from '@/lib/markdown/markdownImageTokens';
import { isSvgDataUrl } from '@/lib/markdown/svgRasterize';
import { scrubOverflowMarkdownDataImages } from '@/lib/markdown/overflowDataImageScrubber';
import { replaceRenderableMessageImageTokens } from '@/lib/markdown/renderableImageTokens';
import {
  isImageAttachment,
  MAX_CHAT_MESSAGE_IMAGE_SOURCE_CHARS,
} from './attachmentKinds';
import { MAX_NOTE_MENTION_READ_BYTES } from './noteMentionConfig';
import {
  imageSourceToAttachment,
  isSizedDataImageSrc,
  normalizeDirectVisionImageUrl,
  normalizeVisionAttachment,
  tryAppendChatImageSource,
} from './visionAttachments';

const INLINE_DATA_IMAGE_TARGET_HINT_PATTERN = /\bdata(?:\\*:|&|&#)/i;
const MAX_STORED_USER_MESSAGE_IMAGE_TOKENS = 2000;

function isInlineDataImageMarkdownSource(src: string | null | undefined): boolean {
  return /^data:image\//i.test(src?.trim() ?? '');
}

function collectStoredUserMessageImages(content: string): {
  imageSources: string[];
  tokensToStrip: ImageToken[];
  reachedImageTokenBudget: boolean;
} {
  const imageSources: string[] = [];
  const tokensToStrip: ImageToken[] = [];
  const imageSourceBudget = { usedChars: 0 };
  const parsedTokens = parseMarkdownAndHtmlImageTokens(content, {
    maxTokens: MAX_STORED_USER_MESSAGE_IMAGE_TOKENS,
  });

  for (const token of parsedTokens) {
    const rawSrc = token.src?.trim() ?? '';
    const storedAttachment = createStoredAttachmentFromSource(rawSrc, 'stored-image-candidate');
    if (storedAttachment && isImageAttachment(storedAttachment)) {
      tryAppendChatImageSource(imageSources, rawSrc, imageSourceBudget);
      tokensToStrip.push(token);
      continue;
    }

    const normalizedSrc = normalizeDirectVisionImageUrl(rawSrc);
    if (normalizedSrc) {
      tryAppendChatImageSource(imageSources, normalizedSrc, imageSourceBudget);
      tokensToStrip.push(token);
      continue;
    }

    if (isSvgDataUrl(rawSrc) && isSizedDataImageSrc(rawSrc)) {
      tryAppendChatImageSource(imageSources, rawSrc, imageSourceBudget);
      tokensToStrip.push(token);
      continue;
    }

    if (isInlineDataImageMarkdownSource(rawSrc)) {
      tokensToStrip.push(token);
    }
  }

  return {
    imageSources,
    tokensToStrip,
    reachedImageTokenBudget: parsedTokens.length >= MAX_STORED_USER_MESSAGE_IMAGE_TOKENS,
  };
}

function scrubOverflowStoredInlineDataImageSyntax(content: string): string {
  const withoutMarkdownDataImages = scrubOverflowMarkdownDataImages(content, {
    replacement: '',
    maxTargetChars: MAX_NOTE_MENTION_READ_BYTES,
  });
  return replaceRenderableMessageImageTokens(withoutMarkdownDataImages, '');
}

export async function buildStoredUserMessageContent(content: string): Promise<ChatMessageContent> {
  const { imageSources, tokensToStrip, reachedImageTokenBudget } = collectStoredUserMessageImages(content);
  if (imageSources.length === 0 && tokensToStrip.length === 0) {
    if (reachedImageTokenBudget || INLINE_DATA_IMAGE_TARGET_HINT_PATTERN.test(content)) {
      const scrubbed = scrubOverflowStoredInlineDataImageSyntax(content).trim();
      return scrubbed === content ? content : scrubbed ? [{ type: 'text', text: scrubbed }] : '';
    }
    return content;
  }

  const strippedText = stripImageTokens(content, tokensToStrip);
  const shouldScrubStrippedText = reachedImageTokenBudget || INLINE_DATA_IMAGE_TARGET_HINT_PATTERN.test(strippedText);
  const text = (shouldScrubStrippedText
    ? scrubOverflowStoredInlineDataImageSyntax(strippedText)
    : strippedText
  ).trim();
  const parts: ChatMessageContentPart[] = text ? [{ type: 'text', text }] : [];
  let imagePartSourceChars = 0;

  for (const [index, src] of imageSources.entries()) {
    if (imagePartSourceChars >= MAX_CHAT_MESSAGE_IMAGE_SOURCE_CHARS) {
      break;
    }
    const imagePart = await normalizeVisionAttachment(imageSourceToAttachment(src, index));
    if (imagePart?.type === 'image_url') {
      const imageUrl = imagePart.image_url.url;
      if (imagePartSourceChars + imageUrl.length > MAX_CHAT_MESSAGE_IMAGE_SOURCE_CHARS) {
        break;
      }
      imagePartSourceChars += imageUrl.length;
      parts.push(imagePart);
    }
  }

  return parts.length > 0 ? parts : text;
}
