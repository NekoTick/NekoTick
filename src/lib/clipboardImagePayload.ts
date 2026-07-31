import { extractImageFilesFromClipboardData } from './assets/imageClipboardFiles';

const MAX_IMAGE_CLIPBOARD_HTML_CHARS = 2 * 1024 * 1024;
const NON_IMAGE_MEDIA_SELECTOR = 'audio, embed, iframe, math, object, svg, video';
const HIDDEN_HTML_SELECTOR = 'noscript, script, style, template';

function parseImageOnlyClipboardHtml(html: string): Document | null {
  if (!html || html.length > MAX_IMAGE_CLIPBOARD_HTML_CHARS || typeof DOMParser === 'undefined') {
    return null;
  }

  const document = new DOMParser().parseFromString(html, 'text/html');
  if (!document.body.querySelector('img')) return null;

  const visibleContent = document.body.cloneNode(true) as HTMLElement;
  visibleContent.querySelectorAll(HIDDEN_HTML_SELECTOR).forEach((node) => node.remove());
  if (visibleContent.querySelector(NON_IMAGE_MEDIA_SELECTOR)) return null;
  if (visibleContent.textContent?.replace(/[\u200B\u200C\uFEFF]/g, '').trim()) return null;
  return document;
}

export function hasClipboardImageFilePayload(
  clipboardData: DataTransfer | null | undefined,
): boolean {
  return extractImageFilesFromClipboardData(clipboardData).length > 0;
}

export function hasClipboardImageOnlyHtmlPayload(
  clipboardData: DataTransfer | null | undefined,
): boolean {
  if (!clipboardData) return false;
  try {
    return parseImageOnlyClipboardHtml(clipboardData.getData('text/html')) !== null;
  } catch {
    return false;
  }
}

export function hasClipboardImagePayload(
  clipboardData: DataTransfer | null | undefined,
): boolean {
  return hasClipboardImageFilePayload(clipboardData)
    || hasClipboardImageOnlyHtmlPayload(clipboardData);
}

export function preventImageClipboardTextPaste(event: {
  clipboardData?: DataTransfer | null;
  preventDefault: () => void;
  stopPropagation?: () => void;
}): boolean {
  if (!hasClipboardImagePayload(event.clipboardData)) return false;
  event.preventDefault();
  event.stopPropagation?.();
  return true;
}

export function preventImageDataTransferTextDrop(event: {
  dataTransfer?: DataTransfer | null;
  preventDefault: () => void;
  stopPropagation?: () => void;
}): boolean {
  if (!hasClipboardImagePayload(event.dataTransfer)) return false;
  event.preventDefault();
  event.stopPropagation?.();
  return true;
}

export function normalizeImageOnlyClipboardHtml(html: string): string {
  const document = parseImageOnlyClipboardHtml(html);
  if (!document) return html;
  return Array.from(document.body.querySelectorAll('img[src]'))
    .map((image) => image.outerHTML)
    .join('');
}
