import { getElectronBridge } from '@/lib/electron/bridge';
import { createAbortError, throwIfAborted } from './providerHttpAbort';
import { fetchWithGetRetry, normalizeProviderRequestUrl } from './providerHttpBrowser';
import { normalizeDesktopRequestBody } from './providerHttpBody';
import type { ProviderFetchInit } from './providerHttpTypes';

const MAX_DESKTOP_PROVIDER_RESPONSE_BODY_BYTES = 64 * 1024 * 1024;

export async function providerFetch(url: string, init: ProviderFetchInit): Promise<Response> {
  const safeUrl = normalizeProviderRequestUrl(url);
  const bridge = getElectronBridge();
  if (bridge?.aiProvider) {
    return desktopProviderFetch(safeUrl, init, bridge.aiProvider);
  }

  return fetchWithGetRetry(safeUrl, init);
}

async function desktopProviderFetch(
  url: string,
  init: ProviderFetchInit,
  aiProvider: NonNullable<ReturnType<typeof getElectronBridge>>['aiProvider']
): Promise<Response> {
  const requestId = createRequestId();
  const cleanupCallbacks: Array<() => void> = [];
  let didSettle = false;
  let streamController: ReadableStreamDefaultController<Uint8Array> | null = null;
  let rejectStartOnTerminalError: ((error: Error | DOMException) => void) | null = null;
  let terminalError: Error | DOMException | null = null;
  let listenerRegistrationError: unknown = null;
  let didReceiveMetadata = false;
  let didStartRequest = false;
  let responseBytesReceived = 0;
  let pendingChunk: { bytes: Uint8Array; sequence: number } | null = null;

  const cleanup = () => {
    cleanupCallbacks.splice(0).forEach((cleanupCallback) => cleanupCallback());
  };

  const abortRequest = () => {
    if (terminalError || (didSettle && didReceiveMetadata)) return;
    didSettle = true;
    void aiProvider.cancelRequest(requestId).catch(() => {});
    const abortError = createAbortError();
    terminalError = abortError;
    try {
      streamController?.error(abortError);
    } catch {
    }
    rejectStartOnTerminalError?.(abortError);
    cleanup();
  };

  const failRequest = (error: Error) => {
    if (didSettle) return;
    didSettle = true;
    terminalError = error;
    pendingChunk = null;
    void aiProvider.cancelRequest(requestId).catch(() => {});
    try {
      streamController?.error(error);
    } catch {
    }
    rejectStartOnTerminalError?.(error);
    cleanup();
  };

  const acknowledgeChunk = (sequence: number) => {
    void aiProvider.acknowledgeRequestChunk(requestId, sequence).then((acknowledged) => {
      if (!acknowledged) {
        failRequest(new Error('Desktop AI provider response acknowledgement was rejected.'));
      }
    }).catch(() => {
      failRequest(new Error('Desktop AI provider response acknowledgement failed.'));
    });
  };

  const enqueuePendingChunk = (controller: ReadableStreamDefaultController<Uint8Array>) => {
    if (didSettle || !pendingChunk || (controller.desiredSize ?? 0) <= 0) return;
    const { bytes, sequence } = pendingChunk;
    pendingChunk = null;
    try {
      controller.enqueue(bytes);
    } catch {
      failRequest(new Error('Desktop AI provider response stream could not accept data.'));
      return;
    }
    acknowledgeChunk(sequence);
  };

  if (init.signal?.aborted) {
    throw createAbortError();
  }

  init.signal?.addEventListener('abort', abortRequest, { once: true });
  cleanupCallbacks.push(() => init.signal?.removeEventListener('abort', abortRequest));

  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      streamController = controller;
      try {
        cleanupCallbacks.push(aiProvider.onRequestChunk(requestId, (chunk, sequence) => {
          if (didSettle || init.signal?.aborted) return;
          const isByteArray = ArrayBuffer.isView(chunk)
            && !(chunk instanceof DataView)
            && chunk.BYTES_PER_ELEMENT === 1;
          const chunkBytes = isByteArray ? chunk.byteLength : 0;
          responseBytesReceived += chunkBytes;
          if (responseBytesReceived > MAX_DESKTOP_PROVIDER_RESPONSE_BODY_BYTES) {
            failRequest(new Error('Desktop AI provider response body is too large.'));
            return;
          }
          if (
            !isByteArray
            || chunk.byteLength > 256 * 1024
            || !Number.isSafeInteger(sequence)
            || sequence < 0
            || pendingChunk
          ) {
            failRequest(new Error('Invalid desktop AI provider response chunk.'));
            return;
          }
          pendingChunk = {
            bytes: new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength),
            sequence,
          };
          enqueuePendingChunk(controller);
        }));
        cleanupCallbacks.push(aiProvider.onRequestDone(requestId, () => {
          if (didSettle || init.signal?.aborted) return;
          if (!didStartRequest) {
            failRequest(new Error('AI provider request completed before it was started.'));
            return;
          }
          didSettle = true;
          try {
            controller.close();
          } catch {
          }
          if (didReceiveMetadata) cleanup();
        }));
        cleanupCallbacks.push(aiProvider.onRequestError(requestId, (payload) => {
          if (didSettle || init.signal?.aborted) return;
          didSettle = true;
          const error = new Error(readDesktopProviderErrorMessage(payload));
          if (!didReceiveMetadata) {
            terminalError = error;
            rejectStartOnTerminalError?.(error);
          }
          controller.error(error);
          cleanup();
        }));
      } catch (error) {
        didSettle = true;
        listenerRegistrationError = error;
        cleanup();
        controller.error(error);
      }
    },
    cancel() {
      abortRequest();
    },
    pull(controller) {
      enqueuePendingChunk(controller);
    },
  });

  try {
    const terminalErrorPromise = new Promise<never>((_, reject) => {
      rejectStartOnTerminalError = reject;
    });
    terminalErrorPromise.catch(() => undefined);
    if (listenerRegistrationError) {
      throw listenerRegistrationError;
    }
    const requestBody = await normalizeDesktopRequestBody(init.body, init.signal);
    if (terminalError) {
      throw terminalError;
    }
    if (didSettle) {
      return await terminalErrorPromise;
    }

    didStartRequest = true;
    const startRequestPromise = aiProvider.startRequest(requestId, {
      url,
      method: init.method,
      headers: init.headers,
      ...requestBody,
    });
    startRequestPromise.catch(() => undefined);

    const metadata = await Promise.race([startRequestPromise, terminalErrorPromise]);
    throwIfAborted(init.signal);
    didReceiveMetadata = true;
    rejectStartOnTerminalError = null;
    if (didSettle) cleanup();

    try {
      const responseBody = didSettle && responseBytesReceived === 0 ? null : body;
      return new Response(responseBody, {
        status: metadata.status,
        statusText: metadata.statusText,
        headers: new Headers(metadata.headers),
      });
    } catch (error) {
      void aiProvider.cancelRequest(requestId).catch(() => {});
      throw error;
    }
  } catch (error) {
    didSettle = true;
    cleanup();
    throw error;
  }
}

function readDesktopProviderErrorMessage(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return 'AI provider request failed';
  try {
    const message = (payload as { message?: unknown }).message;
    return typeof message === 'string' && message.length <= 8192 && message
      ? message
      : 'AI provider request failed';
  } catch {
    return 'AI provider request failed';
  }
}

function createRequestId(): string {
  return `provider-${crypto.randomUUID()}`;
}
