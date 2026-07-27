import {
  cancelSessionJsonSave,
  deleteSessionJson,
} from '@/lib/storage/chatStorage'
import {
  isTemporarySession,
  isTemporarySessionId,
  needsAutoTitle,
  shouldPersistSession,
} from '@/lib/ai/temporaryChat'
import { resolveSessionIdAlias } from '@/lib/ai/sessionIdAliases'
import { requestManager } from '@/lib/ai/requestManager'
import { useUnifiedStore } from '../unified/useUnifiedStore'
import { persistLastChatSessionIdForCurrentWindow, useAIUIStore } from './chatState'
import {
  hasSession,
  hasVisibleAssistantReply,
  saveSessionJsonInBackground,
} from './messageActionUtils'

function deleteSessionJsonInBackground(sessionId: string) {
  void deleteSessionJson(sessionId).catch(() => {})
}

export function retractPendingUserRequestAction(
  sessionId: string,
  userMessageId: string,
  assistantMessageId?: string | null
): string | null {
  const targetSessionId = resolveSessionIdAlias(sessionId)
  const state = useUnifiedStore.getState()
  const ai = state.data.ai!
  if (!hasSession(ai, targetSessionId)) return null
  const messages = ai.messages[targetSessionId] || []
  const userIndex = messages.findIndex((message) => message.id === userMessageId)
  if (userIndex === -1) return null

  const userMessage = messages[userIndex]
  if (userMessage.role !== 'user') return null

  let removeEnd = userIndex + 1
  if (assistantMessageId) {
    const assistantIndex = messages.findIndex((message) => message.id === assistantMessageId)
    if (assistantIndex !== -1) {
      const assistantMessage = messages[assistantIndex]
      if (
        assistantMessage.role !== 'assistant' ||
        assistantIndex !== userIndex + 1 ||
        assistantIndex !== messages.length - 1 ||
        hasVisibleAssistantReply(assistantMessage.content)
      ) {
        return null
      }
      removeEnd = assistantIndex + 1
    }
  }

  if (userIndex !== messages.length - 1 && removeEnd !== messages.length) {
    return null
  }

  const newMessages = [
    ...messages.slice(0, userIndex),
    ...messages.slice(removeEnd),
  ]
  const session = ai.sessions.find((item) => item.id === targetSessionId)
  const currentSessionId = useAIUIStore.getState().currentSessionId
  const shouldRollbackSessionToNewChat =
    newMessages.length === 0 &&
    userIndex === 0 &&
    currentSessionId !== null &&
    resolveSessionIdAlias(currentSessionId) === targetSessionId &&
    needsAutoTitle(session?.title) &&
    !isTemporarySessionId(targetSessionId) &&
    !isTemporarySession(session)

  if (shouldRollbackSessionToNewChat) {
    const nextMessages = { ...ai.messages }
    delete nextMessages[targetSessionId]
    cancelSessionJsonSave(targetSessionId)
    requestManager.abort(targetSessionId)
    useAIUIStore.getState().clearSessionState(targetSessionId)
    useAIUIStore.getState().setChatSelection({
      currentSessionId: null,
      temporaryChatEnabled: false,
    })
    persistLastChatSessionIdForCurrentWindow(null)

    state.updateAIData({
      sessions: ai.sessions.filter((item) => item.id !== targetSessionId),
      messages: nextMessages,
      unreadSessionIds: (ai.unreadSessionIds || []).filter((id) => id !== targetSessionId),
    })
    deleteSessionJsonInBackground(targetSessionId)
    return userMessage.content
  }

  state.updateAIData({
    messages: { ...ai.messages, [targetSessionId]: newMessages }
  }, true)

  if (shouldPersistSession(ai, targetSessionId)) {
    saveSessionJsonInBackground(targetSessionId, newMessages, { mergePersisted: false })
  }

  return userMessage.content
}
