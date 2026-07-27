import type {
  ChatMessage,
  ChatMessageContent,
  ChatMessageContentPart,
  ChatRequestContextSnapshot,
} from './types'

export function getHistoryMessageRequestContext(
  message: ChatMessage,
): ChatRequestContextSnapshot | undefined {
  if (message.role !== 'user') return undefined
  return message.requestContext
    ?? message.versions?.[message.currentVersionIndex]?.requestContext
}

export function getHistoryMessageRequestContent(message: ChatMessage): ChatMessageContent {
  const context = getHistoryMessageRequestContext(message)
  if (!context) return message.content
  if (!context.imageSources?.length) return context.text

  const parts: ChatMessageContentPart[] = []
  if (context.text) {
    parts.push({ type: 'text', text: context.text })
  }
  context.imageSources.forEach((url) => {
    parts.push({ type: 'image_url', image_url: { url } })
  })
  return parts.length > 0 ? parts : message.content
}
