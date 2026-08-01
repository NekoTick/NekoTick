import path from 'node:path';
import util from 'node:util';
import { createBoundedErrorLogWriter } from './errorLogWriter.mjs';

export {
  ERROR_LOG_DEDUPE_LIMIT,
  ERROR_LOG_MAX_FILE_BYTES,
  ERROR_LOG_MAX_RETAINED_FILES,
} from './errorLogWriter.mjs';

const MAX_FIELD_CHARS = 32 * 1024;
const MAX_RENDERER_DETAILS_CHARS = 128 * 1024;
const ERROR_LOG_SCHEMA_VERSION = 2;
const UNSAFE_LOG_FIELD_CHARS_PATTERN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const SENSITIVE_LOG_QUERY_PARAM_PATTERN =
  /([?&](?:api[_-]?key|auth|code|key|password|secret|session|state|token)=)[^&#\s"']+/gi;
const SENSITIVE_LOG_HEADER_PATTERN =
  /\b(authorization|x-api-key|api-key|api_key|apikey|x-app-session-token|cookie|set-cookie)\b(\s*[:=]\s*)([^\s"',;\\]+)/gi;
const SENSITIVE_LOG_TOKEN_PATTERN =
  /\b(?:Bearer\s+)?(?:nts|rat|sk|sk-ant|secret)_[A-Za-z0-9._~+/=-]{8,}\b|\bsk-[A-Za-z0-9._~+/=-]{12,}\b/g;

function getLogsDir(app) {
  return path.join(app.getPath('userData'), '.vlaina', 'app', 'logs');
}

function getCurrentLogFilePath(app, now = new Date()) {
  const day = now.toISOString().slice(0, 10);
  return path.join(getLogsDir(app), `vlaina-error-${day}.log`);
}

function normalizeLogText(value, maxChars = MAX_FIELD_CHARS) {
  if (value == null) {
    return '';
  }

  const text = typeof value === 'string'
    ? value
    : util.inspect(value, { depth: 6, breakLength: 120 });
  const cleaned = redactSensitiveLogText(text.replace(UNSAFE_LOG_FIELD_CHARS_PATTERN, ''));
  if (cleaned.length <= maxChars) {
    return cleaned;
  }

  return `${cleaned.slice(0, maxChars)}\n...[truncated ${cleaned.length - maxChars} chars]`;
}

function redactSensitiveLogText(value) {
  return value
    .replace(SENSITIVE_LOG_QUERY_PARAM_PATTERN, '$1[redacted]')
    .replace(SENSITIVE_LOG_HEADER_PATTERN, '$1$2[redacted]')
    .replace(SENSITIVE_LOG_TOKEN_PATTERN, (match) => (
      /^Bearer\s+/i.test(match) ? 'Bearer [redacted]' : '[redacted]'
    ));
}

function serializeError(error, depth = 0) {
  if (depth > 4) {
    return {
      name: 'Error',
      message: 'Nested error cause omitted.',
      stack: '',
      cause: null,
    };
  }

  if (error instanceof Error) {
    return {
      name: normalizeLogText(error.name),
      message: normalizeLogText(error.message),
      stack: normalizeLogText(error.stack),
      cause: error.cause && error.cause !== error ? serializeError(error.cause, depth + 1) : null,
    };
  }

  return {
    name: typeof error,
    message: normalizeLogText(error),
    stack: '',
    cause: null,
  };
}

function normalizeOptionalBoolean(value) {
  return typeof value === 'boolean' ? value : null;
}

function normalizeOptionalNumber(value) {
  return Number.isFinite(value) ? value : null;
}

function normalizeScreenPayload(screen) {
  if (!screen || typeof screen !== 'object') {
    return null;
  }

  return {
    width: normalizeOptionalNumber(screen.width),
    height: normalizeOptionalNumber(screen.height),
    availWidth: normalizeOptionalNumber(screen.availWidth),
    availHeight: normalizeOptionalNumber(screen.availHeight),
    colorDepth: normalizeOptionalNumber(screen.colorDepth),
    pixelDepth: normalizeOptionalNumber(screen.pixelDepth),
  };
}

function normalizeRendererDiagnosticsPayload(detail) {
  return {
    reactVersion: normalizeLogText(detail.reactVersion),
    buildMode: normalizeLogText(detail.buildMode),
    isDev: normalizeOptionalBoolean(detail.isDev),
    isProd: normalizeOptionalBoolean(detail.isProd),
    document: detail.document && typeof detail.document === 'object'
      ? {
          title: normalizeLogText(detail.document.title, 2048),
          visibilityState: normalizeLogText(detail.document.visibilityState, 512),
          hasFocus: normalizeOptionalBoolean(detail.document.hasFocus),
        }
      : null,
    location: detail.location && typeof detail.location === 'object'
      ? {
          protocol: normalizeLogText(detail.location.protocol, 512),
          origin: normalizeLogText(detail.location.origin, 2048),
          pathname: normalizeLogText(detail.location.pathname, 4096),
          hash: normalizeLogText(detail.location.hash, 4096),
          searchKeys: Array.isArray(detail.location.searchKeys)
            ? detail.location.searchKeys.map((key) => normalizeLogText(key, 512)).slice(0, 32)
            : [],
        }
      : null,
    screen: normalizeScreenPayload(detail.screen),
    timezone: detail.timezone && typeof detail.timezone === 'object'
      ? {
          timeZone: normalizeLogText(detail.timezone.timeZone, 512),
          offsetMinutes: normalizeOptionalNumber(detail.timezone.offsetMinutes),
        }
      : null,
    storage: detail.storage && typeof detail.storage === 'object'
      ? {
          localStorage: normalizeOptionalBoolean(detail.storage.localStorage),
          sessionStorage: normalizeOptionalBoolean(detail.storage.sessionStorage),
          indexedDB: normalizeOptionalBoolean(detail.storage.indexedDB),
        }
      : null,
    runtime: detail.runtime && typeof detail.runtime === 'object'
      ? {
          isSecureContext: normalizeOptionalBoolean(detail.runtime.isSecureContext),
          crossOriginIsolated: normalizeOptionalBoolean(detail.runtime.crossOriginIsolated),
          hardwareConcurrency: normalizeOptionalNumber(detail.runtime.hardwareConcurrency),
          deviceMemory: normalizeOptionalNumber(detail.runtime.deviceMemory),
          maxTouchPoints: normalizeOptionalNumber(detail.runtime.maxTouchPoints),
        }
      : null,
  };
}

function normalizeRendererHref(value) {
  try {
    const url = new URL(typeof value === 'string' ? value : '');
    url.search = '';
    url.hash = '';
    return normalizeLogText(url.href);
  } catch {
    return '';
  }
}

function normalizeRendererPayload(payload) {
  const detail = payload && typeof payload === 'object' ? payload : {};
  return {
    source: normalizeLogText(detail.source || 'renderer'),
    type: normalizeLogText(detail.type || 'error'),
    message: normalizeLogText(detail.message),
    name: normalizeLogText(detail.name),
    stack: normalizeLogText(detail.stack, MAX_RENDERER_DETAILS_CHARS),
    componentStack: normalizeLogText(detail.componentStack, MAX_RENDERER_DETAILS_CHARS),
    href: normalizeRendererHref(detail.href),
    userAgent: normalizeLogText(detail.userAgent),
    language: normalizeLogText(detail.language),
    languages: Array.isArray(detail.languages)
      ? detail.languages.map((language) => normalizeLogText(language, 512)).slice(0, 16)
      : [],
    platform: normalizeLogText(detail.platform),
    viewport: detail.viewport && typeof detail.viewport === 'object'
      ? {
          width: Number.isFinite(detail.viewport.width) ? detail.viewport.width : null,
          height: Number.isFinite(detail.viewport.height) ? detail.viewport.height : null,
          devicePixelRatio: Number.isFinite(detail.viewport.devicePixelRatio)
            ? detail.viewport.devicePixelRatio
            : null,
        }
      : null,
    online: typeof detail.online === 'boolean' ? detail.online : null,
    timestamp: normalizeLogText(detail.timestamp),
    diagnostics: normalizeRendererDiagnosticsPayload(detail),
  };
}

function collectProcessDiagnostics(app) {
  const memoryUsage = process.memoryUsage();
  const safeCall = (callback, fallback = '') => {
    try {
      return callback();
    } catch {
      return fallback;
    }
  };

  return {
    appName: typeof app.getName === 'function' ? normalizeLogText(safeCall(() => app.getName(), 'vlaina')) : 'vlaina',
    appVersion: typeof app.getVersion === 'function' ? normalizeLogText(safeCall(() => app.getVersion(), 'unknown')) : 'unknown',
    isPackaged: Boolean(app.isPackaged),
    locale: typeof app.getLocale === 'function' ? normalizeLogText(safeCall(() => app.getLocale())) : '',
    userDataPath: normalizeLogText(safeCall(() => app.getPath('userData'))),
    logsDir: normalizeLogText(safeCall(() => getLogsDir(app))),
    execPath: normalizeLogText(process.execPath),
    resourcesPath: normalizeLogText(process.resourcesPath),
    cwd: normalizeLogText(process.cwd()),
    pid: process.pid,
    ppid: process.ppid,
    versions: {
      electron: normalizeLogText(process.versions.electron),
      chrome: normalizeLogText(process.versions.chrome),
      node: normalizeLogText(process.versions.node),
      v8: normalizeLogText(process.versions.v8),
    },
    memoryUsage: {
      rss: memoryUsage.rss,
      heapTotal: memoryUsage.heapTotal,
      heapUsed: memoryUsage.heapUsed,
      external: memoryUsage.external,
      arrayBuffers: memoryUsage.arrayBuffers,
    },
  };
}

function buildLogEntry({ app, processType, error, payload, context }) {
  const now = new Date();
  let appVersion = 'unknown';
  try {
    appVersion = typeof app.getVersion === 'function' ? app.getVersion() : 'unknown';
  } catch {
  }

  return {
    schemaVersion: ERROR_LOG_SCHEMA_VERSION,
    timestamp: now.toISOString(),
    appVersion,
    platform: process.platform,
    arch: process.arch,
    processType,
    context: normalizeLogText(context),
    diagnostics: collectProcessDiagnostics(app),
    error: error === undefined ? null : serializeError(error),
    renderer: payload === undefined ? null : normalizeRendererPayload(payload),
  };
}

export function createErrorLogService({ app }) {
  function getInfo() {
    const logsDir = getLogsDir(app);
    return {
      logsDir,
      currentLogFilePath: getCurrentLogFilePath(app),
    };
  }

  const writer = createBoundedErrorLogWriter({
    getCurrentLogFilePath: () => getInfo().currentLogFilePath,
  });

  function logMainError(error, context = 'main') {
    return writer.append(buildLogEntry({ app, processType: 'main', error, context }));
  }

  function logRendererError(payload, context = 'renderer') {
    return writer.append(buildLogEntry({ app, processType: 'renderer', payload, context }));
  }

  return {
    flush: writer.flush,
    getInfo,
    logMainError,
    logRendererError,
  };
}
