import { useCallback } from 'react';
import { actions as aiActions } from '@/stores/useAIStore';
import type { AIModel, Provider } from '@/lib/ai/types';
import type { MessageKey, MessageValues } from '@/lib/i18n';
import { buildRequestHistory } from '@/lib/ai/requestContext';
import { isManagedProviderId } from '@/lib/ai/managedService';
import { useUnifiedStore } from '@/stores/unified/useUnifiedStore';
import { requestManager } from '@/lib/ai/requestManager';
import { runWithSessionMutationLock } from '@/lib/ai/sessionMutationLock';
import { buildStoredUserMessageContent } from './helpers';
import { runStreamedAssistantMessage } from './runStreamedAssistantMessage';
import { sendMessageWithEndpointFallback } from './sendMessageWithEndpointFallback';
import { hydrateSessionMessagesFromDisk } from '@/stores/ai/sessionConsistency';
import { addChatDebugLog } from '@/lib/debug/chatDebugLog';
import {
  buildChatErrorPayload,
  extractRawErrorMessage,
  markManagedAuthPromptForError,
} from './errorHandling';
import {
  canPersistAbortedRequestTranscript,
  createEmptyResponseError,
  finishPreStartedChatRequest,
  isChatRequestCancelled,
  throwIfChatRequestAborted,
} from './requestLifecycle';
import { shouldStopForManagedAccountState } from './managedRequestGate';
import { hydrateRequestHistoryForCurrentContent } from './hydrateRequestHistory';

type Translate = (key: MessageKey, values?: MessageValues) => string;

interface UseEditMessageOptions {
  currentSessionId: string | null;
  selectedModel: AIModel | undefined;
  providers: readonly Provider[];
  customSystemPrompt: string;
  includeTimeContext: boolean;
  webSearchEnabled: boolean;
  isAccountConnected: boolean;
  setSessionLoading: (sessionId: string, loading: boolean) => void;
  setError: (error: string | null) => void;
  maybeGenerateAutoTitle: (sessionId: string, providerId: string, modelId: string) => void;
  handleManagedQuotaErrorForVersionRollback: (
    sessionId: string,
    messageId: string,
    previousVersionIndex: number,
    error: unknown,
  ) => boolean;
  t: Translate;
}

export function useEditMessage({
  currentSessionId,
  selectedModel,
  providers,
  customSystemPrompt,
  includeTimeContext,
  webSearchEnabled,
  isAccountConnected,
  setSessionLoading,
  setError,
  maybeGenerateAutoTitle,
  handleManagedQuotaErrorForVersionRollback,
  t,
}: UseEditMessageOptions) {
  return useCallback(
    async (messageId: string, newContent: string) => {
      if (!currentSessionId || !selectedModel) {
        return;
      }

      const sessionId = currentSessionId;
      const provider = providers.find((item) => item.id === selectedModel.providerId);
      if (!provider) {
        return;
      }
      if (provider.enabled === false) {
        setError(t('chat.error.channelOff'));
        return;
      }
      if (await shouldStopForManagedAccountState({
        providerId: provider.id,
        isAccountConnected,
        sessionId,
        setError,
      })) {
        return;
      }

      const requestStartedAt = Date.now();
      const requestController = requestManager.start(sessionId);
      const ensureRequestActive = () => {
        if (isChatRequestCancelled(sessionId, requestController)) {
          throw new DOMException('Aborted', 'AbortError');
        }
      };
      setSessionLoading(sessionId, true);
      setError(null);

      void runWithSessionMutationLock(sessionId, async () => {
        ensureRequestActive();
        const initialMessages = await hydrateSessionMessagesFromDisk(sessionId);
        ensureRequestActive();
        const targetMessageBeforeEdit = initialMessages.find((message) => message.id === messageId);
        if (!targetMessageBeforeEdit) {
          finishPreStartedChatRequest(sessionId, requestController, setSessionLoading);
          return;
        }
        const previousVersionIndex = typeof targetMessageBeforeEdit.currentVersionIndex === 'number'
          ? targetMessageBeforeEdit.currentVersionIndex
          : 0;

        const rollbackVersionIndex = aiActions.editMessageAndBranch(sessionId, messageId, newContent)
          ?? previousVersionIndex;

        const assistantMessageId = aiActions.addMessage({
          role: 'assistant',
          content: '',
          modelId: selectedModel.id,
        }, sessionId, {
          persistUnified: false,
          touchSession: false,
        });
        if (!assistantMessageId) {
          finishPreStartedChatRequest(sessionId, requestController, setSessionLoading);
          return;
        }

        addChatDebugLog('chat', 'edit resend started', {
          sessionId,
          messageId,
          modelId: selectedModel.id,
          providerId: provider.id,
          webSearchEnabled,
        });
        const state = useUnifiedStore.getState();
        const sessionMessages = state.data.ai?.messages[sessionId] || [];

        const userMsgIndex = sessionMessages.findIndex((message) => message.id === messageId);
        if (userMsgIndex === -1) {
          finishPreStartedChatRequest(sessionId, requestController, setSessionLoading);
          return;
        }

        const history = sessionMessages.slice(0, userMsgIndex);
        const timezoneOffset = useUnifiedStore.getState().data.settings.timezone.offset;
        const requestHistory = buildRequestHistory({
          history,
          modelId: selectedModel.id,
          timezoneOffset,
          includeTimeContext,
          customSystemPrompt,
        });
        ensureRequestActive();

        void runStreamedAssistantMessage({
          sessionId,
          assistantMessageId,
          controller: requestController,
          execute: async (onChunk, signal, { isActiveRequest }) => {
            throwIfChatRequestAborted(signal);
            const apiMessageContent = await buildStoredUserMessageContent(newContent);
            throwIfChatRequestAborted(signal);
            const hydratedRequestHistory = await hydrateRequestHistoryForCurrentContent(
              requestHistory,
              apiMessageContent,
              signal,
            );
            return await sendMessageWithEndpointFallback({
              content: apiMessageContent,
              history: hydratedRequestHistory,
              model: selectedModel,
              provider,
              onChunk,
              signal,
              options: {
                webSearchEnabled,
                onWebSearchStatus: (status) => {
                  if (!isActiveRequest()) {
                    return;
                  }
                  aiActions.updateMessageWebSearchStatus(sessionId, assistantMessageId, status);
                  addChatDebugLog('web-search', `status:${status.phase}`, {
                    sessionId,
                    query: status.query,
                    urls: status.urls,
                    resultCount: status.results?.length,
                    metrics: status.metrics,
                    message: status.message,
                  }, status.phase === 'error' ? 'warn' : 'info');
                },
                onApiTranscript: (apiTranscript) => {
                  if (
                    !isActiveRequest() &&
                    !canPersistAbortedRequestTranscript(sessionId, requestController)
                  ) {
                    return;
                  }
                  aiActions.updateMessageApiTranscript(sessionId, assistantMessageId, apiTranscript);
                },
              },
            });
          },
          updateMessage: aiActions.updateMessage,
          completeMessage: aiActions.completeMessage,
          setSessionLoading,
          setError,
          buildErrorPayload: (error) => {
            const isManaged = isManagedProviderId(provider.id);
            markManagedAuthPromptForError(sessionId, error, isManaged);
            return buildChatErrorPayload(error, isManaged);
          },
          handleError: (error) => {
            if (!isManagedProviderId(provider.id)) {
              return false;
            }
            return handleManagedQuotaErrorForVersionRollback(sessionId, messageId, rollbackVersionIndex, error);
          },
          createEmptyResponseError: () => createEmptyResponseError(provider.id),
          onSuccess: ({ resolvedSessionId }) => {
            addChatDebugLog('chat', 'edit resend completed', {
              sessionId: resolvedSessionId,
              originalSessionId: sessionId,
              assistantMessageId,
              durationMs: Date.now() - requestStartedAt,
            });
            maybeGenerateAutoTitle(resolvedSessionId, provider.id, selectedModel.id);
          },
        }).then((status) => {
          if (status === 'aborted') {
            addChatDebugLog('chat', 'edit resend aborted', {
              sessionId,
              assistantMessageId,
              durationMs: Date.now() - requestStartedAt,
            }, 'warn');
          }
          return status;
        }).catch((error) => {
          if (isChatRequestCancelled(sessionId, requestController)) {
            return 'aborted' as const;
          }
          addChatDebugLog('chat', 'edit resend stream runner failed unexpectedly', {
            sessionId,
            assistantMessageId,
            durationMs: Date.now() - requestStartedAt,
            error: extractRawErrorMessage(error),
          }, 'error');
          const isManaged = isManagedProviderId(provider.id);
          markManagedAuthPromptForError(sessionId, error, isManaged);
          const { message, xml } = buildChatErrorPayload(error, isManaged);
          setError(message);
          aiActions.updateMessage(sessionId, assistantMessageId, xml);
          aiActions.completeMessage(sessionId, assistantMessageId);
          return 'failed' as const;
        });
      }).catch((error) => {
        const cancelled = isChatRequestCancelled(sessionId, requestController);
        finishPreStartedChatRequest(sessionId, requestController, setSessionLoading);
        if (cancelled) {
          addChatDebugLog('chat', 'edit resend aborted before stream start', {
            sessionId,
            messageId,
            durationMs: Date.now() - requestStartedAt,
          }, 'warn');
          return;
        }
        addChatDebugLog('chat', 'edit resend mutation failed', {
          sessionId,
          messageId,
          error: extractRawErrorMessage(error),
        }, 'error');
        const isManaged = isManagedProviderId(provider.id);
        markManagedAuthPromptForError(sessionId, error, isManaged);
        const { message } = buildChatErrorPayload(error, isManaged);
        setError(message);
      });
    },
    [
      currentSessionId,
      selectedModel,
      providers,
      customSystemPrompt,
      includeTimeContext,
      webSearchEnabled,
      setError,
      setSessionLoading,
      maybeGenerateAutoTitle,
      handleManagedQuotaErrorForVersionRollback,
      isAccountConnected,
      t,
    ],
  );
}
