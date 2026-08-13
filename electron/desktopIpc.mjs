import electron from 'electron';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { registerDesktopAiProviderIpc } from './desktopAiProviderIpc.mjs';
import { getBase64DecodedByteLength } from './desktopAiProviderRequest.mjs';
import { registerDesktopDialogIpc } from './desktopDialogIpc.mjs';
import { openPathInFileManager, revealItemInFolder } from './desktopFileManager.mjs';
import { registerDesktopFsIpc } from './desktopFsIpc.mjs';
import { registerDesktopGitIpc } from './desktopGitIpc.mjs';
import { renderHtmlToPdf } from './desktopPdfExport.mjs';
import { registerDesktopWatchIpc } from './desktopWatchIpc.mjs';
import { findMarkdownGitRoot } from './markdownOpenPath.mjs';
import {
  assertAuthorizedFsPath,
  assertAuthorizedFsWatchPath,
  assertSafeFsAccessPath,
  authorizeFsPath,
} from './fsAccess.mjs';

export { openPathInFileManager, revealItemInFolder } from './desktopFileManager.mjs';
export { writeFileAtomically } from './desktopAtomicFile.mjs';
export { isPathInsideDirectory } from './desktopFsIpc.mjs';

const { app, clipboard, dialog, nativeImage, shell } = electron;
const MAX_CLIPBOARD_IMAGE_DATA_URL_BYTES = 10 * 1024 * 1024;

function assertClipboardImageDataUrl(dataUrl) {
  const match = /^data:image\/[a-z0-9.+-]+;base64,([A-Za-z0-9+/=]+)$/i.exec(dataUrl);
  if (!match) {
    throw new Error('Invalid clipboard image data URL');
  }

  const byteLength = getBase64DecodedByteLength(match[1]);
  if (byteLength === null || byteLength > MAX_CLIPBOARD_IMAGE_DATA_URL_BYTES) {
    throw new Error('Clipboard image data URL is too large.');
  }
}

export function registerDesktopIpc({
  app: appOverride,
  dialog: dialogOverride,
  fetchImpl,
  handleIpc,
  handleSyncIpc,
  normalizeExternalUrl,
  resolveTargetWindow,
  requireNonEmptyString,
  requireStringArray,
}) {
  const activeApp = appOverride ?? app;
  const activeDialog = dialogOverride ?? dialog;
  handleIpc('desktop:shell:open-external', async (_event, url) => {
    await shell.openExternal(normalizeExternalUrl(url));
  });

  handleIpc('desktop:shell:open-path', async (_event, filePath) => {
    const resolvedPath = await assertAuthorizedFsPath(filePath);
    await openPathInFileManager(resolvedPath);
  });

  handleIpc('desktop:shell:trash-item', async (_event, filePath) => {
    const resolvedPath = await assertAuthorizedFsPath(filePath);
    await shell.trashItem(resolvedPath);
  });

  handleIpc('desktop:shell:reveal-item', async (_event, filePath) => {
    const resolvedPath = await assertAuthorizedFsPath(filePath);
    await revealItemInFolder(resolvedPath);
  });

  handleIpc('desktop:clipboard:write-text', async (_event, text) => {
    clipboard.writeText(typeof text === 'string' ? text : '');
  });

  handleSyncIpc('desktop:clipboard:write-text-sync', (_event, text) => {
    clipboard.writeText(typeof text === 'string' ? text : '');
    return true;
  });

  handleIpc('desktop:clipboard:read-image', async () => {
    const image = clipboard.readImage();
    if (image.isEmpty()) return null;

    const png = image.toPNG();
    if (png.byteLength > MAX_CLIPBOARD_IMAGE_DATA_URL_BYTES) {
      throw new Error('Clipboard image is too large.');
    }
    return `data:image/png;base64,${png.toString('base64')}`;
  });

  handleIpc('desktop:clipboard:write-image', async (_event, dataUrl) => {
    const normalizedDataUrl = typeof dataUrl === 'string' ? dataUrl : '';
    assertClipboardImageDataUrl(normalizedDataUrl);

    const image = nativeImage.createFromDataURL(normalizedDataUrl);
    if (image.isEmpty()) {
      throw new Error('Invalid clipboard image data');
    }

    clipboard.writeImage(image);
  });

  handleIpc('desktop:export:html-to-pdf', async (_event, html, options) => {
    return new Uint8Array(await renderHtmlToPdf(html, options));
  });

  registerDesktopAiProviderIpc({ fetchImpl, handleIpc });

  handleIpc('desktop:drag-drop:authorize-path', async (_event, filePath) => {
    const resolvedPath = await assertSafeFsAccessPath(filePath);
    const info = await stat(resolvedPath);
    if (!info.isDirectory()) {
      await authorizeFsPath(resolvedPath, 'file');
    }
    await authorizeFsPath(info.isDirectory() ? resolvedPath : path.dirname(resolvedPath), 'root');

    return {
      name: path.basename(resolvedPath),
      path: resolvedPath,
      isDirectory: info.isDirectory(),
      isFile: info.isFile(),
      size: info.size,
      createdAt: info.birthtimeMs,
      modifiedAt: info.mtimeMs,
    };
  });

  handleIpc('desktop:app:find-markdown-git-root', async (_event, filePath) => {
    const resolvedPath = await assertAuthorizedFsPath(filePath);
    const info = await stat(resolvedPath);
    if (!info.isFile()) {
      throw new Error('Markdown open target must be a file.');
    }

    const notesRootPath = findMarkdownGitRoot(resolvedPath);
    if (!notesRootPath) {
      return null;
    }
    await authorizeFsPath(notesRootPath, 'root');
    await authorizeFsPath(path.dirname(notesRootPath), 'watch-root');
    return notesRootPath;
  });

  registerDesktopDialogIpc({
    app: activeApp,
    dialog: activeDialog,
    handleIpc,
    resolveTargetWindow,
    authorizeFsPath,
  });

  registerDesktopGitIpc({ handleIpc });

  registerDesktopFsIpc({ handleIpc });

  handleIpc('desktop:path:join', (_event, ...segments) => {
    return path.join(...requireStringArray(segments, 'path segment'));
  });

  handleIpc('desktop:path:app-data', () => {
    return activeApp.getPath('userData');
  });

  handleIpc('desktop:path:home', () => {
    return activeApp.getPath('home');
  });

  handleIpc('desktop:path:to-file-url', async (_event, filePath) => {
    return pathToFileURL(await assertAuthorizedFsPath(filePath)).toString();
  });

  registerDesktopWatchIpc({
    handleIpc,
    requireNonEmptyString,
    assertAuthorizedFsWatchPath,
  });
}
