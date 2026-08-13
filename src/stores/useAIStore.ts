import { useEffect, useRef } from 'react'
import { useUnifiedStore } from './unified/useUnifiedStore'
import { useAccountSessionStore } from './accountSession'
import { clearManagedBudgetUnlessQuotaExhausted } from './useManagedAIStore'
import {
  isManagedServiceRecoverableError,
} from '@/lib/ai/managedService'
import {
  isTemporarySession,
  isTemporarySessionId,
} from '@/lib/ai/temporaryChat';
import { useAIUIStore } from './ai/chatState'
import { readWindowLaunchContext } from '@/lib/desktop/launchContext'
import { actions, managedProviderSync } from './ai/providerActions'
import {
  ensureManagedProvider,
} from './ai/providerStoreUtils'
import { resolveRestoredChatSessionId } from './ai/runtimeSelection'

const EMPTY_AI_ARRAY: never[] = [];
const EMPTY_AI_RECORD: Record<string, never> = {};

export { createAIChatSession } from './ai/chatState'
export { startAIStoreRuntimeEffects } from './ai/runtimeEffectsStart'

export function useAIStoreRuntimeEffects(): void {
  const aiData = useUnifiedStore(s => s.data.ai);
  const lastChatSessionId = useUnifiedStore(s => s.data.settings.ui?.lastChatSessionId);
  const loaded = useUnifiedStore(s => s.loaded);
  const load = useUnifiedStore(s => s.load);
  const uiState = useAIUIStore();
  const accountConnected = useAccountSessionStore((s) => s.isConnected);
  const launchContextRef = useRef(readWindowLaunchContext());
  const suppressStartupAIPersistRef = useRef((() => {
    const launchContext = launchContextRef.current;
    return launchContext.isNewWindow && launchContext.viewMode === 'chat';
  })());

  useEffect(() => {
    if (!loaded || uiState.selectionInitialized) {
      return;
    }

    const launchContext = launchContextRef.current;
    if (launchContext.isNewWindow && launchContext.viewMode === 'chat') {
      const requestedSessionId = launchContext.chatSessionId;
      const currentSessionId = requestedSessionId && aiData?.sessions.some((session) => session.id === requestedSessionId)
        ? requestedSessionId
        : null;
      uiState.initializeSelection({ currentSessionId, temporaryChatEnabled: false });
      if (currentSessionId) {
        void actions.switchSession(currentSessionId).catch(() => undefined);
      }
      return;
    }

    const currentSessionId = resolveRestoredChatSessionId(aiData, lastChatSessionId);
    uiState.initializeSelection({
      currentSessionId,
      temporaryChatEnabled: !!aiData?.temporaryChatEnabled,
    });
    if (currentSessionId && !aiData?.temporaryChatEnabled) {
      void actions.switchSession(currentSessionId).catch(() => undefined);
    }
  }, [
    aiData?.currentSessionId,
    aiData?.sessions,
    aiData?.temporaryChatEnabled,
    lastChatSessionId,
    loaded,
    uiState,
  ]);

  useEffect(() => {
    if (!loaded || !uiState.selectionInitialized || !uiState.temporaryChatEnabled) {
      return;
    }

    const currentSessionId = uiState.currentSessionId;
    const currentSession = currentSessionId
      ? aiData?.sessions.find((session) => session.id === currentSessionId)
      : null;
    const hasActiveTemporarySession =
      isTemporarySessionId(currentSessionId) || isTemporarySession(currentSession);

    if (hasActiveTemporarySession) {
      return;
    }

    uiState.setTemporaryChatEnabled(false);
  }, [
    aiData?.sessions,
    loaded,
    uiState,
  ]);

  useEffect(() => {
    if (!loaded || !uiState.selectionInitialized) {
      return;
    }

    const currentSessionId = uiState.currentSessionId;
    if (!currentSessionId || isTemporarySessionId(currentSessionId)) {
      return;
    }

    if (aiData?.sessions.some((session) => session.id === currentSessionId)) {
      return;
    }

    uiState.setCurrentSessionId(null);
  }, [aiData?.sessions, loaded, uiState]);

  useEffect(() => {
    if (!loaded || !uiState.selectionInitialized) {
      return;
    }

    const currentSessionId = uiState.currentSessionId;
    if (!currentSessionId) {
      return;
    }

    if (!(aiData?.unreadSessionIds || []).includes(currentSessionId)) {
      return;
    }

    uiState.markSessionRead(currentSessionId);
  }, [aiData?.unreadSessionIds, loaded, uiState]);

  useEffect(() => {
    if (!loaded) {
      void load().catch(() => undefined);
    }
  }, [loaded, load]);

  useEffect(() => {
    if (!loaded) {
      return;
    }

    const store = useUnifiedStore.getState();
    const ai = store.data.ai;
    if (!ai) return;

    const nextProviders = ensureManagedProvider(ai.providers);
    const providersChanged =
      nextProviders.length !== ai.providers.length ||
      nextProviders.some((provider, index) => ai.providers[index]?.id !== provider.id);

    if (providersChanged) {
      store.updateAIData({ providers: nextProviders }, suppressStartupAIPersistRef.current);
    }
  }, [loaded]);

  useEffect(() => {
    if (!loaded) {
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        await managedProviderSync.syncFromStartup({
          refreshBudget: false,
          suppressPersist: suppressStartupAIPersistRef.current,
        });
        if (cancelled) return;

        if (!accountConnected) {
          clearManagedBudgetUnlessQuotaExhausted();
        }
      } catch (error) {
        if (!isManagedServiceRecoverableError(error)) {
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [loaded, accountConnected]);

  useEffect(() => {
    if (!loaded || accountConnected) {
      return;
    }
    clearManagedBudgetUnlessQuotaExhausted();
  }, [loaded, accountConnected]);
}

export { actions } from './ai/providerActions'

export const useAIStore = () => {
  const aiData = useUnifiedStore(s => s.data.ai);
  const uiState = useAIUIStore();

  return {
    providers: aiData?.providers || EMPTY_AI_ARRAY,
    models: aiData?.models || EMPTY_AI_ARRAY,
    benchmarkResults: aiData?.benchmarkResults || EMPTY_AI_RECORD,
    fetchedModels: aiData?.fetchedModels || EMPTY_AI_RECORD,
    sessions: aiData?.sessions || EMPTY_AI_ARRAY,
    messages: aiData?.messages || EMPTY_AI_RECORD,
    selectedModelId: aiData?.selectedModelId || null,
    customSystemPrompt: aiData?.customSystemPrompt || '',
    includeTimeContext: aiData?.includeTimeContext !== false,
    webSearchEnabled: aiData?.webSearchEnabled === true,
    
    ...uiState,
    ...actions,

    getProvider: (id: string) => aiData?.providers.find(p => p.id === id),
    getModel: (id: string) => aiData?.models.find(m => m.id === id),
    getSelectedModel: () => {
      if (!aiData?.selectedModelId) return undefined
      const selectedModel = aiData.models.find(m => m.id === aiData.selectedModelId)
      if (!selectedModel) return undefined
      const provider = aiData.providers.find((item) => item.id === selectedModel.providerId)
      return selectedModel.enabled === false || provider?.enabled === false ? undefined : selectedModel
    },
    getModelsByProvider: (pid: string) => {
      const provider = aiData?.providers.find((item) => item.id === pid)
      if (provider?.enabled === false) return []
      return aiData?.models.filter(m => m.providerId === pid && m.enabled) || []
    },
    isTemporarySession: (sessionId: string) => {
      const session = aiData?.sessions.find((item) => item.id === sessionId);
      return isTemporarySessionId(sessionId) || isTemporarySession(session);
    },
    
    isSessionLoading: (sessionId: string) => !!uiState.generatingSessions[sessionId],
    isSessionUnread: (sessionId: string) => !!aiData?.unreadSessionIds?.includes(sessionId),
    isLoading: uiState.currentSessionId ? !!uiState.generatingSessions[uiState.currentSessionId] : false,
    selectedModel: aiData?.selectedModelId
      ? (() => {
          const model = aiData.models.find(m => m.id === aiData.selectedModelId)
          if (!model) return undefined
          const provider = aiData.providers.find((item) => item.id === model.providerId)
          return model.enabled === false || provider?.enabled === false ? undefined : model
        })()
      : undefined
  };
};
