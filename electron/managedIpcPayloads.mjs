import { primitiveToString } from './managedIpcCommon.mjs';

const MAX_MANAGED_BINARY_BODY_BYTES = 64 * 1024 * 1024;
const MAX_MANAGED_BINARY_BODY_BASE64_CHARS = Math.ceil(MAX_MANAGED_BINARY_BODY_BYTES / 3) * 4;
const MAX_MANAGED_BINARY_HEADER_VALUE_CHARS = 16 * 1024;
const ALLOWED_MANAGED_BINARY_HEADERS = new Set(['content-type']);
const MANAGED_STREAM_CHUNK_FLUSH_DELAY_MS = 16;
const MAX_MANAGED_STREAM_CONTENT_CHARS = 4 * 1024 * 1024;

export function normalizeManagedBinaryPayload(payload) {
  if (typeof payload?.bodyBase64 !== 'string') {
    throw new Error('Invalid managed binary request body.');
  }
  const bodyBase64 = payload.bodyBase64;
  if (bodyBase64.length > MAX_MANAGED_BINARY_BODY_BASE64_CHARS) {
    throw new Error('Managed binary request body is too large.');
  }
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(bodyBase64) || bodyBase64.length % 4 !== 0) {
    throw new Error('Invalid managed binary request body.');
  }
  const decodedByteLength = getBase64DecodedByteLength(bodyBase64);
  if (decodedByteLength === null || decodedByteLength > MAX_MANAGED_BINARY_BODY_BYTES) {
    throw new Error('Managed binary request body is too large.');
  }

  const headers = {};
  const rawHeaders = payload?.headers;
  if (rawHeaders && typeof rawHeaders === 'object') {
    for (const [key, value] of Object.entries(rawHeaders)) {
      const normalizedKey = key.trim();
      const lowerKey = normalizedKey.toLowerCase();
      if (!ALLOWED_MANAGED_BINARY_HEADERS.has(lowerKey)) {
        throw new Error('Invalid managed binary request header.');
      }
      const normalizedValue = primitiveToString(value);
      if (normalizedValue === null) {
        throw new Error('Invalid managed binary request header.');
      }
      if (
        !/^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(normalizedKey) ||
        normalizedValue.length > MAX_MANAGED_BINARY_HEADER_VALUE_CHARS ||
        /[\u0000\r\n]/.test(normalizedValue)
      ) {
        throw new Error('Invalid managed binary request header.');
      }
      headers['Content-Type'] = normalizedValue;
    }
  }

  return { body: Buffer.from(bodyBase64, 'base64'), headers };
}

function getBase64DecodedByteLength(payload) {
  if (payload.length % 4 !== 0) {
    return null;
  }

  let padding = 0;
  if (payload.endsWith('==')) {
    padding = 2;
  } else if (payload.endsWith('=')) {
    padding = 1;
  }

  const byteLength = Math.floor((payload.length * 3) / 4) - padding;
  return byteLength >= 0 ? byteLength : null;
}

function sanitizeManagedChatMessage(message) {
  if (!message || typeof message !== 'object' || Array.isArray(message)) {
    return message;
  }

  const nextMessage = { ...message };
  const hasAssistantMetadata = Boolean(nextMessage.reasoning_content) ||
    (Array.isArray(nextMessage.tool_calls) && nextMessage.tool_calls.length > 0);
  if (nextMessage.role === 'assistant' && nextMessage.content == null && hasAssistantMetadata) {
    nextMessage.content = '';
  }
  if (
    (nextMessage.role === 'system' || nextMessage.role === 'user' || nextMessage.role === 'tool') &&
    nextMessage.content == null
  ) {
    nextMessage.content = '';
  }
  return nextMessage;
}

export function sanitizeManagedChatCompletionBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return body ?? {};
  }
  if (!Array.isArray(body.messages)) {
    return body;
  }
  return {
    ...body,
    messages: body.messages.map(sanitizeManagedChatMessage),
  };
}

export function createManagedStreamAccumulator(onChunk) {
  let fullContent = '';
  let hasStartedReasoning = false;
  let hasFinishedReasoning = false;

  return {
    pushDelta({ reasoning, content }) {
      const reasoningText = typeof reasoning === 'string' ? reasoning : '';
      const contentText = typeof content === 'string' ? content : '';
      if (!reasoningText && !contentText) {
        return true;
      }

      let nextLength = fullContent.length;
      let nextHasStartedReasoning = hasStartedReasoning;
      let nextHasFinishedReasoning = hasFinishedReasoning;
      if (reasoningText) {
        if (!nextHasStartedReasoning || nextHasFinishedReasoning) {
          nextLength += '<think>'.length;
          nextHasStartedReasoning = true;
          nextHasFinishedReasoning = false;
        }
        nextLength += reasoningText.length;
      }
      if (contentText) {
        if (nextHasStartedReasoning && !nextHasFinishedReasoning) {
          nextLength += '</think>'.length;
        }
        nextLength += contentText.length;
      }
      if (nextLength > MAX_MANAGED_STREAM_CONTENT_CHARS) {
        throw new Error('Managed stream content is too large.');
      }

      if (reasoningText) {
        if (!hasStartedReasoning || hasFinishedReasoning) {
          fullContent += '<think>';
          hasStartedReasoning = true;
          hasFinishedReasoning = false;
        }
        fullContent += reasoningText;
      }

      if (contentText) {
        if (hasStartedReasoning && !hasFinishedReasoning) {
          fullContent += '</think>';
          hasFinishedReasoning = true;
        }
        fullContent += contentText;
      }

      return onChunk(fullContent);
    },
    finish() {
      if (hasStartedReasoning && !hasFinishedReasoning) {
        if (fullContent.length + '</think>'.length > MAX_MANAGED_STREAM_CONTENT_CHARS) {
          throw new Error('Managed stream content is too large.');
        }
        fullContent += '</think>';
        hasFinishedReasoning = true;
      }
      return fullContent;
    },
  };
}

export function createManagedStreamChunkScheduler(onFlush) {
  let pendingContent = null;
  let lastFlushedContent = null;
  let timeoutId = null;
  let hasFlushedOnce = false;
  let cancelled = false;

  const clearScheduledFlush = () => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  };

  const flush = () => {
    clearScheduledFlush();
    if (cancelled || pendingContent === null) {
      return !cancelled;
    }
    const content = pendingContent;
    pendingContent = null;
    if (content === lastFlushedContent) {
      return true;
    }
    hasFlushedOnce = true;
    lastFlushedContent = content;
    return onFlush(content) !== false;
  };

  return {
    push(content) {
      if (cancelled) return false;
      pendingContent = content;
      if (!hasFlushedOnce) {
        return flush();
      }
      if (timeoutId === null) {
        timeoutId = setTimeout(flush, MANAGED_STREAM_CHUNK_FLUSH_DELAY_MS);
      }
      return true;
    },
    flushNow(content) {
      if (cancelled) return false;
      if (typeof content === 'string') {
        pendingContent = content;
      }
      return flush();
    },
    cancel() {
      cancelled = true;
      pendingContent = null;
      clearScheduledFlush();
    },
  };
}
