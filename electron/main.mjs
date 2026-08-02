import electron from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDesktopAccountService } from './accountAuthFlow.mjs';
import { readSecretsStore, updateSecretsStore } from './aiProviderSecretStore.mjs';
import { resolveVideoUrl as resolveBilibiliVideoUrl } from './bilibiliVideoResolver.mjs';
import { normalizeCaptureRect } from './captureRect.mjs';
import { registerDesktopAppIpc } from './desktopAppIpc.mjs';
import { openPathInFileManager, registerDesktopIpc } from './desktopIpc.mjs';
import { registerManagedIpc } from './managedIpc.mjs';
import { createWindowManager } from './windowManager.mjs';
import { configureDevelopmentUserDataPath } from './userDataPath.mjs';
import { authorizeFsPath } from './fsAccess.mjs';
import { installApplicationMenu } from './appMenu.mjs';
import { createErrorLogService } from './errorLog.mjs';
import { createNoteRecoveryService } from './noteRecovery.mjs';
import { createManagedRequestHelpers } from './managedRequestHelpers.mjs';
import { createMarkdownOpenController } from './markdownOpenController.mjs';
import {
  configureDefaultSessionSafely,
  installDevelopmentParentProcessGuard,
} from './mainSessionSetup.mjs';
import { createTrayController } from './trayController.mjs';
import { registerDesktopUpdateIpc } from './desktopUpdateIpc.mjs';
import { registerDesktopSecretsIpc } from './desktopSecretsIpc.mjs';
import { createProxyConfiguration } from './proxyConfiguration.mjs';
import { createTrustedIpc } from './trustedIpc.mjs';
import { createWebSearchServices, registerWebSearchIpc } from './webSearch/ipc.mjs';
import { normalizeMarkdownOpenPath } from './markdownOpenPath.mjs';
import { getWindowsAppUserModelId } from './microsoftStoreIdentity.mjs';
import { configureLinuxSafeStorageBackend } from './linuxSafeStorage.mjs';
import {
  normalizeExternalUrl,
  normalizeProxyConfig,
  summarizeUrlForLog,
} from './externalUrlPolicy.mjs';

const { app, BrowserWindow, Menu, Tray, ipcMain, nativeImage, session, shell } = electron;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.join(__dirname, '..');

configureDevelopmentUserDataPath({ app, repoRoot });
configureLinuxSafeStorageBackend({ app });

const rendererDevUrl = process.env.VITE_DEV_SERVER_URL ?? 'http://127.0.0.1:3000';
const apiBaseUrl = (process.env.APP_API_BASE_URL ?? 'https://api.vlaina.com').trim().replace(/\/+$/, '');
const managedApiBaseUrl = `${apiBaseUrl}/v1`;
const appIconPath = app.isPackaged
  ? path.join(process.resourcesPath, 'vlaina-icon.png')
  : path.join(__dirname, '..', 'public', 'logo.png');
const trayIconSize = process.platform === 'darwin' ? 18 : 16;
const rendererFile = path.join(__dirname, '..', 'dist', 'index.html');
const desktopAccountService = createDesktopAccountService({
  apiBaseUrl,
  fetchImpl: fetchWithElectronSession,
});
const errorLogService = createErrorLogService({ app });
const noteRecoveryService = createNoteRecoveryService({ app });
const { fetchWithStoredSession, readJsonResponse } = desktopAccountService;
const readOnlyNetworkRetryDelaysMs = [300];
const readOnlyFastFailureRetryWindowMs = 2000;
const managedReadOnlyRequestTimeoutMs = 15_000;
const managedMutationRequestTimeoutMs = 300_000;
const desktopAccountRequestTimeoutMs = 15_000;
const {
  createElectronBillingCheckout,
  requestManagedJson,
  requestManagedPublicJson,
  submitElectronFeedback,
} = createManagedRequestHelpers({
  apiBaseUrl,
  managedApiBaseUrl,
  fetchWithStoredSession,
  readJsonResponse,
  readOnlyNetworkRetryDelaysMs,
  readOnlyFastFailureRetryWindowMs,
  managedReadOnlyRequestTimeoutMs,
  managedMutationRequestTimeoutMs,
  desktopAccountRequestTimeoutMs,
});
const {
  configureProxySafely,
  configuredProxyConfig,
} = createProxyConfiguration({
  normalizeProxyConfig,
  session,
});

process.on('uncaughtException', (error) => {
  void errorLogService.logMainError(error, 'uncaughtException');
  console.error('[vlaina] Uncaught exception in Electron main process:', error);
});

process.on('unhandledRejection', (reason) => {
  void errorLogService.logMainError(reason, 'unhandledRejection');
  console.error('[vlaina] Unhandled rejection in Electron main process:', reason);
});

function fetchWithElectronSession(url, init) {
  return electron.net.fetch(url, init);
}

function isDevelopment() {
  return !app.isPackaged;
}

function requireNonEmptyString(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`A non-empty ${label} is required.`);
  }

  return value;
}

function requireStringArray(values, label) {
  if (!Array.isArray(values)) {
    throw new Error(`A ${label} array is required.`);
  }

  return values.map((value, index) => requireNonEmptyString(value, `${label} value at index ${index}`));
}

function tryNormalizeExternalUrl(rawUrl) {
  try {
    return normalizeExternalUrl(rawUrl);
  } catch {
    return null;
  }
}

function openExternalIfAllowed(rawUrl) {
  const normalized = tryNormalizeExternalUrl(rawUrl);
  if (!normalized) {
    return false;
  }

  void shell.openExternal(normalized);
  return true;
}

const {
  assertTrustedIpcSender,
  handleIpc,
  handleSyncIpc,
  isTrustedRendererUrl,
} = createTrustedIpc({
  BrowserWindow,
  ipcMain,
  rendererDevUrl,
  rendererFile,
});

const windowManager = createWindowManager({
  rendererDevUrl,
  appIconPath,
  isDevelopment,
  openExternalIfAllowed,
  isTrustedRendererUrl,
  beforeRendererReload: () => noteRecoveryService.flush(),
  reportError(error, context) {
    void errorLogService.logMainError(error, context);
  },
});
const { createMainWindow, isReadyToReveal, resolveTargetWindow } = windowManager;
const markdownOpenController = createMarkdownOpenController({
  BrowserWindow,
  authorizeFsPath,
  createMainWindow,
  isReadyToReveal,
  normalizeMarkdownOpenPath,
});
const trayController = createTrayController({
  app,
  BrowserWindow,
  Menu,
  Tray,
  nativeImage,
  appIconPath,
  trayIconSize,
  showMainWindow: markdownOpenController.showMainWindow,
});
windowManager.registerWindowIpc(handleIpc);

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.exit(0);
} else {
  installDevelopmentParentProcessGuard(app);
  markdownOpenController.setPendingOpenMarkdownPath(
    markdownOpenController.findMarkdownPathInArgv(process.argv),
  );

  app.on('second-instance', (_event, argv) => {
    const markdownPath = markdownOpenController.findMarkdownPathInArgv(argv);
    if (markdownPath) {
      void markdownOpenController.openMarkdownPath(markdownPath);
      return;
    }

    markdownOpenController.showMainWindow();
  });

  app.on('open-file', (event, filePath) => {
    event.preventDefault();
    void markdownOpenController.openMarkdownPath(filePath);
  });
}

registerDesktopIpc({
  app,
  dialog: electron.dialog,
  handleIpc,
  handleSyncIpc,
  normalizeExternalUrl,
  resolveTargetWindow,
  requireNonEmptyString,
  requireStringArray,
});

registerWebSearchIpc({
  handleIpc,
  services: createWebSearchServices({ searchFetchImpl: fetchWithElectronSession }),
});

registerDesktopSecretsIpc({
  handleIpc,
  readSecretsStore,
  requireNonEmptyString,
  requireStringArray,
  updateSecretsStore,
});

handleIpc('desktop:media:resolve-video-url', async (_event, url) => {
  return await resolveBilibiliVideoUrl(url, requireNonEmptyString);
});

handleIpc('desktop:media:diagnose-url', async (_event, url) => {
  const normalizedUrl = normalizeExternalUrl(url);
  const proxy = await session.defaultSession.resolveProxy(normalizedUrl);
  const result = {
    url: normalizedUrl,
    proxy,
    proxyConfig: configuredProxyConfig,
  };
  return result;
});

handleIpc('desktop:media:capture-page', async (event, rect) => {
  const image = await event.sender.capturePage(normalizeCaptureRect(rect));
  return image.toDataURL();
});

registerDesktopAppIpc({
  app,
  assertTrustedIpcSender,
  errorLogService,
  handleIpc,
  ipcMain,
  noteRecoveryService,
  openPathInFileManager,
  trayController,
});

registerDesktopUpdateIpc({
  app,
  fetchImpl: fetchWithElectronSession,
  handleIpc,
  shell,
});

desktopAccountService.registerAccountIpc({ handleIpc });

registerManagedIpc({
  handleIpc,
  requestManagedJson,
  requestManagedPublicJson,
  fetchWithStoredSession,
  managedApiBaseUrl,
  createElectronBillingCheckout,
  submitElectronFeedback,
  requireNonEmptyString,
});

app.whenReady().then(async () => {
  try {
    if (process.platform === 'win32') {
      app.setAppUserModelId(getWindowsAppUserModelId());
    }
  } catch (error) {
  }
  await configureProxySafely();
  configureDefaultSessionSafely(session);
  installApplicationMenu({ Menu, app, onOpenMarkdownFile: markdownOpenController.requestOpenMarkdownFile });

  trayController.createTray();
  const mainWindow = createMainWindow();
  await markdownOpenController.flushPendingOpenMarkdownPath(mainWindow);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
}).catch(async (error) => {
  await errorLogService.logMainError(error, 'app.whenReady');
  console.error('[vlaina] Application startup failed:', error);
  app.exit(1);
});

app.on('window-all-closed', () => {
  if (trayController.isTrayQuitRequested() || process.platform !== 'darwin') {
    app.quit();
  }
});
