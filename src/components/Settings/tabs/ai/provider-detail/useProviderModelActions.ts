import { useEffect, useRef, useState } from 'react';
import { openaiClient } from '@/lib/ai/providers/openai';
import { getModelFetchErrorMessageKey } from '@/lib/ai/providers/modelDetection';
import type { AIModel, Provider } from '@/lib/ai/types';
import type { MessageKey } from '@/lib/i18n';

export function useProviderModelActions({
  provider,
  providerModels,
  canUseConnectionActions,
  draft,
  addModel,
  addModels,
  deleteModel,
  updateProvider,
  setFetchedModels,
  setProviderFetchedModels,
  resetBenchmarkState,
}: {
  provider: Provider | undefined;
  providerModels: AIModel[];
  canUseConnectionActions: boolean;
  draft: { name: string; apiHost: string; apiKey: string; enabled: boolean };
  addModel: (model: { id: string; apiModelId: string; name: string; providerId: string; enabled: boolean }) => void;
  addModels: (models: Array<{ id: string; apiModelId: string; name: string; providerId: string; enabled: boolean }>) => void;
  deleteModel: (modelId: string) => void;
  updateProvider: (providerId: string, updates: Partial<Provider>) => void;
  setFetchedModels: (models: string[]) => void;
  setProviderFetchedModels: (providerId: string, models: string[]) => void;
  resetBenchmarkState: () => void;
}) {
  const [fetchError, setFetchError] = useState<MessageKey | ''>('');
  const [isFetchingModels, setIsFetchingModels] = useState(false);
  const fetchRequestRef = useRef<{
    id: number;
    controller: AbortController;
  } | null>(null);
  const nextFetchRequestIdRef = useRef(0);

  useEffect(() => {
    return () => {
      fetchRequestRef.current?.controller.abort();
      fetchRequestRef.current = null;
    };
  }, []);

  useEffect(() => {
    fetchRequestRef.current?.controller.abort();
  }, [provider?.id, draft.apiHost, draft.apiKey]);

  const buildTempProvider = (): Provider | null => {
    if (!provider) return null;
    const sameConnection = draft.apiHost === provider.apiHost && draft.apiKey === provider.apiKey;
    return {
      ...provider,
      name: draft.name,
      apiHost: draft.apiHost,
      apiKey: draft.apiKey,
      enabled: draft.enabled,
      endpointType: sameConnection ? provider.endpointType : undefined,
      endpointTypeCheckedAt: sameConnection ? provider.endpointTypeCheckedAt : undefined,
      updatedAt: Date.now(),
    };
  };

  const handleFetchModels = async () => {
    if (!canUseConnectionActions) {
      setFetchError('settings.ai.fetchModelsMissingCredentials');
      return;
    }

    if (!provider) return;

    const tempProvider = buildTempProvider();
    if (!tempProvider) return;
    const currentProviderId = provider.id;
    const requestId = nextFetchRequestIdRef.current + 1;
    nextFetchRequestIdRef.current = requestId;
    fetchRequestRef.current?.controller.abort();
    const controller = new AbortController();
    fetchRequestRef.current = { id: requestId, controller };
    const isCurrentFetchRequest = () =>
      fetchRequestRef.current?.id === requestId && !controller.signal.aborted;

    setIsFetchingModels(true);
    setFetchError('');

    try {
      const result = await openaiClient.getModelsWithEndpointDetection(tempProvider, controller.signal);
      if (!isCurrentFetchRequest()) return;
      const modelsList = result.models;
      setFetchedModels(modelsList);
      setProviderFetchedModels(currentProviderId, modelsList);
      updateProvider(currentProviderId, {
        endpointType: result.endpointType,
        endpointTypeCheckedAt: Date.now(),
      });
      if (modelsList.length === 0) {
        setFetchError('settings.ai.fetchModelsEmpty');
      }
    } catch (error) {
      if (!isCurrentFetchRequest()) return;
      setFetchError(getModelFetchErrorMessageKey(error));
    } finally {
      if (fetchRequestRef.current?.id === requestId) {
        fetchRequestRef.current = null;
        setIsFetchingModels(false);
      }
    }
  };

  const handleAddModel = (id: string, displayName?: string): boolean => {
    if (!id.trim() || !provider) return false;

    const trimmedId = id.trim();
    const existsInProvider = providerModels.some((m) => m.apiModelId.toLowerCase() === trimmedId.toLowerCase());
    if (existsInProvider) return false;

    addModel({
      id: trimmedId,
      apiModelId: trimmedId,
      name: displayName?.trim() || trimmedId,
      providerId: provider.id,
      enabled: true,
    });

    return true;
  };

  const handleBatchAdd = (ids: string[]) => {
    if (!provider || ids.length === 0) return;

    const existingIds = new Set(providerModels.map((m) => m.apiModelId.toLowerCase()));
    const newIds = ids
      .map((id) => id.trim())
      .filter((id) => id && !existingIds.has(id.toLowerCase()));

    if (newIds.length === 0) return;

    addModels(
      newIds.map((id) => ({
        id,
        apiModelId: id,
        name: id,
        providerId: provider.id,
        enabled: true,
      }))
    );
  };

  const handleClearAllModels = () => {
    if (providerModels.length === 0 || !provider) return;
    providerModels.forEach((model) => {
      deleteModel(model.id);
    });
    resetBenchmarkState();
  };

  return {
    fetchError,
    setFetchError,
    isFetchingModels,
    handleFetchModels,
    handleAddModel,
    handleBatchAdd,
    handleClearAllModels,
  };
}
