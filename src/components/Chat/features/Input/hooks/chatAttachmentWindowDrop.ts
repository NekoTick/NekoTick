import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { collectChatAttachmentTransferFiles } from './chatAttachmentInputFiles';

interface UseChatAttachmentWindowDropOptions {
  active: boolean;
  dragDepthRef: MutableRefObject<number>;
  hasFileTransfer: (transfer: DataTransfer | null | undefined) => boolean;
  processFiles: (files: File[]) => Promise<void>;
  setIsDragging: Dispatch<SetStateAction<boolean>>;
}

export function useChatAttachmentWindowDrop({
  active,
  dragDepthRef,
  hasFileTransfer,
  processFiles,
  setIsDragging,
}: UseChatAttachmentWindowDropOptions): void {
  useEffect(() => {
    if (!active || typeof window === 'undefined') {
      return;
    }

    const onWindowDragOver = (event: DragEvent) => {
      if (!hasFileTransfer(event.dataTransfer)) {
        return;
      }
      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = 'copy';
      }
      setIsDragging(true);
    };

    const onWindowDrop = (event: DragEvent) => {
      if (event.defaultPrevented || !hasFileTransfer(event.dataTransfer)) {
        return;
      }
      event.preventDefault();
      dragDepthRef.current = 0;
      setIsDragging(false);
      const files = collectChatAttachmentTransferFiles(event.dataTransfer);
      if (files.length > 0) {
        void processFiles(files).catch(() => undefined);
      }
    };

    const onWindowDragLeave = (event: DragEvent) => {
      if (!hasFileTransfer(event.dataTransfer)) {
        return;
      }
      if (event.clientX === 0 && event.clientY === 0) {
        dragDepthRef.current = 0;
        setIsDragging(false);
      }
    };

    window.addEventListener('dragover', onWindowDragOver);
    window.addEventListener('drop', onWindowDrop);
    window.addEventListener('dragleave', onWindowDragLeave);

    return () => {
      window.removeEventListener('dragover', onWindowDragOver);
      window.removeEventListener('drop', onWindowDrop);
      window.removeEventListener('dragleave', onWindowDragLeave);
    };
  }, [active, dragDepthRef, hasFileTransfer, processFiles, setIsDragging]);
}
