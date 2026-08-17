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
import { MAX_EXPORT_MARKDOWN_CHARS, MAX_NOTE_EXPORT_OUTPUT_BYTES } from './noteExportLimits';

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
const MAX_PNG_EXPORT_BYTES = 50 * 1024 * 1024;
export const MAX_PNG_EXPORT_CANVAS_DIMENSION = 16_384;
export { MAX_NOTE_EXPORT_OUTPUT_BYTES } from './noteExportLimits';
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

function getExportTitle(request: Pick<NoteExportRequest, 'notePath' | 'title'>): string {
  const title = request.title.trim();
  return title || getNoteTitleFromPath(request.notePath);
}

export function getNoteExportFileName(request: Pick<NoteExportRequest, 'format' | 'notePath' | 'title'>): string {
  return `${sanitizeFileName(getExportTitle(request))}.${EXPORT_EXTENSIONS[request.format]}`;
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
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    const style = window.getComputedStyle(element);
    const width = element.clientWidth
      + (Number.parseFloat(style.borderLeftWidth) || 0)
      + (Number.parseFloat(style.borderRightWidth) || 0);
    const height = element.clientHeight
      + (Number.parseFloat(style.borderTopWidth) || 0)
      + (Number.parseFloat(style.borderBottomWidth) || 0);
    if (
      width * pixelRatio > MAX_PNG_EXPORT_CANVAS_DIMENSION
      || height * pixelRatio > MAX_PNG_EXPORT_CANVAS_DIMENSION
    ) {
      throw new Error('PNG export dimensions exceed the safe canvas limit.');
    }
    const dataUrl = await toPng(element, {
      backgroundColor: themeColorTokens.exportSurface,
      cacheBust: true,
      pixelRatio,
      skipAutoScale: true,
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

async function createNoteExportOutput(request: NoteExportRequest): Promise<{
  bytes: Uint8Array;
  mimeType: string;
  title: string;
}> {
  const title = getExportTitle(request);
  const rawMarkdown = stripManagedFrontmatter(request.markdown);
  if (rawMarkdown.length > MAX_EXPORT_MARKDOWN_CHARS) {
    throw new Error('Note is too large to export safely.');
  }

  const markdown = request.rootNodes
    ? await resolveExportMarkdownAssetSources(rawMarkdown, request.notesPath, request.notePath, {
        preserveObsidianSize: request.format !== 'docx',
        rootNodes: request.rootNodes,
      })
    : await resolveExportMarkdownAssetSources(rawMarkdown, request.notesPath, request.notePath, {
        preserveObsidianSize: request.format !== 'docx',
      });
  const html = request.format === 'html' || request.format === 'pdf'
    ? await renderNoteExportHtml(markdown, title)
    : null;

  if (request.format === 'docx') {
    return {
      bytes: await createDocxExportBytes(markdown, title),
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      title,
    };
  }
  if (request.format === 'html') {
    return { bytes: htmlToBytes(html ?? ''), mimeType: 'text/html;charset=utf-8', title };
  }
  if (request.format === 'pdf') {
    return { bytes: await createPdfBytes(html ?? ''), mimeType: 'application/pdf', title };
  }
  return { bytes: await createPngBytes(markdown, title), mimeType: 'image/png', title };
}

export async function exportNoteToFilePath(
  request: NoteExportRequest,
  filePath: string,
): Promise<NoteExportResult> {
  const output = await createNoteExportOutput(request);
  assertExportOutputBytes(output.bytes.byteLength);
  await writeDesktopBinaryFile(filePath, output.bytes);
  return { canceled: false, filePath };
}

export async function exportNote(request: NoteExportRequest): Promise<NoteExportResult> {
  const output = await createNoteExportOutput(request);
  const result = await saveExportBytes(request.format, output.title, output.bytes, output.mimeType);

  if (!result.canceled) {
    useToastStore.getState().addToast(translateExportMessage(output.title), 'success');
  }

  return result;
}

export type { NoteExportFormat, NoteExportRequest, NoteExportResult };
