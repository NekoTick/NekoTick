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
  raceWithAbort,
  readManagedErrorPayload,
} from './managedIpcErrors.mjs';
import {
  normalizeManagedBinaryPayload,
  sanitizeManagedChatCompletionBody,
} from './managedIpcPayloads.mjs';
import {
  createManagedStreamAccumulator,
  createManagedStreamChunkScheduler,
  createManagedToolCallAccumulator,
} from './managedIpcStreamPayloads.mjs';
import {
  cancelManagedJsonRequest,
  parseOptionalManagedRequestId,
  requestManagedJsonWithOptionalCancel,
} from './managedIpcJsonRequests.mjs';

const activeManagedStreams = new Map();
const MANAGED_STREAM_TIMEOUT_MS = 300_000;

function deleteActiveManagedStream(requestId, controller) {
  if (activeManagedStreams.get(requestId) === controller) {
    activeManagedStreams.delete(requestId);
  }
}

function isCurrentManagedStream(requestId, controller) {
  return activeManagedStreams.get(requestId) === controller;
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
  handleIpc('desktop:billing:create-checkout', async (_event, tier) => {
    return await createElectronBillingCheckout(primitiveToString(tier) ?? '');
  });

  handleIpc('desktop:feedback:submit', async (_event, message) => {
    return await submitElectronFeedback(primitiveToString(message) ?? '');
  });

  handleIpc('desktop:managed:get-models', async () => {
    return await requestManagedPublicJson('/models', { method: 'GET' });
  });

  handleIpc('desktop:managed:get-models-version', async () => {
    return await requestManagedPublicJson('/models/version', { method: 'GET' });
  });

  handleIpc('desktop:managed:get-budget', async () => {
    return await requestManagedJson('/budget', { method: 'GET' });
  });

  handleIpc('desktop:managed:client-diagnostic', async (_event, body) => {
    return await requestManagedJson('/client-diagnostics', {
      method: 'POST',
      body: JSON.stringify(body ?? {}),
    });
  });

  handleIpc('desktop:managed:chat-completion', async (_event, requestIdOrBody, maybeBody) => {
    const { requestId, payload: body } = parseOptionalManagedRequestId(
      requestIdOrBody,
      maybeBody,
      'managed chat completion request id',
    );
    return await requestManagedJsonWithOptionalCancel(requestManagedJson, requestId, '/chat/completions', {
      method: 'POST',
      body: JSON.stringify(sanitizeManagedChatCompletionBody(body)),
    });
  });

  handleIpc('desktop:managed:chat-completion:cancel', async (_event, requestId) => {
    cancelManagedJsonRequest(requestId, 'managed chat completion request id');
  });

  handleIpc('desktop:managed:image-generation', async (_event, requestIdOrBody, maybeBody) => {
    const { requestId, payload: body } = parseOptionalManagedRequestId(
      requestIdOrBody,
      maybeBody,
      'managed image generation request id',
    );
    return await requestManagedJsonWithOptionalCancel(requestManagedJson, requestId, '/images/generations', {
      method: 'POST',
      body: JSON.stringify(body ?? {}),
    });
  });

  handleIpc('desktop:managed:image-generation:cancel', async (_event, requestId) => {
    cancelManagedJsonRequest(requestId, 'managed image generation request id');
  });

  handleIpc('desktop:managed:image-edit', async (_event, requestIdOrPayload, maybePayload) => {
    const { requestId, payload } = parseOptionalManagedRequestId(
      requestIdOrPayload,
      maybePayload,
      'managed image edit request id',
    );
    const { body, headers } = normalizeManagedBinaryPayload(payload);
    return await requestManagedJsonWithOptionalCancel(requestManagedJson, requestId, '/images/edits', {
      method: 'POST',
      headers,
      body,
    });
  });

  handleIpc('desktop:managed:image-edit:cancel', async (_event, requestId) => {
    cancelManagedJsonRequest(requestId, 'managed image edit request id');
  });

  handleIpc('desktop:managed:chat-completion-stream:start', async (event, requestId, body) => {
    const id = requireSafeIpcRequestId(requestId, 'managed stream request id');

    const previous = activeManagedStreams.get(id);
    previous?.abort();

    const controller = new AbortController();
    activeManagedStreams.set(id, controller);
    const sender = event.sender;
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
          body: JSON.stringify(sanitizeManagedChatCompletionBody(body)),
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
          sendStreamEvent('error', {
            message: getManagedErrorMessage(error),
            statusCode: typeof error?.statusCode === 'number' ? error.statusCode : undefined,
            errorCode: typeof error?.errorCode === 'string' ? error.errorCode : undefined,
          });
        }
      } finally {
        clearTimeout(timeoutId);
        deleteActiveManagedStream(id, controller);
      }
    })();
  });

  handleIpc('desktop:managed:chat-completion-stream:cancel', async (_event, requestId) => {
    const id = requireSafeIpcRequestId(requestId, 'managed stream request id');
    const controller = activeManagedStreams.get(id);
    if (controller) {
      controller.abort();
      deleteActiveManagedStream(id, controller);
    }
  });
}
