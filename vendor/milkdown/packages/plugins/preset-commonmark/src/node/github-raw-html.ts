interface RawHtmlTag {
  closing: boolean
  end: number
  malformed: boolean
  name: string
  selfClosing: boolean
}

export interface GithubRawHtmlStripResult {
  activeDepth: number
  activeTag: string | null
  mode: 'drop' | 'escape' | null
  value: string
}

const maxRawHtmlTagEndScanChars = 64 * 1024
const maxRawHtmlTagNameChars = 128
const maxRawHtmlContainerMarkupScans = 20_000

function findRawHtmlTagEnd(content: string, start: number, end: number) {
  let quote: string | null = null

  for (let cursor = start + 1; cursor < end; cursor += 1) {
    const char = content[cursor]
    if (quote) {
      if (char === quote)
        quote = null
      continue
    }
    if (char === '"' || char === "'") {
      quote = char
      continue
    }
    if (char === '>')
      return cursor + 1
  }

  return -1
}

function getRawHtmlTagScanEnd(content: string, start: number) {
  return Math.min(content.length, start + maxRawHtmlTagEndScanChars + 1)
}

function getMalformedRawHtmlTagEnd(content: string, start: number) {
  const lineFeed = content.indexOf('\n', start)
  const carriageReturn = content.indexOf('\r', start)
  const lineEnd = Math.min(
    lineFeed === -1 ? content.length : lineFeed,
    carriageReturn === -1 ? content.length : carriageReturn,
    content.length,
  )
  return Math.min(content.length, Math.max(start + 1, lineEnd))
}

function findHtmlCommentEnd(content: string, start: number) {
  const end = content.indexOf('-->', start + 4)
  return end === -1 ? content.length : end + 3
}

function findHtmlCdataEnd(content: string, start: number) {
  const end = content.indexOf(']]>', start + 9)
  return end === -1 ? content.length : end + 3
}

function findHtmlProcessingInstructionEnd(content: string, start: number) {
  const end = content.indexOf('?>', start + 2)
  return end === -1 ? content.length : end + 2
}

function findHtmlDeclarationEnd(content: string, start: number) {
  const end = content.indexOf('>', start + 2)
  return end === -1 ? content.length : end + 1
}

function findRawHtmlNonTagEnd(content: string, start: number) {
  if (content.startsWith('<!--', start)) return findHtmlCommentEnd(content, start)
  if (content.startsWith('<![CDATA[', start)) return findHtmlCdataEnd(content, start)
  if (content.startsWith('<?', start)) return findHtmlProcessingInstructionEnd(content, start)
  if (content.startsWith('<!', start)) return findHtmlDeclarationEnd(content, start)
  return null
}

function isAsciiAlpha(char: string | undefined) {
  if (char === undefined)
    return false
  const code = char.charCodeAt(0)
  return (code >= 65 && code <= 90) || (code >= 97 && code <= 122)
}

function isHtmlNameChar(char: string | undefined) {
  if (char === undefined)
    return false
  const code = char.charCodeAt(0)
  return (
    (code >= 65 && code <= 90)
    || (code >= 97 && code <= 122)
    || (code >= 48 && code <= 57)
    || char === ':'
    || char === '-'
  )
}

function isHtmlWhitespace(char: string | undefined) {
  if (char === undefined)
    return false
  const code = char.charCodeAt(0)
  return code === 32 || code === 9 || code === 10 || code === 12 || code === 13
}

function isTagBoundary(char: string | undefined) {
  return char === undefined || char === '>' || char === '/' || isHtmlWhitespace(char)
}

function readRawHtmlTagStart(content: string, start: number) {
  if (content[start] !== '<')
    return null

  let cursor = start + 1
  const closing = content[cursor] === '/'
  if (closing)
    cursor += 1
  if (!isAsciiAlpha(content[cursor]))
    return null

  const nameStart = cursor
  cursor += 1
  while (isHtmlNameChar(content[cursor])) {
    cursor += 1
    if (cursor - nameStart > maxRawHtmlTagNameChars) {
      return {
        closing,
        name: content.slice(nameStart, nameStart + maxRawHtmlTagNameChars).toLowerCase(),
        overlongName: true,
      }
    }
  }

  if (!isTagBoundary(content[cursor]))
    return null
  return { closing, name: content.slice(nameStart, cursor).toLowerCase() }
}

function isSelfClosingRawHtmlTag(content: string, start: number, end: number) {
  if (content[end - 1] !== '>')
    return false

  let cursor = end - 1
  while (cursor >= start) {
    const char = content[cursor]
    if (char === '>') {
      cursor -= 1
      continue
    }
    if (isHtmlWhitespace(char)) {
      cursor -= 1
      continue
    }
    return char === '/'
  }
  return false
}

function parseRawHtmlFragmentTag(content: string, start: number): RawHtmlTag | null {
  if (findRawHtmlNonTagEnd(content, start) !== null)
    return null

  const tagStart = readRawHtmlTagStart(content, start)
  if (!tagStart)
    return null
  if (tagStart.overlongName) {
    return {
      closing: tagStart.closing,
      end: getMalformedRawHtmlTagEnd(content, start),
      malformed: true,
      name: tagStart.name,
      selfClosing: true,
    }
  }

  const scanEnd = getRawHtmlTagScanEnd(content, start)
  const tagEnd = findRawHtmlTagEnd(content, start, scanEnd)
  const malformed = tagEnd === -1 && scanEnd < content.length
  const end = tagEnd === -1
    ? malformed ? getMalformedRawHtmlTagEnd(content, start) : content.length
    : tagEnd

  return {
    closing: tagStart.closing,
    end,
    malformed,
    name: tagStart.name,
    selfClosing: malformed || isSelfClosingRawHtmlTag(content, start, end),
  }
}

function scanRawHtmlContainer(
  content: string,
  tagName: string,
  start: number,
  initialDepth: number,
) {
  let cursor = start
  let depth = Math.max(1, initialDepth)
  let scannedMarkupStarts = 0
  while (cursor < content.length) {
    const nextTagStart = content.indexOf('<', cursor)
    if (nextTagStart === -1)
      return { closeEnd: null, depth }
    scannedMarkupStarts += 1
    if (scannedMarkupStarts > maxRawHtmlContainerMarkupScans)
      return { closeEnd: null, depth }

    const nextTag = parseRawHtmlFragmentTag(content, nextTagStart)
    if (!nextTag) {
      cursor = findRawHtmlNonTagEnd(content, nextTagStart) ?? nextTagStart + 1
      continue
    }

    if (nextTag.name === tagName) {
      if (nextTag.closing) {
        depth -= 1
        if (depth <= 0)
          return { closeEnd: nextTag.end, depth: 0 }
      } else if (!nextTag.selfClosing) {
        depth += 1
      }
    }

    cursor = nextTag.end
  }

  return { closeEnd: null, depth }
}

function stripActiveDroppedTag(
  content: string,
  activeTag: string,
  tags: ReadonlySet<string>,
  activeDepth = 1,
): GithubRawHtmlStripResult {
  if (activeTag === 'plaintext')
    return { activeDepth, activeTag, mode: 'drop', value: '' }

  const close = scanRawHtmlContainer(content, activeTag, 0, activeDepth)
  if (close.closeEnd === null)
    return { activeDepth: close.depth, activeTag, mode: 'drop', value: '' }

  return stripDroppedRawHtmlContentFragment(content.slice(close.closeEnd), null, tags)
}

function escapeActiveRawHtmlTag(
  content: string,
  activeTag: string,
  dropTags: ReadonlySet<string>,
  escapeTags: ReadonlySet<string>,
  activeDepth = 1,
): GithubRawHtmlStripResult {
  if (activeTag === 'plaintext')
    return { activeDepth, activeTag, mode: 'escape', value: escapeHtmlText(content) }

  const close = scanRawHtmlContainer(content, activeTag, 0, activeDepth)
  if (close.closeEnd === null)
    return { activeDepth: close.depth, activeTag, mode: 'escape', value: escapeHtmlText(content) }

  const next = prepareGithubRawHtmlForSanitizerFragment(
    content.slice(close.closeEnd),
    null,
    null,
    { sanitizerOnlyDropWithContentTags: dropTags, gfmDisallowedRawHtmlTags: escapeTags },
  )
  return {
    activeDepth: next.activeDepth,
    activeTag: next.activeTag,
    mode: next.mode,
    value: `${escapeHtmlText(content.slice(0, close.closeEnd))}${next.value}`,
  }
}

export function stripDroppedRawHtmlContentFragment(
  content: string,
  activeTag: string | null,
  tags: ReadonlySet<string>,
  activeDepth = 1,
): GithubRawHtmlStripResult {
  if (activeTag)
    return stripActiveDroppedTag(content, activeTag, tags, activeDepth)

  const output: string[] = []
  let cursor = 0
  while (cursor < content.length) {
    const start = content.indexOf('<', cursor)
    if (start === -1) {
      output.push(content.slice(cursor))
      break
    }

    const tag = parseRawHtmlFragmentTag(content, start)
    if (!tag) {
      const nonTagEnd = findRawHtmlNonTagEnd(content, start)
      const nextCursor = nonTagEnd ?? start + 1
      output.push(content.slice(cursor, nextCursor))
      cursor = nextCursor
      continue
    }

    if (!tags.has(tag.name)) {
      output.push(content.slice(cursor, tag.end))
      cursor = tag.end
      continue
    }

    output.push(content.slice(cursor, start))
    if (tag.closing || tag.selfClosing) {
      cursor = tag.end
      continue
    }
    if (tag.name === 'plaintext')
      return { activeDepth: 1, activeTag: tag.name, mode: 'drop', value: output.join('') }

    const close = scanRawHtmlContainer(content, tag.name, tag.end, 1)
    if (close.closeEnd === null)
      return { activeDepth: close.depth, activeTag: tag.name, mode: 'drop', value: output.join('') }

    cursor = close.closeEnd
  }

  return { activeDepth: 0, activeTag: null, mode: null, value: output.join('') }
}

function escapeHtmlText(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

export function prepareGithubRawHtmlForSanitizerFragment(
  content: string,
  activeTag: string | null = null,
  activeMode: 'drop' | 'escape' | null = null,
  options: {
    activeDepth?: number
    gfmDisallowedRawHtmlTags: ReadonlySet<string>
    sanitizerOnlyDropWithContentTags: ReadonlySet<string>
  },
): GithubRawHtmlStripResult {
  const dropTags = options.sanitizerOnlyDropWithContentTags
  const escapeTags = options.gfmDisallowedRawHtmlTags
  const activeDepth = options.activeDepth ?? 1

  if (activeTag && activeMode === 'drop')
    return stripActiveDroppedTag(content, activeTag, dropTags, activeDepth)
  if (activeTag && activeMode === 'escape')
    return escapeActiveRawHtmlTag(content, activeTag, dropTags, escapeTags, activeDepth)

  const output: string[] = []
  let cursor = 0

  while (cursor < content.length) {
    const start = content.indexOf('<', cursor)
    if (start === -1) {
      output.push(content.slice(cursor))
      break
    }

    const tag = parseRawHtmlFragmentTag(content, start)
    if (!tag) {
      const nonTagEnd = findRawHtmlNonTagEnd(content, start)
      const nextCursor = nonTagEnd ?? start + 1
      output.push(content.slice(cursor, nextCursor))
      cursor = nextCursor
      continue
    }

    if (!dropTags.has(tag.name) && !escapeTags.has(tag.name)) {
      output.push(content.slice(cursor, tag.end))
      cursor = tag.end
      continue
    }

    output.push(content.slice(cursor, start))
    if (dropTags.has(tag.name)) {
      if (tag.closing || tag.selfClosing) {
        cursor = tag.end
        continue
      }

      const close = scanRawHtmlContainer(content, tag.name, tag.end, 1)
      if (close.closeEnd === null)
        return { activeDepth: close.depth, activeTag: tag.name, mode: 'drop', value: output.join('') }

      cursor = close.closeEnd
      continue
    }

    if (tag.closing || tag.selfClosing) {
      output.push(escapeHtmlText(content.slice(start, tag.end)))
      cursor = tag.end
      continue
    }
    if (tag.name === 'plaintext') {
      return {
        activeDepth: 1,
        activeTag: tag.name,
        mode: 'escape',
        value: `${output.join('')}${escapeHtmlText(content.slice(start))}`,
      }
    }

    const close = scanRawHtmlContainer(content, tag.name, tag.end, 1)
    if (close.closeEnd === null) {
      output.push(escapeHtmlText(content.slice(start, tag.end)))
      cursor = tag.end
      continue
    }

    output.push(escapeHtmlText(content.slice(start, close.closeEnd)))
    cursor = close.closeEnd
  }

  return { activeDepth: 0, activeTag: null, mode: null, value: output.join('') }
}

export function prepareGithubRawHtmlForSanitizer(
  value: string,
  options: {
    gfmDisallowedRawHtmlTags: ReadonlySet<string>
    sanitizerOnlyDropWithContentTags: ReadonlySet<string>
  },
) {
  return prepareGithubRawHtmlForSanitizerFragment(value, null, null, options).value
}
