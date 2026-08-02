import {
  AI_PROVIDER_CONNECTION_FAILURE_CODE,
  createAbortError,
  fetchAiProviderRequestWithRetry,
  MAX_AI_PROVIDER_RESPONSE_BODY_BYTES,
  MAX_AI_PROVIDER_RESPONSE_IPC_CHUNK_BYTES,
  normalizeAiProviderRequest,
  raceWithAbort,
  requireSafeIpcRequestId,
} from './desktopAiProviderRequest.mjs';
import {
  AI_PROVIDER_INVALID_RESPONSE_METADATA_MESSAGE,
  normalizeAiProviderResponseMetadata,
} from './desktopAiProviderResponse.mjs';
import { createIpcSenderAbortRegistry } from './ipcSenderAbortRegistry.mjs';

const activeAiProviderRequests = new Map();
const aiProviderSenderAbortRegistry = createIpcSenderAbortRegistry(createAbortError);
const AI_PROVIDER_CHUNK_ACK_TIMEOUT_MS = 30_000;
const MAX_ACTIVE_AI_PROVIDER_REQUESTS = 16;
const SAFE_AI_PROVIDER_RESPONSE_ERRORS = new Set([
  'AI provider response body is too large.',
  'Invalid AI provider response chunk.',
]);

function getAiProviderResponseErrorMessage(error) {
  let message = '';
  try {
    if (error instanceof Error && typeof error.message === 'string') {
      message = error.message;
    }
  } catch {}
  return SAFE_AI_PROVIDER_RESPONSE_ERRORS.has(message)
    ? message
    : 'AI provider response stream failed.';
}

function deleteActiveAiProviderRequest(requestId, active) {
  if (activeAiProviderRequests.get(requestId) === active) {
    activeAiProviderRequests.delete(requestId);
  }
  active.untrackSender();
}

function isCurrentAiProviderRequest(requestId, controller) {
  return activeAiProviderRequests.get(requestId)?.controller === controller;
}

function safeSend(sender, channel, payload) {
  if (!sender || sender.isDestroyed()) {
    return false;
  }

  try {
    sender.send(channel, payload);
    return true;
  } catch {
    return false;
  }
}

async function sendAiProviderResponseChunk(active, sendRequestEvent, value) {
  for (let offset = 0; offset < value.byteLength; offset += MAX_AI_PROVIDER_RESPONSE_IPC_CHUNK_BYTES) {
    const bytes = Uint8Array.from(value.subarray(
      offset,
      offset + MAX_AI_PROVIDER_RESPONSE_IPC_CHUNK_BYTES,
    ));
    const sequence = active.nextSequence;
    active.nextSequence += 1;
    let acknowledge;
    const acknowledged = new Promise((resolve) => {
      acknowledge = resolve;
    });
    const pendingAck = { acknowledge, acknowledged: false, sequence };
    active.pendingAck = pendingAck;
    if (!sendRequestEvent('chunk', { bytes, sequence })) {
      active.pendingAck = null;
      return false;
    }
    try {
      const timeoutId = setTimeout(() => {
        active.controller.abort(createAbortError());
      }, AI_PROVIDER_CHUNK_ACK_TIMEOUT_MS);
      timeoutId.unref?.();
      try {
        await raceWithAbort(acknowledged, active.controller.signal);
      } finally {
        clearTimeout(timeoutId);
      }
    } finally {
      if (active.pendingAck === pendingAck) active.pendingAck = null;
    }
  }

  return true;
}

export function registerDesktopAiProviderIpc({ handleIpc }) {
  handleIpc('desktop:ai-provider:request:start', async (event, requestId, rawRequest) => {
    const id = requireSafeIpcRequestId(requestId, 'AI provider request id');
    const sender = event.sender;
    if (!sender || sender.isDestroyed?.()) {
      throw new Error('AI provider request renderer is unavailable.');
    }
    const previous = activeAiProviderRequests.get(id);
    if (previous) {
      throw new Error('An AI provider request with this id is already active.');
    }
    if (activeAiProviderRequests.size >= MAX_ACTIVE_AI_PROVIDER_REQUESTS) {
      throw new Error('Too many AI provider requests are active.');
    }

    const request = normalizeAiProviderRequest(rawRequest);
    const controller = new AbortController();
    const active = {
      controller,
      nextSequence: 0,
      pendingAck: null,
      sender,
      untrackSender: () => {},
    };
    activeAiProviderRequests.set(id, active);
    active.untrackSender = aiProviderSenderAbortRegistry.track(sender, controller);
    if (sender.isDestroyed?.()) controller.abort(createAbortError());
    const sendRequestEvent = (suffix, payload) => {
      if (!isCurrentAiProviderRequest(id, controller)) {
        return false;
      }
      return safeSend(sender, `desktop:ai-provider:request:${id}:${suffix}`, payload);
    };

    let response;
    try {
      response = await fetchAiProviderRequestWithRetry(request, controller.signal);
    } catch (error) {
      deleteActiveAiProviderRequest(id, active);
      if (controller.signal.aborted) {
        throw error;
      }
      throw new Error(AI_PROVIDER_CONNECTION_FAILURE_CODE);
    }

    let metadata;
    let responseBody;
    try {
      metadata = normalizeAiProviderResponseMetadata(response);
      responseBody = response.body;
    } catch {
      controller.abort(createAbortError());
      deleteActiveAiProviderRequest(id, active);
      throw new Error(AI_PROVIDER_INVALID_RESPONSE_METADATA_MESSAGE);
    }

    void (async () => {
      try {
        if (!responseBody) {
          sendRequestEvent('done');
          return;
        }

        const reader = responseBody.getReader();
        const cancelReader = () => {
          void reader.cancel(createAbortError()).catch(() => {});
        };
        controller.signal.addEventListener('abort', cancelReader, { once: true });
        try {
          if (controller.signal.aborted) {
            throw createAbortError();
          }

          let responseBytesRead = 0;
          while (true) {
            const { done, value } = await raceWithAbort(reader.read(), controller.signal);
            if (controller.signal.aborted) {
              throw createAbortError();
            }
            if (done) {
              break;
            }
            const chunkByteLength = value?.byteLength;
            if (!Number.isFinite(chunkByteLength) || chunkByteLength < 0) {
              throw new Error('Invalid AI provider response chunk.');
            }
            responseBytesRead += chunkByteLength;
            if (responseBytesRead > MAX_AI_PROVIDER_RESPONSE_BODY_BYTES) {
              throw new Error('AI provider response body is too large.');
            }

            if (!(value instanceof Uint8Array)) {
              throw new Error('Invalid AI provider response chunk.');
            }
            if (!await sendAiProviderResponseChunk(active, sendRequestEvent, value)) {
              controller.abort();
              throw createAbortError();
            }
          }

          sendRequestEvent('done');
        } catch (error) {
          void reader.cancel(createAbortError()).catch(() => {});
          throw error;
        } finally {
          controller.signal.removeEventListener('abort', cancelReader);
          reader.releaseLock();
        }
      } catch (error) {
        if (controller.signal.aborted) {
          if (isCurrentAiProviderRequest(id, controller)) {
            safeSend(sender, `desktop:ai-provider:request:${id}:error`, {
              message: 'Aborted',
            });
          }
          return;
        }
        sendRequestEvent('error', {
          message: getAiProviderResponseErrorMessage(error),
        });
      } finally {
        deleteActiveAiProviderRequest(id, active);
      }
    })();

    return metadata;
  });

  handleIpc('desktop:ai-provider:request:ack', async (event, requestId, rawSequence) => {
    const id = requireSafeIpcRequestId(requestId, 'AI provider request id');
    if (!Number.isSafeInteger(rawSequence) || rawSequence < 0) return false;
    const active = activeAiProviderRequests.get(id);
    const pendingAck = active?.pendingAck;
    if (
      !active
      || active.sender !== event.sender
      || !pendingAck
      || pendingAck.sequence !== rawSequence
      || pendingAck.acknowledged
    ) {
      return false;
    }
    pendingAck.acknowledged = true;
    pendingAck.acknowledge();
    return true;
  });

  handleIpc('desktop:ai-provider:request:cancel', async (event, requestId) => {
    const id = requireSafeIpcRequestId(requestId, 'AI provider request id');
    const active = activeAiProviderRequests.get(id);
    if (!active || active.sender !== event.sender) return false;
    active.controller.abort();
    deleteActiveAiProviderRequest(id, active);
    return true;
  });
}
