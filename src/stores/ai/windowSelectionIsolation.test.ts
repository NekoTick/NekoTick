import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { actions, createAIChatSession, useAIStore, useAIStoreRuntimeEffects } from '@/stores/useAIStore';
import { useAIUIStore } from './chatState';
import { useUnifiedStore } from '../unified/useUnifiedStore';
import { MAX_CHAT_SESSION_DELETE_CONCURRENCY } from './sessionActions';
import type { ChatMessage } from '@/lib/ai/types';
import { clearSessionIdAliases } from '@/lib/ai/sessionIdAliases';

const mocked = vi.hoisted(() => {
  const managedStore = {
    refreshBudget: vi.fn(async () => {}),
    clearBudget: vi.fn(),
  };

  const accountState = {
    isConnected: false,
    checkStatus: vi.fn(async () => {}),
    handleAuthCallback: vi.fn(async () => false),
    hydrateAvatar: vi.fn(async () => {}),
  };

  return {
    saveUnifiedData: vi.fn(),
    loadUnifiedData: vi.fn(async () => ({
      settings: {},
      customIcons: [],
      ai: null,
    })),
    scanGlobalIcons: vi.fn(async () => []),
    saveSessionJson: vi.fn(async () => {}),
    scheduleSessionJsonSave: vi.fn(),
    cancelSessionJsonSave: vi.fn(),
    deleteSessionJson: vi.fn(async () => {}),
    loadSessionJson: vi.fn(async (_sessionId: string): Promise<ChatMessage[] | null> => []),
    hasSessionJson: vi.fn(async () => false),
    persistDataUrlAttachment: vi.fn(async () => 'attachment://persisted.png'),
    deleteAttachment: vi.fn(async () => {}),
    createStoredAttachmentFromSource: vi.fn((src: string) => ({
      id: 'stored-attachment',
      path: '',
      previewUrl: src,
      assetUrl: src,
      name: 'persisted.png',
      type: 'image/png',
      size: 0,
    })),
    flushPendingSessionJsonSaves: vi.fn(async () => {}),
    readWindowLaunchContext: vi.fn(() => ({
      isNewWindow: false,
      notesRootPath: null as string | null,
      notePath: null as string | null,
      folderPath: null as string | null,
      chatSessionId: null as string | null,
      viewMode: null as 'notes' | 'chat' | 'lab' | null,
    })),
    requestAbort: vi.fn(),
    requestTransfer: vi.fn(),
    requestIsGenerating: vi.fn(() => false),
    refreshBudget: managedStore.refreshBudget,
    clearBudget: managedStore.clearBudget,
    useManagedAIStore: {
      getState: () => managedStore,
    },
    useAccountSessionStore: (selector: (state: typeof accountState) => unknown) => selector(accountState),
    runWithSessionMutationLock: vi.fn(async (_id: string, task: () => Promise<unknown> | unknown) => {
      return await task();
    }),
    runWithSessionMutationLocks: vi.fn(async (_ids: string[], task: () => Promise<unknown> | unknown) => {
      return await task();
    }),
  };
});

vi.mock('@/lib/storage/unifiedStorage', () => ({
  loadUnifiedData: mocked.loadUnifiedData,
  saveUnifiedData: mocked.saveUnifiedData,
}));

vi.mock('@/lib/storage/assetStorage', () => ({
  scanGlobalIcons: mocked.scanGlobalIcons,
}));

vi.mock('@/lib/storage/chatStorage', () => ({
  saveSessionJson: mocked.saveSessionJson,
  scheduleSessionJsonSave: mocked.scheduleSessionJsonSave,
  cancelSessionJsonSave: mocked.cancelSessionJsonSave,
  deleteSessionJson: mocked.deleteSessionJson,
  loadSessionJson: mocked.loadSessionJson,
  hasSessionJson: mocked.hasSessionJson,
  flushPendingSessionJsonSaves: mocked.flushPendingSessionJsonSaves,
}));

vi.mock('@/lib/storage/attachmentStorage', () => ({
  persistDataUrlAttachment: mocked.persistDataUrlAttachment,
  deleteAttachment: mocked.deleteAttachment,
  createStoredAttachmentFromSource: mocked.createStoredAttachmentFromSource,
}));

vi.mock('@/lib/desktop/launchContext', () => ({
  readWindowLaunchContext: mocked.readWindowLaunchContext,
}));

vi.mock('@/lib/ai/requestManager', () => ({
  requestManager: {
    abort: mocked.requestAbort,
    transfer: mocked.requestTransfer,
    isGenerating: mocked.requestIsGenerating,
  },
}));

vi.mock('@/stores/useManagedAIStore', () => ({
  clearManagedBudgetUnlessQuotaExhausted: vi.fn(),
  useManagedAIStore: mocked.useManagedAIStore,
}));

vi.mock('@/stores/accountSession', () => ({
  useAccountSessionStore: mocked.useAccountSessionStore,
}));

vi.mock('@/lib/ai/sessionMutationLock', () => ({
  runWithSessionMutationLock: mocked.runWithSessionMutationLock,
  runWithSessionMutationLocks: mocked.runWithSessionMutationLocks,
}));

const managedProvider = {
  id: 'vlaina-managed',
  name: 'vlaina',
  type: 'newapi' as const,
  apiHost: 'https://api.vlaina.com/v1',
  apiKey: '',
  enabled: true,
  createdAt: 1,
  updatedAt: 1,
};

const managedModel = {
  id: 'vlaina-managed:gpt-5',
  apiModelId: 'gpt-5',
  name: 'GPT-5',
  providerId: 'vlaina-managed',
  group: 'gpt',
  enabled: true,
  createdAt: 1,
};

function seedStores(overrides?: {
  currentSessionId?: string | null;
  lastChatSessionId?: string | null;
  temporaryChatEnabled?: boolean;
}) {
  useUnifiedStore.setState({
    loaded: true,
    data: {
      settings: {
        ui: {
          ...(overrides && 'lastChatSessionId' in overrides
            ? { lastChatSessionId: overrides.lastChatSessionId }
            : {}),
        },
      } as never,
      customIcons: [],
      ai: {
        providers: [managedProvider],
        models: [managedModel],
        benchmarkResults: {},
        fetchedModels: {},
        sessions: [
          {
            id: 'session-1',
            title: 'First',
            modelId: managedModel.id,
            createdAt: 1,
            updatedAt: 10,
          },
          {
            id: 'session-2',
            title: 'Second',
            modelId: managedModel.id,
            createdAt: 2,
            updatedAt: 20,
          },
        ],
        messages: {
          'session-1': [{ id: 'm1', role: 'user', content: 'hello', modelId: managedModel.id, timestamp: 1, versions: [{ content: 'hello', createdAt: 1, kind: 'original' as const, subsequentMessages: [] }], currentVersionIndex: 0 }],
          'session-2': [],
        },
        unreadSessionIds: [],
        selectedModelId: managedModel.id,
        currentSessionId: overrides?.currentSessionId ?? 'session-1',
        temporaryChatEnabled: overrides?.temporaryChatEnabled ?? false,
        customSystemPrompt: '',
        includeTimeContext: true,
      },
    },
    undoStack: [],
  });

  useAIUIStore.setState({
    generatingSessions: {},
    unreadSessions: {},
    error: null,
    currentSessionId: null,
    temporaryChatEnabled: false,
    selectionInitialized: false,
    temporaryReturnSessionId: null,
  });
}

describe('chat window selection isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocked.readWindowLaunchContext.mockReturnValue({
      isNewWindow: false,
      notesRootPath: null,
      notePath: null,
      folderPath: null,
      chatSessionId: null,
      viewMode: null,
    });
    seedStores();
  });

  afterEach(() => {
    vi.useRealTimers();
    clearSessionIdAliases();
    useAIUIStore.setState({
      generatingSessions: {},
      unreadSessions: {},
      error: null,
      currentSessionId: null,
      temporaryChatEnabled: false,
      selectionInitialized: false,
      temporaryReturnSessionId: null,
    });
  });

  it('initializes selection from shared state for a regular window', async () => {
    let hook:
      | {
          result: { current: ReturnType<typeof useAIStore> };
          unmount: () => void;
        }
      | undefined;
    await act(async () => {
      hook = renderHook(() => {
        useAIStoreRuntimeEffects();
        return useAIStore();
      });
    });

    const { result, unmount } = hook!;

    expect(result.current.currentSessionId).toBe('session-1');
    expect(result.current.temporaryChatEnabled).toBe(false);
    expect(useUnifiedStore.getState().data.ai?.currentSessionId).toBe('session-1');
    unmount();
  });

  it('does not rerender runtime selection effects for message-only updates', async () => {
    let renderCount = 0;
    let hook:
      | { unmount: () => void }
      | undefined;

    await act(async () => {
      hook = renderHook(() => {
        renderCount += 1;
        useAIStoreRuntimeEffects();
      });
    });
    const settledRenderCount = renderCount;
    const originalMessages = useUnifiedStore.getState().data.ai?.messages ?? {};

    await act(async () => {
      useUnifiedStore.getState().updateAIData({
        messages: {
          ...originalMessages,
          'session-1': [{
            ...((originalMessages['session-1'] || [])[0] as ChatMessage),
            content: 'stream update',
          }],
        },
      }, true);
    });

    expect(renderCount).toBe(settledRenderCount);
    hook?.unmount();
  });

  it('initializes regular windows from the persisted last chat session first', async () => {
    seedStores({
      currentSessionId: 'session-1',
      lastChatSessionId: 'session-2',
    });

    let hook:
      | {
          result: { current: ReturnType<typeof useAIStore> };
          unmount: () => void;
        }
      | undefined;
    await act(async () => {
      hook = renderHook(() => {
        useAIStoreRuntimeEffects();
        return useAIStore();
      });
    });

    const { result, unmount } = hook!;

    expect(result.current.currentSessionId).toBe('session-2');
    expect(useUnifiedStore.getState().data.ai?.currentSessionId).toBe('session-1');
    unmount();
  });

  it('initializes a new chat window with a blank local selection only', async () => {
    mocked.readWindowLaunchContext.mockReturnValue({
      isNewWindow: true,
      notesRootPath: null,
      notePath: null,
      folderPath: null,
      chatSessionId: null,
      viewMode: 'chat',
    });

    let hook:
      | {
          result: { current: ReturnType<typeof useAIStore> };
          unmount: () => void;
        }
      | undefined;
    await act(async () => {
      hook = renderHook(() => {
        useAIStoreRuntimeEffects();
        return useAIStore();
      });
    });

    const { result, unmount } = hook!;

    expect(result.current.currentSessionId).toBe(null);
    expect(result.current.temporaryChatEnabled).toBe(false);
    expect(useUnifiedStore.getState().data.ai?.currentSessionId).toBe('session-1');
    unmount();
  });

  it('initializes a new chat window with the requested chat session locally', async () => {
    mocked.readWindowLaunchContext.mockReturnValue({
      isNewWindow: true,
      notesRootPath: null,
      notePath: null,
      folderPath: null,
      chatSessionId: 'session-2',
      viewMode: 'chat',
    });

    let hook:
      | {
          result: { current: ReturnType<typeof useAIStore> };
          unmount: () => void;
        }
      | undefined;
    await act(async () => {
      hook = renderHook(() => {
        useAIStoreRuntimeEffects();
        return useAIStore();
      });
    });

    const { result, unmount } = hook!;

    expect(result.current.currentSessionId).toBe('session-2');
    expect(result.current.temporaryChatEnabled).toBe(false);
    expect(useUnifiedStore.getState().data.ai?.currentSessionId).toBe('session-1');
    unmount();
  });

  it('switches the active session locally without mutating shared selection', async () => {
    useAIUIStore.getState().setChatSelection({
      currentSessionId: 'session-1',
      temporaryChatEnabled: false,
    });

    await act(async () => {
      await actions.switchSession('session-2');
    });

    expect(useAIUIStore.getState().currentSessionId).toBe('session-2');
    expect(useUnifiedStore.getState().data.ai?.currentSessionId).toBe('session-1');
    expect(useUnifiedStore.getState().data.settings.ui?.lastChatSessionId).toBe('session-2');
  });

  it('does not persist last chat selection from a secondary chat window', async () => {
    mocked.readWindowLaunchContext.mockReturnValue({
      isNewWindow: true,
      notesRootPath: null,
      notePath: null,
      folderPath: null,
      chatSessionId: null,
      viewMode: 'chat',
    });
    useAIUIStore.getState().setChatSelection({
      currentSessionId: 'session-1',
      temporaryChatEnabled: false,
    });

    await act(async () => {
      await actions.switchSession('session-2');
    });

    expect(useAIUIStore.getState().currentSessionId).toBe('session-2');
    expect(useUnifiedStore.getState().data.settings.ui?.lastChatSessionId).toBeUndefined();
    expect(mocked.saveUnifiedData).not.toHaveBeenCalled();
  });

  it('persists inline images in a cached session after switching without blocking selection', async () => {
    vi.useFakeTimers();
    mocked.persistDataUrlAttachment.mockResolvedValueOnce('attachment://persisted.png');
    useUnifiedStore.setState((state) => ({
      ...state,
      data: {
        ...state.data,
        ai: state.data.ai
          ? {
              ...state.data.ai,
              messages: {
                ...state.data.ai.messages,
                'session-2': [
                  {
                    id: 'm2',
                    role: 'user',
                    content: '![image](<data:image/png;base64,INLINE>)\n\nDescribe',
                    imageSources: ['data:image/png;base64,INLINE'],
                    modelId: managedModel.id,
                    timestamp: 2,
                    versions: [{
                      content: '![image](<data:image/png;base64,INLINE>)\n\nDescribe',
                      createdAt: 2,
                      kind: 'original' as const,
                      subsequentMessages: [],
                    }],
                    currentVersionIndex: 0,
                  },
                ],
              },
            }
          : state.data.ai,
      },
    }));
    useAIUIStore.getState().setChatSelection({
      currentSessionId: 'session-1',
      temporaryChatEnabled: false,
    });

    await act(async () => {
      await actions.switchSession('session-2');
    });

    expect(useAIUIStore.getState().currentSessionId).toBe('session-2');

    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });
    vi.useRealTimers();

    expect(mocked.persistDataUrlAttachment).toHaveBeenCalledWith('data:image/png;base64,INLINE');
    expect(useUnifiedStore.getState().data.ai?.messages['session-2']?.[0]?.content)
      .toBe('![image](<attachment://persisted.png>)\n\nDescribe');
    expect(useUnifiedStore.getState().data.ai?.messages['session-2']?.[0]?.imageSources)
      .toEqual(['attachment://persisted.png']);
    expect(mocked.saveSessionJson).toHaveBeenCalledWith(
      'session-2',
      useUnifiedStore.getState().data.ai?.messages['session-2'],
    );
  });

  it('persists case-insensitive inline data images in cached sessions', async () => {
    vi.useFakeTimers();
    mocked.persistDataUrlAttachment.mockResolvedValueOnce('attachment://persisted.webp');
    const inlineSource = 'DATA:IMAGE/WEBP;BASE64,INLINE';
    useUnifiedStore.setState((state) => ({
      ...state,
      data: {
        ...state.data,
        ai: state.data.ai
          ? {
              ...state.data.ai,
              messages: {
                ...state.data.ai.messages,
                'session-2': [
                  {
                    id: 'm2',
                    role: 'user',
                    content: `![image](<${inlineSource}>)\n\nDescribe`,
                    imageSources: [inlineSource],
                    apiTranscript: [{
                      role: 'user',
                      content: [
                        { type: 'image_url', image_url: { url: inlineSource } },
                      ],
                    }],
                    modelId: managedModel.id,
                    timestamp: 2,
                    versions: [{
                      content: `![image](<${inlineSource}>)\n\nDescribe`,
                      createdAt: 2,
                      kind: 'original' as const,
                      subsequentMessages: [],
                    }],
                    currentVersionIndex: 0,
                  },
                ],
              },
            }
          : state.data.ai,
      },
    }));
    useAIUIStore.getState().setChatSelection({
      currentSessionId: 'session-1',
      temporaryChatEnabled: false,
    });

    await act(async () => {
      await actions.switchSession('session-2');
    });

    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });
    vi.useRealTimers();

    const message = useUnifiedStore.getState().data.ai?.messages['session-2']?.[0];
    expect(mocked.persistDataUrlAttachment).toHaveBeenCalledWith('data:image/webp;base64,INLINE');
    expect(message?.content).toBe('![image](<attachment://persisted.webp>)\n\nDescribe');
    expect(message?.imageSources).toEqual(['attachment://persisted.webp']);
    expect(message?.apiTranscript?.[0]?.content).toEqual([
      { type: 'image_url', image_url: { url: 'attachment://persisted.webp' } },
    ]);
    expect(message?.versions[0]?.content).toBe('![image](<attachment://persisted.webp>)\n\nDescribe');
  });

  it('does not replace an unreadable persisted session file with an empty chat', async () => {
    mocked.loadSessionJson.mockResolvedValueOnce(null);
    mocked.hasSessionJson.mockResolvedValueOnce(true);
    useAIUIStore.getState().setChatSelection({
      currentSessionId: 'session-1',
      temporaryChatEnabled: false,
    });
    useUnifiedStore.setState((state) => ({
      ...state,
      data: {
        ...state.data,
        ai: state.data.ai
          ? {
              ...state.data.ai,
              messages: { 'session-1': state.data.ai.messages['session-1'] },
            }
          : state.data.ai,
      },
    }));

    await act(async () => {
      await actions.switchSession('session-2');
    });

    expect(mocked.loadSessionJson).toHaveBeenCalledWith('session-2');
    expect(mocked.hasSessionJson).toHaveBeenCalledWith('session-2');
    expect(useUnifiedStore.getState().data.ai?.messages).not.toHaveProperty('session-2');
    expect(useAIUIStore.getState().error).toBe(
      'This chat could not be loaded from disk. The original file was left untouched.',
    );
    expect(mocked.saveUnifiedData).not.toHaveBeenCalled();
  });

  it('does not persist unified AI data when switching only hydrates messages from disk', async () => {
    mocked.loadSessionJson.mockResolvedValueOnce([
      {
        id: 'm2',
        role: 'user',
        content: 'loaded from disk',
        modelId: managedModel.id,
        timestamp: 2,
        versions: [{ content: 'loaded from disk', createdAt: 2, kind: 'original' as const, subsequentMessages: [] }],
        currentVersionIndex: 0,
      },
    ]);
    useAIUIStore.getState().setChatSelection({
      currentSessionId: 'session-1',
      temporaryChatEnabled: false,
    });
    useUnifiedStore.setState((state) => ({
      ...state,
      data: {
        ...state.data,
        ai: state.data.ai
          ? {
              ...state.data.ai,
              messages: { 'session-1': state.data.ai.messages['session-1'] },
            }
          : state.data.ai,
      },
    }));

    await act(async () => {
      await actions.switchSession('session-2');
    });

    expect(mocked.loadSessionJson).toHaveBeenCalledWith('session-2');
    expect(useUnifiedStore.getState().data.ai?.messages['session-2']?.[0]?.content).toBe('loaded from disk');
    expect(mocked.saveUnifiedData).toHaveBeenCalledTimes(1);
    expect(mocked.saveUnifiedData).toHaveBeenCalledWith(expect.any(Object), {
      settings: {
        ui: {
          lastChatSessionId: 'session-2',
        },
      },
    });
  });

  it('does not persist unchanged or missing session metadata updates', async () => {
    actions.updateSession('session-1', { title: 'First' });
    actions.updateSession('missing-session', { title: 'Missing' });

    await act(async () => {
      await Promise.resolve();
    });

    expect(mocked.saveUnifiedData).not.toHaveBeenCalled();
    expect(useUnifiedStore.getState().data.ai?.sessions.find((session) => session.id === 'session-1')?.updatedAt).toBe(10);
  });

  it('prefetches a missing session without switching the active session', async () => {
    mocked.loadSessionJson.mockResolvedValueOnce([
      {
        id: 'm2',
        role: 'user',
        content: 'prefetched',
        modelId: managedModel.id,
        timestamp: 2,
        versions: [{ content: 'prefetched', createdAt: 2, kind: 'original' as const, subsequentMessages: [] }],
        currentVersionIndex: 0,
      },
    ]);
    useAIUIStore.getState().setChatSelection({
      currentSessionId: 'session-1',
      temporaryChatEnabled: false,
    });
    useUnifiedStore.setState((state) => ({
      ...state,
      data: {
        ...state.data,
        ai: state.data.ai
          ? {
              ...state.data.ai,
              messages: { 'session-1': state.data.ai.messages['session-1'] },
            }
          : state.data.ai,
      },
    }));

    await act(async () => {
      await actions.prefetchSession('session-2');
    });

    expect(mocked.loadSessionJson).toHaveBeenCalledWith('session-2');
    expect(useAIUIStore.getState().currentSessionId).toBe('session-1');
    expect(useUnifiedStore.getState().data.ai?.currentSessionId).toBe('session-1');
    expect(useUnifiedStore.getState().data.ai?.messages['session-2']?.[0]?.content).toBe('prefetched');
    expect(mocked.saveUnifiedData).not.toHaveBeenCalled();
  });

  it('reuses an active session prefetch when switching to the same chat', async () => {
    let resolveLoad: (messages: ChatMessage[]) => void = () => {
      throw new Error('load did not start');
    };
    mocked.loadSessionJson.mockImplementationOnce(
      () =>
        new Promise<ChatMessage[]>((resolve) => {
          resolveLoad = resolve;
        }),
    );
    useAIUIStore.getState().setChatSelection({
      currentSessionId: 'session-1',
      temporaryChatEnabled: false,
    });
    useUnifiedStore.setState((state) => ({
      ...state,
      data: {
        ...state.data,
        ai: state.data.ai
          ? {
              ...state.data.ai,
              messages: { 'session-1': state.data.ai.messages['session-1'] },
            }
          : state.data.ai,
      },
    }));

    const prefetch = actions.prefetchSession('session-2');
    await vi.waitFor(() => {
      expect(mocked.loadSessionJson).toHaveBeenCalledWith('session-2');
    });

    const switchSession = actions.switchSession('session-2');
    resolveLoad([
      {
        id: 'm2',
        role: 'user',
        content: 'prefetch reused',
        modelId: managedModel.id,
        timestamp: 2,
        versions: [{ content: 'prefetch reused', createdAt: 2, kind: 'original' as const, subsequentMessages: [] }],
        currentVersionIndex: 0,
      },
    ]);

    await act(async () => {
      await Promise.all([prefetch, switchSession]);
    });

    expect(mocked.loadSessionJson).toHaveBeenCalledTimes(1);
    expect(useAIUIStore.getState().currentSessionId).toBe('session-2');
    expect(useUnifiedStore.getState().data.ai?.messages['session-2']?.[0]?.content).toBe('prefetch reused');
  });

  it('cancels a queued session prefetch while switching to the same chat directly', async () => {
    const resolveBlockers: Array<(messages: ChatMessage[]) => void> = [];
    let resolveDirectSwitch: (messages: ChatMessage[]) => void = () => {
      throw new Error('direct switch load did not start');
    };
    useAIUIStore.getState().setChatSelection({
      currentSessionId: 'session-1',
      temporaryChatEnabled: false,
    });
    useUnifiedStore.setState((state) => ({
      ...state,
      data: {
        ...state.data,
        ai: state.data.ai
          ? {
              ...state.data.ai,
              sessions: [
                ...state.data.ai.sessions,
                {
                  id: 'session-3',
                  title: 'Third',
                  modelId: managedModel.id,
                  createdAt: 3,
                  updatedAt: 30,
                },
                {
                  id: 'session-4',
                  title: 'Fourth',
                  modelId: managedModel.id,
                  createdAt: 4,
                  updatedAt: 40,
                },
              ],
              messages: { 'session-1': state.data.ai.messages['session-1'] },
            }
          : state.data.ai,
      },
    }));
    mocked.loadSessionJson.mockImplementation((sessionId: string) => {
      if (sessionId === 'session-2' || sessionId === 'session-3') {
        return new Promise<ChatMessage[]>((resolve) => {
          resolveBlockers.push(resolve);
        });
      }
      return new Promise<ChatMessage[]>((resolve) => {
        resolveDirectSwitch = resolve;
      });
    });

    const prefetches = [
      actions.prefetchSession('session-2'),
      actions.prefetchSession('session-3'),
      actions.prefetchSession('session-4'),
    ];
    await vi.waitFor(() => {
      expect(mocked.loadSessionJson).toHaveBeenCalledWith('session-2');
      expect(mocked.loadSessionJson).toHaveBeenCalledWith('session-3');
    });

    const switchSession = actions.switchSession('session-4');
    await vi.waitFor(() => {
      expect(mocked.loadSessionJson).toHaveBeenCalledWith('session-4');
    });

    expect(useAIUIStore.getState().currentSessionId).toBe('session-4');

    resolveBlockers.forEach((resolve, index) => {
      resolve([
        {
          id: `m${index + 2}`,
          role: 'user',
          content: `prefetch blocker ${index + 2}`,
          modelId: managedModel.id,
          timestamp: index + 2,
          versions: [{ content: `prefetch blocker ${index + 2}`, createdAt: index + 2, kind: 'original' as const, subsequentMessages: [] }],
          currentVersionIndex: 0,
        },
      ]);
    });
    await act(async () => {
      await Promise.all(prefetches);
    });

    expect(mocked.loadSessionJson.mock.calls.filter(([sessionId]) => sessionId === 'session-4')).toHaveLength(1);

    resolveDirectSwitch([
      {
        id: 'm4',
        role: 'user',
        content: 'direct switch load',
        modelId: managedModel.id,
        timestamp: 4,
        versions: [{ content: 'direct switch load', createdAt: 4, kind: 'original' as const, subsequentMessages: [] }],
        currentVersionIndex: 0,
      },
    ]);
    await act(async () => {
      await switchSession;
    });

    expect(useUnifiedStore.getState().data.ai?.messages['session-4']?.[0]?.content).toBe('direct switch load');
  });

  it('cancels a queued session prefetch before it reads messages', async () => {
    const resolveBlockers = new Map<string, (messages: ChatMessage[]) => void>();
    useAIUIStore.getState().setChatSelection({
      currentSessionId: 'session-1',
      temporaryChatEnabled: false,
    });
    useUnifiedStore.setState((state) => ({
      ...state,
      data: {
        ...state.data,
        ai: state.data.ai
          ? {
              ...state.data.ai,
              sessions: [
                ...state.data.ai.sessions,
                {
                  id: 'session-3',
                  title: 'Third',
                  modelId: managedModel.id,
                  createdAt: 3,
                  updatedAt: 30,
                },
                {
                  id: 'session-4',
                  title: 'Fourth',
                  modelId: managedModel.id,
                  createdAt: 4,
                  updatedAt: 40,
                },
              ],
              messages: { 'session-1': state.data.ai.messages['session-1'] },
            }
          : state.data.ai,
      },
    }));
    mocked.loadSessionJson.mockImplementation((sessionId: string) => {
      if (sessionId === 'session-2' || sessionId === 'session-3') {
        return new Promise<ChatMessage[]>((resolve) => {
          resolveBlockers.set(sessionId, resolve);
        });
      }
      return Promise.resolve([
        {
          id: 'm4',
          role: 'user',
          content: 'should not load',
          modelId: managedModel.id,
          timestamp: 4,
          versions: [{ content: 'should not load', createdAt: 4, kind: 'original' as const, subsequentMessages: [] }],
          currentVersionIndex: 0,
        },
      ]);
    });

    const prefetches = [
      actions.prefetchSession('session-2'),
      actions.prefetchSession('session-3'),
      actions.prefetchSession('session-4'),
    ];
    await vi.waitFor(() => {
      expect(mocked.loadSessionJson).toHaveBeenCalledWith('session-2');
      expect(mocked.loadSessionJson).toHaveBeenCalledWith('session-3');
    });

    actions.cancelSessionPrefetch('session-4');
    resolveBlockers.get('session-2')?.([
      {
        id: 'm2',
        role: 'user',
        content: 'prefetch blocker 2',
        modelId: managedModel.id,
        timestamp: 2,
        versions: [{ content: 'prefetch blocker 2', createdAt: 2, kind: 'original' as const, subsequentMessages: [] }],
        currentVersionIndex: 0,
      },
    ]);
    resolveBlockers.get('session-3')?.([
      {
        id: 'm3',
        role: 'user',
        content: 'prefetch blocker 3',
        modelId: managedModel.id,
        timestamp: 3,
        versions: [{ content: 'prefetch blocker 3', createdAt: 3, kind: 'original' as const, subsequentMessages: [] }],
        currentVersionIndex: 0,
      },
    ]);

    await act(async () => {
      await Promise.all(prefetches);
    });

    expect(mocked.loadSessionJson.mock.calls.filter(([sessionId]) => sessionId === 'session-4')).toHaveLength(0);
    expect(useUnifiedStore.getState().data.ai?.messages).not.toHaveProperty('session-4');
  });

  it('keeps a chat visible when deleting its message file fails', async () => {
    mocked.deleteSessionJson.mockRejectedValueOnce(new Error('disk denied'));
    useAIUIStore.getState().setChatSelection({
      currentSessionId: 'session-2',
      temporaryChatEnabled: false,
    });

    await expect(actions.deleteSession('session-2')).rejects.toThrow('disk denied');

    expect(useUnifiedStore.getState().data.ai?.sessions.map((session) => session.id)).toEqual([
      'session-1',
      'session-2',
    ]);
    expect(useUnifiedStore.getState().data.ai?.messages).toHaveProperty('session-2');
    expect(useAIUIStore.getState().currentSessionId).toBe('session-2');
    expect(useAIUIStore.getState().error).toBe('Could not delete this chat from disk. The chat was kept.');
  });

  it('keeps all chats visible when clearing message files fails', async () => {
    mocked.deleteSessionJson.mockRejectedValueOnce(new Error('disk denied'));
    useAIUIStore.getState().setChatSelection({
      currentSessionId: 'session-1',
      temporaryChatEnabled: false,
    });

    await expect(actions.clearSessions()).rejects.toThrow('disk denied');

    expect(useUnifiedStore.getState().data.ai?.sessions.map((session) => session.id)).toEqual([
      'session-1',
      'session-2',
    ]);
    expect(useUnifiedStore.getState().data.ai?.messages).toHaveProperty('session-1');
    expect(useUnifiedStore.getState().data.ai?.messages).toHaveProperty('session-2');
    expect(useAIUIStore.getState().currentSessionId).toBe('session-1');
    expect(useAIUIStore.getState().error).toBe('Could not clear chats from disk. Existing chats were kept.');
  });

  it('limits concurrent session file deletes while clearing chats', async () => {
    let activeDeletes = 0;
    let maxActiveDeletes = 0;
    const resolveDeletes: Array<() => void> = [];
    const sessions = Array.from({ length: MAX_CHAT_SESSION_DELETE_CONCURRENCY + 3 }, (_value, index) => ({
      id: `session-${index}`,
      title: `Session ${index}`,
      modelId: managedModel.id,
      createdAt: index,
      updatedAt: index,
    }));
    useUnifiedStore.setState((state) => ({
      ...state,
      data: {
        ...state.data,
        ai: state.data.ai
          ? {
              ...state.data.ai,
              sessions,
              messages: Object.fromEntries(sessions.map((session) => [session.id, []])),
            }
          : state.data.ai,
      },
    }));
    mocked.deleteSessionJson.mockImplementation(async () => {
      activeDeletes += 1;
      maxActiveDeletes = Math.max(maxActiveDeletes, activeDeletes);
      await new Promise<void>((resolve) => {
        resolveDeletes.push(resolve);
      });
      activeDeletes -= 1;
    });

    const clearRequest = actions.clearSessions();
    await vi.waitFor(() => {
      expect(resolveDeletes).toHaveLength(MAX_CHAT_SESSION_DELETE_CONCURRENCY);
    });

    expect(maxActiveDeletes).toBeLessThanOrEqual(MAX_CHAT_SESSION_DELETE_CONCURRENCY);
    while (resolveDeletes.length > 0) {
      resolveDeletes.shift()?.();
      await Promise.resolve();
    }
    await vi.waitFor(() => {
      expect(mocked.deleteSessionJson).toHaveBeenCalledTimes(sessions.length);
    });
    while (resolveDeletes.length > 0) {
      resolveDeletes.shift()?.();
      await Promise.resolve();
    }

    await expect(clearRequest).resolves.toBeUndefined();
    expect(maxActiveDeletes).toBeLessThanOrEqual(MAX_CHAT_SESSION_DELETE_CONCURRENCY);
    expect(useUnifiedStore.getState().data.ai?.sessions).toEqual([]);
  });

  it('does not persist when clearing an already empty regular chat list', async () => {
    useUnifiedStore.setState((state) => ({
      ...state,
      data: {
        ...state.data,
        ai: state.data.ai
          ? {
              ...state.data.ai,
              sessions: [],
              messages: {},
              unreadSessionIds: [],
            }
          : state.data.ai,
      },
    }));
    useAIUIStore.getState().setChatSelection({
      currentSessionId: null,
      temporaryChatEnabled: false,
    });

    await actions.clearSessions();

    expect(mocked.deleteSessionJson).not.toHaveBeenCalled();
    expect(mocked.saveUnifiedData).not.toHaveBeenCalled();
  });

  it('does not persist when clearing only temporary chats', async () => {
    useUnifiedStore.setState((state) => ({
      ...state,
      data: {
        ...state.data,
        ai: state.data.ai
          ? {
              ...state.data.ai,
              sessions: [{
                id: 'temp-session-1',
                title: 'Temporary Chat',
                modelId: managedModel.id,
                createdAt: 1,
                updatedAt: 1,
              }],
              messages: {
                'temp-session-1': [],
              },
              unreadSessionIds: [],
            }
          : state.data.ai,
      },
    }));
    useAIUIStore.getState().setChatSelection({
      currentSessionId: 'temp-session-1',
      temporaryChatEnabled: true,
    });

    await actions.clearSessions();

    expect(mocked.deleteSessionJson).not.toHaveBeenCalled();
    expect(useAIUIStore.getState().temporaryChatEnabled).toBe(true);
    expect(useAIUIStore.getState().currentSessionId).toMatch(/^temp-session-/);
    expect(mocked.saveUnifiedData).not.toHaveBeenCalled();
  });

  it('opens a blank new chat locally without mutating shared selection', () => {
    useAIUIStore.getState().setChatSelection({
      currentSessionId: 'session-1',
      temporaryChatEnabled: false,
    });

    act(() => {
      actions.openNewChat();
    });

    expect(useAIUIStore.getState().currentSessionId).toBe(null);
    expect(useAIUIStore.getState().temporaryChatEnabled).toBe(false);
    expect(useUnifiedStore.getState().data.ai?.currentSessionId).toBe('session-1');
  });

  it('aborts a temporary response when the temporary chat is discarded', () => {
    useUnifiedStore.setState((state) => ({
      ...state,
      data: {
        ...state.data,
        ai: state.data.ai
          ? {
              ...state.data.ai,
              sessions: [
                ...state.data.ai.sessions,
                {
                  id: 'temp-session-1',
                  title: 'Temporary Chat',
                  modelId: managedModel.id,
                  createdAt: 5,
                  updatedAt: 5,
                },
              ],
              messages: {
                ...state.data.ai.messages,
                'temp-session-1': [{
                  id: 'a1',
                  role: 'assistant',
                  content: '',
                  modelId: managedModel.id,
                  timestamp: 5,
                  versions: [{
                    content: '',
                    createdAt: 5,
                    kind: 'original' as const,
                    subsequentMessages: [],
                  }],
                  currentVersionIndex: 0,
                }],
              },
            }
          : state.data.ai,
      },
    }));
    useAIUIStore.getState().setChatSelection({
      currentSessionId: 'temp-session-1',
      temporaryChatEnabled: true,
    });
    useAIUIStore.getState().setSessionLoading('temp-session-1', true);

    act(() => {
      actions.openNewChat();
    });

    expect(mocked.requestAbort).toHaveBeenCalledWith('temp-session-1');
    expect(useUnifiedStore.getState().data.ai?.sessions.some((session) => session.id === 'temp-session-1')).toBe(false);
    expect(useUnifiedStore.getState().data.ai?.messages).not.toHaveProperty('temp-session-1');
    expect(useAIUIStore.getState().generatingSessions).toEqual({});
    expect(useAIUIStore.getState().currentSessionId).toBe(null);
    expect(useAIUIStore.getState().temporaryChatEnabled).toBe(false);
    expect(mocked.saveUnifiedData).not.toHaveBeenCalled();
  });

  it('enables temporary chat locally while keeping shared selection unchanged', () => {
    useAIUIStore.getState().setChatSelection({
      currentSessionId: 'session-1',
      temporaryChatEnabled: false,
    });

    act(() => {
      actions.toggleTemporaryChat(true);
    });

    expect(useAIUIStore.getState().temporaryChatEnabled).toBe(true);
    expect(useAIUIStore.getState().currentSessionId).toMatch(/^temp-session-/);
    expect(useUnifiedStore.getState().data.ai?.temporaryChatEnabled).toBe(false);
    expect(useUnifiedStore.getState().data.ai?.currentSessionId).toBe('session-1');
    expect(mocked.saveUnifiedData).not.toHaveBeenCalled();
  });

  it('creates a fresh temporary session without persisting unified AI data', () => {
    useAIUIStore.getState().setChatSelection({
      currentSessionId: 'session-1',
      temporaryChatEnabled: true,
    });

    const sessionId = actions.createSession();

    expect(sessionId).toMatch(/^temp-session-/);
    expect(useAIUIStore.getState().temporaryChatEnabled).toBe(true);
    expect(useAIUIStore.getState().currentSessionId).toBe(sessionId);
    expect(mocked.saveUnifiedData).not.toHaveBeenCalled();
  });

  it('preserves hidden API transcript when promoting a temporary session', async () => {
    const apiTranscript = [{
      role: 'assistant',
      content: 'temporary answer',
      reasoning_content: 'temporary hidden reasoning',
    }];

    useUnifiedStore.setState((state) => ({
      ...state,
      data: {
        ...state.data,
        ai: state.data.ai
          ? {
              ...state.data.ai,
              sessions: [
                ...state.data.ai.sessions,
                {
                  id: 'temp-session-1',
                  title: 'Temporary Chat',
                  modelId: managedModel.id,
                  createdAt: 5,
                  updatedAt: 5,
                },
              ],
              messages: {
                ...state.data.ai.messages,
                'temp-session-1': [{
                  id: 'a1',
                  role: 'assistant',
                  content: 'temporary answer',
                  apiTranscript,
                  modelId: managedModel.id,
                  timestamp: 5,
                  versions: [{
                    content: 'temporary answer',
                    createdAt: 5, kind: 'original' as const, subsequentMessages: [],
                    apiTranscript,
                  }],
                  currentVersionIndex: 0,
                }],
              },
            }
          : state.data.ai,
      },
    }));
    useAIUIStore.getState().setChatSelection({
      currentSessionId: 'temp-session-1',
      temporaryChatEnabled: true,
    });

    let promotedSessionId: string | null = null;
    await act(async () => {
      promotedSessionId = await actions.promoteTemporarySession();
    });

    expect(promotedSessionId).toMatch(/^session-/);
    const promotedMessages = useUnifiedStore.getState().data.ai?.messages[promotedSessionId!];
    expect(promotedMessages?.[0]?.apiTranscript?.[0].reasoning_content).toBe('temporary hidden reasoning');
    expect(promotedMessages?.[0]?.versions[0]?.apiTranscript?.[0].reasoning_content).toBe('temporary hidden reasoning');
    expect(mocked.saveSessionJson).toHaveBeenCalledWith(promotedSessionId, promotedMessages);
  });

  it('promotes a temporary session after pending temporary mutations finish', async () => {
    useUnifiedStore.setState((state) => ({
      ...state,
      data: {
        ...state.data,
        ai: state.data.ai
          ? {
              ...state.data.ai,
              sessions: [
                ...state.data.ai.sessions,
                {
                  id: 'temp-session-1',
                  title: 'Temporary Chat',
                  modelId: managedModel.id,
                  createdAt: 5,
                  updatedAt: 5,
                },
              ],
              messages: {
                ...state.data.ai.messages,
                'temp-session-1': [],
              },
            }
          : state.data.ai,
      },
    }));
    useAIUIStore.getState().setChatSelection({
      currentSessionId: 'temp-session-1',
      temporaryChatEnabled: true,
    });

    let releasePromotion!: () => void;
    const promotionCanContinue = new Promise<void>((resolve) => {
      releasePromotion = resolve;
    });
    mocked.runWithSessionMutationLock.mockImplementationOnce(async (sessionId, task) => {
      expect(sessionId).toBe('temp-session-1');
      await promotionCanContinue;
      return await task();
    });

    let promotedSessionId: string | null = null;
    const promotion = actions.promoteTemporarySession().then((sessionId) => {
      promotedSessionId = sessionId;
    });
    await Promise.resolve();

    expect(useUnifiedStore.getState().data.ai?.sessions.some((session) => session.id === 'temp-session-1')).toBe(true);
    expect(promotedSessionId).toBeNull();

    useUnifiedStore.setState((state) => ({
      ...state,
      data: {
        ...state.data,
        ai: state.data.ai
          ? {
              ...state.data.ai,
              messages: {
                ...state.data.ai.messages,
                'temp-session-1': [{
                  id: 'u1',
                  role: 'user',
                  content: 'message committed before promotion lock released',
                  modelId: managedModel.id,
                  timestamp: 6,
                  versions: [{
                    content: 'message committed before promotion lock released',
                    createdAt: 6,
                    kind: 'original' as const,
                    subsequentMessages: [],
                  }],
                  currentVersionIndex: 0,
                }],
              },
            }
          : state.data.ai,
      },
    }));

    await act(async () => {
      releasePromotion();
      await promotion;
    });

    expect(promotedSessionId).toMatch(/^session-/);
    expect(useUnifiedStore.getState().data.ai?.messages).not.toHaveProperty('temp-session-1');
    expect(useUnifiedStore.getState().data.ai?.messages[promotedSessionId!]?.[0]?.content)
      .toBe('message committed before promotion lock released');
  });

  it('persists inline temporary images when promoting a temporary session', async () => {
    useUnifiedStore.setState((state) => ({
      ...state,
      data: {
        ...state.data,
        ai: state.data.ai
          ? {
              ...state.data.ai,
              sessions: [
                ...state.data.ai.sessions,
                {
                  id: 'temp-session-1',
                  title: 'Temporary Chat',
                  modelId: managedModel.id,
                  createdAt: 5,
                  updatedAt: 5,
                },
              ],
              messages: {
                ...state.data.ai.messages,
                'temp-session-1': [{
                  id: 'u1',
                  role: 'user',
                  content: '![image](<data:image/png;base64,INLINE>)\n\nDescribe',
                  imageSources: ['data:image/png;base64,INLINE'],
                  apiTranscript: [{
                    role: 'user',
                    content: [
                      { type: 'image_url', image_url: { url: 'data:image/png;base64,INLINE' } },
                    ],
                  }],
                  modelId: managedModel.id,
                  timestamp: 5,
                  versions: [{
                    content: '![image](<data:image/png;base64,INLINE>)\n\nDescribe',
                    createdAt: 5,
                    kind: 'original' as const,
                    subsequentMessages: [{
                      id: 'branch-assistant',
                      role: 'assistant',
                      content: 'branch ![image](<data:image/png;base64,INLINE>)',
                      modelId: managedModel.id,
                      timestamp: 6,
                      versions: [{
                        content: 'branch ![image](<data:image/png;base64,INLINE>)',
                        createdAt: 6,
                        kind: 'original' as const,
                        subsequentMessages: [],
                      }],
                      currentVersionIndex: 0,
                    }],
                  }],
                  currentVersionIndex: 0,
                }],
              },
            }
          : state.data.ai,
      },
    }));
    useAIUIStore.getState().setChatSelection({
      currentSessionId: 'temp-session-1',
      temporaryChatEnabled: true,
    });
    mocked.persistDataUrlAttachment.mockResolvedValueOnce('attachment://persisted.png');

    let promotedSessionId: string | null = null;
    await act(async () => {
      promotedSessionId = await actions.promoteTemporarySession();
    });

    await vi.waitFor(() => {
      expect(mocked.persistDataUrlAttachment).toHaveBeenCalledWith('data:image/png;base64,INLINE');
      const promotedMessages = useUnifiedStore.getState().data.ai?.messages[promotedSessionId!];
      expect(promotedMessages?.[0]?.content).toBe('![image](<attachment://persisted.png>)\n\nDescribe');
      expect(promotedMessages?.[0]?.imageSources).toEqual(['attachment://persisted.png']);
      expect(promotedMessages?.[0]?.apiTranscript?.[0]?.content).toEqual([
        { type: 'image_url', image_url: { url: 'attachment://persisted.png' } },
      ]);
      expect(promotedMessages?.[0]?.versions[0]?.content).toBe('![image](<attachment://persisted.png>)\n\nDescribe');
      expect(promotedMessages?.[0]?.versions[0]?.subsequentMessages[0]?.content).toBe(
        'branch ![image](<attachment://persisted.png>)',
      );
      expect(mocked.saveSessionJson).toHaveBeenLastCalledWith(promotedSessionId, promotedMessages);
    });
  });

  it('keeps a generating temporary response attached after promotion', async () => {
    useUnifiedStore.setState((state) => ({
      ...state,
      data: {
        ...state.data,
        ai: state.data.ai
          ? {
              ...state.data.ai,
              sessions: [
                ...state.data.ai.sessions,
                {
                  id: 'temp-session-1',
                  title: 'Temporary Chat',
                  modelId: managedModel.id,
                  createdAt: 5,
                  updatedAt: 5,
                },
              ],
              messages: {
                ...state.data.ai.messages,
                'temp-session-1': [{
                  id: 'a1',
                  role: 'assistant',
                  content: '',
                  modelId: managedModel.id,
                  timestamp: 5,
                  versions: [{
                    content: '',
                    createdAt: 5, kind: 'original' as const, subsequentMessages: [],
                  }],
                  currentVersionIndex: 0,
                }],
              },
            }
          : state.data.ai,
      },
    }));
    useAIUIStore.getState().setChatSelection({
      currentSessionId: 'temp-session-1',
      temporaryChatEnabled: true,
    });
    useAIUIStore.getState().setSessionLoading('temp-session-1', true);

    let promotedSessionId: string | null = null;
    await act(async () => {
      promotedSessionId = await actions.promoteTemporarySession();
    });

    expect(promotedSessionId).toMatch(/^session-/);
    expect(mocked.requestAbort).not.toHaveBeenCalledWith('temp-session-1');
    expect(mocked.requestTransfer).toHaveBeenCalledWith('temp-session-1', promotedSessionId);
    expect(useAIUIStore.getState().generatingSessions).toEqual({
      [promotedSessionId!]: true,
    });

    act(() => {
      actions.updateMessage('temp-session-1', 'a1', 'streamed after promotion');
      actions.completeMessage('temp-session-1', 'a1');
    });

    expect(useUnifiedStore.getState().data.ai?.messages[promotedSessionId!]?.[0]?.content)
      .toBe('streamed after promotion');
    expect(mocked.scheduleSessionJsonSave).toHaveBeenCalledWith(
      promotedSessionId,
      useUnifiedStore.getState().data.ai?.messages[promotedSessionId!],
    );
    expect(mocked.saveSessionJson).toHaveBeenCalledWith(
      promotedSessionId,
      useUnifiedStore.getState().data.ai?.messages[promotedSessionId!],
    );
  });

  it('creates and selects a new session locally without rewriting shared selection fields', () => {
    useAIUIStore.getState().setChatSelection({
      currentSessionId: null,
      temporaryChatEnabled: false,
    });

    let createdSessionId = '';
    act(() => {
      createdSessionId = createAIChatSession('New Chat');
    });

    expect(createdSessionId).toMatch(/^session-/);
    expect(useAIUIStore.getState().currentSessionId).toBe(createdSessionId);
    expect(useUnifiedStore.getState().data.ai?.currentSessionId).toBe('session-1');
    expect(useUnifiedStore.getState().data.ai?.sessions.some((session) => session.id === createdSessionId)).toBe(true);
    expect(mocked.saveSessionJson).toHaveBeenCalledWith(createdSessionId, []);
  });

  it('stores unread state in shared ai data without mutating shared selection fields', () => {
    act(() => {
      useAIUIStore.getState().markSessionUnread('session-2');
    });

    expect(useUnifiedStore.getState().data.ai?.unreadSessionIds).toEqual(['session-2']);
    expect(useUnifiedStore.getState().data.ai?.currentSessionId).toBe('session-1');
  });

  it('clears shared unread state when the current session is marked read', () => {
    useUnifiedStore.setState((state) => ({
      ...state,
      data: {
        ...state.data,
        ai: state.data.ai
          ? {
              ...state.data.ai,
              unreadSessionIds: ['session-2'],
            }
          : state.data.ai,
      },
    }));

    act(() => {
      useAIUIStore.getState().markSessionRead('session-2');
    });

    expect(useUnifiedStore.getState().data.ai?.unreadSessionIds).toEqual([]);
  });
});
