import { useCallback } from 'react';
import { actions as aiActions } from '@/stores/useAIStore';
import type { AIModel, ChatMessage, ChatMessageContent, Provider } from '@/lib/ai/types';
import type { MessageKey, MessageValues } from '@/lib/i18n';
import { buildRequestHistory } from '@/lib/ai/requestContext';
import { isManagedProviderId } from '@/lib/ai/managedService';
import { useUnifiedStore } from '@/stores/unified/useUnifiedStore';
import { requestManager } from '@/lib/ai/requestManager';
import { runWithSessionMutationLock } from '@/lib/ai/sessionMutationLock';
import {
  buildStoredUserMessageContent,
  refreshManagedBudgetIfNeeded,
} from './helpers';
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
import {
  hydrateRequestHistoryContexts,
  hydrateRequestHistoryForCurrentContent,
} from './hydrateRequestHistory';
import {
  getHistoryMessageRequestContent,
  getHistoryMessageRequestContext,
} from '@/lib/ai/requestContextHistoryContent';

type Translate = (key: MessageKey, values?: MessageValues) => string;

interface UseRegenerateMessageOptions {
  currentSessionId: string | null;
  selectedModel: AIModel | undefined;
  providers: readonly Provider[];
  customSystemPrompt: string;
  includeTimeContext: boolean;
  webSearchEnabled: boolean;
  computerUseEnabled: boolean;
  computerUseCwd: string;
  messages: readonly unknown[];
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

export function useRegenerateMessage({
  currentSessionId,
  selectedModel,
  providers,
  customSystemPrompt,
  includeTimeContext,
  webSearchEnabled,
  computerUseEnabled,
  computerUseCwd,
  messages,
  isAccountConnected,
  setSessionLoading,
  setError,
  maybeGenerateAutoTitle,
  handleManagedQuotaErrorForVersionRollback,
  t,
}: UseRegenerateMessageOptions) {
  return useCallback(
    async (messageId: string) => {
      if (!selectedModel || !currentSessionId) {
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
        const latestMessages = await hydrateSessionMessagesFromDisk(sessionId);
        ensureRequestActive();
        const messageIndex = latestMessages.findIndex((message) => message.id === messageId);
        if (messageIndex <= 0) {
          finishPreStartedChatRequest(sessionId, requestController, setSessionLoading);
          return;
        }

        const promptMessage = latestMessages[messageIndex - 1];
        if (promptMessage.role !== 'user') {
          finishPreStartedChatRequest(sessionId, requestController, setSessionLoading);
          return;
        }

        const targetMessageBeforeRegenerate = latestMessages[messageIndex];
        const previousVersionIndex = typeof targetMessageBeforeRegenerate.currentVersionIndex === 'number'
          ? targetMessageBeforeRegenerate.currentVersionIndex
          : 0;
        const history = latestMessages.slice(0, messageIndex - 1);

        aiActions.addVersion(messageId, sessionId);

        addChatDebugLog('chat', 'regenerate started', {
          sessionId,
          messageId,
          modelId: selectedModel.id,
          providerId: provider.id,
          webSearchEnabled,
          computerUseEnabled,
        });
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
          assistantMessageId: messageId,
          controller: requestController,
          execute: async (onChunk, signal, { isActiveRequest }) => {
            throwIfChatRequestAborted(signal);
            let apiMessageContent: ChatMessageContent;
            let hydratedRequestHistory: ChatMessage[];
            if (getHistoryMessageRequestContext(promptMessage)) {
              const hydratedMessages = await hydrateRequestHistoryContexts(
                [...requestHistory, promptMessage],
                signal,
              );
              const hydratedPrompt = hydratedMessages.pop()!;
              apiMessageContent = getHistoryMessageRequestContent(hydratedPrompt);
              hydratedRequestHistory = hydratedMessages;
            } else {
              apiMessageContent = await buildStoredUserMessageContent(promptMessage.content);
              throwIfChatRequestAborted(signal);
              hydratedRequestHistory = await hydrateRequestHistoryForCurrentContent(
                requestHistory,
                apiMessageContent,
                signal,
              );
            }
            throwIfChatRequestAborted(signal);
            return await sendMessageWithEndpointFallback({
              content: apiMessageContent,
              history: hydratedRequestHistory,
              model: selectedModel,
              provider,
              onChunk,
              signal,
              options: {
                webSearchEnabled,
                computerUseEnabled,
                computerUseCwd: computerUseCwd || undefined,
                computerUseApprovalContext: {
                  sessionId,
                  messageId,
                },
                onComputerCommandStatus: (status) => {
                  if (!isActiveRequest()) return;
                  addChatDebugLog('computer-use', `status:${status.phase}`, {
                    sessionId,
                    messageId,
                    commandLength: status.command.length,
                    exitCode: status.exitCode,
                  }, status.phase === 'failed' || status.phase === 'timed_out' ? 'warn' : 'info');
                },
                onWebSearchStatus: (status) => {
                  if (!isActiveRequest()) {
                    return;
                  }
                  aiActions.updateMessageWebSearchStatus(sessionId, messageId, status);
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
                  aiActions.updateMessageApiTranscript(sessionId, messageId, apiTranscript);
                },
                onRetryStatus: (message) => {
                  if (!isActiveRequest()) {
                    return;
                  }
                  aiActions.updateMessage(sessionId, messageId, message);
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
            return handleManagedQuotaErrorForVersionRollback(sessionId, messageId, previousVersionIndex, error);
          },
          createEmptyResponseError: () => createEmptyResponseError(provider.id),
          onSuccess: ({ resolvedSessionId }) => {
            addChatDebugLog('chat', 'regenerate completed', {
              sessionId: resolvedSessionId,
              originalSessionId: sessionId,
              messageId,
              durationMs: Date.now() - requestStartedAt,
            });
            refreshManagedBudgetIfNeeded(provider.id);
            maybeGenerateAutoTitle(resolvedSessionId, provider.id, selectedModel.id);
          },
        }).then((status) => {
          if (status === 'aborted') {
            addChatDebugLog('chat', 'regenerate aborted', {
              sessionId,
              messageId,
              durationMs: Date.now() - requestStartedAt,
            }, 'warn');
          }
          return status;
        }).catch((error) => {
          if (isChatRequestCancelled(sessionId, requestController)) {
            return 'aborted' as const;
          }
          addChatDebugLog('chat', 'regenerate stream runner failed unexpectedly', {
            sessionId,
            messageId,
            durationMs: Date.now() - requestStartedAt,
            error: extractRawErrorMessage(error),
          }, 'error');
          const isManaged = isManagedProviderId(provider.id);
          markManagedAuthPromptForError(sessionId, error, isManaged);
          const { message, xml } = buildChatErrorPayload(error, isManaged);
          setError(message);
          aiActions.updateMessage(sessionId, messageId, xml);
          aiActions.completeMessage(sessionId, messageId);
          return 'failed' as const;
        });
      }).catch((error) => {
        const cancelled = isChatRequestCancelled(sessionId, requestController);
        finishPreStartedChatRequest(sessionId, requestController, setSessionLoading);
        if (cancelled) {
          addChatDebugLog('chat', 'regenerate aborted before stream start', {
            sessionId,
            messageId,
            durationMs: Date.now() - requestStartedAt,
          }, 'warn');
          return;
        }
        addChatDebugLog('chat', 'regenerate mutation failed', {
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
      computerUseEnabled,
      computerUseCwd,
      setSessionLoading,
      setError,
      maybeGenerateAutoTitle,
      handleManagedQuotaErrorForVersionRollback,
      messages,
      isAccountConnected,
      t,
    ],
  );
}
