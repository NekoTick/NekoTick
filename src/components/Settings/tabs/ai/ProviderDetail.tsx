import { useEffect, useMemo, useState } from 'react';
import {
  actions as aiActions,
  useAIBenchmarkResults,
  useAIFetchedModels,
  useAIModels,
} from '@/stores/useAIStore';
import { useAccountSessionStore } from '@/stores/accountSession';
import { Provider } from '@/lib/ai/types';
import { MANAGED_PROVIDER_ID } from '@/lib/ai/managedService';
import { ManagedProviderPanel } from './provider-detail/ManagedProviderPanel';
import { ProviderModelsPanel } from './provider-detail/ProviderModelsPanel';
import { ProviderConnectionFields } from './provider-detail/ProviderConnectionFields';
import { useProviderBenchmark } from './provider-detail/useProviderBenchmark';
import { useProviderConnectionDraft } from './provider-detail/useProviderConnectionDraft';
import { useProviderModelActions } from './provider-detail/useProviderModelActions';
import { useProviderModelFilters } from './provider-detail/useProviderModelFilters';
import type { OauthAccountProvider } from '@/lib/account/provider';
import { useI18n } from '@/lib/i18n';
import { isBlockedNativeProviderUrl } from './provider-detail/nativeProviderUrlPolicy';

const EMPTY_FETCHED_MODELS: string[] = [];

interface ProviderDetailProps {
  provider: Provider | undefined;
  focusBaseUrlOnMount?: boolean;
  onBaseUrlAutoFocusComplete?: () => void;
  onDraftChange?: (draft: { name?: string; apiHost?: string; apiKey?: string }) => void;
  onDraftClear?: () => void;
}

export function ProviderDetail({
  provider: initialProvider,
  focusBaseUrlOnMount = false,
  onBaseUrlAutoFocusComplete,
  onDraftChange,
  onDraftClear,
}: ProviderDetailProps) {
  const { t } = useI18n();
  const models = useAIModels();
  const benchmarkResults = useAIBenchmarkResults();
  const persistedFetchedModels = useAIFetchedModels();
  const {
    updateProvider,
    addModel,
    addModels,
    deleteModel,
    refreshManagedProvider,
    setProviderBenchmarkResults,
    setProviderFetchedModels,
  } = aiActions;
  const isConnected = useAccountSessionStore((state) => state.isConnected);
  const isConnecting = useAccountSessionStore((state) => state.isConnecting);
  const authError = useAccountSessionStore((state) => state.error);
  const signIn = useAccountSessionStore((state) => state.signIn);
  const requestEmailCode = useAccountSessionStore((state) => state.requestEmailCode);
  const verifyEmailCode = useAccountSessionStore((state) => state.verifyEmailCode);
  const signOut = useAccountSessionStore((state) => state.signOut);

  const [modelQuery, setModelQuery] = useState('');
  const [quickAddModelId, setQuickAddModelId] = useState('');
  const [quickAddError, setQuickAddError] = useState('');
  const [fetchedModels, setFetchedModels] = useState<string[]>([]);
  const connectionDraft = useProviderConnectionDraft({
    provider: initialProvider,
    updateProvider,
    onDraftChange,
    onDraftClear,
  });

  const providerId = initialProvider?.id;
  const providerModels = useMemo(
    () => (providerId ? models.filter((m) => m.providerId === providerId) : []),
    [models, providerId]
  );
  const providerModelIdSet = useMemo(() => new Set(providerModels.map((m) => m.apiModelId.toLowerCase())), [providerModels]);
  const isManagedProvider = initialProvider?.id === MANAGED_PROVIDER_ID;
  const enabled = initialProvider?.enabled ?? true;
  const { apiHost, apiKey, name } = connectionDraft;
  const apiHostBlocked = isBlockedNativeProviderUrl(apiHost);
  const canUseConnectionActions = Boolean(
    initialProvider && apiHost.trim() && apiKey.trim() && !apiHostBlocked
  );
  const persistedProviderFetchedModels = useMemo(
    () => (providerId ? persistedFetchedModels[providerId] ?? EMPTY_FETCHED_MODELS : EMPTY_FETCHED_MODELS),
    [providerId, persistedFetchedModels]
  );

  useEffect(() => {
    setQuickAddModelId('');
    setQuickAddError('');
    setModelQuery('');
  }, [providerId]);

  useEffect(() => {
    setFetchedModels(persistedProviderFetchedModels);
  }, [persistedProviderFetchedModels]);

  const {
    sortedFetchedModels,
    filteredProviderModels,
    filteredFetchedModels,
    availableFetchedModels,
  } = useProviderModelFilters({
    providerModels,
    fetchedModels,
    providerModelIdSet,
    modelQuery,
  });

  const benchmark = useProviderBenchmark({
    provider: initialProvider,
    providerModels,
    availableFetchedModels,
    canUseConnectionActions,
    draft: { name, apiHost, apiKey, enabled },
    benchmarkResults,
    setProviderBenchmarkResults,
  });

  const modelActions = useProviderModelActions({
    provider: initialProvider,
    providerModels,
    canUseConnectionActions,
    draft: { name, apiHost, apiKey, enabled },
    addModel,
    addModels,
    deleteModel,
    updateProvider,
    setFetchedModels,
    setProviderFetchedModels,
    resetBenchmarkState: benchmark.resetBenchmarkState,
  });

  const handleManagedConnect = async (provider: OauthAccountProvider) => {
    await signIn(provider);
  };

  const handleManagedRefresh = async () => {
    await refreshManagedProvider();
  };

  if (!initialProvider) return null;

  if (isManagedProvider) {
    return (
      <ManagedProviderPanel
        isConnected={isConnected}
        isConnecting={isConnecting}
        authError={authError}
        onConnect={handleManagedConnect}
        onRequestEmailCode={requestEmailCode}
        onVerifyEmailCode={verifyEmailCode}
        onDisconnect={signOut}
        onRefresh={handleManagedRefresh}
      />
    );
  }

  return (
    <div className="mx-auto flex max-w-5xl min-w-0 flex-col gap-4">
      <ProviderConnectionFields
        providerId={initialProvider.id}
        name={name}
        apiHost={apiHost}
        apiHostError={apiHostBlocked ? t('settings.ai.mobileHttpsRequired') : undefined}
        apiKey={apiKey}
        showApiKey={connectionDraft.showApiKey}
        apiKeyCopied={connectionDraft.apiKeyCopied}
        autoFocusBaseUrl={focusBaseUrlOnMount}
        onBaseUrlAutoFocusComplete={onBaseUrlAutoFocusComplete}
        onNameChange={(nextName) => {
          connectionDraft.handleNameChange(nextName);
        }}
        onApiHostChange={(nextApiHost) => {
          connectionDraft.handleApiHostChange(nextApiHost);
          modelActions.setFetchError('');
        }}
        onApiKeyChange={(nextApiKey) => {
          connectionDraft.handleApiKeyChange(nextApiKey);
          modelActions.setFetchError('');
        }}
        onCompositionChange={(isComposing) => {
          connectionDraft.isConnectionComposingRef.current = isComposing;
        }}
        onToggleApiKey={() => connectionDraft.setShowApiKey((prev) => !prev)}
        onCopyApiKey={connectionDraft.handleCopyApiKey}
      />

      <ProviderModelsPanel
        providerId={initialProvider.id}
        providerModels={providerModels}
        filteredProviderModels={filteredProviderModels}
        sortedFetchedModels={sortedFetchedModels}
        filteredFetchedModels={filteredFetchedModels}
        providerModelIdSet={providerModelIdSet}
        modelQuery={modelQuery}
        quickAddModelId={quickAddModelId}
        quickAddError={quickAddError}
        fetchError={modelActions.fetchError}
        isFetchingModels={modelActions.isFetchingModels}
        canUseConnectionActions={canUseConnectionActions}
        canBenchmark={benchmark.canBenchmarkAll}
        canBenchmarkSelected={benchmark.canBenchmarkSelected}
        canBenchmarkAvailable={benchmark.canBenchmarkAvailable}
        isHealthChecking={benchmark.isHealthChecking}
        benchmarkAllActive={benchmark.benchmarkAllActive}
        benchmarkAllQueued={benchmark.benchmarkAllQueued}
        selectedBenchmarkActive={benchmark.selectedBenchmarkActive}
        availableBenchmarkActive={benchmark.availableBenchmarkActive}
        queuedBenchmarkModelIds={benchmark.queuedBenchmarkModelIds}
        healthCheckOverall={benchmark.healthCheckOverall}
        healthStatus={benchmark.healthStatus}
        onQuickAddModelIdChange={setQuickAddModelId}
        onModelQueryChange={setModelQuery}
        onFetchModels={modelActions.handleFetchModels}
        onBenchmark={benchmark.handleBenchmarkAllModels}
        onBenchmarkSelected={benchmark.handleBenchmarkModels}
        onBenchmarkAvailable={benchmark.handleBenchmarkAvailableModels}
        onBenchmarkModel={benchmark.handleBenchmarkModel}
        onClearAllModels={modelActions.handleClearAllModels}
        onDeleteModel={deleteModel}
        onAddModel={modelActions.handleAddModel}
        onAddAllVisible={modelActions.handleBatchAdd}
        onSetQuickAddError={setQuickAddError}
      />
    </div>
  );
}
