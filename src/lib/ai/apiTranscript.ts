import type { ApiTranscriptMessage, ChatMessageContent, ChatMessageContentPart } from './types';
import { normalizeRenderableImageSrc } from '@/lib/markdown/renderableImagePolicy';

export const MAX_API_TRANSCRIPT_MESSAGES = 64;
export const MAX_API_TRANSCRIPT_STRING_CHARS = 20000;
const MAX_API_TRANSCRIPT_CONTENT_PARTS = 64;
const MAX_API_TRANSCRIPT_TOOL_CALLS = 32;
const COMPUTER_COMMAND_RESULT_KIND = 'vlaina-computer-command';
const SAFE_UNPARSEABLE_COMPUTER_COMMAND_RESULT = JSON.stringify({
  kind: COMPUTER_COMMAND_RESULT_KIND,
  version: 1,
  phase: 'failed',
  stderr: 'The local command result could not be safely replayed.',
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function clipString(value: string): string {
  return value.length > MAX_API_TRANSCRIPT_STRING_CHARS
    ? value.slice(0, MAX_API_TRANSCRIPT_STRING_CHARS)
    : value;
}

function normalizeApiTranscriptImageUrl(value: string): string | null {
  const url = normalizeRenderableImageSrc(clipString(value));
  if (!url) {
    return null;
  }

  const normalized = url.toLowerCase();
  return normalized.startsWith('http://') ||
    normalized.startsWith('https://') ||
    normalized.startsWith('data:')
    ? url
    : null;
}

function normalizeContentPart(value: unknown): ChatMessageContentPart | null {
  if (!isRecord(value)) return null;

  if (value.type === 'text' && typeof value.text === 'string') {
    return { type: 'text', text: clipString(value.text) };
  }

  if (value.type === 'image_url' && isRecord(value.image_url) && typeof value.image_url.url === 'string') {
    const url = normalizeApiTranscriptImageUrl(value.image_url.url);
    if (!url) {
      return null;
    }
    const detail = value.image_url.detail;
    return {
      type: 'image_url',
      image_url: {
        url,
        ...(detail === 'auto' || detail === 'low' || detail === 'high' ? { detail } : {}),
      },
    };
  }

  return null;
}

function normalizeContent(value: unknown): ChatMessageContent | null | undefined {
  if (typeof value === 'string') {
    return clipString(value);
  }

  if (value === null) {
    return null;
  }

  if (!Array.isArray(value)) {
    return undefined;
  }

  const parts = value
    .slice(0, MAX_API_TRANSCRIPT_CONTENT_PARTS)
    .map(normalizeContentPart)
    .filter((part): part is ChatMessageContentPart => part !== null);
  return parts.length > 0 ? parts : undefined;
}

function normalizeApiTranscriptToolCall(toolCall: unknown): NonNullable<ApiTranscriptMessage['tool_calls']>[number] | null {
  if (!isRecord(toolCall) || !isRecord(toolCall.function)) return null;
  if (
    typeof toolCall.id !== 'string' ||
    toolCall.id.length === 0 ||
    toolCall.type !== 'function' ||
    typeof toolCall.function.name !== 'string' ||
    toolCall.function.name.length === 0 ||
    typeof toolCall.function.arguments !== 'string'
  ) {
    return null;
  }

  return {
    id: clipString(toolCall.id),
    type: 'function',
    function: {
      name: clipString(toolCall.function.name),
      arguments: clipString(toolCall.function.arguments),
    },
  };
}

export function normalizeApiTranscriptMessage(value: unknown): ApiTranscriptMessage | null {
  if (!isRecord(value)) {
    return null;
  }

  const { role } = value;
  if (role !== 'system' && role !== 'user' && role !== 'assistant' && role !== 'tool') {
    return null;
  }

  const normalized: ApiTranscriptMessage = { role };
  if ('content' in value) {
    normalized.content = normalizeContent(value.content) ?? null;
  }
  if (typeof value.reasoning_content === 'string' && value.reasoning_content.length > 0) {
    normalized.reasoning_content = clipString(value.reasoning_content);
  }

  const toolCalls = Array.isArray(value.tool_calls)
    ? value.tool_calls
        .slice(0, MAX_API_TRANSCRIPT_TOOL_CALLS)
        .map(normalizeApiTranscriptToolCall)
        .filter((toolCall): toolCall is NonNullable<ApiTranscriptMessage['tool_calls']>[number] => toolCall !== null)
    : [];
  if (toolCalls.length > 0) {
    normalized.tool_calls = toolCalls;
  }

  if (typeof value.tool_call_id === 'string' && value.tool_call_id.length > 0) {
    normalized.tool_call_id = clipString(value.tool_call_id);
  }
  if (typeof value.name === 'string' && value.name.length > 0) {
    normalized.name = clipString(value.name);
  }

  if ((normalized.role === 'system' || normalized.role === 'user') && normalized.content == null) {
    normalized.content = '';
  }
  if (normalized.role === 'tool' && !normalized.tool_call_id) {
    return null;
  }
  if (normalized.role === 'tool' && normalized.content == null) {
    normalized.content = '';
  }
  if (
    normalized.role === 'assistant' &&
    normalized.content == null &&
    (normalized.reasoning_content || normalized.tool_calls?.length)
  ) {
    normalized.content = '';
  }
  if (
    normalized.role === 'assistant' &&
    normalized.content == null &&
    !normalized.reasoning_content &&
    !normalized.tool_calls?.length
  ) {
    return null;
  }

  return normalized;
}

function removeToolCalls(message: ApiTranscriptMessage): ApiTranscriptMessage {
  const { tool_calls: _toolCalls, ...rest } = message;
  return rest;
}

function dedupeToolCalls(toolCalls: NonNullable<ApiTranscriptMessage['tool_calls']>): NonNullable<ApiTranscriptMessage['tool_calls']> {
  const seen = new Set<string>();
  return toolCalls.filter((toolCall) => {
    if (seen.has(toolCall.id)) {
      return false;
    }
    seen.add(toolCall.id);
    return true;
  });
}

function normalizeToolCallSegments(messages: ApiTranscriptMessage[]): ApiTranscriptMessage[] {
  const output: ApiTranscriptMessage[] = [];
  let pending: {
    assistant: ApiTranscriptMessage;
    remainingToolCallIds: Set<string>;
    toolMessages: ApiTranscriptMessage[];
  } | null = null;

  const finishPending = () => {
    if (!pending) {
      return;
    }

    if (pending.remainingToolCallIds.size === 0) {
      output.push(pending.assistant, ...pending.toolMessages);
    } else {
      output.push(removeToolCalls(pending.assistant));
    }
    pending = null;
  };

  for (const message of messages) {
    if (message.role === 'assistant' && message.tool_calls?.length) {
      finishPending();
      const toolCalls = dedupeToolCalls(message.tool_calls);
      if (toolCalls.length === 0) {
        output.push(removeToolCalls(message));
        continue;
      }

      pending = {
        assistant: toolCalls.length === message.tool_calls.length ? message : { ...message, tool_calls: toolCalls },
        remainingToolCallIds: new Set(toolCalls.map((toolCall) => toolCall.id)),
        toolMessages: [],
      };
      continue;
    }

    if (message.role === 'tool') {
      if (!pending || !message.tool_call_id || !pending.remainingToolCallIds.has(message.tool_call_id)) {
        continue;
      }
      pending.toolMessages.push(message);
      pending.remainingToolCallIds.delete(message.tool_call_id);
      if (pending.remainingToolCallIds.size === 0) {
        finishPending();
      }
      continue;
    }

    finishPending();
    output.push(message);
  }

  finishPending();
  return output;
}

export function normalizeApiTranscriptMessages(value: unknown): ApiTranscriptMessage[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const normalized = value
    .slice(-MAX_API_TRANSCRIPT_MESSAGES)
    .map(normalizeApiTranscriptMessage)
    .filter((message): message is ApiTranscriptMessage => message !== null);

  const paired = normalizeToolCallSegments(normalized);
  return paired.length > 0 ? paired : undefined;
}

function stripLocalComputerFileChanges(message: unknown): unknown {
  if (!isRecord(message) || message.role !== 'tool' || typeof message.content !== 'string') {
    return message;
  }

  try {
    const parsed = JSON.parse(message.content) as unknown;
    if (
      !isRecord(parsed) ||
      (parsed.kind !== COMPUTER_COMMAND_RESULT_KIND && message.name !== 'run_command')
    ) {
      return message;
    }
    if (!('fileChanges' in parsed) && !('fileChangesTruncated' in parsed)) {
      return message;
    }

    const { fileChanges: _fileChanges, fileChangesTruncated: _fileChangesTruncated, ...safeResult } = parsed;
    return { ...message, content: JSON.stringify(safeResult) };
  } catch {
    return message.name === 'run_command' || message.content.includes(COMPUTER_COMMAND_RESULT_KIND)
      ? { ...message, content: SAFE_UNPARSEABLE_COMPUTER_COMMAND_RESULT }
      : message;
  }
}

export function normalizeApiTranscriptMessagesForProviderReplay(
  value: unknown,
): ApiTranscriptMessage[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return normalizeApiTranscriptMessages(
    value.slice(-MAX_API_TRANSCRIPT_MESSAGES).map(stripLocalComputerFileChanges),
  );
}
