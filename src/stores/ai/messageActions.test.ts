import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMessageActions } from './messageActions';
import { useAIUIStore } from './chatState';
import { useUnifiedStore } from '../unified/useUnifiedStore';
import type { ChatMessage } from '@/lib/ai/types';
import { aliasSessionId, clearSessionIdAliases } from '@/lib/ai/sessionIdAliases';
import {
  cancelSessionJsonSave,
  deleteSessionJson,
  saveSessionJson,
  scheduleSessionJsonSave,
} from '@/lib/storage/chatStorage';
import { MAX_CHAT_MESSAGE_IMAGE_SOURCES } from '@/components/Chat/common/messageClipboard';
import { useUIStore } from '@/stores/uiSlice';

vi.mock('@/lib/storage/chatStorage', () => ({
  cancelSessionJsonSave: vi.fn(),
  deleteSessionJson: vi.fn(async () => {}),
  saveSessionJson: vi.fn(async () => {}),
  scheduleSessionJsonSave: vi.fn(),
}));

function createAssistantMessage(): ChatMessage {
  const apiTranscript = [{
    role: 'assistant',
    content: 'old answer',
    reasoning_content: 'old hidden reasoning',
  }];
  return {
    id: 'assistant-1',
    role: 'assistant',
    content: 'old answer',
    apiTranscript,
    modelId: 'model-1',
    timestamp: 1,
    versions: [{
      content: 'old answer',
      createdAt: 1,
      kind: 'original' as const,
      subsequentMessages: [],
      apiTranscript,
    }],
    currentVersionIndex: 0,
  };
}

function createUserMessage(id: string, content = id): ChatMessage {
  return {
    id,
    role: 'user',
    content,
    modelId: 'model-1',
    timestamp: 1,
    versions: [{
      content,
      createdAt: 1,
      kind: 'original' as const,
      subsequentMessages: [],
    }],
    currentVersionIndex: 0,
  };
}

function seedMessages(messages: ChatMessage[]) {
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
        messages: { 'session-1': messages },
        unreadSessionIds: [],
        selectedModelId: 'model-1',
        currentSessionId: 'session-1',
        temporaryChatEnabled: false,
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
    currentSessionId: 'session-1',
    temporaryChatEnabled: false,
    selectionInitialized: true,
    temporaryReturnSessionId: null,
  });
}

describe('message actions API transcript handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearSessionIdAliases();
    useUIStore.setState({ languagePreference: 'en' });
  });

  it('stores web search statuses on the active assistant version', () => {
    seedMessages([createAssistantMessage()]);

    createMessageActions().updateMessageWebSearchStatus('session-1', 'assistant-1', {
      phase: 'results',
      query: 'example',
      results: [{
        title: 'Example',
        url: 'https://example.com',
        snippet: 'Result',
        publishedAt: null,
      }],
    });

    const message = useUnifiedStore.getState().data.ai!.messages['session-1'][0];
    expect(message.webSearchStatuses).toEqual([expect.objectContaining({ phase: 'results', query: 'example' })]);
    expect(message.versions[0].webSearchStatuses).toEqual(message.webSearchStatuses);
    expect(message.content).toBe('old answer');
  });

  it('clears the active top-level transcript when adding a regeneration version', () => {
    seedMessages([{
      ...createAssistantMessage(),
      imageSources: ['https://example.com/old.png'],
    }]);

    createMessageActions().addVersion('assistant-1', 'session-1');

    const message = useUnifiedStore.getState().data.ai!.messages['session-1'][0];
    expect(message.content).toBe('');
    expect(message.apiTranscript).toBeUndefined();
    expect(message.imageSources).toEqual([]);
    expect(message.currentVersionIndex).toBe(1);
    expect(message.versions[0].apiTranscript?.[0].reasoning_content).toBe('old hidden reasoning');
    expect(message.versions[1].apiTranscript).toBeUndefined();
  });

  it('branches following messages when regenerating an earlier assistant response', () => {
    const firstUser = createUserMessage('user-1', 'first prompt');
    const firstAssistant = createAssistantMessage();
    const followingUser = createUserMessage('user-2', 'follow-up prompt');
    const followingAssistant = {
      ...createAssistantMessage(),
      id: 'assistant-2',
      content: 'follow-up answer',
      versions: [{
        content: 'follow-up answer',
        createdAt: 2,
        kind: 'original' as const,
        subsequentMessages: [],
      }],
    };
    seedMessages([firstUser, firstAssistant, followingUser, followingAssistant]);
    const actions = createMessageActions();

    const rollbackVersionIndex = actions.addVersion('assistant-1', 'session-1');

    let messages = useUnifiedStore.getState().data.ai!.messages['session-1'];
    expect(rollbackVersionIndex).toBe(0);
    expect(messages.map((message) => message.id)).toEqual(['user-1', 'assistant-1']);
    expect(messages[1].versions[0].subsequentMessages.map((message) => message.id))
      .toEqual(['user-2', 'assistant-2']);

    actions.switchMessageVersion('session-1', 'assistant-1', 0);
    messages = useUnifiedStore.getState().data.ai!.messages['session-1'];
    expect(messages.map((message) => message.id))
      .toEqual(['user-1', 'assistant-1', 'user-2', 'assistant-2']);

    actions.switchMessageVersion('session-1', 'assistant-1', 1);
    messages = useUnifiedStore.getState().data.ai!.messages['session-1'];
    expect(messages.map((message) => message.id)).toEqual(['user-1', 'assistant-1']);
  });

  it('does not add regeneration versions to user messages', () => {
    seedMessages([createUserMessage('user-1', 'prompt')]);

    createMessageActions().addVersion('user-1', 'session-1');

    const message = useUnifiedStore.getState().data.ai!.messages['session-1'][0];
    expect(message.content).toBe('prompt');
    expect(message.currentVersionIndex).toBe(0);
    expect(message.versions).toHaveLength(1);
    expect(message.versions[0].kind).toBe('original');
    expect(saveSessionJson).not.toHaveBeenCalled();
  });

  it('does not schedule session writes for missing or unchanged message updates', () => {
    const assistantMessage = createAssistantMessage();
    seedMessages([assistantMessage]);

    createMessageActions().updateMessage('session-1', 'missing-message', 'new content');
    createMessageActions().updateMessage('session-1', 'assistant-1', 'old answer');
    createMessageActions().updateMessageApiTranscript('session-1', 'missing-message', assistantMessage.apiTranscript || []);
    createMessageActions().updateMessageApiTranscript('session-1', 'assistant-1', assistantMessage.apiTranscript || []);
    createMessageActions().completeMessage('session-1', 'missing-message');

    expect(scheduleSessionJsonSave).not.toHaveBeenCalled();
    expect(saveSessionJson).not.toHaveBeenCalled();
    expect(useUnifiedStore.getState().data.ai?.messages['session-1']).toEqual([assistantMessage]);
  });

  it('updates a streaming tail message without scanning historical message ids', () => {
    const historicalMessage = createUserMessage('historical', 'old prompt');
    Object.defineProperty(historicalMessage, 'id', {
      configurable: true,
      get: () => {
        throw new Error('Historical message id should not be scanned');
      },
    });
    const assistantMessage = createAssistantMessage();
    seedMessages([historicalMessage, assistantMessage]);

    createMessageActions().updateMessage('session-1', 'assistant-1', 'streamed answer');

    const messages = useUnifiedStore.getState().data.ai!.messages['session-1'];
    expect(messages[0]).toBe(historicalMessage);
    expect(messages[1]?.content).toBe('streamed answer');
  });

  it('restores the selected version transcript when switching versions', () => {
    seedMessages([createAssistantMessage()]);
    const actions = createMessageActions();

    actions.addVersion('assistant-1', 'session-1');
    actions.switchMessageVersion('session-1', 'assistant-1', 0);

    const message = useUnifiedStore.getState().data.ai!.messages['session-1'][0];
    expect(message.content).toBe('old answer');
    expect(message.apiTranscript?.[0].reasoning_content).toBe('old hidden reasoning');
  });

  it('can add a regeneration version to legacy messages without version metadata', () => {
    seedMessages([{
      id: 'legacy-assistant',
      role: 'assistant',
      content: 'legacy answer',
      modelId: 'model-1',
      timestamp: 1,
      apiTranscript: [{ role: 'assistant', content: 'legacy answer', reasoning_content: 'hidden' }],
    } as unknown as ChatMessage]);

    createMessageActions().addVersion('legacy-assistant', 'session-1');

    const message = useUnifiedStore.getState().data.ai!.messages['session-1'][0];
    expect(message.content).toBe('');
    expect(message.currentVersionIndex).toBe(1);
    expect(message.versions[0]).toMatchObject({
      content: 'legacy answer',
      createdAt: 1,
      apiTranscript: [{ role: 'assistant', content: 'legacy answer', reasoning_content: 'hidden' }],
    });
  });

  it('can edit and branch legacy messages without version metadata', () => {
    seedMessages([
      {
        id: 'legacy-user',
        role: 'user',
        content: 'legacy prompt',
        modelId: 'model-1',
        timestamp: 1,
      } as unknown as ChatMessage,
      createAssistantMessage(),
    ]);

    createMessageActions().editMessageAndBranch('session-1', 'legacy-user', 'edited prompt');

    const messages = useUnifiedStore.getState().data.ai!.messages['session-1'];
    expect(messages).toHaveLength(1);
    expect(messages[0].content).toBe('edited prompt');
    expect(messages[0].currentVersionIndex).toBe(1);
    expect(messages[0].versions[0].subsequentMessages[0].id).toBe('assistant-1');
  });

  it('does not edit and branch assistant messages', () => {
    seedMessages([createAssistantMessage(), createUserMessage('future-1')]);

    createMessageActions().editMessageAndBranch('session-1', 'assistant-1', 'edited answer');

    const messages = useUnifiedStore.getState().data.ai!.messages['session-1'];
    expect(messages).toHaveLength(2);
    expect(messages[0].content).toBe('old answer');
    expect(messages[0].currentVersionIndex).toBe(0);
    expect(messages[0].versions).toHaveLength(1);
  });

  it('does not switch assistant messages to edit versions', () => {
    seedMessages([{
      ...createAssistantMessage(),
      versions: [
        {
          content: 'old answer',
          createdAt: 1,
          kind: 'original' as const,
          subsequentMessages: [],
        },
        {
          content: 'bad edit version',
          createdAt: 2,
          kind: 'edit' as const,
          subsequentMessages: [],
        },
      ],
      currentVersionIndex: 0,
    }]);

    createMessageActions().switchMessageVersion('session-1', 'assistant-1', 1);

    const message = useUnifiedStore.getState().data.ai!.messages['session-1'][0];
    expect(message.content).toBe('old answer');
    expect(message.currentVersionIndex).toBe(0);
  });

  it('does not switch user messages to regeneration versions', () => {
    seedMessages([{
      ...createUserMessage('user-1', 'prompt'),
      versions: [
        {
          content: 'prompt',
          createdAt: 1,
          kind: 'original' as const,
          subsequentMessages: [],
        },
        {
          content: 'bad regeneration version',
          createdAt: 2,
          kind: 'regeneration' as const,
          subsequentMessages: [],
        },
      ],
      currentVersionIndex: 0,
    }]);

    createMessageActions().switchMessageVersion('session-1', 'user-1', 1);

    const message = useUnifiedStore.getState().data.ai!.messages['session-1'][0];
    expect(message.content).toBe('prompt');
    expect(message.currentVersionIndex).toBe(0);
  });

  it('limits retained message versions while preserving the active version', () => {
    seedMessages([createAssistantMessage()]);
    const actions = createMessageActions();
    let rollbackVersionIndex: number | undefined;

    for (let index = 0; index < 25; index += 1) {
      rollbackVersionIndex = actions.addVersion('assistant-1', 'session-1');
    }

    const message = useUnifiedStore.getState().data.ai!.messages['session-1'][0];
    expect(message.versions).toHaveLength(20);
    expect(message.currentVersionIndex).toBe(19);
    expect(message.content).toBe('');
    expect(rollbackVersionIndex).toBe(18);
  });

  it('returns the retained rollback version when editing at the version limit', () => {
    const userMessage = createUserMessage('user-1', 'prompt 19');
    userMessage.versions = Array.from({ length: 20 }, (_, index) => ({
      content: `prompt ${index}`,
      createdAt: index + 1,
      kind: index === 0 ? 'original' as const : 'edit' as const,
      subsequentMessages: [],
    }));
    userMessage.currentVersionIndex = 19;
    seedMessages([userMessage]);

    const rollbackVersionIndex = createMessageActions()
      .editMessageAndBranch('session-1', 'user-1', 'edited prompt');

    const message = useUnifiedStore.getState().data.ai!.messages['session-1'][0];
    expect(message.versions).toHaveLength(20);
    expect(message.currentVersionIndex).toBe(19);
    expect(rollbackVersionIndex).toBe(18);
  });

  it('limits branched subsequent messages and strips deeper nested branches', () => {
    const nestedAssistant: ChatMessage = {
      ...createAssistantMessage(),
      id: 'nested-assistant',
      versions: [{
        content: 'nested',
        createdAt: 1,
        kind: 'original' as const,
        subsequentMessages: [createUserMessage('deep-1')],
      }],
    };
    seedMessages([
      createUserMessage('prompt-1', 'prompt'),
      ...Array.from({ length: 120 }, (_, index) =>
        index === 0 ? nestedAssistant : createUserMessage(`future-${index}`)
      ),
    ]);

    createMessageActions().editMessageAndBranch('session-1', 'prompt-1', 'edited prompt');

    const message = useUnifiedStore.getState().data.ai!.messages['session-1'][0];
    const branch = message.versions[0].subsequentMessages;
    expect(branch).toHaveLength(100);
    expect(branch[0].id).toBe('nested-assistant');
    expect(branch[0].versions[0].subsequentMessages).toEqual([]);
  });

  it('normalizes transcripts at the message mutation boundary', () => {
    seedMessages([createAssistantMessage()]);

    createMessageActions().updateMessageApiTranscript('session-1', 'assistant-1', [
      { role: 'assistant', content: 'new answer', reasoning_content: 'hidden' },
      { role: 'tool', content: 'missing tool id' },
      { role: 'tool', tool_call_id: 'call-1', content: 'result' },
      { role: 'invalid', content: 'bad' },
    ]);

    const message = useUnifiedStore.getState().data.ai!.messages['session-1'][0];
    expect(message.apiTranscript).toEqual([
      { role: 'assistant', content: 'new answer', reasoning_content: 'hidden' },
    ]);
    expect(message.versions[0].apiTranscript).toEqual(message.apiTranscript);
  });

  it('routes added messages through promoted temporary session aliases', () => {
    seedMessages([]);
    aliasSessionId('temp-session-1', 'session-1');

    const addedId = createMessageActions().addMessage({
      role: 'user',
      content: 'after promotion',
      modelId: 'model-1',
    }, 'temp-session-1');

    const ai = useUnifiedStore.getState().data.ai!;
    expect(addedId).toMatch(/^msg-/);
    expect(ai.messages['session-1']).toHaveLength(1);
    expect(ai.messages['session-1'][0].content).toBe('after promotion');
    expect(ai.messages['temp-session-1']).toBeUndefined();
    expect(saveSessionJson).toHaveBeenCalledWith('session-1', ai.messages['session-1']);
  });

  it('stores the model used by new messages on the session', () => {
    seedMessages([]);

    createMessageActions().addMessage({
      role: 'user',
      content: 'use another model',
      modelId: 'model-2',
    }, 'session-1');

    expect(useUnifiedStore.getState().data.ai?.sessions[0]?.modelId).toBe('model-2');
  });

  it('assigns a unique id when adding a message with a duplicate id', () => {
    seedMessages([createUserMessage('duplicate', 'existing')]);

    const addedId = createMessageActions().addMessage({
      id: 'duplicate',
      role: 'user',
      content: 'new',
      modelId: 'model-1',
    }, 'session-1');

    const messages = useUnifiedStore.getState().data.ai!.messages['session-1'];
    expect(addedId).toMatch(/^msg-/);
    expect(messages.map((message) => message.id)).toEqual(['duplicate', addedId]);
    expect(new Set(messages.map((message) => message.id))).toHaveLength(2);
  });

  it('checks hidden version branch ids before adding a message', () => {
    seedMessages([{
      ...createUserMessage('prompt-1', 'prompt'),
      versions: [{
        content: 'prompt',
        createdAt: 1,
        kind: 'original',
        subsequentMessages: [createAssistantMessage()],
      }],
    }]);

    const addedId = createMessageActions().addMessage({
      id: 'assistant-1',
      role: 'assistant',
      content: 'new answer',
      modelId: 'model-1',
    }, 'session-1');

    const messages = useUnifiedStore.getState().data.ai!.messages['session-1'];
    expect(addedId).toMatch(/^msg-/);
    expect(messages[1].id).toBe(addedId);
    expect(messages[0].versions[0].subsequentMessages[0].id).toBe('assistant-1');
  });

  it('normalizes provided message ids before storing them', () => {
    seedMessages([]);

    const addedId = createMessageActions().addMessage({
      id: `  ${'x'.repeat(600)}  `,
      role: 'user',
      content: 'new',
      modelId: 'model-1',
    }, 'session-1');

    const messages = useUnifiedStore.getState().data.ai!.messages['session-1'];
    expect(addedId).toBe('x'.repeat(512));
    expect(messages[0].id).toBe(addedId);
  });

  it('generates an id when a provided message id is blank', () => {
    seedMessages([]);

    const addedId = createMessageActions().addMessage({
      id: '   ',
      role: 'user',
      content: 'new',
      modelId: 'model-1',
    }, 'session-1');

    const messages = useUnifiedStore.getState().data.ai!.messages['session-1'];
    expect(addedId).toMatch(/^msg-/);
    expect(messages[0].id).toBe(addedId);
  });

  it('derives user message image sources from rendered markdown and raw html image tokens', () => {
    seedMessages([]);

    createMessageActions().addMessage({
      role: 'user',
      content: [
        '<img src="https://example.com/html.png">',
        '![real](https://example.com/markdown.png)',
      ].join('\n'),
      modelId: 'model-1',
    }, 'session-1');

    const message = useUnifiedStore.getState().data.ai!.messages['session-1'][0];
    expect(message.imageSources).toEqual([
      'https://example.com/html.png',
      'https://example.com/markdown.png',
    ]);
  });

  it('does not cache relative or bare images as user message image sources', () => {
    seedMessages([]);

    createMessageActions().addMessage({
      role: 'user',
      content: [
        '![local](images/demo.png)',
        '![bare](demo.png)',
      ].join('\n'),
      modelId: 'model-1',
    }, 'session-1');

    const message = useUnifiedStore.getState().data.ai!.messages['session-1'][0];
    expect(message.imageSources).toEqual([]);
  });

  it('does not cache video markdown as user message image sources', () => {
    seedMessages([]);

    createMessageActions().addMessage({
      role: 'user',
      content: [
        '![video](https://example.com/movie.mp4)',
        '![real](https://example.com/photo.png)',
      ].join('\n'),
      modelId: 'model-1',
    }, 'session-1');

    const message = useUnifiedStore.getState().data.ai!.messages['session-1'][0];
    expect(message.imageSources).toEqual(['https://example.com/photo.png']);
  });

  it('filters user message image source caches before storing', () => {
    seedMessages([]);

    createMessageActions().addMessage({
      role: 'user',
      content: [
        '![unsafe](http://127.0.0.1:3000/secret.png)',
        '![safe](attachment://safe.png)',
      ].join('\n'),
      imageSources: [
        'https://example.com/stale.png',
        'http://127.0.0.1:3000/secret.png',
        'data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+',
        'https://example.com/movie.mp4',
        'attachment://safe.png',
      ],
      modelId: 'model-1',
    }, 'session-1');

    const message = useUnifiedStore.getState().data.ai!.messages['session-1'][0];
    expect(message.imageSources).toEqual(['attachment://safe.png']);
  });

  it('bounds stored user message image source caches', () => {
    seedMessages([]);

    createMessageActions().addMessage({
      role: 'user',
      content: Array.from(
        { length: MAX_CHAT_MESSAGE_IMAGE_SOURCES + 1 },
        (_, index) => `![image ${index}](https://example.com/${index}.png)`,
      ).join('\n'),
      modelId: 'model-1',
    }, 'session-1');

    const message = useUnifiedStore.getState().data.ai!.messages['session-1'][0];
    expect(message.imageSources).toHaveLength(MAX_CHAT_MESSAGE_IMAGE_SOURCES);
    expect(message.imageSources?.at(-1)).toBe(`https://example.com/${MAX_CHAT_MESSAGE_IMAGE_SOURCES - 1}.png`);
  });

  it('keeps assistant html images in derived message image sources', () => {
    seedMessages([createAssistantMessage()]);

    createMessageActions().updateMessage(
      'session-1',
      'assistant-1',
      '<img src="https://example.com/html.png">\n![real](https://example.com/markdown.png)',
    );

    const message = useUnifiedStore.getState().data.ai!.messages['session-1'][0];
    expect(message.imageSources).toEqual([
      'https://example.com/html.png',
      'https://example.com/markdown.png',
    ]);
  });

  it('does not cache assistant video sources as image sources', () => {
    seedMessages([createAssistantMessage()]);

    createMessageActions().updateMessage(
      'session-1',
      'assistant-1',
      '<img src="https://example.com/movie.mp4">\n![real](https://example.com/markdown.png)',
    );

    const message = useUnifiedStore.getState().data.ai!.messages['session-1'][0];
    expect(message.imageSources).toEqual(['https://example.com/markdown.png']);
  });

  it('keeps user edit version image sources aligned with rendered attachments', () => {
    seedMessages([createUserMessage('prompt-1', 'initial'), createAssistantMessage()]);

    createMessageActions().editMessageAndBranch(
      'session-1',
      'prompt-1',
      '<img src="https://example.com/html.png">\n![real](https://example.com/markdown.png)',
    );

    const message = useUnifiedStore.getState().data.ai!.messages['session-1'][0];
    expect(message.imageSources).toEqual([
      'https://example.com/html.png',
      'https://example.com/markdown.png',
    ]);
  });

  it('routes version mutations through promoted temporary session aliases', () => {
    seedMessages([
      createUserMessage('prompt-1', 'prompt'),
      createAssistantMessage(),
    ]);
    const actions = createMessageActions();
    aliasSessionId('temp-session-1', 'session-1');

    actions.addVersion('assistant-1', 'temp-session-1');
    actions.switchMessageVersion('temp-session-1', 'assistant-1', 0);
    actions.editMessageAndBranch('temp-session-1', 'prompt-1', 'edited prompt');

    const ai = useUnifiedStore.getState().data.ai!;
    expect(ai.messages['temp-session-1']).toBeUndefined();
    expect(ai.messages['session-1']).toHaveLength(1);
    expect(ai.messages['session-1'][0].content).toBe('edited prompt');
    expect(ai.messages['session-1'][0].currentVersionIndex).toBe(1);
    expect(ai.messages['session-1'][0].versions[0].subsequentMessages[0].id).toBe('assistant-1');
  });

  it('retracts a trailing pending composer request with an empty assistant placeholder', () => {
    seedMessages([
      createUserMessage('prompt-1', 'pending prompt'),
      {
        ...createAssistantMessage(),
        id: 'assistant-1',
        content: '',
        apiTranscript: undefined,
        versions: [{
          content: '',
          createdAt: 1,
          kind: 'original' as const,
          subsequentMessages: [],
        }],
      },
    ]);

    const recalled = createMessageActions().retractPendingUserRequest(
      'session-1',
      'prompt-1',
      'assistant-1',
    );

    const ai = useUnifiedStore.getState().data.ai!;
    expect(recalled).toBe('pending prompt');
    expect(ai.messages['session-1']).toEqual([]);
    expect(saveSessionJson).toHaveBeenCalledWith('session-1', [], { mergePersisted: false });
  });

  it('rolls an auto-created empty chat back to the new chat state after retracting its first request', () => {
    seedMessages([
      createUserMessage('prompt-1', 'pending prompt'),
      {
        ...createAssistantMessage(),
        id: 'assistant-1',
        content: '',
        apiTranscript: undefined,
        versions: [{
          content: '',
          createdAt: 1,
          kind: 'original' as const,
          subsequentMessages: [],
        }],
      },
    ]);
    useUnifiedStore.setState((state) => ({
      data: {
        ...state.data,
        ai: {
          ...state.data.ai!,
          sessions: state.data.ai!.sessions.map((session) =>
            session.id === 'session-1' ? { ...session, title: '' } : session
          ),
        },
      },
    }));

    const recalled = createMessageActions().retractPendingUserRequest(
      'session-1',
      'prompt-1',
      'assistant-1',
    );

    const ai = useUnifiedStore.getState().data.ai!;
    const ui = useAIUIStore.getState();
    expect(recalled).toBe('pending prompt');
    expect(ai.sessions.some((session) => session.id === 'session-1')).toBe(false);
    expect(ai.messages['session-1']).toBeUndefined();
    expect(ui.currentSessionId).toBeNull();
    expect(cancelSessionJsonSave).toHaveBeenCalledWith('session-1');
    expect(deleteSessionJson).toHaveBeenCalledWith('session-1');
    expect(saveSessionJson).not.toHaveBeenCalled();
  });

  it('retracts a pending composer request while the assistant only has status and thinking content', () => {
    seedMessages([
      createUserMessage('prompt-1', 'pending prompt'),
      {
        ...createAssistantMessage(),
        id: 'assistant-1',
        content: '<think>planning',
        webSearchStatuses: [{ phase: 'searching' }],
        apiTranscript: undefined,
        versions: [{
          content: '<think>planning',
          webSearchStatuses: [{ phase: 'searching' }],
          createdAt: 1,
          kind: 'original' as const,
          subsequentMessages: [],
        }],
      },
    ]);

    const recalled = createMessageActions().retractPendingUserRequest(
      'session-1',
      'prompt-1',
      'assistant-1',
    );

    expect(recalled).toBe('pending prompt');
    expect(useUnifiedStore.getState().data.ai!.messages['session-1']).toEqual([]);
  });

  it('does not retract after an assistant reply resembling the former retry status', () => {
    useUIStore.setState({ languagePreference: 'zh-CN' });
    seedMessages([
      createUserMessage('prompt-1', 'pending prompt'),
      {
        ...createAssistantMessage(),
        id: 'assistant-1',
        content: 'Service unavailable\n10秒后重试 - 第1次重试',
        apiTranscript: undefined,
        versions: [{
          content: 'Service unavailable\n10秒后重试 - 第1次重试',
          createdAt: 1,
          kind: 'original' as const,
          subsequentMessages: [],
        }],
      },
    ]);

    const recalled = createMessageActions().retractPendingUserRequest(
      'session-1',
      'prompt-1',
      'assistant-1',
    );

    expect(recalled).toBeNull();
    expect(useUnifiedStore.getState().data.ai!.messages['session-1']).toHaveLength(2);
  });

  it('does not retract a composer request after visible assistant content arrives', () => {
    seedMessages([
      createUserMessage('prompt-1', 'pending prompt'),
      {
        ...createAssistantMessage(),
        id: 'assistant-1',
        content: '<think>planning</think>visible answer',
        apiTranscript: undefined,
        versions: [{
          content: '<think>planning</think>visible answer',
          createdAt: 1,
          kind: 'original' as const,
          subsequentMessages: [],
        }],
      },
    ]);

    const recalled = createMessageActions().retractPendingUserRequest(
      'session-1',
      'prompt-1',
      'assistant-1',
    );

    const messages = useUnifiedStore.getState().data.ai!.messages['session-1'];
    expect(recalled).toBeNull();
    expect(messages).toHaveLength(2);
    expect(messages[0].content).toBe('pending prompt');
    expect(messages[1].content).toBe('<think>planning</think>visible answer');
    expect(saveSessionJson).not.toHaveBeenCalled();
  });

  it('retracts a trailing user message before the assistant placeholder exists', () => {
    seedMessages([createUserMessage('prompt-1', 'pending prompt')]);

    const recalled = createMessageActions().retractPendingUserRequest(
      'session-1',
      'prompt-1',
      null,
    );

    expect(recalled).toBe('pending prompt');
    expect(useUnifiedStore.getState().data.ai!.messages['session-1']).toEqual([]);
  });

  it('routes pending request retractions through promoted temporary session aliases', () => {
    seedMessages([
      createUserMessage('prompt-1', 'pending prompt'),
      {
        ...createAssistantMessage(),
        id: 'assistant-1',
        content: '',
        apiTranscript: undefined,
        versions: [{
          content: '',
          createdAt: 1,
          kind: 'original' as const,
          subsequentMessages: [],
        }],
      },
    ]);
    aliasSessionId('temp-session-1', 'session-1');

    const recalled = createMessageActions().retractPendingUserRequest(
      'temp-session-1',
      'prompt-1',
      'assistant-1',
    );

    const ai = useUnifiedStore.getState().data.ai!;
    expect(recalled).toBe('pending prompt');
    expect(ai.messages['temp-session-1']).toBeUndefined();
    expect(ai.messages['session-1']).toEqual([]);
  });

  it('does not recreate orphan message buckets for deleted sessions', () => {
    seedMessages([]);
    useUnifiedStore.setState((state) => ({
      data: {
        ...state.data,
        ai: {
          ...state.data.ai!,
          sessions: [],
          messages: {},
        },
      },
    }));
    const actions = createMessageActions();

    actions.addMessage({
      role: 'user',
      content: 'stale user message',
      modelId: 'model-1',
    }, 'session-1');
    actions.updateMessage('session-1', 'assistant-1', 'stale stream chunk');
    actions.updateMessageApiTranscript('session-1', 'assistant-1', [
      { role: 'assistant', content: 'stale transcript' },
    ]);
    actions.completeMessage('session-1', 'assistant-1');
    actions.addVersion('assistant-1', 'session-1');
    actions.editMessageAndBranch('session-1', 'prompt-1', 'edited after delete');
    actions.switchMessageVersion('session-1', 'assistant-1', 0);
    actions.retractPendingUserRequest('session-1', 'prompt-1', 'assistant-1');

    const ai = useUnifiedStore.getState().data.ai!;
    expect(ai.messages).toEqual({});
    expect(saveSessionJson).not.toHaveBeenCalled();
  });
});
