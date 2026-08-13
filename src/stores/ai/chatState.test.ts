import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAIChatSession, useAIUIStore } from './chatState';
import { useUnifiedStore } from '../unified/useUnifiedStore';
import { aliasSessionId, clearSessionIdAliases } from '@/lib/ai/sessionIdAliases';

const mocked = vi.hoisted(() => ({
  saveSessionJson: vi.fn(async () => {}),
}));

vi.mock('@/lib/storage/chatStorage', () => ({
  saveSessionJson: mocked.saveSessionJson,
}));

describe('AI chat UI state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocked.saveSessionJson.mockResolvedValue(undefined);
  });

  afterEach(() => {
    clearSessionIdAliases();
    useAIUIStore.setState({
      generatingSessions: {},
      unreadSessions: {},
      error: null,
      currentSessionId: null,
      temporaryChatEnabled: false,
      selectionInitialized: false,
      temporaryReturnSessionId: null,
      authPromptSessionId: null,
    });
  });

  it('removes completed generation sessions instead of retaining false entries', () => {
    const store = useAIUIStore.getState();

    store.setSessionLoading('session-1', true);
    expect(useAIUIStore.getState().generatingSessions).toEqual({
      'session-1': true,
    });

    store.setSessionLoading('session-1', false);
    expect(useAIUIStore.getState().generatingSessions).toEqual({});
  });

  it('moves auth prompt state with promoted sessions', () => {
    const store = useAIUIStore.getState();

    store.setAuthPromptSessionId('temp-session-1');
    store.moveSessionState('temp-session-1', 'session-1');

    expect(useAIUIStore.getState().authPromptSessionId).toBe('session-1');
  });

  it('resolves session aliases when setting auth prompt state', () => {
    aliasSessionId('temp-session-1', 'session-1');

    useAIUIStore.getState().setAuthPromptSessionId('temp-session-1');

    expect(useAIUIStore.getState().authPromptSessionId).toBe('session-1');
  });

  it('resolves session aliases when marking sessions unread', () => {
    aliasSessionId('temp-session-1', 'session-1');
    useUnifiedStore.setState({
      loaded: true,
      data: {
        settings: {} as never,
        customIcons: [],
        ai: {
          providers: [],
          models: [],
          benchmarkResults: {},
          fetchedModels: {},
          sessions: [{ id: 'session-1', title: 'Chat', modelId: 'model-1', createdAt: 1, updatedAt: 1 }],
          messages: { 'session-1': [] },
          unreadSessionIds: [],
          selectedModelId: 'model-1',
          currentSessionId: null,
          temporaryChatEnabled: false,
          customSystemPrompt: '',
          includeTimeContext: true,
        },
      },
      undoStack: [],
    });

    useAIUIStore.getState().markSessionUnread('temp-session-1');

    expect(useAIUIStore.getState().unreadSessions).toEqual({ 'session-1': true });
    expect(useUnifiedStore.getState().data.ai?.unreadSessionIds).toEqual(['session-1']);
  });

  it('resolves session aliases when marking sessions read', () => {
    aliasSessionId('temp-session-1', 'session-1');
    useAIUIStore.setState({
      unreadSessions: { 'session-1': true },
    });
    useUnifiedStore.setState({
      loaded: true,
      data: {
        settings: {} as never,
        customIcons: [],
        ai: {
          providers: [],
          models: [],
          benchmarkResults: {},
          fetchedModels: {},
          sessions: [{ id: 'session-1', title: 'Chat', modelId: 'model-1', createdAt: 1, updatedAt: 1 }],
          messages: { 'session-1': [] },
          unreadSessionIds: ['session-1'],
          selectedModelId: 'model-1',
          currentSessionId: null,
          temporaryChatEnabled: false,
          customSystemPrompt: '',
          includeTimeContext: true,
        },
      },
      undoStack: [],
    });

    useAIUIStore.getState().markSessionRead('temp-session-1');

    expect(useAIUIStore.getState().unreadSessions).toEqual({});
    expect(useUnifiedStore.getState().data.ai?.unreadSessionIds).toEqual([]);
  });

  it('clears auth prompt state when a session is discarded', () => {
    const store = useAIUIStore.getState();

    store.setAuthPromptSessionId('temp-session-1');
    store.clearSessionState('temp-session-1');

    expect(useAIUIStore.getState().authPromptSessionId).toBeNull();
  });

  it('keeps a newly created chat in memory when the initial session save rejects', async () => {
    mocked.saveSessionJson.mockRejectedValueOnce(new Error('disk busy'));
    useUnifiedStore.setState({
      loaded: true,
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
          selectedModelId: 'model-1',
          currentSessionId: null,
          temporaryChatEnabled: false,
          customSystemPrompt: '',
          includeTimeContext: true,
        },
      },
      undoStack: [],
    });

    const sessionId = createAIChatSession('New Chat');
    await Promise.resolve();

    const ai = useUnifiedStore.getState().data.ai;
    expect(ai?.sessions[0]?.id).toBe(sessionId);
    expect(ai?.messages[sessionId]).toEqual([]);
    expect(useAIUIStore.getState().currentSessionId).toBe(sessionId);
    expect(mocked.saveSessionJson).toHaveBeenCalledWith(sessionId, []);
  });
});
