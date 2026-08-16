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
  const aiSessions = useUnifiedStore(s => s.data.ai?.sessions || EMPTY_AI_ARRAY);
  const aiCurrentSessionId = useUnifiedStore(s => s.data.ai?.currentSessionId ?? null);
  const aiTemporaryChatEnabled = useUnifiedStore(s => s.data.ai?.temporaryChatEnabled === true);
  const aiUnreadSessionIds = useUnifiedStore(s => s.data.ai?.unreadSessionIds || EMPTY_AI_ARRAY);
  const lastChatSessionId = useUnifiedStore(s => s.data.settings.ui?.lastChatSessionId);
  const loaded = useUnifiedStore(s => s.loaded);
  const load = useUnifiedStore(s => s.load);
  const selectionInitialized = useAIUIStore((state) => state.selectionInitialized);
  const selectedSessionId = useAIUIStore((state) => state.currentSessionId);
  const temporaryChatEnabled = useAIUIStore((state) => state.temporaryChatEnabled);
  const initializeSelection = useAIUIStore((state) => state.initializeSelection);
  const setTemporaryChatEnabled = useAIUIStore((state) => state.setTemporaryChatEnabled);
  const setCurrentSessionId = useAIUIStore((state) => state.setCurrentSessionId);
  const markSessionRead = useAIUIStore((state) => state.markSessionRead);
  const accountConnected = useAccountSessionStore((s) => s.isConnected);
  const launchContextRef = useRef(readWindowLaunchContext());
  const suppressStartupAIPersistRef = useRef((() => {
    const launchContext = launchContextRef.current;
    return launchContext.isNewWindow && launchContext.viewMode === 'chat';
  })());

  useEffect(() => {
    if (!loaded || selectionInitialized) {
      return;
    }

    const launchContext = launchContextRef.current;
    if (launchContext.isNewWindow && launchContext.viewMode === 'chat') {
      const requestedSessionId = launchContext.chatSessionId;
      const currentSessionId = requestedSessionId && aiSessions.some((session) => session.id === requestedSessionId)
        ? requestedSessionId
        : null;
      initializeSelection({ currentSessionId, temporaryChatEnabled: false });
      if (currentSessionId) {
        void actions.switchSession(currentSessionId).catch(() => undefined);
      }
      return;
    }

    const currentSessionId = resolveRestoredChatSessionId(
      { sessions: aiSessions, currentSessionId: aiCurrentSessionId },
      lastChatSessionId,
    );
    initializeSelection({
      currentSessionId,
      temporaryChatEnabled: aiTemporaryChatEnabled,
    });
    if (currentSessionId && !aiTemporaryChatEnabled) {
      void actions.switchSession(currentSessionId).catch(() => undefined);
    }
  }, [
    aiCurrentSessionId,
    aiSessions,
    aiTemporaryChatEnabled,
    initializeSelection,
    lastChatSessionId,
    loaded,
    selectionInitialized,
  ]);

  useEffect(() => {
    if (!loaded || !selectionInitialized || !temporaryChatEnabled) {
      return;
    }

    const currentSession = selectedSessionId
      ? aiSessions.find((session) => session.id === selectedSessionId)
      : null;
    const hasActiveTemporarySession =
      isTemporarySessionId(selectedSessionId) || isTemporarySession(currentSession);

    if (hasActiveTemporarySession) {
      return;
    }

    setTemporaryChatEnabled(false);
  }, [
    aiSessions,
    loaded,
    selectedSessionId,
    selectionInitialized,
    setTemporaryChatEnabled,
    temporaryChatEnabled,
  ]);

  useEffect(() => {
    if (!loaded || !selectionInitialized) {
      return;
    }

    if (!selectedSessionId || isTemporarySessionId(selectedSessionId)) {
      return;
    }

    if (aiSessions.some((session) => session.id === selectedSessionId)) {
      return;
    }

    setCurrentSessionId(null);
  }, [aiSessions, loaded, selectedSessionId, selectionInitialized, setCurrentSessionId]);

  useEffect(() => {
    if (!loaded || !selectionInitialized) {
      return;
    }

    if (!selectedSessionId) {
      return;
    }

    if (!aiUnreadSessionIds.includes(selectedSessionId)) {
      return;
    }

    markSessionRead(selectedSessionId);
  }, [aiUnreadSessionIds, loaded, markSessionRead, selectedSessionId, selectionInitialized]);

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

export const useAIProviders = () =>
  useUnifiedStore(s => s.data.ai?.providers || EMPTY_AI_ARRAY)

export const useAIModels = () =>
  useUnifiedStore(s => s.data.ai?.models || EMPTY_AI_ARRAY)

export const useAIBenchmarkResults = () =>
  useUnifiedStore(s => s.data.ai?.benchmarkResults || EMPTY_AI_RECORD)

export const useAIFetchedModels = () =>
  useUnifiedStore(s => s.data.ai?.fetchedModels || EMPTY_AI_RECORD)

export const useAICustomSystemPrompt = () =>
  useUnifiedStore(s => s.data.ai?.customSystemPrompt || '')

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
