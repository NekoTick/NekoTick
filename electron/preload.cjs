const { contextBridge, ipcRenderer, webUtils } = require('electron');
const {
  callIpcCallback,
  deepFreeze,
  normalizeDesktopBinaryWritePayload,
  normalizeDesktopTextWritePayload,
  requireSafeIpcRequestId,
} = require('./preloadIpcUtils.cjs');
const { createDesktopApi } = require('./preloadDesktopApi.cjs');
const {
  installOpenMarkdownFileHandler,
  onOpenMarkdownFile,
} = require('./preloadOpenMarkdownFiles.cjs');
const {
  createRendererErrorReport,
  installRendererErrorReporting,
} = require('./preloadRendererErrors.cjs');

installOpenMarkdownFileHandler(ipcRenderer);
installRendererErrorReporting(ipcRenderer);

const desktopApi = createDesktopApi({
  callIpcCallback,
  createRendererErrorReport,
  hostPlatform: process.platform,
  ipcRenderer,
  normalizeDesktopBinaryWritePayload,
  normalizeDesktopTextWritePayload,
  onOpenMarkdownFile,
  requireSafeIpcRequestId,
  webUtils,
});

contextBridge.exposeInMainWorld('vlainaDesktop', deepFreeze(desktopApi));
