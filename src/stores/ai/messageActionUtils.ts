import type { ApiTranscriptMessage, ChatMessage, MessageVersion } from '@/lib/ai/types'
import { normalizeApiTranscriptMessages } from '@/lib/ai/apiTranscript'
import { generateId } from '@/lib/id'
import { saveSessionJson } from '@/lib/storage/chatStorage'
import {
  MAX_CHAT_MESSAGE_IMAGE_SOURCE_ENTRIES,
  MAX_CHAT_MESSAGE_IMAGE_SOURCES,
} from '@/components/Chat/common/messageClipboard'
import { extractChatMessageImageSources } from '@/lib/ai/chatImageSourcePolicy'
import { stripThinkingContent } from '@/lib/ai/stripThinkingContent'
import { sanitizeWebSearchStatuses } from '@/lib/ai/webSearch/statusMarkup'

const MAX_MESSAGE_VERSIONS = 20
const MAX_VERSION_BRANCH_MESSAGES = 100
const MAX_VERSION_BRANCH_DEPTH = 0
const MAX_MESSAGE_ID_SCAN_NODES = 10000
const MAX_MESSAGE_ID_CHARS = 512
const MAX_MESSAGE_ID_SCAN_BRANCH_DEPTH = 1

export function createMessageVersion(
  content: string,
  createdAt: number,
  kind: MessageVersion['kind'],
  apiTranscript?: ApiTranscriptMessage[],
  webSearchStatuses?: ChatMessage['webSearchStatuses'],
  requestContext?: ChatMessage['requestContext'],
): MessageVersion {
  const normalizedApiTranscript = normalizeApiTranscriptMessages(apiTranscript)
  const normalizedWebSearchStatuses = sanitizeWebSearchStatuses(webSearchStatuses)
  return {
    content,
    createdAt,
    kind,
    subsequentMessages: [],
    ...(normalizedApiTranscript ? { apiTranscript: normalizedApiTranscript } : {}),
    ...(normalizedWebSearchStatuses.length > 0 ? { webSearchStatuses: normalizedWebSearchStatuses } : {}),
    ...(requestContext ? { requestContext } : {}),
  }
}

export function getSafeMessageVersions(message: ChatMessage): MessageVersion[] {
  if (Array.isArray(message.versions) && message.versions.length > 0) {
    return [...message.versions]
  }

  return [createMessageVersion(
    message.content || '',
    message.timestamp || Date.now(),
    'original',
    message.apiTranscript,
    message.webSearchStatuses,
    message.requestContext,
  )]
}

export function getSafeCurrentVersionIndex(message: ChatMessage, versions: MessageVersion[]): number {
  const index = Number.isInteger(message.currentVersionIndex) ? message.currentVersionIndex : 0
  return index >= 0 && index < versions.length ? index : 0
}

export function areJsonValuesEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

export function canMessageUseVersionKind(message: ChatMessage, kind: MessageVersion['kind']): boolean {
  if (message.role === 'assistant') {
    return kind === 'original' || kind === 'regeneration'
  }
  if (message.role === 'user') {
    return kind === 'original' || kind === 'edit'
  }
  return kind === 'original'
}

export function extractStoredImageSources(content: string): string[] {
  return extractChatMessageImageSources(content, {
    maxSources: MAX_CHAT_MESSAGE_IMAGE_SOURCES,
    maxTokens: MAX_CHAT_MESSAGE_IMAGE_SOURCE_ENTRIES,
    persistable: true,
  })
}

export function getNewMessageImageSources(message: Omit<ChatMessage, 'id' | 'timestamp' | 'versions' | 'currentVersionIndex'>): string[] | undefined {
  return extractStoredImageSources(message.content || '')
}

export function hasSession(ai: { sessions: Array<{ id: string }> }, sessionId: string): boolean {
  return ai.sessions.some((session) => session.id === sessionId)
}

export function hasVisibleAssistantReply(content: string): boolean {
  const visibleContent = stripThinkingContent(content || '')
  return visibleContent.length > 0
}

function selectMessageIdScanVersions(message: ChatMessage): MessageVersion[] {
  const versions = Array.isArray(message.versions) ? message.versions : []
  if (versions.length <= MAX_MESSAGE_VERSIONS) {
    return versions
  }

  const activeIndex = getSafeCurrentVersionIndex(message, versions)
  const keepIndexes = new Set<number>([activeIndex])
  for (let index = versions.length - 1; index >= 0 && keepIndexes.size < MAX_MESSAGE_VERSIONS; index -= 1) {
    keepIndexes.add(index)
  }

  return Array.from(keepIndexes)
    .sort((left, right) => left - right)
    .map((index) => versions[index]!)
}

function collectSessionMessageIds(messages: ChatMessage[]): Set<string> {
  const ids = new Set<string>()
  const seenMessages = new Set<ChatMessage>()
  const stack: Array<{ depth: number; messages: ChatMessage[] }> = [{ depth: 0, messages }]

  while (stack.length > 0 && seenMessages.size < MAX_MESSAGE_ID_SCAN_NODES) {
    const frame = stack.pop()!
    for (const message of frame.messages) {
      if (seenMessages.size >= MAX_MESSAGE_ID_SCAN_NODES) {
        break
      }
      if (seenMessages.has(message)) {
        continue
      }
      seenMessages.add(message)
      ids.add(message.id)

      if (frame.depth >= MAX_MESSAGE_ID_SCAN_BRANCH_DEPTH) {
        continue
      }

      for (const version of selectMessageIdScanVersions(message)) {
        if (Array.isArray(version.subsequentMessages) && version.subsequentMessages.length > 0) {
          stack.push({
            depth: frame.depth + 1,
            messages: version.subsequentMessages.slice(0, MAX_VERSION_BRANCH_MESSAGES),
          })
        }
      }
    }
  }

  return ids
}

export function createUniqueMessageId(messages: ChatMessage[], preferredId?: string): string {
  const existingIds = collectSessionMessageIds(messages)
  const normalizedPreferredId = preferredId?.trim().slice(0, MAX_MESSAGE_ID_CHARS) || ''
  if (normalizedPreferredId && !existingIds.has(normalizedPreferredId)) {
    return normalizedPreferredId
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const id = generateId('msg-')
    if (!existingIds.has(id)) {
      return id
    }
  }

  let fallbackIndex = existingIds.size
  let fallbackId = `msg-${Date.now()}-${fallbackIndex}`
  while (existingIds.has(fallbackId)) {
    fallbackIndex += 1
    fallbackId = `msg-${Date.now()}-${fallbackIndex}`
  }
  return fallbackId
}

export function saveSessionJsonInBackground(
  sessionId: string,
  messages: ChatMessage[],
  options?: { mergePersisted?: boolean },
) {
  const request = options
    ? saveSessionJson(sessionId, messages, options)
    : saveSessionJson(sessionId, messages)
  void request.catch(() => {})
}

export function limitMessageVersions(
  versions: MessageVersion[],
  activeIndex: number
): { versions: MessageVersion[]; currentVersionIndex: number } {
  if (versions.length <= MAX_MESSAGE_VERSIONS) {
    return { versions, currentVersionIndex: activeIndex }
  }

  const keepIndexes = new Set<number>([activeIndex])
  for (let index = versions.length - 1; index >= 0 && keepIndexes.size < MAX_MESSAGE_VERSIONS; index -= 1) {
    keepIndexes.add(index)
  }

  const keptIndexes = Array.from(keepIndexes).sort((left, right) => left - right)
  return {
    versions: keptIndexes.map((index) => versions[index]!),
    currentVersionIndex: keptIndexes.indexOf(activeIndex),
  }
}

export function pruneVersionBranchMessages(
  messages: ChatMessage[],
  depth = 0
): ChatMessage[] {
  return messages
    .slice(0, MAX_VERSION_BRANCH_MESSAGES)
    .map((message) => pruneMessageVersionBranches(message, depth))
}

function pruneMessageVersionBranches(message: ChatMessage, depth: number): ChatMessage {
  const versions = getSafeMessageVersions(message)
  const currentVersionIndex = getSafeCurrentVersionIndex(message, versions)
  const limited = limitMessageVersions(versions, currentVersionIndex)
  const shouldKeepNestedBranches = depth < MAX_VERSION_BRANCH_DEPTH

  return {
    ...message,
    versions: limited.versions.map((version) => ({
      ...version,
      subsequentMessages: shouldKeepNestedBranches
        ? pruneVersionBranchMessages(version.subsequentMessages || [], depth + 1)
        : [],
    })),
    currentVersionIndex: limited.currentVersionIndex,
  }
}
