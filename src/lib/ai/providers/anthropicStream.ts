import {
  appendOpenAIStreamBuffer,
  assertOpenAIStreamLineLength,
  MAX_OPENAI_STREAM_ERROR_FIELD_CHARS,
} from '@/lib/ai/streaming'
import {
  createAnthropicStreamAccumulator,
  createAnthropicTextStreamAccumulator,
  type AnthropicStreamResult,
} from './anthropicStreamAccumulator'
import { addAiStreamResponseChunkBytes } from '@/lib/ai/streamingResponseBudget'
import { isErrorNamed, readErrorField } from '@/lib/ai/errorClassification'

export function isAbortError(error: unknown): boolean {
  return isErrorNamed(error, 'AbortError')
}

function createAbortError(): DOMException {
  return new DOMException('Aborted', 'AbortError')
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return
  throw createAbortError()
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

async function raceWithAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return await promise
  throwIfAborted(signal)
  promise.catch(() => undefined)

  return await new Promise<T>((resolve, reject) => {
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

async function consumeAnthropicEventStream(
  response: Response,
  onChunk: (chunk: string) => void,
  signal?: AbortSignal,
  collectBlocks = true,
): Promise<AnthropicStreamResult> {
  if (!response.body) {
    throw new Error('Response body is null')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let responseBytesRead = 0
  const accumulator = collectBlocks
    ? createAnthropicStreamAccumulator(onChunk)
    : createAnthropicTextStreamAccumulator(onChunk)
  let aborted = signal?.aborted ?? false

  const throwIfStreamAborted = () => {
    if (aborted || signal?.aborted) {
      throw createAbortError()
    }
  }

  const abort = () => {
    aborted = true
    void reader.cancel(createAbortError()).catch(() => undefined)
  }

  if (signal?.aborted) {
    void reader.cancel(createAbortError()).catch(() => undefined)
    reader.releaseLock()
    throw createAbortError()
  }

  signal?.addEventListener('abort', abort, { once: true })

  const consumeLine = (line: string) => {
    const trimmed = line.trim()
    const payloadText = trimmed.startsWith('data:')
      ? trimmed.slice(5).trim()
      : trimmed.startsWith('{') ? trimmed : ''
    if (!payloadText || payloadText === '[DONE]') {
      return
    }

    let payload: Record<string, unknown>
    try {
      const parsed: unknown = JSON.parse(payloadText)
      if (!isRecord(parsed)) return
      payload = parsed
    } catch {
      return
    }

    if (payload.type === 'error') {
      const error = payload.error
      const message = readErrorField(error, 'message')
      if (typeof message === 'string') {
        throw new Error(message.slice(0, MAX_OPENAI_STREAM_ERROR_FIELD_CHARS))
      }
    }

    if (
      Array.isArray(payload.content) &&
      (payload.type === 'message' || typeof payload.type !== 'string')
    ) {
      for (const [index, contentBlock] of payload.content.entries()) {
        accumulator.consume({ type: 'content_block_start', index, content_block: contentBlock })
      }
      return
    }

    accumulator.consume(payload)
  }

  try {
    throwIfStreamAborted()
    while (true) {
      const { done, value } = await raceWithAbort(reader.read(), signal)
      throwIfStreamAborted()
      if (done) break
      responseBytesRead = addAiStreamResponseChunkBytes(responseBytesRead, value)
      buffer = appendOpenAIStreamBuffer(buffer, decoder.decode(value, { stream: true }))
      const lines = buffer.split(/\r?\n/)
      buffer = lines.pop() || ''
      for (const line of lines) {
        throwIfStreamAborted()
        assertOpenAIStreamLineLength(line)
        consumeLine(line)
        throwIfStreamAborted()
      }
      assertOpenAIStreamLineLength(buffer)
    }

    const finalDecoded = decoder.decode()
    if (finalDecoded) {
      buffer = appendOpenAIStreamBuffer(buffer, finalDecoded)
    }

    if (buffer.trim()) {
      throwIfStreamAborted()
      assertOpenAIStreamLineLength(buffer)
      consumeLine(buffer)
      throwIfStreamAborted()
    }

    const result = accumulator.finish()
    throwIfStreamAborted()
    return result
  } catch (error) {
    void reader.cancel(createAbortError()).catch(() => undefined)
    if ((aborted || signal?.aborted) && !isAbortError(error)) {
      throw createAbortError()
    }
    throw error
  } finally {
    signal?.removeEventListener('abort', abort)
    reader.releaseLock()
  }
}

export async function consumeAnthropicStreamResult(
  response: Response,
  onChunk: (chunk: string) => void,
  signal?: AbortSignal
): Promise<AnthropicStreamResult> {
  return await consumeAnthropicEventStream(response, onChunk, signal)
}

export async function consumeAnthropicStream(
  response: Response,
  onChunk: (chunk: string) => void,
  signal?: AbortSignal
): Promise<string> {
  return (await consumeAnthropicEventStream(response, onChunk, signal, false)).content
}
