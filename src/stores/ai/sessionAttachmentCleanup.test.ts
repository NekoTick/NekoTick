import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChatMessage, MessageVersion } from '@/lib/ai/types'
import {
  collectStoredAttachmentFilenames,
  findUnreferencedAttachmentFilenames,
} from './sessionAttachmentCleanup'
import {
  MAX_INLINE_IMAGE_PERSISTENCE_BRANCH_MESSAGES,
  MAX_INLINE_IMAGE_PERSISTENCE_MESSAGE_NODES,
  MAX_INLINE_IMAGE_PERSISTENCE_SOURCES,
  MAX_INLINE_IMAGE_PERSISTENCE_VERSIONS,
  MAX_INLINE_IMAGE_TOKENS_PER_CONTENT,
} from './sessionInlineImageConstants'

const mocks = vi.hoisted(() => ({
  hasSessionJson: vi.fn<(sessionId: string) => Promise<boolean>>(async () => false),
  loadSessionJson: vi.fn<(sessionId: string) => Promise<ChatMessage[] | null>>(async () => null),
}))

vi.mock('@/lib/storage/chatStorage', () => ({
  hasSessionJson: mocks.hasSessionJson,
  loadSessionJson: mocks.loadSessionJson,
}))

function createVersion(content = '', subsequentMessages: ChatMessage[] = []): MessageVersion {
  return {
    content,
    createdAt: 1,
    kind: 'original',
    subsequentMessages,
  }
}

function createMessage(id: string, content = ''): ChatMessage {
  return {
    id,
    role: 'user',
    content,
    modelId: 'model-1',
    timestamp: 1,
    versions: [createVersion(content)],
    currentVersionIndex: 0,
  }
}

describe('session attachment cleanup', () => {
  beforeEach(() => {
    mocks.hasSessionJson.mockReset()
    mocks.hasSessionJson.mockResolvedValue(false)
    mocks.loadSessionJson.mockReset()
    mocks.loadSessionJson.mockResolvedValue(null)
  })

  it('marks source and token-limited scans as incomplete', () => {
    const sourceLimited = createMessage('source-limited')
    sourceLimited.imageSources = Array.from(
      { length: MAX_INLINE_IMAGE_PERSISTENCE_SOURCES + 1 },
      (_value, index) => `attachment://source-${index}.png`,
    )
    const tokenLimitedContent = Array.from(
      { length: MAX_INLINE_IMAGE_TOKENS_PER_CONTENT },
      () => '![image](<attachment://same.png>)',
    ).join('\n')

    expect(collectStoredAttachmentFilenames([sourceLimited]).complete).toBe(false)
    expect(collectStoredAttachmentFilenames([
      createMessage('token-limited', tokenLimitedContent),
    ]).complete).toBe(false)
  })

  it('marks message and version-limited scans as incomplete', () => {
    const repeatedMessage = createMessage('repeated')
    const versionLimited = createMessage('version-limited')
    versionLimited.versions = Array.from(
      { length: MAX_INLINE_IMAGE_PERSISTENCE_VERSIONS + 1 },
      () => createVersion(),
    )

    expect(collectStoredAttachmentFilenames(
      Array(MAX_INLINE_IMAGE_PERSISTENCE_MESSAGE_NODES + 1).fill(repeatedMessage),
    ).complete).toBe(false)
    expect(collectStoredAttachmentFilenames([versionLimited]).complete).toBe(false)
  })

  it('marks width and depth-limited branch scans as incomplete', () => {
    const widthLimited = createMessage('width-limited')
    widthLimited.versions[0]!.subsequentMessages = Array.from(
      { length: MAX_INLINE_IMAGE_PERSISTENCE_BRANCH_MESSAGES + 1 },
      (_value, index) => createMessage(`branch-${index}`),
    )

    const depthLimited = createMessage('depth-limited')
    const branch = createMessage('branch')
    branch.versions[0]!.subsequentMessages = [createMessage('deep-branch')]
    depthLimited.versions[0]!.subsequentMessages = [branch]

    expect(collectStoredAttachmentFilenames([widthLimited]).complete).toBe(false)
    expect(collectStoredAttachmentFilenames([depthLimited]).complete).toBe(false)
  })

  it('skips deletion when a retained session scan is incomplete', async () => {
    const sharedSource = 'attachment://shared.png'
    const deletingMessage = createMessage('deleting', `![image](<${sharedSource}>)`)
    const retainedMessage = createMessage('retained')
    retainedMessage.imageSources = [
      ...Array.from(
        { length: MAX_INLINE_IMAGE_PERSISTENCE_SOURCES },
        (_value, index) => `attachment://retained-${index}.png`,
      ),
      sharedSource,
    ]

    await expect(findUnreferencedAttachmentFilenames({
      sessions: [
        { id: 'deleting', title: 'Deleting', modelId: 'model-1', createdAt: 1, updatedAt: 1 },
        { id: 'retained', title: 'Retained', modelId: 'model-1', createdAt: 2, updatedAt: 2 },
      ],
      messages: {
        deleting: [deletingMessage],
        retained: [retainedMessage],
      },
    }, new Set(['deleting']))).resolves.toEqual([])
  })

  it('scans persisted messages even when a retained session is already cached', async () => {
    const sharedSource = 'attachment://shared.png'
    mocks.hasSessionJson.mockImplementation(async (sessionId: string) => sessionId === 'retained')
    mocks.loadSessionJson.mockImplementation(async (sessionId: string) => (
      sessionId === 'retained'
        ? [createMessage('persisted-retained', `![image](<${sharedSource}>)`)]
        : null
    ))

    await expect(findUnreferencedAttachmentFilenames({
      sessions: [
        { id: 'deleting', title: 'Deleting', modelId: 'model-1', createdAt: 1, updatedAt: 1 },
        { id: 'retained', title: 'Retained', modelId: 'model-1', createdAt: 2, updatedAt: 2 },
      ],
      messages: {
        deleting: [createMessage('deleting', `![image](<${sharedSource}>)`)],
        retained: [],
      },
    }, new Set(['deleting']))).resolves.toEqual([])
    expect(mocks.loadSessionJson).toHaveBeenCalledWith('retained')
  })

  it('skips deletion when a cached retained session has unreadable persisted messages', async () => {
    mocks.hasSessionJson.mockImplementation(async (sessionId: string) => sessionId === 'retained')
    mocks.loadSessionJson.mockResolvedValue(null)

    await expect(findUnreferencedAttachmentFilenames({
      sessions: [
        { id: 'deleting', title: 'Deleting', modelId: 'model-1', createdAt: 1, updatedAt: 1 },
        { id: 'retained', title: 'Retained', modelId: 'model-1', createdAt: 2, updatedAt: 2 },
      ],
      messages: {
        deleting: [createMessage('deleting', '![image](<attachment://unique.png>)')],
        retained: [],
      },
    }, new Set(['deleting']))).resolves.toEqual([])
  })
})
