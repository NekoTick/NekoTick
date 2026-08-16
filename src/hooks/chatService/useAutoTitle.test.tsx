import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_AUTO_TITLE_CHARS, buildAutoTitlePrompt, useAutoTitle } from './useAutoTitle';
import { useUnifiedStore } from '@/stores/unified/useUnifiedStore';
import { useUIStore } from '@/stores/uiSlice';
import { sendMessageWithEndpointFallback } from './sendMessageWithEndpointFallback';
import type { AIModel, Provider } from '@/lib/ai/types';
import { APP_LANGUAGES, getMessages } from '@/lib/i18n';

const mocked = vi.hoisted(() => ({
  saveUnifiedData: vi.fn(),
  loadUnifiedData: vi.fn(async () => ({
    settings: {},
    customIcons: [],
    ai: null,
  })),
  scanGlobalIcons: vi.fn(async () => []),
  sendMessageWithEndpointFallback: vi.fn(),
  managedAIState: {
    budget: null as null | {
      active: boolean;
      usedPercent: number;
      remainingPercent: number;
      status: string;
    },
    applyBudgetSnapshot: vi.fn((budget: {
      active: boolean;
      usedPercent: number;
      remainingPercent: number;
      status: string;
    }) => {
      mocked.managedAIState.budget = budget;
    }),
  },
}));

vi.mock('@/lib/storage/unifiedStorage', () => ({
  loadUnifiedData: mocked.loadUnifiedData,
  saveUnifiedData: mocked.saveUnifiedData,
}));

vi.mock('@/lib/storage/assetStorage', () => ({
  scanGlobalIcons: mocked.scanGlobalIcons,
}));

vi.mock('./sendMessageWithEndpointFallback', () => ({
  sendMessageWithEndpointFallback: mocked.sendMessageWithEndpointFallback,
}));

vi.mock('@/stores/useManagedAIStore', () => ({
  applyManagedQuotaExhaustedSnapshot: () => mocked.managedAIState.applyBudgetSnapshot({
    active: false,
    usedPercent: 100,
    remainingPercent: 0,
    status: 'exhausted',
  }),
  useManagedAIStore: {
    getState: () => mocked.managedAIState,
  },
}));

const provider: Provider = {
  id: 'provider-1',
  name: 'Provider',
  type: 'newapi',
  endpointType: 'openai',
  endpointTypeCheckedAt: 1,
  apiHost: 'https://example.test/v1',
  apiKey: 'sk-test',
  enabled: true,
  createdAt: 1,
  updatedAt: 1,
};

const model: AIModel = {
  id: 'model-1',
  apiModelId: 'model-1',
  name: 'Model',
  providerId: provider.id,
  enabled: true,
  createdAt: 1,
};

const managedProvider: Provider = {
  id: 'vlaina-managed',
  name: 'vlaina',
  type: 'newapi',
  endpointType: 'openai',
  endpointTypeCheckedAt: 1,
  apiHost: 'https://api.vlaina.com/v1',
  apiKey: '',
  enabled: true,
  createdAt: 1,
  updatedAt: 1,
};

const managedModel: AIModel = {
  id: 'vlaina-managed::model-1',
  apiModelId: 'model-1',
  name: 'Managed Model',
  providerId: managedProvider.id,
  enabled: true,
  createdAt: 1,
};

const imageTitleCases = APP_LANGUAGES.map(({ code }) => [
  code,
  getMessages(code)['editor.slash.image'],
] as const);

function seedStore() {
  useUnifiedStore.setState({
    loaded: true,
    data: {
      settings: {
        timezone: { offset: 8, city: 'Asia/Shanghai' },
      } as never,
      customIcons: [],
      ai: {
        providers: [provider],
        models: [model],
        benchmarkResults: {},
        fetchedModels: {},
        sessions: [
          { id: 'session-1', title: 'New', modelId: model.id, createdAt: 1, updatedAt: 1 },
        ],
        messages: {
          'session-1': [{
            id: 'u1',
            role: 'user',
            content: 'Draft a database migration plan',
            modelId: model.id,
            timestamp: 1,
            versions: [{
              content: 'Draft a database migration plan',
              createdAt: 1,
              kind: 'original',
              subsequentMessages: [],
            }],
            currentVersionIndex: 0,
          }],
        },
        unreadSessionIds: [],
        selectedModelId: model.id,
        currentSessionId: 'session-1',
        temporaryChatEnabled: false,
        customSystemPrompt: '',
        includeTimeContext: false,
        webSearchEnabled: false,
      },
    },
    undoStack: [],
  });
}

function switchSessionToManagedModel() {
  const state = useUnifiedStore.getState();
  const ai = state.data.ai!;
  state.updateAIData({
    providers: [managedProvider],
    models: [managedModel],
    selectedModelId: managedModel.id,
    sessions: ai.sessions.map((session) => (
      session.id === 'session-1' ? { ...session, modelId: managedModel.id } : session
    )),
    messages: {
      ...ai.messages,
      'session-1': (ai.messages['session-1'] || []).map((message) => ({
        ...message,
        modelId: managedModel.id,
      })),
    },
  });
}

describe('useAutoTitle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocked.managedAIState.budget = null;
    useUIStore.setState({ languagePreference: 'system' });
    seedStore();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('deduplicates concurrent title generation across hook instances', async () => {
    let resolveTitle!: (value: string) => void;
    const pendingTitle = new Promise<string>((resolve) => {
      resolveTitle = resolve;
    });
    mocked.sendMessageWithEndpointFallback.mockReturnValueOnce(pendingTitle);

    const first = renderHook(() => useAutoTitle());
    const second = renderHook(() => useAutoTitle());

    let firstRequest!: Promise<void>;
    let secondRequest!: Promise<void>;
    await act(async () => {
      firstRequest = first.result.current.generateAutoTitle('session-1', provider.id, model.id);
      secondRequest = second.result.current.generateAutoTitle('session-1', provider.id, model.id);
      await Promise.resolve();
    });

    expect(sendMessageWithEndpointFallback).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveTitle('Migration Plan');
      await Promise.all([firstRequest, secondRequest]);
    });

    await waitFor(() => {
      expect(useUnifiedStore.getState().data.ai?.sessions[0]?.title).toBe('Migration Plan');
    });
  });

  it('does not update the session title when a timed-out title request resolves late', async () => {
    vi.useFakeTimers();
    let resolveTitle!: (value: string) => void;
    let capturedSignal: AbortSignal | undefined;
    const pendingTitle = new Promise<string>((resolve) => {
      resolveTitle = resolve;
    });
    mocked.sendMessageWithEndpointFallback.mockImplementationOnce(({ signal }) => {
      capturedSignal = signal;
      return pendingTitle;
    });

    const { result } = renderHook(() => useAutoTitle());

    let request!: Promise<void>;
    await act(async () => {
      request = result.current.generateAutoTitle('session-1', provider.id, model.id);
      await Promise.resolve();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(12_000);
    });

    expect(capturedSignal?.aborted).toBe(true);

    await act(async () => {
      resolveTitle('Late Title');
      await request;
    });

    expect(useUnifiedStore.getState().data.ai?.sessions[0]?.title).toBe('New');
  });

  it('does not write a title generated from stale messages', async () => {
    let resolveTitle!: (value: string) => void;
    const pendingTitle = new Promise<string>((resolve) => {
      resolveTitle = resolve;
    });
    mocked.sendMessageWithEndpointFallback.mockReturnValueOnce(pendingTitle);

    const { result } = renderHook(() => useAutoTitle());

    let request!: Promise<void>;
    await act(async () => {
      request = result.current.generateAutoTitle('session-1', provider.id, model.id);
      await Promise.resolve();
    });

    act(() => {
      const state = useUnifiedStore.getState();
      const ai = state.data.ai!;
      state.updateAIData({
        messages: {
          ...ai.messages,
          'session-1': [{
            id: 'u2',
            role: 'user',
            content: 'Plan a mobile UI redesign',
            modelId: model.id,
            timestamp: 2,
            versions: [{
              content: 'Plan a mobile UI redesign',
              createdAt: 2,
              kind: 'original',
              subsequentMessages: [],
            }],
            currentVersionIndex: 0,
          }],
        },
      });
    });

    await act(async () => {
      resolveTitle('Migration Plan');
      await request;
    });

    expect(useUnifiedStore.getState().data.ai?.sessions[0]?.title).toBe('New');
  });

  it('bounds generated title length before writing it to the session', async () => {
    mocked.sendMessageWithEndpointFallback.mockResolvedValueOnce(`${'A'.repeat(MAX_AUTO_TITLE_CHARS + 20)}   `);
    const { result } = renderHook(() => useAutoTitle());

    await act(async () => {
      await result.current.generateAutoTitle('session-1', provider.id, model.id);
    });

    expect(useUnifiedStore.getState().data.ai?.sessions[0]?.title).toBe('A'.repeat(MAX_AUTO_TITLE_CHARS));
  });

  it('does not send managed auto-title requests when managed quota is already exhausted', async () => {
    switchSessionToManagedModel();
    mocked.managedAIState.budget = {
      active: false,
      usedPercent: 100,
      remainingPercent: 0,
      status: 'exhausted',
    };
    const { result } = renderHook(() => useAutoTitle());

    await act(async () => {
      await result.current.generateAutoTitle('session-1', managedProvider.id, managedModel.id);
    });

    expect(mocked.sendMessageWithEndpointFallback).not.toHaveBeenCalled();
    expect(mocked.managedAIState.applyBudgetSnapshot).toHaveBeenCalledWith(expect.objectContaining({
      active: false,
      remainingPercent: 0,
      status: 'exhausted',
    }));
  });

  it('marks managed quota exhausted when auto-title receives a managed quota error', async () => {
    switchSessionToManagedModel();
    mocked.sendMessageWithEndpointFallback.mockRejectedValueOnce(Object.assign(
      new Error('MANAGED_QUOTA_EXHAUSTED'),
      { errorCode: 'points_exhausted', statusCode: 403 },
    ));
    const { result } = renderHook(() => useAutoTitle());

    await act(async () => {
      await result.current.generateAutoTitle('session-1', managedProvider.id, managedModel.id);
    });

    expect(mocked.managedAIState.applyBudgetSnapshot).toHaveBeenCalledWith(expect.objectContaining({
      active: false,
      remainingPercent: 0,
      status: 'exhausted',
    }));
  });

  it.each(imageTitleCases)('uses the %s image title for standalone image generation models', async (languagePreference, expectedTitle) => {
    useUIStore.setState({ languagePreference });
    const imageModel: AIModel = {
      ...model,
      id: 'image-model-1',
      apiModelId: 'gpt-image-1',
      name: 'GPT Image 1',
    };
    act(() => {
      const state = useUnifiedStore.getState();
      const ai = state.data.ai!;
      state.updateAIData({
        models: [imageModel],
        sessions: ai.sessions.map((session) => (
          session.id === 'session-1' ? { ...session, modelId: imageModel.id } : session
        )),
        selectedModelId: imageModel.id,
      });
    });
    const { result } = renderHook(() => useAutoTitle());

    await act(async () => {
      await result.current.generateAutoTitle('session-1', provider.id, imageModel.id);
    });

    expect(sendMessageWithEndpointFallback).not.toHaveBeenCalled();
    expect(useUnifiedStore.getState().data.ai?.sessions[0]?.title).toBe(expectedTitle);
  });

  it.each(imageTitleCases)('falls back to the %s image title when title generation returns image markdown', async (languagePreference, expectedTitle) => {
    useUIStore.setState({ languagePreference });
    mocked.sendMessageWithEndpointFallback.mockResolvedValueOnce('![]()');
    const { result } = renderHook(() => useAutoTitle());

    await act(async () => {
      await result.current.generateAutoTitle('session-1', provider.id, model.id);
    });

    expect(useUnifiedStore.getState().data.ai?.sessions[0]?.title).toBe(expectedTitle);
  });

  it('keeps the title prompt concise while naming in the app language', () => {
    expect(buildAutoTitlePrompt('整理这段对话', 'zh-CN')).toBe(`Name this chat in 简体中文 (zh-CN).
Max 5 words or 10 CJK characters. Return only the title, no quotes or punctuation.

USER_MESSAGES
整理这段对话`);
  });

  it('passes the selected app language to title generation', async () => {
    useUIStore.setState({ languagePreference: 'zh-CN' });
    mocked.sendMessageWithEndpointFallback.mockResolvedValueOnce('迁移计划');
    const { result } = renderHook(() => useAutoTitle());

    await act(async () => {
      await result.current.generateAutoTitle('session-1', provider.id, model.id);
    });

    expect(mocked.sendMessageWithEndpointFallback.mock.calls[0]?.[0].content).toContain('Name this chat in 简体中文 (zh-CN).');
  });
});
