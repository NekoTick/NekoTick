import { actions as providerActions } from '@/stores/ai/providerActions';
import { useUnifiedStore } from '@/stores/unified/useUnifiedStore';
import { useUIStore } from '@/stores/uiSlice';
import { desktopWindow } from '@/lib/desktop/window';
import { flushPendingSave } from '@/lib/storage/unifiedStorage';
import {
  getImportedMarkdownThemesDirectoryPath,
  syncImportedMarkdownThemesFromDirectory,
} from '@/lib/markdown/theme-compatibility/importedThemeStorage';
import { buildScopedModelId } from '@/lib/ai/utils';
import { waitForUnifiedLoaded } from './syncE2EBridgeState';
import type { E2EBridge } from './syncE2EBridgeTypes';

type CoreBridgeActions = Pick<
  E2EBridge,
  | 'waitForUnifiedLoaded'
  | 'getUnifiedData'
  | 'reloadUnified'
  | 'flushUnifiedSave'
  | 'addProvider'
  | 'addModel'
  | 'setProviderFetchedModels'
  | 'deleteProvider'
  | 'setTimezone'
  | 'setMarkdownLineNumbers'
  | 'setMarkdownBodyLineNumbers'
  | 'getImportedMarkdownThemesDirectoryPath'
  | 'syncImportedMarkdownThemesFromDirectory'
  | 'setMarkdownImportedThemeId'
  | 'createWindow'
  | 'setAppViewMode'
>;

export function createSyncE2ECoreActions(): CoreBridgeActions {
  return {
    waitForUnifiedLoaded,
    getUnifiedData: () => structuredClone(useUnifiedStore.getState().data),
    reloadUnified: async () => {
      await useUnifiedStore.getState().reloadFromDisk();
    },
    flushUnifiedSave: flushPendingSave,
    addProvider: async (input) => {
      const id = providerActions.addProvider({
        name: input.name,
        type: 'newapi',
        endpointType: input.endpointType ?? 'openai',
        ...(typeof input.endpointTypeCheckedAt === 'number' ? { endpointTypeCheckedAt: input.endpointTypeCheckedAt } : {}),
        apiHost: input.apiHost ?? 'https://example.invalid/v1',
        apiKey: input.apiKey ?? '',
        enabled: input.enabled ?? true,
      });
      await flushPendingSave();
      return id;
    },
    addModel: async (input) => {
      const apiModelId = input.apiModelId ?? `e2e-model-${Date.now().toString(36)}`;
      providerActions.addModel({
        providerId: input.providerId,
        apiModelId,
        id: buildScopedModelId(input.providerId, apiModelId),
        name: input.name ?? apiModelId,
        enabled: input.enabled ?? true,
        ...(input.endpointType ? { endpointType: input.endpointType } : {}),
        ...(typeof input.endpointTypeCheckedAt === 'number' ? { endpointTypeCheckedAt: input.endpointTypeCheckedAt } : {}),
      });
      const modelId = buildScopedModelId(input.providerId, apiModelId);
      if (input.selected !== false) {
        providerActions.selectModel(modelId);
      }
      await flushPendingSave();
      return modelId;
    },
    setProviderFetchedModels: async (providerId, modelIds) => {
      providerActions.setProviderFetchedModels(providerId, modelIds);
      await flushPendingSave();
    },
    deleteProvider: async (id) => {
      providerActions.deleteProvider(id);
      await flushPendingSave();
    },
    setTimezone: async (offset, city) => {
      useUnifiedStore.getState().setTimezone(offset, city);
      await flushPendingSave();
    },
    setMarkdownLineNumbers: async (showLineNumbers) => {
      useUnifiedStore.getState().setMarkdownCodeBlockLineNumbers(showLineNumbers);
      await flushPendingSave();
    },
    setMarkdownBodyLineNumbers: async (showLineNumbers) => {
      useUnifiedStore.getState().setMarkdownBodyLineNumbers(showLineNumbers);
      await flushPendingSave();
    },
    getImportedMarkdownThemesDirectoryPath,
    syncImportedMarkdownThemesFromDirectory,
    setMarkdownImportedThemeId: async (importedThemeId) => {
      useUnifiedStore.getState().setMarkdownImportedThemeId(importedThemeId);
      await flushPendingSave();
    },
    createWindow: async (options) => {
      await desktopWindow.create(options);
    },
    setAppViewMode: async (mode) => {
      useUIStore.getState().setAppViewMode(mode);
      await flushPendingSave();
    },
  };
}
