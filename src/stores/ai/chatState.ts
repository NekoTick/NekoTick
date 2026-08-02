import { create } from 'zustand'
import { useUnifiedStore } from '../unified/useUnifiedStore'
import type { ChatMessage, ChatSession } from '@/lib/ai/types'
import { generateId } from '@/lib/id'
import { saveSessionJson } from '@/lib/storage/chatStorage'
import {
  createTemporarySession,
  isTemporarySession,
  isTemporarySessionId,
  stripTemporaryData,
} from '@/lib/ai/temporaryChat'
import { resolveSessionIdAlias } from '@/lib/ai/sessionIdAliases'
import { requestManager } from '@/lib/ai/requestManager'
import { readWindowLaunchContext } from '@/lib/desktop/launchContext'
import { translate } from '@/lib/i18n'

export interface AIUIState {
  generatingSessions: Record<string, boolean>;
  unreadSessions: Record<string, boolean>;
  error: string | null;
  currentSessionId: string | null;
  temporaryChatEnabled: boolean;
  selectionInitialized: boolean;
  temporaryReturnSessionId: string | null;
  authPromptSessionId: string | null;
  setSessionLoading: (sessionId: string, loading: boolean) => void;
  markSessionUnread: (sessionId: string) => void;
  markSessionRead: (sessionId: string) => void;
  setError: (error: string | null) => void;
  initializeSelection: (selection: { currentSessionId: string | null; temporaryChatEnabled: boolean }) => void;
  setChatSelection: (selection: { currentSessionId: string | null; temporaryChatEnabled: boolean }) => void;
  setCurrentSessionId: (sessionId: string | null) => void;
  setTemporaryChatEnabled: (enabled: boolean) => void;
  setTemporaryReturnSessionId: (sessionId: string | null) => void;
  setAuthPromptSessionId: (sessionId: string | null) => void;
  moveSessionState: (fromSessionId: string, toSessionId: string) => void;
  clearSessionState: (sessionId: string) => void;
}

function saveSessionJsonInBackground(sessionId: string, messages: ChatMessage[]) {
  void saveSessionJson(sessionId, messages).catch(() => {})
}

function shouldPersistLastChatSessionForCurrentWindow() {
  const launchContext = readWindowLaunchContext()
  return !launchContext.isNewWindow
}

export function persistLastChatSessionIdForCurrentWindow(sessionId: string | null) {
  if (!shouldPersistLastChatSessionForCurrentWindow()) {
    return
  }

  const store = useUnifiedStore.getState()
  const resolvedSessionId = sessionId ? resolveSessionIdAlias(sessionId) : null
  const normalizedSessionId =
    resolvedSessionId &&
    !isTemporarySessionId(resolvedSessionId) &&
    store.data.ai?.sessions.some((session) => session.id === resolvedSessionId && !isTemporarySession(session))
      ? resolvedSessionId
      : null

  store.setLastChatSessionId(normalizedSessionId)
}

interface ChatMutationState {
  sessions: ChatSession[];
  messages: Record<string, ChatMessage[]>;
}

interface TemporaryMutationState extends ChatMutationState {
  selectedModelId?: string | null;
  unreadSessionIds?: string[];
}

function uniqueSessionIds(sessionIds: string[]) {
  return Array.from(new Set(sessionIds))
}

export function filterUnreadSessionIds(unreadSessionIds: string[] | undefined, sessionIds: string[]) {
  const allowedIds = new Set(sessionIds)
  return uniqueSessionIds((unreadSessionIds || []).filter((sessionId) => allowedIds.has(sessionId)))
}

function revokeComputerUseForSelectionChange() {
  const store = useUnifiedStore.getState()
  if (store.data.ai?.computerUseEnabled) {
    store.updateAIData({ computerUseEnabled: false })
  }
}

export const useAIUIStore = create<AIUIState>((set, get) => ({
  generatingSessions: {},
  unreadSessions: {},
  error: null,
  currentSessionId: null,
  temporaryChatEnabled: false,
  selectionInitialized: false,
  temporaryReturnSessionId: null,
  authPromptSessionId: null,
  setSessionLoading: (id, loading) => set((state) => {
    const resolvedId = resolveSessionIdAlias(id)
    const generatingSessions = { ...state.generatingSessions }
    if (loading) {
      generatingSessions[resolvedId] = true
    } else {
      delete generatingSessions[resolvedId]
    }
    return { generatingSessions }
  }),
  markSessionUnread: (id) => {
    const resolvedId = resolveSessionIdAlias(id)
    set((state) => ({
      unreadSessions: { ...state.unreadSessions, [resolvedId]: true }
    }))

    const store = useUnifiedStore.getState()
    const ai = store.data.ai
    if (!ai) {
      return
    }

    const session = ai.sessions.find((item) => item.id === resolvedId)
    if (!session || isTemporarySessionId(resolvedId) || isTemporarySession(session)) {
      return
    }

    const nextUnreadSessionIds = uniqueSessionIds([...(ai.unreadSessionIds || []), resolvedId])
    if (nextUnreadSessionIds.length === (ai.unreadSessionIds || []).length) {
      return
    }

    store.updateAIData({ unreadSessionIds: nextUnreadSessionIds })
  },
  markSessionRead: (id) => {
    const resolvedId = resolveSessionIdAlias(id)
    set((state) => {
      const newUnread = { ...state.unreadSessions }
      delete newUnread[id]
      delete newUnread[resolvedId]
      return { unreadSessions: newUnread }
    })

    const store = useUnifiedStore.getState()
    const ai = store.data.ai
    if (!ai || !(ai.unreadSessionIds || []).includes(resolvedId)) {
      return
    }

    store.updateAIData({
      unreadSessionIds: (ai.unreadSessionIds || []).filter((sessionId) => sessionId !== resolvedId)
    })
  },
  setError: (error: string | null) => set({ error }),
  initializeSelection: ({ currentSessionId, temporaryChatEnabled }) => {
    if (get().selectionInitialized) return
    revokeComputerUseForSelectionChange()
    set({ currentSessionId, temporaryChatEnabled, selectionInitialized: true })
  },
  setChatSelection: ({ currentSessionId, temporaryChatEnabled }) => {
    const current = get()
    if (current.currentSessionId !== currentSessionId || current.temporaryChatEnabled !== temporaryChatEnabled) {
      revokeComputerUseForSelectionChange()
    }
    set({ currentSessionId, temporaryChatEnabled, selectionInitialized: true })
  },
  setCurrentSessionId: (currentSessionId) => {
    if (get().currentSessionId !== currentSessionId) revokeComputerUseForSelectionChange()
    set({ currentSessionId, selectionInitialized: true })
  },
  setTemporaryChatEnabled: (temporaryChatEnabled) => {
    if (get().temporaryChatEnabled !== temporaryChatEnabled) revokeComputerUseForSelectionChange()
    set({ temporaryChatEnabled, selectionInitialized: true })
  },
  setTemporaryReturnSessionId: (sessionId) => set({ temporaryReturnSessionId: sessionId }),
  setAuthPromptSessionId: (sessionId) => set({
    authPromptSessionId: sessionId ? resolveSessionIdAlias(sessionId) : null,
  }),
  moveSessionState: (fromSessionId, toSessionId) => set((state) => {
    const generatingSessions = { ...state.generatingSessions }
    const unreadSessions = { ...state.unreadSessions }
    const authPromptSessionId = state.authPromptSessionId === fromSessionId
      ? toSessionId
      : state.authPromptSessionId

    if (generatingSessions[fromSessionId]) {
      delete generatingSessions[fromSessionId]
      generatingSessions[toSessionId] = true
    }

    if (unreadSessions[fromSessionId]) {
      delete unreadSessions[fromSessionId]
      unreadSessions[toSessionId] = true
    }

    return { generatingSessions, unreadSessions, authPromptSessionId }
  }),
  clearSessionState: (sessionId) => set((state) => {
    const resolvedSessionId = resolveSessionIdAlias(sessionId)
    const generatingSessions = { ...state.generatingSessions }
    const unreadSessions = { ...state.unreadSessions }
    delete generatingSessions[sessionId]
    delete unreadSessions[sessionId]
    delete generatingSessions[resolvedSessionId]
    delete unreadSessions[resolvedSessionId]
    const authPromptSessionId =
      state.authPromptSessionId === sessionId || state.authPromptSessionId === resolvedSessionId
        ? null
        : state.authPromptSessionId
    return { generatingSessions, unreadSessions, authPromptSessionId }
  }),
}))

function clearTemporaryUIState(sessionIds: string[]) {
  const uiState = useAIUIStore.getState()
  sessionIds.forEach((id) => {
    requestManager.abort(id)
    uiState.clearSessionState(id)
  })
}

export function stripTemporaryForMutation(ai: ChatMutationState) {
  const stripped = stripTemporaryData(ai)
  clearTemporaryUIState(stripped.temporarySessionIds)
  return stripped
}

export function buildTemporarySessionState(
  stripped: ChatMutationState,
  modelId: string
) {
  const temporarySession = createTemporarySession(modelId)
  return {
    sessions: [temporarySession, ...stripped.sessions],
    messages: { ...stripped.messages, [temporarySession.id]: [] },
    currentSessionId: temporarySession.id
  }
}

export function createAIChatSession(title = translate('chat.newChatTitle')): string {
  const state = useUnifiedStore.getState()
  const ai = state.data.ai! as TemporaryMutationState
  const uiState = useAIUIStore.getState()
  const now = Date.now()

  if (uiState.temporaryChatEnabled) {
    const stripped = stripTemporaryForMutation(ai)
    const temporaryState = buildTemporarySessionState(stripped, ai.selectedModelId || '')

    state.updateAIData({
      sessions: temporaryState.sessions,
      messages: temporaryState.messages,
      unreadSessionIds: filterUnreadSessionIds(ai.unreadSessionIds, temporaryState.sessions.map((session) => session.id))
    }, true)
    uiState.setChatSelection({
      currentSessionId: temporaryState.currentSessionId,
      temporaryChatEnabled: true,
    })
    return temporaryState.currentSessionId
  }

  const id = generateId('session-')
  const newSession: ChatSession = {
    id,
    title,
    modelId: ai.selectedModelId || '',
    createdAt: now,
    updatedAt: now
  }

  state.updateAIData({
    sessions: [newSession, ...ai.sessions],
    messages: { ...ai.messages, [id]: [] },
    unreadSessionIds: filterUnreadSessionIds(ai.unreadSessionIds, [id, ...ai.sessions.map((session) => session.id)])
  })
  uiState.setChatSelection({ currentSessionId: id, temporaryChatEnabled: false })
  persistLastChatSessionIdForCurrentWindow(id)

  saveSessionJsonInBackground(id, [])
  return id
}
