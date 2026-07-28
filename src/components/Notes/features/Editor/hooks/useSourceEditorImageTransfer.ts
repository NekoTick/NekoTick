import {
  useCallback,
  type ClipboardEvent as ReactClipboardEvent,
  type DragEvent as ReactDragEvent,
  type RefObject,
} from 'react';
import { useNotesStore } from '@/stores/useNotesStore';
import { hasClipboardImageOnlyHtmlPayload } from '../plugins/clipboard/clipboardPayload';
import { extractImageFilesFromClipboardData } from '../plugins/image-upload/imageFileExtraction';
import {
  formatSourceEditorUploadedImages,
  getSourceEditorImageHtml,
  readSourceEditorDesktopClipboardImage,
  uploadSourceEditorImageFiles,
} from '../sourceEditorImagePaste';

type SourceImageTransferEvent =
  | ReactClipboardEvent<HTMLTextAreaElement>
  | ReactDragEvent<HTMLTextAreaElement>;

export function useSourceEditorImageTransfer({
  currentNotePath,
  onValueChange,
  textareaRef,
}: {
  currentNotePath: string;
  onValueChange: (markdown: string) => void;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
}) {
  const handleSourceImageTransfer = useCallback((
    event: SourceImageTransferEvent,
    dataTransfer: DataTransfer,
  ) => {
    const imageFiles = extractImageFilesFromClipboardData(dataTransfer);
    const hasImageHtml = imageFiles.length === 0 && hasClipboardImageOnlyHtmlPayload(dataTransfer);
    if (imageFiles.length === 0 && !hasImageHtml) return;

    event.preventDefault();
    event.stopPropagation();
    const textarea = event.currentTarget;
    const originalValue = textarea.value;
    const selectionStart = textarea.selectionStart;
    const selectionEnd = textarea.selectionEnd;
    const selectionDirection = textarea.selectionDirection;

    const insertIfTargetIsUnchanged = (insertedText: string) => {
      if (textareaRef.current !== textarea || !textarea.isConnected) return;
      if (useNotesStore.getState().currentNote?.path !== currentNotePath) return;
      if (
        textarea.value !== originalValue
        || textarea.selectionStart !== selectionStart
        || textarea.selectionEnd !== selectionEnd
        || textarea.selectionDirection !== selectionDirection
      ) return;

      const nextValue = textarea.value.slice(0, selectionStart)
        + insertedText
        + textarea.value.slice(selectionEnd);
      const nextCaret = selectionStart + insertedText.length;
      textarea.value = nextValue;
      textarea.setSelectionRange(nextCaret, nextCaret);
      onValueChange(nextValue);
    };

    if (hasImageHtml) {
      const imageHtml = getSourceEditorImageHtml(dataTransfer);
      if (!imageHtml) return;
      const desktopImage = event.type === 'paste'
        ? readSourceEditorDesktopClipboardImage()
        : null;
      if (!desktopImage) {
        insertIfTargetIsUnchanged(imageHtml);
        return;
      }

      void desktopImage.then(async (file) => {
        if (!file) {
          insertIfTargetIsUnchanged(imageHtml);
          return;
        }
        const paths = await uploadSourceEditorImageFiles([file], currentNotePath);
        if (paths.length > 0) {
          insertIfTargetIsUnchanged(formatSourceEditorUploadedImages(paths));
        }
      }).catch(() => undefined);
      return;
    }

    void uploadSourceEditorImageFiles(imageFiles, currentNotePath).then((paths) => {
      if (paths.length > 0) {
        insertIfTargetIsUnchanged(formatSourceEditorUploadedImages(paths));
      }
    }).catch(() => undefined);
  }, [currentNotePath, onValueChange, textareaRef]);

  const handleSourcePaste = useCallback((event: ReactClipboardEvent<HTMLTextAreaElement>) => {
    handleSourceImageTransfer(event, event.clipboardData);
  }, [handleSourceImageTransfer]);

  const handleSourceDrop = useCallback((event: ReactDragEvent<HTMLTextAreaElement>) => {
    handleSourceImageTransfer(event, event.dataTransfer);
  }, [handleSourceImageTransfer]);

  return { handleSourceDrop, handleSourcePaste };
}
