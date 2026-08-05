import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const ERROR_LOG_MAX_FILE_BYTES = 512 * 1024;
export const ERROR_LOG_MAX_RETAINED_FILES = 5;
export const ERROR_LOG_DEDUPE_LIMIT = 3;
const MAX_ENTRY_BYTES = 256 * 1024;
const MAX_ROTATIONS = 3;
const RATE_WINDOW_MS = 60 * 1000;
const RATE_LIMIT = 60;
const PRIVATE_DIR_MODE = 0o700;
const PRIVATE_FILE_MODE = 0o600;

function chmodSyncIfSupported(filePath, mode) {
  try {
    fs.chmodSync(filePath, mode);
  } catch {
  }
}

function truncate(value, maxChars = 8192) {
  const text = typeof value === 'string' ? value : '';
  return text.length <= maxChars ? text : `${text.slice(0, maxChars)}\n...[truncated]`;
}

function serializeBoundedEntry(entry) {
  const serialized = `${JSON.stringify(entry, null, 2)}\n`;
  if (Buffer.byteLength(serialized, 'utf8') <= MAX_ENTRY_BYTES) return serialized;

  return `${JSON.stringify({
    schemaVersion: entry.schemaVersion,
    timestamp: entry.timestamp,
    appVersion: entry.appVersion,
    platform: entry.platform,
    arch: entry.arch,
    processType: entry.processType,
    context: entry.context,
    truncated: true,
    error: entry.error
      ? { name: entry.error.name, message: truncate(entry.error.message) }
      : null,
    renderer: entry.renderer
      ? {
          source: entry.renderer.source,
          type: entry.renderer.type,
          name: entry.renderer.name,
          message: truncate(entry.renderer.message),
          timestamp: entry.renderer.timestamp,
        }
      : null,
  }, null, 2)}\n`;
}

async function moveIfPresent(source, destination) {
  try {
    await fs.promises.rename(source, destination);
  } catch (error) {
    if (!error || typeof error !== 'object' || error.code !== 'ENOENT') throw error;
  }
}

async function rotateIfNeeded(filePath, entryBytes) {
  let currentBytes = 0;
  try {
    currentBytes = (await fs.promises.stat(filePath)).size;
  } catch (error) {
    if (!error || typeof error !== 'object' || error.code !== 'ENOENT') throw error;
  }
  if (currentBytes === 0 || currentBytes + entryBytes <= ERROR_LOG_MAX_FILE_BYTES) return;

  await fs.promises.rm(`${filePath}.${MAX_ROTATIONS}`, { force: true });
  for (let index = MAX_ROTATIONS - 1; index >= 1; index -= 1) {
    await moveIfPresent(`${filePath}.${index}`, `${filePath}.${index + 1}`);
  }
  await moveIfPresent(filePath, `${filePath}.1`);
}

async function pruneOldLogs(logsDir, currentLogFilePath) {
  const entries = await fs.promises.readdir(logsDir, { withFileTypes: true });
  const candidates = await Promise.all(entries
    .filter((entry) => entry.isFile() && /^vlaina-error-\d{4}-\d{2}-\d{2}\.log(?:\.\d+)?$/.test(entry.name))
    .map(async (entry) => {
      const filePath = path.join(logsDir, entry.name);
      const stat = await fs.promises.stat(filePath);
      return { filePath, modifiedAt: stat.mtimeMs };
    }));
  candidates.sort((left, right) => {
    if (left.filePath === currentLogFilePath) return -1;
    if (right.filePath === currentLogFilePath) return 1;
    return right.modifiedAt - left.modifiedAt;
  });
  await Promise.all(candidates
    .slice(ERROR_LOG_MAX_RETAINED_FILES)
    .map(({ filePath }) => fs.promises.rm(filePath, { force: true })));
}

function getFingerprint(entry) {
  return createHash('sha256').update(JSON.stringify({
    processType: entry.processType,
    context: entry.context,
    error: entry.error,
    renderer: entry.renderer
      ? {
          source: entry.renderer.source,
          type: entry.renderer.type,
          name: entry.renderer.name,
          message: entry.renderer.message,
          stack: entry.renderer.stack,
        }
      : null,
  })).digest('hex');
}

export function createBoundedErrorLogWriter({ getCurrentLogFilePath }) {
  let writeTail = Promise.resolve();
  let rateWindowStartedAt = Date.now();
  let rateWindowCount = 0;
  const duplicateCounts = new Map();

  function shouldAppend(entry) {
    const now = Date.now();
    if (now - rateWindowStartedAt >= RATE_WINDOW_MS) {
      rateWindowStartedAt = now;
      rateWindowCount = 0;
      duplicateCounts.clear();
    }
    rateWindowCount += 1;
    if (rateWindowCount > RATE_LIMIT) return false;

    const fingerprint = getFingerprint(entry);
    const nextCount = (duplicateCounts.get(fingerprint) ?? 0) + 1;
    duplicateCounts.set(fingerprint, nextCount);
    return nextCount <= ERROR_LOG_DEDUPE_LIMIT;
  }

  async function writeEntry(entry) {
    try {
      const currentLogFilePath = getCurrentLogFilePath();
      const logsDir = path.dirname(currentLogFilePath);
      const serialized = serializeBoundedEntry(entry);
      await fs.promises.mkdir(logsDir, { recursive: true, mode: PRIVATE_DIR_MODE });
      chmodSyncIfSupported(logsDir, PRIVATE_DIR_MODE);
      await rotateIfNeeded(currentLogFilePath, Buffer.byteLength(serialized, 'utf8'));
      await fs.promises.writeFile(currentLogFilePath, serialized, {
        encoding: 'utf8',
        flag: 'a',
        mode: PRIVATE_FILE_MODE,
      });
      chmodSyncIfSupported(currentLogFilePath, PRIVATE_FILE_MODE);
      await pruneOldLogs(logsDir, currentLogFilePath);
      return currentLogFilePath;
    } catch (error) {
      console.error('[vlaina] Failed to write error log:', error);
      return null;
    }
  }

  return {
    append(entry) {
      if (!shouldAppend(entry)) return Promise.resolve(null);
      const write = writeTail.then(() => writeEntry(entry));
      writeTail = write.then(() => undefined, () => undefined);
      return write;
    },
    flush() {
      return writeTail;
    },
  };
}
