import type { ChatMessage } from './types';
import { TIME_SYSTEM_PROMPT } from './prompts';
import {
  MAX_CURRENT_REQUEST_CONTENT_PARTS,
  MAX_CURRENT_REQUEST_MESSAGE_CHARS,
  MAX_REQUEST_HISTORY_CHARS,
  MAX_REQUEST_HISTORY_MESSAGES,
  MAX_REQUEST_MESSAGE_CHARS,
  REQUEST_HISTORY_MESSAGE_OVERHEAD,
  clipContentToBudget,
} from './requestContextLimits';
import { measureRequestJsonLength } from './requestContextJsonBudget';
import {
  sanitizeCurrentRequestTextContent,
  sanitizeRequestTextImageReferences,
} from './requestContextImageSanitizer';
import { formatTimeByOffset } from './requestContextTime';
import { clipTranscriptToBudget } from './requestContextTranscriptBudget';
import { sanitizeHistoryMessage } from './requestContextTranscriptSanitize';
import { normalizeChatRequestContextSnapshot } from './requestContextSnapshot';

export {
  MAX_CURRENT_REQUEST_CONTENT_PARTS,
  MAX_CURRENT_REQUEST_MESSAGE_CHARS,
  formatTimeByOffset,
  measureRequestJsonLength,
  sanitizeCurrentRequestTextContent,
  sanitizeRequestTextImageReferences,
};

export function sanitizeHistory(messages: ChatMessage[]): ChatMessage[] {
  return messages
    .map(sanitizeHistoryMessage)
    .filter((msg) => msg.role !== 'assistant' || msg.content.trim().length > 0);
}

function createSystemMessage(content: string, modelId: string): ChatMessage {
  const now = Date.now();
  return {
    role: 'system',
    content,
    modelId,
    id: `sys-${crypto.randomUUID()}`,
    timestamp: now,
    versions: [{ content, createdAt: now, kind: 'original', subsequentMessages: [] }],
    currentVersionIndex: 0,
  };
}

function estimateHistorySize(messages: ChatMessage[], maxChars: number): number {
  let total = 0;
  for (const message of messages) {
    total += REQUEST_HISTORY_MESSAGE_OVERHEAD;
    if (message.role === 'user' && message.requestContext) {
      total += measureRequestJsonLength(message.requestContext, maxChars - total);
    } else {
      total += message.content.length;
    }
    if (message.apiTranscript) {
      total += measureRequestJsonLength(message.apiTranscript, maxChars - total);
    }

    if (total > maxChars) {
      return maxChars + 1;
    }
  }
  return total;
}

function trimHistoryToBudget(history: ChatMessage[], maxChars: number): ChatMessage[] {
  if (maxChars <= 0 || history.length === 0) {
    return [];
  }

  const boundedHistory: ChatMessage[] = [];
  for (let index = history.length - 1; index >= 0 && boundedHistory.length < MAX_REQUEST_HISTORY_MESSAGES; index -= 1) {
    const message = sanitizeHistoryMessage(history[index]);
    if (message.role === 'assistant' && message.content.trim().length === 0) {
      continue;
    }
    boundedHistory.unshift(message);
  }

  const clippedHistory = boundedHistory
    .map((message) => ({
      ...message,
      content: clipContentToBudget(message.content, MAX_REQUEST_MESSAGE_CHARS),
      requestContext: message.role === 'user'
        ? normalizeChatRequestContextSnapshot(message.requestContext, MAX_REQUEST_MESSAGE_CHARS)
        : undefined,
    }))
    .map((message) => clipTranscriptToBudget(message, MAX_REQUEST_MESSAGE_CHARS));

  while (clippedHistory.length > 1 && estimateHistorySize(clippedHistory, maxChars) > maxChars) {
    clippedHistory.shift();
  }

  if (estimateHistorySize(clippedHistory, maxChars) <= maxChars) {
    return clippedHistory;
  }

  const [latestMessage] = clippedHistory;
  const availableChars = Math.max(maxChars - REQUEST_HISTORY_MESSAGE_OVERHEAD, 0);
  if (latestMessage.role === 'user' && latestMessage.requestContext) {
    const requestContext = normalizeChatRequestContextSnapshot(
      latestMessage.requestContext,
      availableChars,
    );
    if (requestContext && measureRequestJsonLength(requestContext, availableChars) <= availableChars) {
      return [clipTranscriptToBudget({ ...latestMessage, requestContext }, availableChars)];
    }
  }
  const trimmedLatestContent = clipContentToBudget(latestMessage.content, availableChars);

  if (!trimmedLatestContent) {
    return [];
  }

  return [
    clipTranscriptToBudget({
      ...latestMessage,
      content: trimmedLatestContent,
      requestContext: undefined,
    }, availableChars),
  ];
}

interface BuildRequestHistoryOptions {
  history: ChatMessage[];
  modelId: string;
  timezoneOffset: number;
  includeTimeContext: boolean;
  customSystemPrompt?: string;
}

export function buildRequestHistory(options: BuildRequestHistoryOptions): ChatMessage[] {
  const { history, modelId, timezoneOffset, includeTimeContext, customSystemPrompt } = options;
  const systemParts: string[] = [];
  const prompt = customSystemPrompt?.trim();

  if (prompt) {
    systemParts.push(prompt);
  }

  if (includeTimeContext) {
    const timeInfo = formatTimeByOffset(timezoneOffset);
    systemParts.push(TIME_SYSTEM_PROMPT(timeInfo));
  }

  if (systemParts.length === 0) {
    return trimHistoryToBudget(history, MAX_REQUEST_HISTORY_CHARS);
  }

  const mergedSystemMessage = createSystemMessage(
    clipContentToBudget(
      systemParts.join('\n\n'),
      Math.max(MAX_REQUEST_HISTORY_CHARS - REQUEST_HISTORY_MESSAGE_OVERHEAD, 0)
    ),
    modelId
  );
  const availableHistoryChars = Math.max(
    MAX_REQUEST_HISTORY_CHARS - mergedSystemMessage.content.length - REQUEST_HISTORY_MESSAGE_OVERHEAD,
    0
  );
  return [mergedSystemMessage, ...trimHistoryToBudget(history, availableHistoryChars)];
}
