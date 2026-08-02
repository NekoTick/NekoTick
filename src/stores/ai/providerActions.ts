import type { Provider } from '@/lib/ai/types'
import { generateId } from '@/lib/id'
import {
  isManagedProviderId,
} from '@/lib/ai/managedService'
import { useUnifiedStore } from '../unified/useUnifiedStore'
import { createChatActions } from './chatActions'
import {
  chooseFallbackSelectedModelId,
  filterModelsByEnabledProviders,
} from './providerStoreUtils'
import { chooseSessionAwareFallbackSelectedModelId } from './providerSelectionFallback'
import { modelActions } from './providerModelActions'
import {
  prewarmManagedStartupDataInBackgroundAction,
  refreshManagedProviderAction,
  refreshManagedProviderInBackgroundAction,
} from './providerManagedSync'
import { MAX_AI_MODEL_FIELD_CHARS } from '@/lib/storage/unifiedStorageSaveTypes'

const locallyCreatedProviderIds = new Set<string>();

function isDefaultChannelLabel(name: string): boolean {
  return /^channel\s*\d+$/i.test(name.trim());
}

function normalizeProviderName(name: string): string {
  const boundedName = name.slice(0, MAX_AI_MODEL_FIELD_CHARS)
  return boundedName.trim() ? boundedName : 'Custom Provider'
}

function normalizeProviderText(value: string): string {
  return value.slice(0, MAX_AI_MODEL_FIELD_CHARS)
}

function shouldDeleteIncompleteCustomProvider(provider: Provider): boolean {
  return (
    !isManagedProviderId(provider.id) &&
    (isDefaultChannelLabel(provider.name) || provider.name === 'Custom Provider') &&
    !provider.apiHost.trim() &&
    !provider.apiKey.trim()
  );
}

function providerExecutionContextChanged(current: Provider, next: Provider): boolean {
  const currentEndpointType = current.endpointType && current.endpointTypeCheckedAt
    ? current.endpointType
    : 'openai';
  const nextEndpointType = next.endpointType && next.endpointTypeCheckedAt
    ? next.endpointType
    : 'openai';
  return current.id !== next.id ||
    current.name !== next.name ||
    current.type !== next.type ||
    currentEndpointType !== nextEndpointType ||
    current.apiHost !== next.apiHost ||
    current.apiKey !== next.apiKey ||
    current.enabled !== next.enabled;
}

export const actions = {
  addProvider: (provider: Omit<Provider, 'id' | 'createdAt' | 'updatedAt'>) => {
    const id = generateId('provider-')
    const now = Date.now()
    const newProvider: Provider = {
      ...provider,
      id,
      name: normalizeProviderName(provider.name),
      apiHost: normalizeProviderText(provider.apiHost),
      apiKey: normalizeProviderText(provider.apiKey),
      createdAt: now,
      updatedAt: now,
    }
    locallyCreatedProviderIds.add(id)
    const state = useUnifiedStore.getState();
    const currentProviders = state.data.ai?.providers || [];
    state.updateAIData({ providers: [...currentProviders, newProvider] });
    return id
  },

  updateProvider: (id: string, updates: Partial<Provider>) => {
    if (isManagedProviderId(id)) return

    const normalizedUpdates: Partial<Provider> = {
      ...updates,
      ...(typeof updates.name === 'string' ? { name: normalizeProviderName(updates.name) } : {}),
      ...(typeof updates.apiHost === 'string' ? { apiHost: normalizeProviderText(updates.apiHost) } : {}),
      ...(typeof updates.apiKey === 'string' ? { apiKey: normalizeProviderText(updates.apiKey) } : {}),
    };
    const state = useUnifiedStore.getState();
    const ai = state.data.ai!;
    const providers = state.data.ai?.providers || [];
    const provider = providers.find((item) => item.id === id);
    if (!provider) return;

    const hasProviderChanges = (Object.entries(normalizedUpdates) as Array<[keyof Provider, Provider[keyof Provider]]>)
      .some(([key, value]) => !Object.is(provider[key], value));
    if (!hasProviderChanges) return;

    const apiHostChanged = typeof normalizedUpdates.apiHost === 'string' && normalizedUpdates.apiHost !== provider.apiHost;
    const apiKeyChanged = typeof normalizedUpdates.apiKey === 'string' && normalizedUpdates.apiKey !== provider.apiKey;
    const connectionChanged = apiHostChanged || apiKeyChanged;
    const nextProviders = providers.map((p) => {
      if (p.id !== id) return p;
      const nextProvider = { ...p, ...normalizedUpdates, updatedAt: Date.now() };
      return connectionChanged
        ? { ...nextProvider, endpointType: undefined, endpointTypeCheckedAt: undefined }
        : nextProvider;
    });
    const nextProvider = nextProviders.find((item) => item.id === id);
    const nextModels = connectionChanged
      ? ai.models.map((model) => model.providerId === id
        ? { ...model, endpointType: undefined, endpointTypeCheckedAt: undefined }
        : model)
      : ai.models;
    const enabledModels = filterModelsByEnabledProviders(nextModels, nextProviders)
    const nextSelectedModelId = chooseSessionAwareFallbackSelectedModelId(
      ai.selectedModelId,
      enabledModels,
      nextProviders,
      ai.sessions
    )
    const dataUpdates: Parameters<typeof state.updateAIData>[0] = {
      providers: nextProviders,
      selectedModelId: nextSelectedModelId,
      ...(nextSelectedModelId !== ai.selectedModelId ? { computerUseEnabled: false } : {}),
    };
    const selectedModelUsesProvider = ai.models.find(
      (model) => model.id === ai.selectedModelId,
    )?.providerId === id;
    if (selectedModelUsesProvider && nextProvider && providerExecutionContextChanged(provider, nextProvider)) {
      dataUpdates.computerUseEnabled = false;
    }
    if (connectionChanged) {
      dataUpdates.models = nextModels;
    }
    state.updateAIData(dataUpdates)
  },

  reorderCustomProviders: (orderedProviderIds: string[]) => {
    const state = useUnifiedStore.getState();
    const ai = state.data.ai!;
    const providers = ai.providers || [];
    const managedProviders = providers.filter((provider) => isManagedProviderId(provider.id));
    const customProviders = providers.filter((provider) => !isManagedProviderId(provider.id));
    const customProviderById = new Map(customProviders.map((provider) => [provider.id, provider] as const));
    const usedProviderIds = new Set<string>();
    const nextCustomProviders: Provider[] = [];

    orderedProviderIds.forEach((providerId) => {
      const provider = customProviderById.get(providerId);
      if (!provider || usedProviderIds.has(providerId)) {
        return;
      }
      usedProviderIds.add(providerId);
      nextCustomProviders.push(provider);
    });

    customProviders.forEach((provider) => {
      if (!usedProviderIds.has(provider.id)) {
        nextCustomProviders.push(provider);
      }
    });

    const nextProviders = [...managedProviders, ...nextCustomProviders];
    const orderChanged = nextProviders.length !== providers.length ||
      nextProviders.some((provider, index) => providers[index]?.id !== provider.id);

    if (!orderChanged) {
      return;
    }

    state.updateAIData({ providers: nextProviders });
  },

  deleteProvider: (id: string) => {
    if (isManagedProviderId(id)) return

    const state = useUnifiedStore.getState();
    const ai = state.data.ai!;
    if (!ai.providers.some((provider) => provider.id === id)) return;

    const remainingModels = ai.models.filter((m) => m.providerId !== id)
    const nextBenchmarkResults = { ...(ai.benchmarkResults || {}) }
    const nextFetchedModels = { ...(ai.fetchedModels || {}) }
    delete nextBenchmarkResults[id]
    delete nextFetchedModels[id]
    const nextSelectedModelId = chooseFallbackSelectedModelId(
      ai.selectedModelId && ai.models.find(m => m.id === ai.selectedModelId)?.providerId === id ? null : ai.selectedModelId,
      remainingModels
    )
    state.updateAIData({
      providers: ai.providers.filter((p) => p.id !== id),
      models: remainingModels,
      benchmarkResults: nextBenchmarkResults,
      fetchedModels: nextFetchedModels,
      deletedProviderIds: Array.from(new Set([...(ai.deletedProviderIds || []), id])),
      selectedModelId: nextSelectedModelId,
      ...(nextSelectedModelId !== ai.selectedModelId ? { computerUseEnabled: false } : {}),
    })
  },

  deleteIncompleteCustomProviders: () => {
    const state = useUnifiedStore.getState();
    const ai = state.data.ai!;
    const providerIdsToDelete = new Set(
      ai.providers
        .filter((provider) =>
          locallyCreatedProviderIds.has(provider.id) &&
          shouldDeleteIncompleteCustomProvider(provider)
        )
        .map((provider) => provider.id)
    );

    if (providerIdsToDelete.size === 0) {
      return;
    }

    const remainingModels = ai.models.filter((model) => !providerIdsToDelete.has(model.providerId));
    const nextBenchmarkResults = { ...(ai.benchmarkResults || {}) };
    const nextFetchedModels = { ...(ai.fetchedModels || {}) };
    providerIdsToDelete.forEach((providerId) => {
      delete nextBenchmarkResults[providerId];
      delete nextFetchedModels[providerId];
    });

    const selectedModelProviderId = ai.selectedModelId
      ? ai.models.find((model) => model.id === ai.selectedModelId)?.providerId
      : undefined;
    const nextSelectedModelId = chooseFallbackSelectedModelId(
      selectedModelProviderId && providerIdsToDelete.has(selectedModelProviderId)
        ? null
        : ai.selectedModelId,
      remainingModels
    );

    state.updateAIData({
      providers: ai.providers.filter((provider) => !providerIdsToDelete.has(provider.id)),
      models: remainingModels,
      benchmarkResults: nextBenchmarkResults,
      fetchedModels: nextFetchedModels,
      deletedProviderIds: Array.from(new Set([...(ai.deletedProviderIds || []), ...providerIdsToDelete])),
      selectedModelId: nextSelectedModelId,
      ...(nextSelectedModelId !== ai.selectedModelId ? { computerUseEnabled: false } : {}),
    });
    providerIdsToDelete.forEach((providerId) => {
      locallyCreatedProviderIds.delete(providerId);
    });
  },

  ...modelActions,
  prewarmManagedStartupDataInBackground: prewarmManagedStartupDataInBackgroundAction,
  refreshManagedProvider: refreshManagedProviderAction,
  refreshManagedProviderInBackground: refreshManagedProviderInBackgroundAction,
  ...createChatActions(),
};

export { managedProviderSync } from './providerManagedSync';
