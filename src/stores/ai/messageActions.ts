import type { ChatMessage } from '@/lib/ai/types'
import {
  shouldPersistSession,
} from '@/lib/ai/temporaryChat'
import { resolveSessionIdAlias } from '@/lib/ai/sessionIdAliases'
import { useUnifiedStore } from '../unified/useUnifiedStore'
import { useAIUIStore } from './chatState'
import {
  canMessageUseVersionKind,
  createMessageVersion,
  createUniqueMessageId,
  extractStoredImageSources,
  getNewMessageImageSources,
  getSafeCurrentVersionIndex,
  getSafeMessageVersions,
  hasSession,
  limitMessageVersions,
  pruneVersionBranchMessages,
  saveSessionJsonInBackground,
} from './messageActionUtils'
import { retractPendingUserRequestAction } from './messageRetractAction'
import {
  updateMessageAction,
  updateMessageApiTranscriptAction,
  updateMessageWebSearchStatusAction,
} from './messageUpdateActions'

interface AddMessageOptions {
  persistUnified?: boolean
  touchSession?: boolean
}


export function createMessageActions() {
  return {
    addMessage: (
      message: Omit<ChatMessage, 'id' | 'timestamp' | 'versions' | 'currentVersionIndex'> & { id?: string },
      sessionId?: string,
      options?: AddMessageOptions,
    ) => {
      const state = useUnifiedStore.getState()
      const ai = state.data.ai!
      const rawSessionId = sessionId || useAIUIStore.getState().currentSessionId
      if (!rawSessionId) return
      const targetSessionId = resolveSessionIdAlias(rawSessionId)
      if (!hasSession(ai, targetSessionId)) return
      const persistUnified = options?.persistUnified !== false
      const touchSession = options?.touchSession !== false
      const sessionMessages = ai.messages[targetSessionId] || []

      const createdAt = Date.now()
      const id = createUniqueMessageId(sessionMessages, message.id)
      const newMessage: ChatMessage = {
        ...message,
        imageSources: getNewMessageImageSources(message),
        id,
        timestamp: createdAt,
        versions: [createMessageVersion(
          message.content || '',
          createdAt,
          'original',
          message.apiTranscript,
          message.webSearchStatuses,
          message.requestContext,
        )],
        currentVersionIndex: 0
      }

      const newMessages = [...sessionMessages, newMessage]

      state.updateAIData({
        messages: { ...ai.messages, [targetSessionId]: newMessages },
        sessions: touchSession
          ? ai.sessions.map((session) =>
              session.id === targetSessionId ? { ...session, modelId: message.modelId, updatedAt: Date.now() } : session
            )
          : ai.sessions
      }, !persistUnified)

      if (shouldPersistSession(ai, targetSessionId)) {
        saveSessionJsonInBackground(targetSessionId, newMessages)
      }
      return newMessage.id
    },

    updateMessage: updateMessageAction,

    updateMessageApiTranscript: updateMessageApiTranscriptAction,

    updateMessageWebSearchStatus: updateMessageWebSearchStatusAction,

    completeMessage: (sessionId: string, id: string) => {
      const targetSessionId = resolveSessionIdAlias(sessionId)
      const state = useUnifiedStore.getState()
      const ai = state.data.ai!
      if (!hasSession(ai, targetSessionId)) return
      const sessionMessages = ai.messages[targetSessionId]
      if (!sessionMessages?.some((message) => message.id === id)) return
      if (sessionMessages && shouldPersistSession(ai, targetSessionId)) {
        saveSessionJsonInBackground(targetSessionId, sessionMessages)
      }
    },

    addVersion: (id: string, sessionId?: string) => {
      const state = useUnifiedStore.getState()
      const ai = state.data.ai!
      const rawSessionId = sessionId || useAIUIStore.getState().currentSessionId
      if (!rawSessionId) return
      const targetSessionId = resolveSessionIdAlias(rawSessionId)
      if (!hasSession(ai, targetSessionId)) return

      const sessionMessages = ai.messages[targetSessionId] || []
      let didAddVersion = false
      const newMessages = sessionMessages.map((message) => {
        if (message.id !== id) return message
        if (message.role !== 'assistant') return message

        const versions = getSafeMessageVersions(message)
        versions.push(createMessageVersion('', Date.now(), 'regeneration'))
        const limited = limitMessageVersions(versions, versions.length - 1)
        didAddVersion = true

        return {
          ...message,
          content: '',
          apiTranscript: undefined,
          webSearchStatuses: undefined,
          imageSources: extractStoredImageSources(''),
          versions: limited.versions,
          currentVersionIndex: limited.currentVersionIndex
        }
      })

      if (!didAddVersion) return

      state.updateAIData({
        messages: {
          ...ai.messages,
          [targetSessionId]: newMessages
        }
      }, true)

      if (shouldPersistSession(ai, targetSessionId)) {
        saveSessionJsonInBackground(targetSessionId, newMessages)
      }
    },

    editMessageAndBranch: (sessionId: string, messageId: string, newContent: string) => {
      const targetSessionId = resolveSessionIdAlias(sessionId)
      const state = useUnifiedStore.getState()
      const ai = state.data.ai!
      if (!hasSession(ai, targetSessionId)) return
      const messages = ai.messages[targetSessionId] || []
      const index = messages.findIndex((message) => message.id === messageId)
      if (index === -1) return

      const targetMessage = messages[index]
      if (targetMessage.role !== 'user') return

      const futureMessages = pruneVersionBranchMessages(messages.slice(index + 1))

      const versions = getSafeMessageVersions(targetMessage)
      const currentVersionIndex = getSafeCurrentVersionIndex(targetMessage, versions)

      versions[currentVersionIndex] = {
        ...versions[currentVersionIndex],
        subsequentMessages: futureMessages
      }
      versions.push(createMessageVersion(newContent, Date.now(), 'edit'))
      const limited = limitMessageVersions(versions, versions.length - 1)

      const newMessages = messages.slice(0, index + 1)
      newMessages[index] = {
        ...targetMessage,
        content: newContent,
        apiTranscript: undefined,
        requestContext: undefined,
        imageSources: extractStoredImageSources(newContent),
        versions: limited.versions,
        currentVersionIndex: limited.currentVersionIndex
      }

      state.updateAIData({
        messages: { ...ai.messages, [targetSessionId]: newMessages }
      }, true)

      if (shouldPersistSession(ai, targetSessionId)) {
        saveSessionJsonInBackground(targetSessionId, newMessages)
      }
    },

    retractPendingUserRequest: retractPendingUserRequestAction,

    switchMessageVersion: (sessionId: string, messageId: string, targetIndex: number) => {
      const targetSessionId = resolveSessionIdAlias(sessionId)
      const state = useUnifiedStore.getState()
      const ai = state.data.ai!
      if (!hasSession(ai, targetSessionId)) return
      const messages = ai.messages[targetSessionId] || []
      const index = messages.findIndex((message) => message.id === messageId)
      if (index === -1) return

      const targetMessage = messages[index]
      const versions = getSafeMessageVersions(targetMessage)
      const targetVersion = versions[targetIndex]
      if (!targetVersion) return
      if (!canMessageUseVersionKind(targetMessage, targetVersion.kind)) return

      const currentVersionIndex = getSafeCurrentVersionIndex(targetMessage, versions)
      if (currentVersionIndex === targetIndex) return

      const futureMessages = pruneVersionBranchMessages(messages.slice(index + 1))
      versions[currentVersionIndex] = {
        ...versions[currentVersionIndex],
        subsequentMessages: futureMessages
      }

      const restoredFuture = pruneVersionBranchMessages(targetVersion.subsequentMessages || [])
      const limited = limitMessageVersions(versions, targetIndex)
      const newMessages = messages.slice(0, index + 1)
      newMessages[index] = {
        ...targetMessage,
        content: targetVersion.content,
        apiTranscript: targetVersion.apiTranscript,
        requestContext: targetVersion.requestContext,
        webSearchStatuses: targetVersion.webSearchStatuses,
        imageSources: extractStoredImageSources(targetVersion.content),
        currentVersionIndex: limited.currentVersionIndex,
        versions: limited.versions
      }

      const finalMessages = [...newMessages, ...restoredFuture]

      state.updateAIData({
        messages: { ...ai.messages, [targetSessionId]: finalMessages }
      }, true)

      if (shouldPersistSession(ai, targetSessionId)) {
        saveSessionJsonInBackground(targetSessionId, finalMessages)
      }
    },
  }
}
