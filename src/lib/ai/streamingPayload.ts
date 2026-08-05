import {
  MAX_OPENAI_STREAM_ERROR_FIELD_CHARS,
  MAX_OPENAI_STREAM_LINE_CHARS,
} from './streamingLimits'

export interface StreamDeltaPayload {
  reasoning?: string | null
  content?: string | null
}

const MAX_OPENAI_STREAM_TEXT_NODES = 2000

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function extractStreamText(value: unknown): string {
  if (typeof value === 'string') {
    return value
  }

  const parts: string[] = []
  const stack = [value]
  let visitedNodes = 0
  let textLength = 0

  while (stack.length > 0) {
    const current = stack.pop()
    visitedNodes += 1
    if (visitedNodes > MAX_OPENAI_STREAM_TEXT_NODES) {
      return ''
    }

    if (typeof current === 'string') {
      textLength += current.length
      if (textLength > MAX_OPENAI_STREAM_LINE_CHARS) {
        return ''
      }
      parts.push(current)
      continue
    }

    if (Array.isArray(current)) {
      for (let index = current.length - 1; index >= 0; index -= 1) {
        stack.push(current[index])
      }
      continue
    }

    if (!isRecord(current)) {
      continue
    }

    if (typeof current.text === 'string') {
      stack.push(current.text)
    } else if (isRecord(current.text) && typeof current.text.value === 'string') {
      stack.push(current.text.value)
    } else if (typeof current.content === 'string') {
      stack.push(current.content)
    }
  }

  return parts.join('')
}

export function extractErrorMessage(payload: Record<string, unknown>): string {
  const nestedError = payload.error
  if (typeof nestedError === 'string') {
    return nestedError.slice(0, MAX_OPENAI_STREAM_ERROR_FIELD_CHARS)
  }
  if (isRecord(nestedError) && typeof nestedError.message === 'string') {
    return nestedError.message.slice(0, MAX_OPENAI_STREAM_ERROR_FIELD_CHARS)
  }

  return ''
}

export function extractErrorCode(payload: Record<string, unknown>): string | undefined {
  const nestedError = payload.error
  if (isRecord(nestedError) && typeof nestedError.code === 'string') {
    return nestedError.code.slice(0, MAX_OPENAI_STREAM_ERROR_FIELD_CHARS)
  }

  if (typeof payload.errorCode === 'string') {
    return payload.errorCode.slice(0, MAX_OPENAI_STREAM_ERROR_FIELD_CHARS)
  }

  return undefined
}

export function parsePayloadText(text: string): Record<string, unknown> | null {
  const trimmed = text.trim()
  if (!trimmed || trimmed === '[DONE]') {
    return null
  }

  const dataMatch = trimmed.match(/^data:\s*(.*)$/)
  const payloadText = dataMatch ? dataMatch[1] : trimmed
  if (!payloadText || payloadText === '[DONE]') {
    return null
  }

  try {
    const payload: unknown = JSON.parse(payloadText)
    return isRecord(payload) ? payload : null
  } catch {
    return null
  }
}

function extractResponsesApiStreamDelta(payload: Record<string, unknown>): StreamDeltaPayload | null {
  const type = typeof payload.type === 'string' ? payload.type.toLowerCase() : ''
  if (!type.endsWith('.delta')) {
    return null
  }

  const delta = extractStreamText(payload.delta)
  if (!delta) {
    return null
  }

  if (type.includes('reasoning') || type.includes('thinking')) {
    return { reasoning: delta }
  }
  if (type.includes('output_text') || type.includes('content')) {
    return { content: delta }
  }
  return null
}

export function extractStreamDelta(payload: Record<string, unknown>): StreamDeltaPayload {
  const choice = Array.isArray(payload.choices) ? payload.choices[0] : null
  if (!isRecord(choice)) {
    const responseDelta = extractResponsesApiStreamDelta(payload)
    if (responseDelta) {
      return responseDelta
    }

    const output = isRecord(payload.output) ? payload.output : null
    const data = isRecord(payload.data) ? payload.data : null

    return {
      reasoning:
        extractStreamText(
          payload.reasoning_content ??
            payload.reasoning ??
            output?.reasoning_content ??
            output?.reasoning
        ) || null,
      content:
        extractStreamText(
          payload.output_text ??
            payload.response ??
            payload.result ??
            payload.message ??
            output?.text ??
            output?.content ??
            output?.message ??
            data?.content ??
            data?.text
        ) || null,
    }
  }

  const delta = isRecord(choice.delta) ? choice.delta : null
  const message = isRecord(choice.message) ? choice.message : null
  const source = delta ?? message
  if (!source) {
    return {}
  }

  return {
    reasoning: extractStreamText(source.reasoning_content ?? source.reasoning) || null,
    content: extractStreamText(source.content) || null,
  }
}
