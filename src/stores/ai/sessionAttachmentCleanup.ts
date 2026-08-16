import { parseMarkdownAndHtmlImageTokens } from '@/lib/markdown/markdownImageTokens'
import type { ChatMessage, ChatMessageContent, ChatSession } from '@/lib/ai/types'
import { isTemporarySession } from '@/lib/ai/temporaryChat'
import { deleteStoredAttachmentFile } from '@/lib/storage/attachmentStorage'
import { extractStoredAttachmentFilename } from '@/lib/storage/attachmentUrl'
import { hasSessionJson, loadSessionJson } from '@/lib/storage/chatStorage'
import {
  MAX_CHAT_SESSION_DELETE_CONCURRENCY,
  MAX_INLINE_IMAGE_ORPHAN_DELETE_CONCURRENCY,
  MAX_INLINE_IMAGE_PERSISTENCE_BRANCH_DEPTH,
  MAX_INLINE_IMAGE_PERSISTENCE_BRANCH_MESSAGES,
  MAX_INLINE_IMAGE_PERSISTENCE_MESSAGE_NODES,
  MAX_INLINE_IMAGE_PERSISTENCE_SOURCES,
  MAX_INLINE_IMAGE_PERSISTENCE_VERSIONS,
  MAX_INLINE_IMAGE_TOKENS_PER_CONTENT,
} from './sessionInlineImageConstants'

interface ChatAttachmentState {
  sessions: ChatSession[]
  messages: Record<string, ChatMessage[]>
}

interface StoredAttachmentFilenameCollection {
  filenames: Set<string>
  complete: boolean
}

function addSource(source: unknown, collection: StoredAttachmentFilenameCollection): void {
  const filename = extractStoredAttachmentFilename(source)
  if (!filename || collection.filenames.has(filename)) return
  if (collection.filenames.size >= MAX_INLINE_IMAGE_PERSISTENCE_SOURCES) {
    collection.complete = false
    return
  }
  collection.filenames.add(filename)
}

function collectContent(
  content: ChatMessageContent | null | undefined,
  collection: StoredAttachmentFilenameCollection,
): void {
  if (typeof content === 'string') {
    if (!/\b(?:attachment|app-file):\/\//i.test(content)) return
    try {
      const tokens = parseMarkdownAndHtmlImageTokens(content, {
        maxTokens: MAX_INLINE_IMAGE_TOKENS_PER_CONTENT,
      })
      if (tokens.length >= MAX_INLINE_IMAGE_TOKENS_PER_CONTENT) {
        collection.complete = false
      }
      tokens.forEach((token) => addSource(token.src, collection))
    } catch {
      collection.complete = false
    }
    return
  }
  content?.forEach((part) => {
    if (part.type === 'text') collectContent(part.text, collection)
    else addSource(part.image_url.url, collection)
  })
}

function collectTranscript(
  transcript: ChatMessage['apiTranscript'] | undefined,
  collection: StoredAttachmentFilenameCollection,
): void {
  transcript?.forEach((message) => collectContent(message.content, collection))
}

export function collectStoredAttachmentFilenames(
  messages: ChatMessage[],
): StoredAttachmentFilenameCollection {
  const collection: StoredAttachmentFilenameCollection = {
    filenames: new Set<string>(),
    complete: true,
  }
  const stack: Array<{ depth: number; messages: ChatMessage[] }> = [{ depth: 0, messages }]
  let visited = 0

  while (stack.length > 0) {
    const frame = stack.pop()!
    for (const message of frame.messages) {
      if (visited >= MAX_INLINE_IMAGE_PERSISTENCE_MESSAGE_NODES) {
        collection.complete = false
        return collection
      }
      visited += 1
      collectContent(message.content, collection)
      collectTranscript(message.apiTranscript, collection)
      message.imageSources?.forEach((source) => addSource(source, collection))
      message.requestContext?.attachmentSources?.forEach((source) => addSource(source, collection))
      message.requestContext?.imageSources?.forEach((source) => addSource(source, collection))
      if (message.versions.length > MAX_INLINE_IMAGE_PERSISTENCE_VERSIONS) {
        collection.complete = false
      }
      message.versions.slice(0, MAX_INLINE_IMAGE_PERSISTENCE_VERSIONS).forEach((version) => {
        collectContent(version.content, collection)
        collectTranscript(version.apiTranscript, collection)
        version.requestContext?.attachmentSources?.forEach((source) => addSource(source, collection))
        version.requestContext?.imageSources?.forEach((source) => addSource(source, collection))
        if (
          frame.depth < MAX_INLINE_IMAGE_PERSISTENCE_BRANCH_DEPTH &&
          version.subsequentMessages.length > 0
        ) {
          if (version.subsequentMessages.length > MAX_INLINE_IMAGE_PERSISTENCE_BRANCH_MESSAGES) {
            collection.complete = false
          }
          stack.push({
            depth: frame.depth + 1,
            messages: version.subsequentMessages.slice(0, MAX_INLINE_IMAGE_PERSISTENCE_BRANCH_MESSAGES),
          })
        } else if (version.subsequentMessages.length > 0) {
          collection.complete = false
        }
      })
    }
  }
  return collection
}

async function loadMessagesForCleanup(
  session: ChatSession,
  inMemory: ChatMessage[] | undefined,
): Promise<{ messageSets: ChatMessage[][]; readable: boolean }> {
  if (isTemporarySession(session)) {
    return { messageSets: [inMemory ?? []], readable: true }
  }
  const messageSets = inMemory !== undefined ? [inMemory] : []
  try {
    if (!await hasSessionJson(session.id)) {
      return { messageSets, readable: true }
    }
    const messages = await loadSessionJson(session.id)
    if (messages === null) {
      return { messageSets, readable: false }
    }
    messageSets.push(messages)
    return { messageSets, readable: true }
  } catch {
    return { messageSets, readable: false }
  }
}

export async function findUnreferencedAttachmentFilenames(
  ai: ChatAttachmentState,
  deletingSessionIds: ReadonlySet<string>,
): Promise<string[]> {
  const results = new Array<{ messageSets: ChatMessage[][]; readable: boolean }>(ai.sessions.length)
  let nextIndex = 0
  const workers = Array.from(
    { length: Math.min(MAX_CHAT_SESSION_DELETE_CONCURRENCY, ai.sessions.length) },
    async () => {
      while (nextIndex < ai.sessions.length) {
        const index = nextIndex++
        const session = ai.sessions[index]!
        results[index] = await loadMessagesForCleanup(session, ai.messages[session.id])
      }
    },
  )
  await Promise.all(workers)

  const candidates = new Set<string>()
  const retained = new Set<string>()
  for (let index = 0; index < ai.sessions.length; index += 1) {
    const session = ai.sessions[index]!
    const result = results[index]!
    if (!deletingSessionIds.has(session.id) && !result.readable) return []
    const target = deletingSessionIds.has(session.id) ? candidates : retained
    for (const messages of result.messageSets) {
      const collection = collectStoredAttachmentFilenames(messages)
      if (!deletingSessionIds.has(session.id) && !collection.complete) return []
      collection.filenames.forEach((filename) => target.add(filename))
    }
  }
  return [...candidates].filter((filename) => !retained.has(filename))
}

export async function deleteStoredAttachmentFiles(filenames: readonly string[]): Promise<void> {
  let nextIndex = 0
  const workers = Array.from(
    { length: Math.min(MAX_INLINE_IMAGE_ORPHAN_DELETE_CONCURRENCY, filenames.length) },
    async () => {
      while (nextIndex < filenames.length) {
        const filename = filenames[nextIndex++]!
        await deleteStoredAttachmentFile(filename).catch(() => undefined)
      }
    },
  )
  await Promise.all(workers)
}
