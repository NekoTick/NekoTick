import type { ChatMessage } from '@/lib/ai/types';
import { normalizeApiTranscriptMessages } from '@/lib/ai/apiTranscript';
import { sanitizeWebSearchStatuses } from '@/lib/ai/webSearch/statusMarkup';
import {
  MAX_SESSION_MESSAGE_BRANCH_DEPTH,
  MAX_SESSION_MESSAGE_BRANCH_MESSAGES,
  MAX_SESSION_MESSAGE_CONTENT_CHARS,
  MAX_SESSION_MESSAGE_ID_CHARS,
  MAX_SESSION_MESSAGE_MODEL_ID_CHARS,
  MAX_SESSION_MESSAGE_NODES,
  MAX_SESSION_MESSAGE_SCAN_RECORDS,
  MAX_SESSION_MESSAGE_VERSIONS,
  SESSION_MESSAGES_FILE_VERSION,
} from './chatStorageLimits';
import { extractActiveVersionImageSources } from './chatStorageImageSources';
import { assertSafeChatSessionId } from './chatStorageSessionId';
import { normalizeChatRequestContextSnapshot } from '@/lib/ai/requestContextSnapshot';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeTimestamp(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : Date.now();
}

function normalizeMessageContent(value: unknown, fallback = ''): string {
  const content = typeof value === 'string' ? value : fallback;
  return content.length > MAX_SESSION_MESSAGE_CONTENT_CHARS
    ? content.slice(0, MAX_SESSION_MESSAGE_CONTENT_CHARS)
    : content;
}

interface NormalizeSessionMessagesContext {
  messageNodes: number;
  scannedMessageRecords: number;
  messageIds: Set<string>;
  topLevelMessageIds: Set<string>;
}

function createUniqueMessageId(context: NormalizeSessionMessagesContext): string {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const id = `msg-${crypto.randomUUID()}`;
    if (!context.messageIds.has(id)) {
      return id;
    }
  }
  return `msg-${Date.now()}-${context.messageNodes}-${context.messageIds.size}`;
}

function normalizeMessageId(value: unknown, context: NormalizeSessionMessagesContext, depth: number): string {
  const id = typeof value === 'string'
    ? value.trim().slice(0, MAX_SESSION_MESSAGE_ID_CHARS)
    : '';
  if (
    id &&
    !context.messageIds.has(id) &&
    (depth === 0 || !context.topLevelMessageIds.has(id))
  ) {
    context.messageIds.add(id);
    return id;
  }

  const fallbackId = createUniqueMessageId(context);
  context.messageIds.add(fallbackId);
  return fallbackId;
}

function normalizeMessageVersion(
  value: unknown,
  fallbackContent: string,
  context: NormalizeSessionMessagesContext,
  depth: number,
): ChatMessage['versions'][number] | null {
  if (!isRecord(value)) {
    return null;
  }

  const content = normalizeMessageContent(value.content, fallbackContent);
  const createdAt = normalizeTimestamp(value.createdAt);
  const kind = value.kind;
  if (kind !== 'regeneration' && kind !== 'edit' && kind !== 'original') {
    return null;
  }
  const subsequentMessages = Array.isArray(value.subsequentMessages) && depth < MAX_SESSION_MESSAGE_BRANCH_DEPTH
    ? normalizeSessionMessagesInternal(
        value.subsequentMessages.slice(0, MAX_SESSION_MESSAGE_BRANCH_MESSAGES),
        context,
        depth + 1,
      )
    : [];
  const apiTranscript = normalizeApiTranscriptMessages(value.apiTranscript);
  const webSearchStatuses = sanitizeWebSearchStatuses(value.webSearchStatuses);
  const requestContext = normalizeChatRequestContextSnapshot(value.requestContext);
  return {
    content,
    createdAt,
    kind,
    subsequentMessages,
    ...(apiTranscript ? { apiTranscript } : {}),
    ...(webSearchStatuses.length > 0 ? { webSearchStatuses } : {}),
    ...(requestContext ? { requestContext } : {}),
  };
}

function selectSessionMessageVersionEntries(
  value: unknown,
  currentVersionIndex: number,
): Array<{ index: number; value: unknown }> {
  if (!Array.isArray(value) || value.length === 0) {
    return [];
  }

  const activeIndex = currentVersionIndex >= 0 && currentVersionIndex < value.length
    ? currentVersionIndex
    : 0;
  const keepIndexes = new Set<number>([activeIndex]);
  for (let index = value.length - 1; index >= 0 && keepIndexes.size < MAX_SESSION_MESSAGE_VERSIONS; index -= 1) {
    keepIndexes.add(index);
  }

  return Array.from(keepIndexes)
    .sort((left, right) => left - right)
    .map((index) => ({ index, value: value[index] }));
}

function canRoleUseVersionKind(
  role: ChatMessage['role'],
  kind: ChatMessage['versions'][number]['kind'],
): boolean {
  if (role === 'assistant') {
    return kind === 'original' || kind === 'regeneration';
  }
  if (role === 'user') {
    return kind === 'original' || kind === 'edit';
  }
  return kind === 'original';
}

function normalizeSessionMessage(
  value: unknown,
  context: NormalizeSessionMessagesContext,
  depth: number,
): ChatMessage | null {
  if (!isRecord(value)) {
    return null;
  }

  const role = value.role;
  if (role !== 'user' && role !== 'assistant' && role !== 'system') {
    return null;
  }
  if (context.messageNodes >= MAX_SESSION_MESSAGE_NODES) {
    return null;
  }
  context.messageNodes += 1;

  const content = normalizeMessageContent(value.content);
  const timestamp = normalizeTimestamp(value.timestamp);
  const rawCurrentVersionIndex = typeof value.currentVersionIndex === 'number'
    ? Math.floor(value.currentVersionIndex)
    : 0;
  const versionEntries = selectSessionMessageVersionEntries(value.versions, rawCurrentVersionIndex);
  const normalizedVersionEntries = versionEntries
    .map((entry) => ({
      index: entry.index,
      version: normalizeMessageVersion(entry.value, content, context, depth),
    }))
    .filter((entry): entry is { index: number; version: ChatMessage['versions'][number] } =>
      entry.version !== null && canRoleUseVersionKind(role, entry.version.kind)
    );
  const versions = normalizedVersionEntries.map((entry) => entry.version);
  const candidateVersions: ChatMessage['versions'] = versions.length > 0
    ? versions
    : [{
        content,
        createdAt: timestamp,
        kind: 'original',
        subsequentMessages: [],
      }];
  const selectedCurrentVersionIndex = normalizedVersionEntries.findIndex(
    (entry) => entry.index === rawCurrentVersionIndex,
  );
  const normalizedVersions = candidateVersions;
  const currentVersionIndex = selectedCurrentVersionIndex >= 0 ? selectedCurrentVersionIndex : 0;
  const activeVersion = normalizedVersions[currentVersionIndex] ?? normalizedVersions[0]!;
  const activeContent = activeVersion.content;
  const topLevelMatchesActiveVersion = content === activeContent;
  const normalizedTopLevelApiTranscript = normalizeApiTranscriptMessages(value.apiTranscript);
  const normalizedTopLevelWebSearchStatuses = sanitizeWebSearchStatuses(value.webSearchStatuses);
  const normalizedTopLevelRequestContext = normalizeChatRequestContextSnapshot(value.requestContext);
  const apiTranscript = activeVersion.apiTranscript
    ?? (topLevelMatchesActiveVersion ? normalizedTopLevelApiTranscript : undefined);
  const webSearchStatuses = activeVersion.webSearchStatuses
    ?? (topLevelMatchesActiveVersion && normalizedTopLevelWebSearchStatuses.length > 0
      ? normalizedTopLevelWebSearchStatuses
      : undefined);
  const requestContext = activeVersion.requestContext
    ?? (topLevelMatchesActiveVersion ? normalizedTopLevelRequestContext : undefined);

  if (apiTranscript && !normalizedVersions[currentVersionIndex]?.apiTranscript) {
    normalizedVersions[currentVersionIndex] = {
      ...normalizedVersions[currentVersionIndex],
      apiTranscript,
    };
  }
  if (webSearchStatuses && !normalizedVersions[currentVersionIndex]?.webSearchStatuses) {
    normalizedVersions[currentVersionIndex] = {
      ...normalizedVersions[currentVersionIndex],
      webSearchStatuses,
    };
  }
  if (requestContext && !normalizedVersions[currentVersionIndex]?.requestContext) {
    normalizedVersions[currentVersionIndex] = {
      ...normalizedVersions[currentVersionIndex],
      requestContext,
    };
  }
  const activeVersionImageSources = extractActiveVersionImageSources(role, activeContent);

  return {
    id: normalizeMessageId(value.id, context, depth),
    role,
    content: activeContent,
    ...(apiTranscript ? { apiTranscript } : {}),
    ...(webSearchStatuses ? { webSearchStatuses } : {}),
    ...(requestContext ? { requestContext } : {}),
    ...(activeVersionImageSources ? { imageSources: activeVersionImageSources } : {}),
    modelId: typeof value.modelId === 'string'
      ? value.modelId.slice(0, MAX_SESSION_MESSAGE_MODEL_ID_CHARS)
      : '',
    timestamp,
    versions: normalizedVersions,
    currentVersionIndex,
  };
}

function normalizeSessionMessagesInternal(
  value: unknown,
  context: NormalizeSessionMessagesContext,
  depth: number,
): ChatMessage[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const normalized: ChatMessage[] = [];
  for (const item of value) {
    if (
      context.scannedMessageRecords >= MAX_SESSION_MESSAGE_SCAN_RECORDS ||
      context.messageNodes >= MAX_SESSION_MESSAGE_NODES
    ) {
      break;
    }
    context.scannedMessageRecords += 1;

    const message = normalizeSessionMessage(item, context, depth);
    if (!message) {
      continue;
    }

    normalized.push(message);
  }

  return normalized;
}

export function normalizeSessionMessages(value: unknown): ChatMessage[] {
  const topLevelMessageIds = new Set<string>();
  if (Array.isArray(value)) {
    const scanLimit = Math.min(value.length, MAX_SESSION_MESSAGE_SCAN_RECORDS);
    for (let index = 0; index < scanLimit; index += 1) {
      const item = value[index];
      if (!isRecord(item)) {
        continue;
      }
      const id = typeof item.id === 'string'
        ? item.id.trim().slice(0, MAX_SESSION_MESSAGE_ID_CHARS)
        : '';
      if (id && !topLevelMessageIds.has(id)) {
        topLevelMessageIds.add(id);
      }
    }
  }
  return normalizeSessionMessagesInternal(value, {
    messageNodes: 0,
    scannedMessageRecords: 0,
    messageIds: new Set(),
    topLevelMessageIds,
  }, 0);
}

export function parseSessionMessagesPayload(
  expectedSessionId: string,
  value: unknown,
): ChatMessage[] | null {
  assertSafeChatSessionId(expectedSessionId);
  if (!isRecord(value)) {
    return null;
  }

  if (value.version !== SESSION_MESSAGES_FILE_VERSION) {
    return null;
  }

  if (value.sessionId !== expectedSessionId) {
    return null;
  }

  if (!Array.isArray(value.messages)) {
    return null;
  }

  return normalizeSessionMessages(value.messages);
}
