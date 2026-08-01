const { primitiveToString } = require('./preloadIpcUtils.cjs');

const MAX_ERROR_REPORT_FIELD_CHARS = 32 * 1024;

function truncateErrorReportField(value) {
  const text = primitiveToString(value);
  const normalized = text === null ? '' : text;
  if (normalized.length <= MAX_ERROR_REPORT_FIELD_CHARS) {
    return normalized;
  }
  return `${normalized.slice(0, MAX_ERROR_REPORT_FIELD_CHARS)}\n...[truncated ${normalized.length - MAX_ERROR_REPORT_FIELD_CHARS} chars]`;
}

function serializeErrorForReport(error) {
  if (error && typeof error === 'object') {
    return {
      name: truncateErrorReportField(error.name),
      message: truncateErrorReportField(error.message),
      stack: truncateErrorReportField(error.stack),
    };
  }

  return {
    name: typeof error,
    message: truncateErrorReportField(error),
    stack: '',
  };
}

function safeReadErrorReportValue(readValue, fallback = undefined) {
  try {
    return readValue();
  } catch {
    return fallback;
  }
}

function sanitizeLocationHref(href) {
  try {
    const url = new URL(primitiveToString(href) || '');
    url.search = '';
    url.hash = '';
    return truncateErrorReportField(url.href);
  } catch {
    return '';
  }
}

function storageAvailable(storage) {
  try {
    if (!storage) {
      return false;
    }
    const key = '__vlaina_error_log_probe__';
    storage.setItem(key, '1');
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

function createRendererDiagnosticsReport() {
  const searchParams = safeReadErrorReportValue(
    () => new URLSearchParams(globalThis.location?.search || ''),
    null,
  );

  return {
    document: {
      title: truncateErrorReportField(globalThis.document?.title),
      visibilityState: truncateErrorReportField(globalThis.document?.visibilityState),
      hasFocus: safeReadErrorReportValue(() => globalThis.document?.hasFocus?.(), null),
    },
    location: {
      protocol: truncateErrorReportField(globalThis.location?.protocol),
      origin: truncateErrorReportField(globalThis.location?.origin),
      pathname: truncateErrorReportField(globalThis.location?.pathname),
      hash: '',
      searchKeys: searchParams ? [...searchParams.keys()].map((key) => truncateErrorReportField(key)).slice(0, 32) : [],
    },
    screen: {
      width: globalThis.screen?.width,
      height: globalThis.screen?.height,
      availWidth: globalThis.screen?.availWidth,
      availHeight: globalThis.screen?.availHeight,
      colorDepth: globalThis.screen?.colorDepth,
      pixelDepth: globalThis.screen?.pixelDepth,
    },
    timezone: {
      timeZone: truncateErrorReportField(safeReadErrorReportValue(
        () => Intl.DateTimeFormat().resolvedOptions().timeZone,
        '',
      )),
      offsetMinutes: safeReadErrorReportValue(() => new Date().getTimezoneOffset(), null),
    },
    storage: {
      localStorage: storageAvailable(globalThis.localStorage),
      sessionStorage: storageAvailable(globalThis.sessionStorage),
      indexedDB: typeof globalThis.indexedDB !== 'undefined',
    },
    runtime: {
      isSecureContext: globalThis.isSecureContext,
      crossOriginIsolated: globalThis.crossOriginIsolated,
      hardwareConcurrency: globalThis.navigator?.hardwareConcurrency,
      deviceMemory: globalThis.navigator?.deviceMemory,
      maxTouchPoints: globalThis.navigator?.maxTouchPoints,
    },
  };
}

function createRendererErrorReport(details = {}) {
  const serializedError = serializeErrorForReport(details.error);
  return {
    source: truncateErrorReportField(details.source || 'renderer'),
    type: truncateErrorReportField(details.type || 'error'),
    name: truncateErrorReportField(details.name || serializedError.name),
    message: truncateErrorReportField(details.message || serializedError.message),
    stack: truncateErrorReportField(details.stack || serializedError.stack),
    componentStack: truncateErrorReportField(details.componentStack),
    href: sanitizeLocationHref(globalThis.location?.href),
    userAgent: truncateErrorReportField(globalThis.navigator?.userAgent),
    language: truncateErrorReportField(globalThis.navigator?.language),
    languages: Array.isArray(globalThis.navigator?.languages)
      ? globalThis.navigator.languages.map((language) => truncateErrorReportField(language)).slice(0, 16)
      : [],
    platform: truncateErrorReportField(globalThis.navigator?.platform),
    viewport: {
      width: globalThis.innerWidth,
      height: globalThis.innerHeight,
      devicePixelRatio: globalThis.devicePixelRatio,
    },
    online: globalThis.navigator?.onLine,
    ...createRendererDiagnosticsReport(),
    reactVersion: truncateErrorReportField(details.reactVersion),
    buildMode: truncateErrorReportField(details.buildMode),
    isDev: typeof details.isDev === 'boolean' ? details.isDev : null,
    isProd: typeof details.isProd === 'boolean' ? details.isProd : null,
    timestamp: new Date().toISOString(),
  };
}

function reportRendererErrorBestEffort(ipcRenderer, details) {
  try {
    ipcRenderer.send('desktop:app:report-renderer-error', createRendererErrorReport(details));
  } catch {
  }
}

function installRendererErrorReporting(ipcRenderer) {
  globalThis.addEventListener?.('error', (event) => {
    reportRendererErrorBestEffort(ipcRenderer, {
      source: 'window.error',
      type: 'error',
      message: event.message,
      error: event.error,
    });
  });

  globalThis.addEventListener?.('unhandledrejection', (event) => {
    reportRendererErrorBestEffort(ipcRenderer, {
      source: 'window.unhandledrejection',
      type: 'unhandledrejection',
      error: event.reason,
    });
  });
}

module.exports = {
  createRendererErrorReport,
  installRendererErrorReporting,
  sanitizeLocationHref,
};
