import { shouldPersistSession } from '@/lib/ai/temporaryChat';
import {
  flushPendingSessionJsonSave,
  hasPendingSessionJsonSave,
  loadSessionJson,
  areWebSearchStatusesEquivalent,
  mergeSessionMessages,
} from '@/lib/storage/chatStorage';
import type { ChatMessage } from '@/lib/ai/types';
import { useUnifiedStore } from '../unified/useUnifiedStore';

export const MAX_SESSION_CONSISTENCY_COMPARE_NODES = 20_000;

function areMessagesEqual(left: ChatMessage[], right: ChatMessage[]) {
  if (left === right) return true;
  if (left.length !== right.length) return false;

  let comparedNodes = 0;
  const compareStrings = (a: string | undefined, b: string | undefined) => (a ?? '') === (b ?? '');
  const consumeNode = () => {
    comparedNodes += 1;
    return comparedNodes <= MAX_SESSION_CONSISTENCY_COMPARE_NODES;
  };

  const areTranscriptsEqual = (
    a: ChatMessage['apiTranscript'] | undefined,
    b: ChatMessage['apiTranscript'] | undefined,
  ) => {
    if (a === b) return true;
    if (!a || !b || a.length !== b.length) return false;

    for (let index = 0; index < a.length; index += 1) {
      if (!consumeNode()) return false;
      const leftMessage = a[index]!;
      const rightMessage = b[index]!;
      if (
        !compareStrings(leftMessage.role, rightMessage.role) ||
        !compareStrings(leftMessage.reasoning_content, rightMessage.reasoning_content) ||
        !compareStrings(leftMessage.tool_call_id, rightMessage.tool_call_id) ||
        !compareStrings(leftMessage.name, rightMessage.name)
      ) {
        return false;
      }
      if (!areTranscriptContentsEqual(leftMessage.content, rightMessage.content)) return false;
      const leftCalls = leftMessage.tool_calls;
      const rightCalls = rightMessage.tool_calls;
      if (leftCalls === rightCalls) continue;
      if (!leftCalls || !rightCalls || leftCalls.length !== rightCalls.length) return false;
      for (let callIndex = 0; callIndex < leftCalls.length; callIndex += 1) {
        if (!consumeNode()) return false;
        const leftCall = leftCalls[callIndex]!;
        const rightCall = rightCalls[callIndex]!;
        if (
          leftCall.id !== rightCall.id ||
          leftCall.type !== rightCall.type ||
          leftCall.function.name !== rightCall.function.name ||
          leftCall.function.arguments !== rightCall.function.arguments
        ) {
          return false;
        }
      }
    }
    return true;
  };

  const areVersionsEqual = (
    a: ChatMessage['versions'],
    b: ChatMessage['versions'],
  ) => {
    if (a === b) return true;
    if (a.length !== b.length) return false;

    for (let index = 0; index < a.length; index += 1) {
      if (!consumeNode()) return false;
      const leftVersion = a[index]!;
      const rightVersion = b[index]!;
      if (
        leftVersion.content !== rightVersion.content ||
        leftVersion.createdAt !== rightVersion.createdAt ||
        leftVersion.kind !== rightVersion.kind ||
        !areWebSearchStatusesEquivalent(leftVersion.webSearchStatuses, rightVersion.webSearchStatuses) ||
        !areRequestContextsEqual(leftVersion.requestContext, rightVersion.requestContext) ||
        !areTranscriptsEqual(leftVersion.apiTranscript, rightVersion.apiTranscript) ||
        !areMessagesEqualInternal(leftVersion.subsequentMessages, rightVersion.subsequentMessages)
      ) {
        return false;
      }
    }
    return true;
  };

  const areMessagesEqualInternal = (a: ChatMessage[], b: ChatMessage[]): boolean => {
    if (a === b) return true;
    if (a.length !== b.length) return false;

    for (let index = 0; index < a.length; index += 1) {
      if (!consumeNode()) return false;
      const leftMessage = a[index]!;
      const rightMessage = b[index]!;
      if (
        leftMessage.id !== rightMessage.id ||
        leftMessage.role !== rightMessage.role ||
        leftMessage.content !== rightMessage.content ||
        leftMessage.modelId !== rightMessage.modelId ||
        leftMessage.timestamp !== rightMessage.timestamp ||
        leftMessage.currentVersionIndex !== rightMessage.currentVersionIndex ||
        !areStringArraysEqual(leftMessage.imageSources, rightMessage.imageSources) ||
        !areWebSearchStatusesEquivalent(leftMessage.webSearchStatuses, rightMessage.webSearchStatuses) ||
        !areRequestContextsEqual(leftMessage.requestContext, rightMessage.requestContext) ||
        !areTranscriptsEqual(leftMessage.apiTranscript, rightMessage.apiTranscript) ||
        !areVersionsEqual(leftMessage.versions, rightMessage.versions)
      ) {
        return false;
      }
    }
    return true;
  };

  return areMessagesEqualInternal(left, right);
}

function areRequestContextsEqual(
  left: ChatMessage['requestContext'],
  right: ChatMessage['requestContext'],
): boolean {
  if (left === right) return true;
  if (!left || !right || left.text !== right.text) return false;
  return areStringArraysEqual(left.imageSources, right.imageSources)
    && areStringArraysEqual(left.attachmentSources, right.attachmentSources);
}

function areStringArraysEqual(left: string[] | undefined, right: string[] | undefined): boolean {
  if (left === right) return true;
  if (!left || !right || left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function areTranscriptContentsEqual(
  left: NonNullable<ChatMessage['apiTranscript']>[number]['content'],
  right: NonNullable<ChatMessage['apiTranscript']>[number]['content'],
): boolean {
  if (left === right) return true;
  if (left == null || right == null) return left === right;
  if (typeof left === 'string' || typeof right === 'string') return left === right;
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    const leftPart = left[index]!;
    const rightPart = right[index]!;
    if (leftPart.type !== rightPart.type) return false;
    if (leftPart.type === 'text' && rightPart.type === 'text') {
      if (leftPart.text !== rightPart.text) return false;
      continue;
    }
    if (leftPart.type === 'image_url' && rightPart.type === 'image_url') {
      if (
        leftPart.image_url.url !== rightPart.image_url.url ||
        (leftPart.image_url.detail ?? '') !== (rightPart.image_url.detail ?? '')
      ) {
        return false;
      }
      continue;
    }
    return false;
  }
  return true;
}

async function syncSessionMessagesFromDisk(
  sessionId: string,
  flushPendingWrites: boolean,
): Promise<ChatMessage[]> {
  const initialState = useUnifiedStore.getState();
  const initialAI = initialState.data.ai;
  if (!initialAI || !shouldPersistSession(initialAI, sessionId)) {
    return initialAI?.messages[sessionId] || [];
  }

  if (flushPendingWrites) {
    try {
      await flushPendingSessionJsonSave(sessionId);
    } catch {
    }
  }

  const persistedMessages = await loadSessionJson(sessionId);
  const latestState = useUnifiedStore.getState();
  const latestAI = latestState.data.ai;
  if (!latestAI || !shouldPersistSession(latestAI, sessionId)) {
    return [];
  }

  const currentMessages = latestAI.messages[sessionId] || [];
  if (!persistedMessages) {
    return currentMessages;
  }

  const hasPendingLocalWrite = hasPendingSessionJsonSave(sessionId);
  const nextMessages = mergeSessionMessages(currentMessages, persistedMessages, {
    preferredSource: hasPendingLocalWrite ? 'incoming' : 'persisted',
  });
  if (areMessagesEqual(nextMessages, currentMessages)) {
    return currentMessages;
  }

  latestState.updateAIData({
    messages: {
      ...latestAI.messages,
      [sessionId]: nextMessages,
    },
  }, true);

  return nextMessages;
}

export async function hydrateSessionMessagesFromDisk(sessionId: string): Promise<ChatMessage[]> {
  return syncSessionMessagesFromDisk(sessionId, true);
}

export async function reloadSessionMessagesFromDisk(sessionId: string): Promise<ChatMessage[]> {
  return syncSessionMessagesFromDisk(sessionId, false);
}
