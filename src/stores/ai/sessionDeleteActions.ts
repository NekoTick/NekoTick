import { translate } from '@/lib/i18n'
import {
  cancelSessionJsonSave,
  deleteSessionJson,
} from '@/lib/storage/chatStorage'
import { requestManager } from '@/lib/ai/requestManager'
import { isTemporarySession, isTemporarySessionId } from '@/lib/ai/temporaryChat'
import {
  runWithSessionMutationLock,
  runWithSessionMutationLocks,
} from '@/lib/ai/sessionMutationLock'
import { useUnifiedStore } from '../unified/useUnifiedStore'
import {
  buildTemporarySessionState,
  filterUnreadSessionIds,
  persistLastChatSessionIdForCurrentWindow,
  stripTemporaryForMutation,
  useAIUIStore,
} from './chatState'
import { MAX_CHAT_SESSION_DELETE_CONCURRENCY } from './sessionInlineImageConstants'
import { settleWithConcurrencyLimit } from './sessionInlineImagePersistence'
import {
  deleteStoredAttachmentFiles,
  findUnreferencedAttachmentFilenames,
} from './sessionAttachmentCleanup'

function isAttachmentCleanupSnapshotCurrent(
  snapshot: NonNullable<ReturnType<typeof useUnifiedStore.getState>['data']['ai']>,
): boolean {
  const current = useUnifiedStore.getState().data.ai
  return current?.sessions === snapshot.sessions && current.messages === snapshot.messages
}

export async function deleteSession(id: string) {
  const state = useUnifiedStore.getState()
  const ai = state.data.ai!
  const uiState = useAIUIStore.getState()

  requestManager.abort(id)
  uiState.setSessionLoading(id, false)

  if (isTemporarySessionId(id)) {
    cancelSessionJsonSave(id)
    uiState.clearSessionState(id)

    const stripped = stripTemporaryForMutation(ai)

    if (uiState.temporaryChatEnabled) {
      const temporaryState = buildTemporarySessionState(stripped, ai.selectedModelId || '')
      state.updateAIData({
        sessions: temporaryState.sessions,
        messages: temporaryState.messages,
        unreadSessionIds: filterUnreadSessionIds(ai.unreadSessionIds, temporaryState.sessions.map((session) => session.id)),
      }, true)
      uiState.setChatSelection({
        currentSessionId: temporaryState.currentSessionId,
        temporaryChatEnabled: true,
      })
    } else {
      state.updateAIData({
        sessions: stripped.sessions,
        messages: stripped.messages,
        unreadSessionIds: filterUnreadSessionIds(ai.unreadSessionIds, stripped.sessions.map((session) => session.id)),
      }, true)
      if (uiState.currentSessionId === id) {
        uiState.setCurrentSessionId(null)
      }
    }
    return
  }

  await runWithSessionMutationLock(id, async () => {
    const latestState = useUnifiedStore.getState()
    const latestAI = latestState.data.ai!
    const latestUIState = useAIUIStore.getState()

    if (!latestAI.sessions.some((session) => session.id === id)) {
      return
    }

    const attachmentFilenames = await findUnreferencedAttachmentFilenames(latestAI, new Set([id]))

    try {
      await deleteSessionJson(id)
    } catch (error) {
      latestUIState.setError(translate('chat.error.deleteSessionFailed'));
      throw error
    }
    if (isAttachmentCleanupSnapshotCurrent(latestAI)) {
      await deleteStoredAttachmentFiles(attachmentFilenames)
    }

    cancelSessionJsonSave(id)
    latestUIState.clearSessionState(id)

    const newSessions = latestAI.sessions.filter((session) => session.id !== id)
    const newMessages = { ...latestAI.messages }
    delete newMessages[id]

    latestState.updateAIData({
      sessions: newSessions,
      messages: newMessages,
      unreadSessionIds: (latestAI.unreadSessionIds || []).filter((sessionId) => sessionId !== id),
    })
    const nextCurrentSessionId = latestUIState.currentSessionId === id
      ? null
      : latestUIState.currentSessionId
    if (latestUIState.currentSessionId === id) {
      latestUIState.setCurrentSessionId(null)
    }
    persistLastChatSessionIdForCurrentWindow(nextCurrentSessionId)
  })
}

export async function clearSessions() {
  const state = useUnifiedStore.getState()
  const ai = state.data.ai!
  const sessionIds = ai.sessions.map((session) => session.id)
  const initialUIState = useAIUIStore.getState()

  sessionIds.forEach((sessionId) => {
    requestManager.abort(sessionId)
    initialUIState.setSessionLoading(sessionId, false)
  })

  await runWithSessionMutationLocks(sessionIds, async () => {
    const latestState = useUnifiedStore.getState()
    const latestAI = latestState.data.ai!
    const uiState = useAIUIStore.getState()

    const persistentSessions = latestAI.sessions.filter((session) => !isTemporarySession(session))
    const attachmentFilenames = await findUnreferencedAttachmentFilenames(
      latestAI,
      new Set(latestAI.sessions.map((session) => session.id)),
    )
    try {
      const deleteResults = await settleWithConcurrencyLimit(
        persistentSessions,
        MAX_CHAT_SESSION_DELETE_CONCURRENCY,
        (session) => deleteSessionJson(session.id)
      )
      const firstError = deleteResults.find((result): result is PromiseRejectedResult =>
        result.status === 'rejected'
      )?.reason
      if (firstError) {
        throw firstError
      }
    } catch (error) {
      uiState.setError(translate('chat.error.clearSessionsFailed'));
      throw error
    }
    if (isAttachmentCleanupSnapshotCurrent(latestAI)) {
      await deleteStoredAttachmentFiles(attachmentFilenames)
    }

    latestAI.sessions.forEach((session) => {
      cancelSessionJsonSave(session.id)
      uiState.clearSessionState(session.id)
    })

    if (uiState.temporaryChatEnabled) {
      stripTemporaryForMutation(latestAI)
      const temporaryState = buildTemporarySessionState({ sessions: [], messages: {} }, latestAI.selectedModelId || '')
      const shouldPersistClear = persistentSessions.length > 0
      latestState.updateAIData({
        sessions: temporaryState.sessions,
        messages: temporaryState.messages,
        unreadSessionIds: [],
      }, !shouldPersistClear)
      uiState.setChatSelection({
        currentSessionId: temporaryState.currentSessionId,
        temporaryChatEnabled: true,
      })
      return
    }

    if (
      persistentSessions.length === 0 &&
      latestAI.sessions.length === 0 &&
      Object.keys(latestAI.messages || {}).length === 0 &&
      (latestAI.unreadSessionIds || []).length === 0
    ) {
      uiState.setChatSelection({ currentSessionId: null, temporaryChatEnabled: false })
      persistLastChatSessionIdForCurrentWindow(null)
      return
    }

    latestState.updateAIData({ sessions: [], messages: {}, unreadSessionIds: [] })
    uiState.setChatSelection({ currentSessionId: null, temporaryChatEnabled: false })
    persistLastChatSessionIdForCurrentWindow(null)
  })
}
