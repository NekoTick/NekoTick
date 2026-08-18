import electron from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerWindowIpc as registerWindowIpcHandlers } from './windowIpc.mjs';
import { attachWindowLifecycle } from './windowLifecycle.mjs';
import {
  clampWindowBoundsToCurrentDisplay,
  DEFAULT_WINDOW_BOUNDS,
  readStoredWindowState,
} from './windowState.mjs';
import { loadRenderer as loadRendererForWindow } from './windowRendererLoader.mjs';

const { BrowserWindow } = electron;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LIGHT_WINDOW_BACKGROUND_COLOR = '#fcfcfc';
const LIGHT_WINDOW_SYMBOL_COLOR = '#27262b';

export { readStoredWindowState } from './windowState.mjs';

export function createWindowManager({
  rendererDevUrl,
  appIconPath,
  isDevelopment,
  openExternalIfAllowed,
  isTrustedRendererUrl,
  beforeRendererReload = async () => {},
  reportError = () => {},
}) {
  const closeApprovedWebContents = new Set();
  const readyToRevealWebContents = new Set();
  const windowLabels = new Map();
  let secondaryWindowCounter = 1;
  let persistedWindowState = readStoredWindowState();

  function getWindowLabel(window) {
    return windowLabels.get(window.id) ?? 'main';
  }

  function isUsableWindow(window) {
    return window && !window.isDestroyed() && !window.webContents.isDestroyed();
  }

  function safeSend(window, channel, payload) {
    if (!isUsableWindow(window)) {
      return false;
    }

    try {
      window.webContents.send(channel, payload);
      return true;
    } catch {
      return false;
    }
  }

  function resolveTargetWindow(event) {
    if (event?.sender && !event.sender.isDestroyed()) {
      const fromSender = BrowserWindow.fromWebContents(event.sender);
      if (isUsableWindow(fromSender)) {
        return fromSender;
      }
    }

    const focusedWindow = BrowserWindow.getFocusedWindow();
    if (isUsableWindow(focusedWindow)) {
      return focusedWindow;
    }

    return BrowserWindow.getAllWindows().find(isUsableWindow) ?? null;
  }

  function loadRenderer(window, windowOptions = {}) {
    return loadRendererForWindow({
      window,
      windowOptions,
      rendererDevUrl,
      electronDirname: __dirname,
      isDevelopment,
      isUsableWindow,
    });
  }

  function shouldFocusOnReveal(window, windowOptions = {}) {
    return Boolean(windowOptions.newWindow) ||
      windowLabels.get(window.id) === 'main' ||
      !BrowserWindow.getFocusedWindow();
  }

  function createWindow(windowOptions = {}) {
    const label = windowOptions.label ?? (windowOptions.newWindow ? `window-${secondaryWindowCounter++}` : 'main');
    const restoredBounds = clampWindowBoundsToCurrentDisplay(persistedWindowState?.bounds ?? DEFAULT_WINDOW_BOUNDS);

    const window = new BrowserWindow({
      width: restoredBounds.width,
      height: restoredBounds.height,
      minWidth: 400,
      minHeight: 300,
      center: true,
      icon: appIconPath,
      backgroundColor: LIGHT_WINDOW_BACKGROUND_COLOR,
      show: false,
      autoHideMenuBar: true,
      titleBarStyle: 'hidden',
      titleBarOverlay: process.platform === 'win32' ? {
        color: LIGHT_WINDOW_BACKGROUND_COLOR,
        symbolColor: LIGHT_WINDOW_SYMBOL_COLOR,
        height: 40,
      } : undefined,
      webPreferences: {
        preload: path.join(__dirname, 'preload.bundle.cjs'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true,
        allowRunningInsecureContent: false,
        webviewTag: false,
        spellcheck: false,
      },
    });

    windowLabels.set(window.id, label);
    const { scheduleDevRendererReload } = attachWindowLifecycle({
      window,
      windowOptions,
      closeApprovedWebContents,
      readyToRevealWebContents,
      windowLabels,
      isUsableWindow,
      safeSend,
      loadRenderer,
      isDevelopment,
      isTrustedRendererUrl,
      openExternalIfAllowed,
      reportError,
      beforeRendererReload,
      getWindowLabel,
      shouldFocusOnReveal,
      rendererDevUrl,
      onPersistedWindowState: (state) => {
        persistedWindowState = state;
      },
    });

    if (label === 'main' && persistedWindowState?.isMaximized) {
      window.maximize();
    }

    loadRenderer(window, windowOptions).catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      if (isDevelopment()) {
        console.warn(`[vlaina] Initial renderer load failed: ${message}`);
        scheduleDevRendererReload(`initial load failed: ${message}`);
        return;
      }

      reportError(new Error(`Initial renderer load failed: ${message}`), {
        label: getWindowLabel(window),
      });
      console.error(`[vlaina] Initial renderer load failed: ${message}`);
    });

    return window;
  }

  function createMainWindow() {
    return createWindow({ label: 'main' });
  }

  function hasOpenWindows() {
    return BrowserWindow.getAllWindows().length > 0;
  }

  function isReadyToReveal(window) {
    return readyToRevealWebContents.has(window.webContents.id);
  }

  function registerWindowIpc(handleIpc) {
    registerWindowIpcHandlers({
      closeApprovedWebContents,
      createWindow,
      getWindowLabel,
      handleIpc,
      resolveTargetWindow,
    });
  }

  return {
    createMainWindow,
    hasOpenWindows,
    isReadyToReveal,
    registerWindowIpc,
    resolveTargetWindow,
  };
}
