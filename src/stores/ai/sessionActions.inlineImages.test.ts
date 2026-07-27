import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChatMessage } from '@/lib/ai/types'
import type { Attachment } from '@/lib/storage/attachmentStorage'
import { useUnifiedStore } from '../unified/useUnifiedStore'
import { useAIUIStore } from './chatState'

const mocked = vi.hoisted(() => ({
  parseMarkdownAndHtmlImageTokens: vi.fn(),
  persistDataUrlAttachment: vi.fn(async (_source: string) => 'attachment://persisted.png'),
  saveSessionJson: vi.fn(async () => {}),
  loadSessionJson: vi.fn(async (): Promise<ChatMessage[] | null> => []),
  hasSessionJson: vi.fn(async () => false),
  deleteAttachment: vi.fn(async () => {}),
  createStoredAttachmentFromSource: vi.fn((src: string): Attachment | null => ({
    id: 'stored-attachment',
    path: '',
    previewUrl: src,
    assetUrl: src,
    name: 'persisted.png',
    type: 'image/png',
    size: 0,
  })),
}))

vi.mock('@/components/Chat/common/messageImageTokens', () => ({
  parseMarkdownAndHtmlImageTokens: mocked.parseMarkdownAndHtmlImageTokens,
}))

vi.mock('@/lib/storage/attachmentStorage', () => ({
  persistDataUrlAttachment: mocked.persistDataUrlAttachment,
  deleteAttachment: mocked.deleteAttachment,
  createStoredAttachmentFromSource: mocked.createStoredAttachmentFromSource,
}))

vi.mock('@/lib/storage/chatStorage', () => ({
  cancelSessionJsonSave: vi.fn(),
  deleteSessionJson: vi.fn(async () => {}),
  hasSessionJson: mocked.hasSessionJson,
  loadSessionJson: mocked.loadSessionJson,
  saveSessionJson: mocked.saveSessionJson,
}))

function createMessage(id: string, content: string): ChatMessage {
  return {
    id,
    role: 'user',
    content,
    modelId: 'model-1',
    timestamp: 1,
    versions: [{
      content,
      createdAt: 1,
      kind: 'original',
      subsequentMessages: [],
    }],
    currentVersionIndex: 0,
  }
}

function seedSession(messages: ChatMessage[]) {
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
        sessions: [
          { id: 'session-1', title: 'First', modelId: 'model-1', createdAt: 1, updatedAt: 1 },
          { id: 'session-2', title: 'Second', modelId: 'model-1', createdAt: 2, updatedAt: 2 },
        ],
        messages: {
          'session-1': [],
          'session-2': messages,
        },
        unreadSessionIds: [],
        selectedModelId: 'model-1',
        currentSessionId: 'session-1',
        temporaryChatEnabled: false,
        customSystemPrompt: '',
        includeTimeContext: true,
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

describe('session inline image persistence', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    mocked.persistDataUrlAttachment.mockResolvedValue('attachment://persisted.png')
    mocked.createStoredAttachmentFromSource.mockImplementation((src: string) => ({
      id: 'stored-attachment',
      path: '',
      previewUrl: src,
      assetUrl: src,
      name: 'persisted.png',
      type: 'image/png',
      size: 0,
    }))
    mocked.loadSessionJson.mockResolvedValue([])
    mocked.hasSessionJson.mockResolvedValue(false)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('does not parse ordinary long text while switching sessions', async () => {
    const { createSessionActions } = await import('./sessionActions')
    seedSession([createMessage('m1', 'plain text '.repeat(10_000))])

    await createSessionActions().switchSession('session-2')
    await vi.runAllTimersAsync()

    expect(mocked.parseMarkdownAndHtmlImageTokens).not.toHaveBeenCalled()
    expect(mocked.persistDataUrlAttachment).not.toHaveBeenCalled()
  })

  it('coalesces queued inline image persistence for repeated switches before timers run', async () => {
    const { createSessionActions } = await import('./sessionActions')
    const actions = createSessionActions()
    const source = 'data:image/png;base64,INLINE'
    mocked.parseMarkdownAndHtmlImageTokens.mockImplementation((content: string) => {
      const targetStart = content.indexOf(source)
      return targetStart >= 0
        ? [{ start: 0, end: content.length, src: source, targetStart, targetEnd: targetStart + source.length }]
        : []
    })
    seedSession([createMessage('m1', `![image](<${source}>)`)])

    await actions.switchSession('session-2')
    await actions.switchSession('session-2')
    await actions.switchSession('session-2')

    expect(mocked.persistDataUrlAttachment).not.toHaveBeenCalled()
    await vi.runOnlyPendingTimersAsync()
    expect(mocked.persistDataUrlAttachment).toHaveBeenCalledTimes(1)
  })

  it('persists request-context images when a temporary Chat becomes durable', async () => {
    const source = 'data:image/png;base64,INLINE'
    const message = createMessage('m1', 'Inspect this image')
    message.requestContext = { text: 'Inspect this image', imageSources: [source] }
    message.versions[0]!.requestContext = message.requestContext
    const { createSessionActions } = await import('./sessionActions')
    seedSession([message])

    await createSessionActions().switchSession('session-2')
    await vi.runAllTimersAsync()

    const storedMessage = useUnifiedStore.getState().data.ai?.messages['session-2']?.[0]
    expect(mocked.persistDataUrlAttachment).toHaveBeenCalledWith(source)
    expect(storedMessage?.requestContext?.imageSources).toEqual(['attachment://persisted.png'])
    expect(storedMessage?.versions[0]?.requestContext?.imageSources)
      .toEqual(['attachment://persisted.png'])
  })

  it('isolates parser failures from scheduled inline image persistence', async () => {
    const { createSessionActions } = await import('./sessionActions')
    mocked.parseMarkdownAndHtmlImageTokens.mockImplementationOnce(() => {
      throw new Error('parse failed')
    })
    seedSession([createMessage('m1', '![image](<data:image/png;base64,INLINE>)')])

    await createSessionActions().switchSession('session-2')
    await vi.runAllTimersAsync()

    expect(mocked.persistDataUrlAttachment).not.toHaveBeenCalled()
  })

  it('bounds queued inline image persistence across different sessions', async () => {
    const {
      MAX_INLINE_IMAGE_PERSISTENCE_PENDING_SESSIONS,
      createSessionActions,
    } = await import('./sessionActions')
    const targetSessionIds = Array.from(
      { length: MAX_INLINE_IMAGE_PERSISTENCE_PENDING_SESSIONS + 5 },
      (_value, index) => `session-${index + 2}`,
    )
    mocked.parseMarkdownAndHtmlImageTokens.mockImplementation((content: string) => {
      const sourceMatch = content.match(/data:image\/png;base64,[A-Z0-9]+/)
      if (!sourceMatch || sourceMatch.index === undefined) {
        return []
      }
      return [{
        start: 0,
        end: content.length,
        src: sourceMatch[0],
        targetStart: sourceMatch.index,
        targetEnd: sourceMatch.index + sourceMatch[0].length,
      }]
    })
    seedSession([])
    useUnifiedStore.setState((state) => ({
      ...state,
      data: {
        ...state.data,
        ai: state.data.ai
          ? {
              ...state.data.ai,
              sessions: [
                { id: 'session-1', title: 'First', modelId: 'model-1', createdAt: 1, updatedAt: 1 },
                ...targetSessionIds.map((id, index) => ({
                  id,
                  title: `Session ${index + 2}`,
                  modelId: 'model-1',
                  createdAt: index + 2,
                  updatedAt: index + 2,
                })),
              ],
              messages: {
                'session-1': [],
                ...Object.fromEntries(targetSessionIds.map((id, index) => [
                  id,
                  [createMessage(`m-${index}`, `![image](<data:image/png;base64,${String(index).padStart(8, 'A')}>)`)],
                ])),
              },
            }
          : state.data.ai,
      },
    }))
    const actions = createSessionActions()

    for (const sessionId of targetSessionIds) {
      await actions.switchSession(sessionId)
    }

    expect(mocked.persistDataUrlAttachment).not.toHaveBeenCalled()
    await vi.runOnlyPendingTimersAsync()
    expect(mocked.persistDataUrlAttachment).toHaveBeenCalledTimes(MAX_INLINE_IMAGE_PERSISTENCE_PENDING_SESSIONS)
  })

  it('does not recreate a deleted session when switch loading finishes late', async () => {
    const { createSessionActions } = await import('./sessionActions')
    let resolveLoad!: (messages: ChatMessage[]) => void
    mocked.loadSessionJson.mockReturnValue(new Promise((resolve) => {
      resolveLoad = resolve
    }))
    seedSession([])
    useUnifiedStore.setState((state) => ({
      ...state,
      data: {
        ...state.data,
        ai: state.data.ai
          ? {
              ...state.data.ai,
              messages: { 'session-1': [] },
            }
          : state.data.ai,
      },
    }))

    const switchRequest = createSessionActions().switchSession('session-2')
    await vi.waitFor(() => expect(mocked.loadSessionJson).toHaveBeenCalledWith('session-2'))

    useUnifiedStore.setState((state) => ({
      ...state,
      data: {
        ...state.data,
        ai: state.data.ai
          ? {
              ...state.data.ai,
              sessions: state.data.ai.sessions.filter((session) => session.id !== 'session-2'),
              messages: { 'session-1': [] },
            }
          : state.data.ai,
      },
    }))

    resolveLoad([createMessage('stale', 'stale disk')])
    await switchRequest

    expect(useUnifiedStore.getState().data.ai?.messages).toEqual({ 'session-1': [] })
  })

  it('persists inline data images found in markdown content', async () => {
    const source = 'data:image/png;base64,INLINE'
    const plainText = `Plain ${source}`
    const imageMarkdown = `![image](<${source}>)`
    const content = `${plainText}\n\n${imageMarkdown}\n\nDescribe`
    const targetStart = content.lastIndexOf(source)
    mocked.parseMarkdownAndHtmlImageTokens.mockReturnValue([{
      start: content.indexOf(imageMarkdown),
      end: content.indexOf(imageMarkdown) + imageMarkdown.length,
      src: source,
      targetStart,
      targetEnd: targetStart + source.length,
    }])
    const { createSessionActions } = await import('./sessionActions')
    seedSession([createMessage('m1', content)])

    await createSessionActions().switchSession('session-2')
    await vi.runAllTimersAsync()

    expect(mocked.parseMarkdownAndHtmlImageTokens).toHaveBeenCalledWith(content, expect.anything())
    expect(mocked.persistDataUrlAttachment).toHaveBeenCalledWith(source)
    expect(useUnifiedStore.getState().data.ai?.messages['session-2']?.[0]?.content)
      .toBe(`${plainText}\n\n![image](<attachment://persisted.png>)\n\nDescribe`)
  })

  it('keeps inline image replacements in memory when the follow-up session save rejects', async () => {
    const source = 'data:image/png;base64,AQI='
    mocked.parseMarkdownAndHtmlImageTokens.mockImplementation((content: string) => {
      const targetStart = content.indexOf(source)
      return targetStart >= 0
        ? [{ start: 0, end: content.length, src: source, targetStart, targetEnd: targetStart + source.length }]
        : []
    })
    mocked.saveSessionJson.mockRejectedValueOnce(new Error('disk busy'))
    const { createSessionActions } = await import('./sessionActions')
    seedSession([createMessage('m1', `![image](<${source}>)`)])

    await createSessionActions().switchSession('session-2')
    await vi.runOnlyPendingTimersAsync()
    await Promise.resolve()

    expect(useUnifiedStore.getState().data.ai?.messages['session-2']?.[0]?.content)
      .toBe('![image](<attachment://persisted.png>)')
    expect(mocked.saveSessionJson).toHaveBeenCalledWith(
      'session-2',
      useUnifiedStore.getState().data.ai?.messages['session-2'],
    )
  })

  it('removes newly persisted inline attachments when the session is deleted mid-persistence', async () => {
    const source = 'data:image/png;base64,AQI='
    let resolvePersistence!: (value: string) => void
    mocked.parseMarkdownAndHtmlImageTokens.mockImplementation((content: string) => {
      const targetStart = content.indexOf(source)
      return targetStart >= 0
        ? [{ start: 0, end: content.length, src: source, targetStart, targetEnd: targetStart + source.length }]
        : []
    })
    mocked.persistDataUrlAttachment.mockReturnValue(new Promise((resolve) => {
      resolvePersistence = resolve
    }))
    const { createSessionActions } = await import('./sessionActions')
    const actions = createSessionActions()
    seedSession([createMessage('m1', `![image](<${source}>)`)])

    await actions.switchSession('session-2')
    await vi.runOnlyPendingTimersAsync()
    await vi.waitFor(() => expect(mocked.persistDataUrlAttachment).toHaveBeenCalledWith(source))

    await actions.deleteSession('session-2')
    resolvePersistence('attachment://orphan.png')

    await vi.waitFor(() => {
      expect(mocked.deleteAttachment).toHaveBeenCalledWith(expect.objectContaining({
        previewUrl: 'attachment://orphan.png',
        assetUrl: 'attachment://orphan.png',
      }))
    })
    expect(useUnifiedStore.getState().data.ai?.messages['session-2']).toBeUndefined()
    expect(mocked.saveSessionJson).not.toHaveBeenCalledWith('session-2', expect.anything())
  })

  it('limits concurrent orphan inline attachment deletes after a session disappears', async () => {
    const {
      MAX_INLINE_IMAGE_ORPHAN_DELETE_CONCURRENCY,
      createSessionActions,
    } = await import('./sessionActions')
    const sources = Array.from(
      { length: MAX_INLINE_IMAGE_ORPHAN_DELETE_CONCURRENCY + 3 },
      (_value, index) => `data:image/png;base64,${String(index).padStart(8, 'A')}`,
    )
    const lastSource = sources.at(-1)!
    let resolveLastPersistence!: (value: string) => void
    let activeDeletes = 0
    let maxActiveDeletes = 0
    const resolveDeletes: Array<() => void> = []

    mocked.parseMarkdownAndHtmlImageTokens.mockReturnValue(
      sources.map((src, index) => ({
        start: index,
        end: index + src.length,
        src,
        targetStart: index,
        targetEnd: index + src.length,
      })),
    )
    mocked.persistDataUrlAttachment.mockImplementation((source: string) => {
      if (source === lastSource) {
        return new Promise((resolve) => {
          resolveLastPersistence = resolve
        })
      }
      return Promise.resolve(`attachment://orphan-${sources.indexOf(source)}.png`)
    })
    mocked.deleteAttachment.mockImplementation(async () => {
      activeDeletes += 1
      maxActiveDeletes = Math.max(maxActiveDeletes, activeDeletes)
      await new Promise<void>((resolve) => {
        resolveDeletes.push(resolve)
      })
      activeDeletes -= 1
    })

    const actions = createSessionActions()
    seedSession([createMessage('m1', `![image](<${sources[0]}>)`)])

    await actions.switchSession('session-2')
    await vi.runOnlyPendingTimersAsync()
    await vi.waitFor(() => expect(mocked.persistDataUrlAttachment).toHaveBeenCalledWith(lastSource))

    await actions.deleteSession('session-2')
    resolveLastPersistence(`attachment://orphan-${sources.length - 1}.png`)
    await vi.waitFor(() => {
      expect(resolveDeletes).toHaveLength(MAX_INLINE_IMAGE_ORPHAN_DELETE_CONCURRENCY)
    })

    expect(maxActiveDeletes).toBeLessThanOrEqual(MAX_INLINE_IMAGE_ORPHAN_DELETE_CONCURRENCY)
    while (resolveDeletes.length > 0) {
      resolveDeletes.shift()?.()
      await Promise.resolve()
    }
    await vi.waitFor(() => {
      expect(mocked.deleteAttachment).toHaveBeenCalledTimes(sources.length)
    })
    while (resolveDeletes.length > 0) {
      resolveDeletes.shift()?.()
      await Promise.resolve()
    }

    await vi.waitFor(() => {
      expect(maxActiveDeletes).toBeLessThanOrEqual(MAX_INLINE_IMAGE_ORPHAN_DELETE_CONCURRENCY)
    })
    expect(mocked.saveSessionJson).not.toHaveBeenCalledWith('session-2', expect.anything())
  })

  it('reruns inline image persistence when new data images arrive while a session is already processing', async () => {
    const firstSource = 'data:image/png;base64,QUJD'
    const secondSource = 'data:image/png;base64,RUZH'
    const createImageMessage = (id: string, source: string) =>
      createMessage(id, `![image](<${source}>)`)
    const pendingPersistence = new Map<string, (value: string) => void>()
    mocked.parseMarkdownAndHtmlImageTokens.mockImplementation((content: string) => {
      const tokenPattern = /!\[image\]\(<(data:image\/png;base64,[A-Z]+)>\)/g
      return Array.from(content.matchAll(tokenPattern), (match) => {
        const src = match[1]
        const targetStart = match.index! + match[0].indexOf(src)
        return {
          start: match.index!,
          end: match.index! + match[0].length,
          src,
          targetStart,
          targetEnd: targetStart + src.length,
        }
      })
    })
    mocked.persistDataUrlAttachment.mockImplementation((source: string) =>
      new Promise((resolve) => {
        pendingPersistence.set(source, resolve)
      })
    )
    const { createSessionActions } = await import('./sessionActions')
    const actions = createSessionActions()
    seedSession([createImageMessage('m1', firstSource)])

    await actions.switchSession('session-2')
    await vi.runOnlyPendingTimersAsync()
    await vi.waitFor(() => {
      expect(mocked.persistDataUrlAttachment).toHaveBeenCalledWith(firstSource)
    })

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
                  ...(state.data.ai.messages['session-2'] || []),
                  createImageMessage('m2', secondSource),
                ],
              },
            }
          : state.data.ai,
      },
    }))
    await actions.switchSession('session-2')
    await vi.runOnlyPendingTimersAsync()

    pendingPersistence.get(firstSource)?.('attachment://first.png')
    await Promise.resolve()
    await vi.waitFor(() => {
      expect(useUnifiedStore.getState().data.ai?.messages['session-2']?.[0]?.content)
        .toBe('![image](<attachment://first.png>)')
    })
    expect(useUnifiedStore.getState().data.ai?.messages['session-2']?.[1]?.content)
      .toBe(`![image](<${secondSource}>)`)
    await vi.runAllTimersAsync()
    await vi.waitFor(() => {
      expect(mocked.persistDataUrlAttachment).toHaveBeenCalledWith(secondSource)
    })
    pendingPersistence.get(secondSource)?.('attachment://second.png')

    await vi.waitFor(() => {
      expect(useUnifiedStore.getState().data.ai?.messages['session-2']?.[1]?.content)
        .toBe('![image](<attachment://second.png>)')
    })
    expect(useUnifiedStore.getState().data.ai?.messages['session-2']?.[0]?.content)
      .toBe('![image](<attachment://first.png>)')
  })

  it('reruns inline image persistence when new transcript data images arrive while processing', async () => {
    const firstSource = 'data:image/png;base64,QUJD'
    const secondSource = 'data:image/png;base64,RUZH'
    const pendingPersistence = new Map<string, (value: string) => void>()
    mocked.parseMarkdownAndHtmlImageTokens.mockImplementation((content: string) => {
      const tokenPattern = /!\[image\]\(<(data:image\/png;base64,[A-Z]+)>\)/g
      return Array.from(content.matchAll(tokenPattern), (match) => {
        const src = match[1]
        const targetStart = match.index! + match[0].indexOf(src)
        return {
          start: match.index!,
          end: match.index! + match[0].length,
          src,
          targetStart,
          targetEnd: targetStart + src.length,
        }
      })
    })
    mocked.persistDataUrlAttachment.mockImplementation((source: string) =>
      new Promise((resolve) => {
        pendingPersistence.set(source, resolve)
      })
    )
    const createTranscriptMessage = (id: string, source: string): ChatMessage => {
      const message = {
        ...createMessage(id, 'visible text'),
        apiTranscript: [{
          role: 'user' as const,
          content: [
            { type: 'text' as const, text: `Hidden ![image](<${source}>)` },
          ],
        }],
      }
      message.versions[0].apiTranscript = message.apiTranscript
      return message
    }
    const { createSessionActions } = await import('./sessionActions')
    const actions = createSessionActions()
    seedSession([createTranscriptMessage('m1', firstSource)])

    await actions.switchSession('session-2')
    await vi.runOnlyPendingTimersAsync()
    await vi.waitFor(() => {
      expect(mocked.persistDataUrlAttachment).toHaveBeenCalledWith(firstSource)
    })

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
                  ...(state.data.ai.messages['session-2'] || []),
                  createTranscriptMessage('m2', secondSource),
                ],
              },
            }
          : state.data.ai,
      },
    }))
    await actions.switchSession('session-2')
    await vi.runOnlyPendingTimersAsync()

    pendingPersistence.get(firstSource)?.('attachment://first.png')
    await vi.waitFor(() => {
      expect(useUnifiedStore.getState().data.ai?.messages['session-2']?.[0]?.apiTranscript?.[0]?.content)
        .toEqual([{ type: 'text', text: 'Hidden ![image](<attachment://first.png>)' }])
    })
    expect(useUnifiedStore.getState().data.ai?.messages['session-2']?.[1]?.apiTranscript?.[0]?.content)
      .toEqual([{ type: 'text', text: `Hidden ![image](<${secondSource}>)` }])
    await vi.runAllTimersAsync()
    await vi.waitFor(() => {
      expect(mocked.persistDataUrlAttachment).toHaveBeenCalledWith(secondSource)
    })
    pendingPersistence.get(secondSource)?.('attachment://second.png')

    await vi.waitFor(() => {
      expect(useUnifiedStore.getState().data.ai?.messages['session-2']?.[1]?.apiTranscript?.[0]?.content)
        .toEqual([{ type: 'text', text: 'Hidden ![image](<attachment://second.png>)' }])
    })
    expect(useUnifiedStore.getState().data.ai?.messages['session-2']?.[0]?.apiTranscript?.[0]?.content)
      .toEqual([{ type: 'text', text: 'Hidden ![image](<attachment://first.png>)' }])
  })

  it('persists inline data images found in API transcript text parts', async () => {
    const source = 'data:image/png;base64,INLINE'
    const transcriptText = `Hidden text part ![image](<${source}>)`
    mocked.parseMarkdownAndHtmlImageTokens.mockImplementation((content: string) => {
      const targetStart = content.indexOf(source)
      return targetStart >= 0
        ? [{ start: 0, end: content.length, src: source, targetStart, targetEnd: targetStart + source.length }]
        : []
    })
    const message = {
      ...createMessage('m1', 'visible text'),
      apiTranscript: [{
        role: 'user',
        content: [
          { type: 'text' as const, text: transcriptText },
        ],
      }],
    }
    message.versions[0].apiTranscript = message.apiTranscript
    const { createSessionActions } = await import('./sessionActions')
    seedSession([message])

    await createSessionActions().switchSession('session-2')
    await vi.runOnlyPendingTimersAsync()

    const storedMessage = useUnifiedStore.getState().data.ai?.messages['session-2']?.[0]
    expect(mocked.persistDataUrlAttachment).toHaveBeenCalledWith(source)
    expect(storedMessage?.content).toBe('visible text')
    expect(storedMessage?.apiTranscript?.[0]?.content).toEqual([
      { type: 'text', text: 'Hidden text part ![image](<attachment://persisted.png>)' },
    ])
    expect(storedMessage?.versions[0]?.apiTranscript?.[0]?.content).toEqual([
      { type: 'text', text: 'Hidden text part ![image](<attachment://persisted.png>)' },
    ])
  })

  it('limits unique inline data image persistence work per session switch', async () => {
    const sources = Array.from(
      { length: 1500 },
      (_, index) => `data:image/png;base64,${String(index).padStart(8, 'A')}`,
    )
    mocked.parseMarkdownAndHtmlImageTokens.mockReturnValue(
      sources.map((src, index) => ({
        start: index,
        end: index + src.length,
        src,
        targetStart: index,
        targetEnd: index + src.length,
      })),
    )
    const { createSessionActions } = await import('./sessionActions')
    seedSession([createMessage('m1', `![image](<${sources[0]}>)`)])

    await createSessionActions().switchSession('session-2')
    await vi.runOnlyPendingTimersAsync()

    expect(mocked.persistDataUrlAttachment).toHaveBeenCalledTimes(1000)
    expect(mocked.persistDataUrlAttachment).toHaveBeenLastCalledWith(sources[999])
  })

  it('ignores stale cached inline image sources without rescanning plain message text', async () => {
    const source = 'data:image/png;base64,INLINE'
    const message = {
      ...createMessage('m1', 'plain text '.repeat(10_000)),
      imageSources: [source],
    }
    const { createSessionActions } = await import('./sessionActions')
    seedSession([message])

    await createSessionActions().switchSession('session-2')
    await vi.runOnlyPendingTimersAsync()

    expect(mocked.parseMarkdownAndHtmlImageTokens).not.toHaveBeenCalled()
    expect(mocked.persistDataUrlAttachment).not.toHaveBeenCalled()
    expect(useUnifiedStore.getState().data.ai?.messages['session-2']?.[0]?.content).toBe(message.content)
    expect(useUnifiedStore.getState().data.ai?.messages['session-2']?.[0]?.imageSources).toBeUndefined()
  })

  it('scrubs oversized markdown data images when token parsing skips the target', async () => {
    mocked.parseMarkdownAndHtmlImageTokens.mockReturnValue([])
    const oversizedSource = `data:image/png;base64,${'A'.repeat(520 * 1024)}`
    const { createSessionActions } = await import('./sessionActions')
    seedSession([createMessage('m1', `Before ![image](<${oversizedSource}>) After`)])

    await createSessionActions().switchSession('session-2')
    await vi.runOnlyPendingTimersAsync()

    const content = useUnifiedStore.getState().data.ai?.messages['session-2']?.[0]?.content
    expect(mocked.persistDataUrlAttachment).not.toHaveBeenCalled()
    expect(content).toBe('Before  After')
    expect(content).not.toContain('data:image')
  })

  it('scrubs entity-encoded oversized markdown data images when token parsing skips the target', async () => {
    mocked.parseMarkdownAndHtmlImageTokens.mockReturnValue([])
    const oversizedSource = `data&colon;image&sol;png&semi;base64&comma;${'A'.repeat(520 * 1024)}`
    const { createSessionActions } = await import('./sessionActions')
    seedSession([createMessage('m1', `Before ![image](<${oversizedSource}>) After`)])

    await createSessionActions().switchSession('session-2')
    await vi.runOnlyPendingTimersAsync()

    const content = useUnifiedStore.getState().data.ai?.messages['session-2']?.[0]?.content
    expect(mocked.persistDataUrlAttachment).not.toHaveBeenCalled()
    expect(content).toBe('Before  After')
    expect(content).not.toContain('data&colon;image&sol;')
    expect(content).not.toContain('&semi;base64&comma;')
  })

  it('scrubs escaped-scheme oversized markdown data images when token parsing skips the target', async () => {
    mocked.parseMarkdownAndHtmlImageTokens.mockReturnValue([])
    const oversizedSource = String.raw`data\:image/png;base64,${'A'.repeat(520 * 1024)}`
    const { createSessionActions } = await import('./sessionActions')
    seedSession([createMessage('m1', `Before ![image](<${oversizedSource}>) After`)])

    await createSessionActions().switchSession('session-2')
    await vi.runOnlyPendingTimersAsync()

    const content = useUnifiedStore.getState().data.ai?.messages['session-2']?.[0]?.content
    expect(mocked.persistDataUrlAttachment).not.toHaveBeenCalled()
    expect(content).toBe('Before  After')
    expect(content).not.toContain(String.raw`data\:image/`)
  })

  it('scrubs oversized HTML data images when token parsing skips the target', async () => {
    mocked.parseMarkdownAndHtmlImageTokens.mockReturnValue([])
    const oversizedSource = `data:image/png;base64,${'A'.repeat(70 * 1024)}`
    const { createSessionActions } = await import('./sessionActions')
    seedSession([createMessage('m1', `Before <img alt="inline" src="${oversizedSource}"> After`)])

    await createSessionActions().switchSession('session-2')
    await vi.runOnlyPendingTimersAsync()

    const content = useUnifiedStore.getState().data.ai?.messages['session-2']?.[0]?.content
    expect(mocked.persistDataUrlAttachment).not.toHaveBeenCalled()
    expect(content).toBe('Before  After')
    expect(content).not.toContain('data:image')
    expect(content).not.toContain('<img')
  })

  it('keeps oversized HTML data image examples inside code spans', async () => {
    mocked.parseMarkdownAndHtmlImageTokens.mockReturnValue([])
    const oversizedSource = `data:image/png;base64,${'B'.repeat(70 * 1024)}`
    const codeImage = `<img src="${oversizedSource}" alt="example">`
    const { createSessionActions } = await import('./sessionActions')
    seedSession([createMessage('m1', `Before \`${codeImage}\` <img src="${oversizedSource}" alt="real"> After`)])

    await createSessionActions().switchSession('session-2')
    await vi.runOnlyPendingTimersAsync()

    const content = useUnifiedStore.getState().data.ai?.messages['session-2']?.[0]?.content
    expect(mocked.persistDataUrlAttachment).not.toHaveBeenCalled()
    expect(content).toBe(`Before \`${codeImage}\`  After`)
  })

  it('keeps oversized markdown data image examples inside code spans', async () => {
    mocked.parseMarkdownAndHtmlImageTokens.mockReturnValue([])
    const oversizedSource = `data:image/png;base64,${'B'.repeat(520 * 1024)}`
    const { createSessionActions } = await import('./sessionActions')
    seedSession([createMessage('m1', `Before \`![example](<${oversizedSource}>)\` ![image](<${oversizedSource}>) After`)])

    await createSessionActions().switchSession('session-2')
    await vi.runOnlyPendingTimersAsync()

    const content = useUnifiedStore.getState().data.ai?.messages['session-2']?.[0]?.content
    expect(mocked.persistDataUrlAttachment).not.toHaveBeenCalled()
    expect(content).toBe(`Before \`![example](<${oversizedSource}>)\`  After`)
  })

  it('bounds inline image replacement to the scanned branch depth', async () => {
    const source = 'data:image/png;base64,INLINE'
    mocked.parseMarkdownAndHtmlImageTokens.mockImplementation((content: string) => {
      const targetStart = content.indexOf(source)
      return targetStart >= 0
        ? [{ start: 0, end: content.length, src: source, targetStart, targetEnd: targetStart + source.length }]
        : []
    }
    )
    const rootMessage = createMessage('m1', `root ![image](<${source}>)`)
    rootMessage.versions[0].subsequentMessages = [
      {
        ...createMessage('branch-1', `branch ![image](<${source}>)`),
        versions: [{
          content: `branch version ![image](<${source}>)`,
          createdAt: 1,
          kind: 'original',
          subsequentMessages: [
            createMessage('branch-2', `deep branch ![image](<${source}>)`),
          ],
        }],
      },
    ]

    const { createSessionActions } = await import('./sessionActions')
    seedSession([rootMessage])

    await createSessionActions().switchSession('session-2')
    await vi.runOnlyPendingTimersAsync()

    const message = useUnifiedStore.getState().data.ai?.messages['session-2']?.[0]
    const branch = message?.versions[0]?.subsequentMessages[0]
    const deepBranch = branch?.versions[0]?.subsequentMessages[0]

    expect(mocked.persistDataUrlAttachment).toHaveBeenCalledWith(source)
    expect(message?.content).toBe('root ![image](<attachment://persisted.png>)')
    expect(branch?.content).toBe('branch ![image](<attachment://persisted.png>)')
    expect(branch?.versions[0]?.content).toBe('branch version ![image](<attachment://persisted.png>)')
    expect(deepBranch?.content).toBe(`deep branch ![image](<${source}>)`)
  })

  it('does not derive relative or bare image caches after inline image persistence', async () => {
    const source = 'data:image/png;base64,INLINE'
    mocked.createStoredAttachmentFromSource.mockImplementation((src: string) => {
      if (src === 'images/demo.png' || src === 'demo.png') {
        return null
      }
      return {
        id: 'stored-attachment',
        path: '',
        previewUrl: src,
        assetUrl: src,
        name: 'persisted.png',
        type: 'image/png',
        size: 0,
      }
    })
    mocked.parseMarkdownAndHtmlImageTokens.mockImplementation((content: string) => {
      const targetStart = content.indexOf(source)
      return targetStart >= 0
        ? [{ start: 0, end: content.length, src: source, targetStart, targetEnd: targetStart + source.length }]
        : []
    })
    seedSession([createMessage('m1', [
      `![inline](<${source}>)`,
      '![local](images/demo.png)',
      '![bare](demo.png)',
    ].join('\n'))])

    const { createSessionActions } = await import('./sessionActions')

    await createSessionActions().switchSession('session-2')
    await vi.runOnlyPendingTimersAsync()

    const message = useUnifiedStore.getState().data.ai?.messages['session-2']?.[0]
    expect(message?.content).toContain('![inline](<attachment://persisted.png>)')
    expect(message?.content).toContain('![local](images/demo.png)')
    expect(message?.content).toContain('![bare](demo.png)')
    expect(message?.imageSources).toEqual(['attachment://persisted.png'])
  })
})
