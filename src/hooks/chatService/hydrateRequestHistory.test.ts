import { describe, expect, it, vi } from 'vitest'
import type { ChatMessage } from '@/lib/ai/types'
import { MAX_REQUEST_CONTEXT_IMAGE_SOURCES } from '@/lib/ai/requestContextSnapshot'

vi.mock('./visionAttachments', () => ({
  imageSourceToAttachment: (source: string) => ({ source }),
  normalizeVisionAttachment: async (attachment: { source: string }) => ({
    type: 'image_url' as const,
    image_url: { url: `hydrated:${attachment.source}` },
  }),
}))

import {
  hydrateRequestHistoryContexts,
  hydrateRequestHistoryForCurrentContent,
  MAX_REQUEST_CONTEXT_HYDRATED_IMAGE_CHARS,
} from './hydrateRequestHistory'

function createUserMessage(id: string, imageSources: string[]): ChatMessage {
  return {
    id,
    role: 'user',
    content: id,
    requestContext: { text: id, imageSources },
    modelId: 'model-1',
    timestamp: 1,
    versions: [{ content: id, createdAt: 1, kind: 'original', subsequentMessages: [] }],
    currentVersionIndex: 0,
  }
}

describe('hydrateRequestHistoryContexts', () => {
  it('clears older image sources after the global history image budget is exhausted', async () => {
    const latestSources = Array.from(
      { length: MAX_REQUEST_CONTEXT_IMAGE_SOURCES },
      (_, index) => `attachment://latest-${index}.png`,
    )
    const history = [
      createUserMessage('older', ['attachment://older.png']),
      createUserMessage('latest', latestSources),
    ]

    const hydrated = await hydrateRequestHistoryContexts(history, new AbortController().signal)

    expect(hydrated[0]?.requestContext).toEqual({
      text: 'older\n\n[Image]',
      imageSources: [],
    })
    expect(hydrated[1]?.requestContext?.imageSources).toHaveLength(
      MAX_REQUEST_CONTEXT_IMAGE_SOURCES,
    )
    expect(hydrated.flatMap((message) => message.requestContext?.imageSources ?? []))
      .not.toContainEqual(expect.stringMatching(/^attachment:\/\//))
  })

  it('bounds the total size of hydrated history images', async () => {
    const firstSource = 'first'
    const history = [createUserMessage('latest', [firstSource, 'second'])]
    const firstHydratedSource = `hydrated:${firstSource}`

    const hydrated = await hydrateRequestHistoryContexts(
      history,
      new AbortController().signal,
      firstHydratedSource.length,
    )
    const imageSources = hydrated[0]?.requestContext?.imageSources

    expect(imageSources).toHaveLength(1)
    expect(imageSources?.[0]).toBe(firstHydratedSource)
    expect(hydrated[0]?.requestContext?.text).toBe('latest\n\n[Image]')
    expect(firstHydratedSource.length).toBeLessThan(MAX_REQUEST_CONTEXT_HYDRATED_IMAGE_CHARS)
  })

  it('hydrates request context stored only on the active message version', async () => {
    const historyMessage = createUserMessage('latest', [])
    historyMessage.requestContext = undefined
    historyMessage.versions[0]!.requestContext = {
      text: 'version context',
      imageSources: ['attachment://version.png'],
    }

    const hydrated = await hydrateRequestHistoryContexts(
      [historyMessage],
      new AbortController().signal,
    )

    expect(hydrated[0]?.requestContext).toEqual({
      text: 'version context',
      imageSources: ['hydrated:attachment://version.png'],
    })
  })

  it('gives current message images priority over history image count', async () => {
    const history = [createUserMessage('older', ['attachment://older.png'])]
    const currentContent = Array.from(
      { length: MAX_REQUEST_CONTEXT_IMAGE_SOURCES },
      (_, index) => ({
        type: 'image_url' as const,
        image_url: { url: `data:image/png;base64,current-${index}` },
      }),
    )

    const hydrated = await hydrateRequestHistoryForCurrentContent(
      history,
      currentContent,
      new AbortController().signal,
    )

    expect(hydrated[0]?.requestContext).toEqual({
      text: 'older\n\n[Image]',
      imageSources: [],
    })
  })
})
