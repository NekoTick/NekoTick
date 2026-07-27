import type { ApiTranscriptMessage, ChatMessage, ChatMessageContent, ChatMessageContentPart } from '@/lib/ai/types';
import { normalizeApiTranscriptMessages } from '@/lib/ai/apiTranscript';
import { sanitizeWebSearchStatuses } from '@/lib/ai/webSearch/statusMarkup';
import {
  MAX_SESSION_MESSAGE_BRANCH_DEPTH,
  MAX_SESSION_MESSAGE_BRANCH_MESSAGES,
  MAX_SESSION_MESSAGE_NODES,
  MAX_SESSION_MESSAGE_VERSIONS,
} from './chatStorageLimits';

function collectMessageIds(messages: ChatMessage[]): Set<string> {
  const ids = new Set<string>();
  const stack: Array<{ depth: number; messages: ChatMessage[] }> = [{ depth: 0, messages }];
  let visited = 0;

  while (stack.length > 0 && visited < MAX_SESSION_MESSAGE_NODES) {
    const frame = stack.pop()!;
    for (const message of frame.messages) {
      if (visited >= MAX_SESSION_MESSAGE_NODES) {
        break;
      }
      visited += 1;
      ids.add(message.id);

      if (frame.depth >= MAX_SESSION_MESSAGE_BRANCH_DEPTH) {
        continue;
      }

      for (const version of (message.versions || []).slice(0, MAX_SESSION_MESSAGE_VERSIONS)) {
        if (Array.isArray(version.subsequentMessages) && version.subsequentMessages.length > 0) {
          stack.push({
            depth: frame.depth + 1,
            messages: version.subsequentMessages.slice(0, MAX_SESSION_MESSAGE_BRANCH_MESSAGES),
          });
        }
      }
    }
  }

  return ids;
}

export function preserveUnknownPersistedMessages(
  incomingMessages: ChatMessage[],
  persistedMessages: ChatMessage[] | null,
): ChatMessage[] {
  return mergeSessionMessages(incomingMessages, persistedMessages, {
    preferredSource: 'incoming',
  });
}

function createVersionFromMessage(message: ChatMessage): ChatMessage['versions'][number] {
  return {
    content: message.content || '',
    createdAt: message.timestamp || Date.now(),
    kind: 'original',
    subsequentMessages: [],
    ...(message.apiTranscript ? { apiTranscript: message.apiTranscript } : {}),
    ...(message.webSearchStatuses ? { webSearchStatuses: message.webSearchStatuses } : {}),
    ...(message.requestContext ? { requestContext: message.requestContext } : {}),
  };
}

function areApiTranscriptsEquivalent(
  left: ChatMessage['versions'][number]['apiTranscript'] | undefined,
  right: ChatMessage['versions'][number]['apiTranscript'] | undefined,
): boolean {
  const normalizedLeft = normalizeApiTranscriptMessages(left);
  const normalizedRight = normalizeApiTranscriptMessages(right);
  if (!normalizedLeft && !normalizedRight) {
    return true;
  }
  if (!normalizedLeft || !normalizedRight || normalizedLeft.length !== normalizedRight.length) {
    return false;
  }

  for (let index = 0; index < normalizedLeft.length; index += 1) {
    if (!areApiTranscriptMessagesEquivalent(normalizedLeft[index], normalizedRight[index])) {
      return false;
    }
  }
  return true;
}

function areApiTranscriptMessagesEquivalent(left: ApiTranscriptMessage, right: ApiTranscriptMessage): boolean {
  return (
    left.role === right.role &&
    areApiTranscriptContentsEquivalent(left.content, right.content) &&
    (left.reasoning_content ?? '') === (right.reasoning_content ?? '') &&
    (left.tool_call_id ?? '') === (right.tool_call_id ?? '') &&
    (left.name ?? '') === (right.name ?? '') &&
    areApiTranscriptToolCallsEquivalent(left.tool_calls, right.tool_calls)
  );
}

function areApiTranscriptContentsEquivalent(
  left: ChatMessageContent | null | undefined,
  right: ChatMessageContent | null | undefined,
): boolean {
  if (left === right) return true;
  if (left == null || right == null) return left === right;
  if (typeof left === 'string' || typeof right === 'string') return left === right;
  if (left.length !== right.length) return false;

  for (let index = 0; index < left.length; index += 1) {
    if (!areApiTranscriptContentPartsEquivalent(left[index], right[index])) {
      return false;
    }
  }
  return true;
}

function areApiTranscriptContentPartsEquivalent(
  left: ChatMessageContentPart,
  right: ChatMessageContentPart,
): boolean {
  if (left.type !== right.type) return false;
  if (left.type === 'text' && right.type === 'text') {
    return left.text === right.text;
  }
  if (left.type === 'image_url' && right.type === 'image_url') {
    return (
      left.image_url.url === right.image_url.url &&
      (left.image_url.detail ?? '') === (right.image_url.detail ?? '')
    );
  }
  return false;
}

function areApiTranscriptToolCallsEquivalent(
  left: ApiTranscriptMessage['tool_calls'] | undefined,
  right: ApiTranscriptMessage['tool_calls'] | undefined,
): boolean {
  if (!left && !right) return true;
  if (!left || !right || left.length !== right.length) return false;

  for (let index = 0; index < left.length; index += 1) {
    const leftCall = left[index];
    const rightCall = right[index];
    if (
      leftCall.id !== rightCall.id ||
      leftCall.type !== rightCall.type ||
      leftCall.function.name !== rightCall.function.name ||
      leftCall.function.arguments !== rightCall.function.arguments
    ) {
      return false;
    }
  }
  return true;
}

function areSanitizedValuesEquivalent(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (left === null || right === null || typeof left !== 'object' || typeof right !== 'object') {
    return false;
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
    return left.every((value, index) => areSanitizedValuesEquivalent(value, right[index]));
  }

  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const leftKeys = Object.keys(leftRecord);
  const rightKeys = Object.keys(rightRecord);
  return leftKeys.length === rightKeys.length && leftKeys.every(
    (key) => Object.hasOwn(rightRecord, key) && areSanitizedValuesEquivalent(leftRecord[key], rightRecord[key]),
  );
}

export function areWebSearchStatusesEquivalent(
  left: ChatMessage['versions'][number]['webSearchStatuses'],
  right: ChatMessage['versions'][number]['webSearchStatuses'],
): boolean {
  return areSanitizedValuesEquivalent(
    sanitizeWebSearchStatuses(left),
    sanitizeWebSearchStatuses(right),
  );
}

function isSameMessageVersion(
  left: ChatMessage['versions'][number],
  right: ChatMessage['versions'][number],
): boolean {
  return (
    left.content === right.content &&
    left.createdAt === right.createdAt &&
    left.kind === right.kind &&
    (!Array.isArray(left.subsequentMessages) || left.subsequentMessages.length === 0) &&
    (!Array.isArray(right.subsequentMessages) || right.subsequentMessages.length === 0) &&
    areApiTranscriptsEquivalent(left.apiTranscript, right.apiTranscript) &&
    areWebSearchStatusesEquivalent(left.webSearchStatuses, right.webSearchStatuses) &&
    areSanitizedValuesEquivalent(left.requestContext, right.requestContext)
  );
}

function getNormalizedMessageVersions(message: ChatMessage): ChatMessage['versions'] {
  return Array.isArray(message.versions) && message.versions.length > 0
    ? message.versions.slice(0, MAX_SESSION_MESSAGE_VERSIONS)
    : [createVersionFromMessage(message)];
}

function mergeMatchingMessages(preferred: ChatMessage): ChatMessage {
  const versions = getNormalizedMessageVersions(preferred);
  const preferredVersion = createVersionFromMessage(preferred);
  const preferredVersionIndex = versions.findIndex((version) => isSameMessageVersion(version, preferredVersion));

  return {
    ...preferred,
    versions,
    currentVersionIndex: preferredVersionIndex >= 0
      ? preferredVersionIndex
      : Math.min(Math.max(preferred.currentVersionIndex ?? 0, 0), Math.max(versions.length - 1, 0)),
  };
}

export function mergeSessionMessages(
  incomingMessages: ChatMessage[],
  persistedMessages: ChatMessage[] | null,
  options: { preferredSource: 'incoming' | 'persisted' } = { preferredSource: 'incoming' },
): ChatMessage[] {
  if (!persistedMessages || persistedMessages.length === 0) {
    return incomingMessages;
  }

  const incomingToMerge = incomingMessages.slice(0, MAX_SESSION_MESSAGE_NODES);
  const persistedToMerge = persistedMessages.slice(0, MAX_SESSION_MESSAGE_NODES);
  const incomingById = new Map(incomingToMerge.map((message) => [message.id, message]));
  const persistedById = new Map(persistedToMerge.map((message) => [message.id, message]));
  const incomingIds = collectMessageIds(incomingToMerge);
  const mergedById = new Map<string, ChatMessage>();

  for (const incoming of incomingToMerge) {
    const persisted = persistedById.get(incoming.id);
    mergedById.set(
      incoming.id,
      persisted
        ? mergeMatchingMessages(options.preferredSource === 'persisted' ? persisted : incoming)
        : incoming
    );
  }

  for (const persisted of persistedToMerge) {
    if (incomingIds.has(persisted.id)) {
      continue;
    }
    if (mergedById.has(persisted.id)) {
      continue;
    }
    const incoming = incomingById.get(persisted.id);
    if (incoming) {
      continue;
    }
    mergedById.set(persisted.id, persisted);
  }

  return [...mergedById.values()];
}
