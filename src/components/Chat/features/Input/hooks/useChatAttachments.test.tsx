import { StrictMode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Attachment } from '@/lib/storage/attachmentStorage';
import { deleteAttachment, saveAttachment } from '@/lib/storage/attachmentStorage';
import {
  collectChatAttachmentFiles,
  MAX_CHAT_ATTACHMENT_INPUT_FILES,
  MAX_CHAT_ATTACHMENT_SAVE_CONCURRENCY,
  MAX_CHAT_ATTACHMENT_TRANSFER_ITEM_SCAN,
  useChatAttachments,
} from './useChatAttachments';

const mocks = vi.hoisted(() => ({
  addToast: vi.fn(),
  deleteAttachment: vi.fn(),
  saveAttachment: vi.fn(),
  temporaryChatEnabled: false,
}));

vi.mock('@/lib/storage/attachmentStorage', () => ({
  deleteAttachment: mocks.deleteAttachment,
  saveAttachment: mocks.saveAttachment,
}));

vi.mock('@/stores/ai/chatState', () => ({
  useAIUIStore: {
    getState: () => ({
      temporaryChatEnabled: mocks.temporaryChatEnabled,
    }),
  },
}));

vi.mock('@/stores/useToastStore', () => ({
  useToastStore: {
    getState: () => ({
      addToast: mocks.addToast,
    }),
  },
}));

function createAttachment(overrides: Partial<Attachment> = {}): Attachment {
  return {
    id: 'attachment-1',
    path: '',
    previewUrl: 'data:image/png;base64,AQID',
    assetUrl: '',
    name: 'photo.png',
    type: 'image/png',
    size: 3,
    ...overrides,
  };
}

function createFileList(files: File[]): FileList {
  return {
    item: (index: number) => files[index] ?? null,
    ...files,
    length: files.length,
  } as unknown as FileList;
}

function createClipboardItems(files: File[]): DataTransferItemList {
  const items: Array<DataTransferItem | undefined> = files.map((file) => ({
    getAsFile: () => file,
    getAsString: () => {},
    kind: 'file',
    type: file.type,
    webkitGetAsEntry: () => null,
  } as unknown as DataTransferItem));
  items.length = MAX_CHAT_ATTACHMENT_TRANSFER_ITEM_SCAN + 20;
  return {
    add: vi.fn(),
    clear: vi.fn(),
    item: (index: number) => items[index] ?? null,
    remove: vi.fn(),
    ...items,
    length: items.length,
  } as unknown as DataTransferItemList;
}

describe('useChatAttachments', () => {
  beforeEach(() => {
    mocks.addToast.mockReset();
    mocks.deleteAttachment.mockReset();
    mocks.saveAttachment.mockReset();
    mocks.temporaryChatEnabled = false;
  });

  it('keeps accepted files and ignores rejected attachments', async () => {
    const accepted = createAttachment();
    mocks.saveAttachment
      .mockResolvedValueOnce(accepted)
      .mockRejectedValueOnce(new Error('Unsupported attachment type'));
    const { result } = renderHook(() => useChatAttachments());

    await act(async () => {
      await result.current.handleFileChange({
        target: {
          files: [
            new File(['image'], 'photo.png', { type: 'image/png' }),
            new File(['pdf'], 'note.pdf', { type: 'application/pdf' }),
          ],
          value: 'selected',
        },
      } as unknown as React.ChangeEvent<HTMLInputElement>);
    });

    expect(saveAttachment).toHaveBeenNthCalledWith(1, expect.objectContaining({ name: 'photo.png' }), { persist: true });
    expect(saveAttachment).toHaveBeenNthCalledWith(2, expect.objectContaining({ name: 'note.pdf' }), { persist: true });
    expect(result.current.attachments).toEqual([accepted]);
    expect(mocks.addToast).toHaveBeenCalledWith('Unsupported File', 'error', 3500);
  });

  it('collects readable File-like objects from drag payloads', () => {
    const fileLike = {
      name: 'electron-drop.png',
      type: 'image/png',
      size: 5,
      arrayBuffer: async () => new ArrayBuffer(5),
    } as unknown as File;

    expect(collectChatAttachmentFiles([fileLike])).toEqual([fileLike]);
  });

  it('uses data transfer items when dropped files are empty', async () => {
    const accepted = createAttachment({ id: 'dropped-item', name: 'dropped-item.png' });
    const file = new File(['image'], 'dropped-item.png', { type: 'image/png' });
    mocks.saveAttachment.mockResolvedValueOnce(accepted);
    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();
    const { result } = renderHook(() => useChatAttachments());

    await act(async () => {
      await result.current.handleDrop({
        dataTransfer: {
          files: createFileList([]),
          items: createClipboardItems([file]),
          types: ['Files'],
          dropEffect: 'none',
        },
        preventDefault,
        stopPropagation,
      } as unknown as React.DragEvent);
    });

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(stopPropagation).toHaveBeenCalledTimes(1);
    expect(saveAttachment).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'dropped-item.png' }),
      { persist: true }
    );
    expect(result.current.attachments).toEqual([accepted]);
  });

  it('routes window attachment drops only to the active Chat instance', async () => {
    const accepted = createAttachment({ id: 'active-drop', name: 'active-drop.png' });
    const file = new File(['image'], 'active-drop.png', { type: 'image/png' });
    mocks.saveAttachment.mockResolvedValueOnce(accepted);
    const inactive = renderHook(() => useChatAttachments(false));
    const active = renderHook(() => useChatAttachments(true));
    const dropEvent = new Event('drop', { cancelable: true });
    Object.defineProperty(dropEvent, 'dataTransfer', {
      value: {
        files: createFileList([file]),
        items: [],
        types: ['Files'],
      },
    });

    act(() => {
      window.dispatchEvent(dropEvent);
    });

    await waitFor(() => expect(active.result.current.attachments).toEqual([accepted]));
    expect(inactive.result.current.attachments).toEqual([]);
    expect(saveAttachment).toHaveBeenCalledTimes(1);
  });

  it('keeps async attachments after Strict Mode replays mount effects', async () => {
    const accepted = createAttachment({ id: 'strict-mode-attachment' });
    mocks.saveAttachment.mockResolvedValueOnce(accepted);
    const { result } = renderHook(() => useChatAttachments(), { wrapper: StrictMode });

    await act(async () => {
      await result.current.handleFileChange({
        target: {
          files: [new File(['image'], 'photo.png', { type: 'image/png' })],
          value: 'selected',
        },
      } as unknown as React.ChangeEvent<HTMLInputElement>);
    });

    expect(result.current.attachments).toEqual([accepted]);
    expect(deleteAttachment).not.toHaveBeenCalled();
  });

  it('clears a stale drag overlay when Chat becomes inactive', () => {
    const { result, rerender } = renderHook(
      ({ active }) => useChatAttachments(active),
      { initialProps: { active: true } },
    );
    const dragEvent = new Event('dragover', { cancelable: true });
    Object.defineProperty(dragEvent, 'dataTransfer', {
      value: {
        files: createFileList([]),
        items: [],
        types: ['Files'],
        dropEffect: 'none',
      },
    });

    act(() => {
      window.dispatchEvent(dragEvent);
    });
    expect(result.current.isDragging).toBe(true);

    rerender({ active: false });

    expect(result.current.isDragging).toBe(false);
  });

  it('keeps temporary chat attachments in memory', async () => {
    mocks.temporaryChatEnabled = true;
    mocks.saveAttachment.mockResolvedValueOnce(createAttachment());
    const { result } = renderHook(() => useChatAttachments());

    await act(async () => {
      await result.current.handleFileChange({
        target: {
          files: [new File(['image'], 'photo.png', { type: 'image/png' })],
          value: 'selected',
        },
      } as unknown as React.ChangeEvent<HTMLInputElement>);
    });

    expect(saveAttachment).toHaveBeenCalledWith(expect.objectContaining({ name: 'photo.png' }), { persist: false });
  });

  it('restores a removed attachment before deleting its file', async () => {
    const first = createAttachment({ id: 'first', path: '/appdata/.vlaina/chat/attachments/first.png' });
    const second = createAttachment({ id: 'second', path: '/appdata/.vlaina/chat/attachments/second.png' });
    mocks.saveAttachment
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(second);
    const { result } = renderHook(() => useChatAttachments());

    await act(async () => {
      await result.current.handleFileChange({
        target: {
          files: [
            new File(['first'], 'first.png', { type: 'image/png' }),
            new File(['second'], 'second.png', { type: 'image/png' }),
          ],
          value: 'selected',
        },
      } as unknown as React.ChangeEvent<HTMLInputElement>);
    });

    act(() => {
      result.current.removeAttachment('first');
    });

    expect(result.current.attachments).toEqual([second]);
    expect(deleteAttachment).not.toHaveBeenCalled();

    act(() => {
      expect(result.current.undoLastRemovedAttachment()).toBe(true);
    });

    expect(result.current.attachments).toEqual([first, second]);
    expect(deleteAttachment).not.toHaveBeenCalled();
  });

  it('deletes removed attachment files when their undo entry is discarded', async () => {
    const first = createAttachment({ id: 'first', path: '/appdata/.vlaina/chat/attachments/first.png' });
    const second = createAttachment({ id: 'second', path: '/appdata/.vlaina/chat/attachments/second.png' });
    mocks.saveAttachment
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(second);
    const { result } = renderHook(() => useChatAttachments());

    await act(async () => {
      await result.current.handleFileChange({
        target: {
          files: [
            new File(['first'], 'first.png', { type: 'image/png' }),
            new File(['second'], 'second.png', { type: 'image/png' }),
          ],
          value: 'selected',
        },
      } as unknown as React.ChangeEvent<HTMLInputElement>);
    });

    act(() => {
      result.current.removeAttachment('first');
    });

    expect(result.current.attachments).toEqual([second]);
    expect(deleteAttachment).not.toHaveBeenCalled();

    act(() => {
      result.current.discardRemovedAttachmentUndoStack();
    });

    expect(result.current.attachments).toEqual([second]);
    expect(deleteAttachment).toHaveBeenCalledTimes(1);
    expect(deleteAttachment).toHaveBeenCalledWith(first);
  });

  it('does not delete attachment files when clearing after a successful send', async () => {
    const sent = createAttachment({ id: 'sent', path: '/appdata/.vlaina/chat/attachments/sent.png' });
    mocks.saveAttachment.mockResolvedValueOnce(sent);
    const { result } = renderHook(() => useChatAttachments());

    await act(async () => {
      await result.current.handleFileChange({
        target: {
          files: [new File(['sent'], 'sent.png', { type: 'image/png' })],
          value: 'selected',
        },
      } as unknown as React.ChangeEvent<HTMLInputElement>);
    });

    act(() => {
      result.current.clearAttachments();
    });

    expect(result.current.attachments).toEqual([]);
    expect(deleteAttachment).not.toHaveBeenCalled();
  });

  it('does not re-add attachments that finish saving after attachments are cleared', async () => {
    const lateAttachment = createAttachment({
      id: 'late',
      path: '/appdata/.vlaina/chat/attachments/late.png',
    });
    let resolveSave!: (attachment: Attachment) => void;
    mocks.saveAttachment.mockImplementationOnce(
      () => new Promise<Attachment>((resolve) => {
        resolveSave = resolve;
      }),
    );
    const { result } = renderHook(() => useChatAttachments());

    let fileChangeRequest!: Promise<void>;
    await act(async () => {
      fileChangeRequest = result.current.handleFileChange({
        target: {
          files: [new File(['late'], 'late.png', { type: 'image/png' })],
          value: 'selected',
        },
      } as unknown as React.ChangeEvent<HTMLInputElement>);
      await vi.waitFor(() => {
        expect(saveAttachment).toHaveBeenCalledTimes(1);
      });
    });

    act(() => {
      result.current.clearAttachments();
    });

    await act(async () => {
      resolveSave(lateAttachment);
      await fileChangeRequest;
    });

    expect(result.current.attachments).toEqual([]);
    expect(deleteAttachment).toHaveBeenCalledWith(lateAttachment);
  });

  it('keeps restored attachments when older pending saves finish later', async () => {
    const staleAttachment = createAttachment({
      id: 'stale',
      path: '/appdata/.vlaina/chat/attachments/stale.png',
    });
    const restoredAttachment = createAttachment({
      id: 'restored',
      path: '/appdata/.vlaina/chat/attachments/restored.png',
      name: 'restored.png',
    });
    let resolveSave!: (attachment: Attachment) => void;
    mocks.saveAttachment.mockImplementationOnce(
      () => new Promise<Attachment>((resolve) => {
        resolveSave = resolve;
      }),
    );
    const { result } = renderHook(() => useChatAttachments());

    let fileChangeRequest!: Promise<void>;
    await act(async () => {
      fileChangeRequest = result.current.handleFileChange({
        target: {
          files: [new File(['stale'], 'stale.png', { type: 'image/png' })],
          value: 'selected',
        },
      } as unknown as React.ChangeEvent<HTMLInputElement>);
      await vi.waitFor(() => {
        expect(saveAttachment).toHaveBeenCalledTimes(1);
      });
    });

    act(() => {
      result.current.restoreAttachments([restoredAttachment]);
    });

    await act(async () => {
      resolveSave(staleAttachment);
      await fileChangeRequest;
    });

    expect(result.current.attachments).toEqual([restoredAttachment]);
    expect(deleteAttachment).toHaveBeenCalledWith(staleAttachment);
  });

  it('cleans up attachments that finish saving after the hook unmounts', async () => {
    const lateAttachment = createAttachment({
      id: 'late-unmounted',
      path: '/appdata/.vlaina/chat/attachments/late-unmounted.png',
    });
    let resolveSave!: (attachment: Attachment) => void;
    mocks.saveAttachment.mockImplementationOnce(
      () => new Promise<Attachment>((resolve) => {
        resolveSave = resolve;
      }),
    );
    const { result, unmount } = renderHook(() => useChatAttachments());

    let fileChangeRequest!: Promise<void>;
    await act(async () => {
      fileChangeRequest = result.current.handleFileChange({
        target: {
          files: [new File(['late'], 'late-unmounted.png', { type: 'image/png' })],
          value: 'selected',
        },
      } as unknown as React.ChangeEvent<HTMLInputElement>);
      await vi.waitFor(() => {
        expect(saveAttachment).toHaveBeenCalledTimes(1);
      });
    });

    unmount();

    await act(async () => {
      resolveSave(lateAttachment);
      await fileChangeRequest;
    });

    expect(deleteAttachment).toHaveBeenCalledWith(lateAttachment);
  });

  it('limits oversized file selections before saving attachments', async () => {
    const files: File[] = [];
    for (let index = 0; index < MAX_CHAT_ATTACHMENT_INPUT_FILES + 5; index += 1) {
      files.push(new File(['image'], `photo-${index}.png`, { type: 'image/png' }));
    }
    mocks.saveAttachment.mockImplementation(async (file: File) => createAttachment({
      id: file.name,
      name: file.name,
    }));
    const { result } = renderHook(() => useChatAttachments());

    await act(async () => {
      await result.current.handleFileChange({
        target: {
          files: createFileList(files),
          value: 'selected',
        },
      } as unknown as React.ChangeEvent<HTMLInputElement>);
    });

    expect(saveAttachment).toHaveBeenCalledTimes(MAX_CHAT_ATTACHMENT_INPUT_FILES);
    expect(saveAttachment).toHaveBeenLastCalledWith(
      expect.objectContaining({ name: `photo-${MAX_CHAT_ATTACHMENT_INPUT_FILES - 1}.png` }),
      { persist: true }
    );
    expect(result.current.attachments).toHaveLength(MAX_CHAT_ATTACHMENT_INPUT_FILES);
  });

  it('limits concurrent attachment saves while preserving accepted file order', async () => {
    let activeSaves = 0;
    let maxActiveSaves = 0;
    const resolveSaves: Array<() => void> = [];
    const files = Array.from({ length: MAX_CHAT_ATTACHMENT_SAVE_CONCURRENCY + 3 }, (_value, index) =>
      new File(['image'], `photo-${index}.png`, { type: 'image/png' })
    );
    mocks.saveAttachment.mockImplementation(async (file: File) => {
      activeSaves += 1;
      maxActiveSaves = Math.max(maxActiveSaves, activeSaves);
      await new Promise<void>((resolve) => {
        resolveSaves.push(resolve);
      });
      activeSaves -= 1;
      return createAttachment({
        id: file.name,
        name: file.name,
      });
    });
    const { result } = renderHook(() => useChatAttachments());

    let fileChangeRequest!: Promise<void>;
    await act(async () => {
      fileChangeRequest = result.current.handleFileChange({
        target: {
          files: createFileList(files),
          value: 'selected',
        },
      } as unknown as React.ChangeEvent<HTMLInputElement>);
      await vi.waitFor(() => {
        expect(resolveSaves).toHaveLength(MAX_CHAT_ATTACHMENT_SAVE_CONCURRENCY);
      });
    });

    expect(maxActiveSaves).toBeLessThanOrEqual(MAX_CHAT_ATTACHMENT_SAVE_CONCURRENCY);
    while (resolveSaves.length > 0) {
      resolveSaves.shift()?.();
      await Promise.resolve();
    }
    await vi.waitFor(() => {
      expect(saveAttachment).toHaveBeenCalledTimes(files.length);
    });
    while (resolveSaves.length > 0) {
      resolveSaves.shift()?.();
      await Promise.resolve();
    }
    await act(async () => {
      await fileChangeRequest;
    });

    expect(maxActiveSaves).toBeLessThanOrEqual(MAX_CHAT_ATTACHMENT_SAVE_CONCURRENCY);
    expect(result.current.attachments.map((attachment) => attachment.name)).toEqual(
      files.map((file) => file.name)
    );
  });

  it('limits total attachments across multiple file selections before saving', async () => {
    mocks.saveAttachment.mockImplementation(async (file: File) => createAttachment({
      id: file.name,
      name: file.name,
    }));
    const firstBatch = Array.from({ length: MAX_CHAT_ATTACHMENT_INPUT_FILES - 1 }, (_value, index) =>
      new File(['image'], `first-${index}.png`, { type: 'image/png' })
    );
    const secondBatch = [
      new File(['image'], 'second-0.png', { type: 'image/png' }),
      new File(['image'], 'second-1.png', { type: 'image/png' }),
    ];
    const { result } = renderHook(() => useChatAttachments());

    await act(async () => {
      await result.current.handleFileChange({
        target: {
          files: createFileList(firstBatch),
          value: 'selected',
        },
      } as unknown as React.ChangeEvent<HTMLInputElement>);
    });
    await act(async () => {
      await result.current.handleFileChange({
        target: {
          files: createFileList(secondBatch),
          value: 'selected',
        },
      } as unknown as React.ChangeEvent<HTMLInputElement>);
    });

    expect(saveAttachment).toHaveBeenCalledTimes(MAX_CHAT_ATTACHMENT_INPUT_FILES);
    expect(saveAttachment).toHaveBeenLastCalledWith(
      expect.objectContaining({ name: 'second-0.png' }),
      { persist: true }
    );
    expect(saveAttachment).not.toHaveBeenCalledWith(
      expect.objectContaining({ name: 'second-1.png' }),
      expect.anything()
    );
    expect(result.current.attachments).toHaveLength(MAX_CHAT_ATTACHMENT_INPUT_FILES);
  });

  it('limits clipboard item scans and accepted attachment files', async () => {
    const files: File[] = [];
    for (let index = 0; index < MAX_CHAT_ATTACHMENT_INPUT_FILES + 20; index += 1) {
      files.push(new File(['image'], `paste-${index}.png`, { type: 'image/png' }));
    }
    mocks.saveAttachment.mockImplementation(async (file: File) => createAttachment({
      id: file.name,
      name: file.name,
    }));
    const preventDefault = vi.fn();
    const { result } = renderHook(() => useChatAttachments());

    await act(async () => {
      await result.current.handlePaste({
        clipboardData: {
          items: createClipboardItems(files),
        },
        preventDefault,
      } as unknown as React.ClipboardEvent);
    });

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(saveAttachment).toHaveBeenCalledTimes(MAX_CHAT_ATTACHMENT_INPUT_FILES);
    expect(saveAttachment).toHaveBeenLastCalledWith(
      expect.objectContaining({ name: `paste-${MAX_CHAT_ATTACHMENT_INPUT_FILES - 1}.png` }),
      { persist: true }
    );
    expect(result.current.attachments).toHaveLength(MAX_CHAT_ATTACHMENT_INPUT_FILES);
  });
});
