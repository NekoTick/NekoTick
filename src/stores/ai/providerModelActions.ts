import type { AIModel, ProviderBenchmarkRecord } from '@/lib/ai/types'
import { buildScopedModelId, generateModelGroup, generateModelName } from '@/lib/ai/utils'
import { useUnifiedStore } from '../unified/useUnifiedStore'
import { useAIUIStore } from './chatState'
import { areModelExecutionContextsEqual } from './providerStoreUtils'
import {
  MAX_AI_MODEL_FIELD_CHARS,
  MAX_AI_PROVIDER_FETCHED_MODELS,
} from '@/lib/storage/unifiedStorageSaveTypes'

function areStringArraysEqual(left: readonly string[] = [], right: readonly string[] = []): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function areBenchmarkRecordsEqual(
  left: ProviderBenchmarkRecord | undefined,
  right: ProviderBenchmarkRecord
): boolean {
  if (!left) return false;
  if (left.overall !== right.overall || left.updatedAt !== right.updatedAt) return false;

  const leftItems = left.items || {};
  const rightItems = right.items || {};
  const leftKeys = Object.keys(leftItems);
  const rightKeys = Object.keys(rightItems);
  if (leftKeys.length !== rightKeys.length) return false;

  return leftKeys.every((key) => {
    const leftItem = leftItems[key];
    const rightItem = rightItems[key];
    return !!leftItem && !!rightItem &&
      leftItem.status === rightItem.status &&
      leftItem.latency === rightItem.latency &&
      leftItem.error === rightItem.error &&
      leftItem.checkedAt === rightItem.checkedAt;
  });
}

export const modelActions = {
  addModel: (model: Omit<AIModel, 'createdAt'>) => {
    const state = useUnifiedStore.getState();
    const ai = state.data.ai!;
    const apiModelId = model.apiModelId.trim().slice(0, MAX_AI_MODEL_FIELD_CHARS)
    if (!apiModelId) return
    const newModel: AIModel = {
      ...model,
      id: buildScopedModelId(model.providerId, apiModelId),
      apiModelId,
      name: (model.name || generateModelName(apiModelId)).slice(0, MAX_AI_MODEL_FIELD_CHARS),
      group: (model.group || generateModelGroup(apiModelId)).slice(0, MAX_AI_MODEL_FIELD_CHARS),
      createdAt: Date.now()
    }
    if (ai.models.some((item) => item.id.toLowerCase() === newModel.id.toLowerCase())) {
      return;
    }

    const updates: { models: AIModel[]; selectedModelId?: string; computerUseEnabled?: boolean } = {
      models: [...ai.models, newModel],
    };
    if (!ai.selectedModelId) {
      updates.selectedModelId = newModel.id;
      updates.computerUseEnabled = false;
    }
    state.updateAIData(updates);
  },

  addModels: (models: Array<Omit<AIModel, 'createdAt'>>) => {
    const state = useUnifiedStore.getState();
    const ai = state.data.ai!;
    const now = Date.now()
    const existingIds = new Set(ai.models.map((model) => model.id.toLowerCase()))
    const queuedIds = new Set<string>()
    const newModels: AIModel[] = models
      .flatMap((model) => {
        const apiModelId = model.apiModelId.trim().slice(0, MAX_AI_MODEL_FIELD_CHARS)
        if (!apiModelId) return []
        const id = buildScopedModelId(model.providerId, apiModelId)
        const normalizedId = id.toLowerCase()
        if (existingIds.has(normalizedId) || queuedIds.has(normalizedId)) {
          return []
        }
        queuedIds.add(normalizedId)
        return [{
          ...model,
          id,
          apiModelId,
          name: (model.name || generateModelName(apiModelId)).slice(0, MAX_AI_MODEL_FIELD_CHARS),
          group: (model.group || generateModelGroup(apiModelId)).slice(0, MAX_AI_MODEL_FIELD_CHARS),
          createdAt: now
        }]
      })

    if (newModels.length === 0) {
      return
    }

    const updates: { models: AIModel[]; selectedModelId?: string; computerUseEnabled?: boolean } = {
      models: [...ai.models, ...newModels],
    };
    if (!ai.selectedModelId && newModels.length > 0) {
      updates.selectedModelId = newModels[0].id;
      updates.computerUseEnabled = false;
    }
    state.updateAIData(updates);
  },

  updateModel: (id: string, updates: Partial<AIModel>) => {
    const state = useUnifiedStore.getState();
    const ai = state.data.ai!;
    const model = ai.models.find((item) => item.id === id);
    if (!model) return;

    const hasModelChanges = (Object.entries(updates) as Array<[keyof AIModel, AIModel[keyof AIModel]]>)
      .some(([key, value]) => !Object.is(model[key], value));
    if (!hasModelChanges) return;
    const nextModel = { ...model, ...updates };

    state.updateAIData({
      models: ai.models.map((m) => m.id === id ? nextModel : m),
      ...(ai.selectedModelId === id && !areModelExecutionContextsEqual(model, nextModel)
        ? { computerUseEnabled: false }
        : {}),
    })
  },

  deleteModel: (id: string) => {
    const state = useUnifiedStore.getState();
    const ai = state.data.ai!;
    const model = ai.models.find((item) => item.id === id)
    if (!model) return;

    const nextBenchmarkResults = { ...(ai.benchmarkResults || {}) }
    const currentProviderResults = nextBenchmarkResults[model.providerId]
    if (currentProviderResults?.items[id]) {
      const nextItems = { ...currentProviderResults.items }
      delete nextItems[id]
      nextBenchmarkResults[model.providerId] = {
        ...currentProviderResults,
        items: nextItems,
        updatedAt: Date.now(),
      }
    }
    const deletingSelectedModel = ai.selectedModelId === id;
    state.updateAIData({
      models: ai.models.filter((m) => m.id !== id),
      benchmarkResults: nextBenchmarkResults,
      selectedModelId: deletingSelectedModel ? null : ai.selectedModelId,
      ...(deletingSelectedModel ? { computerUseEnabled: false } : {}),
    })
  },

  setProviderBenchmarkResults: (providerId: string, record: ProviderBenchmarkRecord) => {
    const state = useUnifiedStore.getState();
    const ai = state.data.ai!;
    if (areBenchmarkRecordsEqual(ai.benchmarkResults?.[providerId], record)) return;

    state.updateAIData({
      benchmarkResults: {
        ...(ai.benchmarkResults || {}),
        [providerId]: record,
      }
    });
  },

  clearProviderBenchmarkResults: (providerId: string) => {
    const state = useUnifiedStore.getState();
    const ai = state.data.ai!;
    if (!ai.benchmarkResults?.[providerId]) return;

    const nextBenchmarkResults = { ...ai.benchmarkResults };
    delete nextBenchmarkResults[providerId];
    state.updateAIData({ benchmarkResults: nextBenchmarkResults });
  },

  setProviderFetchedModels: (providerId: string, modelIds: string[]) => {
    const state = useUnifiedStore.getState();
    const ai = state.data.ai!;
    const nextModelIds = [...new Set(
      modelIds
        .map((modelId) => modelId.trim().slice(0, MAX_AI_MODEL_FIELD_CHARS))
        .filter(Boolean),
    )].slice(0, MAX_AI_PROVIDER_FETCHED_MODELS);
    if (areStringArraysEqual(ai.fetchedModels?.[providerId] || [], nextModelIds)) {
      return;
    }

    state.updateAIData({
      fetchedModels: {
        ...(ai.fetchedModels || {}),
        [providerId]: nextModelIds,
      }
    });
  },

  clearProviderFetchedModels: (providerId: string) => {
    const state = useUnifiedStore.getState();
    const ai = state.data.ai!;
    if (!ai.fetchedModels?.[providerId]) return;

    const nextFetchedModels = { ...ai.fetchedModels };
    delete nextFetchedModels[providerId];
    state.updateAIData({ fetchedModels: nextFetchedModels });
  },

  selectModel: (modelId: string | null) => {
    const state = useUnifiedStore.getState()
    const ai = state.data.ai!
    const currentSessionId = useAIUIStore.getState().currentSessionId
    const updates: Parameters<typeof state.updateAIData>[0] = { selectedModelId: modelId }

    if (ai.selectedModelId !== modelId) {
      updates.computerUseEnabled = false
    }

    if (modelId && currentSessionId) {
      const session = ai.sessions.find((item) => item.id === currentSessionId)
      if (session && session.modelId !== modelId) {
        updates.sessions = ai.sessions.map((item) =>
          item.id === currentSessionId ? { ...item, modelId, updatedAt: Date.now() } : item
        )
      }
    }

    state.updateAIData(updates)
  },

  setCustomSystemPrompt: (prompt: string) => {
    useUnifiedStore.getState().updateAIData({ customSystemPrompt: prompt });
  },

  setIncludeTimeContext: (enabled: boolean) => {
    useUnifiedStore.getState().updateAIData({ includeTimeContext: enabled });
  },

  setWebSearchEnabled: (enabled: boolean) => {
    useUnifiedStore.getState().updateAIData({ webSearchEnabled: enabled });
  },

  setComputerUseEnabled: (enabled: boolean) => {
    useUnifiedStore.getState().updateAIData({ computerUseEnabled: enabled });
  },
};
