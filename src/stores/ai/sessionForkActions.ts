import type { ChatMessage, ChatSession } from '@/lib/ai/types'
import { generateId } from '@/lib/id'
import { saveSessionJson } from '@/lib/storage/chatStorage'
import { isTemporarySession, isTemporarySessionId } from '@/lib/ai/temporaryChat'
import { resolveSessionIdAlias } from '@/lib/ai/sessionIdAliases'
import { useUnifiedStore } from '../unified/useUnifiedStore'
import {
  filterUnreadSessionIds,
  persistLastChatSessionIdForCurrentWindow,
  stripTemporaryForMutation,
  useAIUIStore,
} from './chatState'
import { persistInlineImageSourcesForSessionInBackground } from './sessionInlineImagePersistence'

function saveSessionJsonInBackground(sessionId: string, messages: ChatMessage[]) {
  void saveSessionJson(sessionId, messages).catch(() => {})
}

function cloneJsonValue<T>(value: T | undefined): T | undefined {
  if (value === undefined) {
    return undefined
  }

  return JSON.parse(JSON.stringify(value)) as T
}

function createForkSessionTitle(
  sourceTitle: string | undefined,
  sessions: readonly ChatSession[],
): string {
  const normalizedTitle = sourceTitle?.trim()
  const existingTitles = new Set(sessions.map((session) => session.title.trim()))
  const rawBaseTitle = normalizedTitle || 'Chat'
  const numberedTitleMatch = /^(.*\S)\s+([1-9]\d*)$/.exec(rawBaseTitle)
  const baseTitle = numberedTitleMatch && existingTitles.has(numberedTitleMatch[1])
    ? numberedTitleMatch[1]
    : rawBaseTitle

  for (let suffix = 1; suffix < 10000; suffix += 1) {
    const suffixText = ` ${suffix}`
    const maxBaseLength = Math.max(1, 120 - suffixText.length)
    const candidateBase = baseTitle.length > maxBaseLength
      ? baseTitle.slice(0, maxBaseLength).trimEnd()
      : baseTitle
    const candidateTitle = `${candidateBase}${suffixText}`
    if (!existingTitles.has(candidateTitle)) {
      return candidateTitle
    }
  }

  return `${baseTitle.slice(0, 102).trimEnd()} ${Date.now()}`
}

function createForkMessageId(existingIds: Set<string>): string {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const id = generateId('msg-')
    if (!existingIds.has(id)) {
      existingIds.add(id)
      return id
    }
  }

  let fallbackIndex = existingIds.size
  let fallbackId = `msg-${Date.now()}-${fallbackIndex}`
  while (existingIds.has(fallbackId)) {
    fallbackIndex += 1
    fallbackId = `msg-${Date.now()}-${fallbackIndex}`
  }
  existingIds.add(fallbackId)
  return fallbackId
}

function cloneMessageForFork(message: ChatMessage, existingIds: Set<string>): ChatMessage {
  const timestamp = message.timestamp || Date.now()
  const apiTranscript = cloneJsonValue(message.apiTranscript)
  const requestContext = cloneJsonValue(message.requestContext)
  const webSearchStatuses = cloneJsonValue(message.webSearchStatuses)
  return {
    ...message,
    id: createForkMessageId(existingIds),
    apiTranscript,
    requestContext,
    webSearchStatuses,
    imageSources: message.imageSources ? [...message.imageSources] : undefined,
    timestamp,
    versions: [{
      content: message.content || '',
      createdAt: timestamp,
      kind: 'original',
      subsequentMessages: [],
      ...(apiTranscript ? { apiTranscript: cloneJsonValue(apiTranscript) } : {}),
      ...(requestContext ? { requestContext: cloneJsonValue(requestContext) } : {}),
      ...(webSearchStatuses ? { webSearchStatuses: cloneJsonValue(webSearchStatuses) } : {}),
    }],
    currentVersionIndex: 0,
  }
}

export function forkSessionFromMessage(sessionId: string, messageId: string) {
  const targetSessionId = resolveSessionIdAlias(sessionId)
  const state = useUnifiedStore.getState()
  const ai = state.data.ai!
  const uiState = useAIUIStore.getState()
  const sourceSession = ai.sessions.find((session) => session.id === targetSessionId)
  if (!sourceSession) {
    return null
  }

  const sourceMessages = ai.messages[targetSessionId] || []
  const messageIndex = sourceMessages.findIndex((message) => message.id === messageId)
  if (messageIndex === -1 || sourceMessages[messageIndex]?.role !== 'assistant') {
    return null
  }

  const forkedMessageIds = new Set<string>()
  const forkedMessages = sourceMessages
    .slice(0, messageIndex + 1)
    .map((message) => cloneMessageForFork(message, forkedMessageIds))
  const now = Date.now()
  const forkedSessionId = generateId('session-')
  const shouldStripTemporary =
    uiState.temporaryChatEnabled || isTemporarySessionId(targetSessionId) || isTemporarySession(sourceSession)
  const baseAI = shouldStripTemporary
    ? stripTemporaryForMutation(ai)
    : ai
  const forkedSession: ChatSession = {
    id: forkedSessionId,
    title: createForkSessionTitle(sourceSession.title, baseAI.sessions),
    modelId: sourceSession.modelId || sourceMessages[messageIndex]?.modelId || ai.selectedModelId || '',
    createdAt: now,
    updatedAt: now,
  }

  const nextSessions = [forkedSession, ...baseAI.sessions]
  const nextMessages = {
    ...baseAI.messages,
    [forkedSessionId]: forkedMessages,
  }
  const baseUnreadSessionIds = shouldStripTemporary
    ? filterUnreadSessionIds(ai.unreadSessionIds, baseAI.sessions.map((session) => session.id))
    : ai.unreadSessionIds

  state.updateAIData({
    sessions: nextSessions,
    messages: nextMessages,
    unreadSessionIds: filterUnreadSessionIds(baseUnreadSessionIds, nextSessions.map((session) => session.id)),
  })
  uiState.setTemporaryReturnSessionId(null)
  uiState.setChatSelection({
    currentSessionId: forkedSessionId,
    temporaryChatEnabled: false,
  })
  persistLastChatSessionIdForCurrentWindow(forkedSessionId)

  saveSessionJsonInBackground(forkedSessionId, forkedMessages)
  persistInlineImageSourcesForSessionInBackground(forkedSessionId)
  return forkedSessionId
}
