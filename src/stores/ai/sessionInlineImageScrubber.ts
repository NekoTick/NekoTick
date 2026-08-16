import type { ImageToken } from '@/lib/markdown/markdownImageTokens'
import { parseMarkdownAndHtmlImageTokens } from '@/lib/markdown/markdownImageTokens'
import { normalizeRenderableDataImageSrc } from '@/components/common/markdown/imagePolicy'
import { htmlImageTagHasDataImageSrc } from '@/lib/markdown/markdownHtmlImageSrc'
import {
  findHtmlTagEnd,
  getInlineCodeRanges,
  getRangeEndAtOffset,
  iterateNonFencedContentRanges,
} from '@/lib/markdown/markdownRanges'
import { scrubOverflowMarkdownDataImages } from '@/lib/markdown/overflowDataImageScrubber'
import {
  INLINE_DATA_IMAGE_TARGET_HINT_PATTERN,
  MAX_INLINE_IMAGE_FALLBACK_HTML_TAG_END_SCAN_CHARS,
  MAX_INLINE_IMAGE_FALLBACK_INLINE_CODE_RANGES,
  MAX_INLINE_IMAGE_FALLBACK_TARGET_CHARS,
  MAX_INLINE_IMAGE_TOKENS_PER_CONTENT,
} from './sessionInlineImageConstants'

function getImageTokenSourceReplacement(content: string, token: ImageToken, replacements: Map<string, string>) {
  if (token.targetStart === undefined || token.targetEnd === undefined || token.targetStart >= token.targetEnd) {
    return null
  }
  if (token.targetStart < 0 || token.targetEnd > content.length) {
    return null
  }

  return (token.src ? replacements.get(token.src) : null)
    ?? replacements.get(content.slice(token.targetStart, token.targetEnd))
    ?? null
}

function scrubOversizedInlineDataImageReferences(content: string) {
  if (!INLINE_DATA_IMAGE_TARGET_HINT_PATTERN.test(content)) {
    return content
  }

  const withoutMarkdownDataImages = scrubOverflowMarkdownDataImages(content, {
    replacement: '',
    maxTargetChars: MAX_INLINE_IMAGE_FALLBACK_TARGET_CHARS,
    scrubMatchedDataImages: false,
  })
  return scrubOverflowHtmlInlineDataImageReferences(withoutMarkdownDataImages)
}

function scrubOverflowHtmlInlineDataImageReferences(content: string) {
  let output = ''
  let cursor = 0

  for (const range of iterateNonFencedContentRanges(content)) {
    output += content.slice(cursor, range.start)
    output += scrubOverflowHtmlInlineDataImageReferencesInRange(content, range)
    cursor = range.end
  }

  output += content.slice(cursor)
  return output
}

function scrubOverflowHtmlInlineDataImageReferencesInRange(
  content: string,
  range: { start: number; end: number },
) {
  const inlineCodeRanges = getInlineCodeRanges(
    content,
    range,
    MAX_INLINE_IMAGE_FALLBACK_INLINE_CODE_RANGES,
  )
  let output = ''
  let cursor = range.start

  while (cursor < range.end) {
    const start = indexOfAsciiCaseInsensitive(content, '<img', cursor)
    if (start === -1 || start >= range.end) {
      output += content.slice(cursor, range.end)
      break
    }

    const inlineCodeEnd = getRangeEndAtOffset(start, inlineCodeRanges)
    if (inlineCodeEnd !== null) {
      output += content.slice(cursor, inlineCodeEnd)
      cursor = inlineCodeEnd
      continue
    }

    const tagEnd = findBoundedHtmlImageTagEnd(
      content,
      start,
      range.end,
    )
    const tagIsOverflow =
      tagEnd === -1 ||
      tagEnd > range.end ||
      tagEnd - start > MAX_INLINE_IMAGE_FALLBACK_TARGET_CHARS
    if (tagIsOverflow) {
      output += content.slice(cursor, start)
      cursor = tagEnd !== -1 && tagEnd <= range.end
        ? tagEnd
        : getOverflowHtmlImageScrubEnd(content, start, range.end)
      continue
    }

    const tag = content.slice(start, tagEnd)
    if (!htmlImageTagHasDataImageSrc(tag)) {
      output += content.slice(cursor, tagEnd)
      cursor = tagEnd
      continue
    }

    output += content.slice(cursor, start)
    cursor = tagEnd
  }

  return output
}

function findBoundedHtmlImageTagEnd(content: string, start: number, rangeEnd: number): number {
  const fastEnd = findHtmlTagEnd(
    content,
    start,
    Math.min(rangeEnd, start + MAX_INLINE_IMAGE_FALLBACK_HTML_TAG_END_SCAN_CHARS + 1),
  )
  if (fastEnd !== -1) {
    return fastEnd
  }
  return findHtmlTagEnd(
    content,
    start,
    Math.min(rangeEnd, start + MAX_INLINE_IMAGE_FALLBACK_TARGET_CHARS + 1),
  )
}

function indexOfAsciiCaseInsensitive(value: string, needle: string, fromIndex: number): number {
  const lowerNeedle = needle.toLowerCase()
  const maxStart = value.length - needle.length
  for (let index = Math.max(0, fromIndex); index <= maxStart; index += 1) {
    let matched = true
    for (let offset = 0; offset < needle.length; offset += 1) {
      if (value[index + offset]?.toLowerCase() !== lowerNeedle[offset]) {
        matched = false
        break
      }
    }
    if (matched) {
      return index
    }
  }
  return -1
}

function getOverflowHtmlImageScrubEnd(content: string, start: number, rangeEnd: number): number {
  const lineFeed = content.indexOf('\n', start)
  const carriageReturn = content.indexOf('\r', start)
  return Math.min(
    lineFeed === -1 ? rangeEnd : lineFeed,
    carriageReturn === -1 ? rangeEnd : carriageReturn,
    rangeEnd,
  )
}

export function replaceImageSourceReferences(content: string, replacements: Map<string, string>) {
  if (!INLINE_DATA_IMAGE_TARGET_HINT_PATTERN.test(content)) {
    return content
  }
  if (replacements.size === 0) {
    return scrubOversizedInlineDataImageReferences(content)
  }

  const tokens = parseMarkdownAndHtmlImageTokens(content, {
    maxTokens: MAX_INLINE_IMAGE_TOKENS_PER_CONTENT,
  })
  let parts: string[] | null = null
  let sawDataImageToken = false
  let cursor = 0

  for (const token of tokens) {
    if (token.src && normalizeRenderableDataImageSrc(token.src)) {
      sawDataImageToken = true
    }
    const replacement = getImageTokenSourceReplacement(content, token, replacements)
    if (!replacement || token.targetStart! < cursor) {
      continue
    }

    parts ??= []
    parts.push(content.slice(cursor, token.targetStart), replacement)
    cursor = token.targetEnd!
  }

  if (!parts) {
    return sawDataImageToken ? content : scrubOversizedInlineDataImageReferences(content)
  }

  parts.push(content.slice(cursor))
  return scrubOversizedInlineDataImageReferences(parts.join(''))
}
