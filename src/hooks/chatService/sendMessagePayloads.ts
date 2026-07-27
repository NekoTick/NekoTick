import type {
  ChatMessageContent,
  ChatMessageContentPart,
  ChatRequestContextSnapshot,
} from '@/lib/ai/types';
import type { NoteMentionReference } from '@/lib/ai/noteMentions';
import type { Attachment } from '@/lib/storage/attachmentStorage';
import {
  buildMentionedNotesContext,
  buildMessageFileAttachmentContext,
  buildMessageFileAttachmentMentionText,
  buildMessageImageSources,
  isImageAttachment,
  limitChatMessageImageAttachments,
  loadMentionedFolderImageAttachments,
  loadMentionedNotes,
  normalizeVisionAttachment,
} from './helpers';
import { throwIfChatRequestAborted } from './requestLifecycle';
import {
  getAttachmentMessageImageSrc,
  extractTrustedManagedAttachmentPathFilename,
} from './attachmentKinds';
import { extractStoredAttachmentFilename } from '@/lib/storage/attachmentUrl';
import { persistDataUrlAttachment } from '@/lib/storage/attachmentStorage';
import { normalizeChatRequestContextSnapshot } from '@/lib/ai/requestContextSnapshot';
import { deleteCreatedRequestContextAttachments } from './requestContextAttachmentCleanup';

interface SendMessageStorageContentOptions {
  requestAttachments: Attachment[];
  userMessageText: string;
  mentionText: string;
  noteMentions: NoteMentionReference[];
}

interface SendMessageStorageContent {
  storageContent: string;
  messageImageSources: string[];
}

export async function buildSendMessageStorageContent({
  requestAttachments,
  userMessageText,
  mentionText,
  noteMentions,
}: SendMessageStorageContentOptions): Promise<SendMessageStorageContent> {
  let storageContent = userMessageText;
  let messageImageSources: string[] = [];
  if (requestAttachments.length > 0) {
    const builtImages = await buildMessageImageSources(requestAttachments);
    const imageMarkdown = builtImages.content;
    const fileAttachmentMentionText = buildMessageFileAttachmentMentionText(requestAttachments);
    messageImageSources = builtImages.imageSources;
    storageContent = [
      imageMarkdown,
      fileAttachmentMentionText,
      userMessageText,
    ].filter((part) => part.trim()).join('\n\n');
  }

  if (!storageContent.trim() && noteMentions.length > 0) {
    storageContent = mentionText;
  }

  return {
    storageContent,
    messageImageSources,
  };
}

interface SendMessageApiContentOptions {
  requestAttachments: Attachment[];
  userMessageText: string;
  noteMentions: NoteMentionReference[];
  signal: AbortSignal;
  persistContextImages?: boolean;
}

export interface SendMessageApiPayload {
  content: ChatMessageContent;
  requestContext?: ChatRequestContextSnapshot;
  createdContextAttachmentFilenames?: string[];
}

function getStoredAttachmentSource(attachment: Attachment): string | null {
  const filename = extractStoredAttachmentFilename(attachment.assetUrl)
    ?? extractStoredAttachmentFilename(attachment.previewUrl)
    ?? extractTrustedManagedAttachmentPathFilename(attachment.path);
  return filename ? `attachment://${encodeURIComponent(filename)}` : null;
}

async function getContextImageSource(
  attachment: Attachment,
  imagePart: ChatMessageContentPart,
  persistContextImages: boolean,
): Promise<{ source: string; createdFilename?: string } | null> {
  if (imagePart.type !== 'image_url') return null;
  const storedSource = getStoredAttachmentSource(attachment);
  if (storedSource) return { source: storedSource };

  const rawSource = getAttachmentMessageImageSrc(attachment).trim();
  if (/^https?:\/\//i.test(rawSource)) return { source: rawSource };
  if (!persistContextImages) return { source: imagePart.image_url.url };

  const persistedSource = await persistDataUrlAttachment(imagePart.image_url.url);
  if (!persistedSource) {
    throw new Error('Failed to persist chat image context');
  }
  const createdFilename = extractStoredAttachmentFilename(persistedSource);
  if (!createdFilename) {
    throw new Error('Invalid persisted chat image context');
  }
  return { source: persistedSource, createdFilename };
}

export async function buildSendMessageApiPayload({
  requestAttachments,
  userMessageText,
  noteMentions,
  signal,
  persistContextImages = false,
}: SendMessageApiContentOptions): Promise<SendMessageApiPayload> {
  throwIfChatRequestAborted(signal);
  const [mentionedNotes, mentionedFolderImages, fileAttachmentContext] = await Promise.all([
    loadMentionedNotes(noteMentions),
    loadMentionedFolderImageAttachments(noteMentions),
    buildMessageFileAttachmentContext(requestAttachments),
  ]);
  throwIfChatRequestAborted(signal);
  const notesContext = buildMentionedNotesContext(mentionedNotes);
  const requestText = [
    fileAttachmentContext,
    userMessageText,
  ].filter((part) => part.trim()).join('\n\n');
  const textPayload = notesContext
    ? requestText
      ? `${notesContext}\n\nUser request:\n${requestText}`
      : `${notesContext}\n\nUser request: (none)`
    : requestText;

  let apiMessageContent: ChatMessageContent = textPayload;
  const contextImageSources: string[] = [];
  const createdContextAttachmentFilenames: string[] = [];
  const attachmentSources = requestAttachments
    .map(getStoredAttachmentSource)
    .filter((source): source is string => source !== null);
  const apiAttachments = limitChatMessageImageAttachments([
    ...requestAttachments.filter(isImageAttachment),
    ...mentionedFolderImages,
  ]);
  try {
    if (apiAttachments.length > 0) {
      const parts: ChatMessageContentPart[] = [];
      if (textPayload) {
        parts.push({ type: 'text', text: textPayload });
      }
      for (const attachment of apiAttachments) {
        throwIfChatRequestAborted(signal);
        const imagePart = await normalizeVisionAttachment(attachment);
        throwIfChatRequestAborted(signal);
        if (imagePart) {
          parts.push(imagePart);
          const contextSource = await getContextImageSource(
            attachment,
            imagePart,
            persistContextImages,
          );
          if (contextSource) {
            contextImageSources.push(contextSource.source);
            if (contextSource.source.startsWith('attachment://')) {
              attachmentSources.push(contextSource.source);
            }
            if (contextSource.createdFilename) {
              createdContextAttachmentFilenames.push(contextSource.createdFilename);
            }
          }
          throwIfChatRequestAborted(signal);
        }
      }
      if (parts.length > 0) {
        apiMessageContent = parts;
      }
    }
  } catch (error) {
    await deleteCreatedRequestContextAttachments(createdContextAttachmentFilenames);
    throw error;
  }

  const hasEnrichedContext = Boolean(
    notesContext || fileAttachmentContext || contextImageSources.length > 0,
  );
  const requestContext = hasEnrichedContext
    ? normalizeChatRequestContextSnapshot({
        text: textPayload,
        imageSources: contextImageSources,
        attachmentSources,
      })
    : undefined;

  return {
    content: apiMessageContent,
    ...(requestContext ? { requestContext } : {}),
    ...(createdContextAttachmentFilenames.length > 0
      ? { createdContextAttachmentFilenames }
      : {}),
  };
}

export async function buildSendMessageApiContent(
  options: SendMessageApiContentOptions,
): Promise<ChatMessageContent> {
  return (await buildSendMessageApiPayload(options)).content;
}
