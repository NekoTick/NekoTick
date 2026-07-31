import { getElectronBridge } from '@/lib/electron/bridge';
import { themeDomStyleTokens, themeOffscreenTokens } from '@/styles/themeTokens';

function tryExecCommandCopy(text: string): boolean {
  if (typeof document === 'undefined' || typeof document.execCommand !== 'function') {
    return false;
  }

  const activeElement = document.activeElement;
  const selection = typeof window !== 'undefined' ? window.getSelection() : null;
  const selectedRanges = selection
    ? Array.from({ length: selection.rangeCount }, (_, index) => selection.getRangeAt(index).cloneRange())
    : [];
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', 'true');
  textarea.style.position = themeDomStyleTokens.positionFixed;
  textarea.style.left = themeOffscreenTokens.clipboardLeft;
  textarea.style.top = themeOffscreenTokens.clipboardTop;
  document.body.appendChild(textarea);

  try {
    textarea.focus();
    textarea.select();
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    textarea.remove();
    if (selection) {
      selection.removeAllRanges();
      selectedRanges.forEach((range) => selection.addRange(range));
    }
    if (activeElement instanceof HTMLElement) {
      activeElement.focus({ preventScroll: true });
    }
  }
}

export function tryWriteTextToClipboardSynchronously(text: string): boolean {
  const desktopClipboard = getElectronBridge()?.clipboard;
  if (!desktopClipboard?.writeTextSync) {
    return false;
  }

  try {
    return desktopClipboard.writeTextSync(text);
  } catch {
    return false;
  }
}

export async function writeTextToClipboard(text: string): Promise<boolean> {
  const desktopClipboard = getElectronBridge()?.clipboard;
  if (tryWriteTextToClipboardSynchronously(text)) {
    return true;
  }

  if (desktopClipboard?.writeText) {
    try {
      await desktopClipboard.writeText(text);
      return true;
    } catch {
    }
  }

  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
    }
  }

  return tryExecCommandCopy(text);
}

function getClipboardItemCtor(): typeof ClipboardItem | null {
  if (typeof ClipboardItem !== 'undefined') {
    return ClipboardItem;
  }

  if (typeof window !== 'undefined') {
    return (window as unknown as { ClipboardItem?: typeof ClipboardItem }).ClipboardItem ?? null;
  }

  return null;
}

function normalizeClipboardImageMimeType(value: string): string | null {
  const mimeType = value.split(';')[0]?.trim().toLowerCase() ?? '';
  if (!mimeType.startsWith('image/')) {
    return null;
  }
  return mimeType === 'image/jpg' ? 'image/jpeg' : mimeType;
}

export function normalizeClipboardImageDataUrl(dataUrl: string): string | null {
  const match = /^data:([^,;]+)(?:;[^,]*)*;base64,([A-Za-z0-9+/=]+)$/i.exec(dataUrl.trim());
  if (!match) {
    return null;
  }

  const mimeType = normalizeClipboardImageMimeType(match[1]);
  if (!mimeType) {
    return null;
  }
  return `data:${mimeType};base64,${match[2]}`;
}

function createClipboardImageBlob(blob: Blob, mimeType: string): Blob {
  return blob.type === mimeType ? blob : new Blob([blob], { type: mimeType });
}

function readBlobAsDataUrl(blob: Blob, mimeType: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result.replace(/^data:[^,]*,/, `data:${mimeType};base64,`));
        return;
      }
      reject(new Error('Unable to read clipboard image blob.'));
    };
    reader.onerror = () => reject(reader.error ?? new Error('Unable to read clipboard image blob.'));
    reader.onabort = () => reject(new Error('Clipboard image blob read was aborted.'));
    reader.readAsDataURL(blob);
  });
}

function closeImageBitmap(image: ImageBitmap): void {
  try {
    image.close();
  } catch {
  }
}

async function rasterizeImageBlobToPngBlob(blob: Blob): Promise<Blob | null> {
  if (blob.type === 'image/png') {
    return blob;
  }
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') {
    return null;
  }

  const image = await createImageBitmap(blob);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext('2d');
    if (!context) {
      return null;
    }

    context.drawImage(image, 0, 0);
    return await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/png');
    });
  } finally {
    closeImageBitmap(image);
  }
}

async function prepareClipboardImageBlob(blob: Blob): Promise<Blob> {
  if (blob.type === 'image/png') {
    return blob;
  }

  try {
    return await rasterizeImageBlobToPngBlob(blob) ?? blob;
  } catch {
    return blob;
  }
}

export async function writeImageBlobToClipboard(blob: Blob): Promise<boolean> {
  const originalMimeType = normalizeClipboardImageMimeType(blob.type);
  if (!originalMimeType) {
    return false;
  }
  const originalBlob = createClipboardImageBlob(blob, originalMimeType);

  const desktopClipboard = getElectronBridge()?.clipboard;
  if (desktopClipboard?.writeImage) {
    try {
      await desktopClipboard.writeImage(await readBlobAsDataUrl(originalBlob, originalMimeType));
      return true;
    } catch {
      try {
        const pngBlob = await prepareClipboardImageBlob(blob);
        if (pngBlob !== blob) {
          await desktopClipboard.writeImage(await readBlobAsDataUrl(pngBlob, 'image/png'));
          return true;
        }
      } catch {
      }
    }
  }

  const clipboardBlob = await prepareClipboardImageBlob(blob);
  const clipboardMimeType = normalizeClipboardImageMimeType(clipboardBlob.type);
  if (!clipboardMimeType) {
    return false;
  }
  const normalizedClipboardBlob = createClipboardImageBlob(clipboardBlob, clipboardMimeType);
  const ClipboardItemCtor = getClipboardItemCtor();
  if (ClipboardItemCtor && typeof navigator !== 'undefined' && navigator.clipboard?.write) {
    try {
      if (
        typeof ClipboardItemCtor.supports === 'function' &&
        !ClipboardItemCtor.supports(clipboardMimeType)
      ) {
        return false;
      }
      await navigator.clipboard.write([new ClipboardItemCtor({ [clipboardMimeType]: normalizedClipboardBlob })]);
      return true;
    } catch {
    }
  }

  return false;
}
