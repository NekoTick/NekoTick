import { describe, expect, it } from 'vitest'
import type { AIModel, ChatMessage, Provider } from '../types'
import { buildAnthropicMessageRequest } from './anthropicRequest'
import { buildOpenAIChatRequest } from './openaiRouting'

const model: AIModel = {
  id: 'model-1',
  apiModelId: 'model-1',
  name: 'Model',
  providerId: 'provider-1',
  enabled: true,
  createdAt: 1,
}

const provider: Provider = {
  id: 'provider-1',
  name: 'Provider',
  type: 'newapi',
  apiHost: 'https://api.example.test',
  apiKey: 'sk-test',
  enabled: true,
  createdAt: 1,
  updatedAt: 1,
}

function createHistoryMessage(requestContext: ChatMessage['requestContext']): ChatMessage {
  return {
    id: 'user-1',
    role: 'user',
    content: 'Visible message only',
    requestContext,
    modelId: model.id,
    timestamp: 1,
    versions: [{ content: 'Visible message only', createdAt: 1, kind: 'original', subsequentMessages: [] }],
    currentVersionIndex: 0,
  }
}

describe('provider request context history', () => {
  it('uses the immutable text and image snapshot in OpenAI history', () => {
    const request = buildOpenAIChatRequest(
      'Next turn',
      [createHistoryMessage({
        text: 'Persisted file context',
        imageSources: ['data:image/png;base64,AQI='],
      })],
      model,
      provider,
    )

    expect(request.messages[0]?.content).toEqual([
      { type: 'text', text: 'Persisted file context' },
      { type: 'image_url', image_url: { url: 'data:image/png;base64,AQI=' } },
    ])
  })

  it('keeps image-only snapshot turns in Anthropic history', () => {
    const request = buildAnthropicMessageRequest({
      message: 'Next turn',
      history: [createHistoryMessage({
        text: '',
        imageSources: ['data:image/png;base64,AQI='],
      })],
      model,
    })

    expect(request.messages).toEqual([
      {
        role: 'user',
        content: [{
          type: 'image',
          source: { type: 'base64', media_type: 'image/png', data: 'AQI=' },
        }],
      },
      { role: 'user', content: 'Next turn' },
    ])
  })

  it('uses the active version snapshot when the top-level snapshot is absent', () => {
    const historyMessage = createHistoryMessage(undefined)
    historyMessage.versions[0]!.requestContext = {
      text: 'Version-only file context',
    }

    const request = buildOpenAIChatRequest(
      'Next turn',
      [historyMessage],
      model,
      provider,
    )

    expect(request.messages[0]?.content).toBe('Version-only file context')
  })
})
