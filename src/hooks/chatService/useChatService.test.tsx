import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_TEMPORARY_ATTACHMENT_EPHEMERAL_CONCURRENCY,
  useChatService,
} from './useChatService';
import { useAIUIStore } from '@/stores/ai/chatState';
import { useUnifiedStore } from '@/stores/unified/useUnifiedStore';
import { useNotesStore } from '@/stores/notes/useNotesStore';
import { actions as aiActions } from '@/stores/useAIStore';
import type { AIModel, ApiTranscriptMessage, ChatMessage, ChatSendOptions, Provider } from '@/lib/ai/types';
import { sendMessageWithEndpointFallback } from './sendMessageWithEndpointFallback';
import { runWithSessionMutationLock } from '@/lib/ai/sessionMutationLock';
import { convertToBase64, deleteAttachment, type Attachment } from '@/lib/storage/attachmentStorage';
import { MAX_COMPOSER_PROGRAMMATIC_INSERT_CHARS } from '@/lib/ui/composerFocusRegistry';
import { ACCOUNT_LOGIN_REQUESTED_EVENT } from '@/lib/account/sessionEvent';
import { useUIStore } from '@/stores/uiSlice';

const TEMPORARY_IMAGE_DATA_URL = 'data:image/png;base64,VEVNUE9SQVJZ';

const mocked = vi.hoisted(() => {
  const accountSession = { isConnected: true };
  const managedAIState = {
    budget: null as null | { active?: boolean; remainingPercent?: number; status?: string; usedPercent?: number },
    lastBudgetSyncAt: null as number | null,
    applyBudgetSnapshot: vi.fn((budget: { active?: boolean; remainingPercent?: number; status?: string; usedPercent?: number }) => {
      managedAIState.budget = budget;
      managedAIState.lastBudgetSyncAt = Date.now();
    }),
    refreshBudget: vi.fn(async () => {}),
    refreshBudgetIfStale: vi.fn(async () => {}),
  };
  return {
    saveSessionJson: vi.fn(async () => {}),
    scheduleSessionJsonSave: vi.fn(),
    cancelSessionJsonSave: vi.fn(),
    deleteSessionJson: vi.fn(async () => {}),
    flushPendingSessionJsonSave: vi.fn(async () => {}),
    loadSessionJson: vi.fn(async () => null as ChatMessage[] | null),
    hasSessionJson: vi.fn(async () => false),
    accountSession,
    useAccountSessionStore: (selector: (state: { isConnected: boolean }) => unknown) =>
      selector(accountSession),
    useManagedAIStore: {
      getState: () => managedAIState,
    },
    managedAIState,
    generateAutoTitle: vi.fn(async () => {}),
    convertToBase64: vi.fn(async () => TEMPORARY_IMAGE_DATA_URL),
    deleteAttachment: vi.fn(async () => {}),
    deleteStoredAttachmentFile: vi.fn(async () => {}),
    persistDataUrlAttachment: vi.fn(async () => 'attachment://created-context.png'),
    sendMessageWithEndpointFallback: vi.fn(async ({
      onChunk,
    }: Parameters<typeof sendMessageWithEndpointFallback>[0]) => {
      onChunk('assistant answer');
      return 'assistant answer';
    }),
  };
});

vi.mock('@/lib/storage/chatStorage', () => ({
  saveSessionJson: mocked.saveSessionJson,
  scheduleSessionJsonSave: mocked.scheduleSessionJsonSave,
  cancelSessionJsonSave: mocked.cancelSessionJsonSave,
  deleteSessionJson: mocked.deleteSessionJson,
  flushPendingSessionJsonSave: mocked.flushPendingSessionJsonSave,
  loadSessionJson: mocked.loadSessionJson,
  hasSessionJson: mocked.hasSessionJson,
  hasPendingSessionJsonSave: vi.fn(() => false),
}));

vi.mock('@/lib/storage/attachmentStorage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/storage/attachmentStorage')>();
  return {
    ...actual,
    convertToBase64: mocked.convertToBase64,
    deleteAttachment: mocked.deleteAttachment,
    deleteStoredAttachmentFile: mocked.deleteStoredAttachmentFile,
    persistDataUrlAttachment: mocked.persistDataUrlAttachment,
  };
});

vi.mock('@/stores/accountSession', () => ({
  useAccountSessionStore: mocked.useAccountSessionStore,
}));

vi.mock('@/stores/useManagedAIStore', () => ({
  applyManagedQuotaExhaustedSnapshot: () => mocked.managedAIState.applyBudgetSnapshot({
    active: false,
    usedPercent: 100,
    remainingPercent: 0,
    status: 'exhausted',
  }),
  useManagedAIStore: mocked.useManagedAIStore,
}));

vi.mock('./useAutoTitle', () => ({
  useAutoTitle: () => ({ generateAutoTitle: mocked.generateAutoTitle }),
}));

vi.mock('./sendMessageWithEndpointFallback', () => ({
  sendMessageWithEndpointFallback: mocked.sendMessageWithEndpointFallback,
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

function createMessage(id: string, role: ChatMessage['role'], content: string): ChatMessage {
  return {
    id,
    role,
    content,
    modelId: model.id,
    timestamp: 1,
    versions: [{ content, createdAt: 1, kind: 'original', subsequentMessages: [] }],
    currentVersionIndex: 0,
  };
}

function createAttachment(overrides: Partial<Attachment> = {}): Attachment {
  return {
    id: 'attachment-1',
    path: '',
    previewUrl: 'data:image/png;base64,PREVIEW',
    assetUrl: '',
    name: 'demo.png',
    type: 'image/png',
    size: 123,
    ...overrides,
  };
}

function seedTemporaryChatState() {
  useUnifiedStore.setState((state) => ({
    data: {
      ...state.data,
      ai: {
        ...state.data.ai!,
        sessions: [
          { id: 'temp-session-1', title: 'Temporary Chat', modelId: model.id, createdAt: 3, updatedAt: 3 },
          ...state.data.ai!.sessions,
        ],
        messages: {
          ...state.data.ai!.messages,
          'temp-session-1': [],
        },
        currentSessionId: 'temp-session-1',
        temporaryChatEnabled: true,
      },
    },
  }));
  useAIUIStore.setState({
    currentSessionId: 'temp-session-1',
    temporaryChatEnabled: true,
  });
}

function seedChatState() {
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
          { id: 'session-1', title: 'First', modelId: model.id, createdAt: 1, updatedAt: 1 },
          { id: 'session-2', title: 'Second', modelId: model.id, createdAt: 2, updatedAt: 2 },
        ],
        messages: {
          'session-1': [
            createMessage('s1-user', 'user', 'session one private prompt'),
            createMessage('s1-assistant', 'assistant', 'session one private answer'),
          ],
          'session-2': [
            createMessage('s2-user', 'user', 'session two visible prompt'),
            createMessage('s2-assistant', 'assistant', 'session two visible answer'),
          ],
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

  useAIUIStore.setState({
    generatingSessions: {},
    unreadSessions: {},
    error: null,
    currentSessionId: 'session-2',
    temporaryChatEnabled: false,
    selectionInitialized: true,
    temporaryReturnSessionId: null,
    authPromptSessionId: null,
  });
}

function seedManagedSignedOutState() {
  mocked.accountSession.isConnected = false;
  seedManagedConnectedState();
}

function seedManagedConnectedState() {
  const managedProvider: Provider = {
    ...provider,
    id: 'vlaina-managed',
    name: 'vlaina',
    apiHost: 'https://api.vlaina.com/v1',
    apiKey: '',
  };
  const managedModel: AIModel = {
    ...model,
    id: 'vlaina-managed::model-1',
    apiModelId: 'model-1',
    providerId: managedProvider.id,
  };
  useUnifiedStore.setState((state) => ({
    data: {
      ...state.data,
      ai: {
        ...state.data.ai!,
        providers: [managedProvider],
        models: [managedModel],
        selectedModelId: managedModel.id,
      },
    },
  }));
}

describe('useChatService session context isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocked.accountSession.isConnected = true;
    mocked.managedAIState.budget = null;
    mocked.managedAIState.lastBudgetSyncAt = null;
    mocked.managedAIState.applyBudgetSnapshot.mockClear();
    mocked.managedAIState.refreshBudget.mockClear();
    mocked.managedAIState.refreshBudgetIfStale.mockClear();
    mocked.convertToBase64.mockResolvedValue(TEMPORARY_IMAGE_DATA_URL);
    mocked.deleteAttachment.mockResolvedValue(undefined);
    mocked.deleteStoredAttachmentFile.mockResolvedValue(undefined);
    mocked.persistDataUrlAttachment.mockResolvedValue('attachment://created-context.png');
    useUIStore.setState({ languagePreference: 'en' });
    useNotesStore.setState({ notesPath: '/notesRoot', starredEntries: [] });
    seedChatState();
  });

  it('sends only the active session history to the provider request', async () => {
    const { result } = renderHook(() => useChatService());

    await act(async () => {
      const accepted = await result.current.sendMessage('new session two prompt', [], []);
      expect(accepted).toBe(true);
    });

    await waitFor(() => {
      expect(sendMessageWithEndpointFallback).toHaveBeenCalledTimes(1);
    });

    const request = vi.mocked(sendMessageWithEndpointFallback).mock.calls[0]?.[0];
    expect(request?.content).toBe('new session two prompt');
    expect(request?.history.map((message) => message.content)).toEqual([
      'session two visible prompt',
      'session two visible answer',
    ]);
    const assistantMessage = (useUnifiedStore.getState().data.ai?.messages['session-2'] || []).at(-1);
    expect(JSON.stringify(request?.history)).not.toContain('session one private');
  });

  it('hydrates rich history context when editing a later user message', async () => {
    const richUser = createMessage('rich-user', 'user', 'Visible rich prompt');
    richUser.versions[0]!.requestContext = {
      text: 'Immutable context from an earlier attachment',
      imageSources: ['attachment://history-context.png'],
    };
    const targetUser = createMessage('target-user', 'user', 'Edit this prompt');
    useUnifiedStore.setState((state) => ({
      data: {
        ...state.data,
        ai: {
          ...state.data.ai!,
          messages: {
            ...state.data.ai!.messages,
            'session-2': [
              richUser,
              createMessage('rich-assistant', 'assistant', 'Earlier answer'),
              targetUser,
              createMessage('target-assistant', 'assistant', 'Replace this answer'),
            ],
          },
        },
      },
    }));
    const { result } = renderHook(() => useChatService());

    await act(async () => {
      await result.current.editMessage('target-user', 'Edited prompt');
    });
    await waitFor(() => expect(sendMessageWithEndpointFallback).toHaveBeenCalledTimes(1));

    const request = vi.mocked(sendMessageWithEndpointFallback).mock.calls[0]?.[0];
    const hydratedRichUser = request?.history.find((message) => message.id === 'rich-user');
    expect(hydratedRichUser?.requestContext).toEqual({
      text: 'Immutable context from an earlier attachment',
      imageSources: [TEMPORARY_IMAGE_DATA_URL],
    });
    expect(JSON.stringify(hydratedRichUser?.requestContext)).not.toContain('attachment://');
  });

  it('replays the active rich request snapshot when regenerating a response', async () => {
    const prompt = createMessage('rich-prompt', 'user', 'Visible prompt without expanded context');
    prompt.versions[0]!.requestContext = {
      text: 'Expanded note and file context\n\nUser request:\nInspect the image',
      imageSources: ['attachment://regenerate-context.png'],
      attachmentSources: ['attachment://regenerate-context.png'],
    };
    useUnifiedStore.setState((state) => ({
      data: {
        ...state.data,
        ai: {
          ...state.data.ai!,
          messages: {
            ...state.data.ai!.messages,
            'session-2': [
              prompt,
              createMessage('rich-response', 'assistant', 'Original answer'),
            ],
          },
        },
      },
    }));
    const { result } = renderHook(() => useChatService());

    await act(async () => {
      await result.current.regenerate('rich-response');
    });
    await waitFor(() => expect(sendMessageWithEndpointFallback).toHaveBeenCalledTimes(1));

    const request = vi.mocked(sendMessageWithEndpointFallback).mock.calls[0]?.[0];
    expect(request?.content).toEqual([
      {
        type: 'text',
        text: 'Expanded note and file context\n\nUser request:\nInspect the image',
      },
      { type: 'image_url', image_url: { url: TEMPORARY_IMAGE_DATA_URL } },
    ]);
    expect(JSON.stringify(request?.content)).not.toContain('attachment://');
  });

  it('replays immutable file context snapshots on later turns', async () => {
    const attachment = createAttachment({
      id: 'context-file',
      path: '/appdata/.vlaina/chat/attachments/context.txt',
      previewUrl: '',
      assetUrl: '',
      name: 'context.txt',
      type: 'text/plain',
      textContent: 'Context that must survive the first turn.',
    });
    const { result } = renderHook(() => useChatService());

    await act(async () => {
      expect(await result.current.sendMessage('Use this file', [attachment], [])).toBe(true);
    });
    await waitFor(() => expect(sendMessageWithEndpointFallback).toHaveBeenCalledTimes(1));

    await act(async () => {
      expect(await result.current.sendMessage('What did the file say?', [], [])).toBe(true);
    });
    await waitFor(() => expect(sendMessageWithEndpointFallback).toHaveBeenCalledTimes(2));

    const secondRequest = vi.mocked(sendMessageWithEndpointFallback).mock.calls[1]?.[0];
    const firstTurn = secondRequest?.history.find((message) =>
      message.role === 'user' && message.content.includes('Use this file')
    );
    expect(firstTurn?.requestContext?.text).toContain('Context that must survive the first turn.');
    expect(firstTurn?.requestContext?.attachmentSources).toEqual(['attachment://context.txt']);
  });

  it('rehydrates stored image context on later turns', async () => {
    const attachment = createAttachment({
      id: 'context-image',
      path: '/appdata/.vlaina/chat/attachments/context.png',
      previewUrl: '',
      assetUrl: '',
      name: 'context.png',
      type: 'image/png',
    });
    const { result } = renderHook(() => useChatService());

    await act(async () => {
      expect(await result.current.sendMessage('Inspect this image', [attachment], [])).toBe(true);
    });
    await waitFor(() => expect(sendMessageWithEndpointFallback).toHaveBeenCalledTimes(1));

    await act(async () => {
      expect(await result.current.sendMessage('What was in it?', [], [])).toBe(true);
    });
    await waitFor(() => expect(sendMessageWithEndpointFallback).toHaveBeenCalledTimes(2));

    const secondRequest = vi.mocked(sendMessageWithEndpointFallback).mock.calls[1]?.[0];
    const firstTurn = secondRequest?.history.find((message) =>
      message.role === 'user' && message.content.includes('Inspect this image')
    );
    expect(firstTurn?.requestContext?.imageSources).toEqual([TEMPORARY_IMAGE_DATA_URL]);
    expect(firstTurn?.requestContext?.attachmentSources).toEqual(['attachment://context.png']);
  });

  it('deletes newly persisted image context after stopping and retracting the request', async () => {
    mocked.sendMessageWithEndpointFallback.mockImplementationOnce(({ signal }) => {
      if (!signal) throw new Error('Expected request signal');
      return new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), {
          once: true,
        });
      });
    });
    const attachment = createAttachment({
      id: 'ephemeral-context-image',
      previewUrl: 'data:image/png;base64,AQI=',
    });
    const { result } = renderHook(() => useChatService());

    await act(async () => {
      expect(await result.current.sendMessage('Inspect this image', [attachment], [])).toBe(true);
    });
    await waitFor(() => expect(sendMessageWithEndpointFallback).toHaveBeenCalledTimes(1));

    let recalled: ReturnType<typeof result.current.stopAndRecallLastUserMessage> = null;
    act(() => {
      recalled = result.current.stopAndRecallLastUserMessage();
    });

    expect(recalled).toEqual({
      message: 'Inspect this image',
      attachments: [attachment],
      noteMentions: [],
    });
    await waitFor(() => {
      expect(mocked.deleteStoredAttachmentFile).toHaveBeenCalledWith('created-context.png');
    });
    expect(useUnifiedStore.getState().data.ai?.messages['session-2']?.map((message) => message.id))
      .toEqual(['s2-user', 's2-assistant']);
  });

  it('confirms composer acceptance only after request messages are created', async () => {
    let resolvePendingHydration!: () => void;
    const pendingHydration = new Promise<void>((resolve) => {
      resolvePendingHydration = resolve;
    });
    mocked.flushPendingSessionJsonSave.mockImplementationOnce(async () => {
      await pendingHydration;
    });
    const onComposerAccepted = vi.fn();
    const { result } = renderHook(() => useChatService());

    await act(async () => {
      expect(await result.current.sendMessage(
        'keep this draft until ready',
        [],
        [],
        onComposerAccepted,
      )).toBe(true);
    });

    expect(onComposerAccepted).not.toHaveBeenCalled();

    await act(async () => {
      resolvePendingHydration();
      await pendingHydration;
    });

    await waitFor(() => {
      expect(onComposerAccepted).toHaveBeenCalledWith(true);
    });
    const messages = useUnifiedStore.getState().data.ai?.messages['session-2'] || [];
    expect(messages.slice(-2).map((message) => message.role)).toEqual(['user', 'assistant']);
  });

  it('limits programmatic send text before storing and requesting', async () => {
    const { result } = renderHook(() => useChatService());
    const oversizedPrompt = 'x'.repeat(MAX_COMPOSER_PROGRAMMATIC_INSERT_CHARS + 1);
    const limitedPrompt = 'x'.repeat(MAX_COMPOSER_PROGRAMMATIC_INSERT_CHARS);

    await act(async () => {
      const accepted = await result.current.sendMessage(oversizedPrompt, [], []);
      expect(accepted).toBe(true);
    });

    await waitFor(() => {
      expect(sendMessageWithEndpointFallback).toHaveBeenCalledTimes(1);
    });

    const request = vi.mocked(sendMessageWithEndpointFallback).mock.calls[0]?.[0];
    const messages = useUnifiedStore.getState().data.ai?.messages['session-2'] || [];
    expect(request?.content).toBe(limitedPrompt);
    expect(messages.at(-2)?.content).toBe(limitedPrompt);
  });

  it('opens login instead of sending a managed request while signed out', async () => {
    seedManagedSignedOutState();
    const previousMessages = useUnifiedStore.getState().data.ai?.messages['session-2'] || [];
    const onLoginRequested = vi.fn();
    window.addEventListener(ACCOUNT_LOGIN_REQUESTED_EVENT, onLoginRequested);
    const { result } = renderHook(() => useChatService());

    try {
      await act(async () => {
        expect(await result.current.sendMessage('please help', [], [])).toBe(false);
      });
    } finally {
      window.removeEventListener(ACCOUNT_LOGIN_REQUESTED_EVENT, onLoginRequested);
    }

    expect(onLoginRequested).toHaveBeenCalledTimes(1);
    expect(sendMessageWithEndpointFallback).not.toHaveBeenCalled();
    expect(useAIUIStore.getState().authPromptSessionId).toBe('session-2');
    expect(useAIUIStore.getState().generatingSessions).toEqual({});
    expect(useUnifiedStore.getState().data.ai?.messages['session-2']).toEqual(previousMessages);
  });

  it('opens login instead of mutating managed retry actions while signed out', async () => {
    seedManagedSignedOutState();
    const previousMessages = useUnifiedStore.getState().data.ai?.messages['session-2'] || [];
    const onLoginRequested = vi.fn();
    window.addEventListener(ACCOUNT_LOGIN_REQUESTED_EVENT, onLoginRequested);
    const { result } = renderHook(() => useChatService());

    try {
      await act(async () => {
        await result.current.editMessage('s2-user', 'edited prompt');
        await result.current.regenerate('s2-assistant');
      });
    } finally {
      window.removeEventListener(ACCOUNT_LOGIN_REQUESTED_EVENT, onLoginRequested);
    }

    expect(onLoginRequested).toHaveBeenCalledTimes(2);
    expect(sendMessageWithEndpointFallback).not.toHaveBeenCalled();
    expect(useAIUIStore.getState().authPromptSessionId).toBe('session-2');
    expect(useAIUIStore.getState().generatingSessions).toEqual({});
    expect(useUnifiedStore.getState().data.ai?.messages['session-2']).toEqual(previousMessages);
  });

  it('blocks managed sends before mutating messages when quota is exhausted', async () => {
    seedManagedConnectedState();
    mocked.managedAIState.budget = {
      active: false,
      remainingPercent: 0,
      status: 'exhausted',
      usedPercent: 100,
    };
    mocked.managedAIState.lastBudgetSyncAt = Date.now();
    const previousMessages = useUnifiedStore.getState().data.ai?.messages['session-2'] || [];
    const { result } = renderHook(() => useChatService());

    await act(async () => {
      expect(await result.current.sendMessage('please help', [], [])).toBe(false);
    });

    expect(sendMessageWithEndpointFallback).not.toHaveBeenCalled();
    expect(useAIUIStore.getState().error).toBeNull();
    expect(useAIUIStore.getState().generatingSessions).toEqual({});
    expect(useUnifiedStore.getState().data.ai?.messages['session-2']).toEqual(previousMessages);
    expect(mocked.managedAIState.applyBudgetSnapshot).toHaveBeenCalledWith(expect.objectContaining({
      active: false,
      remainingPercent: 0,
      status: 'exhausted',
    }));
    expect(mocked.managedAIState.refreshBudget).toHaveBeenCalledTimes(1);
  });

  it('refreshes exhausted managed quota before sending and continues when quota recovered', async () => {
    seedManagedConnectedState();
    mocked.managedAIState.budget = {
      active: false,
      remainingPercent: 0,
      status: 'exhausted',
      usedPercent: 100,
    };
    mocked.managedAIState.refreshBudget.mockImplementationOnce(async () => {
      mocked.managedAIState.budget = {
        active: true,
        remainingPercent: 20,
        status: 'normal',
        usedPercent: 80,
      };
    });
    const { result } = renderHook(() => useChatService());

    await act(async () => {
      expect(await result.current.sendMessage('please help after top up', [], [])).toBe(true);
    });

    expect(mocked.managedAIState.refreshBudget).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(sendMessageWithEndpointFallback).toHaveBeenCalledTimes(1);
    });
  });

  it('keeps blocking managed sends from an exhausted budget snapshot until budget changes', async () => {
    seedManagedConnectedState();
    mocked.managedAIState.budget = {
      active: false,
      remainingPercent: 0,
      status: 'exhausted',
      usedPercent: 100,
    };
    mocked.managedAIState.lastBudgetSyncAt = Date.now() - 120_000;
    const previousMessages = useUnifiedStore.getState().data.ai?.messages['session-2'] || [];
    const { result } = renderHook(() => useChatService());

    await act(async () => {
      expect(await result.current.sendMessage('please help after waiting', [], [])).toBe(false);
    });

    expect(sendMessageWithEndpointFallback).not.toHaveBeenCalled();
    expect(useAIUIStore.getState().error).toBeNull();
    expect(useUnifiedStore.getState().data.ai?.messages['session-2']).toEqual(previousMessages);
  });

  it('recalls the submitted composer draft instead of writing a quota assistant reply', async () => {
    seedManagedConnectedState();
    const quotaError = Object.assign(new Error('MANAGED_QUOTA_EXHAUSTED'), {
      errorCode: 'points_exhausted',
      statusCode: 403,
    });
    mocked.sendMessageWithEndpointFallback.mockRejectedValueOnce(quotaError);
    const { result } = renderHook(() => useChatService());

    await act(async () => {
      expect(await result.current.sendMessage('please help', [], [])).toBe(true);
    });

    await waitFor(() => {
      expect(result.current.recalledComposerDraft).toMatchObject({
        message: 'please help',
        attachments: [],
        noteMentions: [],
      });
    });

    const messages = useUnifiedStore.getState().data.ai?.messages['session-2'] || [];
    expect(messages.map((message) => message.content)).toEqual([
      'session two visible prompt',
      'session two visible answer',
    ]);
    expect(JSON.stringify(messages)).not.toContain('点数已用完');
    expect(JSON.stringify(messages)).not.toContain('points_exhausted');
    expect(useAIUIStore.getState().error).toBeNull();
    expect(mocked.managedAIState.applyBudgetSnapshot).toHaveBeenCalledWith(expect.objectContaining({
      active: false,
      remainingPercent: 0,
      status: 'exhausted',
    }));
  });

  it('recalls the submitted composer draft when remaining quota is too small for the selected model', async () => {
    seedManagedConnectedState();
    mocked.managedAIState.budget = {
      active: true,
      remainingPercent: 1,
      status: 'active',
      usedPercent: 99,
    };
    mocked.managedAIState.lastBudgetSyncAt = Date.now();
    const quotaError = Object.assign(new Error('Insufficient remaining points'), {
      errorCode: 'insufficient_points',
      statusCode: 403,
    });
    mocked.sendMessageWithEndpointFallback.mockRejectedValueOnce(quotaError);
    const { result } = renderHook(() => useChatService());

    await act(async () => {
      expect(await result.current.sendMessage('expensive model prompt', [], [])).toBe(true);
    });

    await waitFor(() => {
      expect(result.current.recalledComposerDraft).toMatchObject({
        message: 'expensive model prompt',
        attachments: [],
        noteMentions: [],
      });
    });

    const messages = useUnifiedStore.getState().data.ai?.messages['session-2'] || [];
    expect(sendMessageWithEndpointFallback).toHaveBeenCalledTimes(1);
    expect(messages.map((message) => message.content)).toEqual([
      'session two visible prompt',
      'session two visible answer',
    ]);
    expect(JSON.stringify(messages)).not.toContain('Insufficient remaining points');
    expect(JSON.stringify(messages)).not.toContain('insufficient_points');
    expect(useAIUIStore.getState().error).toBeNull();
    expect(mocked.managedAIState.applyBudgetSnapshot).toHaveBeenCalledWith(expect.objectContaining({
      active: false,
      remainingPercent: 0,
      status: 'exhausted',
    }));
  });

  it('rolls back edited message branches on managed quota errors without writing an assistant quota reply', async () => {
    seedManagedConnectedState();
    const quotaError = Object.assign(new Error('MANAGED_QUOTA_EXHAUSTED'), {
      errorCode: 'points_exhausted',
      statusCode: 403,
    });
    mocked.sendMessageWithEndpointFallback.mockRejectedValueOnce(quotaError);
    const { result } = renderHook(() => useChatService());

    await act(async () => {
      await result.current.editMessage('s2-user', 'edited prompt');
    });

    await waitFor(() => {
      expect(mocked.managedAIState.applyBudgetSnapshot).toHaveBeenCalledWith(expect.objectContaining({
        active: false,
        remainingPercent: 0,
        status: 'exhausted',
      }));
    });

    const messages = useUnifiedStore.getState().data.ai?.messages['session-2'] || [];
    expect(sendMessageWithEndpointFallback).toHaveBeenCalledTimes(1);
    expect(messages.map((message) => message.content)).toEqual([
      'session two visible prompt',
      'session two visible answer',
    ]);
    expect(JSON.stringify(messages)).not.toContain('点数已用完');
    expect(JSON.stringify(messages)).not.toContain('points_exhausted');
    expect(useAIUIStore.getState().error).toBeNull();
  });

  it('rolls back regenerated assistant versions on managed quota errors without writing an assistant quota reply', async () => {
    seedManagedConnectedState();
    const quotaError = Object.assign(new Error('MANAGED_QUOTA_EXHAUSTED'), {
      errorCode: 'points_exhausted',
      statusCode: 403,
    });
    mocked.sendMessageWithEndpointFallback.mockRejectedValueOnce(quotaError);
    const { result } = renderHook(() => useChatService());

    await act(async () => {
      await result.current.regenerate('s2-assistant');
    });

    await waitFor(() => {
      expect(mocked.managedAIState.applyBudgetSnapshot).toHaveBeenCalledWith(expect.objectContaining({
        active: false,
        remainingPercent: 0,
        status: 'exhausted',
      }));
    });

    const messages = useUnifiedStore.getState().data.ai?.messages['session-2'] || [];
    expect(sendMessageWithEndpointFallback).toHaveBeenCalledTimes(1);
    expect(messages.map((message) => message.content)).toEqual([
      'session two visible prompt',
      'session two visible answer',
    ]);
    expect(JSON.stringify(messages)).not.toContain('点数已用完');
    expect(JSON.stringify(messages)).not.toContain('points_exhausted');
    expect(useAIUIStore.getState().error).toBeNull();
  });

  it('shows managed network failures as network errors', async () => {
    seedManagedConnectedState();
    mocked.sendMessageWithEndpointFallback.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const { result } = renderHook(() => useChatService());

    await act(async () => {
      expect(await result.current.sendMessage('trigger network failure', [], [])).toBe(true);
    });

    await waitFor(() => {
      expect(useAIUIStore.getState().error).toBe('Network connection error. Please check your connection and try again.');
    });

    const messages = useUnifiedStore.getState().data.ai?.messages['session-2'] || [];
    expect(messages.at(-1)?.content).toBe(
      '<error type="NETWORK_ERROR" code="">Network connection error. Please check your connection and try again.</error>',
    );
    expect(JSON.stringify(messages)).not.toContain('upstream_unavailable');
    expect(JSON.stringify(messages)).not.toContain('My brain needs a breather');
  });

  it('handles object provider errors without coercion', async () => {
    let stringReads = 0;
    const throwingError = {
      toString() {
        stringReads += 1;
        throw new Error('Unexpected chat error coercion');
      },
    };
    mocked.sendMessageWithEndpointFallback.mockRejectedValueOnce(throwingError);
    const { result } = renderHook(() => useChatService());

    await act(async () => {
      expect(await result.current.sendMessage('trigger failure', [], [])).toBe(true);
    });

    await waitFor(() => {
      expect(useAIUIStore.getState().error).toBe('Unknown error');
    });
    expect(stringReads).toBe(0);
  });

  it('releases the session mutation lock after starting a streamed request', async () => {
    let resolveProvider!: (value: string) => void;
    const pendingProviderResponse = new Promise<string>((resolve) => {
      resolveProvider = resolve;
    });
    mocked.sendMessageWithEndpointFallback.mockImplementationOnce(async ({ onChunk }: { onChunk: (chunk: string) => void }) => {
      onChunk('partial answer');
      return await pendingProviderResponse;
    });
    const { result } = renderHook(() => useChatService());

    await act(async () => {
      const accepted = await result.current.sendMessage('long running prompt', [], []);
      expect(accepted).toBe(true);
    });

    await waitFor(() => {
      expect(sendMessageWithEndpointFallback).toHaveBeenCalledTimes(1);
    });

    let followUpMutationRan = false;
    const followUpMutation = runWithSessionMutationLock('session-2', () => {
      followUpMutationRan = true;
    });

    await waitFor(() => {
      expect(followUpMutationRan).toBe(true);
    });
    await followUpMutation;

    resolveProvider('final answer');
    await waitFor(() => {
      expect(useAIUIStore.getState().generatingSessions).toEqual({});
    });
  });

  it('generates a title after a promoted temporary request completes', async () => {
    seedTemporaryChatState();
    let resolveProvider!: (value: string) => void;
    const pendingProviderResponse = new Promise<string>((resolve) => {
      resolveProvider = resolve;
    });
    mocked.sendMessageWithEndpointFallback.mockImplementationOnce(async ({ onChunk }: { onChunk: (chunk: string) => void }) => {
      onChunk('partial temporary answer');
      return await pendingProviderResponse;
    });

    const { result } = renderHook(() => useChatService());

    await act(async () => {
      expect(await result.current.sendMessage('name this promoted temporary chat', [], [])).toBe(true);
    });

    await waitFor(() => {
      expect(useAIUIStore.getState().generatingSessions).toEqual({ 'temp-session-1': true });
    });

    let promotedSessionId: string | null = null;
    await act(async () => {
      promotedSessionId = await aiActions.promoteTemporarySession();
    });

    expect(promotedSessionId).toMatch(/^session-/);
    expect(mocked.generateAutoTitle).not.toHaveBeenCalled();

    await act(async () => {
      resolveProvider('final temporary answer');
      await pendingProviderResponse;
    });

    await waitFor(() => {
      expect(mocked.generateAutoTitle).toHaveBeenCalledWith(promotedSessionId, provider.id, model.id);
    });
  });

  it('does not call the provider when stopped before pre-request hydration completes', async () => {
    let resolvePendingHydration!: () => void;
    const pendingHydration = new Promise<void>((resolve) => {
      resolvePendingHydration = resolve;
    });
    mocked.flushPendingSessionJsonSave.mockImplementationOnce(async () => {
      await pendingHydration;
    });
    const onComposerAccepted = vi.fn();

    const { result } = renderHook(() => useChatService());

    await act(async () => {
      expect(await result.current.sendMessage('cancel before provider', [], [], onComposerAccepted)).toBe(true);
    });

    await waitFor(() => {
      expect(mocked.flushPendingSessionJsonSave).toHaveBeenCalledTimes(1);
      expect(mocked.flushPendingSessionJsonSave).toHaveBeenCalledWith('session-2');
      expect(useAIUIStore.getState().generatingSessions).toEqual({ 'session-2': true });
    });

    act(() => {
      result.current.stop();
    });

    await act(async () => {
      resolvePendingHydration();
      await pendingHydration;
    });

    await waitFor(() => {
      expect(sendMessageWithEndpointFallback).not.toHaveBeenCalled();
      expect(useAIUIStore.getState().generatingSessions).toEqual({});
      expect(onComposerAccepted).toHaveBeenCalledWith(false);
    });

    const sessionMessages = useUnifiedStore.getState().data.ai?.messages['session-2'] || [];
    expect(sessionMessages.map((message) => message.content)).toEqual([
      'session two visible prompt',
      'session two visible answer',
    ]);
  });

  it('does not call the provider when the session is deleted while pre-request hydration is pending', async () => {
    let resolvePendingHydration!: () => void;
    const pendingHydration = new Promise<void>((resolve) => {
      resolvePendingHydration = resolve;
    });
    mocked.flushPendingSessionJsonSave.mockImplementationOnce(async () => {
      await pendingHydration;
    });

    const { result } = renderHook(() => useChatService());

    await act(async () => {
      expect(await result.current.sendMessage('delete before provider', [], [])).toBe(true);
    });

    await waitFor(() => {
      expect(mocked.flushPendingSessionJsonSave).toHaveBeenCalledWith('session-2');
      expect(useAIUIStore.getState().generatingSessions).toEqual({ 'session-2': true });
    });

    let deleteSession: Promise<void> | null = null;
    act(() => {
      deleteSession = aiActions.deleteSession('session-2');
    });

    expect(useAIUIStore.getState().generatingSessions).toEqual({});
    expect(deleteSession).not.toBeNull();

    await act(async () => {
      resolvePendingHydration();
      await pendingHydration;
      await deleteSession;
    });

    await waitFor(() => {
      expect(sendMessageWithEndpointFallback).not.toHaveBeenCalled();
      expect(useUnifiedStore.getState().data.ai?.sessions.some((session) => session.id === 'session-2')).toBe(false);
    });
  });

  it('does not call the provider when sessions are cleared while pre-request hydration is pending', async () => {
    let resolvePendingHydration!: () => void;
    const pendingHydration = new Promise<void>((resolve) => {
      resolvePendingHydration = resolve;
    });
    mocked.flushPendingSessionJsonSave.mockImplementationOnce(async () => {
      await pendingHydration;
    });

    const { result } = renderHook(() => useChatService());

    await act(async () => {
      expect(await result.current.sendMessage('clear before provider', [], [])).toBe(true);
    });

    await waitFor(() => {
      expect(mocked.flushPendingSessionJsonSave).toHaveBeenCalledWith('session-2');
      expect(useAIUIStore.getState().generatingSessions).toEqual({ 'session-2': true });
    });

    let clearSessions: Promise<void> | null = null;
    act(() => {
      clearSessions = aiActions.clearSessions();
    });

    expect(useAIUIStore.getState().generatingSessions).toEqual({});
    expect(clearSessions).not.toBeNull();

    await act(async () => {
      resolvePendingHydration();
      await pendingHydration;
      await clearSessions;
    });

    await waitFor(() => {
      expect(sendMessageWithEndpointFallback).not.toHaveBeenCalled();
      expect(useUnifiedStore.getState().data.ai?.sessions).toEqual([]);
      expect(useUnifiedStore.getState().data.ai?.messages).toEqual({});
    });
  });

  it('recalls the submitted composer text when stopped before request messages are created', async () => {
    let resolvePendingHydration!: () => void;
    const pendingHydration = new Promise<void>((resolve) => {
      resolvePendingHydration = resolve;
    });
    mocked.flushPendingSessionJsonSave.mockImplementationOnce(async () => {
      await pendingHydration;
    });

    const { result } = renderHook(() => useChatService());

    await act(async () => {
      expect(await result.current.sendMessage('cancel before provider', [], [])).toBe(true);
    });

    await waitFor(() => {
      expect(mocked.flushPendingSessionJsonSave).toHaveBeenCalledWith('session-2');
      expect(useAIUIStore.getState().generatingSessions).toEqual({ 'session-2': true });
    });

    let recalled: ReturnType<typeof result.current.stopAndRecallLastUserMessage> = null;
    act(() => {
      recalled = result.current.stopAndRecallLastUserMessage('cancel before provider');
    });

    expect(recalled).toEqual({
      message: 'cancel before provider',
      attachments: [],
      noteMentions: [],
    });

    await act(async () => {
      resolvePendingHydration();
      await pendingHydration;
    });

    await waitFor(() => {
      expect(sendMessageWithEndpointFallback).not.toHaveBeenCalled();
      expect(useAIUIStore.getState().generatingSessions).toEqual({});
    });

    const sessionMessages = useUnifiedStore.getState().data.ai?.messages['session-2'] || [];
    expect(sessionMessages.map((message) => message.content)).toEqual([
      'session two visible prompt',
      'session two visible answer',
    ]);
  });

  it('retracts pending request messages and recalls the composer text when stopped from the input', async () => {
    let resolveProvider!: (value: string) => void;
    const pendingProviderResponse = new Promise<string>((resolve) => {
      resolveProvider = resolve;
    });
    mocked.sendMessageWithEndpointFallback.mockImplementationOnce(async () => {
      return await pendingProviderResponse;
    });
    const { result } = renderHook(() => useChatService());

    await act(async () => {
      expect(await result.current.sendMessage('pending prompt', [], [])).toBe(true);
    });

    await waitFor(() => {
      expect(sendMessageWithEndpointFallback).toHaveBeenCalledTimes(1);
      expect((useUnifiedStore.getState().data.ai?.messages['session-2'] || []).map((message) => message.content)).toEqual([
        'session two visible prompt',
        'session two visible answer',
        'pending prompt',
        '',
      ]);
    });

    let recalled: ReturnType<typeof result.current.stopAndRecallLastUserMessage> = null;
    act(() => {
      recalled = result.current.stopAndRecallLastUserMessage('pending prompt');
    });

    expect(recalled).toEqual({
      message: 'pending prompt',
      attachments: [],
      noteMentions: [],
    });
    expect((useUnifiedStore.getState().data.ai?.messages['session-2'] || []).map((message) => message.content)).toEqual([
      'session two visible prompt',
      'session two visible answer',
    ]);

    await act(async () => {
      resolveProvider('late answer');
      await pendingProviderResponse;
    });

    await waitFor(() => {
      expect(useAIUIStore.getState().generatingSessions).toEqual({});
    });
    expect((useUnifiedStore.getState().data.ai?.messages['session-2'] || []).map((message) => message.content)).toEqual([
      'session two visible prompt',
      'session two visible answer',
    ]);
  });

  it('returns a brand-new chat to the empty new chat state when its first request is recalled', async () => {
    let resolveProvider!: (value: string) => void;
    const pendingProviderResponse = new Promise<string>((resolve) => {
      resolveProvider = resolve;
    });
    mocked.sendMessageWithEndpointFallback.mockImplementationOnce(async () => {
      return await pendingProviderResponse;
    });
    useAIUIStore.setState({
      currentSessionId: null,
      temporaryChatEnabled: false,
    });
    useUnifiedStore.setState((state) => ({
      data: {
        ...state.data,
        ai: {
          ...state.data.ai!,
          currentSessionId: null,
          temporaryChatEnabled: false,
        },
      },
    }));
    const initialSessionIds = useUnifiedStore.getState().data.ai!.sessions.map((session) => session.id);
    const { result } = renderHook(() => useChatService());

    await act(async () => {
      expect(await result.current.sendMessage('first pending prompt', [], [])).toBe(true);
    });

    await waitFor(() => {
      expect(sendMessageWithEndpointFallback).toHaveBeenCalledTimes(1);
    });

    const createdSession = useUnifiedStore.getState().data.ai!.sessions.find(
      (session) => !initialSessionIds.includes(session.id),
    );
    expect(createdSession).toBeDefined();
    expect(useAIUIStore.getState().currentSessionId).toBe(createdSession?.id);

    let recalled: ReturnType<typeof result.current.stopAndRecallLastUserMessage> = null;
    act(() => {
      recalled = result.current.stopAndRecallLastUserMessage('first pending prompt');
    });

    expect(recalled).toEqual({
      message: 'first pending prompt',
      attachments: [],
      noteMentions: [],
    });
    expect(useUnifiedStore.getState().data.ai!.sessions.map((session) => session.id)).toEqual(initialSessionIds);
    expect(useUnifiedStore.getState().data.ai!.messages[createdSession!.id]).toBeUndefined();
    expect(useAIUIStore.getState().currentSessionId).toBeNull();
    expect(mocked.cancelSessionJsonSave).toHaveBeenCalledWith(createdSession!.id);
    expect(mocked.deleteSessionJson).toHaveBeenCalledWith(createdSession!.id);

    await act(async () => {
      resolveProvider('late answer');
      await pendingProviderResponse;
    });

    await waitFor(() => {
      expect(useAIUIStore.getState().generatingSessions).toEqual({});
    });
    expect(useUnifiedStore.getState().data.ai!.sessions.map((session) => session.id)).toEqual(initialSessionIds);
  });

  it('recalls attachments and note mentions with the stopped composer request', async () => {
    let resolveProvider!: (value: string) => void;
    const pendingProviderResponse = new Promise<string>((resolve) => {
      resolveProvider = resolve;
    });
    mocked.sendMessageWithEndpointFallback.mockImplementationOnce(async () => {
      return await pendingProviderResponse;
    });
    const attachment = createAttachment({
      id: 'attachment-recall',
      name: 'recall.png',
      previewUrl: 'data:image/png;base64,UkVDQUxM',
    });
    const noteMention = {
      path: 'docs/context.md',
      title: 'context.md',
      kind: 'note' as const,
    };
    const { result } = renderHook(() => useChatService());

    await act(async () => {
      expect(await result.current.sendMessage('pending prompt', [attachment], [noteMention])).toBe(true);
    });

    await waitFor(() => {
      expect(sendMessageWithEndpointFallback).toHaveBeenCalledTimes(1);
    });

    let recalled: ReturnType<typeof result.current.stopAndRecallLastUserMessage> = null;
    act(() => {
      recalled = result.current.stopAndRecallLastUserMessage('pending prompt');
    });

    expect(recalled).toEqual({
      message: 'pending prompt',
      attachments: [attachment],
      noteMentions: [noteMention],
    });
    expect((useUnifiedStore.getState().data.ai?.messages['session-2'] || []).map((message) => message.content)).toEqual([
      'session two visible prompt',
      'session two visible answer',
    ]);

    await act(async () => {
      resolveProvider('late answer');
      await pendingProviderResponse;
    });
  });

  it('ignores stale API transcript callbacks after a newer request supersedes the stream', async () => {
    let resolveFirstProvider!: (value: string) => void;
    let firstTranscriptCallback: ((messages: ApiTranscriptMessage[]) => void) | undefined;
    const pendingFirstProviderResponse = new Promise<string>((resolve) => {
      resolveFirstProvider = resolve;
    });

    mocked.sendMessageWithEndpointFallback
      .mockImplementationOnce(async ({
        onChunk,
        options,
      }: {
        onChunk: (chunk: string) => void;
        options?: ChatSendOptions;
      }) => {
        firstTranscriptCallback = options?.onApiTranscript;
        onChunk('first partial answer');
        return await pendingFirstProviderResponse;
      })
      .mockImplementationOnce(async ({
        onChunk,
        options,
      }: {
        onChunk: (chunk: string) => void;
        options?: ChatSendOptions;
      }) => {
        onChunk('second answer');
        options?.onApiTranscript?.([{ role: 'assistant', content: 'second transcript' }]);
        return 'second answer';
      });

    const { result } = renderHook(() => useChatService());

    await act(async () => {
      expect(await result.current.sendMessage('first prompt', [], [])).toBe(true);
    });

    await waitFor(() => {
      expect(sendMessageWithEndpointFallback).toHaveBeenCalledTimes(1);
      expect(firstTranscriptCallback).toBeTypeOf('function');
    });

    await act(async () => {
      expect(await result.current.sendMessage('second prompt', [], [])).toBe(true);
    });

    await waitFor(() => {
      expect(sendMessageWithEndpointFallback).toHaveBeenCalledTimes(2);
      const messages = useUnifiedStore.getState().data.ai?.messages['session-2'] || [];
      expect(messages.at(-1)?.content).toBe('second answer');
    });

    act(() => {
      firstTranscriptCallback?.([{ role: 'assistant', content: 'stale first transcript' }]);
      resolveFirstProvider('stale first final');
    });

    await waitFor(() => {
      expect(useAIUIStore.getState().generatingSessions).toEqual({});
    });

    const messages = useUnifiedStore.getState().data.ai?.messages['session-2'] || [];
    expect(JSON.stringify(messages)).not.toContain('stale first transcript');
    expect(messages.some((message) => message.apiTranscript?.[0]?.content === 'second transcript')).toBe(true);
  });

  it('converts case-insensitive stored attachment URLs to ephemeral data URLs in temporary chat', async () => {
    seedTemporaryChatState();
    vi.mocked(convertToBase64).mockResolvedValueOnce(TEMPORARY_IMAGE_DATA_URL);
    const attachment = createAttachment({
      previewUrl: 'ATTACHMENT://demo.png',
      assetUrl: 'APP-FILE://attachment/demo.png',
    });

    const { result } = renderHook(() => useChatService());

    await act(async () => {
      expect(await result.current.sendMessage('describe it', [attachment], [])).toBe(true);
    });

    await waitFor(() => {
      expect(sendMessageWithEndpointFallback).toHaveBeenCalledTimes(1);
    });

    expect(convertToBase64).toHaveBeenCalledWith(attachment, expect.any(Object));
    expect(deleteAttachment).toHaveBeenCalledWith(attachment);
    const messages = useUnifiedStore.getState().data.ai?.messages['temp-session-1'] || [];
    const userMessage = messages.find((message) => message.role === 'user');
    expect(userMessage?.content).toBe(`![image](<${TEMPORARY_IMAGE_DATA_URL}>)\n\ndescribe it`);
    expect(userMessage?.content).not.toContain('ATTACHMENT://');
    expect(userMessage?.content).not.toContain('APP-FILE://');
  });

  it('does not convert file attachment URLs without a persistent attachment path in temporary chat', async () => {
    seedTemporaryChatState();
    const attachment = createAttachment({
      previewUrl: '',
      assetUrl: 'FILE:///appdata/.vlaina/chat/attachments/demo.png',
    });

    const { result } = renderHook(() => useChatService());

    await act(async () => {
      expect(await result.current.sendMessage('describe it', [attachment], [])).toBe(true);
    });

    await waitFor(() => {
      expect(sendMessageWithEndpointFallback).toHaveBeenCalledTimes(1);
    });

    expect(convertToBase64).not.toHaveBeenCalled();
    expect(deleteAttachment).not.toHaveBeenCalled();
    const messages = useUnifiedStore.getState().data.ai?.messages['temp-session-1'] || [];
    const userMessage = messages.find((message) => message.role === 'user');
    expect(userMessage?.content).toBe('describe it');
    expect(userMessage?.content).not.toContain('FILE://');
  });

  it('uses the chat image path allowlist when converting temporary chat disk attachments', async () => {
    seedTemporaryChatState();
    vi.mocked(convertToBase64).mockResolvedValueOnce(TEMPORARY_IMAGE_DATA_URL);
    const attachment = createAttachment({
      path: '/notesRoot/assets/demo.png',
      previewUrl: 'blob:preview',
      assetUrl: '',
    });

    const { result } = renderHook(() => useChatService());

    await act(async () => {
      expect(await result.current.sendMessage('describe it', [attachment], [])).toBe(true);
    });

    await waitFor(() => {
      expect(sendMessageWithEndpointFallback).toHaveBeenCalledTimes(1);
    });

    const options = vi.mocked(convertToBase64).mock.calls[0]?.[1] as
      | { allowPath?: (path: string) => boolean }
      | undefined;
    expect(options?.allowPath?.('/notesRoot/assets/demo.png')).toBe(true);
    expect(options?.allowPath?.('/notesRoot/.notes/demo.png')).toBe(true);
    expect(options?.allowPath?.('/notesRoot/.vlaina/demo.png')).toBe(false);
    expect(options?.allowPath?.('/notesRoot/docs/.git/demo.png')).toBe(false);
    expect(options?.allowPath?.('/outside/demo.png')).toBe(false);
    expect(deleteAttachment).toHaveBeenCalledWith(attachment);
  });

  it('does not delete temporary attachments when recalled during ephemeral conversion', async () => {
    seedTemporaryChatState();
    let resolveConversion!: (value: string) => void;
    const pendingConversion = new Promise<string>((resolve) => {
      resolveConversion = resolve;
    });
    vi.mocked(convertToBase64).mockImplementationOnce(async () => pendingConversion);
    const attachment = createAttachment({
      path: '/notesRoot/assets/demo.png',
      previewUrl: 'attachment://demo.png',
      assetUrl: '',
    });
    const { result } = renderHook(() => useChatService());

    await act(async () => {
      expect(await result.current.sendMessage('describe it', [attachment], [])).toBe(true);
    });

    await waitFor(() => {
      expect(convertToBase64).toHaveBeenCalledWith(attachment, expect.any(Object));
      expect(useAIUIStore.getState().generatingSessions).toEqual({ 'temp-session-1': true });
    });

    let recalled: ReturnType<typeof result.current.stopAndRecallLastUserMessage> = null;
    act(() => {
      recalled = result.current.stopAndRecallLastUserMessage('describe it');
    });

    expect(recalled).toEqual({
      message: 'describe it',
      attachments: [attachment],
      noteMentions: [],
    });

    await act(async () => {
      resolveConversion(TEMPORARY_IMAGE_DATA_URL);
      await pendingConversion;
    });

    await waitFor(() => {
      expect(useAIUIStore.getState().generatingSessions).toEqual({});
    });

    expect(deleteAttachment).not.toHaveBeenCalled();
    expect(sendMessageWithEndpointFallback).not.toHaveBeenCalled();
    expect(useUnifiedStore.getState().data.ai?.messages['temp-session-1']).toEqual([]);
  });

  it('recalls converted temporary attachments while original deletion is pending', async () => {
    seedTemporaryChatState();
    let resolveDeletion!: () => void;
    const pendingDeletion = new Promise<void>((resolve) => {
      resolveDeletion = resolve;
    });
    vi.mocked(convertToBase64).mockResolvedValueOnce(TEMPORARY_IMAGE_DATA_URL);
    vi.mocked(deleteAttachment).mockImplementationOnce(async () => pendingDeletion);
    const attachment = createAttachment({
      path: '/notesRoot/assets/demo.png',
      previewUrl: 'attachment://demo.png',
      assetUrl: '',
    });
    const { result } = renderHook(() => useChatService());

    await act(async () => {
      expect(await result.current.sendMessage('describe it', [attachment], [])).toBe(true);
    });

    await waitFor(() => {
      expect(convertToBase64).toHaveBeenCalledWith(attachment, expect.any(Object));
      expect(deleteAttachment).toHaveBeenCalledWith(attachment);
      expect(useAIUIStore.getState().generatingSessions).toEqual({ 'temp-session-1': true });
    });

    let recalled: ReturnType<typeof result.current.stopAndRecallLastUserMessage> = null;
    act(() => {
      recalled = result.current.stopAndRecallLastUserMessage('describe it');
    });

    expect(recalled).toEqual({
      message: 'describe it',
      attachments: [{
        ...attachment,
        path: '',
        assetUrl: '',
        previewUrl: TEMPORARY_IMAGE_DATA_URL,
      }],
      noteMentions: [],
    });

    await act(async () => {
      resolveDeletion();
      await pendingDeletion;
    });

    await waitFor(() => {
      expect(useAIUIStore.getState().generatingSessions).toEqual({});
    });

    expect(sendMessageWithEndpointFallback).not.toHaveBeenCalled();
    expect(useUnifiedStore.getState().data.ai?.messages['temp-session-1']).toEqual([]);
  });

  it('limits concurrent temporary attachment conversions while preserving image order', async () => {
    seedTemporaryChatState();
    let activeConversions = 0;
    let maxActiveConversions = 0;
    const resolveConversions: Array<() => void> = [];
    const attachments = Array.from(
      { length: MAX_TEMPORARY_ATTACHMENT_EPHEMERAL_CONCURRENCY + 2 },
      (_value, index) => createAttachment({
        id: `attachment-${index}`,
        path: `/notesRoot/assets/demo-${index}.png`,
        previewUrl: `attachment://demo-${index}.png`,
        assetUrl: '',
        name: `demo-${index}.png`,
      }),
    );
    vi.mocked(convertToBase64).mockImplementation(async (attachment: Attachment) => {
      activeConversions += 1;
      maxActiveConversions = Math.max(maxActiveConversions, activeConversions);
      await new Promise<void>((resolve) => {
        resolveConversions.push(resolve);
      });
      activeConversions -= 1;
      return `data:image/png;base64,${globalThis.btoa(attachment.id)}`;
    });
    const { result } = renderHook(() => useChatService());

    let sendRequest!: Promise<boolean>;
    await act(async () => {
      sendRequest = result.current.sendMessage('describe it', attachments, []);
      await waitFor(() => {
        expect(resolveConversions).toHaveLength(MAX_TEMPORARY_ATTACHMENT_EPHEMERAL_CONCURRENCY);
      });
    });

    expect(maxActiveConversions).toBeLessThanOrEqual(MAX_TEMPORARY_ATTACHMENT_EPHEMERAL_CONCURRENCY);
    while (resolveConversions.length > 0) {
      resolveConversions.shift()?.();
      await Promise.resolve();
    }
    await waitFor(() => {
      expect(convertToBase64).toHaveBeenCalledTimes(attachments.length);
    });
    while (resolveConversions.length > 0) {
      resolveConversions.shift()?.();
      await Promise.resolve();
    }

    await act(async () => {
      await expect(sendRequest).resolves.toBe(true);
    });
    await waitFor(() => {
      expect(sendMessageWithEndpointFallback).toHaveBeenCalledTimes(1);
    });

    expect(maxActiveConversions).toBeLessThanOrEqual(MAX_TEMPORARY_ATTACHMENT_EPHEMERAL_CONCURRENCY);
    const messages = useUnifiedStore.getState().data.ai?.messages['temp-session-1'] || [];
    const userMessage = messages.find((message) => message.role === 'user');
    expect(userMessage?.content).toContain('describe it');
    expect(userMessage?.imageSources).toEqual(
      attachments.map((attachment) => `data:image/png;base64,${globalThis.btoa(attachment.id)}`),
    );
    expect(deleteAttachment).toHaveBeenCalledTimes(attachments.length);
  });

  it('rejects a temporary request instead of silently dropping an image that cannot be converted', async () => {
    seedTemporaryChatState();
    vi.mocked(convertToBase64).mockRejectedValueOnce(new Error('cannot read attachment'));
    const attachment = createAttachment({
      previewUrl: 'attachment://demo.png',
      assetUrl: 'app-file://attachment/demo.png',
    });
    const onComposerAccepted = vi.fn();

    const { result } = renderHook(() => useChatService());

    await act(async () => {
      expect(await result.current.sendMessage(
        'describe it',
        [attachment],
        [],
        onComposerAccepted,
      )).toBe(true);
    });

    await waitFor(() => {
      expect(onComposerAccepted).toHaveBeenCalledWith(false);
    });

    expect(deleteAttachment).not.toHaveBeenCalled();
    expect(sendMessageWithEndpointFallback).not.toHaveBeenCalled();
    expect(useUnifiedStore.getState().data.ai?.messages['temp-session-1']).toEqual([]);
    expect(useAIUIStore.getState().error).toBeTruthy();
  });

  it('does not send an empty temporary request when all stored attachments fail conversion', async () => {
    seedTemporaryChatState();
    vi.mocked(convertToBase64).mockRejectedValueOnce(new Error('cannot read attachment'));
    const attachment = createAttachment({
      previewUrl: 'attachment://demo.png',
      assetUrl: 'app-file://attachment/demo.png',
    });

    const { result } = renderHook(() => useChatService());

    await act(async () => {
      expect(await result.current.sendMessage('', [attachment], [])).toBe(true);
    });

    await waitFor(() => {
      expect(useAIUIStore.getState().generatingSessions).toEqual({});
    });

    expect(sendMessageWithEndpointFallback).not.toHaveBeenCalled();
    expect(deleteAttachment).not.toHaveBeenCalled();
    expect(useUnifiedStore.getState().data.ai?.messages['temp-session-1']).toEqual([]);
  });
});
