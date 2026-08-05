import {
  captureWindowState,
  WINDOW_STATE_WRITE_DELAY_MS,
  writeStoredWindowState,
} from './windowState.mjs';

const DEV_RENDERER_RELOAD_DELAY_MS = 1000;
const DEV_RENDERER_RELOAD_MAX_DELAY_MS = 8000;
const STARTUP_REVEAL_FALLBACK_DELAY_MS = 3000;
const STARTUP_REVEAL_HARD_DEADLINE_MS = 10_000;

export function attachWindowLifecycle({
  window,
  windowOptions = {},
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
  onPersistedWindowState,
  rendererDevUrl,
}) {
  const webContentsId = window.webContents.id;
  let externalOpenModifierActive = false;
  let didRevealWindow = false;
  let didBrowserWindowReportReadyToShow = false;
  let didRendererReportStartupReady = false;
  let devRendererReloadTimer = null;
  let devRendererReloadDelay = DEV_RENDERER_RELOAD_DELAY_MS;
  let startupRevealFallbackTimer = null;
  let startupRevealHardDeadlineTimer = null;
  let windowStateWriteTimer = null;
  let rendererReloadPending = false;

  const clearDevRendererReloadTimer = () => {
    if (devRendererReloadTimer === null) return;
    clearTimeout(devRendererReloadTimer);
    devRendererReloadTimer = null;
  };

  const clearWindowStateWriteTimer = () => {
    if (windowStateWriteTimer === null) return;
    clearTimeout(windowStateWriteTimer);
    windowStateWriteTimer = null;
  };

  const clearStartupRevealTimers = () => {
    if (startupRevealFallbackTimer !== null) {
      clearTimeout(startupRevealFallbackTimer);
      startupRevealFallbackTimer = null;
    }
    if (startupRevealHardDeadlineTimer !== null) {
      clearTimeout(startupRevealHardDeadlineTimer);
      startupRevealHardDeadlineTimer = null;
    }
  };

  const persistWindowState = () => {
    clearWindowStateWriteTimer();
    if (!isUsableWindow(window) || getWindowLabel(window) !== 'main') return;

    const state = captureWindowState(window);
    if (!state) return;

    onPersistedWindowState(state);
    writeStoredWindowState(state);
  };

  const scheduleWindowStateWrite = () => {
    clearWindowStateWriteTimer();
    if (!isUsableWindow(window) || getWindowLabel(window) !== 'main') return;

    windowStateWriteTimer = setTimeout(() => {
      windowStateWriteTimer = null;
      persistWindowState();
    }, WINDOW_STATE_WRITE_DELAY_MS);
  };

  const scheduleDevRendererReload = (reason) => {
    if (!isDevelopment() || window.isDestroyed()) return;
    if (devRendererReloadTimer !== null) return;

    const delay = devRendererReloadDelay;
    devRendererReloadDelay = Math.min(devRendererReloadDelay * 2, DEV_RENDERER_RELOAD_MAX_DELAY_MS);
    console.warn(`[vlaina] Renderer unavailable in development (${reason}); retrying in ${delay}ms`);

    devRendererReloadTimer = setTimeout(() => {
      devRendererReloadTimer = null;
      if (!isUsableWindow(window)) return;

      loadRenderer(window, windowOptions).catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        scheduleDevRendererReload(`load failed: ${message}`);
      });
    }, delay);
  };

  const revealWindow = () => {
    if (didRevealWindow || window.isDestroyed()) return;

    didRevealWindow = true;
    clearStartupRevealTimers();
    readyToRevealWebContents.add(webContentsId);
    window.show();

    if (shouldFocusOnReveal(window, windowOptions)) {
      window.focus();
    }
  };

  const revealWindowWhenReady = ({ allowWithoutReadyToShow = false } = {}) => {
    if (!didRendererReportStartupReady) return;
    if (!didBrowserWindowReportReadyToShow && !allowWithoutReadyToShow) return;
    revealWindow();
  };

  startupRevealHardDeadlineTimer = setTimeout(() => {
    startupRevealHardDeadlineTimer = null;
    revealWindow();
  }, STARTUP_REVEAL_HARD_DEADLINE_MS);

  window.once('ready-to-show', () => {
    didBrowserWindowReportReadyToShow = true;
    revealWindowWhenReady();
  });
  window.webContents.once('did-finish-load', () => {
    startupRevealFallbackTimer = setTimeout(() => {
      startupRevealFallbackTimer = null;
      revealWindow();
    }, STARTUP_REVEAL_FALLBACK_DELAY_MS);
  });

  window.webContents.on('did-finish-load', () => {
    clearDevRendererReloadTimer();
    devRendererReloadDelay = DEV_RENDERER_RELOAD_DELAY_MS;
  });

  window.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (!isMainFrame) return;

    const summary = `${errorCode} ${errorDescription || 'unknown error'}`;
    if (isDevelopment() && isTrustedRendererUrl(validatedURL || rendererDevUrl)) {
      scheduleDevRendererReload(summary);
      return;
    }

    reportError(new Error(`Renderer failed to load: ${summary}`), {
      label: getWindowLabel(window),
      validatedURL: validatedURL || '',
    });
    console.error(`[vlaina] Renderer failed to load: ${summary}`);
  });

  window.webContents.on('render-process-gone', (_event, details) => {
    const reason = details?.reason ?? 'unknown';
    const exitCode = details?.exitCode ?? 'unknown';
    reportError(new Error(`Renderer process gone (${reason}, exitCode ${exitCode})`), {
      label: getWindowLabel(window),
      reason,
      exitCode,
    });
    console.error(`[vlaina] Renderer process gone (${reason}, exitCode ${exitCode})`);

    if (!isUsableWindow(window) || rendererReloadPending) return;
    rendererReloadPending = true;
    void Promise.resolve()
      .then(() => beforeRendererReload())
      .catch((error) => {
        reportError(error, { label: getWindowLabel(window), reason: 'recovery-flush-before-reload' });
      })
      .finally(() => {
        rendererReloadPending = false;
        if (!isUsableWindow(window)) return;
        if (isDevelopment()) {
          scheduleDevRendererReload(`renderer process gone: ${reason}`);
          return;
        }
        window.reload();
      });
  });

  window.on('unresponsive', () => {
    console.warn(`[vlaina] Window became unresponsive (${getWindowLabel(window)})`);
  });

  window.webContents.on('ipc-message', (_event, channel) => {
    if (channel !== 'desktop:startup-ready') return;
    didRendererReportStartupReady = true;
    revealWindowWhenReady();
  });

  window.on('closed', () => {
    clearDevRendererReloadTimer();
    clearStartupRevealTimers();
    clearWindowStateWriteTimer();
    closeApprovedWebContents.delete(webContentsId);
    readyToRevealWebContents.delete(webContentsId);
    windowLabels.delete(window.id);
  });

  window.on('resize', scheduleWindowStateWrite);
  window.on('maximize', scheduleWindowStateWrite);
  window.on('unmaximize', scheduleWindowStateWrite);
  window.on('close', persistWindowState);

  window.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown') {
      externalOpenModifierActive = Boolean(input.control || input.meta);
    } else if (
      input.type === 'keyUp' &&
      (input.key === 'Control' || input.key === 'Meta' || input.key === 'Super')
    ) {
      externalOpenModifierActive = false;
    }

    const isOpenMarkdownShortcut =
      input.type === 'keyDown' &&
      (input.control || input.meta) &&
      !input.shift &&
      !input.alt &&
      input.key.toLowerCase() === 'o';

    if (isOpenMarkdownShortcut) {
      event.preventDefault();
      safeSend(window, 'desktop:shortcut:open-markdown-file');
      return;
    }

    const isDevToolsShortcut =
      isDevelopment() &&
      input.type === 'keyDown' &&
      (
        input.key === 'F12' ||
        ((input.control || input.meta) && input.shift && input.key.toLowerCase() === 'i')
      );

    if (isDevToolsShortcut) {
      event.preventDefault();
      if (window.webContents.isDevToolsOpened()) {
        window.webContents.closeDevTools();
        return;
      }
      window.webContents.openDevTools({ mode: 'detach' });
    }
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (externalOpenModifierActive) {
      openExternalIfAllowed(url);
    }
    return { action: 'deny' };
  });

  window.webContents.on('will-navigate', (event, url) => {
    if (isTrustedRendererUrl(url)) return;

    event.preventDefault();
    if (externalOpenModifierActive) {
      openExternalIfAllowed(url);
    }
  });

  window.webContents.on('will-attach-webview', (event) => {
    event.preventDefault();
  });

  window.on('close', (event) => {
    if (window.webContents.isDestroyed()) return;
    if (closeApprovedWebContents.has(webContentsId)) {
      closeApprovedWebContents.delete(webContentsId);
      return;
    }

    event.preventDefault();
    safeSend(window, 'desktop:window:close-requested');
  });

  if (windowOptions.newWindow) {
    revealWindow();
  }

  return {
    scheduleDevRendererReload,
  };
}
