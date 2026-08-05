import {
  getManagedErrorMessage,
  primitiveToString,
  requireSafeIpcRequestId,
  safeSend,
} from './managedIpcCommon.mjs';
import {
  appendManagedStreamBuffer,
  assertManagedStreamLineLength,
  createAbortError,
  createManagedBackendStreamError,
  createManagedStreamTimeoutError,
  isManagedStreamTimeoutError,
  MANAGED_BACKEND_STREAM_ERROR,
  normalizeManagedPublicErrorCode,
  raceWithAbort,
  readManagedErrorPayload,
} from './managedIpcErrors.mjs';
import {
  normalizeManagedBinaryPayload,
  sanitizeManagedChatCompletionBody,
  stringifyManagedJsonPayload,
} from './managedIpcPayloads.mjs';
import {
  createManagedStreamAccumulator,
  createManagedStreamChunkScheduler,
  createManagedToolCallAccumulator,
} from './managedIpcStreamPayloads.mjs';
import {
  cancelManagedJsonRequest,
  parseOptionalManagedRequestId,
  runManagedJsonOperation,
  requestManagedJsonWithOptionalCancel,
} from './managedIpcJsonRequests.mjs';
import { createIpcSenderAbortRegistry } from './ipcSenderAbortRegistry.mjs';

const activeManagedStreams = new Map();
const managedStreamSenderAbortRegistry = createIpcSenderAbortRegistry(createAbortError);
const MANAGED_STREAM_TIMEOUT_MS = 300_000;
const MAX_ACTIVE_MANAGED_STREAMS = 16;
const MAX_MANAGED_STREAM_RESPONSE_BYTES = 64 * 1024 * 1024;
const SAFE_MANAGED_STREAM_ERROR_MESSAGES = new Set([
  'INVALID_REQUEST',
  'Invalid managed stream response chunk.',
  'MANAGED_QUOTA_EXHAUSTED',
  'Managed API response body is null',
  'Managed stream content is too large.',
  'Managed stream line is too large.',
  'Managed stream response is too large.',
  'UNSUPPORTED_MODEL_INPUT',
  'UNSUPPORTED_TOOL_CALLING',
  'UPSTREAM_RATE_LIMITED',
  'UPSTREAM_UNAVAILABLE',
]);

function readManagedStreamErrorProperty(error, key) {
  if (!error || typeof error !== 'object') return undefined;
  try {
    return error[key];
  } catch {
    return undefined;
  }
}

function getPublicManagedStreamErrorMessage(error) {
  const message = getManagedErrorMessage(error);
  if (
    readManagedStreamErrorProperty(error, MANAGED_BACKEND_STREAM_ERROR)
    || SAFE_MANAGED_STREAM_ERROR_MESSAGES.has(message)
    || /^Managed stream failed: HTTP [1-5]\d\d$/.test(message)
  ) {
    return message;
  }
  return 'Managed API response stream failed.';
}

function deleteActiveManagedStream(requestId, active) {
  if (activeManagedStreams.get(requestId) === active) {
    activeManagedStreams.delete(requestId);
  }
  active.untrackSender();
}

function isCurrentManagedStream(requestId, controller) {
  return activeManagedStreams.get(requestId)?.controller === controller;
}

export function registerManagedIpc({
  handleIpc,
  requestManagedJson,
  requestManagedPublicJson,
  fetchWithStoredSession,
  managedApiBaseUrl,
  createElectronBillingCheckout,
  submitElectronFeedback,
  requireNonEmptyString,
}) {
  handleIpc('desktop:billing:create-checkout', async (event, tier) => {
    return await runManagedJsonOperation(
      (signal) => createElectronBillingCheckout(primitiveToString(tier) ?? '', signal),
      null,
      event?.sender,
    );
  });

  handleIpc('desktop:feedback:submit', async (event, message) => {
    return await runManagedJsonOperation(
      (signal) => submitElectronFeedback(primitiveToString(message) ?? '', signal),
      null,
      event?.sender,
    );
  });

  handleIpc('desktop:managed:get-models', async (event) => {
    return await runManagedJsonOperation(
      (signal) => requestManagedPublicJson('/models', { method: 'GET', signal }),
      null,
      event?.sender,
    );
  });

  handleIpc('desktop:managed:get-models-version', async (event) => {
    return await runManagedJsonOperation(
      (signal) => requestManagedPublicJson('/models/version', { method: 'GET', signal }),
      null,
      event?.sender,
    );
  });

  handleIpc('desktop:managed:get-budget', async (event) => {
    return await runManagedJsonOperation(
      (signal) => requestManagedJson('/budget', { method: 'GET', signal }),
      null,
      event?.sender,
    );
  });

  handleIpc('desktop:managed:client-diagnostic', async (event, body) => {
    return await runManagedJsonOperation(
      (signal) => requestManagedJson('/client-diagnostics', {
        method: 'POST',
        body: stringifyManagedJsonPayload(body),
        signal,
      }),
      null,
      event?.sender,
    );
  });

  handleIpc('desktop:managed:chat-completion', async (event, requestIdOrBody, maybeBody) => {
    const { requestId, payload: body } = parseOptionalManagedRequestId(
      requestIdOrBody,
      maybeBody,
      'managed chat completion request id',
    );
    return await requestManagedJsonWithOptionalCancel(requestManagedJson, requestId, event.sender, '/chat/completions', {
      method: 'POST',
      body: stringifyManagedJsonPayload(sanitizeManagedChatCompletionBody(body)),
    });
  });

  handleIpc('desktop:managed:chat-completion:cancel', async (event, requestId) => {
    return cancelManagedJsonRequest(requestId, 'managed chat completion request id', event.sender);
  });

  handleIpc('desktop:managed:image-generation', async (event, requestIdOrBody, maybeBody) => {
    const { requestId, payload: body } = parseOptionalManagedRequestId(
      requestIdOrBody,
      maybeBody,
      'managed image generation request id',
    );
    return await requestManagedJsonWithOptionalCancel(requestManagedJson, requestId, event.sender, '/images/generations', {
      method: 'POST',
      body: stringifyManagedJsonPayload(body),
    });
  });

  handleIpc('desktop:managed:image-generation:cancel', async (event, requestId) => {
    return cancelManagedJsonRequest(requestId, 'managed image generation request id', event.sender);
  });

  handleIpc('desktop:managed:image-edit', async (event, requestIdOrPayload, maybePayload) => {
    const { requestId, payload } = parseOptionalManagedRequestId(
      requestIdOrPayload,
      maybePayload,
      'managed image edit request id',
    );
    const { body, headers } = normalizeManagedBinaryPayload(payload);
    return await requestManagedJsonWithOptionalCancel(requestManagedJson, requestId, event.sender, '/images/edits', {
      method: 'POST',
      headers,
      body,
    });
  });

  handleIpc('desktop:managed:image-edit:cancel', async (event, requestId) => {
    return cancelManagedJsonRequest(requestId, 'managed image edit request id', event.sender);
  });

  handleIpc('desktop:managed:chat-completion-stream:start', async (event, requestId, body) => {
    const id = requireSafeIpcRequestId(requestId, 'managed stream request id');
    const sender = event.sender;
    if (!sender || sender.isDestroyed?.()) {
      throw new Error('Managed stream renderer is unavailable.');
    }

    const previous = activeManagedStreams.get(id);
    if (previous) {
      throw new Error('A managed stream with this id is already active.');
    }
    if (activeManagedStreams.size >= MAX_ACTIVE_MANAGED_STREAMS) {
      throw new Error('Too many managed streams are active.');
    }

    const controller = new AbortController();
    const active = { controller, sender, untrackSender: () => {} };
    activeManagedStreams.set(id, active);
    active.untrackSender = managedStreamSenderAbortRegistry.track(sender, controller);
    if (sender.isDestroyed?.()) controller.abort(createAbortError());
    const sendStreamEvent = (suffix, payload) => {
      if (!isCurrentManagedStream(id, controller)) {
        return false;
      }
      return safeSend(sender, `desktop:managed:stream:${id}:${suffix}`, payload);
    };

    void (async () => {
      const timeoutId = setTimeout(() => {
        if (isCurrentManagedStream(id, controller) && !controller.signal.aborted) {
          controller.abort(createManagedStreamTimeoutError());
        }
      }, MANAGED_STREAM_TIMEOUT_MS);
      try {
        const response = await raceWithAbort(fetchWithStoredSession(`${managedApiBaseUrl}/chat/completions`, {
          method: 'POST',
          cache: 'no-store',
          signal: controller.signal,
          headers: {
            Accept: 'text/event-stream',
            'Content-Type': 'application/json',
          },
          body: stringifyManagedJsonPayload(sanitizeManagedChatCompletionBody(body)),
        }), controller.signal);

        if (!response.ok) {
          throw await readManagedErrorPayload(response, controller.signal);
        }

        if (!response.body) {
          throw new Error('Managed API response body is null');
        }

        const reader = response.body.getReader();
        const cancelReader = () => {
          void reader.cancel(new Error('Aborted')).catch(() => {});
        };
        controller.signal.addEventListener('abort', cancelReader, { once: true });
        const decoder = new TextDecoder();
        let buffer = '';
        let responseBytesRead = 0;

        const chunkScheduler = createManagedStreamChunkScheduler((delta) => {
          if (!sendStreamEvent('chunk', { delta })) {
            controller.abort();
            return false;
          }
          return true;
        });
        const accumulator = createManagedStreamAccumulator((delta) => {
          return chunkScheduler.push(delta);
        });
        const toolCallAccumulator = createManagedToolCallAccumulator();

        const consumeLine = (line) => {
          const trimmed = line.trim();
          if (!trimmed) return true;
          const payloadText = trimmed.startsWith('data:')
            ? trimmed.slice(5).trim()
            : trimmed.startsWith('{') ? trimmed : '';
          if (!payloadText || payloadText === '[DONE]') return true;
          const payload = JSON.parse(payloadText);
          if (payload?.error) {
            throw createManagedBackendStreamError(payload);
          }

          return toolCallAccumulator.consumePayload(payload, accumulator);
        };

        try {
          if (controller.signal.aborted) {
            throw new Error('Aborted');
          }

          while (true) {
            const { done, value } = await raceWithAbort(reader.read(), controller.signal);
            if (controller.signal.aborted) {
              throw new Error('Aborted');
            }
            if (done) {
              break;
            }

            const chunkByteLength = value?.byteLength;
            if (!Number.isSafeInteger(chunkByteLength) || chunkByteLength < 0) {
              throw new Error('Invalid managed stream response chunk.');
            }
            if (chunkByteLength > MAX_MANAGED_STREAM_RESPONSE_BYTES - responseBytesRead) {
              throw new Error('Managed stream response is too large.');
            }
            if (
              !ArrayBuffer.isView(value)
              || value instanceof DataView
              || value.BYTES_PER_ELEMENT !== 1
            ) {
              throw new Error('Invalid managed stream response chunk.');
            }
            responseBytesRead += chunkByteLength;
            buffer = appendManagedStreamBuffer(buffer, decoder.decode(value, { stream: true }));
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              try {
                assertManagedStreamLineLength(line);
                if (!consumeLine(line)) {
                  throw new Error('Aborted');
                }
              } catch (error) {
                if (!(error instanceof SyntaxError)) {
                  throw error;
                }
              }
            }
            assertManagedStreamLineLength(buffer);
          }

          const finalDecoded = decoder.decode();
          if (finalDecoded) {
            buffer = appendManagedStreamBuffer(buffer, finalDecoded);
          }

          if (buffer.trim()) {
            assertManagedStreamLineLength(buffer);
            if (!consumeLine(buffer)) {
              throw new Error('Aborted');
            }
          }

          const finalResult = accumulator.finish();
          if (!finalResult.shouldContinue || !chunkScheduler.flushNow()) {
            throw new Error('Aborted');
          }
          sendStreamEvent('done', toolCallAccumulator.buildResult(
            finalResult,
            Array.isArray(body?.tools) && body.tools.length > 0,
          ));
        } catch (error) {
          void reader.cancel(createAbortError()).catch(() => {});
          throw error;
        } finally {
          chunkScheduler.cancel();
          controller.signal.removeEventListener('abort', cancelReader);
          reader.releaseLock();
        }
      } catch (error) {
        if (controller.signal.aborted) {
          if (isCurrentManagedStream(id, controller)) {
            const abortReason = controller.signal.reason;
            if (isManagedStreamTimeoutError(abortReason)) {
              safeSend(sender, `desktop:managed:stream:${id}:error`, {
                message: abortReason.message,
                statusCode: undefined,
                errorCode: abortReason.errorCode,
              });
            } else {
              safeSend(sender, `desktop:managed:stream:${id}:error`, { message: 'Aborted' });
            }
          }
        } else {
          const statusCode = readManagedStreamErrorProperty(error, 'statusCode');
          sendStreamEvent('error', {
            message: getPublicManagedStreamErrorMessage(error),
            statusCode: Number.isInteger(statusCode)
              && statusCode >= 100
              && statusCode <= 599
              ? statusCode
              : undefined,
            errorCode: normalizeManagedPublicErrorCode(
              readManagedStreamErrorProperty(error, 'errorCode'),
            ) ?? undefined,
          });
        }
      } finally {
        clearTimeout(timeoutId);
        deleteActiveManagedStream(id, active);
      }
    })();
  });

  handleIpc('desktop:managed:chat-completion-stream:cancel', async (event, requestId) => {
    const id = requireSafeIpcRequestId(requestId, 'managed stream request id');
    const active = activeManagedStreams.get(id);
    if (!active || active.sender !== event.sender) return false;
    active.controller.abort();
    deleteActiveManagedStream(id, active);
    return true;
  });
}
