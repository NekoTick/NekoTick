import {
  convertToBase64,
  createStoredAttachmentFromSource,
  isAttachmentDataUrlWithinSizeLimit,
  type Attachment,
} from '@/lib/storage/attachmentStorage';
import type { ChatMessageContentPart } from '@/lib/ai/types';
import { isRenderedImageSource } from '@/lib/ai/chatImageSourcePolicy';
import {
  isSvgDataUrl,
  rasterizeSvgDataUrlToPng,
} from '@/lib/markdown/svgRasterize';
import { isRenderableDataImageSrc, normalizeRenderableImageSrc } from '@/components/common/markdown/imagePolicy';
import { extractStoredAttachmentFilename } from '@/lib/storage/attachmentUrl';
import { escapeMarkdownAngleDestination } from '@/lib/markdown/markdownImageMarkdown';
import {
  getAttachmentMessageImageSrc,
  isImageAttachment,
  MAX_CHAT_MESSAGE_IMAGE_ATTACHMENTS,
  MAX_CHAT_MESSAGE_IMAGE_SOURCE_CHARS,
  toImageMarkdown,
} from './attachmentKinds';
import { isAllowedChatImageAttachmentPath } from './chatImagePathPolicy';

const MAX_INFERRED_IMAGE_NAME_SOURCE_CHARS = 4096;
const MAX_INFERRED_IMAGE_NAME_SEGMENT_DECODE_CHARS = 2048;
const MAX_INFERRED_IMAGE_NAME_CHARS = 512;

function hasConvertibleAttachmentReference(attachment: Attachment, rawSrc: string): boolean {
  return Boolean(
    typeof attachment.path === 'string' && attachment.path.trim() ||
    extractStoredAttachmentFilename(attachment.previewUrl) ||
    extractStoredAttachmentFilename(attachment.assetUrl) ||
    isSvgDataUrl(rawSrc)
  );
}

export function isSizedDataImageSrc(src: string): boolean {
  return /^data:/i.test(src.trim()) ? isAttachmentDataUrlWithinSizeLimit(src) : true;
}

export function tryAppendChatImageSource(
  imageSources: string[],
  src: string,
  budget: { usedChars: number },
): boolean {
  if (
    imageSources.length >= MAX_CHAT_MESSAGE_IMAGE_ATTACHMENTS ||
    budget.usedChars + src.length > MAX_CHAT_MESSAGE_IMAGE_SOURCE_CHARS
  ) {
    return false;
  }

  imageSources.push(src);
  budget.usedChars += src.length;
  return true;
}

function inferImageMimeType(src: string): string {
  if (isRenderableDataImageSrc(src) || isSvgDataUrl(src)) {
    const match = /^data:(image\/[^;,]+)/i.exec(src.trim());
    return match?.[1]?.toLowerCase() ?? 'image/*';
  }

  const pathname = src.split(/[?#]/)[0]?.toLowerCase() ?? '';
  if (pathname.endsWith('.png')) return 'image/png';
  if (pathname.endsWith('.jpg') || pathname.endsWith('.jpeg')) return 'image/jpeg';
  if (pathname.endsWith('.webp')) return 'image/webp';
  if (pathname.endsWith('.gif')) return 'image/gif';
  if (pathname.endsWith('.avif')) return 'image/avif';
  if (pathname.endsWith('.bmp')) return 'image/bmp';
  if (pathname.endsWith('.svg')) return 'image/svg+xml';
  return 'image/*';
}

function normalizeInferredImageName(value: string, fallback: string): string {
  const normalized = value.trim();
  return normalized && normalized.length <= MAX_INFERRED_IMAGE_NAME_CHARS
    ? normalized
    : fallback;
}

function decodeInferredImageNameSegment(value: string, fallback: string): string {
  if (value.length > MAX_INFERRED_IMAGE_NAME_SEGMENT_DECODE_CHARS) {
    return normalizeInferredImageName(value, fallback);
  }
  try {
    return normalizeInferredImageName(decodeURIComponent(value), fallback);
  } catch {
    return normalizeInferredImageName(value, fallback);
  }
}

function inferImageName(src: string, index: number): string {
  const fallback = `image-${index + 1}.png`;
  if (isRenderableDataImageSrc(src) || isSvgDataUrl(src)) {
    const mime = inferImageMimeType(src);
    const ext = mime.split('/')[1]?.replace('svg+xml', 'svg') || 'png';
    return `image-${index + 1}.${ext}`;
  }

  if (src.length > MAX_INFERRED_IMAGE_NAME_SOURCE_CHARS) {
    return fallback;
  }

  try {
    const url = new URL(src);
    return decodeInferredImageNameSegment(url.pathname.split('/').pop() || '', fallback);
  } catch {
    return normalizeInferredImageName(src.split(/[?#]/)[0]?.split('/').pop() ?? '', fallback);
  }
}

export function imageSourceToAttachment(src: string, index: number): Attachment {
  const storedAttachment = createStoredAttachmentFromSource(src, `stored-image-${index}`);
  if (storedAttachment && isImageAttachment(storedAttachment)) {
    return storedAttachment;
  }

  return {
    id: `stored-image-${index}`,
    path: '',
    previewUrl: src,
    assetUrl: src,
    name: inferImageName(src, index),
    type: inferImageMimeType(src),
    size: 0,
  };
}

export function normalizeDirectVisionImageUrl(src: string): string | null {
  const imageUrl = normalizeRenderableImageSrc(src);
  if (!imageUrl || !isRenderedImageSource(imageUrl)) {
    return null;
  }

  const normalized = imageUrl.toLowerCase();
  if (
    normalized.startsWith('http://') ||
    normalized.startsWith('https://') ||
    (isRenderableDataImageSrc(imageUrl) && isSizedDataImageSrc(imageUrl))
  ) {
    return imageUrl;
  }

  return null;
}

export async function normalizeVisionAttachment(
  attachment: Attachment
): Promise<ChatMessageContentPart | null> {
  if (!isImageAttachment(attachment)) {
    return null;
  }

  try {
    const rawSrc = getAttachmentMessageImageSrc(attachment);
    const directImageUrl = normalizeDirectVisionImageUrl(rawSrc);
    if (directImageUrl) {
      return {
        type: 'image_url',
        image_url: { url: directImageUrl },
      };
    }
    if (!hasConvertibleAttachmentReference(attachment, rawSrc)) {
      return null;
    }

    const base64 = await convertToBase64(attachment, {
      allowPath: isAllowedChatImageAttachmentPath,
    });
    const normalizedBase64 = isSvgDataUrl(base64)
      ? await rasterizeSvgDataUrlToPng(base64)
      : base64;
    const imageUrl = normalizeRenderableImageSrc(normalizedBase64);
    if (!imageUrl || !isSizedDataImageSrc(imageUrl)) {
      return null;
    }

    return {
      type: 'image_url',
      image_url: { url: imageUrl },
    };
  } catch {
    return null;
  }
}

async function getRenderableMessageImageSrc(attachment: Attachment): Promise<string | null> {
  const rawSrc = getAttachmentMessageImageSrc(attachment);
  const normalizedSrc = normalizeRenderableImageSrc(rawSrc);
  if (normalizedSrc) {
    return isSizedDataImageSrc(normalizedSrc) ? normalizedSrc : null;
  }

  if (!isSvgDataUrl(rawSrc) && !attachment.path?.trim()) {
    return null;
  }
  if (isSvgDataUrl(rawSrc) && !isSizedDataImageSrc(rawSrc)) {
    return null;
  }

  if (isSvgDataUrl(rawSrc)) {
    const rasterizedSrc = await rasterizeSvgDataUrlToPng(rawSrc);
    const normalizedRasterizedSrc = normalizeRenderableImageSrc(rasterizedSrc);
    if (normalizedRasterizedSrc && isSizedDataImageSrc(normalizedRasterizedSrc)) {
      return normalizedRasterizedSrc;
    }
  }

  if (!attachment.path?.trim()) {
    return null;
  }

  try {
    const base64 = await convertToBase64(attachment, {
      allowPath: isAllowedChatImageAttachmentPath,
    });
    const normalizedBase64 = isSvgDataUrl(base64)
      ? await rasterizeSvgDataUrlToPng(base64)
      : base64;
    const imageSrc = normalizeRenderableImageSrc(normalizedBase64);
    return imageSrc && isSizedDataImageSrc(imageSrc) ? imageSrc : null;
  } catch {
    return null;
  }
}

export async function buildMessageImageSources(attachments: Attachment[]): Promise<{ content: string; imageSources: string[] }> {
  const imageSources: string[] = [];
  const markdownParts: string[] = [];
  const imageSourceBudget = { usedChars: 0 };

  for (const attachment of attachments.slice(0, MAX_CHAT_MESSAGE_IMAGE_ATTACHMENTS)) {
    if (!isImageAttachment(attachment)) {
      continue;
    }

    const src = await getRenderableMessageImageSrc(attachment);
    if (!src) {
      continue;
    }

    const markdownSrc = escapeMarkdownAngleDestination(src);
    if (!markdownSrc) {
      continue;
    }

    if (!tryAppendChatImageSource(imageSources, markdownSrc, imageSourceBudget)) {
      break;
    }
    markdownParts.push(toImageMarkdown(markdownSrc));
  }

  return { content: markdownParts.join('\n\n'), imageSources };
}
