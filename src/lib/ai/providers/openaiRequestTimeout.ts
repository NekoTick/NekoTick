import { createAbortError } from './openaiRuntime'

export interface OpenAIRequestTimeout {
  signal: AbortSignal
  didTimeOut: () => boolean
  cleanup: () => void
}

export function createOpenAIRequestTimeout(
  signal: AbortSignal | undefined,
  timeoutMs: number,
): OpenAIRequestTimeout {
  const controller = new AbortController()
  let timedOut = false
  const timeoutId = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)
  const forwardAbort = () => {
    if (!controller.signal.aborted) controller.abort()
  }
  signal?.addEventListener('abort', forwardAbort, { once: true })
  if (signal?.aborted) forwardAbort()

  return {
    signal: controller.signal,
    didTimeOut: () => timedOut,
    cleanup: () => {
      clearTimeout(timeoutId)
      signal?.removeEventListener('abort', forwardAbort)
    },
  }
}

export function requestTimeoutError(): Error {
  return new Error('The AI request timed out.')
}

export function wrapResponseWithRequestTimeout(
  response: Response,
  timeout: OpenAIRequestTimeout,
): Response {
  if (!response.body) {
    timeout.cleanup()
    return response
  }

  const reader = response.body.getReader()
  let finished = false
  let wrappedController: ReadableStreamDefaultController<Uint8Array> | null = null

  const finish = () => {
    if (finished) return
    finished = true
    timeout.signal.removeEventListener('abort', abort)
    timeout.cleanup()
    try {
      reader.releaseLock()
    } catch {
    }
  }
  const abort = () => {
    if (finished) return
    void reader.cancel(createAbortError()).catch(() => undefined)
    const error = timeout.didTimeOut() ? requestTimeoutError() : createAbortError()
    try {
      wrappedController?.error(error)
    } finally {
      finish()
    }
  }
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      wrappedController = controller
      timeout.signal.addEventListener('abort', abort, { once: true })
      if (timeout.signal.aborted) abort()
    },
    async pull(controller) {
      if (finished) return
      try {
        const { done, value } = await reader.read()
        if (timeout.signal.aborted) {
          abort()
          return
        }
        if (done) {
          controller.close()
          finish()
          return
        }
        controller.enqueue(value)
      } catch (error) {
        if (finished) return
        const nextError = timeout.didTimeOut()
          ? requestTimeoutError()
          : timeout.signal.aborted
            ? createAbortError()
            : error
        try {
          controller.error(nextError)
        } finally {
          finish()
        }
      }
    },
    cancel(reason) {
      void reader.cancel(reason).catch(() => undefined)
      finish()
    },
  })

  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  })
}

export async function runWithOpenAIRequestTimeout<T>(
  signal: AbortSignal | undefined,
  timeoutMs: number,
  request: (requestSignal: AbortSignal) => Promise<T>,
): Promise<T> {
  const timeout = createOpenAIRequestTimeout(signal, timeoutMs)
  try {
    return await request(timeout.signal)
  } catch (error) {
    if (timeout.didTimeOut()) throw requestTimeoutError()
    throw error
  } finally {
    timeout.cleanup()
  }
}
