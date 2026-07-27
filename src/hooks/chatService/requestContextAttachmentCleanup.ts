import { deleteStoredAttachmentFile } from '@/lib/storage/attachmentStorage'

export async function deleteCreatedRequestContextAttachments(
  filenames: readonly string[] | undefined,
): Promise<void> {
  for (const filename of new Set(filenames ?? [])) {
    await deleteStoredAttachmentFile(filename).catch(() => undefined)
  }
}
