import { createHash } from 'node:crypto';
import { chmod, mkdir, readFile, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { writeFileAtomically } from './desktopAtomicFile.mjs';

const RECOVERY_SCHEMA_VERSION = 1;
const MAX_NOTE_CONTENT_BYTES = 10 * 1024 * 1024;
const MAX_IDENTITY_CHARS = 32 * 1024;
const PRIVATE_DIR_MODE = 0o700;
const PRIVATE_FILE_MODE = 0o600;

function requireBoundedString(value, label, maxChars = MAX_IDENTITY_CHARS) {
  if (typeof value !== 'string' || value.length > maxChars) {
    throw new Error(`Invalid note recovery ${label}.`);
  }
  return value;
}

function requireBoundedContent(value, label) {
  const content = requireBoundedString(value, label, MAX_NOTE_CONTENT_BYTES);
  if (Buffer.byteLength(content, 'utf8') > MAX_NOTE_CONTENT_BYTES) {
    throw new Error(`Note recovery ${label} is too large.`);
  }
  return content;
}

function normalizeDraft(value) {
  if (!value || typeof value !== 'object') return null;
  const kind = value.kind === 'scratch' || value.kind === 'notesRoot' ? value.kind : undefined;
  return {
    parentPath: value.parentPath === null
      ? null
      : requireBoundedString(value.parentPath, 'draft parent path'),
    name: requireBoundedString(value.name, 'draft name', 1024),
    ...(value.originNotesPath === undefined
      ? {}
      : { originNotesPath: requireBoundedString(value.originNotesPath, 'draft origin path') }),
    ...(kind ? { kind } : {}),
  };
}

function normalizeIdentity(payload) {
  const notesPath = requireBoundedString(payload?.notesPath, 'notes path');
  const notePath = requireBoundedString(payload?.notePath, 'note path');
  if (!notePath) throw new Error('Invalid note recovery note path.');
  return { notesPath, notePath };
}

function getRecoveryKey(identity) {
  return createHash('sha256')
    .update(identity.notesPath)
    .update('\0')
    .update(identity.notePath)
    .digest('hex');
}

function hashContent(content) {
  return createHash('sha256').update(content).digest('hex');
}

function normalizeSnapshot(payload) {
  const identity = normalizeIdentity(payload);
  const content = requireBoundedContent(payload?.content, 'content');
  const baselineContent = requireBoundedContent(payload?.baselineContent, 'baseline content');
  return {
    schemaVersion: RECOVERY_SCHEMA_VERSION,
    ...identity,
    content,
    baselineHash: hashContent(baselineContent),
    draft: normalizeDraft(payload?.draft),
    updatedAt: new Date().toISOString(),
  };
}

function parseSnapshot(raw) {
  const parsed = JSON.parse(raw);
  if (parsed?.schemaVersion !== RECOVERY_SCHEMA_VERSION) return null;
  const identity = normalizeIdentity(parsed);
  const content = requireBoundedContent(parsed.content, 'content');
  if (!/^[a-f0-9]{64}$/.test(parsed.baselineHash)) return null;
  return {
    schemaVersion: RECOVERY_SCHEMA_VERSION,
    ...identity,
    content,
    baselineHash: parsed.baselineHash,
    draft: normalizeDraft(parsed.draft),
    updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : '',
  };
}

export function createNoteRecoveryService({ app }) {
  const recoveryDir = path.join(app.getPath('userData'), '.vlaina', 'app', 'note-recovery');
  const pendingByKey = new Map();
  const operationTailByKey = new Map();
  const drainQueuedByKey = new Set();

  const getFilePath = (identity) => path.join(recoveryDir, `${getRecoveryKey(identity)}.json`);

  async function ensureRecoveryDir() {
    await mkdir(recoveryDir, { recursive: true, mode: PRIVATE_DIR_MODE });
    await chmod(recoveryDir, PRIVATE_DIR_MODE).catch(() => {});
  }

  async function writeSnapshot(snapshot) {
    await ensureRecoveryDir();
    const filePath = getFilePath(snapshot);
    await writeFileAtomically(filePath, JSON.stringify(snapshot));
    await chmod(filePath, PRIVATE_FILE_MODE).catch(() => {});
  }

  function enqueueOperation(key, operation) {
    const previous = operationTailByKey.get(key) ?? Promise.resolve();
    const next = previous.catch(() => {}).then(operation);
    operationTailByKey.set(key, next);
    void next.finally(() => {
      if (operationTailByKey.get(key) === next) {
        operationTailByKey.delete(key);
      }
    }).catch(() => {});
    return next;
  }

  function queueDrain(key) {
    if (drainQueuedByKey.has(key)) return operationTailByKey.get(key) ?? Promise.resolve();
    drainQueuedByKey.add(key);
    const drain = enqueueOperation(key, async () => {
      while (pendingByKey.has(key)) {
        const snapshot = pendingByKey.get(key);
        pendingByKey.delete(key);
        await writeSnapshot(snapshot);
      }
    });
    void drain.finally(() => {
      drainQueuedByKey.delete(key);
      if (pendingByKey.has(key)) queueDrain(key);
    }).catch(() => {});
    return drain;
  }

  async function flushKey(key) {
    while (operationTailByKey.has(key) || pendingByKey.has(key)) {
      if (pendingByKey.has(key) && !drainQueuedByKey.has(key)) queueDrain(key);
      await operationTailByKey.get(key);
    }
  }

  async function readSnapshotFile(identity) {
    try {
      const snapshot = parseSnapshot(await readFile(getFilePath(identity), 'utf8'));
      if (!snapshot || snapshot.notesPath !== identity.notesPath || snapshot.notePath !== identity.notePath) {
        return null;
      }
      return snapshot;
    } catch (error) {
      if (error && typeof error === 'object' && error.code === 'ENOENT') return null;
      throw error;
    }
  }

  async function readStoredSnapshot(identity) {
    await flushKey(getRecoveryKey(identity));
    return readSnapshotFile(identity);
  }

  async function flushAll() {
    while (operationTailByKey.size > 0 || pendingByKey.size > 0) {
      for (const key of pendingByKey.keys()) queueDrain(key);
      await Promise.all([...operationTailByKey.values()]);
    }
  }

  return {
    stage(payload) {
      const snapshot = normalizeSnapshot(payload);
      const key = getRecoveryKey(snapshot);
      pendingByKey.set(key, snapshot);
      return queueDrain(key);
    },

    async read(payload) {
      const identity = normalizeIdentity(payload);
      const currentDiskContent = requireBoundedContent(payload?.currentDiskContent, 'disk content');
      const snapshot = await readStoredSnapshot(identity);
      if (!snapshot) return null;
      return {
        content: snapshot.content,
        diskMatchesBaseline: hashContent(currentDiskContent) === snapshot.baselineHash,
        draft: snapshot.draft,
        updatedAt: snapshot.updatedAt,
      };
    },

    async listDrafts(notesPath) {
      const normalizedNotesPath = requireBoundedString(notesPath, 'notes path');
      await flushAll();
      let fileNames;
      try {
        fileNames = await readdir(recoveryDir);
      } catch (error) {
        if (error && typeof error === 'object' && error.code === 'ENOENT') return [];
        throw error;
      }
      const snapshots = await Promise.all(fileNames
        .filter((fileName) => /^[a-f0-9]{64}\.json$/.test(fileName))
        .map(async (fileName) => {
          try {
            return parseSnapshot(await readFile(path.join(recoveryDir, fileName), 'utf8'));
          } catch {
            return null;
          }
        }));
      return snapshots
        .filter((snapshot) => snapshot?.notesPath === normalizedNotesPath && snapshot.draft)
        .map((snapshot) => ({
          notePath: snapshot.notePath,
          content: snapshot.content,
          draft: snapshot.draft,
          updatedAt: snapshot.updatedAt,
        }));
    },

    async clear(payload) {
      const identity = normalizeIdentity(payload);
      const expectedContent = payload?.expectedContent === undefined
        ? undefined
        : requireBoundedContent(payload.expectedContent, 'expected content');
      const key = getRecoveryKey(identity);
      return enqueueOperation(key, async () => {
        const snapshot = await readSnapshotFile(identity);
        if (!snapshot || (expectedContent !== undefined && snapshot.content !== expectedContent)) {
          return false;
        }
        await rm(getFilePath(identity), { force: true });
        return true;
      });
    },

    async flush() {
      await flushAll();
    },
  };
}
