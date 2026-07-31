import { translate } from '@/lib/i18n';
import { formatMarkdownImage } from '@/lib/markdown/markdownImageMarkdown';
import { getElectronBridge } from '@/lib/electron/bridge';
import {
  dataUrlToBytes,
  isAttachmentDataUrlWithinSizeLimit,
} from '@/lib/storage/attachmentStorageDataUrl';
import { useNotesStore } from '@/stores/useNotesStore';
import { useToastStore } from '@/stores/useToastStore';
import { sanitizeHtml } from './plugins/clipboard/sanitizer';
import { normalizeImageOnlyClipboardHtml } from './plugins/clipboard/clipboardPayload';
import {
  MAX_IMAGE_UPLOAD_INPUT_FILES,
} from './plugins/image-upload/imageFileExtraction';
import { buildImageNodeAttrs } from './plugins/image-upload/imageNodeInsertion';
import { uploadImageFile, type ImageUploadStoreState } from './plugins/image-upload/handleEditorImageFiles';

type GetImageUploadStoreState = () => ImageUploadStoreState;

export function readSourceEditorDesktopClipboardImage(): Promise<File | null> | null {
  const readImage = getElectronBridge()?.clipboard.readImage;
  if (!readImage) return null;

  return readImage().then((dataUrl) => {
    if (!dataUrl || !isAttachmentDataUrlWithinSizeLimit(dataUrl)) return null;
    const decoded = dataUrlToBytes(dataUrl);
    if (!decoded || decoded.mimeType.toLowerCase() !== 'image/png') return null;
    const bytes = Uint8Array.from(decoded.bytes);
    return new File([bytes.buffer], 'image.png', {
      type: 'image/png',
      lastModified: Date.now(),
    });
  }).catch(() => null);
}

export function getSourceEditorImageHtml(clipboardData: DataTransfer): string {
  try {
    return normalizeImageOnlyClipboardHtml(sanitizeHtml(clipboardData.getData('text/html')));
  } catch {
    return '';
  }
}

export function formatSourceEditorUploadedImages(paths: readonly string[]): string {
  return paths
    .map((path) => formatMarkdownImage(path, buildImageNodeAttrs(path).alt))
    .join('\n');
}

export async function uploadSourceEditorImageFiles(
  files: readonly File[],
  notePath: string,
  getStoreState: GetImageUploadStoreState = useNotesStore.getState,
): Promise<string[]> {
  const paths: string[] = [];

  for (const file of files.slice(0, MAX_IMAGE_UPLOAD_INPUT_FILES)) {
    const storeState = getStoreState();
    if (storeState.currentNote?.path !== notePath) return [];

    try {
      const result = await uploadImageFile(file, storeState);
      if (getStoreState().currentNote?.path !== notePath) return [];
      if (result.success && result.path) {
        paths.push(result.path);
      } else if (result.error !== 'Opened folder path is unavailable') {
        useToastStore.getState().addToast(translate('editor.imageUploadFailed'), 'error');
      }
    } catch {
      useToastStore.getState().addToast(translate('editor.imageUploadFailed'), 'error');
    }
  }

  return paths;
}
