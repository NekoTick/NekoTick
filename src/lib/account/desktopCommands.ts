import type { AccountProvider, MembershipTier } from '@/stores/accountSession/state';
import type { ManagedBudgetPayload } from '@/lib/ai/managed/types';
import { getElectronBridge } from '@/lib/electron/bridge';
import { ACCOUNT_AUTH_INVALIDATED_EVENT } from './sessionEvent';
import {
  createAbortError,
  publicManagedStreamErrorMessage,
  runCancellableManagedJsonRequest,
  serializeBinaryBodyForDesktop,
  throwIfAborted,
} from './desktopManagedRequests';

let accountAuthInvalidationBridgeRegistered = false;

function registerAccountAuthInvalidationBridge(): void {
  if (accountAuthInvalidationBridgeRegistered || typeof window === 'undefined') {
    return;
  }

  accountAuthInvalidationBridgeRegistered = true;
  window.addEventListener(ACCOUNT_AUTH_INVALIDATED_EVENT, () => {
    accountAuthInvalidationBridgeRegistered = false;
  }, { once: true });
}

registerAccountAuthInvalidationBridge();

function getDesktopAccountBridge() {
  const bridge = getElectronBridge();
  if (!bridge) {
    throw new Error('Electron desktop bridge is not available.');
  }

  return bridge.account;
}

function dispatchAccountInvalidatedEvent(): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(new Event(ACCOUNT_AUTH_INVALIDATED_EVENT));
}

export const accountCommands = {
  async getAccountSessionStatus(): Promise<{
    connected: boolean;
    provider: AccountProvider | null;
    username: string | null;
    primaryEmail: string | null;
    avatarUrl: string | null;
    membershipTier: MembershipTier | null;
    membershipName: string | null;
    sessionInvalidated?: boolean;
    persistent?: boolean;
    budget?: ManagedBudgetPayload | null;
  }> {
    return await getDesktopAccountBridge().getSessionStatus() as {
      connected: boolean;
      provider: AccountProvider | null;
      username: string | null;
      primaryEmail: string | null;
      avatarUrl: string | null;
      membershipTier: MembershipTier | null;
      membershipName: string | null;
      sessionInvalidated?: boolean;
      persistent?: boolean;
      budget?: ManagedBudgetPayload | null;
    };
  },

  async accountAuth(provider: Exclude<AccountProvider, 'email'>) {
    return await getDesktopAccountBridge().startAuth(provider);
  },

  async cancelAccountAuth() {
    return await getDesktopAccountBridge().cancelAuth?.();
  },

  async requestEmailAuthCode(email: string, locale?: string) {
    return await getDesktopAccountBridge().requestEmailCode(email, locale);
  },

  async verifyEmailAuthCode(email: string, code: string) {
    return await getDesktopAccountBridge().verifyEmailCode(email, code);
  },

  async getManagedModels() {
    return await getDesktopAccountBridge().getManagedModels();
  },

  async getManagedModelsVersion() {
    return await getDesktopAccountBridge().getManagedModelsVersion();
  },

  async getManagedBudget() {
    return await getDesktopAccountBridge().getManagedBudget();
  },

  async reportManagedClientDiagnostic(body: Record<string, unknown>) {
    return await getDesktopAccountBridge().reportManagedClientDiagnostic(body);
  },

  async managedChatCompletion(body: object, signal?: AbortSignal) {
    const bridge = getDesktopAccountBridge();
    return await runCancellableManagedJsonRequest({
      signal,
      requestIdPrefix: 'managed-json',
      start: (requestId) => bridge.managedChatCompletion(body, requestId),
      cancel: (requestId) => bridge.cancelManagedChatCompletion(requestId),
    });
  },

  async managedImageGeneration(body: object, signal?: AbortSignal) {
    const bridge = getDesktopAccountBridge();
    return await runCancellableManagedJsonRequest({
      signal,
      requestIdPrefix: 'managed-image-generation',
      start: (requestId) => bridge.managedImageGeneration(body, requestId),
      cancel: (requestId) => bridge.cancelManagedImageGeneration(requestId),
    });
  },

  async managedImageEdit(body: BodyInit, headers: Record<string, string>, signal?: AbortSignal) {
    const payload = await serializeBinaryBodyForDesktop(body, headers, signal);
    throwIfAborted(signal);
    const bridge = getDesktopAccountBridge();
    return await runCancellableManagedJsonRequest({
      signal,
      requestIdPrefix: 'managed-image-edit',
      start: (requestId) => bridge.managedImageEdit(payload, requestId),
      cancel: (requestId) => bridge.cancelManagedImageEdit(requestId),
    });
  },

  async managedChatCompletionStream(
    body: Record<string, unknown>,
    onChunk: (chunk: string) => void,
    signal?: AbortSignal,
    externalRequestId?: string
  ) {
    const requestId = externalRequestId?.trim() || `managed-${crypto.randomUUID()}`;
    const bridge = getDesktopAccountBridge();
    if (signal?.aborted) {
      void bridge.cancelManagedChatCompletionStream(requestId);
      throw createAbortError();
    }

    return await new Promise<string>((resolve, reject) => {
      let isSettled = false;
      let streamedContent = '';

      const cleanupCallbacks: Array<() => void> = [];
      const cleanup = () => {
        while (cleanupCallbacks.length > 0) {
          cleanupCallbacks.pop()?.();
        }
      };
      const addCleanupCallback = (cleanupCallback: () => void) => {
        if (isSettled) {
          cleanupCallback();
          return;
        }
        cleanupCallbacks.push(cleanupCallback);
      };
      const settleRejected = (error: unknown) => {
        if (isSettled) return;
        isSettled = true;
        cleanup();
        reject(error);
      };
      const settleAborted = () => {
        void bridge.cancelManagedChatCompletionStream(requestId);
        settleRejected(new DOMException('Aborted', 'AbortError'));
      };

      try {
        addCleanupCallback(
          bridge.onManagedStreamChunk(requestId, (payload) => {
            if (isSettled) return;
            try {
              throwIfAborted(signal);
              if (typeof payload === 'string') {
                streamedContent = payload;
              } else if (payload && typeof payload.delta === 'string') {
                streamedContent += payload.delta;
              } else {
                throw new Error('Invalid managed stream chunk payload.');
              }
              onChunk(streamedContent);
              throwIfAborted(signal);
            } catch (error) {
              if (signal?.aborted) {
                settleAborted();
                return;
              }
              void bridge.cancelManagedChatCompletionStream(requestId);
              settleRejected(error);
            }
          })
        );
        if (isSettled) return;

        addCleanupCallback(
          bridge.onManagedStreamDone(requestId, ({ content }) => {
            if (isSettled) return;
            if (signal?.aborted) {
              settleAborted();
              return;
            }
            isSettled = true;
            cleanup();
            resolve(content);
          })
        );
        if (isSettled) return;

        addCleanupCallback(
          bridge.onManagedStreamError(requestId, ({ message, statusCode, errorCode }) => {
            if (isSettled) return;
            if (signal?.aborted) {
              settleAborted();
              return;
            }
            const error = new Error(publicManagedStreamErrorMessage(message, errorCode)) as Error & {
              statusCode?: number;
              errorCode?: string;
            };
            if (typeof statusCode === 'number') {
              error.statusCode = statusCode;
            }
            if (typeof errorCode === 'string' && errorCode.trim()) {
              error.errorCode = errorCode.trim();
            }
            settleRejected(error);
          })
        );
      } catch (error) {
        settleRejected(error);
        return;
      }

      if (signal?.aborted) {
        settleAborted();
        return;
      }

      if (signal) {
        const abortHandler = () => {
          settleAborted();
        };
        signal.addEventListener('abort', abortHandler, { once: true });
        addCleanupCallback(() => {
          signal.removeEventListener('abort', abortHandler);
        });
      }

      try {
        void Promise.resolve(bridge.startManagedChatCompletionStream(requestId, body))
          .catch(settleRejected);
      } catch (error) {
        settleRejected(error);
      }
    });
  },

  async accountDisconnect() {
    await getDesktopAccountBridge().disconnect();
    dispatchAccountInvalidatedEvent();
  },
};
