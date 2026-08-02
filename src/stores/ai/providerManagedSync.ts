import {
  MANAGED_PROVIDER_ID,
  fetchManagedModelCatalog,
  fetchManagedModelsVersion,
} from '@/lib/ai/managedService'
import type { AIModel } from '@/lib/ai/types'
import { useAccountSessionStore } from '../accountSession'
import { useManagedAIStore } from '../useManagedAIStore'
import { useUnifiedStore } from '../unified/useUnifiedStore'
import {
  areModelExecutionContextsEqual,
  areModelsEqual,
  ensureManagedProvider,
  replaceProviderModels,
} from './providerStoreUtils'
import { chooseSessionAwareFallbackSelectedModelId } from './providerSelectionFallback'

const MANAGED_MODELS_REFRESH_MIN_INTERVAL_MS = 5 * 60 * 1000;
const MANAGED_MODELS_FOREGROUND_SAFETY_REFRESH_MS = 60 * 1000;
let managedModelsRefreshInFlight: Promise<void> | null = null;
let managedModelsLastRefreshAttemptAt = 0;
let managedModelsLastFullRefreshAt = 0;
let managedModelsCatalogVersion: string | null = null;
let managedModelsLastCatalog: AIModel[] | null = null;
let managedModelsSyncGeneration = 0;

function managedCatalogNeedsReapply(): boolean {
  if (!managedModelsLastCatalog) return false;

  const models = (useUnifiedStore.getState().data.ai?.models || [])
    .filter((model) => model.providerId === MANAGED_PROVIDER_ID);
  const reconciledModels = replaceProviderModels(
    models,
    MANAGED_PROVIDER_ID,
    managedModelsLastCatalog,
  );
  return !areModelsEqual(models, reconciledModels);
}

async function refreshManagedBudgetIfConnected(): Promise<void> {
  if (!useAccountSessionStore.getState().isConnected) {
    return;
  }
  await useManagedAIStore.getState().refreshBudget();
}

async function syncManagedProviderModels(
  options: { refreshBudget?: boolean; suppressPersist?: boolean; forceRefresh?: boolean } = {}
): Promise<void> {
  const syncGeneration = managedModelsSyncGeneration + 1
  managedModelsSyncGeneration = syncGeneration
  const catalog = await fetchManagedModelCatalog({ forceRefresh: options.forceRefresh === true })
  if (syncGeneration !== managedModelsSyncGeneration) {
    return
  }

  const models = catalog.models
  managedModelsCatalogVersion = catalog.version
  managedModelsLastCatalog = models
  managedModelsLastFullRefreshAt = Date.now()
  const store = useUnifiedStore.getState()
  const ai = store.data.ai!
  const nextProviders = ensureManagedProvider(ai.providers)
  const nextModels = replaceProviderModels(ai.models, MANAGED_PROVIDER_ID, models)
  const selectedModelId = chooseSessionAwareFallbackSelectedModelId(
    ai.selectedModelId,
    nextModels,
    nextProviders,
    ai.sessions,
    MANAGED_PROVIDER_ID
  )

  const providersChanged =
    nextProviders.length !== ai.providers.length ||
    nextProviders.some((provider, index) => ai.providers[index]?.id !== provider.id)
  const modelsChanged = !areModelsEqual(ai.models, nextModels)
  const selectedModelChanged = ai.selectedModelId !== selectedModelId
  const selectedModelContextChanged = !areModelExecutionContextsEqual(
    ai.models.find((model) => model.id === ai.selectedModelId),
    nextModels.find((model) => model.id === selectedModelId),
  )

  if (providersChanged || modelsChanged || selectedModelChanged) {
    store.updateAIData({
      providers: nextProviders,
      models: nextModels,
      selectedModelId,
      ...(selectedModelChanged || selectedModelContextChanged ? { computerUseEnabled: false } : {}),
    }, options.suppressPersist)
  }

  if (options.refreshBudget) {
    await refreshManagedBudgetIfConnected()
  }
}

function refreshManagedProviderInBackground(options: { force?: boolean } = {}): Promise<void> | null {
  const now = Date.now();
  if (
    !options.force &&
    managedModelsLastRefreshAttemptAt > 0 &&
    now - managedModelsLastRefreshAttemptAt < MANAGED_MODELS_REFRESH_MIN_INTERVAL_MS &&
    !managedCatalogNeedsReapply()
  ) {
    return managedModelsRefreshInFlight;
  }

  if (managedModelsRefreshInFlight) {
    return managedModelsRefreshInFlight;
  }

  managedModelsLastRefreshAttemptAt = now;
  managedModelsRefreshInFlight = (async () => {
    if (options.force && managedModelsCatalogVersion) {
      try {
        const latestVersion = await fetchManagedModelsVersion();
        const fullRefreshIsRecent =
          managedModelsLastFullRefreshAt > 0 &&
          Date.now() - managedModelsLastFullRefreshAt < MANAGED_MODELS_FOREGROUND_SAFETY_REFRESH_MS;
        if (latestVersion && latestVersion === managedModelsCatalogVersion && fullRefreshIsRecent) {
          return;
        }
      } catch {
      }
    }
    await syncManagedProviderModels({ forceRefresh: options.force === true });
  })()
    .catch((_error) => {
      void 0
    })
    .finally(() => {
      managedModelsRefreshInFlight = null;
    });

  return managedModelsRefreshInFlight;
}

async function syncManagedProviderModelsFromStartup(
  options: { refreshBudget?: boolean; suppressPersist?: boolean } = {}
): Promise<void> {
  const now = Date.now();
  if (managedModelsRefreshInFlight) {
    await managedModelsRefreshInFlight;
    if (options.refreshBudget) {
      await refreshManagedBudgetIfConnected();
    }
    return;
  }

  if (
    managedModelsLastRefreshAttemptAt > 0 &&
    now - managedModelsLastRefreshAttemptAt < MANAGED_MODELS_REFRESH_MIN_INTERVAL_MS &&
    !managedCatalogNeedsReapply()
  ) {
    if (options.refreshBudget) {
      await refreshManagedBudgetIfConnected();
    }
    return;
  }

  managedModelsLastRefreshAttemptAt = now;
  let startupPromise!: Promise<void>;
  startupPromise = syncManagedProviderModels(options)
    .finally(() => {
      if (managedModelsRefreshInFlight === startupPromise) {
        managedModelsRefreshInFlight = null;
      }
    });
  managedModelsRefreshInFlight = startupPromise;
  await startupPromise;
}

export async function refreshManagedProviderAction(): Promise<void> {
  managedModelsLastRefreshAttemptAt = Date.now();
  await syncManagedProviderModels({ refreshBudget: true, forceRefresh: true })
}

export function refreshManagedProviderInBackgroundAction(
  options: { force?: boolean } = {}
): void {
  void refreshManagedProviderInBackground(options)
}

export function prewarmManagedStartupDataInBackgroundAction(): void {
  const accountRefresh = useAccountSessionStore.getState().checkStatus();
  const modelRefresh = refreshManagedProviderInBackground();
  void Promise.allSettled([
    accountRefresh,
    ...(modelRefresh ? [modelRefresh] : []),
  ]);
}

function reconcileManagedProviderModelsAfterStoreChange(): void {
  if (!managedCatalogNeedsReapply()) return;
  void syncManagedProviderModelsFromStartup();
}

export const managedProviderSync = {
  reconcileAfterStoreChange: reconcileManagedProviderModelsAfterStoreChange,
  syncFromStartup: syncManagedProviderModelsFromStartup,
};
