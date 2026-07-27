import { convertToBase64, deleteAttachment, type Attachment } from '@/lib/storage/attachmentStorage';
import { isStoredAttachmentSrc } from '@/lib/storage/attachmentUrl';
import {
  isAllowedChatImageAttachmentPath,
  isImageAttachment,
} from './helpers';
import { throwIfChatRequestAborted } from './requestLifecycle';

export const MAX_TEMPORARY_ATTACHMENT_EPHEMERAL_CONCURRENCY = 4;

async function mapWithConcurrencyLimit<T, R>(
  items: readonly T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (nextIndex < items.length) {
        const index = nextIndex;
        nextIndex += 1;
        results[index] = await mapper(items[index]!, index);
      }
    },
  );

  await Promise.all(workers);
  return results;
}

export async function makeTemporaryAttachmentsEphemeral(
  attachments: Attachment[],
  signal?: AbortSignal,
  onAttachmentConverted?: (index: number, attachment: Attachment) => void,
): Promise<Attachment[]> {
  const ephemeralAttachments = await mapWithConcurrencyLimit(
    attachments,
    MAX_TEMPORARY_ATTACHMENT_EPHEMERAL_CONCURRENCY,
    async (attachment, index) => {
      throwIfChatRequestAborted(signal);
      if (!isImageAttachment(attachment)) {
        return attachment;
      }
      const hasPersistentReference =
        !!attachment.path ||
        isStoredAttachmentSrc(attachment.previewUrl) ||
        isStoredAttachmentSrc(attachment.assetUrl);

      if (!hasPersistentReference) {
        return attachment;
      }

      const previewUrl = await convertToBase64(attachment, {
        allowPath: isAllowedChatImageAttachmentPath,
      });
      throwIfChatRequestAborted(signal);

      const ephemeralAttachment = {
        ...attachment,
        path: '',
        assetUrl: '',
        previewUrl,
      };
      onAttachmentConverted?.(index, ephemeralAttachment);
      await deleteAttachment(attachment);
      return ephemeralAttachment;
    },
  );

  return ephemeralAttachments;
}
