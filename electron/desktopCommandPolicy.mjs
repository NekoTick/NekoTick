import path from 'node:path';

export const MAX_DESKTOP_COMMAND_CHARS = 2048;
export const MAX_DESKTOP_COMMAND_CWD_CHARS = 4096;
export const MAX_DESKTOP_COMMAND_PURPOSE_CHARS = 500;
export const DEFAULT_DESKTOP_COMMAND_TIMEOUT_MS = 10 * 60 * 1000;
export const MAX_DESKTOP_COMMAND_TIMEOUT_MS = 30 * 60 * 1000;

const UNSAFE_DISPLAY_CHARS = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}\uFFFD]/u;
const SAFE_ENV_KEYS = new Set([
  'APPDATA',
  'COLORTERM',
  'COMSPEC',
  'HOME',
  'HOMEDRIVE',
  'HOMEPATH',
  'LANG',
  'LANGUAGE',
  'LC_ALL',
  'LC_CTYPE',
  'LOCALAPPDATA',
  'LOGNAME',
  'NUMBER_OF_PROCESSORS',
  'OS',
  'PATH',
  'PATHEXT',
  'PROGRAMDATA',
  'PROGRAMFILES',
  'PROGRAMFILES(X86)',
  'PROGRAMW6432',
  'PUBLIC',
  'SHELL',
  'SYSTEMDRIVE',
  'SYSTEMROOT',
  'TEMP',
  'TERM',
  'TMP',
  'TMPDIR',
  'USER',
  'USERDOMAIN',
  'USERNAME',
  'USERPROFILE',
  'WINDIR',
  'XDG_CACHE_HOME',
  'XDG_CONFIG_HOME',
  'XDG_DATA_HOME',
  'XDG_STATE_HOME',
]);

function requireBoundedSingleLine(value, label, maxChars) {
  if (typeof value !== 'string') {
    throw new Error(`${label} must be a string.`);
  }
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`${label} is required.`);
  }
  if (normalized.length > maxChars) {
    throw new Error(`${label} is too long.`);
  }
  if (UNSAFE_DISPLAY_CHARS.test(normalized)) {
    throw new Error(`${label} contains unsupported control characters.`);
  }
  return normalized;
}

function optionalBoundedSingleLine(value, label, maxChars) {
  if (value == null || value === '') return '';
  return requireBoundedSingleLine(value, label, maxChars);
}

function normalizeTimeoutMs(value) {
  if (value == null) return DEFAULT_DESKTOP_COMMAND_TIMEOUT_MS;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error('Command timeout must be a finite number of seconds.');
  }
  const timeoutMs = Math.round(value * 1000);
  if (timeoutMs < 1000 || timeoutMs > MAX_DESKTOP_COMMAND_TIMEOUT_MS) {
    throw new Error('Command timeout must be between 1 and 1800 seconds.');
  }
  return timeoutMs;
}

function isSameOrChildPath(rootPath, candidatePath) {
  const relative = path.relative(rootPath, candidatePath);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

export function normalizeDesktopCommandRequest(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid desktop command request.');
  }
  const command = requireBoundedSingleLine(
    value.command,
    'Command',
    MAX_DESKTOP_COMMAND_CHARS,
  );
  const cwdInput = optionalBoundedSingleLine(
    value.cwd,
    'Working directory',
    MAX_DESKTOP_COMMAND_CWD_CHARS,
  );
  const purpose = requireBoundedSingleLine(
    value.purpose,
    'Command purpose',
    MAX_DESKTOP_COMMAND_PURPOSE_CHARS,
  );
  const workspaceRootInput = requireBoundedSingleLine(
    value.workspaceRoot,
    'Workspace root',
    MAX_DESKTOP_COMMAND_CWD_CHARS,
  );
  const workspaceRoot = path.resolve(workspaceRootInput);
  const cwd = path.resolve(workspaceRoot, cwdInput || '.');
  if (!isSameOrChildPath(workspaceRoot, cwd)) {
    throw new Error('Command working directory must stay inside the active workspace.');
  }
  const rawLocale = typeof value.locale === 'string' && value.locale.length <= 32
    ? value.locale.toLowerCase()
    : '';

  return {
    command,
    cwd,
    workspaceRoot,
    purpose,
    locale: rawLocale.startsWith('zh')
      ? rawLocale.includes('hant') || rawLocale.includes('tw')
        ? 'zh-Hant'
        : 'zh-CN'
      : 'en',
    timeoutMs: normalizeTimeoutMs(value.timeoutSeconds),
  };
}

export function buildDesktopCommandEnvironment(source = process.env) {
  const environment = {};
  for (const [key, value] of Object.entries(source)) {
    if (typeof value !== 'string' || !SAFE_ENV_KEYS.has(key.toUpperCase())) continue;
    environment[key] = value;
  }
  environment.NO_COLOR = '1';
  environment.FORCE_COLOR = '0';
  return environment;
}

const PROTECTED_CODEX_PATH_PATTERN = /(?:^|[\\/\s"'`=:(])\.codex(?=$|[\\/\s"'`;),])/i;
const PROTECTED_CODEX_ENV_PATTERN = /(?:^|[^A-Za-z0-9_])(?:CODEX_HOME|%CODEX_HOME%)(?:[^A-Za-z0-9_]|$)/i;
const DETACHED_PROCESS_PATTERN = /(?:\b(?:nohup|setsid|disown|start-process|start-job)\b|\bwmic\b[^\n]*\bprocess\b[^\n]*\bcall\s+create\b|(?:^|[|;&]\s*)start(?:\.exe)?(?:\s|$))/i;

function containsBackgroundOperator(command, platform) {
  let quote = '';
  for (let index = 0; index < command.length; index += 1) {
    const char = command[index];
    if (quote) {
      if (char === quote) quote = '';
      if (char === '\\' && platform !== 'win32') index += 1;
      continue;
    }
    if (char === '"' || (char === "'" && platform !== 'win32')) {
      quote = char;
      continue;
    }
    if ((char === '\\' && platform !== 'win32') || (char === '^' && platform === 'win32')) {
      index += 1;
      continue;
    }
    if (
      char === '&'
      && command[index - 1] !== '&'
      && command[index + 1] !== '&'
      && command[index - 1] !== '>'
      && command[index + 1] !== '>'
    ) {
      return true;
    }
  }
  return false;
}

export function referencesProtectedCodexConfig(command) {
  if (typeof command !== 'string') return false;
  if (PROTECTED_CODEX_PATH_PATTERN.test(command) || PROTECTED_CODEX_ENV_PATTERN.test(command)) {
    return true;
  }
  const compact = command.replace(/[\s"'`^+]/g, '');
  return /(?:^|[\\/])\.codex(?:[\\/]|$)/i.test(compact);
}

export function assertDesktopCommandAllowed(command, platform = process.platform) {
  if (referencesProtectedCodexConfig(command)) {
    throw new Error('Commands cannot access the protected Codex configuration directory.');
  }
  if (DETACHED_PROCESS_PATTERN.test(command) || containsBackgroundOperator(command, platform)) {
    throw new Error('Detached or background commands are not supported.');
  }
}

export function getDesktopCommandShell(platform = process.platform, environment = process.env) {
  if (platform === 'win32') {
    const configuredRoot = environment.SystemRoot || environment.SYSTEMROOT;
    const systemRoot = typeof configuredRoot === 'string'
      && path.win32.isAbsolute(configuredRoot)
      && path.win32.basename(configuredRoot).toLowerCase() === 'windows'
      ? configuredRoot
      : 'C:\\Windows';
    return {
      shell: path.win32.join(systemRoot, 'System32', 'cmd.exe'),
      args: ['/d', '/s', '/c'],
    };
  }
  return { shell: '/bin/sh', args: ['-c'] };
}
