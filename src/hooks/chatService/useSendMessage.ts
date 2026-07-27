import { type MutableRefObject, useCallback } from 'react';
import { actions as aiActions } from '@/stores/useAIStore';
import type { Attachment } from '@/lib/storage/attachmentStorage';
import type { AIModel, Provider } from '@/lib/ai/types';
import type { MessageKey, MessageValues } from '@/lib/i18n';
import type { NoteMentionReference } from '@/lib/ai/noteMentions';
import { buildRequestHistory } from '@/lib/ai/requestContext';
import { isManagedProviderId } from '@/lib/ai/managedService';
import { useUnifiedStore } from '@/stores/unified/useUnifiedStore';
import { requestManager } from '@/lib/ai/requestManager';
import { isTemporarySession, isTemporarySessionId } from '@/lib/ai/temporaryChat';
import { runWithSessionMutationLock } from '@/lib/ai/sessionMutationLock';
import { hydrateSessionMessagesFromDisk } from '@/stores/ai/sessionConsistency';
import { addChatDebugLog } from '@/lib/debug/chatDebugLog';
import {
  buildChatErrorPayload,
  extractRawErrorMessage,
  markManagedAuthPromptForError,
} from './errorHandling';
import {
  finishPreStartedChatRequest,
  isChatRequestCancelled,
  type ActiveComposerRequest,
} from './requestLifecycle';
import { makeTemporaryAttachmentsEphemeral } from './temporaryAttachments';
import { shouldStopForManagedAccountState } from './managedRequestGate';
import { normalizeSendMessageInput } from './sendMessageInput';
import {
  buildSendMessageApiPayload,
  buildSendMessageStorageContent,
} from './sendMessagePayloads';
import { runSendMessageAssistantStream } from './runSendMessageAssistantStream';
import { deleteCreatedRequestContextAttachments } from './requestContextAttachmentCleanup';

type Translate = (key: MessageKey, values?: MessageValues) => string;

interface UseSendMessageOptions {
  activeComposerRequestRef: MutableRefObject<ActiveComposerRequest | null>;
  currentSessionId: string | null;
  selectedModel: AIModel | undefined;
  providers: readonly Provider[];
  customSystemPrompt: string;
  includeTimeContext: boolean;
  webSearchEnabled: boolean;
  computerUseEnabled: boolean;
  computerUseCwd: string;
  isAccountConnected: boolean;
  setSessionLoading: (sessionId: string, loading: boolean) => void;
  setError: (error: string | null) => void;
  clearActiveComposerRequest: (request: ActiveComposerRequest | null) => void;
  handleManagedQuotaErrorForComposer: (request: ActiveComposerRequest, error: unknown) => boolean;
  maybeGenerateAutoTitle: (sessionId: string, providerId: string, modelId: string) => void;
  markSessionUnread: (sessionId: string) => void;
  t: Translate;
}

export function useSendMessage({
  activeComposerRequestRef,
  currentSessionId,
  selectedModel,
  providers,
  customSystemPrompt,
  includeTimeContext,
  webSearchEnabled,
  computerUseEnabled,
  computerUseCwd,
  isAccountConnected,
  setSessionLoading,
  setError,
  clearActiveComposerRequest,
  handleManagedQuotaErrorForComposer,
  maybeGenerateAutoTitle,
  markSessionUnread,
  t,
}: UseSendMessageOptions) {
  return useCallback(
    async (
      text: string,
      attachments: Attachment[],
      noteMentions: NoteMentionReference[] = [],
      onComposerAccepted?: (accepted: boolean) => void,
    ) => {
      const input = normalizeSendMessageInput(text, attachments, noteMentions);
      if (input.isEmpty || !selectedModel) {
        return false;
      }

      const provider = providers.find((item) => item.id === selectedModel.providerId);
      if (!provider) {
        setError(t('chat.error.providerNotFound'));
        return false;
      }
      if (provider.enabled === false) {
        setError(t('chat.error.channelOff'));
        return false;
      }
      if (input.hasUnsupportedAttachments) {
        const { message } = buildChatErrorPayload({
          message: 'UNSUPPORTED_MODEL_INPUT',
          errorCode: 'unsupported_message_content',
          statusCode: 400,
        });
        setError(message);
        return false;
      }
      if (await shouldStopForManagedAccountState({
        providerId: provider.id,
        isAccountConnected,
        sessionId: currentSessionId,
        setError,
      })) {
        return false;
      }

      let activeSessionId = currentSessionId;
      if (!activeSessionId) {
        activeSessionId = aiActions.createSession('');
      }
      if (!activeSessionId) {
        return false;
      }

      const targetSessionId = activeSessionId;
      const requestStartedAt = Date.now();
      const requestController = requestManager.start(targetSessionId);
      const composerRequest: ActiveComposerRequest = {
        sessionId: targetSessionId,
        controller: requestController,
        submittedText: input.userMessageText,
        submittedAttachments: input.attachments,
        submittedNoteMentions: input.noteMentions,
        createdContextAttachmentFilenames: [],
        userMessageId: null,
        assistantMessageId: null,
      };
      const cleanupUnownedContextAttachments = () => {
        if (composerRequest.userMessageId || !composerRequest.createdContextAttachmentFilenames?.length) {
          return;
        }
        const filenames = composerRequest.createdContextAttachmentFilenames;
        composerRequest.createdContextAttachmentFilenames = [];
        void deleteCreatedRequestContextAttachments(filenames);
      };
      let composerAcceptanceSettled = false;
      const settleComposerAcceptance = (accepted: boolean) => {
        if (composerAcceptanceSettled) {
          return;
        }
        composerAcceptanceSettled = true;
        onComposerAccepted?.(accepted);
      };
      activeComposerRequestRef.current = composerRequest;
      const ensureRequestActive = () => {
        if (isChatRequestCancelled(targetSessionId, requestController)) {
          throw new DOMException('Aborted', 'AbortError');
        }
      };
      setSessionLoading(targetSessionId, true);
      setError(null);
      addChatDebugLog('chat', 'sendMessage accepted', {
        sessionId: targetSessionId,
        modelId: selectedModel.id,
        providerId: provider.id,
        webSearchEnabled,
        computerUseEnabled,
        textLength: input.userMessageText.length,
        attachments: input.attachments.length,
        mentions: input.noteMentions.length,
      });

      void runWithSessionMutationLock(targetSessionId, async () => {
        ensureRequestActive();
        const latestMessages = await hydrateSessionMessagesFromDisk(targetSessionId);
        ensureRequestActive();
        const targetSession = useUnifiedStore.getState().data.ai?.sessions.find((item) => item.id === targetSessionId);
        const isTemporaryTarget =
          isTemporarySessionId(targetSessionId) || isTemporarySession(targetSession);
        const requestAttachments = isTemporaryTarget
          ? await makeTemporaryAttachmentsEphemeral(
              input.attachments,
              requestController.signal,
              (index, attachment) => {
                const nextAttachments = [...composerRequest.submittedAttachments];
                if (nextAttachments[index]) {
                  nextAttachments[index] = attachment;
                  composerRequest.submittedAttachments = nextAttachments;
                }
              },
            )
          : input.attachments;
        composerRequest.submittedAttachments = requestAttachments;
        ensureRequestActive();

        const { storageContent, messageImageSources } = await buildSendMessageStorageContent({
          requestAttachments,
          userMessageText: input.userMessageText,
          mentionText: input.mentionText,
          noteMentions: input.noteMentions,
        });
        ensureRequestActive();

        if (!storageContent.trim()) {
          clearActiveComposerRequest(composerRequest);
          finishPreStartedChatRequest(targetSessionId, requestController, setSessionLoading);
          settleComposerAcceptance(false);
          return;
        }

        const {
          content: apiMessageContent,
          requestContext,
          createdContextAttachmentFilenames,
        } = await buildSendMessageApiPayload({
          requestAttachments,
          userMessageText: input.userMessageText,
          noteMentions: input.noteMentions,
          signal: requestController.signal,
          persistContextImages: !isTemporaryTarget,
        });
        composerRequest.createdContextAttachmentFilenames = createdContextAttachmentFilenames ?? [];
        ensureRequestActive();

        const userMessageId = aiActions.addMessage({
          role: 'user',
          content: storageContent,
          imageSources: messageImageSources,
          requestContext,
          modelId: selectedModel.id,
        }, targetSessionId);
        if (!userMessageId) {
          cleanupUnownedContextAttachments();
          clearActiveComposerRequest(composerRequest);
          finishPreStartedChatRequest(targetSessionId, requestController, setSessionLoading);
          settleComposerAcceptance(false);
          return;
        }
        composerRequest.userMessageId = userMessageId;

        const assistantMessageId = aiActions.addMessage({
          role: 'assistant',
          content: '',
          modelId: selectedModel.id,
        }, targetSessionId, {
          persistUnified: false,
          touchSession: false,
        });
        if (!assistantMessageId) {
          clearActiveComposerRequest(composerRequest);
          finishPreStartedChatRequest(targetSessionId, requestController, setSessionLoading);
          settleComposerAcceptance(false);
          return;
        }
        composerRequest.assistantMessageId = assistantMessageId;

        ensureRequestActive();
        settleComposerAcceptance(true);

        const timezoneOffset = useUnifiedStore.getState().data.settings.timezone.offset;
        const requestHistory = buildRequestHistory({
          history: latestMessages,
          modelId: selectedModel.id,
          timezoneOffset,
          includeTimeContext,
          customSystemPrompt,
        });

        void runSendMessageAssistantStream({
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
        });
      }).catch((error) => {
        cleanupUnownedContextAttachments();
        const cancelled = isChatRequestCancelled(targetSessionId, requestController);
        finishPreStartedChatRequest(targetSessionId, requestController, setSessionLoading);
        clearActiveComposerRequest(composerRequest);
        settleComposerAcceptance(false);
        if (cancelled) {
          addChatDebugLog('chat', 'sendMessage aborted before stream start', {
            sessionId: targetSessionId,
            durationMs: Date.now() - requestStartedAt,
          }, 'warn');
          return;
        }
        addChatDebugLog('chat', 'sendMessage mutation failed', {
          sessionId: targetSessionId,
          durationMs: Date.now() - requestStartedAt,
          error: extractRawErrorMessage(error),
        }, 'error');
        const isManaged = isManagedProviderId(provider.id);
        markManagedAuthPromptForError(targetSessionId, error, isManaged);
        const { message } = buildChatErrorPayload(error, isManaged);
        setError(message);
      });
      return true;
    },
    [
      activeComposerRequestRef,
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
      clearActiveComposerRequest,
      handleManagedQuotaErrorForComposer,
      maybeGenerateAutoTitle,
      markSessionUnread,
      isAccountConnected,
      t,
    ],
  );
}
