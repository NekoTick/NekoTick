import type { ChatMessage } from '@/lib/ai/types';
import { getStorageAdapter, joinPath } from './adapter';
import { getStorageBasePath } from './basePath';
import { notifyChatStorageAutoSync } from './chatStorageAutoSync';
import {
  DEFAULT_CHAT_SESSION_SAVE_DEBOUNCE_MS,
  MAX_CHAT_SESSION_FLUSH_CONCURRENCY,
  MAX_DELETED_SESSION_JSON_TOMBSTONES,
  MAX_SESSION_MESSAGES_BYTES,
} from './chatStorageLimits';
import { mergeSessionMessages } from './chatStorageMerge';
import { parseSessionMessagesPayload } from './chatStorageNormalization';
import { isWithinSessionMessagesByteLimit, serializeSessionMessages } from './chatStorageSerialization';
import { assertSafeChatSessionId } from './chatStorageSessionId';
import { createPersistenceQueue, type PersistenceQueue } from './persistenceEngine';
import {
  clearChatStorageStatus,
  reportChatStorageSaveFailure,
} from './chatStorageStatus';

export {
  registerChatStorageAutoSyncTrigger,
  setChatStorageAutoSyncTrigger,
} from './chatStorageAutoSync';
export {
  MAX_CHAT_SESSION_FLUSH_CONCURRENCY,
  MAX_SESSION_MESSAGES_BYTES,
  MAX_SESSION_MESSAGE_NODES,
  MAX_SESSION_MESSAGE_SCAN_RECORDS,
} from './chatStorageLimits';
export {
  areWebSearchStatusesEquivalent,
  mergeSessionMessages,
  preserveUnknownPersistedMessages,
} from './chatStorageMerge';
export {
  normalizeSessionMessages,
  parseSessionMessagesPayload,
} from './chatStorageNormalization';
export { serializeSessionMessages } from './chatStorageSerialization';

interface SessionWriteRequest {
  messages: ChatMessage[];
  mergePersisted: boolean;
}

export interface SaveSessionJsonOptions {
  mergePersisted?: boolean;
}

const sessionQueues = new Map<string, PersistenceQueue<SessionWriteRequest>>();
const deletingSessionJsons = new Set<string>();
const deletedSessionJsons = new Set<string>();

function isSessionJsonDeleteBlocked(sessionId: string): boolean {
  return deletingSessionJsons.has(sessionId) || deletedSessionJsons.has(sessionId);
}

function rememberDeletedSessionJson(sessionId: string): void {
  deletedSessionJsons.delete(sessionId);
  deletedSessionJsons.add(sessionId);
  while (deletedSessionJsons.size > MAX_DELETED_SESSION_JSON_TOMBSTONES) {
    const oldest = deletedSessionJsons.values().next().value;
    if (typeof oldest !== 'string') break;
    deletedSessionJsons.delete(oldest);
  }
}

function getSessionQueue(sessionId: string): PersistenceQueue<SessionWriteRequest> {
  assertSafeChatSessionId(sessionId);
  const existing = sessionQueues.get(sessionId);
  if (existing) return existing;

  let queue: PersistenceQueue<SessionWriteRequest>;
  queue = createPersistenceQueue<SessionWriteRequest>({
    debounceMs: DEFAULT_CHAT_SESSION_SAVE_DEBOUNCE_MS,
    write: async (request) => {
      await writeSessionJsonRaw(sessionId, request);
      clearChatStorageStatus(sessionId);
    },
    onError: () => {
      reportChatStorageSaveFailure(sessionId);
    },
    onIdle: () => {
      if (sessionQueues.get(sessionId) === queue) {
        sessionQueues.delete(sessionId);
      }
    },
  });

  sessionQueues.set(sessionId, queue);
  return queue;
}

async function writeSessionJsonRaw(sessionId: string, request: SessionWriteRequest) {
  assertSafeChatSessionId(sessionId);
  const storage = getStorageAdapter();
  const base = await getStorageBasePath();
  const chatRoot = await joinPath(base, '.vlaina', 'chat');
  const dir = await joinPath(chatRoot, 'sessions', sessionId);
  const path = await joinPath(dir, 'messages.json');

  if (!(await storage.exists(chatRoot))) {
    await storage.mkdir(chatRoot, true);
  }
  if (!(await storage.exists(dir))) {
    await storage.mkdir(dir, true);
  }

  let messagesToWrite = request.messages;
  if (request.mergePersisted && await storage.exists(path)) {
    const content = await readSessionJsonContent(path);
    if (content !== null) {
      try {
        const parsed: unknown = JSON.parse(content);
        const persistedMessages = parseSessionMessagesPayload(sessionId, parsed);
        if (persistedMessages) {
          messagesToWrite = mergeSessionMessages(request.messages, persistedMessages, {
            preferredSource: 'incoming',
          });
        }
      } catch {
      }
    }
  }

  await storage.writeFile(path, serializeSessionMessages(sessionId, messagesToWrite));
  notifyChatStorageAutoSync(sessionId);
}

async function getSessionJsonPath(sessionId: string): Promise<string> {
  assertSafeChatSessionId(sessionId);
  const base = await getStorageBasePath();
  return joinPath(base, '.vlaina', 'chat', 'sessions', sessionId, 'messages.json');
}

async function canReadSessionJson(path: string): Promise<boolean> {
  const storage = getStorageAdapter();
  const fileInfo = await storage.stat(path).catch(() => null);
  return (
    Boolean(fileInfo) &&
    fileInfo?.isDirectory !== true &&
    fileInfo?.isFile !== false &&
    (
      typeof fileInfo?.size !== 'number' ||
      (
        Number.isFinite(fileInfo.size) &&
        fileInfo.size >= 0 &&
        fileInfo.size <= MAX_SESSION_MESSAGES_BYTES
      )
    )
  );
}

async function readSessionJsonContent(path: string): Promise<string | null> {
  if (!(await canReadSessionJson(path))) {
    return null;
  }

  const content = await getStorageAdapter().readFile(path, MAX_SESSION_MESSAGES_BYTES).catch(() => null);
  if (content === null) {
    return null;
  }
  return isWithinSessionMessagesByteLimit(content) ? content : null;
}

export async function saveSessionJson(
  sessionId: string,
  messages: ChatMessage[],
  options: SaveSessionJsonOptions = {},
) {
  assertSafeChatSessionId(sessionId);
  if (isSessionJsonDeleteBlocked(sessionId)) return;
  await getSessionQueue(sessionId).saveNow({
    messages,
    mergePersisted: options.mergePersisted !== false,
  });
}

export function scheduleSessionJsonSave(
  sessionId: string,
  messages: ChatMessage[],
  debounceMs = DEFAULT_CHAT_SESSION_SAVE_DEBOUNCE_MS
) {
  assertSafeChatSessionId(sessionId);
  if (isSessionJsonDeleteBlocked(sessionId)) return;
  getSessionQueue(sessionId).schedule({ messages, mergePersisted: true }, { debounceMs });
}

export function cancelSessionJsonSave(sessionId: string) {
  assertSafeChatSessionId(sessionId);
  const queue = sessionQueues.get(sessionId);
  if (!queue) return;
  queue.cancel();
  if (!queue.hasPending()) {
    sessionQueues.delete(sessionId);
  }
}

export function hasPendingSessionJsonSave(sessionId: string): boolean {
  assertSafeChatSessionId(sessionId);
  return sessionQueues.get(sessionId)?.hasPending() ?? false;
}

export async function flushPendingSessionJsonSave(sessionId: string): Promise<void> {
  assertSafeChatSessionId(sessionId);
  const queue = sessionQueues.get(sessionId);
  if (!queue) return;
  await queue.flush();
}

export async function flushPendingSessionJsonSaves(): Promise<void> {
  const queues = Array.from(sessionQueues.values());
  if (queues.length === 0) return;
  const results = await settleWithConcurrencyLimit(
    queues,
    MAX_CHAT_SESSION_FLUSH_CONCURRENCY,
    (queue) => queue.flush(),
  );
  const errors = results
    .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
    .map((result) => result.reason);

  if (errors.length > 0) {
    if (errors.length === 1 && errors[0] instanceof Error) {
      throw errors[0];
    }
    throw new Error(`Failed to flush chat session saves (${errors.length} errors)`);
  }
}

async function settleWithConcurrencyLimit<T>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
): Promise<PromiseSettledResult<void>[]> {
  const results = new Array<PromiseSettledResult<void>>(items.length);
  let nextIndex = 0;

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (nextIndex < items.length) {
        const index = nextIndex;
        nextIndex += 1;
        try {
          await worker(items[index]!);
          results[index] = { status: 'fulfilled', value: undefined };
        } catch (reason) {
          results[index] = { status: 'rejected', reason };
        }
      }
    },
  );

  await Promise.all(workers);
  return results;
}

export async function deleteSessionJson(sessionId: string): Promise<void> {
  assertSafeChatSessionId(sessionId);
  deletingSessionJsons.add(sessionId);
  const queue = sessionQueues.get(sessionId);
  if (queue) {
    queue.cancel();
    try {
      await queue.flush();
    } catch {
    }
    sessionQueues.delete(sessionId);
  }

  const storage = getStorageAdapter();
  const path = await getSessionJsonPath(sessionId);
  let deleted = false;
  try {
    if (await storage.exists(path)) {
      await storage.deleteFile(path);
      if (typeof storage.deleteDir === 'function') {
        await storage.deleteDir(await joinPath(await getStorageBasePath(), '.vlaina', 'chat', 'sessions', sessionId), false).catch(() => undefined);
      }
      notifyChatStorageAutoSync(sessionId);
    }
    deleted = true;
  } finally {
    deletingSessionJsons.delete(sessionId);
    if (deleted) {
      rememberDeletedSessionJson(sessionId);
      clearChatStorageStatus(sessionId);
    }
  }
}

export async function hasSessionJson(sessionId: string): Promise<boolean> {
  assertSafeChatSessionId(sessionId);
  const storage = getStorageAdapter();
  return storage.exists(await getSessionJsonPath(sessionId));
}

export async function loadSessionJson(sessionId: string): Promise<ChatMessage[] | null> {
  assertSafeChatSessionId(sessionId);
  const storage = getStorageAdapter();
  const path = await getSessionJsonPath(sessionId);

  if (await storage.exists(path)) {
    try {
      const content = await readSessionJsonContent(path);
      if (content === null) {
        return null;
      }
      const parsed: unknown = JSON.parse(content);
      return parseSessionMessagesPayload(sessionId, parsed);
    } catch (error) {
      return null;
    }
  }
  return null;
}
