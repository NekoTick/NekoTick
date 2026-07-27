import { useCallback, useEffect, useRef, useState } from 'react';
import { saveAttachment, type Attachment } from '@/lib/storage/attachmentStorage';
import { useAIUIStore } from '@/stores/ai/chatState';
import { useToastStore } from '@/stores/useToastStore';
import {
  collectChatAttachmentClipboardFiles,
  collectChatAttachmentFiles,
  collectChatAttachmentTransferFiles,
  hasChatAttachmentFileTransfer,
  hasChatAttachmentFileType,
  hasChatAttachmentTransferItem,
  MAX_CHAT_ATTACHMENT_INPUT_FILES,
  MAX_CHAT_ATTACHMENT_TRANSFER_ITEM_SCAN,
} from './chatAttachmentInputFiles';
import {
  deleteAttachmentQuietly,
  getAttachmentSaveFailureToastMessage,
  settleWithConcurrencyLimit,
  MAX_CHAT_ATTACHMENT_SAVE_CONCURRENCY,
} from './chatAttachmentPersistence';
import { useChatAttachmentUndoStack } from './chatAttachmentUndoStack';
import { useChatAttachmentWindowDrop } from './chatAttachmentWindowDrop';

export {
  collectChatAttachmentClipboardFiles,
  collectChatAttachmentFiles,
  collectChatAttachmentTransferFiles,
  hasChatAttachmentFileTransfer,
  hasChatAttachmentFileType,
  hasChatAttachmentTransferItem,
  MAX_CHAT_ATTACHMENT_INPUT_FILES,
  MAX_CHAT_ATTACHMENT_SAVE_CONCURRENCY,
  MAX_CHAT_ATTACHMENT_TRANSFER_ITEM_SCAN,
};

export function useChatAttachments(active = true) {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragDepthRef = useRef(0);
  const attachmentsRef = useRef<Attachment[]>([]);
  const pendingAttachmentSaveCountRef = useRef(0);
  const attachmentGenerationRef = useRef(0);
  const isMountedRef = useRef(true);
  const {
    flushRemovedAttachmentUndoStack,
    removeAttachment,
    undoLastRemovedAttachment,
    discardRemovedAttachmentUndoStack,
  } = useChatAttachmentUndoStack({ attachmentsRef, setAttachments });

  useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      flushRemovedAttachmentUndoStack();
      isMountedRef.current = false;
      attachmentGenerationRef.current += 1;
      attachmentsRef.current = [];
    };
  }, [flushRemovedAttachmentUndoStack]);

  useEffect(() => {
    if (active) return;
    dragDepthRef.current = 0;
    setIsDragging(false);
  }, [active]);

  const hasFileTransfer = useCallback(
    (transfer: DataTransfer | null | undefined) => hasChatAttachmentFileTransfer(transfer),
    []
  );

  const hasFileDrag = useCallback(
    (event: React.DragEvent) => hasFileTransfer(event.dataTransfer),
    [hasFileTransfer]
  );

  const processFiles = useCallback(async (files: File[]) => {
    const generation = attachmentGenerationRef.current;
    const remainingSlots = Math.max(
      MAX_CHAT_ATTACHMENT_INPUT_FILES
      - attachmentsRef.current.length
      - pendingAttachmentSaveCountRef.current,
      0
    );
    const limitedFiles = files.length > remainingSlots
      ? files.slice(0, remainingSlots)
      : files;
    if (limitedFiles.length === 0) {
      return;
    }

    flushRemovedAttachmentUndoStack();

    pendingAttachmentSaveCountRef.current += limitedFiles.length;
    const shouldPersist = !useAIUIStore.getState().temporaryChatEnabled;
    let results: PromiseSettledResult<Attachment>[];
    try {
      results = await settleWithConcurrencyLimit(
        limitedFiles,
        MAX_CHAT_ATTACHMENT_SAVE_CONCURRENCY,
        (file) => saveAttachment(file, { persist: shouldPersist })
      );
    } finally {
      pendingAttachmentSaveCountRef.current = Math.max(
        pendingAttachmentSaveCountRef.current - limitedFiles.length,
        0
      );
    }

    const newAttachments: Attachment[] = [];
    results.forEach((result) => {
      if (result.status === 'fulfilled') {
        newAttachments.push(result.value);
      }
    });

    if (!isMountedRef.current || generation !== attachmentGenerationRef.current) {
      newAttachments.forEach((attachment) => {
        deleteAttachmentQuietly(attachment);
      });
      return;
    }

    const failureToastMessage = getAttachmentSaveFailureToastMessage(results);
    if (failureToastMessage) {
      useToastStore.getState().addToast(failureToastMessage, 'error', 3500);
    }

    if (newAttachments.length > 0) {
      setAttachments((prev) => {
        if (generation !== attachmentGenerationRef.current) {
          newAttachments.forEach((attachment) => {
            deleteAttachmentQuietly(attachment);
          });
          return prev;
        }

        const availableSlots = Math.max(MAX_CHAT_ATTACHMENT_INPUT_FILES - prev.length, 0);
        if (availableSlots <= 0) {
          newAttachments.forEach((attachment) => {
            deleteAttachmentQuietly(attachment);
          });
          return prev;
        }

        const acceptedAttachments = newAttachments.slice(0, availableSlots);
        newAttachments.slice(availableSlots).forEach((attachment) => {
          deleteAttachmentQuietly(attachment);
        });
        const nextAttachments = [...prev, ...acceptedAttachments];
        attachmentsRef.current = nextAttachments;
        return nextAttachments;
      });
    }
  }, [flushRemovedAttachmentUndoStack]);

  useChatAttachmentWindowDrop({
    active,
    dragDepthRef,
    hasFileTransfer,
    processFiles,
    setIsDragging,
  });

  const handlePaste = useCallback(
    async (e: React.ClipboardEvent) => {
      const files = collectChatAttachmentClipboardFiles(e.clipboardData.items);

      if (files.length > 0) {
        e.preventDefault();
        await processFiles(files);
      }
    },
    [processFiles]
  );

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      if (!hasFileDrag(e)) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      dragDepthRef.current = 0;
      setIsDragging(false);
      await processFiles(collectChatAttachmentTransferFiles(e.dataTransfer));
    },
    [hasFileDrag, processFiles]
  );

  const handleDragEnter = useCallback(
    (e: React.DragEvent) => {
      if (!hasFileDrag(e)) {
        return;
      }
      e.preventDefault();
      dragDepthRef.current += 1;
      setIsDragging(true);
    },
    [hasFileDrag]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (!hasFileDrag(e)) {
      return;
    }
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setIsDragging(true);
  }, [hasFileDrag]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    if (!hasFileDrag(e)) {
      return;
    }
    e.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) {
      setIsDragging(false);
    }
  }, [hasFileDrag]);

  const clearDragState = useCallback(() => {
    dragDepthRef.current = 0;
    setIsDragging(false);
  }, []);

  const clearAttachments = useCallback(() => {
    flushRemovedAttachmentUndoStack();
    attachmentGenerationRef.current += 1;
    attachmentsRef.current = [];
    setAttachments([]);
  }, [flushRemovedAttachmentUndoStack]);

  const restoreAttachments = useCallback((nextAttachments: Attachment[]) => {
    attachmentGenerationRef.current += 1;
    const restoredAttachments = nextAttachments.slice(0, MAX_CHAT_ATTACHMENT_INPUT_FILES);
    const restoredIds = new Set(restoredAttachments.map((attachment) => attachment.id));
    flushRemovedAttachmentUndoStack(restoredIds);
    attachmentsRef.current = restoredAttachments;
    setAttachments((prev) => {
      prev
        .filter((attachment) => !restoredIds.has(attachment.id))
        .forEach((attachment) => {
          deleteAttachmentQuietly(attachment);
        });
      return restoredAttachments;
    });
  }, [flushRemovedAttachmentUndoStack]);

  const triggerFileSelect = useCallback(() => {
    const input = fileInputRef.current;
    if (!input) return;

    input.value = '';
    if (typeof input.showPicker === 'function') {
      try {
        input.showPicker();
        return;
      } catch {
        input.click();
        return;
      }
    }
    input.click();
  }, []);

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) {
        await processFiles(collectChatAttachmentFiles(e.target.files));
      }
      e.target.value = '';
    },
    [processFiles]
  );

  return {
    attachments,
    isDragging,
    fileInputRef,
    handlePaste,
    handleDrop,
    handleDragEnter,
    handleDragOver,
    handleDragLeave,
    handleFileChange,
    triggerFileSelect,
    removeAttachment,
    undoLastRemovedAttachment,
    discardRemovedAttachmentUndoStack,
    clearAttachments,
    clearDragState,
    restoreAttachments,
  };
}
