import type { ChatRequestContextSnapshot } from './types'
import { normalizeRenderableImageSrc } from '@/lib/markdown/renderableImagePolicy'
import { extractStoredAttachmentFilename } from '@/lib/storage/attachmentUrl'
import { MAX_CURRENT_REQUEST_MESSAGE_CHARS, clipContentToBudget } from './requestContextLimits'

export const MAX_REQUEST_CONTEXT_IMAGE_SOURCES = 64
export const MAX_REQUEST_CONTEXT_ATTACHMENT_SOURCES = 64
export const MAX_REQUEST_CONTEXT_SOURCE_SCAN_ITEMS = 1024
export const MAX_REQUEST_CONTEXT_SOURCE_CHARS = 32 * 1024 * 1024

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function normalizeStoredAttachmentSource(value: unknown): string | null {
  const filename = extractStoredAttachmentFilename(value)
  return filename ? `attachment://${encodeURIComponent(filename)}` : null
}

function normalizeContextImageSource(value: unknown): string | null {
  const storedSource = normalizeStoredAttachmentSource(value)
  if (storedSource) return storedSource
  if (typeof value !== 'string' || value.length > MAX_REQUEST_CONTEXT_SOURCE_CHARS) return null
  const source = normalizeRenderableImageSrc(value)
  if (!source) return null
  const lower = source.toLowerCase()
  return lower.startsWith('http://') || lower.startsWith('https://') || lower.startsWith('data:')
    ? source
    : null
}

function normalizeSources(
  value: unknown,
  maxSources: number,
  normalize: (source: unknown) => string | null,
): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const sources: string[] = []
  const seen = new Set<string>()
  const scanLimit = Math.min(value.length, MAX_REQUEST_CONTEXT_SOURCE_SCAN_ITEMS)
  for (let index = 0; index < scanLimit && sources.length < maxSources; index += 1) {
    const source = normalize(value[index])
    if (!source || seen.has(source)) continue
    seen.add(source)
    sources.push(source)
  }
  return sources.length > 0 ? sources : undefined
}

export function normalizeChatRequestContextSnapshot(
  value: unknown,
  maxTextChars = MAX_CURRENT_REQUEST_MESSAGE_CHARS,
): ChatRequestContextSnapshot | undefined {
  if (!isRecord(value)) return undefined
  const text = typeof value.text === 'string'
    ? clipContentToBudget(value.text, Math.max(maxTextChars, 0))
    : ''
  const imageSources = normalizeSources(
    value.imageSources,
    MAX_REQUEST_CONTEXT_IMAGE_SOURCES,
    normalizeContextImageSource,
  )
  const attachmentSources = normalizeSources(
    value.attachmentSources,
    MAX_REQUEST_CONTEXT_ATTACHMENT_SOURCES,
    normalizeStoredAttachmentSource,
  )
  if (!text && !imageSources?.length) return undefined
  return {
    text,
    ...(imageSources ? { imageSources } : {}),
    ...(attachmentSources ? { attachmentSources } : {}),
  }
}
