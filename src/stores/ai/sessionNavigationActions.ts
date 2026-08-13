import type { ChatSession } from '@/lib/ai/types'
import { translate } from '@/lib/i18n'
import { hasSessionJson, loadSessionJson } from '@/lib/storage/chatStorage'
import { isTemporarySessionId } from '@/lib/ai/temporaryChat'
import { runWithSessionMutationLock } from '@/lib/ai/sessionMutationLock'
import { useUnifiedStore } from '../unified/useUnifiedStore'
import {
  filterUnreadSessionIds,
  persistLastChatSessionIdForCurrentWindow,
  stripTemporaryForMutation,
  useAIUIStore,
} from './chatState'
import { awaitStartedOrCancelQueuedSessionPrefetch } from './sessionPrefetchActions'
import { limitLoadedChatSessionMessages } from './sessionMessageCache'
import { scheduleInlineImagePersistence } from './sessionInlineImagePersistence'

let switchSessionGeneration = 0

function getAvailableSessionModelId(
  ai: NonNullable<ReturnType<typeof useUnifiedStore.getState>['data']['ai']>,
  session: ChatSession | undefined,
): string | null {
  const modelId = session?.modelId
  if (!modelId) return null

  const model = ai.models.find((item) => item.id === modelId)
  if (!model || model.enabled === false) return null

  const provider = ai.providers.find((item) => item.id === model.providerId)
  return provider?.enabled === false ? null : model.id
}

function restoreSessionModelSelection(sessionId: string): void {
  const state = useUnifiedStore.getState()
  const ai = state.data.ai!
  const session = ai.sessions.find((item) => item.id === sessionId)
  const modelId = getAvailableSessionModelId(ai, session)
  if (!modelId || ai.selectedModelId === modelId) {
    return
  }

  state.updateAIData({ selectedModelId: modelId })
}

export async function switchSession(sessionId: string) {
  switchSessionGeneration += 1
  const myGeneration = switchSessionGeneration
  const state = useUnifiedStore.getState()
  const ai = state.data.ai!
  const uiState = useAIUIStore.getState()

  if (uiState.temporaryChatEnabled && !isTemporarySessionId(sessionId)) {
    const stripped = stripTemporaryForMutation(ai)
    uiState.setTemporaryReturnSessionId(null)

    state.updateAIData({
      sessions: stripped.sessions,
      messages: stripped.messages,
      unreadSessionIds: filterUnreadSessionIds(ai.unreadSessionIds, stripped.sessions.map((session) => session.id)),
    }, true)
    uiState.setChatSelection({ currentSessionId: sessionId, temporaryChatEnabled: false })
    restoreSessionModelSelection(sessionId)
  } else {
    uiState.setCurrentSessionId(sessionId)
    if (isTemporarySessionId(sessionId)) {
      if (!(sessionId in ai.messages)) {
        const freshState = useUnifiedStore.getState()
        freshState.updateAIData({
          messages: {
            ...freshState.data.ai!.messages,
            [sessionId]: []
          }
        }, true)
      }
      return
    }
    restoreSessionModelSelection(sessionId)
  }

  const latestAI = useUnifiedStore.getState().data.ai!
  if (!(sessionId in latestAI.messages)) {
    const reusedActivePrefetch = await awaitStartedOrCancelQueuedSessionPrefetch(sessionId)
    if (switchSessionGeneration !== myGeneration) return
    if (reusedActivePrefetch && sessionId in (useUnifiedStore.getState().data.ai?.messages ?? {})) {
      persistLastChatSessionIdForCurrentWindow(sessionId)
      scheduleInlineImagePersistence(sessionId)
      return
    }
    const loadedMessages = await loadSessionJson(sessionId)
    if (switchSessionGeneration !== myGeneration) return
    const freshState = useUnifiedStore.getState()
    const freshAI = freshState.data.ai!
    if (!freshAI.sessions.some((session) => session.id === sessionId) || sessionId in freshAI.messages) {
      return
    }
    if (!loadedMessages && await hasSessionJson(sessionId)) {
      useAIUIStore.getState().setError(translate('chat.error.sessionLoadFailed'));
      return
    }
    const latestUIState = useAIUIStore.getState()
    const protectedSessionIds = [
      sessionId,
      latestUIState.currentSessionId,
      ...Object.keys(latestUIState.generatingSessions),
    ]
    freshState.updateAIData({
      messages: limitLoadedChatSessionMessages(
        {
          ...freshAI.messages,
          [sessionId]: loadedMessages || []
        },
        freshAI.sessions,
        protectedSessionIds,
      )
    }, true)
  }
  persistLastChatSessionIdForCurrentWindow(sessionId)
  scheduleInlineImagePersistence(sessionId)
}

export function updateSession(id: string, updates: Partial<ChatSession>) {
  void runWithSessionMutationLock(id, async () => {
    const state = useUnifiedStore.getState()
    const ai = state.data.ai!
    const existingSession = ai.sessions.find((session) => session.id === id)
    if (!existingSession) {
      return
    }

    const hasSessionChanges = (Object.entries(updates) as Array<[keyof ChatSession, ChatSession[keyof ChatSession]]>)
      .some(([key, value]) => !Object.is(existingSession[key], value))
    if (!hasSessionChanges) {
      return
    }

    state.updateAIData({
      sessions: ai.sessions.map((session) =>
        session.id === id ? { ...session, ...updates, updatedAt: Date.now() } : session
      )
    })
  })
}
