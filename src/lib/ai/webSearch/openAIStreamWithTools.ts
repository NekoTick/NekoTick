import {
  appendOpenAIStreamBuffer,
  assertOpenAIStreamLineLength,
  createStreamAccumulator,
} from '@/lib/ai/streaming';
import { extractErrorCode, extractErrorMessage, extractStreamDelta } from '@/lib/ai/streamingPayload';
import {
  extractOpenAIToolCalls,
  parseOpenAIPayloadText,
} from './openAIToolParsing';
import { filterUniqueOpenAIToolCalls } from './openAIToolCallIds';
import type { OpenAIStreamToolResult, OpenAIToolCall } from './openAIToolTypes';
import { addAiStreamResponseChunkBytes } from '@/lib/ai/streamingResponseBudget';
import { isErrorNamed } from '@/lib/ai/errorClassification';

interface ConsumeOpenAIStreamWithToolsOptions {
  mapErrorPayload?: (message: string, code?: string) => Error | string;
  signal?: AbortSignal;
}

function createAbortError(): DOMException {
  return new DOMException('The web search request was cancelled.', 'AbortError');
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  throw createAbortError();
}

function raceWithAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) {
    return promise;
  }
  throwIfAborted(signal);
  promise.catch(() => undefined);

  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      signal.removeEventListener('abort', abort);
    };
    const settle = (callback: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback();
    };
    const abort = () => {
      settle(() => reject(createAbortError()));
    };

    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) {
      abort();
      return;
    }

    promise.then(
      (value) => {
        settle(() => {
          try {
            throwIfAborted(signal);
            resolve(value);
          } catch (error) {
            reject(error);
          }
        });
      },
      (error) => {
        settle(() => {
          try {
            throwIfAborted(signal);
            reject(error);
          } catch (abortError) {
            reject(abortError);
          }
        });
      },
    );
  });
}

export async function consumeOpenAIStreamWithTools(
  response: Response,
  onChunk: (chunk: string) => void,
  options: ConsumeOpenAIStreamWithToolsOptions = {},
): Promise<OpenAIStreamToolResult> {
  if (!response.body) {
    throw new Error('Response body is null');
  }

  const { signal } = options;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const accumulator = createStreamAccumulator(onChunk);
  const toolCalls: OpenAIToolCall[] = [];
  let assistantContent = '';
  let reasoningContent = '';
  let buffer = '';
  let responseBytesRead = 0;

  const consumeLine = (line: string) => {
    const payload = parseOpenAIPayloadText(line);
    if (!payload) return;
    const errorMessage = extractErrorMessage(payload);
    if (errorMessage) {
      const mapped = options.mapErrorPayload?.(errorMessage, extractErrorCode(payload));
      throw typeof mapped === 'string' ? new Error(mapped) : mapped || new Error(errorMessage);
    }
    extractOpenAIToolCalls(payload, toolCalls);
    const delta = extractStreamDelta(payload);
    accumulator.pushDelta(delta);
    if (delta.content) assistantContent += delta.content;
    if (delta.reasoning) reasoningContent += delta.reasoning;
  };

  const cancelReader = () => {
    void reader.cancel(createAbortError()).catch(() => undefined);
  };

  if (signal?.aborted) {
    void reader.cancel(createAbortError()).catch(() => undefined);
    reader.releaseLock();
    throw createAbortError();
  }

  signal?.addEventListener('abort', cancelReader, { once: true });

  try {
    while (true) {
      throwIfAborted(signal);
      const { done, value } = await raceWithAbort(reader.read(), signal);
      throwIfAborted(signal);
      if (done) break;
      responseBytesRead = addAiStreamResponseChunkBytes(responseBytesRead, value);
      buffer = appendOpenAIStreamBuffer(buffer, decoder.decode(value, { stream: true }));
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        throwIfAborted(signal);
        assertOpenAIStreamLineLength(line);
        consumeLine(line);
        throwIfAborted(signal);
      }
      assertOpenAIStreamLineLength(buffer);
    }

    const finalDecoded = decoder.decode();
    if (finalDecoded) {
      buffer = appendOpenAIStreamBuffer(buffer, finalDecoded);
    }

    if (buffer.trim()) {
      throwIfAborted(signal);
      assertOpenAIStreamLineLength(buffer);
      consumeLine(buffer);
      throwIfAborted(signal);
    }

    const result = {
      content: accumulator.finish(),
      assistantContent,
      reasoningContent,
      toolCalls: filterUniqueOpenAIToolCalls(
        toolCalls.filter((call) => call.function.name),
      ),
    };
    throwIfAborted(signal);
    return result;
  } catch (error) {
    void reader.cancel(createAbortError()).catch(() => undefined);
    if (signal?.aborted && !isErrorNamed(error, 'AbortError')) {
      throw createAbortError();
    }
    throw error;
  } finally {
    signal?.removeEventListener('abort', cancelReader);
    reader.releaseLock();
  }
}
