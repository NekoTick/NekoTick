const MANAGED_STREAM_CHUNK_FLUSH_DELAY_MS = 16;
const MAX_MANAGED_STREAM_CONTENT_BYTES = 4 * 1024 * 1024;
const MAX_MANAGED_STREAM_TEXT_CHARS = 1024 * 1024;
const MAX_MANAGED_STREAM_TEXT_NODES = 2000;
const MAX_MANAGED_STREAM_TOOL_CALLS = 16;
const MAX_MANAGED_STREAM_TOOL_ARGUMENT_CHARS = 64 * 1024;
const MAX_MANAGED_STREAM_TOOL_INDEX_CHARS = 16;
const UNSAFE_MANAGED_TOOL_CALL_ID_CHARS = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}\uFFFD]/u;

function isRecord(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function extractManagedStreamText(value) {
  if (typeof value === 'string') return value;

  const parts = [];
  const stack = [value];
  let textLength = 0;
  let visitedNodes = 0;
  while (stack.length > 0) {
    const current = stack.pop();
    visitedNodes += 1;
    if (visitedNodes > MAX_MANAGED_STREAM_TEXT_NODES) return '';
    if (typeof current === 'string') {
      textLength += current.length;
      if (textLength > MAX_MANAGED_STREAM_TEXT_CHARS) return '';
      parts.push(current);
    } else if (Array.isArray(current)) {
      for (let index = current.length - 1; index >= 0; index -= 1) {
        stack.push(current[index]);
      }
    } else if (isRecord(current)) {
      if (typeof current.text === 'string') stack.push(current.text);
      else if (isRecord(current.text) && typeof current.text.value === 'string') {
        stack.push(current.text.value);
      } else if (typeof current.content === 'string') stack.push(current.content);
    }
  }
  return parts.join('');
}

function extractManagedStreamDelta(payload) {
  const eventType = typeof payload?.type === 'string' ? payload.type.toLowerCase() : '';
  if (eventType.endsWith('.delta')) {
    const delta = extractManagedStreamText(payload.delta);
    if (delta && (eventType.includes('reasoning') || eventType.includes('thinking'))) {
      return { reasoning: delta, content: '' };
    }
    if (delta && (eventType.includes('output_text') || eventType.includes('content'))) {
      return { reasoning: '', content: delta };
    }
  }

  const choice = Array.isArray(payload?.choices) ? payload.choices[0] : null;
  if (isRecord(choice)) {
    const source = isRecord(choice.delta)
      ? choice.delta
      : isRecord(choice.message) ? choice.message : null;
    return {
      reasoning: extractManagedStreamText(source?.reasoning_content ?? source?.reasoning),
      content: extractManagedStreamText(source?.content),
    };
  }

  const output = isRecord(payload?.output) ? payload.output : null;
  const data = isRecord(payload?.data) ? payload.data : null;
  return {
    reasoning: extractManagedStreamText(
      payload?.reasoning_content ?? payload?.reasoning ?? output?.reasoning_content ?? output?.reasoning,
    ),
    content: extractManagedStreamText(
      payload?.output_text ?? payload?.response ?? payload?.result ?? payload?.message ??
      output?.text ?? output?.content ?? output?.message ?? data?.content ?? data?.text,
    ),
  };
}

function parseManagedToolCallIndex(value) {
  if (Number.isInteger(value)) {
    return value >= 0 && value < MAX_MANAGED_STREAM_TOOL_CALLS ? value : -1;
  }
  if (typeof value !== 'string' || value.length > MAX_MANAGED_STREAM_TOOL_INDEX_CHARS) return -1;
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return -1;
  const parsed = Number.parseInt(trimmed, 10);
  return parsed < MAX_MANAGED_STREAM_TOOL_CALLS ? parsed : -1;
}

function normalizeManagedToolArguments(value) {
  if (typeof value === 'string') {
    return value.slice(0, MAX_MANAGED_STREAM_TOOL_ARGUMENT_CHARS);
  }
  try {
    const serialized = JSON.stringify(value ?? {});
    return typeof serialized === 'string' && serialized.length <= MAX_MANAGED_STREAM_TOOL_ARGUMENT_CHARS
      ? serialized
      : '{}';
  } catch {
    return '{}';
  }
}

export function createManagedStreamAccumulator(onChunk) {
  let fullContent = '';
  let assistantContent = '';
  let reasoningContent = '';
  let contentBytes = 0;
  let hasStartedReasoning = false;
  let hasFinishedReasoning = false;

  const appendContent = (content) => {
    const nextBytes = Buffer.byteLength(content, 'utf8');
    if (contentBytes + nextBytes > MAX_MANAGED_STREAM_CONTENT_BYTES) {
      throw new Error('Managed stream content is too large.');
    }
    contentBytes += nextBytes;
    fullContent += content;
    return onChunk(content);
  };

  return {
    pushDelta({ reasoning, content }) {
      const reasoningText = typeof reasoning === 'string' ? reasoning : '';
      const contentText = typeof content === 'string' ? content : '';
      if (!reasoningText && !contentText) return true;

      let nextContent = '';
      if (reasoningText) {
        if (!hasStartedReasoning || hasFinishedReasoning) {
          nextContent += '<think>';
          hasStartedReasoning = true;
          hasFinishedReasoning = false;
        }
        nextContent += reasoningText;
        reasoningContent += reasoningText;
      }
      if (contentText) {
        if (hasStartedReasoning && !hasFinishedReasoning) {
          nextContent += '</think>';
          hasFinishedReasoning = true;
        }
        nextContent += contentText;
        assistantContent += contentText;
      }
      return appendContent(nextContent);
    },
    finish() {
      let shouldContinue = true;
      if (hasStartedReasoning && !hasFinishedReasoning) {
        shouldContinue = appendContent('</think>') !== false;
        hasFinishedReasoning = true;
      }
      return { content: fullContent, assistantContent, reasoningContent, shouldContinue };
    },
  };
}

export function createManagedToolCallAccumulator() {
  const toolCalls = [];

  const resolveIndex = (rawCall, rawFunction) => {
    const explicitIndex = parseManagedToolCallIndex(rawCall?.index);
    if (explicitIndex >= 0) return explicitIndex;
    const id = typeof rawCall?.id === 'string' ? rawCall.id : '';
    if (id) {
      const existingIndex = toolCalls.findIndex((call) => call?.id === id);
      if (existingIndex >= 0) return existingIndex;
    }
    if (typeof rawFunction?.arguments === 'string' && typeof rawFunction?.name !== 'string') {
      for (let index = toolCalls.length - 1; index >= 0; index -= 1) {
        if (toolCalls[index]) return index;
      }
    }
    return toolCalls.length < MAX_MANAGED_STREAM_TOOL_CALLS ? toolCalls.length : -1;
  };

  return {
    push(rawCalls, replaceArguments = false) {
      if (!Array.isArray(rawCalls)) return;
      for (const rawCall of rawCalls.slice(0, MAX_MANAGED_STREAM_TOOL_CALLS)) {
        if (!isRecord(rawCall)) continue;
        const rawFunction = isRecord(rawCall.function) ? rawCall.function : {};
        const index = resolveIndex(rawCall, rawFunction);
        if (index < 0) continue;
        const existing = toolCalls[index] ?? {
          id: '',
          type: 'function',
          function: { name: '', arguments: '' },
        };
        const hasArguments = Object.prototype.hasOwnProperty.call(rawFunction, 'arguments');
        const normalizedArguments = hasArguments
          ? normalizeManagedToolArguments(rawFunction.arguments)
          : '';
        const shouldReplaceArguments = hasArguments && (
          replaceArguments || typeof rawFunction.arguments !== 'string'
        );
        const remainingArgumentChars = Math.max(
          0,
          MAX_MANAGED_STREAM_TOOL_ARGUMENT_CHARS - existing.function.arguments.length,
        );
        toolCalls[index] = {
          id: (typeof rawCall.id === 'string' ? rawCall.id.slice(0, 512) : '') || existing.id,
          type: 'function',
          function: {
            name: (typeof rawFunction.name === 'string' ? rawFunction.name.slice(0, 128) : '') || existing.function.name,
            arguments: shouldReplaceArguments
              ? normalizedArguments
              : existing.function.arguments + normalizedArguments.slice(0, remainingArgumentChars),
          },
        };
      }
    },
    consumePayload(payload, contentAccumulator) {
      const choice = Array.isArray(payload?.choices) ? payload.choices[0] : undefined;
      const delta = isRecord(choice?.delta) ? choice.delta : null;
      const message = isRecord(choice?.message) ? choice.message : null;
      const hasIncrementalToolCalls = Array.isArray(delta?.tool_calls) && delta.tool_calls.length > 0;
      this.push(
        hasIncrementalToolCalls ? delta.tool_calls : message?.tool_calls,
        !hasIncrementalToolCalls,
      );
      return contentAccumulator.pushDelta(extractManagedStreamDelta(payload));
    },
    buildResult(contentResult, includeStructuredResult) {
      return {
        content: contentResult.content,
        ...(includeStructuredResult ? {
          assistantContent: contentResult.assistantContent,
          reasoningContent: contentResult.reasoningContent,
          toolCalls: this.finish(),
        } : {}),
      };
    },
    finish() {
      const seenIds = new Set();
      return toolCalls.filter((call) => {
        if (!call?.id || !call.function.name || seenIds.has(call.id)) return false;
        if (UNSAFE_MANAGED_TOOL_CALL_ID_CHARS.test(call.id)) return false;
        seenIds.add(call.id);
        return true;
      });
    },
  };
}

export function createManagedStreamChunkScheduler(onFlush) {
  let pendingContent = '';
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
    if (cancelled || !pendingContent) return !cancelled;
    const content = pendingContent;
    pendingContent = '';
    hasFlushedOnce = true;
    return onFlush(content) !== false;
  };

  return {
    push(content) {
      if (cancelled) return false;
      if (!content) return true;
      pendingContent += content;
      if (!hasFlushedOnce) return flush();
      if (timeoutId === null) {
        timeoutId = setTimeout(flush, MANAGED_STREAM_CHUNK_FLUSH_DELAY_MS);
      }
      return true;
    },
    flushNow(content) {
      if (cancelled) return false;
      if (typeof content === 'string') pendingContent += content;
      return flush();
    },
    cancel() {
      cancelled = true;
      pendingContent = '';
      clearScheduledFlush();
    },
  };
}
