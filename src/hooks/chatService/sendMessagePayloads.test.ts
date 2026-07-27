import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  buildMentionedNotesContext: vi.fn(() => 'Referenced notes'),
  buildMessageFileAttachmentContext: vi.fn(),
  deleteStoredAttachmentFile: vi.fn(async () => {}),
  loadMentionedFolderImageAttachments: vi.fn(),
  loadMentionedNotes: vi.fn(),
  persistDataUrlAttachment: vi.fn(),
}));

vi.mock('./helpers', async (importOriginal) => ({
  ...await importOriginal<typeof import('./helpers')>(),
  buildMentionedNotesContext: mocks.buildMentionedNotesContext,
  buildMessageFileAttachmentContext: mocks.buildMessageFileAttachmentContext,
  loadMentionedFolderImageAttachments: mocks.loadMentionedFolderImageAttachments,
  loadMentionedNotes: mocks.loadMentionedNotes,
}));

vi.mock('@/lib/storage/attachmentStorage', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/storage/attachmentStorage')>(),
  deleteStoredAttachmentFile: mocks.deleteStoredAttachmentFile,
  persistDataUrlAttachment: mocks.persistDataUrlAttachment,
}));

import type { Attachment } from '@/lib/storage/attachmentStorage';
import { buildSendMessageApiContent, buildSendMessageApiPayload } from './sendMessagePayloads';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

describe('send message payload preparation', () => {
  beforeEach(() => {
    mocks.buildMentionedNotesContext.mockClear();
    mocks.buildMessageFileAttachmentContext.mockReset();
    mocks.deleteStoredAttachmentFile.mockClear();
    mocks.loadMentionedFolderImageAttachments.mockReset();
    mocks.loadMentionedNotes.mockReset();
    mocks.persistDataUrlAttachment.mockReset();
    mocks.buildMessageFileAttachmentContext.mockResolvedValue('');
    mocks.loadMentionedFolderImageAttachments.mockResolvedValue([]);
    mocks.loadMentionedNotes.mockResolvedValue([]);
  });

  it('loads note, folder image, and file contexts in parallel', async () => {
    const notes = deferred<Array<{ path: string; title: string; kind: 'note'; content: string }>>();
    const folderImages = deferred<never[]>();
    const fileContext = deferred<string>();
    mocks.loadMentionedNotes.mockReturnValue(notes.promise);
    mocks.loadMentionedFolderImageAttachments.mockReturnValue(folderImages.promise);
    mocks.buildMessageFileAttachmentContext.mockReturnValue(fileContext.promise);

    const request = buildSendMessageApiContent({
      requestAttachments: [],
      userMessageText: 'Question',
      noteMentions: [],
      signal: new AbortController().signal,
    });

    await vi.waitFor(() => {
      expect(mocks.loadMentionedNotes).toHaveBeenCalledOnce();
      expect(mocks.loadMentionedFolderImageAttachments).toHaveBeenCalledOnce();
      expect(mocks.buildMessageFileAttachmentContext).toHaveBeenCalledOnce();
    });

    notes.resolve([{ path: 'notes/a.md', title: 'A', kind: 'note', content: 'A' }]);
    folderImages.resolve([]);
    fileContext.resolve('Attached files');

    await expect(request).resolves.toBe('Referenced notes\n\nUser request:\nAttached files\n\nQuestion');
  });

  it('deletes a newly persisted context image when payload preparation is aborted', async () => {
    const persistence = deferred<string | null>();
    const controller = new AbortController();
    const folderImage: Attachment = {
      id: 'folder-image',
      path: '/notes/images/context.png',
      previewUrl: 'data:image/png;base64,AQI=',
      assetUrl: '',
      name: 'context.png',
      type: 'image/png',
      size: 2,
    };
    mocks.loadMentionedFolderImageAttachments.mockResolvedValue([folderImage]);
    mocks.persistDataUrlAttachment.mockReturnValue(persistence.promise);

    const request = buildSendMessageApiPayload({
      requestAttachments: [],
      userMessageText: 'Question',
      noteMentions: [],
      signal: controller.signal,
      persistContextImages: true,
    });
    await vi.waitFor(() => expect(mocks.persistDataUrlAttachment).toHaveBeenCalledOnce());

    controller.abort();
    persistence.resolve('attachment://created-context.png');

    await expect(request).rejects.toMatchObject({ name: 'AbortError' });
    expect(mocks.deleteStoredAttachmentFile).toHaveBeenCalledWith('created-context.png');
  });
});
