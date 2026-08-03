import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { actions, managedProviderSync } from './providerActions';
import { useUnifiedStore } from '../unified/useUnifiedStore';
import { useAIUIStore } from './chatState';
import { useAccountSessionStore } from '../accountSession';
import { useManagedAIStore } from '../useManagedAIStore';
import { saveUnifiedData } from '@/lib/storage/unifiedStorage';
import type { AIModel, Provider } from '@/lib/ai/types';
import { MAX_AI_MODEL_FIELD_CHARS } from '@/lib/storage/unifiedStorageSaveTypes';
import { requestManager } from '@/lib/ai/requestManager';
import { backgroundBenchmarkRunner } from '@/lib/ai/healthCheck';

const { fetchManagedModelsMock, fetchManagedModelsVersionMock } = vi.hoisted(() => ({
  fetchManagedModelsMock: vi.fn(),
  fetchManagedModelsVersionMock: vi.fn(),
}));

let managedRefreshTestNow = 1_700_000_000_000;
const originalRefreshBudget = useManagedAIStore.getState().refreshBudget;
const originalCheckStatus = useAccountSessionStore.getState().checkStatus;

vi.mock('@/lib/storage/unifiedStorage', () => ({
  loadUnifiedData: vi.fn(async () => ({
    settings: {},
    customIcons: [],
    ai: null,
  })),
  saveUnifiedData: vi.fn(),
}));

vi.mock('@/lib/storage/assetStorage', () => ({
  scanGlobalIcons: vi.fn(async () => []),
}));

vi.mock('@/lib/ai/managedService', async () => {
  const actual = await vi.importActual<typeof import('@/lib/ai/managedService')>('@/lib/ai/managedService');
  return {
    ...actual,
    fetchManagedModelCatalog: fetchManagedModelsMock,
    fetchManagedModelsVersion: fetchManagedModelsVersionMock,
  };
});

function buildProvider(overrides: Partial<Provider>): Provider {
  return {
    id: 'provider-1',
    name: 'Channel 1',
    type: 'newapi',
    apiHost: '',
    apiKey: '',
    enabled: true,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function buildModel(overrides: Partial<AIModel>): AIModel {
  return {
    id: 'provider-1::gpt-test',
    apiModelId: 'gpt-test',
    name: 'GPT Test',
    providerId: 'provider-1',
    enabled: true,
    createdAt: 1,
    ...overrides,
  };
}

function buildCatalog(models: AIModel[], version: string | null = null) {
  return { models, version };
}

function seedAI(providers: Provider[], models: AIModel[] = []) {
  useUnifiedStore.setState({
    loaded: true,
    data: {
      settings: {} as never,
      customIcons: [],
      ai: {
        providers,
        models,
        benchmarkResults: {
          'provider-1': {
            items: {},
            overall: 'success',
            updatedAt: 1,
          },
        },
        fetchedModels: {
          'provider-1': ['gpt-test'],
        },
        sessions: [],
        messages: {},
        unreadSessionIds: [],
        selectedModelId: models[0]?.id ?? null,
        currentSessionId: null,
        temporaryChatEnabled: false,
        customSystemPrompt: '',
        includeTimeContext: true,
      },
    },
  });
}

describe('deleteIncompleteCustomProviders', () => {
  beforeEach(() => {
    fetchManagedModelsMock.mockReset();
    useUnifiedStore.setState({
      loaded: false,
      data: {
        settings: {} as never,
        customIcons: [],
        ai: {
          providers: [],
          models: [],
          benchmarkResults: {},
          fetchedModels: {},
          sessions: [],
          messages: {},
          unreadSessionIds: [],
          selectedModelId: null,
          currentSessionId: null,
          temporaryChatEnabled: false,
          customSystemPrompt: '',
          includeTimeContext: true,
        },
      },
    });
  });

  it('removes locally created custom channels when both base url and api key are empty', () => {
    const providerId = actions.addProvider({
      name: 'Channel 1',
      type: 'newapi',
      apiHost: '',
      apiKey: '',
      enabled: true,
    });
    actions.addModel(buildModel({
      id: `${providerId}::gpt-test`,
      providerId,
    }));
    actions.setProviderBenchmarkResults(providerId, {
      items: {},
      overall: 'success',
      updatedAt: 1,
    });
    actions.setProviderFetchedModels(providerId, ['gpt-test']);

    actions.deleteIncompleteCustomProviders();

    const ai = useUnifiedStore.getState().data.ai!;
    expect(ai.providers).toEqual([]);
    expect(ai.models).toEqual([]);
    expect(ai.benchmarkResults).toEqual({});
    expect(ai.fetchedModels).toEqual({});
    expect(ai.selectedModelId).toBeNull();
  });

  it('removes locally created empty channels with compact generated labels', () => {
    actions.addProvider({
      name: 'channel1',
      type: 'newapi',
      apiHost: '',
      apiKey: '',
      enabled: true,
    });

    actions.deleteIncompleteCustomProviders();

    expect(useUnifiedStore.getState().data.ai?.providers).toEqual([]);
  });

  it('removes a locally created empty channel after its generated name is cleared', () => {
    const providerId = actions.addProvider({
      name: 'Channel 1',
      type: 'newapi',
      apiHost: '',
      apiKey: '',
      enabled: true,
    });

    actions.updateProvider(providerId, { name: '' });
    expect(useUnifiedStore.getState().data.ai?.providers[0]?.name).toBe('Custom Provider');

    actions.deleteIncompleteCustomProviders();

    expect(useUnifiedStore.getState().data.ai?.providers).toEqual([]);
  });

  it('keeps incomplete custom channels that were synced from another window', () => {
    const provider = buildProvider({
      id: 'provider-remote',
      name: 'Channel 1',
      apiHost: '',
      apiKey: '',
    });
    seedAI([provider]);

    actions.deleteIncompleteCustomProviders();

    expect(useUnifiedStore.getState().data.ai?.providers).toEqual([provider]);
  });

  it('keeps custom channels when the generated label was changed', () => {
    const provider = buildProvider({
      id: 'provider-1',
      name: 's',
      apiHost: '',
      apiKey: '',
    });
    seedAI([provider]);

    actions.deleteIncompleteCustomProviders();

    expect(useUnifiedStore.getState().data.ai?.providers).toEqual([provider]);
  });

  it('keeps custom channels when only api key is filled', () => {
    const provider = buildProvider({
      id: 'provider-1',
      name: 'Channel 1',
      apiHost: '',
      apiKey: 'sk-test',
    });
    seedAI([provider]);

    actions.deleteIncompleteCustomProviders();

    expect(useUnifiedStore.getState().data.ai?.providers).toEqual([provider]);
  });

  it('keeps custom channels when only base url is filled', () => {
    const provider = buildProvider({
      id: 'provider-1',
      name: 'Channel 1',
      apiHost: 'https://api.example.com',
      apiKey: '',
    });
    seedAI([provider]);

    actions.deleteIncompleteCustomProviders();

    expect(useUnifiedStore.getState().data.ai?.providers).toEqual([provider]);
  });

  it('keeps custom channels with base url and api key even when the label is unchanged', () => {
    const provider = buildProvider({
      id: 'provider-1',
      name: 'Channel 1',
      apiHost: 'https://api.example.com',
      apiKey: 'sk-test',
    });
    seedAI([provider]);

    actions.deleteIncompleteCustomProviders();

    expect(useUnifiedStore.getState().data.ai?.providers).toEqual([provider]);
  });

  it('stores manually selected models on the current session', () => {
    const provider = buildProvider({ id: 'provider-1' });
    const defaultModel = buildModel({ id: 'model-default', apiModelId: 'default' });
    const selectedModel = buildModel({ id: 'model-a', apiModelId: 'model-a' });
    seedAI([provider], [defaultModel, selectedModel]);
    useUnifiedStore.setState((state) => ({
      data: {
        ...state.data,
        ai: {
          ...state.data.ai!,
          sessions: [
            { id: 'session-1', title: 'Chat', modelId: 'model-default', createdAt: 1, updatedAt: 1 },
          ],
        },
      },
    }));
    useAIUIStore.setState({ currentSessionId: 'session-1' });

    actions.selectModel('model-a');

    const ai = useUnifiedStore.getState().data.ai!;
    expect(ai.selectedModelId).toBe('model-a');
    expect(ai.sessions[0]?.modelId).toBe('model-a');
  });

  it('requires execution mode confirmation after changing models', () => {
    const provider = buildProvider({ id: 'provider-1' });
    const modelA = buildModel({ id: 'model-a', apiModelId: 'model-a' });
    const modelB = buildModel({ id: 'model-b', apiModelId: 'model-b' });
    seedAI([provider], [modelA, modelB]);
    useUnifiedStore.setState((state) => ({
      data: {
        ...state.data,
        ai: {
          ...state.data.ai!,
          computerUseEnabled: true,
        },
      },
    }));

    actions.selectModel('model-b');

    expect(useUnifiedStore.getState().data.ai?.computerUseEnabled).toBe(false);

    actions.setComputerUseEnabled(true);
    actions.selectModel('model-b');
    expect(useUnifiedStore.getState().data.ai?.computerUseEnabled).toBe(true);
  });

  it('keeps execution mode through model metadata changes but revokes it for route changes', () => {
    const provider = buildProvider({ id: 'provider-1' });
    const model = buildModel({ id: 'model-a', apiModelId: 'model-a' });
    seedAI([provider], [model]);
    actions.setComputerUseEnabled(true);

    actions.updateModel('model-a', { pinned: true, priceTier: '$$' });
    expect(useUnifiedStore.getState().data.ai?.computerUseEnabled).toBe(true);

    actions.updateModel('model-a', { endpointType: 'anthropic' });
    expect(useUnifiedStore.getState().data.ai?.computerUseEnabled).toBe(false);
  });

  it('does not revoke the active request when recording the already-used default endpoint', () => {
    const provider = buildProvider({
      id: 'provider-1',
      endpointType: 'anthropic',
    });
    const model = buildModel({ id: 'model-a', apiModelId: 'model-a' });
    seedAI([provider], [model]);
    actions.setComputerUseEnabled(true);
    const controller = requestManager.start('session-1', { computerUse: true });

    actions.updateProvider('provider-1', {
      endpointType: 'openai',
      endpointTypeCheckedAt: 12,
    });

    expect(useUnifiedStore.getState().data.ai?.computerUseEnabled).toBe(true);
    expect(controller.signal.aborted).toBe(false);
    requestManager.abort('session-1');
  });
});

describe('reorderCustomProviders', () => {
  beforeEach(() => {
    fetchManagedModelsMock.mockReset();
  });

  it('reorders only custom channels and keeps the managed channel first', () => {
    const managedProvider = buildProvider({
      id: 'vlaina-managed',
      name: 'vlaina',
      apiHost: 'https://api.vlaina.com/v1',
    });
    const providerA = buildProvider({ id: 'provider-a', name: 'A', createdAt: 1 });
    const providerB = buildProvider({ id: 'provider-b', name: 'B', createdAt: 2 });
    const providerC = buildProvider({ id: 'provider-c', name: 'C', createdAt: 3 });
    seedAI([managedProvider, providerA, providerB, providerC]);

    actions.reorderCustomProviders(['provider-c', 'provider-a', 'provider-b']);

    expect(useUnifiedStore.getState().data.ai?.providers.map((provider) => provider.id)).toEqual([
      'vlaina-managed',
      'provider-c',
      'provider-a',
      'provider-b',
    ]);
  });
});

describe('provider action no-ops', () => {
  beforeEach(() => {
    fetchManagedModelsMock.mockReset();
    seedAI([buildProvider({ id: 'provider-1' })], [
      buildModel({
        id: 'provider-1::gpt-test',
        apiModelId: 'gpt-test',
      }),
    ]);
    vi.mocked(saveUnifiedData).mockClear();
  });

  it('does not persist unchanged or missing provider/model updates', () => {
    actions.updateProvider('provider-1', { name: 'Channel 1' });
    actions.updateProvider('missing-provider', { name: 'Missing' });
    actions.updateModel('provider-1::gpt-test', { name: 'GPT Test' });
    actions.updateModel('missing-model', { name: 'Missing' });
    actions.deleteProvider('missing-provider');
    actions.deleteModel('missing-model');
    actions.setProviderBenchmarkResults('provider-1', {
      items: {},
      overall: 'success',
      updatedAt: 1,
    });
    actions.setProviderFetchedModels('provider-1', ['gpt-test']);
    actions.addModel({
      id: 'ignored',
      apiModelId: 'gpt-test',
      name: 'GPT Test',
      providerId: 'provider-1',
      enabled: true,
    });

    expect(saveUnifiedData).not.toHaveBeenCalled();
  });
});

describe('updateProvider', () => {
  beforeEach(() => {
    fetchManagedModelsMock.mockReset();
    seedAI([
      buildProvider({
        id: 'provider-1',
        apiHost: 'https://old.example.com',
        apiKey: 'sk-old',
        endpointType: 'anthropic',
        endpointTypeCheckedAt: 12,
      }),
      buildProvider({ id: 'provider-2', apiHost: 'https://other.example.com' }),
    ], [
      buildModel({
        id: 'provider-1::claude-sonnet-4-5',
        apiModelId: 'claude-sonnet-4-5',
        endpointType: 'anthropic',
        endpointTypeCheckedAt: 12,
      }),
      buildModel({
        id: 'provider-2::claude-sonnet-4-5',
        apiModelId: 'claude-sonnet-4-5',
        providerId: 'provider-2',
        endpointType: 'anthropic',
        endpointTypeCheckedAt: 12,
      }),
    ]);
    vi.mocked(saveUnifiedData).mockClear();
  });

  it('normalizes provider fields before they enter runtime state', () => {
    actions.updateProvider('provider-1', {
      name: '',
      apiHost: 'h'.repeat(MAX_AI_MODEL_FIELD_CHARS + 1),
      apiKey: 'k'.repeat(MAX_AI_MODEL_FIELD_CHARS + 1),
    });

    expect(useUnifiedStore.getState().data.ai?.providers[0]).toMatchObject({
      name: 'Custom Provider',
      apiHost: 'h'.repeat(MAX_AI_MODEL_FIELD_CHARS),
      apiKey: 'k'.repeat(MAX_AI_MODEL_FIELD_CHARS),
    });
  });

  it('normalizes manual model ids before they enter runtime state', () => {
    const overlongModelId = `  ${'m'.repeat(MAX_AI_MODEL_FIELD_CHARS + 1)}  `;

    actions.addModel({
      id: overlongModelId,
      apiModelId: overlongModelId,
      name: overlongModelId,
      providerId: 'provider-1',
      enabled: true,
    });

    const addedModel = useUnifiedStore.getState().data.ai?.models.at(-1);
    expect(addedModel?.apiModelId).toBe('m'.repeat(MAX_AI_MODEL_FIELD_CHARS));
    expect(addedModel?.name).toHaveLength(MAX_AI_MODEL_FIELD_CHARS);
    expect(addedModel?.id).toBe(`provider-1::${'m'.repeat(MAX_AI_MODEL_FIELD_CHARS)}`);
  });

  it('clears provider and model endpoint caches when the provider API host changes', () => {
    actions.updateProvider('provider-1', { apiHost: 'https://new.example.com' });

    const providers = useUnifiedStore.getState().data.ai?.providers || [];
    const updatedProvider = providers.find((provider) => provider.id === 'provider-1');
    expect(updatedProvider?.endpointType).toBeUndefined();
    expect(updatedProvider?.endpointTypeCheckedAt).toBeUndefined();

    const models = useUnifiedStore.getState().data.ai?.models || [];
    const updatedModel = models.find((model) => model.id === 'provider-1::claude-sonnet-4-5');
    expect(updatedModel?.endpointType).toBeUndefined();
    expect(updatedModel?.endpointTypeCheckedAt).toBeUndefined();
    expect(models.find((model) => model.id === 'provider-2::claude-sonnet-4-5')).toMatchObject({
      endpointType: 'anthropic',
      endpointTypeCheckedAt: 12,
    });
  });

  it('clears provider and model endpoint caches when the provider API key changes', () => {
    actions.updateProvider('provider-1', { apiKey: 'sk-new' });

    const providers = useUnifiedStore.getState().data.ai?.providers || [];
    const updatedProvider = providers.find((provider) => provider.id === 'provider-1');
    expect(updatedProvider?.endpointType).toBeUndefined();
    expect(updatedProvider?.endpointTypeCheckedAt).toBeUndefined();

    const models = useUnifiedStore.getState().data.ai?.models || [];
    const updatedModel = models.find((model) => model.id === 'provider-1::claude-sonnet-4-5');
    expect(updatedModel?.endpointType).toBeUndefined();
    expect(updatedModel?.endpointTypeCheckedAt).toBeUndefined();
    expect(models.find((model) => model.id === 'provider-2::claude-sonnet-4-5')).toMatchObject({
      endpointType: 'anthropic',
      endpointTypeCheckedAt: 12,
    });
  });

  it('clears connection-specific catalogs and benchmarks without deleting manual models', () => {
    useUnifiedStore.setState((state) => ({
      data: {
        ...state.data,
        ai: {
          ...state.data.ai!,
          benchmarkResults: {
            ...state.data.ai?.benchmarkResults,
            'provider-2': {
              items: {},
              overall: 'success',
              updatedAt: 2,
            },
          },
          fetchedModels: {
            ...state.data.ai?.fetchedModels,
            'provider-2': ['other-model'],
          },
        },
      },
    }));
    const stopBenchmark = vi.spyOn(backgroundBenchmarkRunner, 'stop');

    try {
      actions.updateProvider('provider-1', { apiHost: 'https://new.example.com' });

      const ai = useUnifiedStore.getState().data.ai!;
      expect(ai.models.map((model) => model.id)).toEqual([
        'provider-1::claude-sonnet-4-5',
        'provider-2::claude-sonnet-4-5',
      ]);
      expect(ai.benchmarkResults).toEqual({
        'provider-2': {
          items: {},
          overall: 'success',
          updatedAt: 2,
        },
      });
      expect(ai.fetchedModels).toEqual({ 'provider-2': ['other-model'] });
      expect(stopBenchmark).toHaveBeenCalledWith('provider-1');
    } finally {
      stopBenchmark.mockRestore();
    }
  });

  it('requires execution mode confirmation after the selected provider connection changes', () => {
    actions.setComputerUseEnabled(true);

    actions.updateProvider('provider-1', { apiHost: 'https://new.example.com' });

    expect(useUnifiedStore.getState().data.ai?.computerUseEnabled).toBe(false);
  });
});

describe('refreshManagedProviderInBackground', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    managedRefreshTestNow += 10 * 60 * 1000;
    vi.setSystemTime(managedRefreshTestNow);
    fetchManagedModelsMock.mockReset();
    fetchManagedModelsVersionMock.mockReset();
    useManagedAIStore.setState({ refreshBudget: originalRefreshBudget });
    useAccountSessionStore.setState({ isConnected: false, checkStatus: originalCheckStatus });
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    seedAI([
      buildProvider({
        id: 'vlaina-managed',
        name: 'vlaina',
        type: 'newapi',
        apiHost: 'https://api.vlaina.com/v1',
      }),
    ], [
      buildModel({
        id: 'vlaina-managed::old-model',
        apiModelId: 'old-model',
        name: 'Old Model',
        providerId: 'vlaina-managed',
      }),
    ]);
  });

  afterEach(() => {
    useManagedAIStore.setState({ refreshBudget: originalRefreshBudget });
    useAccountSessionStore.setState({ isConnected: false, checkStatus: originalCheckStatus });
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('keeps the existing managed models when background refresh fails', async () => {
    fetchManagedModelsMock.mockRejectedValue(new Error('network failed'));

    actions.refreshManagedProviderInBackground();
    await vi.runAllTimersAsync();

    expect(useUnifiedStore.getState().data.ai?.models.map((model) => model.apiModelId)).toEqual(['old-model']);
  });

  it('prewarms account entitlements and managed models together at startup', async () => {
    const checkStatus = vi.fn(async () => undefined);
    useAccountSessionStore.setState({ checkStatus });
    fetchManagedModelsMock.mockResolvedValue(buildCatalog([
      buildModel({
        id: 'vlaina-managed::startup-model',
        apiModelId: 'startup-model',
        name: 'Startup Model',
        providerId: 'vlaina-managed',
      }),
    ]));

    actions.prewarmManagedStartupDataInBackground();
    await vi.runAllTimersAsync();

    expect(checkStatus).toHaveBeenCalledWith();
    expect(fetchManagedModelsMock).toHaveBeenCalledTimes(1);
  });

  it('keeps prewarming managed models when the account refresh fails', async () => {
    const checkStatus = vi.fn(async () => {
      throw new Error('account unavailable');
    });
    useAccountSessionStore.setState({ checkStatus });
    fetchManagedModelsMock.mockResolvedValue(buildCatalog([
      buildModel({
        id: 'vlaina-managed::startup-model',
        apiModelId: 'startup-model',
        name: 'Startup Model',
        providerId: 'vlaina-managed',
      }),
    ]));

    actions.prewarmManagedStartupDataInBackground();
    await vi.runAllTimersAsync();

    expect(fetchManagedModelsMock).toHaveBeenCalledTimes(1);
    expect(useUnifiedStore.getState().data.ai?.models.map((model) => model.apiModelId)).toEqual(['startup-model']);
  });

  it('deduplicates rapid background refresh attempts', async () => {
    fetchManagedModelsMock.mockResolvedValue(buildCatalog([
      buildModel({
        id: 'vlaina-managed::new-model',
        apiModelId: 'new-model',
        name: 'New Model',
        providerId: 'vlaina-managed',
      }),
    ]));

    actions.refreshManagedProviderInBackground();
    actions.refreshManagedProviderInBackground();
    await vi.runAllTimersAsync();

    expect(fetchManagedModelsMock).toHaveBeenCalledTimes(1);
    expect(useUnifiedStore.getState().data.ai?.models.map((model) => model.apiModelId)).toEqual(['new-model']);
  });

  it('selects the managed default model when the previous selection is unavailable', async () => {
    seedAI([
      buildProvider({
        id: 'vlaina-managed',
        name: 'vlaina',
        type: 'newapi',
        apiHost: 'https://api.vlaina.com/v1',
      }),
    ], []);
    actions.setComputerUseEnabled(true);
    fetchManagedModelsMock.mockResolvedValue(buildCatalog([
      buildModel({
        id: 'vlaina-managed::first-model',
        apiModelId: 'first-model',
        name: 'First Model',
        providerId: 'vlaina-managed',
      }),
      buildModel({
        id: 'vlaina-managed::default-model',
        apiModelId: 'default-model',
        name: 'Default Model',
        providerId: 'vlaina-managed',
        isDefault: true,
      }),
    ]));

    actions.refreshManagedProviderInBackground();
    await vi.runAllTimersAsync();

    expect(useUnifiedStore.getState().data.ai?.selectedModelId).toBe('vlaina-managed::default-model');
    expect(useUnifiedStore.getState().data.ai?.computerUseEnabled).toBe(false);
  });

  it('revokes execution mode when a managed selected model changes its execution context', async () => {
    actions.setComputerUseEnabled(true);
    fetchManagedModelsMock.mockResolvedValue(buildCatalog([
      buildModel({
        id: 'vlaina-managed::old-model',
        apiModelId: 'old-model',
        name: 'Updated Old Model',
        providerId: 'vlaina-managed',
      }),
    ]));

    actions.refreshManagedProviderInBackground();
    await vi.runAllTimersAsync();

    expect(useUnifiedStore.getState().data.ai?.selectedModelId).toBe('vlaina-managed::old-model');
    expect(useUnifiedStore.getState().data.ai?.computerUseEnabled).toBe(false);
  });

  it('prefers the current session model over the managed default after refresh', async () => {
    seedAI([
      buildProvider({
        id: 'vlaina-managed',
        name: 'vlaina',
        type: 'newapi',
        apiHost: 'https://api.vlaina.com/v1',
      }),
    ], []);
    useUnifiedStore.setState((state) => ({
      data: {
        ...state.data,
        ai: {
          ...state.data.ai!,
          sessions: [
            { id: 'session-1', title: 'Model A chat', modelId: 'vlaina-managed::model-a', createdAt: 1, updatedAt: 1 },
          ],
        },
      },
    }));
    useAIUIStore.setState({ currentSessionId: 'session-1' });
    fetchManagedModelsMock.mockResolvedValue(buildCatalog([
      buildModel({
        id: 'vlaina-managed::default-model',
        apiModelId: 'default-model',
        name: 'Default Model',
        providerId: 'vlaina-managed',
        isDefault: true,
      }),
      buildModel({
        id: 'vlaina-managed::model-a',
        apiModelId: 'model-a',
        name: 'Model A',
        providerId: 'vlaina-managed',
      }),
    ]));

    actions.refreshManagedProviderInBackground();
    await vi.runAllTimersAsync();

    expect(useUnifiedStore.getState().data.ai?.selectedModelId).toBe('vlaina-managed::model-a');
  });

  it('skips non-forced refresh attempts inside the throttle window', async () => {
    fetchManagedModelsMock.mockResolvedValue(buildCatalog([
      buildModel({
        id: 'vlaina-managed::new-model',
        apiModelId: 'new-model',
        name: 'New Model',
        providerId: 'vlaina-managed',
      }),
    ]));

    actions.refreshManagedProviderInBackground();
    await vi.runAllTimersAsync();
    fetchManagedModelsMock.mockClear();

    actions.refreshManagedProviderInBackground();
    await vi.runAllTimersAsync();

    expect(fetchManagedModelsMock).not.toHaveBeenCalled();
  });

  it('bypasses the throttle window for forced refresh attempts', async () => {
    fetchManagedModelsMock
      .mockResolvedValueOnce(buildCatalog([
        buildModel({
          id: 'vlaina-managed::old-model',
          apiModelId: 'old-model',
          name: 'Old Model',
          providerId: 'vlaina-managed',
        }),
      ], 'v1'))
      .mockResolvedValueOnce(buildCatalog([
        buildModel({
          id: 'vlaina-managed::new-model',
          apiModelId: 'new-model',
          name: 'New Model',
          providerId: 'vlaina-managed',
        }),
      ], 'v2'));

    actions.refreshManagedProviderInBackground();
    await vi.runAllTimersAsync();

    actions.refreshManagedProviderInBackground({ force: true });
    await vi.runAllTimersAsync();

    expect(fetchManagedModelsMock).toHaveBeenCalledTimes(2);
    expect(useUnifiedStore.getState().data.ai?.models.map((model) => model.apiModelId)).toEqual(['new-model']);
  });

  it('does not let an older background catalog refresh overwrite a newer foreground refresh', async () => {
    let resolveBackground!: (value: ReturnType<typeof buildCatalog>) => void;
    const backgroundCatalog = new Promise<ReturnType<typeof buildCatalog>>((resolve) => {
      resolveBackground = resolve;
    });
    fetchManagedModelsMock
      .mockReturnValueOnce(backgroundCatalog)
      .mockResolvedValueOnce(buildCatalog([
        buildModel({
          id: 'vlaina-managed::fresh-model',
          apiModelId: 'fresh-model',
          name: 'Fresh Model',
          providerId: 'vlaina-managed',
        }),
      ], 'v2'));

    actions.refreshManagedProviderInBackground();
    await Promise.resolve();
    expect(fetchManagedModelsMock).toHaveBeenCalledTimes(1);

    await actions.refreshManagedProvider();
    expect(useUnifiedStore.getState().data.ai?.models.map((model) => model.apiModelId)).toEqual(['fresh-model']);

    resolveBackground(buildCatalog([
      buildModel({
        id: 'vlaina-managed::stale-model',
        apiModelId: 'stale-model',
        name: 'Stale Model',
        providerId: 'vlaina-managed',
      }),
    ], 'v1'));
    await backgroundCatalog;
    await vi.runAllTimersAsync();

    expect(useUnifiedStore.getState().data.ai?.models.map((model) => model.apiModelId)).toEqual(['fresh-model']);
  });

  it('coalesces concurrent forced refresh attempts but does not cooldown later foreground refreshes', async () => {
    let resolveFirst!: (value: ReturnType<typeof buildCatalog>) => void;
    const firstCatalog = new Promise<ReturnType<typeof buildCatalog>>((resolve) => {
      resolveFirst = resolve;
    });
    fetchManagedModelsMock
      .mockReturnValueOnce(firstCatalog)
      .mockResolvedValueOnce(buildCatalog([
        buildModel({
          id: 'vlaina-managed::fresh-model',
          apiModelId: 'fresh-model',
          name: 'Fresh Model',
          providerId: 'vlaina-managed',
        }),
      ]));

    actions.refreshManagedProviderInBackground({ force: true });
    actions.refreshManagedProviderInBackground({ force: true });
    await Promise.resolve();
    expect(fetchManagedModelsMock).toHaveBeenCalledTimes(1);

    resolveFirst(buildCatalog([
      buildModel({
        id: 'vlaina-managed::new-model',
        apiModelId: 'new-model',
        name: 'New Model',
        providerId: 'vlaina-managed',
      }),
    ]));
    await firstCatalog;
    await vi.runAllTimersAsync();

    actions.refreshManagedProviderInBackground({ force: true });
    await vi.runAllTimersAsync();

    expect(fetchManagedModelsVersionMock).toHaveBeenCalledTimes(1);
    expect(fetchManagedModelsMock).toHaveBeenCalledTimes(2);
    expect(useUnifiedStore.getState().data.ai?.models.map((model) => model.apiModelId)).toEqual(['fresh-model']);
  });

  it('skips the full catalog for foreground refreshes when the lightweight version is unchanged', async () => {
    fetchManagedModelsMock
      .mockResolvedValueOnce(buildCatalog([
        buildModel({
          id: 'vlaina-managed::old-model',
          apiModelId: 'old-model',
          name: 'Old Model',
          providerId: 'vlaina-managed',
        }),
      ], 'v1'))
      .mockResolvedValueOnce(buildCatalog([
        buildModel({
          id: 'vlaina-managed::updated-model',
          apiModelId: 'updated-model',
          name: 'Updated Model',
          providerId: 'vlaina-managed',
        }),
      ], 'v1'));
    fetchManagedModelsVersionMock.mockResolvedValue('v1');

    actions.refreshManagedProviderInBackground();
    await vi.runAllTimersAsync();

    actions.refreshManagedProviderInBackground({ force: true });
    await vi.runAllTimersAsync();

    expect(fetchManagedModelsVersionMock).toHaveBeenCalledTimes(1);
    expect(fetchManagedModelsMock).toHaveBeenCalledTimes(1);
    expect(useUnifiedStore.getState().data.ai?.models.map((model) => model.apiModelId)).toEqual(['old-model']);
  });

  it('falls back to a full foreground catalog refresh when the unchanged version is too old', async () => {
    fetchManagedModelsMock
      .mockResolvedValueOnce(buildCatalog([
        buildModel({
          id: 'vlaina-managed::old-model',
          apiModelId: 'old-model',
          name: 'Old Model',
          providerId: 'vlaina-managed',
        }),
      ], 'v1'))
      .mockResolvedValueOnce(buildCatalog([
        buildModel({
          id: 'vlaina-managed::updated-model',
          apiModelId: 'updated-model',
          name: 'Updated Model',
          providerId: 'vlaina-managed',
        }),
      ], 'v1'));
    fetchManagedModelsVersionMock.mockResolvedValue('v1');

    actions.refreshManagedProviderInBackground();
    await vi.runAllTimersAsync();
    vi.setSystemTime(managedRefreshTestNow + 70 * 1000);

    actions.refreshManagedProviderInBackground({ force: true });
    await vi.runAllTimersAsync();

    expect(fetchManagedModelsVersionMock).toHaveBeenCalledTimes(1);
    expect(fetchManagedModelsMock).toHaveBeenCalledTimes(2);
    expect(useUnifiedStore.getState().data.ai?.models.map((model) => model.apiModelId)).toEqual(['updated-model']);
  });

  it('throttles repeated startup syncs after the first catalog refresh', async () => {
    vi.setSystemTime(managedRefreshTestNow + 10 * 60 * 1000);
    fetchManagedModelsMock.mockResolvedValue(buildCatalog([
      buildModel({
        id: 'vlaina-managed::startup-model',
        apiModelId: 'startup-model',
        name: 'Startup Model',
        providerId: 'vlaina-managed',
      }),
    ]));

    await managedProviderSync.syncFromStartup();
    await managedProviderSync.syncFromStartup();

    expect(fetchManagedModelsMock).toHaveBeenCalledTimes(1);
    expect(useUnifiedStore.getState().data.ai?.models.map((model) => model.apiModelId)).toEqual(['startup-model']);
  });

  it('shares an in-flight startup catalog refresh with concurrent callers', async () => {
    vi.setSystemTime(managedRefreshTestNow + 10 * 60 * 1000);
    let resolveCatalog!: (catalog: ReturnType<typeof buildCatalog>) => void;
    fetchManagedModelsMock.mockReturnValue(new Promise((resolve) => {
      resolveCatalog = resolve;
    }));

    const firstSync = managedProviderSync.syncFromStartup();
    const secondSync = managedProviderSync.syncFromStartup();

    expect(fetchManagedModelsMock).toHaveBeenCalledTimes(1);
    resolveCatalog(buildCatalog([
      buildModel({
        id: 'vlaina-managed::shared-startup-model',
        apiModelId: 'shared-startup-model',
        name: 'Shared Startup Model',
        providerId: 'vlaina-managed',
      }),
    ]));
    await Promise.all([firstSync, secondSync]);

    expect(useUnifiedStore.getState().data.ai?.models.map((model) => model.apiModelId))
      .toEqual(['shared-startup-model']);
  });

  it('reapplies the managed catalog when a later store reload removes it', async () => {
    vi.setSystemTime(managedRefreshTestNow + 10 * 60 * 1000);
    fetchManagedModelsMock.mockResolvedValue(buildCatalog([
      buildModel({
        id: 'vlaina-managed::startup-model',
        apiModelId: 'startup-model',
        name: 'Startup Model',
        providerId: 'vlaina-managed',
      }),
    ]));

    await managedProviderSync.syncFromStartup();
    useUnifiedStore.getState().updateAIData({ models: [] }, true);

    managedProviderSync.reconcileAfterStoreChange();
    await vi.runAllTimersAsync();

    expect(fetchManagedModelsMock).toHaveBeenCalledTimes(2);
    expect(useUnifiedStore.getState().data.ai?.models.map((model) => model.apiModelId)).toEqual(['startup-model']);
  });

  it('does not reapply the managed catalog when only custom model ordering changes', async () => {
    vi.setSystemTime(managedRefreshTestNow + 10 * 60 * 1000);
    fetchManagedModelsMock.mockResolvedValue(buildCatalog([
      buildModel({
        id: 'vlaina-managed::startup-model',
        apiModelId: 'startup-model',
        name: 'Startup Model',
        providerId: 'vlaina-managed',
      }),
    ]));

    await managedProviderSync.syncFromStartup();
    const managedModel = useUnifiedStore.getState().data.ai!.models[0]!;
    useUnifiedStore.getState().updateAIData({
      models: [managedModel, buildModel({ id: 'provider-1::custom-model', apiModelId: 'custom-model' })],
    }, true);

    managedProviderSync.reconcileAfterStoreChange();
    await vi.runAllTimersAsync();

    expect(fetchManagedModelsMock).toHaveBeenCalledTimes(1);
  });

  it('does not refresh the managed budget during model sync while signed out', async () => {
    const refreshBudget = vi.fn(async () => undefined);
    useManagedAIStore.setState({ refreshBudget });
    useAccountSessionStore.setState({ isConnected: false });
    fetchManagedModelsMock.mockResolvedValue(buildCatalog([
      buildModel({
        id: 'vlaina-managed::public-model',
        apiModelId: 'public-model',
        name: 'Public Model',
        providerId: 'vlaina-managed',
      }),
    ]));

    await actions.refreshManagedProvider();

    expect(fetchManagedModelsMock).toHaveBeenCalledTimes(1);
    expect(refreshBudget).not.toHaveBeenCalled();
  });

  it('refreshes the managed budget during model sync when signed in', async () => {
    const refreshBudget = vi.fn(async () => undefined);
    useManagedAIStore.setState({ refreshBudget });
    useAccountSessionStore.setState({ isConnected: true });
    fetchManagedModelsMock.mockResolvedValue(buildCatalog([
      buildModel({
        id: 'vlaina-managed::public-model',
        apiModelId: 'public-model',
        name: 'Public Model',
        providerId: 'vlaina-managed',
      }),
    ]));

    await actions.refreshManagedProvider();

    expect(fetchManagedModelsMock).toHaveBeenCalledTimes(1);
    expect(refreshBudget).toHaveBeenCalledTimes(1);
  });
});

describe('addModels', () => {
  beforeEach(() => {
    fetchManagedModelsMock.mockReset();
    seedAI([buildProvider({ id: 'provider-1' })], [
      buildModel({
        id: 'provider-1::gpt-existing',
        apiModelId: 'gpt-existing',
      }),
    ]);
  });

  it('adds only models that are not already present or duplicated in the batch', () => {
    actions.addModels([
      {
        id: 'ignored',
        apiModelId: 'gpt-existing',
        name: 'Existing',
        providerId: 'provider-1',
        enabled: true,
      },
      {
        id: 'ignored',
        apiModelId: 'gpt-new',
        name: 'New',
        providerId: 'provider-1',
        enabled: true,
      },
      {
        id: 'ignored',
        apiModelId: 'gpt-new',
        name: 'New Duplicate',
        providerId: 'provider-1',
        enabled: true,
      },
    ]);

    expect(useUnifiedStore.getState().data.ai?.models.map((model) => model.apiModelId)).toEqual([
      'gpt-existing',
      'gpt-new',
    ]);
  });
});
