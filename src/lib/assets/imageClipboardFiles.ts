import { isImageFileLike } from './core/naming';

export const MAX_IMAGE_UPLOAD_INPUT_FILES = 64;
export const MAX_IMAGE_UPLOAD_TRANSFER_ITEM_SCAN = 1024;

interface ImageClipboardItem {
  kind?: string;
  type: string;
  getAsFile: () => File | null;
}

interface ImageClipboardData {
  files?: Iterable<File> | ArrayLike<File> | null;
  items?: Iterable<ImageClipboardItem> | ArrayLike<ImageClipboardItem> | null;
}

function getArrayLikeLength(value: { length?: unknown } | null | undefined): number | null {
  if (typeof value?.length !== 'number' || !Number.isFinite(value.length) || value.length <= 0) {
    return null;
  }
  return Math.floor(value.length);
}

function getImageFileFromClipboardItem(item: ImageClipboardItem | undefined): File | null {
  if (!item || (item.kind && item.kind !== 'file')) return null;

  const itemMimeType = item.type.split(';')[0]?.trim().toLowerCase() ?? '';
  if (itemMimeType.startsWith('image/')) return item.getAsFile();
  if (itemMimeType && itemMimeType !== 'application/octet-stream') return null;

  const file = item.getAsFile();
  return file && isImageFileLike(file) ? file : null;
}

export function extractImageFilesFromClipboardItems(
  items: Iterable<ImageClipboardItem> | ArrayLike<ImageClipboardItem> | null | undefined,
): File[] {
  if (!items) return [];

  const imageFiles: File[] = [];
  const seenFiles = new Set<File>();
  const addFile = (file: File | null) => {
    if (!file || seenFiles.has(file) || imageFiles.length >= MAX_IMAGE_UPLOAD_INPUT_FILES) return;
    seenFiles.add(file);
    imageFiles.push(file);
  };
  const arrayLikeLength = getArrayLikeLength(items as { length?: unknown });
  if (arrayLikeLength !== null) {
    const length = Math.min(arrayLikeLength, MAX_IMAGE_UPLOAD_TRANSFER_ITEM_SCAN);
    for (let index = 0; index < length && imageFiles.length < MAX_IMAGE_UPLOAD_INPUT_FILES; index += 1) {
      addFile(getImageFileFromClipboardItem((items as ArrayLike<ImageClipboardItem>)[index]));
    }
    return imageFiles;
  }

  let scanned = 0;
  for (const item of items as Iterable<ImageClipboardItem>) {
    if (scanned >= MAX_IMAGE_UPLOAD_TRANSFER_ITEM_SCAN || imageFiles.length >= MAX_IMAGE_UPLOAD_INPUT_FILES) break;
    scanned += 1;
    addFile(getImageFileFromClipboardItem(item));
  }
  return imageFiles;
}

export function extractImageFilesFromFileList(
  files: Iterable<File> | ArrayLike<File> | null | undefined,
): File[] {
  if (!files) return [];

  const imageFiles: File[] = [];
  const seenFiles = new Set<File>();
  const addFile = (file: File | undefined) => {
    if (!file || !isImageFileLike(file) || seenFiles.has(file) || imageFiles.length >= MAX_IMAGE_UPLOAD_INPUT_FILES) return;
    seenFiles.add(file);
    imageFiles.push(file);
  };
  const arrayLikeLength = getArrayLikeLength(files as { length?: unknown });
  if (arrayLikeLength !== null) {
    const length = Math.min(arrayLikeLength, MAX_IMAGE_UPLOAD_TRANSFER_ITEM_SCAN);
    for (let index = 0; index < length && imageFiles.length < MAX_IMAGE_UPLOAD_INPUT_FILES; index += 1) {
      addFile((files as ArrayLike<File>)[index]);
    }
    return imageFiles;
  }

  let scanned = 0;
  for (const file of files as Iterable<File>) {
    if (scanned >= MAX_IMAGE_UPLOAD_TRANSFER_ITEM_SCAN || imageFiles.length >= MAX_IMAGE_UPLOAD_INPUT_FILES) break;
    scanned += 1;
    addFile(file);
  }
  return imageFiles;
}

export function extractImageFilesFromClipboardData(
  clipboardData: ImageClipboardData | null | undefined,
): File[] {
  if (!clipboardData) return [];
  const itemFiles = extractImageFilesFromClipboardItems(clipboardData.items);
  return itemFiles.length > 0 ? itemFiles : extractImageFilesFromFileList(clipboardData.files);
}
