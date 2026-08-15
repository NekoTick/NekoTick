import { getStorageAdapter, joinPath } from '@/lib/storage/adapter';
import type { ChatSession } from '@/lib/ai/types';
import { isTemporarySession, isTemporarySessionId } from '@/lib/ai/temporaryChat';
import { isSafeChatSessionId, isSafeProviderId } from './unifiedStorageAI';
import {
  AI_SESSIONS_FILE_VERSION,
  MAX_AI_CUSTOM_SYSTEM_PROMPT_CHARS,
  MAX_AI_ID_LIST_ENTRIES,
  MAX_AI_PROVIDERS,
  MAX_AI_SESSION_METADATA_SCAN_RECORDS,
  MAX_AI_SESSION_MODEL_ID_CHARS,
  MAX_AI_SESSION_RECORDS,
  MAX_AI_SESSION_TITLE_CHARS,
  MAX_AI_SESSIONS_BYTES,
  type AISessionsFile,
  type AISessionsFileData,
} from './unifiedStorageSaveTypes';
import {
  isRecord,
  isSerializedWithinLimit,
  normalizeBoundedIdList,
  normalizeBoundedString,
  readBoundedTextFile,
  trimArrayForSerializedLimit,
} from './unifiedStorageCommon';

export function normalizeChatSessionMetadata(value: unknown): ChatSession | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = typeof value.id === 'string' ? value.id.trim() : '';
  if (!isSafeChatSessionId(id) || isTemporarySessionId(id)) {
    return null;
  }

  return {
    id,
    title: normalizeBoundedString(value.title, MAX_AI_SESSION_TITLE_CHARS) || 'New Chat',
    modelId: normalizeBoundedString(value.modelId, MAX_AI_SESSION_MODEL_ID_CHARS),
    isPinned: value.isPinned === true,
    createdAt: typeof value.createdAt === 'number' && Number.isFinite(value.createdAt)
      ? value.createdAt
      : Date.now(),
    updatedAt: typeof value.updatedAt === 'number' && Number.isFinite(value.updatedAt)
      ? value.updatedAt
      : Date.now(),
  };
}

export function normalizeChatSessionMetadataList(value: unknown): ChatSession[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const sessions: ChatSession[] = [];
  const seenIds = new Set<string>();
  const scanLimit = Math.min(value.length, MAX_AI_SESSION_METADATA_SCAN_RECORDS);
  for (let index = 0; index < scanLimit && sessions.length < MAX_AI_SESSION_RECORDS; index += 1) {
    const session = normalizeChatSessionMetadata(value[index]);
    if (!session || seenIds.has(session.id)) {
      continue;
    }
    seenIds.add(session.id);
    sessions.push(session);
  }
  return sessions;
}

export function parseAISessionsFile(value: unknown): AISessionsFileData | null {
  if (!isRecord(value) || value.version !== AI_SESSIONS_FILE_VERSION || !isRecord(value.data)) {
    return null;
  }

  const data = value.data;
  const currentSessionId = typeof data.currentSessionId === 'string' && isSafeChatSessionId(data.currentSessionId)
    ? data.currentSessionId
    : null;

  return {
    sessions: normalizeChatSessionMetadataList(data.sessions),
    selectedModelId: typeof data.selectedModelId === 'string'
      ? normalizeBoundedString(data.selectedModelId, MAX_AI_SESSION_MODEL_ID_CHARS)
      : null,
    unreadSessionIds: normalizeBoundedIdList(data.unreadSessionIds, isSafeChatSessionId, MAX_AI_ID_LIST_ENTRIES),
    currentSessionId,
    temporaryChatEnabled: false,
    customSystemPrompt: normalizeBoundedString(data.customSystemPrompt, MAX_AI_CUSTOM_SYSTEM_PROMPT_CHARS),
    includeTimeContext: data.includeTimeContext !== false,
    webSearchEnabled: data.webSearchEnabled === true,
    providerIds: normalizeBoundedIdList(data.providerIds, isSafeProviderId, MAX_AI_PROVIDERS),
    deletedSessionIds: normalizeBoundedIdList(data.deletedSessionIds, isSafeChatSessionId, MAX_AI_ID_LIST_ENTRIES),
    deletedProviderIds: normalizeBoundedIdList(data.deletedProviderIds, isSafeProviderId, MAX_AI_ID_LIST_ENTRIES),
  };
}

export function serializeAISessionsFile(data: AISessionsFileData): string {
  const payload: AISessionsFile = {
    version: AI_SESSIONS_FILE_VERSION,
    updatedAt: Date.now(),
    data,
  };
  return JSON.stringify(payload, null, 2);
}

export function serializeBoundedAISessionsFile(data: AISessionsFileData): string {
  let sessions = normalizeChatSessionMetadataList(data.sessions);
  let unreadSessionIds = normalizeBoundedIdList(data.unreadSessionIds, isSafeChatSessionId, MAX_AI_ID_LIST_ENTRIES);
  let deletedSessionIds = normalizeBoundedIdList(data.deletedSessionIds, isSafeChatSessionId, MAX_AI_ID_LIST_ENTRIES);
  let deletedProviderIds = normalizeBoundedIdList(data.deletedProviderIds, isSafeProviderId, MAX_AI_ID_LIST_ENTRIES);

  const serialize = () => serializeAISessionsFile({
    ...data,
    sessions,
    unreadSessionIds,
    deletedSessionIds,
    deletedProviderIds,
    customSystemPrompt: normalizeBoundedString(data.customSystemPrompt, MAX_AI_CUSTOM_SYSTEM_PROMPT_CHARS),
  });

  let payload = serialize();
  if (isSerializedWithinLimit(payload, MAX_AI_SESSIONS_BYTES)) {
    return payload;
  }

  sessions = trimArrayForSerializedLimit(sessions, MAX_AI_SESSIONS_BYTES, (nextSessions) => {
    sessions = nextSessions;
    return serialize();
  });
  payload = serialize();
  if (isSerializedWithinLimit(payload, MAX_AI_SESSIONS_BYTES)) {
    return payload;
  }

  unreadSessionIds = trimArrayForSerializedLimit(unreadSessionIds, MAX_AI_SESSIONS_BYTES, (nextIds) => {
    unreadSessionIds = nextIds;
    return serialize();
  });
  deletedSessionIds = trimArrayForSerializedLimit(deletedSessionIds, MAX_AI_SESSIONS_BYTES, (nextIds) => {
    deletedSessionIds = nextIds;
    return serialize();
  });
  deletedProviderIds = trimArrayForSerializedLimit(deletedProviderIds, MAX_AI_SESSIONS_BYTES, (nextIds) => {
    deletedProviderIds = nextIds;
    return serialize();
  });
  return serialize();
}

export async function readExistingAISessionsFile(
  storage: ReturnType<typeof getStorageAdapter>,
  sessionsPath: string,
): Promise<AISessionsFileData | null> {
  if (!(await storage.exists(sessionsPath))) {
    return null;
  }

  try {
    const content = await readBoundedTextFile(storage, sessionsPath, MAX_AI_SESSIONS_BYTES);
    if (content === null) {
      return null;
    }
    const parsed: unknown = JSON.parse(content);
    return parseAISessionsFile(parsed);
  } catch {
    return null;
  }
}

export async function sessionMessageFileExists(sessionFilesDir: string, sessionId: string): Promise<boolean> {
  if (!isSafeChatSessionId(sessionId)) {
    return false;
  }

  const storage = getStorageAdapter();
  const path = await joinPath(sessionFilesDir, sessionId, 'messages.json');
  return storage.exists(path).catch(() => false);
}

export async function mergeSessionsForSafeSave(
  incomingSessions: ChatSession[],
  existingSessionsData: AISessionsFileData | null,
  sessionFilesDir: string,
): Promise<{ sessions: ChatSession[]; deletedSessionIds: string[] }> {
  const normalizedIncomingSessions = normalizeChatSessionMetadataList(incomingSessions);
  const incomingById = new Map(normalizedIncomingSessions.map((session) => [session.id, session]));
  const existingSessions = (existingSessionsData?.sessions || []).filter((session) => !isTemporarySession(session));
  const deletedSessionIds = new Set(existingSessionsData?.deletedSessionIds || []);

  for (const session of existingSessions) {
    if (!incomingById.has(session.id) && !(await sessionMessageFileExists(sessionFilesDir, session.id))) {
      deletedSessionIds.add(session.id);
    }
  }

  const mergedById = new Map<string, ChatSession>();
  for (const session of normalizedIncomingSessions) {
    if (deletedSessionIds.has(session.id)) {
      continue;
    }

    const existedOnDisk = existingSessions.some((existing) => existing.id === session.id);
    if (existedOnDisk && !(await sessionMessageFileExists(sessionFilesDir, session.id))) {
      deletedSessionIds.add(session.id);
      continue;
    }

    mergedById.set(session.id, session);
  }

  for (const session of existingSessions) {
    if (mergedById.has(session.id) || deletedSessionIds.has(session.id)) {
      continue;
    }

    if (await sessionMessageFileExists(sessionFilesDir, session.id)) {
      mergedById.set(session.id, session);
    }
  }

  return {
    sessions: Array.from(mergedById.values()).sort((a, b) => b.updatedAt - a.updatedAt),
    deletedSessionIds: Array.from(deletedSessionIds),
  };
}
