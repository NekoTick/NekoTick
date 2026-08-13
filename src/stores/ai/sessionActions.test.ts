import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChatMessage } from '@/lib/ai/types'
import { deleteSessionJson, saveSessionJson } from '@/lib/storage/chatStorage'
import { deleteStoredAttachmentFile } from '@/lib/storage/attachmentStorage'
import { useUnifiedStore } from '../unified/useUnifiedStore'
import { useAIUIStore } from './chatState'
import { createSessionActions } from './sessionActions'

vi.mock('@/lib/storage/chatStorage', () => ({
  cancelSessionJsonSave: vi.fn(),
  deleteSessionJson: vi.fn(async () => {}),
  hasSessionJson: vi.fn(async () => false),
  loadSessionJson: vi.fn(async () => null),
  saveSessionJson: vi.fn(async () => {}),
  scheduleSessionJsonSave: vi.fn(),
}))

vi.mock('@/lib/storage/attachmentStorage', () => ({
  createStoredAttachmentFromSource: vi.fn(() => null),
  deleteAttachment: vi.fn(async () => {}),
  deleteStoredAttachmentFile: vi.fn(async () => {}),
  persistDataUrlAttachment: vi.fn(async () => null),
}))

function createMessage(id: string, role: ChatMessage['role'], content: string): ChatMessage {
  return {
    id,
    role,
    content,
    modelId: 'model-1',
    timestamp: 10,
    versions: [{
      content,
      createdAt: 10,
      kind: 'original',
      subsequentMessages: [],
    }],
    currentVersionIndex: 0,
  }
}

function seedChat(messages: ChatMessage[]) {
  useUnifiedStore.setState({
    loaded: true,
    data: {
      settings: { ui: {} } as never,
      customIcons: [],
      ai: {
        providers: [],
        models: [],
        benchmarkResults: {},
        fetchedModels: {},
        sessions: [{ id: 'session-1', title: 'Original chat', modelId: 'model-1', createdAt: 1, updatedAt: 1 }],
        messages: { 'session-1': messages },
        unreadSessionIds: [],
        selectedModelId: 'model-1',
        currentSessionId: 'session-1',
        temporaryChatEnabled: false,
        customSystemPrompt: '',
        includeTimeContext: true,
        webSearchEnabled: false,
      },
    },
    undoStack: [],
  })

  useAIUIStore.setState({
    generatingSessions: {},
    unreadSessions: {},
    error: null,
    currentSessionId: 'session-1',
    temporaryChatEnabled: false,
    selectionInitialized: true,
    temporaryReturnSessionId: null,
    authPromptSessionId: null,
  })
}

describe('session actions conversation branching', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('restores the available model saved on the switched session', async () => {
    useUnifiedStore.setState({
      loaded: true,
      data: {
        settings: { ui: {} } as never,
        customIcons: [],
        ai: {
          providers: [{
            id: 'provider-1',
            name: 'Provider',
            type: 'newapi',
            apiHost: 'https://example.com',
            apiKey: '',
            enabled: true,
            createdAt: 1,
            updatedAt: 1,
          }],
          models: [
            {
              id: 'model-default',
              apiModelId: 'default',
              name: 'Default',
              providerId: 'provider-1',
              enabled: true,
              createdAt: 1,
            },
            {
              id: 'model-a',
              apiModelId: 'model-a',
              name: 'Model A',
              providerId: 'provider-1',
              enabled: true,
              createdAt: 1,
            },
          ],
          benchmarkResults: {},
          fetchedModels: {},
          sessions: [
            { id: 'session-1', title: 'Default chat', modelId: 'model-default', createdAt: 1, updatedAt: 1 },
            { id: 'session-2', title: 'Model A chat', modelId: 'model-a', createdAt: 2, updatedAt: 2 },
          ],
          messages: { 'session-1': [], 'session-2': [] },
          unreadSessionIds: [],
          selectedModelId: 'model-default',
          currentSessionId: 'session-1',
          temporaryChatEnabled: false,
          customSystemPrompt: '',
          includeTimeContext: true,
          webSearchEnabled: false,
        },
      },
      undoStack: [],
    })

    useAIUIStore.setState({
      generatingSessions: {},
      unreadSessions: {},
      error: null,
      currentSessionId: 'session-1',
      temporaryChatEnabled: false,
      selectionInitialized: true,
      temporaryReturnSessionId: null,
      authPromptSessionId: null,
    })

    await createSessionActions().switchSession('session-2')

    expect(useUnifiedStore.getState().data.ai?.selectedModelId).toBe('model-a')
  })

  it('forks a standalone chat through the selected assistant reply', () => {
    const user = createMessage('user-1', 'user', 'Prompt')
    user.requestContext = {
      text: 'Prompt with attachment context',
      imageSources: ['attachment://context.png'],
    }
    user.webSearchStatuses = [{ phase: 'searching' }]
    user.versions[0] = {
      ...user.versions[0]!,
      requestContext: user.requestContext,
      webSearchStatuses: user.webSearchStatuses,
    }
    const assistant = {
      ...createMessage('assistant-1', 'assistant', 'Answer'),
      versions: [{
        content: 'Answer',
        createdAt: 10,
        kind: 'original' as const,
        subsequentMessages: [createMessage('hidden-user', 'user', 'Hidden branch')],
      }],
    }
    const later = createMessage('user-2', 'user', 'Later prompt')
    seedChat([user, assistant, later])

    const forkedSessionId = createSessionActions().forkSessionFromMessage('session-1', 'assistant-1')

    expect(forkedSessionId).toMatch(/^session-/)
    const ai = useUnifiedStore.getState().data.ai!
    const forkedSession = ai.sessions.find((session) => session.id === forkedSessionId)
    expect(forkedSession?.title).toBe('Original chat 1')
    expect(useAIUIStore.getState().currentSessionId).toBe(forkedSessionId)

    const forkedMessages = ai.messages[forkedSessionId!]
    expect(forkedMessages).toHaveLength(2)
    expect(forkedMessages.map((message) => message.content)).toEqual(['Prompt', 'Answer'])
    expect(forkedMessages.map((message) => message.id)).not.toEqual(['user-1', 'assistant-1'])
    expect(forkedMessages[0]?.requestContext).toEqual(user.requestContext)
    expect(forkedMessages[0]?.requestContext).not.toBe(user.requestContext)
    expect(forkedMessages[0]?.versions[0]?.requestContext).toEqual(user.requestContext)
    expect(forkedMessages[0]?.versions[0]?.webSearchStatuses).toEqual(user.webSearchStatuses)
    expect(forkedMessages[1]?.versions).toEqual([{
      content: 'Answer',
      createdAt: 10,
      kind: 'original',
      subsequentMessages: [],
    }])
    expect(ai.messages['session-1']).toHaveLength(3)
    expect(saveSessionJson).toHaveBeenCalledWith(forkedSessionId, forkedMessages)

    const secondForkedSessionId = createSessionActions().forkSessionFromMessage('session-1', 'assistant-1')
    const secondAI = useUnifiedStore.getState().data.ai!
    expect(secondAI.sessions.find((session) => session.id === secondForkedSessionId)?.title).toBe('Original chat 2')

    const forkedAssistantId = forkedMessages[1]!.id
    const thirdForkedSessionId = createSessionActions().forkSessionFromMessage(forkedSessionId!, forkedAssistantId)
    const thirdAI = useUnifiedStore.getState().data.ai!
    expect(thirdAI.sessions.find((session) => session.id === thirdForkedSessionId)?.title).toBe('Original chat 3')
  })

  it('deletes stored attachments that are only referenced by the deleted chat', async () => {
    seedChat([createMessage('user-1', 'user', 'Look ![image](<attachment://unique.png>)')])

    await createSessionActions().deleteSession('session-1')

    expect(deleteStoredAttachmentFile).toHaveBeenCalledWith('unique.png')
  })

  it('keeps stored attachments that another chat still references', async () => {
    const sharedImage = 'Look ![image](<attachment://shared.png>)'
    seedChat([createMessage('user-1', 'user', sharedImage)])
    useUnifiedStore.setState((state) => ({
      data: {
        ...state.data,
        ai: {
          ...state.data.ai!,
          sessions: [
            ...state.data.ai!.sessions,
            { id: 'session-2', title: 'Retained', modelId: 'model-1', createdAt: 2, updatedAt: 2 },
          ],
          messages: {
            ...state.data.ai!.messages,
            'session-2': [createMessage('user-2', 'user', sharedImage)],
          },
        },
      },
    }))

    await createSessionActions().deleteSession('session-1')

    expect(deleteStoredAttachmentFile).not.toHaveBeenCalled()
  })

  it('skips attachment deletion when chat state changes during session deletion', async () => {
    seedChat([createMessage('user-1', 'user', 'Look ![image](<attachment://shared.png>)')])
    let finishSessionDelete!: () => void
    vi.mocked(deleteSessionJson).mockImplementationOnce(() => new Promise((resolve) => {
      finishSessionDelete = resolve
    }))

    const deletion = createSessionActions().deleteSession('session-1')
    await vi.waitFor(() => expect(deleteSessionJson).toHaveBeenCalledWith('session-1'))
    useUnifiedStore.setState((state) => ({
      data: {
        ...state.data,
        ai: {
          ...state.data.ai!,
          sessions: [
            ...state.data.ai!.sessions,
            { id: 'session-2', title: 'Retained', modelId: 'model-1', createdAt: 2, updatedAt: 2 },
          ],
          messages: {
            ...state.data.ai!.messages,
            'session-2': [createMessage(
              'user-2',
              'user',
              'Still needed ![image](<attachment://shared.png>)',
            )],
          },
        },
      },
    }))
    finishSessionDelete()

    await deletion

    expect(deleteStoredAttachmentFile).not.toHaveBeenCalled()
  })
})
