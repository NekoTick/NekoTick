import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useChatService } from './useChatService';
import { useAIUIStore } from '@/stores/ai/chatState';
import { useUnifiedStore } from '@/stores/unified/useUnifiedStore';
import { useNotesStore } from '@/stores/notes/useNotesStore';
import type { AIModel, ChatMessage, Provider } from '@/lib/ai/types';
import { sendMessageWithEndpointFallback } from './sendMessageWithEndpointFallback';
import { convertToBase64, type Attachment } from '@/lib/storage/attachmentStorage';

const IMAGE_DATA_URL = 'data:image/png;base64,QVRUQUNITUVOVA==';

const mocked = vi.hoisted(() => ({
  saveSessionJson: vi.fn(async () => {}),
  scheduleSessionJsonSave: vi.fn(),
  flushPendingSessionJsonSave: vi.fn(async () => {}),
  loadSessionJson: vi.fn(async () => null as ChatMessage[] | null),
  useAccountSessionStore: (selector: (state: { isConnected: boolean }) => unknown) =>
    selector({ isConnected: true }),
  useManagedAIStore: {
    getState: () => ({
      budget: null,
      lastBudgetSyncAt: null,
      refreshBudget: vi.fn(async () => {}),
    }),
  },
  generateAutoTitle: vi.fn(async () => {}),
  convertToBase64: vi.fn(async () => IMAGE_DATA_URL),
  deleteAttachment: vi.fn(async () => {}),
  sendMessageWithEndpointFallback: vi.fn(async ({ onChunk }: { onChunk: (chunk: string) => void }) => {
    onChunk('assistant answer');
    return 'assistant answer';
  }),
}));

vi.mock('@/lib/storage/chatStorage', () => ({
  saveSessionJson: mocked.saveSessionJson,
  scheduleSessionJsonSave: mocked.scheduleSessionJsonSave,
  flushPendingSessionJsonSave: mocked.flushPendingSessionJsonSave,
  loadSessionJson: mocked.loadSessionJson,
  hasPendingSessionJsonSave: vi.fn(() => false),
}));

vi.mock('@/lib/storage/attachmentStorage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/storage/attachmentStorage')>();
  return {
    ...actual,
    convertToBase64: mocked.convertToBase64,
    deleteAttachment: mocked.deleteAttachment,
  };
});

vi.mock('@/stores/accountSession', () => ({
  useAccountSessionStore: mocked.useAccountSessionStore,
}));

vi.mock('@/stores/useManagedAIStore', () => ({
  applyManagedQuotaExhaustedSnapshot: vi.fn(),
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

function createDiskImageAttachment(): Attachment {
  return {
    id: 'attachment-1',
    path: '/notesRoot/assets/demo.png',
    previewUrl: '',
    assetUrl: '',
    name: 'demo.png',
    type: 'image/png',
    size: 123,
  };
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
          { id: 'session-2', title: 'Second', modelId: model.id, createdAt: 2, updatedAt: 2 },
        ],
        messages: {
          'session-2': [
            createMessage('s2-user', 'user', 'session two visible prompt'),
            createMessage('s2-assistant', 'assistant', 'session two visible answer'),
          ],
        },
        unreadSessionIds: [],
        selectedModelId: model.id,
        currentSessionId: 'session-2',
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

describe('useChatService attachment cancellation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocked.convertToBase64.mockResolvedValue(IMAGE_DATA_URL);
    mocked.deleteAttachment.mockResolvedValue(undefined);
    useNotesStore.setState({ notesPath: '/notesRoot', starredEntries: [] });
    seedChatState();
  });

  it('does not add chat messages when stopped during pre-send image conversion', async () => {
    let resolveConversion!: (value: string) => void;
    mocked.convertToBase64.mockImplementationOnce(
      () => new Promise<string>((resolve) => {
        resolveConversion = resolve;
      }),
    );
    const { result } = renderHook(() => useChatService());

    await act(async () => {
      expect(await result.current.sendMessage('describe it', [createDiskImageAttachment()], [])).toBe(true);
    });

    await waitFor(() => {
      expect(convertToBase64).toHaveBeenCalledTimes(1);
      expect(useAIUIStore.getState().generatingSessions).toEqual({ 'session-2': true });
    });

    act(() => {
      result.current.stop();
    });

    await act(async () => {
      resolveConversion(IMAGE_DATA_URL);
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(useAIUIStore.getState().generatingSessions).toEqual({});
    });
    expect(sendMessageWithEndpointFallback).not.toHaveBeenCalled();
    expect(useUnifiedStore.getState().data.ai?.messages['session-2']?.map((message) => message.content)).toEqual([
      'session two visible prompt',
      'session two visible answer',
    ]);
  });
});
