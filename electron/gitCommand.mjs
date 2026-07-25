import { execFile } from 'node:child_process';

const DEFAULT_MAX_BUFFER_BYTES = 8 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_ERROR_TEXT_CHARS = 4096;

const disabledHooksPath = process.platform === 'win32' ? 'NUL' : '/dev/null';
const baseGitArgs = [
  '-c', 'color.ui=false',
  '-c', 'core.quotePath=false',
  '-c', 'core.fsmonitor=false',
  '-c', `core.hooksPath=${disabledHooksPath}`,
];

function createGitEnvironment(overrides = {}) {
  const environment = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (!key.toUpperCase().startsWith('GIT_') && value !== undefined) {
      environment[key] = value;
    }
  }

  return {
    ...environment,
    LC_ALL: 'C',
    GIT_TERMINAL_PROMPT: '0',
    ...overrides,
  };
}

export function sanitizeGitOutput(value) {
  return String(value ?? '')
    .replace(/\b((?:https?|ssh):\/\/)([^/\s@]+)@/gi, '$1[redacted]@')
    .replace(/(^|[\s'"(])([^/\s:@]+)@([^\s/:]+):/g, '$1[redacted]@$3:')
    .slice(0, MAX_ERROR_TEXT_CHARS);
}

export class GitCommandError extends Error {
  constructor(message, { code = null, stderr = '', stdout = '' } = {}) {
    super(message);
    this.name = 'GitCommandError';
    this.code = code;
    this.stderr = sanitizeGitOutput(stderr);
    this.stdout = sanitizeGitOutput(stdout);
  }
}

function describeGitFailure(error, stderr) {
  if (error?.code === 'ENOENT') {
    return 'Git is not installed or is unavailable.';
  }
  if (error?.killed || error?.signal) {
    return 'Git command timed out.';
  }
  if (error?.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') {
    return 'Git command output exceeded the safety limit.';
  }

  const detail = sanitizeGitOutput(stderr || error?.message).trim();
  return detail ? `Git command failed: ${detail}` : 'Git command failed.';
}

export function runGit(rootPath, args, {
  allowedExitCodes = [],
  env = {},
  maxBuffer = DEFAULT_MAX_BUFFER_BYTES,
  timeout = DEFAULT_TIMEOUT_MS,
} = {}) {
  const allowedCodes = new Set(allowedExitCodes);

  return new Promise((resolve, reject) => {
    execFile('git', [...baseGitArgs, ...args], {
      cwd: rootPath,
      encoding: 'utf8',
      env: createGitEnvironment(env),
      killSignal: 'SIGKILL',
      maxBuffer,
      shell: false,
      timeout,
      windowsHide: true,
    }, (error, stdout = '', stderr = '') => {
      const exitCode = typeof error?.code === 'number' ? error.code : 0;
      if (!error || allowedCodes.has(exitCode)) {
        resolve({ code: exitCode, stderr, stdout });
        return;
      }

      reject(new GitCommandError(describeGitFailure(error, stderr), {
        code: error?.code ?? null,
        stderr,
        stdout,
      }));
    });
  });
}

export const gitCommandLimits = {
  defaultMaxBufferBytes: DEFAULT_MAX_BUFFER_BYTES,
  defaultTimeoutMs: DEFAULT_TIMEOUT_MS,
};
