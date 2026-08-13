import { useCallback, useMemo } from 'react';
import { isTemporarySession, isTemporarySessionId, needsAutoTitle } from '@/lib/ai/temporaryChat';
import { resolveSessionIdAlias } from '@/lib/ai/sessionIdAliases';
import { useI18n } from '@/lib/i18n';
import { useAccountSessionStore } from '@/stores/accountSession';
import { useAIUIStore } from '@/stores/ai/chatState';
import { useUnifiedStore } from '@/stores/unified/useUnifiedStore';
import { useAutoTitle } from './useAutoTitle';
import {
  MAX_TEMPORARY_ATTACHMENT_EPHEMERAL_CONCURRENCY,
} from './chatService/temporaryAttachments';
import { useActiveComposerRequest } from './chatService/useActiveComposerRequest';
import { useEditMessage } from './chatService/useEditMessage';
import { useRegenerateMessage } from './chatService/useRegenerateMessage';
import { useSendMessage } from './chatService/useSendMessage';
import { useSwitchMessageVersion } from './chatService/useSwitchMessageVersion';

const EMPTY_MESSAGES: never[] = [];
const EMPTY_PROVIDERS: never[] = [];
const EMPTY_MODELS: never[] = [];

export { MAX_TEMPORARY_ATTACHMENT_EPHEMERAL_CONCURRENCY };

export function useChatService(active = true) {
  const { t } = useI18n();
  const { generateAutoTitle } = useAutoTitle();
  const currentSessionId = useAIUIStore((state) => active ? state.currentSessionId : null);
  const messages = useUnifiedStore((state) => {
    if (!active || !currentSessionId) {
      return EMPTY_MESSAGES;
    }

    return state.data.ai?.messages?.[currentSessionId] || EMPTY_MESSAGES;
  });
  const providers = useUnifiedStore((state) => state.data.ai?.providers || EMPTY_PROVIDERS);
  const models = useUnifiedStore((state) => state.data.ai?.models || EMPTY_MODELS);
  const selectedModelId = useUnifiedStore((state) => state.data.ai?.selectedModelId || null);
  const customSystemPrompt = useUnifiedStore((state) => state.data.ai?.customSystemPrompt || '');
  const includeTimeContext = useUnifiedStore((state) => state.data.ai?.includeTimeContext !== false);
  const webSearchEnabled = useUnifiedStore((state) => state.data.ai?.webSearchEnabled === true);
  const isAccountConnected = useAccountSessionStore((state) => state.isConnected);
  const setSessionLoading = useAIUIStore((state) => state.setSessionLoading);
  const markSessionUnread = useAIUIStore((state) => state.markSessionUnread);
  const setError = useAIUIStore((state) => state.setError);
  const {
    activeComposerRequestRef,
    recalledComposerDraft,
    clearActiveComposerRequest,
    clearRecalledComposerDraft,
    handleManagedQuotaErrorForComposer,
    handleManagedQuotaErrorForVersionRollback,
    stop,
    stopAndRecallLastUserMessage,
  } = useActiveComposerRequest({ setError, setSessionLoading });

  const selectedModel = useMemo(() => {
    if (!selectedModelId) {
      return undefined;
    }

    const model = models.find((item) => item.id === selectedModelId);
    if (!model) {
      return undefined;
    }

    const provider = providers.find((item) => item.id === model.providerId);
    return model.enabled === false || provider?.enabled === false ? undefined : model;
  }, [models, providers, selectedModelId]);

  const maybeGenerateAutoTitle = useCallback(
    (sessionId: string, providerId: string, modelId: string) => {
      const resolvedSessionId = resolveSessionIdAlias(sessionId);
      const session = useUnifiedStore.getState().data.ai?.sessions.find((item) => item.id === resolvedSessionId);
      if (isTemporarySessionId(resolvedSessionId) || isTemporarySession(session)) {
        return;
      }
      if (!session || !needsAutoTitle(session.title)) {
        return;
      }
      void generateAutoTitle(resolvedSessionId, providerId, modelId);
    },
    [generateAutoTitle],
  );

  const sendMessage = useSendMessage({
    activeComposerRequestRef,
    currentSessionId,
    selectedModel,
    providers,
    customSystemPrompt,
    includeTimeContext,
    webSearchEnabled,
    isAccountConnected,
    setSessionLoading,
    setError,
    clearActiveComposerRequest,
    handleManagedQuotaErrorForComposer,
    maybeGenerateAutoTitle,
    markSessionUnread,
    t,
  });
  const editMessage = useEditMessage({
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
  });
  const regenerate = useRegenerateMessage({
    currentSessionId,
    selectedModel,
    providers,
    customSystemPrompt,
    includeTimeContext,
    webSearchEnabled,
    messages,
    isAccountConnected,
    setSessionLoading,
    setError,
    maybeGenerateAutoTitle,
    handleManagedQuotaErrorForVersionRollback,
    t,
  });
  const switchMessageVersion = useSwitchMessageVersion();

  return {
    sendMessage,
    regenerate,
    editMessage,
    switchMessageVersion,
    stop,
    stopAndRecallLastUserMessage,
    recalledComposerDraft,
    clearRecalledComposerDraft,
  };
}
