import type { ApiTranscriptMessage, ChatSendOptions } from '../types'
import { isErrorNamed } from '../errorClassification'
import { createAIError } from '../errors'
import { AIErrorType } from '../types'
import { readBoundedProviderJsonResponse, readBoundedProviderResponseText } from './boundedResponseText'

function isLikelyHtmlErrorContent(content: string): boolean {
  const normalized = content.slice(0, 2000).trim().toLowerCase()
  const hasCloudflareErrorShell =
    normalized.includes('cloudflare') &&
    (normalized.includes('error code') ||
      normalized.includes('cf-wrapper') ||
      normalized.includes('performance & security by'))
  return (
    normalized.startsWith('<!doctype html') ||
    normalized.startsWith('<html') ||
    normalized.includes('<title>') ||
    hasCloudflareErrorShell ||
    normalized.includes('error code 524')
  )
}

export function rejectHtmlErrorContent(content: string): string {
  if (isLikelyHtmlErrorContent(content)) {
    throw createAIError(AIErrorType.SERVER_ERROR, 'UPSTREAM_UNAVAILABLE')
  }
  return content
}

export function isAbortError(error: unknown): boolean {
  return isErrorNamed(error, 'AbortError')
}

export function createAbortError(): DOMException {
  return new DOMException('Aborted', 'AbortError')
}

export function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return
  throw createAbortError()
}

export function emitChunk(onChunk: (chunk: string) => void, signal: AbortSignal | undefined, chunk: string): void {
  throwIfAborted(signal)
  onChunk(chunk)
  throwIfAborted(signal)
}

export function emitApiTranscript(
  onApiTranscript: ChatSendOptions['onApiTranscript'] | undefined,
  signal: AbortSignal | undefined,
  messages: ApiTranscriptMessage[]
): void {
  throwIfAborted(signal)
  onApiTranscript?.(messages)
  throwIfAborted(signal)
}

export function emitWebSearchStatus(
  onWebSearchStatus: ChatSendOptions['onWebSearchStatus'] | undefined,
  signal: AbortSignal | undefined,
  status: Parameters<NonNullable<ChatSendOptions['onWebSearchStatus']>>[0]
): void {
  throwIfAborted(signal)
  onWebSearchStatus?.(status)
  throwIfAborted(signal)
}

export function createHtmlRejectingChunkHandler(onChunk: (chunk: string) => void, signal?: AbortSignal): (chunk: string) => void {
  return (chunk) => {
    rejectHtmlErrorContent(chunk)
    emitChunk(onChunk, signal, chunk)
  }
}

export async function readResponseTextOrFallback(response: Response, signal?: AbortSignal): Promise<string> {
  return await readBoundedProviderResponseText(response, signal)
}

export async function readResponseJson<T>(response: Response, signal?: AbortSignal): Promise<T> {
  return await readBoundedProviderJsonResponse<T>(response, signal)
}
