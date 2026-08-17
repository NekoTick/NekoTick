import { readWindowLaunchContext } from '@/lib/desktop/launchContext';
import { isManagedServiceRecoverableError } from '@/lib/ai/managedService';
import { isTemporarySession, isTemporarySessionId } from '@/lib/ai/temporaryChat';
import { useAccountSessionStore } from '../accountSession';
import { useUnifiedStore } from '../unified/useUnifiedStore';
import { clearManagedBudgetUnlessQuotaExhausted } from '../useManagedAIStore';
import { actions, managedProviderSync } from './providerActions';
import { useAIUIStore } from './chatState';
import { ensureManagedProvider } from './providerStoreUtils';
import { resolveRestoredChatSessionId } from './runtimeSelection';

interface AIStoreRuntimeSnapshot {
  loaded: boolean;
  lastChatSessionId: string | null | undefined;
  models: unknown;
  providers: unknown;
  sessions: unknown;
  temporaryChatEnabled: boolean | undefined;
  unreadSessionIds: unknown;
}

export function getAIStoreRuntimeChangeFlags(
  previous: AIStoreRuntimeSnapshot,
  current: AIStoreRuntimeSnapshot,
) {
  return {
    loadedChanged: previous.loaded !== current.loaded,
    modelsChanged: previous.models !== current.models,
    providersChanged: previous.providers !== current.providers,
    sessionsChanged: previous.sessions !== current.sessions,
    temporaryChatChanged: previous.temporaryChatEnabled !== current.temporaryChatEnabled,
    unreadSessionsChanged: previous.unreadSessionIds !== current.unreadSessionIds,
    lastChatSessionChanged: previous.lastChatSessionId !== current.lastChatSessionId,
  };
}

export function hasAIStoreRuntimeRelevantChanges(
  previous: AIStoreRuntimeSnapshot,
  current: ReturnType<typeof useUnifiedStore.getState>,
): boolean {
  const ai = current.data.ai;
  return previous.loaded !== current.loaded
    || previous.lastChatSessionId !== current.data.settings.ui?.lastChatSessionId
    || previous.models !== ai?.models
    || previous.providers !== ai?.providers
    || previous.sessions !== ai?.sessions
    || previous.temporaryChatEnabled !== ai?.temporaryChatEnabled
    || previous.unreadSessionIds !== ai?.unreadSessionIds;
}

let didStartAIStoreRuntimeEffects = false;

export function startAIStoreRuntimeEffects(): void {
  if (didStartAIStoreRuntimeEffects) return;
  didStartAIStoreRuntimeEffects = true;

  const launchContext = readWindowLaunchContext();
  const suppressStartupAIPersist = launchContext.isNewWindow && launchContext.viewMode === 'chat';

  const ensureLoaded = () => {
    const store = useUnifiedStore.getState();
    if (!store.loaded) {
      void store.load().catch(() => undefined);
    }
  };

  const syncSelection = () => {
    const store = useUnifiedStore.getState();
    const aiData = store.data.ai;
    const lastChatSessionId = store.data.settings.ui?.lastChatSessionId;
    const uiState = useAIUIStore.getState();

    if (!store.loaded || uiState.selectionInitialized) {
      return;
    }

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
  };

  const syncIntegrity = () => {
    const store = useUnifiedStore.getState();
    const aiData = store.data.ai;
    const uiState = useAIUIStore.getState();

    if (!store.loaded || !uiState.selectionInitialized) {
      return;
    }

    const currentSessionId = uiState.currentSessionId;
    const currentSession = currentSessionId
      ? aiData?.sessions.find((session) => session.id === currentSessionId)
      : null;
    const hasActiveTemporarySession =
      isTemporarySessionId(currentSessionId) || isTemporarySession(currentSession);

    if (uiState.temporaryChatEnabled && !hasActiveTemporarySession) {
      uiState.setTemporaryChatEnabled(false);
    }

    if (
      currentSessionId &&
      !isTemporarySessionId(currentSessionId) &&
      !aiData?.sessions.some((session) => session.id === currentSessionId)
    ) {
      uiState.setCurrentSessionId(null);
    }

    if (currentSessionId && aiData?.unreadSessionIds?.includes(currentSessionId)) {
      uiState.markSessionRead(currentSessionId);
    }
  };

  const syncManagedProvider = () => {
    const store = useUnifiedStore.getState();
    const ai = store.data.ai;
    if (!store.loaded || !ai) return;

    const nextProviders = ensureManagedProvider(ai.providers);
    const providersChanged =
      nextProviders.length !== ai.providers.length ||
      nextProviders.some((provider, index) => ai.providers[index]?.id !== provider.id);

    if (providersChanged) {
      store.updateAIData({ providers: nextProviders }, suppressStartupAIPersist);
    }
  };

  const syncManagedService = () => {
    const store = useUnifiedStore.getState();
    if (!store.loaded) return;

    const accountConnected = useAccountSessionStore.getState().isConnected;
    if (!accountConnected) {
      clearManagedBudgetUnlessQuotaExhausted();
    }

    void managedProviderSync.syncFromStartup({
      refreshBudget: false,
      suppressPersist: suppressStartupAIPersist,
    }).then(() => {
      if (!useAccountSessionStore.getState().isConnected) {
        clearManagedBudgetUnlessQuotaExhausted();
      }
    }).catch((error) => {
      if (!isManagedServiceRecoverableError(error)) {
      }
    });
  };

  ensureLoaded();
  syncSelection();
  syncIntegrity();
  syncManagedProvider();
  syncManagedService();

  const initialStore = useUnifiedStore.getState();
  let previousSnapshot: AIStoreRuntimeSnapshot = {
    loaded: initialStore.loaded,
    lastChatSessionId: initialStore.data.settings.ui?.lastChatSessionId,
    models: initialStore.data.ai?.models,
    providers: initialStore.data.ai?.providers,
    sessions: initialStore.data.ai?.sessions,
    temporaryChatEnabled: initialStore.data.ai?.temporaryChatEnabled,
    unreadSessionIds: initialStore.data.ai?.unreadSessionIds,
  };
  useUnifiedStore.subscribe((store) => {
    if (!hasAIStoreRuntimeRelevantChanges(previousSnapshot, store)) {
      if (!store.loaded) {
        ensureLoaded();
      }
      return;
    }

    const currentSnapshot: AIStoreRuntimeSnapshot = {
      loaded: store.loaded,
      lastChatSessionId: store.data.settings.ui?.lastChatSessionId,
      models: store.data.ai?.models,
      providers: store.data.ai?.providers,
      sessions: store.data.ai?.sessions,
      temporaryChatEnabled: store.data.ai?.temporaryChatEnabled,
      unreadSessionIds: store.data.ai?.unreadSessionIds,
    };
    const changes = getAIStoreRuntimeChangeFlags(previousSnapshot, currentSnapshot);
    previousSnapshot = currentSnapshot;

    if (!store.loaded) {
      ensureLoaded();
      return;
    }
    if (changes.loadedChanged || changes.sessionsChanged || changes.temporaryChatChanged || changes.lastChatSessionChanged) {
      syncSelection();
    }
    if (changes.loadedChanged || changes.sessionsChanged || changes.unreadSessionsChanged || changes.temporaryChatChanged) {
      syncIntegrity();
    }
    if (changes.loadedChanged || changes.providersChanged) {
      syncManagedProvider();
    }
    if (changes.loadedChanged) {
      syncManagedService();
    } else if (changes.modelsChanged) {
      managedProviderSync.reconcileAfterStoreChange();
    }
  });

  let previousAccountConnected = useAccountSessionStore.getState().isConnected;
  useAccountSessionStore.subscribe((accountState) => {
    if (accountState.isConnected === previousAccountConnected) {
      return;
    }
    previousAccountConnected = accountState.isConnected;
    syncManagedService();
  });
}
