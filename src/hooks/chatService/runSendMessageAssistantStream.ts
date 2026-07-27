import { actions as aiActions } from '@/stores/useAIStore';
import type { AIModel, ChatMessage, ChatMessageContent, Provider } from '@/lib/ai/types';
import { isManagedProviderId } from '@/lib/ai/managedService';
import { isTemporarySession, isTemporarySessionId } from '@/lib/ai/temporaryChat';
import { useAIUIStore } from '@/stores/ai/chatState';
import { useUnifiedStore } from '@/stores/unified/useUnifiedStore';
import { addChatDebugLog } from '@/lib/debug/chatDebugLog';
import {
  buildChatErrorPayload,
  extractRawErrorMessage,
  markManagedAuthPromptForError,
} from './errorHandling';
import { refreshManagedBudgetIfNeeded } from './helpers';
import {
  canPersistAbortedRequestTranscript,
  createEmptyResponseError,
  isChatRequestCancelled,
  type ActiveComposerRequest,
} from './requestLifecycle';
import { runStreamedAssistantMessage } from './runStreamedAssistantMessage';
import { sendMessageWithEndpointFallback } from './sendMessageWithEndpointFallback';
import {
  hydrateRequestHistoryForCurrentContent,
} from './hydrateRequestHistory';

interface RunSendMessageAssistantStreamOptions {
  targetSessionId: string;
  assistantMessageId: string;
  requestController: AbortController;
  requestStartedAt: number;
  apiMessageContent: ChatMessageContent;
  requestHistory: ChatMessage[];
  selectedModel: AIModel;
  provider: Provider;
  webSearchEnabled: boolean;
  computerUseEnabled: boolean;
  computerUseCwd: string;
  composerRequest: ActiveComposerRequest;
  setSessionLoading: (sessionId: string, loading: boolean) => void;
  setError: (error: string | null) => void;
  clearActiveComposerRequest: (request: ActiveComposerRequest | null) => void;
  handleManagedQuotaErrorForComposer: (request: ActiveComposerRequest, error: unknown) => boolean;
  maybeGenerateAutoTitle: (sessionId: string, providerId: string, modelId: string) => void;
  markSessionUnread: (sessionId: string) => void;
}

export function runSendMessageAssistantStream({
  targetSessionId,
  assistantMessageId,
  requestController,
  requestStartedAt,
  apiMessageContent,
  requestHistory,
  selectedModel,
  provider,
  webSearchEnabled,
  computerUseEnabled,
  computerUseCwd,
  composerRequest,
  setSessionLoading,
  setError,
  clearActiveComposerRequest,
  handleManagedQuotaErrorForComposer,
  maybeGenerateAutoTitle,
  markSessionUnread,
}: RunSendMessageAssistantStreamOptions) {
  return runStreamedAssistantMessage({
    sessionId: targetSessionId,
    assistantMessageId,
    controller: requestController,
    execute: async (onChunk, signal, { isActiveRequest }) => {
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
          computerUseEnabled,
          computerUseCwd: computerUseCwd || undefined,
          computerUseApprovalContext: {
            sessionId: targetSessionId,
            messageId: assistantMessageId,
          },
          onComputerCommandStatus: (status) => {
            if (!isActiveRequest()) return;
            addChatDebugLog('computer-use', `status:${status.phase}`, {
              sessionId: targetSessionId,
              messageId: assistantMessageId,
              commandLength: status.command.length,
              exitCode: status.exitCode,
              durationMs: status.durationMs,
              truncated: status.truncated,
            }, status.phase === 'failed' || status.phase === 'timed_out' ? 'warn' : 'info');
          },
          onWebSearchStatus: (status) => {
            if (!isActiveRequest()) {
              return;
            }
            aiActions.updateMessageWebSearchStatus(targetSessionId, assistantMessageId, status);
            addChatDebugLog('web-search', `status:${status.phase}`, {
              sessionId: targetSessionId,
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
              !canPersistAbortedRequestTranscript(targetSessionId, requestController)
            ) {
              return;
            }
            addChatDebugLog('chat', 'api transcript updated', {
              sessionId: targetSessionId,
              messageId: assistantMessageId,
              transcriptMessages: apiTranscript.length,
            });
            aiActions.updateMessageApiTranscript(targetSessionId, assistantMessageId, apiTranscript);
          },
          onRetryStatus: (message) => {
            if (!isActiveRequest()) {
              return;
            }
            aiActions.updateMessage(targetSessionId, assistantMessageId, message);
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
      markManagedAuthPromptForError(targetSessionId, error, isManaged);
      return buildChatErrorPayload(error, isManaged);
    },
    handleError: (error) => {
      if (!isManagedProviderId(provider.id)) {
        return false;
      }
      return handleManagedQuotaErrorForComposer(composerRequest, error);
    },
    createEmptyResponseError: () => createEmptyResponseError(provider.id),
    onSuccess: ({ resolvedSessionId }) => {
      const completionSessionId = resolvedSessionId;
      const completionSession = useUnifiedStore
        .getState()
        .data.ai?.sessions.find((session) => session.id === completionSessionId);
      const isPersistentCompletion =
        !!completionSession &&
        !isTemporarySessionId(completionSessionId) &&
        !isTemporarySession(completionSession);

      addChatDebugLog('chat', 'sendMessage completed', {
        sessionId: completionSessionId,
        originalSessionId: targetSessionId,
        messageId: assistantMessageId,
        durationMs: Date.now() - requestStartedAt,
      });
      refreshManagedBudgetIfNeeded(provider.id);
      if (isPersistentCompletion) {
        maybeGenerateAutoTitle(completionSessionId, provider.id, selectedModel.id);
      }

      const current = useAIUIStore.getState().currentSessionId;
      if (completionSessionId !== current && isPersistentCompletion) {
        markSessionUnread(completionSessionId);
      }
    },
  }).then((status) => {
    if (status === 'aborted') {
      addChatDebugLog('chat', 'sendMessage aborted', {
        sessionId: targetSessionId,
        messageId: assistantMessageId,
        durationMs: Date.now() - requestStartedAt,
      }, 'warn');
    }
    clearActiveComposerRequest(composerRequest);
    return status;
  }).catch((error) => {
    if (isChatRequestCancelled(targetSessionId, requestController)) {
      clearActiveComposerRequest(composerRequest);
      return 'aborted' as const;
    }
    addChatDebugLog('chat', 'sendMessage stream runner failed unexpectedly', {
      sessionId: targetSessionId,
      durationMs: Date.now() - requestStartedAt,
      error: extractRawErrorMessage(error),
    }, 'error');
    const isManaged = isManagedProviderId(provider.id);
    markManagedAuthPromptForError(targetSessionId, error, isManaged);
    const { message, xml } = buildChatErrorPayload(error, isManaged);
    setError(message);
    aiActions.updateMessage(targetSessionId, assistantMessageId, xml);
    aiActions.completeMessage(targetSessionId, assistantMessageId);
    clearActiveComposerRequest(composerRequest);
    return 'failed' as const;
  });
}
