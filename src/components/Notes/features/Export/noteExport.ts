import { toPng } from 'html-to-image';
import { getElectronBridge } from '@/lib/electron/bridge';
import { saveDialog } from '@/lib/storage/dialog';
import { useToastStore } from '@/stores/useToastStore';
import { getNoteTitleFromPath } from '@/lib/notes/displayName';
import { writeDesktopBinaryFile } from '@/lib/desktop/fs';
import { getBase64DecodedByteLength } from '@/lib/markdown/dataImagePolicy';
import { toBlobPart } from '@/lib/blobPart';
import { shareNativeFile } from '@/lib/nativeFileShare';
import { stripManagedFrontmatter } from '@/stores/notes/frontmatter';
import { createDocxExportBytes } from './noteExportDocx';
import { renderNoteExportElement, renderNoteExportHtml } from './noteExportHtml';
import { resolveExportMarkdownAssetSources } from './noteExportMarkdown';
import type { NoteExportFormat, NoteExportRequest, NoteExportResult } from './noteExportTypes';
import { themeColorTokens } from '@/styles/themeTokens';
import {
  SYSTEM_LANGUAGE_PREFERENCE,
  getEffectiveAppLanguage,
  normalizeAppLanguagePreference,
} from '@/lib/i18n/languages';
import { formatMessage, getMessages } from '@/lib/i18n/messages';

const EXPORT_EXTENSIONS: Record<NoteExportFormat, string> = {
  docx: 'docx',
  html: 'html',
  pdf: 'pdf',
  png: 'png',
};

const EXPORT_FILTERS: Record<NoteExportFormat, { name: string; extensions: string[] }[]> = {
  docx: [{ name: 'Word Document', extensions: ['docx'] }],
  html: [{ name: 'HTML Document', extensions: ['html'] }],
  pdf: [{ name: 'PDF Document', extensions: ['pdf'] }],
  png: [{ name: 'PNG Image', extensions: ['png'] }],
};
const MAX_EXPORT_MARKDOWN_CHARS = 2 * 1024 * 1024;
const MAX_PNG_EXPORT_BYTES = 50 * 1024 * 1024;
export const MAX_NOTE_EXPORT_OUTPUT_BYTES = 64 * 1024 * 1024;
const STORAGE_KEY_LANGUAGE_PREFERENCE = 'vlaina-language-preference';

function translateExportMessage(title: string): string {
  let storedPreference: string | null = null;
  try {
    storedPreference = localStorage.getItem(STORAGE_KEY_LANGUAGE_PREFERENCE);
  } catch {
    storedPreference = null;
  }
  const preference = normalizeAppLanguagePreference(storedPreference) ?? SYSTEM_LANGUAGE_PREFERENCE;
  const language = getEffectiveAppLanguage(preference);
  return formatMessage(getMessages(language)['notes.exported'], { title });
}

function sanitizeFileName(value: string): string {
  return value
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '')
    .replace(/\s+/g, ' ')
    .trim() || 'Untitled';
}

function ensureExtension(filePath: string, extension: string): string {
  return filePath.toLowerCase().endsWith(`.${extension}`) ? filePath : `${filePath}.${extension}`;
}

function getExportTitle(request: NoteExportRequest): string {
  const title = request.title.trim();
  return title || getNoteTitleFromPath(request.notePath);
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const commaIndex = dataUrl.indexOf(',');
  if (commaIndex < 0) {
    throw new Error('Invalid PNG export data URL.');
  }

  const metadata = dataUrl.slice(0, commaIndex);
  const mediaType = /^data:([^;,]+)/i.exec(metadata)?.[1]?.toLowerCase() ?? '';
  if (mediaType !== 'image/png') {
    throw new Error('Unexpected PNG export MIME type.');
  }

  if (!/(?:^|;)base64(?:;|$)/i.test(metadata)) {
    throw new Error('PNG export data URL must be base64 encoded.');
  }

  const base64 = dataUrl.slice(commaIndex + 1);
  const byteLength = getBase64DecodedByteLength(base64);
  if (byteLength === null) {
    throw new Error('Invalid PNG export data URL.');
  }
  if (byteLength > MAX_PNG_EXPORT_BYTES) {
    throw new Error('PNG export output is too large.');
  }

  const binary = atob(base64);
  if (binary.length > MAX_PNG_EXPORT_BYTES) {
    throw new Error('PNG export output is too large.');
  }
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function downloadInBrowser(fileName: string, bytes: Uint8Array, mimeType: string) {
  const blob = new Blob([toBlobPart(bytes)], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = 'noopener';
  try {
    document.body.appendChild(anchor);
    anchor.click();
  } finally {
    anchor.parentNode?.removeChild(anchor);
    URL.revokeObjectURL(url);
  }
}

function assertExportOutputBytes(byteLength: number): void {
  if (!Number.isSafeInteger(byteLength) || byteLength < 0 || byteLength > MAX_NOTE_EXPORT_OUTPUT_BYTES) {
    throw new Error('Note export output is too large.');
  }
}

async function promptExportPath(format: NoteExportFormat, title: string): Promise<string | null> {
  const extension = EXPORT_EXTENSIONS[format];
  const selectedPath = await saveDialog({
    title: `Export as ${extension.toUpperCase()}`,
    defaultPath: `${sanitizeFileName(title)}.${extension}`,
    filters: EXPORT_FILTERS[format],
  });

  return selectedPath ? ensureExtension(selectedPath, extension) : null;
}

async function saveExportBytes(
  format: NoteExportFormat,
  title: string,
  bytes: Uint8Array,
  mimeType: string,
): Promise<NoteExportResult> {
  assertExportOutputBytes(bytes.byteLength);

  const extension = EXPORT_EXTENSIONS[format];
  const fileName = `${sanitizeFileName(title)}.${extension}`;
  if (await shareNativeFile({ data: bytes, fileName, mimeType, title })) {
    return { canceled: false };
  }
  const filePath = await promptExportPath(format, title);
  if (!filePath) {
    if (getElectronBridge()) {
      return { canceled: true };
    }

    downloadInBrowser(fileName, bytes, mimeType);
    return { canceled: false };
  }

  await writeDesktopBinaryFile(filePath, bytes);
  return { canceled: false, filePath };
}

function htmlToBytes(html: string): Uint8Array {
  return new TextEncoder().encode(html);
}

async function createPngBytes(markdown: string, title: string): Promise<Uint8Array> {
  const { element, cleanup } = await renderNoteExportElement(markdown, title);
  try {
    const dataUrl = await toPng(element, {
      backgroundColor: themeColorTokens.exportSurface,
      cacheBust: true,
      pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
    });
    return dataUrlToBytes(dataUrl);
  } finally {
    cleanup();
  }
}

async function createPdfBytes(html: string): Promise<Uint8Array> {
  const bridge = getElectronBridge();
  if (!bridge) {
    throw new Error('PDF export is only available in the desktop app.');
  }

  return bridge.export.htmlToPdf(html, { pageSize: 'A4' });
}

export async function exportNote(request: NoteExportRequest): Promise<NoteExportResult> {
  const title = getExportTitle(request);
  const rawMarkdown = stripManagedFrontmatter(request.markdown);
  if (rawMarkdown.length > MAX_EXPORT_MARKDOWN_CHARS) {
    throw new Error('Note is too large to export safely.');
  }

  const markdown = await resolveExportMarkdownAssetSources(
    rawMarkdown,
    request.notesPath,
    request.notePath,
  );

  const html = request.format === 'html' || request.format === 'pdf'
    ? await renderNoteExportHtml(markdown, title)
    : null;

  const result =
    request.format === 'docx'
      ? await saveExportBytes(
          request.format,
          title,
          await createDocxExportBytes(markdown, title),
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        )
      : request.format === 'html'
        ? await saveExportBytes(request.format, title, htmlToBytes(html ?? ''), 'text/html;charset=utf-8')
        : request.format === 'pdf'
          ? await saveExportBytes(request.format, title, await createPdfBytes(html ?? ''), 'application/pdf')
          : await saveExportBytes(request.format, title, await createPngBytes(markdown, title), 'image/png');

  if (!result.canceled) {
    useToastStore.getState().addToast(translateExportMessage(title), 'success');
  }

  return result;
}

export type { NoteExportFormat, NoteExportRequest, NoteExportResult };
