import type { ApiTranscriptMessage } from './types'
import {
  MAX_OPENAI_STREAM_CONTENT_CHARS,
  MAX_OPENAI_STREAM_LINE_CHARS,
} from './streamingLimits'
import {
  extractErrorCode,
  extractErrorMessage,
  extractStreamDelta,
  parsePayloadText,
  type StreamDeltaPayload,
} from './streamingPayload'
import { addAiStreamResponseChunkBytes } from './streamingResponseBudget'
import { isErrorNamed } from './errorClassification'

export type { StreamDeltaPayload } from './streamingPayload'
export {
  MAX_OPENAI_STREAM_CONTENT_CHARS,
  MAX_OPENAI_STREAM_ERROR_FIELD_CHARS,
  MAX_OPENAI_STREAM_LINE_CHARS,
} from './streamingLimits'

export interface StreamAccumulator {
  pushDelta: (delta: StreamDeltaPayload) => void
  finish: () => string
  getAssistantTranscriptMessage: () => ApiTranscriptMessage | null
}

interface ConsumeOpenAIStreamOptions {
  onAssistantTranscriptMessage?: (message: ApiTranscriptMessage) => void
  onPayload?: (payload: Record<string, unknown>) => void
  mapErrorPayload?: (message: string, code?: string) => Error | string
  signal?: AbortSignal
}

const THINK_OPEN_TAG = '<think>'
const THINK_CLOSE_TAG = '</think>'

export function assertOpenAIStreamLineLength(line: string): void {
  if (line.length > MAX_OPENAI_STREAM_LINE_CHARS) {
    throw new Error('AI stream line is too large')
  }
}

function assertOpenAIStreamContentLength(length: number): void {
  if (length > MAX_OPENAI_STREAM_CONTENT_CHARS) {
    throw new Error('AI stream content is too large')
  }
}

export function appendOpenAIStreamBuffer(buffer: string, next: string): string {
  if (buffer.length + next.length > MAX_OPENAI_STREAM_LINE_CHARS) {
    throw new Error('AI stream line is too large')
  }
  return buffer + next
}

function createAbortError(): DOMException {
  return new DOMException('The AI request was cancelled.', 'AbortError')
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return
  throw createAbortError()
}

function raceWithAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) {
    return promise
  }
  throwIfAborted(signal)
  promise.catch(() => undefined)

  return new Promise<T>((resolve, reject) => {
    let settled = false
    const cleanup = () => {
      signal.removeEventListener('abort', abort)
    }
    const settle = (callback: () => void) => {
      if (settled) return
      settled = true
      cleanup()
      callback()
    }
    const abort = () => {
      settle(() => reject(createAbortError()))
    }

    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) {
      abort()
      return
    }

    promise.then(
      (value) => {
        settle(() => {
          try {
            throwIfAborted(signal)
            resolve(value)
          } catch (error) {
            reject(error)
          }
        })
      },
      (error) => {
        settle(() => {
          try {
            throwIfAborted(signal)
            reject(error)
          } catch (abortError) {
            reject(abortError)
          }
        })
      },
    )
  })
}

export function createStreamAccumulator(onChunk: (chunk: string) => void): StreamAccumulator {
  let fullContent = ''
  let reasoningContent = ''
  let assistantContent = ''
  let hasStartedReasoning = false
  let hasFinishedReasoning = false

  return {
    pushDelta(delta) {
      const reasoning = typeof delta.reasoning === 'string' ? delta.reasoning : ''
      const content = typeof delta.content === 'string' ? delta.content : ''

      if (!reasoning && !content) {
        return
      }

      let nextFullContentLength = fullContent.length
      let nextHasStartedReasoning = hasStartedReasoning
      let nextHasFinishedReasoning = hasFinishedReasoning
      if (reasoning) {
        if (!nextHasStartedReasoning || nextHasFinishedReasoning) {
          nextFullContentLength += THINK_OPEN_TAG.length
          nextHasStartedReasoning = true
          nextHasFinishedReasoning = false
        }
        nextFullContentLength += reasoning.length
      }
      if (content) {
        if (nextHasStartedReasoning && !nextHasFinishedReasoning) {
          nextFullContentLength += THINK_CLOSE_TAG.length
          nextHasFinishedReasoning = true
        }
        nextFullContentLength += content.length
      }
      assertOpenAIStreamContentLength(nextFullContentLength)

      if (reasoning) {
        if (!hasStartedReasoning || hasFinishedReasoning) {
          fullContent += THINK_OPEN_TAG
          hasStartedReasoning = true
          hasFinishedReasoning = false
        }
        reasoningContent += reasoning
        fullContent += reasoning
      }

      if (content) {
        if (hasStartedReasoning && !hasFinishedReasoning) {
          fullContent += THINK_CLOSE_TAG
          hasFinishedReasoning = true
        }
        assistantContent += content
        fullContent += content
      }

      onChunk(fullContent)
    },
    finish() {
      if (hasStartedReasoning && !hasFinishedReasoning) {
        assertOpenAIStreamContentLength(fullContent.length + THINK_CLOSE_TAG.length)
        fullContent += THINK_CLOSE_TAG
      }
      return fullContent
    },
    getAssistantTranscriptMessage() {
      if (!reasoningContent) {
        return null
      }

      return {
        role: 'assistant',
        content: assistantContent,
        reasoning_content: reasoningContent,
      }
    },
  }
}

export async function consumeOpenAIStream(
  response: Response,
  onChunk: (chunk: string) => void,
  options?: ConsumeOpenAIStreamOptions
): Promise<string> {
  if (!response.body) {
    throw new Error('Response body is null')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  const accumulator = createStreamAccumulator(onChunk)
  let buffer = ''
  let responseBytesRead = 0
  const cancelReader = () => {
    void reader.cancel(createAbortError()).catch(() => undefined)
  }

  if (options?.signal?.aborted) {
    void reader.cancel(createAbortError()).catch(() => undefined)
    reader.releaseLock()
    throw createAbortError()
  }

  options?.signal?.addEventListener('abort', cancelReader, { once: true })

  const consumeLine = (line: string) => {
    const payload = parsePayloadText(line)
    if (!payload) {
      return
    }

    options?.onPayload?.(payload)
    throwIfAborted(options?.signal)

    const errorMessage = extractErrorMessage(payload)
    if (errorMessage) {
      const mapped = options?.mapErrorPayload?.(errorMessage, extractErrorCode(payload))
      throw typeof mapped === 'string' ? new Error(mapped) : mapped || new Error(errorMessage)
    }

    const delta = extractStreamDelta(payload)
    if (!delta.reasoning && !delta.content) {
      return
    }

    accumulator.pushDelta(delta)
  }

  try {
    while (true) {
      throwIfAborted(options?.signal)
      const { done, value } = await raceWithAbort(reader.read(), options?.signal)
      throwIfAborted(options?.signal)
      if (done) {
        break
      }

      responseBytesRead = addAiStreamResponseChunkBytes(responseBytesRead, value)
      buffer = appendOpenAIStreamBuffer(buffer, decoder.decode(value, { stream: true }))
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        throwIfAborted(options?.signal)
        assertOpenAIStreamLineLength(line)
        consumeLine(line)
        throwIfAborted(options?.signal)
      }
      assertOpenAIStreamLineLength(buffer)
    }

    const finalDecoded = decoder.decode()
    if (finalDecoded) {
      buffer = appendOpenAIStreamBuffer(buffer, finalDecoded)
    }

    if (buffer.trim()) {
      throwIfAborted(options?.signal)
      assertOpenAIStreamLineLength(buffer)
      consumeLine(buffer)
      throwIfAborted(options?.signal)
    }

    const finalContent = accumulator.finish()
    throwIfAborted(options?.signal)
    const transcriptMessage = accumulator.getAssistantTranscriptMessage()
    if (transcriptMessage) {
      options?.onAssistantTranscriptMessage?.(transcriptMessage)
      throwIfAborted(options?.signal)
    }
    return finalContent
  } catch (error) {
    void reader.cancel(createAbortError()).catch(() => undefined)
    if (options?.signal?.aborted && !isErrorNamed(error, 'AbortError')) {
      throw createAbortError()
    }
    throw error
  } finally {
    options?.signal?.removeEventListener('abort', cancelReader)
    reader.releaseLock()
  }
}
