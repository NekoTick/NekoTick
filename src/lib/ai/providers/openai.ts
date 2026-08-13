import {
  fetchManagedModels,
  MANAGED_PROVIDER_ID,
  requestManagedChatCompletion,
  requestManagedChatCompletionStream,
} from '@/lib/ai/managedService'
import { isStandaloneImageGenerationModel } from '@/lib/ai/modelCapabilities'
import { sanitizeCurrentRequestTextContent, sanitizeHistory } from '@/lib/ai/requestContext'
import { buildWebSearchCapabilityAnswer, classifyWebSearchIntent } from '@/lib/ai/webSearch/intent'
import {
  runOpenAIWebSearchJsonToolLoop,
  runOpenAIWebSearchTextProtocolRequest,
  runOpenAIWebSearchTextProtocolTextRequest,
  runOpenAIWebSearchToolLoop,
} from '@/lib/ai/webSearch/openAIToolLoop'
import type { AIClient } from '../client'
import { type AIModel, type ChatMessage, type ChatMessageContent, type ChatSendOptions, type Provider } from '../types'
import { buildOpenAIBaseUrl, resolveApiModelId } from '../utils'
import { sendAnthropicMessage } from './anthropic'
import { detectProviderEndpointModels, type ModelFetchResult } from './modelDetection'
import { getFirstImageInput } from './openaiImages'
import { sendManagedImageEdit, sendManagedImageGeneration, sendManagedMessage } from './openaiManaged'
import { requestOpenAIChatCompletionOnce, sendImageEdit, sendImageGeneration, streamResponse } from './openaiRequests'
import {
  buildOpenAIChatRequest,
  extractTextPrompt,
  isGrokModel,
  shouldUseWebSearchTextProtocol,
  shouldUseXaiNativeWebSearch,
} from './openaiRouting'
import { createHtmlRejectingChunkHandler, emitApiTranscript, emitChunk, throwIfAborted } from './openaiRuntime'
import { sendXaiNativeWebSearchMessage } from './openaiXaiWebSearch'
import { isToolInputUnsupported } from './toolInputCompatibility'

function createUnsupportedWebSearchError(): Error {
  return new Error('Web search is unavailable for this model.')
}

function answerWebSearchCapabilityLocally(
  message: ChatMessageContent,
  onChunk: ((chunk: string) => void) | undefined,
  options: ChatSendOptions | undefined,
  signal: AbortSignal | undefined,
): string {
  const content = buildWebSearchCapabilityAnswer(extractTextPrompt(message))
  emitChunk(onChunk || (() => { }), signal, content)
  emitApiTranscript(options?.onApiTranscript, signal, [{ role: 'assistant', content }])
  return content
}

export class OpenAICompatibleClient implements AIClient {
  private readonly timeout = 300000

  private async resolveApiKey(provider: Provider): Promise<string> {
    const directApiKey = provider.apiKey?.trim() || ''
    if (!directApiKey) {
      throw new Error('Missing API key')
    }
    return directApiKey
  }

  async sendMessage(
    message: ChatMessageContent,
    history: ChatMessage[],
    model: AIModel,
    provider: Provider,
    onChunk?: (chunk: string) => void,
    signal?: AbortSignal,
    options?: ChatSendOptions
  ): Promise<string> {
    const safeHistory = sanitizeHistory(history)
    const body = buildOpenAIChatRequest(message, safeHistory, model, provider, options)
    const isImageModel = isStandaloneImageGenerationModel(model)
    const imagePrompt = isImageModel ? sanitizeCurrentRequestTextContent(extractTextPrompt(message)) : ''
    const editImageUrl = isImageModel ? getFirstImageInput(message) : null

    if (!isImageModel && options?.webSearchEnabled) {
      const localWebSearchIntent = classifyWebSearchIntent(extractTextPrompt(message))
      if (localWebSearchIntent.action === 'answer-capability') {
        return answerWebSearchCapabilityLocally(message, onChunk, options, signal)
      }
    }

    if (provider.id === MANAGED_PROVIDER_ID) {
      if (isImageModel && editImageUrl) {
        return sendManagedImageEdit({ model: resolveApiModelId(model), prompt: imagePrompt, imageUrl: editImageUrl }, onChunk, signal)
      }
      if (isImageModel) {
        return sendManagedImageGeneration({ model: resolveApiModelId(model), prompt: imagePrompt, n: 1 }, onChunk, signal)
      }
      if (options?.webSearchEnabled && !isGrokModel(provider, model)) {
        return this.sendManagedWebSearchMessage(body, onChunk, signal, options, provider, model)
      }
      return sendManagedMessage(body, onChunk, signal, options)
    }

    const apiKey = await this.resolveApiKey(provider)
    const baseUrl = buildOpenAIBaseUrl(provider.apiHost)
    const headers = {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    }

    if (isImageModel) {
      if (editImageUrl) {
        return sendImageEdit(`${baseUrl}/images/edits`, headers, { model: resolveApiModelId(model), prompt: imagePrompt, imageUrl: editImageUrl }, onChunk || (() => { }), signal, this.timeout)
      }
      return sendImageGeneration(`${baseUrl}/images/generations`, headers, { model: resolveApiModelId(model), prompt: imagePrompt, n: 1 }, onChunk || (() => { }), signal, this.timeout)
    }

    if (provider.endpointType === 'anthropic') {
      if (options?.webSearchEnabled) throw createUnsupportedWebSearchError()
      return sendAnthropicMessage({
        message,
        history: safeHistory,
        model,
        provider,
        apiKey,
        timeoutMs: this.timeout,
        onChunk: onChunk || (() => { }),
        signal,
        options,
      })
    }

    const url = `${baseUrl}/chat/completions`
    if (options?.webSearchEnabled) {
      return this.sendOpenAIWebSearchMessage({ provider, model, baseUrl, url, headers, body, onChunk, signal, options })
    }

    return streamResponse({ url, headers, body, onChunk: onChunk || (() => { }), signal, options, timeoutMs: this.timeout })
  }

  private sendManagedWebSearchMessage(
    body: ReturnType<typeof buildOpenAIChatRequest>,
    onChunk: ((chunk: string) => void) | undefined,
    signal: AbortSignal | undefined,
    options: ChatSendOptions,
    provider: Provider,
    model: AIModel,
  ): Promise<string> {
    if (shouldUseWebSearchTextProtocol(provider, model)) {
      return runOpenAIWebSearchTextProtocolTextRequest({
        body,
        onChunk: onChunk || (() => { }),
        onStatus: options.onWebSearchStatus,
        onApiTranscript: options.onApiTranscript,
        signal,
        requestText: (nextBody, nextOnChunk) =>
          requestManagedChatCompletionStream({
            ...nextBody,
            stream: true,
          } as unknown as Record<string, unknown>, createHtmlRejectingChunkHandler(nextOnChunk), signal),
      })
    }
    return runOpenAIWebSearchJsonToolLoop({
      body,
      onChunk: onChunk || (() => { }),
      onStatus: options.onWebSearchStatus,
      onApiTranscript: options.onApiTranscript,
      signal,
      autoReadAfterSearch: true,
      requestJson: (nextBody) =>
        requestManagedChatCompletion({
          ...nextBody,
          stream: false,
        } as unknown as Record<string, unknown>, signal),
    })
  }

  private async sendOpenAIWebSearchMessage({
    provider,
    model,
    baseUrl,
    url,
    headers,
    body,
    onChunk,
    signal,
    options,
  }: {
    provider: Provider
    model: AIModel
    baseUrl: string
    url: string
    headers: Record<string, string>
    body: ReturnType<typeof buildOpenAIChatRequest>
    onChunk?: (chunk: string) => void
    signal?: AbortSignal
    options: ChatSendOptions
  }): Promise<string> {
    const request = (nextBody: ReturnType<typeof buildOpenAIChatRequest>) =>
      requestOpenAIChatCompletionOnce({
        url,
        headers,
        body: nextBody,
        signal,
        timeoutMs: this.timeout,
      })
    const loopOptions = {
      body,
      onChunk: onChunk || (() => { }),
      onStatus: options.onWebSearchStatus,
      onApiTranscript: options.onApiTranscript,
      signal,
      request,
    }
    if (shouldUseXaiNativeWebSearch(provider, model)) {
      try {
        return await sendXaiNativeWebSearchMessage({
          baseUrl,
          headers,
          body,
          onChunk: onChunk || (() => { }),
          signal,
          options,
          timeoutMs: this.timeout,
        })
      } catch (error) {
        if (isToolInputUnsupported(error)) throw createUnsupportedWebSearchError()
        throw error
      }
    }
    if (isGrokModel(provider, model)) {
      return streamResponse({ url, headers, body, onChunk: onChunk || (() => { }), signal, options, timeoutMs: this.timeout })
    }
    if (shouldUseWebSearchTextProtocol(provider, model)) {
      return runOpenAIWebSearchTextProtocolRequest({
        body,
        onChunk: onChunk || (() => { }),
        onStatus: options.onWebSearchStatus,
        onApiTranscript: options.onApiTranscript,
        signal,
        request: (nextBody) => requestOpenAIChatCompletionOnce({
          url,
          headers,
          body: nextBody,
          signal,
          timeoutMs: this.timeout,
        }),
      })
    }
    try {
      return await runOpenAIWebSearchToolLoop(loopOptions)
    } catch (error) {
      if (isToolInputUnsupported(error)) throw createUnsupportedWebSearchError()
      throw error
    }
  }

  async testConnection(provider: Provider): Promise<boolean> {
    try {
      if (provider.id === MANAGED_PROVIDER_ID) {
        await fetchManagedModels()
        return true
      }

      await this.getModels(provider)
      return true
    } catch {
      return false
    }
  }

  async getModels(provider: Provider, signal?: AbortSignal): Promise<string[]> {
    const result = await this.getModelsWithEndpointDetection(provider, signal)
    return result.models
  }

  async getModelsWithEndpointDetection(provider: Provider, signal?: AbortSignal): Promise<ModelFetchResult> {
    if (provider.id === MANAGED_PROVIDER_ID) {
      throwIfAborted(signal)
      const models = await fetchManagedModels()
      throwIfAborted(signal)
      return {
        models: models.map((model) => model.apiModelId),
        endpointType: 'openai',
      }
    }

    const apiKey = await this.resolveApiKey(provider)
    throwIfAborted(signal)
    return detectProviderEndpointModels(provider, apiKey, signal)
  }
}

export const openaiClient = new OpenAICompatibleClient()
