import type { MarkdownNode } from '../utility'

const HTML_OPEN_TAG_PATTERN = /^<([A-Za-z][A-Za-z0-9-]*)(?:\s[^>]*)?>$/
const HTML_OPEN_TAG_PREFIX_PATTERN = /^<([A-Za-z][A-Za-z0-9-]*)(?:\s[^>]*)?>/
const HTML_CLOSE_TAG_PATTERN = /^<\/([A-Za-z][A-Za-z0-9-]*)\s*>$/
const HTML_SELF_CLOSING_PATTERN = /\/>$/
const GFM_BLOCK_HTML_TAG_PATTERN =
  /^<\/?(?:address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|nav|noframes|ol|optgroup|option|p|param|search|section|source|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul)(?:\s|\/?>|$)/i
const GFM_TYPE_1_HTML_BLOCK_PATTERN = /^<(?:script|pre|style)(?:\s|>|$)/i
const GFM_TYPE_7_HTML_TAG_LINE_PATTERN = /^<\/?([A-Za-z][A-Za-z0-9-]*)(?:\s[^>]*)?\/?>\s*$/
const GFM_TYPE_7_EXCLUDED_TAGS = new Set(['script', 'style', 'pre'])
const LOCALLY_PARSED_HTML_BLOCK_EXCLUDED_TAGS = new Set(['img'])
const LOCALLY_PARSED_HTML_TAGS = new Set(['sup', 'sub', 'mark', 'u'])
const MARKDOWN_SOURCE_CONTAINER_TYPES = new Set([
  'blockquote',
  'footnoteDefinition',
  'listItem',
])
const MARKDOWN_FLOW_PARENT_TYPES = new Set([
  'blockquote',
  'definitionDescription',
  'footnoteDefinition',
  'listItem',
  'root',
])
const RAW_HTML_TAG_TEXT_PATTERN = /<\/?[A-Za-z][A-Za-z0-9:-]*(?:\s[^<>]*)?>|&lt;\/?[A-Za-z][A-Za-z0-9:-]*(?:\s[^&<>]*)?&gt;/i
export const MAX_INLINE_HTML_MERGE_AST_NODES = 20_000
export const MAX_INLINE_HTML_MERGE_DEPTH = 200
export const MAX_INLINE_HTML_MERGE_CHILDREN = 5_000

interface InlineHtmlMergeContext {
  visitedNodes: number
}

interface InlineHtmlRenderContext {
  visitedNodes: number
}

function hasInlineHtmlMergeBudget(context: InlineHtmlMergeContext, depth: number): boolean {
  context.visitedNodes += 1
  return context.visitedNodes <= MAX_INLINE_HTML_MERGE_AST_NODES
    && depth <= MAX_INLINE_HTML_MERGE_DEPTH
}

function escapeHtmlText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function readMarkdownValue(value: unknown): string | null {
  if (value == null) return ''
  switch (typeof value) {
    case 'string':
      return value
    case 'number':
    case 'boolean':
    case 'bigint':
    case 'symbol':
      return String(value)
    default:
      return null
  }
}

function hasInlineHtmlRenderBudget(context: InlineHtmlRenderContext, depth: number): boolean {
  context.visitedNodes += 1
  return context.visitedNodes <= MAX_INLINE_HTML_MERGE_AST_NODES
    && depth <= MAX_INLINE_HTML_MERGE_DEPTH
}

function markdownInlineNodeToHtml(
  node: MarkdownNode,
  context: InlineHtmlRenderContext,
  depth = 0
): string | null {
  if (!hasInlineHtmlRenderBudget(context, depth)) return null
  if (node.type === 'text') {
    const value = readMarkdownValue(node.value)
    return value === null ? null : escapeHtmlText(value)
  }
  if (node.type === 'html') return readMarkdownValue(node.value)
  if (node.type === 'inlineCode') {
    const value = readMarkdownValue(node.value)
    return value === null ? null : `<code>${escapeHtmlText(value)}</code>`
  }
  if (node.type === 'emphasis' || node.type === 'strong' || node.type === 'delete') {
    const tag = node.type === 'emphasis' ? 'em' : node.type === 'strong' ? 'strong' : 'del'
    if ((node.children?.length ?? 0) > MAX_INLINE_HTML_MERGE_CHILDREN) return null
    const children = (node.children ?? []).map((child) =>
      markdownInlineNodeToHtml(child, context, depth + 1)
    )
    if (children.some((child) => child === null)) return null
    return `<${tag}>${children.join('')}</${tag}>`
  }
  return null
}

function hasRawHtmlTagText(nodes: MarkdownNode[]): boolean {
  const stack = nodes.map((node) => ({ node, depth: 0 }))
  let visitedNodes = 0
  while (stack.length > 0) {
    const item = stack.pop()
    if (!item) continue
    const { node, depth } = item
    visitedNodes += 1
    if (
      visitedNodes > MAX_INLINE_HTML_MERGE_AST_NODES ||
      depth > MAX_INLINE_HTML_MERGE_DEPTH
    ) return true

    if (
      node.type === 'text' || node.type === 'html'
    ) {
      const value = readMarkdownValue(node.value)
      if (value !== null && RAW_HTML_TAG_TEXT_PATTERN.test(value))
        return true
    }
    if (!Array.isArray(node.children)) continue
    for (let index = node.children.length - 1; index >= 0; index -= 1) {
      const child = node.children[index]
      if (child) stack.push({ node: child, depth: depth + 1 })
    }
  }
  return false
}

function getSourceSlice(
  markdown: string | undefined,
  startNode: MarkdownNode,
  endNode: MarkdownNode,
  stripContainerPrefixes = false,
  parsedValue?: string
): string | null {
  const start = startNode.position?.start?.offset
  const end = endNode.position?.end?.offset
  if (
    !markdown ||
    typeof start !== 'number' ||
    typeof end !== 'number' ||
    start < 0 ||
    end <= start ||
    end > markdown.length
  )
    return null

  const source = markdown.slice(start, end)
  if (!stripContainerPrefixes) return source

  const startColumn = startNode.position?.start?.column
  if (typeof startColumn !== 'number' || startColumn <= 1) return source
  return stripMarkdownContainerPrefixes(source, startColumn - 1, parsedValue)
}

function stripMarkdownContainerPrefixes(
  source: string,
  maxPrefixColumns: number,
  parsedValue?: string
): string {
  const parsedLines = parsedValue?.split(/\r\n|\r|\n/)
  let lineIndex = 0
  return source.replace(/(^|\r\n|\r|\n)([^\r\n]*)/g, (line, boundary: string, value: string) => {
    const parsedLine = parsedLines?.[lineIndex]
    lineIndex += 1
    if (!boundary) return line
    if (parsedLine !== undefined && value.endsWith(parsedLine)) {
      const prefix = value.slice(0, value.length - parsedLine.length)
      if (/^[\t >]*$/.test(prefix)) return `${boundary}${parsedLine}`
    }

    let columns = 0
    let cursor = 0
    while (cursor < value.length && columns < maxPrefixColumns) {
      const character = value[cursor]
      if (character !== ' ' && character !== '\t' && character !== '>') break
      const nextColumns = character === '\t'
        ? columns + 4 - (columns % 4)
        : columns + 1
      cursor += 1
      columns = nextColumns
    }
    const overshoot = Math.max(0, columns - maxPrefixColumns)
    return `${boundary}${' '.repeat(overshoot)}${value.slice(cursor)}`
  })
}

function isGfmHtmlBlock(value: string): boolean {
  const firstLine = value.trim().split(/\r?\n/, 1)[0]?.trim() ?? ''
  if (GFM_TYPE_1_HTML_BLOCK_PATTERN.test(firstLine)) return true
  if (firstLine.startsWith('<!--')) return true
  if (firstLine.startsWith('<?')) return true
  if (/^<![A-Z]/.test(firstLine)) return true
  if (firstLine.startsWith('<![CDATA[')) return true
  if (GFM_BLOCK_HTML_TAG_PATTERN.test(firstLine)) return true

  const tagLineMatch = GFM_TYPE_7_HTML_TAG_LINE_PATTERN.exec(firstLine)
  const tagName = tagLineMatch?.[1]?.toLowerCase()
  return Boolean(
    tagName
    && !GFM_TYPE_7_EXCLUDED_TAGS.has(tagName)
    && !LOCALLY_PARSED_HTML_BLOCK_EXCLUDED_TAGS.has(tagName)
  )
}

function markGfmHtmlBlock(node: MarkdownNode): MarkdownNode {
  if (node.type !== 'html' || node.githubHtmlBlock === false) return node
  const value = readMarkdownValue(node.value)
  return value !== null && isGfmHtmlBlock(value)
    ? ({ ...node, githubHtmlBlock: true } as MarkdownNode)
    : node
}

function createMergedHtmlNode(
  startNode: MarkdownNode,
  endNode: MarkdownNode,
  value: string
): MarkdownNode {
  const startData = startNode.data && typeof startNode.data === 'object'
    ? startNode.data as Record<string, unknown>
    : {}
  const endData = endNode.data && typeof endNode.data === 'object'
    ? endNode.data as Record<string, unknown>
    : {}
  const data = { ...startData, ...endData }
  const start = startNode.position?.start
  const end = endNode.position?.end

  return {
    type: 'html',
    value,
    ...(Object.keys(data).length > 0 ? { data } : {}),
    ...(start && end ? { position: { start, end } } : {}),
  } as MarkdownNode
}

function restoreRawHtmlFromSource(
  node: MarkdownNode,
  markdown: string | undefined,
  insideMarkdownContainer: boolean
): MarkdownNode {
  const value = node.type === 'html' ? readMarkdownValue(node.value) : null
  if (node.type !== 'html' || value === null || !RAW_HTML_TAG_TEXT_PATTERN.test(value))
    return node

  const rawSource = getSourceSlice(markdown, node, node, insideMarkdownContainer, value)
  return rawSource ? ({ ...node, value: rawSource } as MarkdownNode) : node
}

function buildInlineHtmlLookup(children: MarkdownNode[]): {
  htmlValues: string[]
  matchingCloseIndexes: number[]
} {
  const htmlValues: string[] = []
  const matchingCloseIndexes: number[] = []
  const openIndexesByTag = new Map<string, number[]>()
  for (let index = 0; index < children.length; index += 1) {
    const child = children[index]
    if (child?.type !== 'html') continue

    const rawValue = readMarkdownValue(child.value)
    const value = rawValue === null ? '' : rawValue.trim()
    htmlValues[index] = value

    const closeMatch = HTML_CLOSE_TAG_PATTERN.exec(value)
    if (closeMatch) {
      const tagName = closeMatch[1]?.toLowerCase()
      const openIndexes = tagName ? openIndexesByTag.get(tagName) : undefined
      const openIndex = openIndexes?.pop()
      if (openIndex !== undefined) matchingCloseIndexes[openIndex] = index
      continue
    }

    const openMatch = HTML_OPEN_TAG_PATTERN.exec(value)
    const tagName = openMatch?.[1]?.toLowerCase()
    if (!tagName || HTML_SELF_CLOSING_PATTERN.test(value)) continue
    const openIndexes = openIndexesByTag.get(tagName)
    if (openIndexes) openIndexes.push(index)
    else openIndexesByTag.set(tagName, [index])
  }
  return { htmlValues, matchingCloseIndexes }
}

function getBlockHtmlOpenTagName(node: MarkdownNode): string | null {
  if (node.type !== 'html') return null
  const rawValue = readMarkdownValue(node.value)
  if (rawValue === null) return null
  const value = rawValue.trimStart()
  const openMatch = HTML_OPEN_TAG_PREFIX_PATTERN.exec(value)
  const tagName = openMatch?.[1]?.toLowerCase()
  if (!tagName || !openMatch || HTML_SELF_CLOSING_PATTERN.test(openMatch[0])) return null
  if (value.includes(`</${tagName}`)) return null
  return tagName
}

function buildBlockHtmlCloseIndexes(children: MarkdownNode[]): Map<string, number[]> {
  const closeIndexesByTag = new Map<string, number[]>()
  for (let index = 0; index < children.length; index += 1) {
    const child = children[index]
    if (child?.type !== 'html') continue
    const value = readMarkdownValue(child.value)
    if (value === null) continue
    const closeMatch = HTML_CLOSE_TAG_PATTERN.exec(value.trim())
    const tagName = closeMatch?.[1]?.toLowerCase()
    if (!tagName) continue
    const closeIndexes = closeIndexesByTag.get(tagName)
    if (closeIndexes) closeIndexes.push(index)
    else closeIndexesByTag.set(tagName, [index])
  }
  return closeIndexesByTag
}

function findBlockHtmlCloseIndex(closeIndexes: number[] | undefined, startIndex: number): number {
  if (!closeIndexes) return -1
  let left = 0
  let right = closeIndexes.length
  while (left < right) {
    const mid = (left + right) >> 1
    const midValue = closeIndexes[mid]
    if (midValue !== undefined && midValue <= startIndex) left = mid + 1
    else right = mid
  }
  return closeIndexes[left] ?? -1
}

function mergePairedBlockHtmlChildren(
  children: MarkdownNode[],
  markdown: string | undefined,
  insideMarkdownContainer: boolean
): MarkdownNode[] {
  const closeIndexesByTag = buildBlockHtmlCloseIndexes(children)
  const mergedChildren: MarkdownNode[] = []
  for (let index = 0; index < children.length; index += 1) {
    const child = children[index]
    if (!child) continue
    const tagName = getBlockHtmlOpenTagName(child)
    if (!tagName) {
      mergedChildren.push(child)
      continue
    }

    const closeIndex = findBlockHtmlCloseIndex(closeIndexesByTag.get(tagName), index)
    if (closeIndex < 0) {
      mergedChildren.push(child)
      continue
    }

    const closeNode = children[closeIndex]
    if (!closeNode) {
      mergedChildren.push(child)
      continue
    }

    const pairedSource = getSourceSlice(
      markdown,
      child,
      closeNode,
      insideMarkdownContainer
    )
    if (!pairedSource || !pairedSource.includes('\n') || !isGfmHtmlBlock(pairedSource)) {
      mergedChildren.push(child)
      continue
    }

    mergedChildren.push(createMergedHtmlNode(child, closeNode, pairedSource))
    index = closeIndex
  }
  return mergedChildren
}

export function mergePairedInlineHtml(node: MarkdownNode, markdown?: string): MarkdownNode {
  return mergePairedInlineHtmlWithBudget(node, markdown, { visitedNodes: 0 }, 0, false)
}

function mergePairedInlineHtmlWithBudget(
  node: MarkdownNode,
  markdown: string | undefined,
  context: InlineHtmlMergeContext,
  depth: number,
  insideMarkdownContainer: boolean
): MarkdownNode {
  if (!hasInlineHtmlMergeBudget(context, depth)) return node
  if (!Array.isArray(node.children)) {
    return restoreRawHtmlFromSource(node, markdown, insideMarkdownContainer)
  }
  if (node.children.length > MAX_INLINE_HTML_MERGE_CHILDREN) return node

  const descendantsInsideMarkdownContainer = insideMarkdownContainer
    || MARKDOWN_SOURCE_CONTAINER_TYPES.has(node.type)
  const canContainMarkdownFlow = MARKDOWN_FLOW_PARENT_TYPES.has(node.type)
  const canPromoteWholeNodeToFlow = canContainMarkdownFlow || node.type === 'paragraph'
  node.children = node.children.map((child) => mergePairedInlineHtmlWithBudget(
    child,
    markdown,
    context,
    depth + 1,
    descendantsInsideMarkdownContainer
  ))
  if (canContainMarkdownFlow)
    node.children = mergePairedBlockHtmlChildren(
      node.children,
      markdown,
      descendantsInsideMarkdownContainer
    )

  const { htmlValues, matchingCloseIndexes } = buildInlineHtmlLookup(node.children)
  const mergedChildren: MarkdownNode[] = []
  for (let index = 0; index < node.children.length; index += 1) {
    const child = node.children[index]
    if (!child) continue
    const value = child.type === 'html' ? htmlValues[index] ?? '' : ''
    const openTagMatch = HTML_OPEN_TAG_PATTERN.exec(value)
    if (!openTagMatch || HTML_SELF_CLOSING_PATTERN.test(value)) {
      mergedChildren.push(child)
      continue
    }

    const tagName = openTagMatch[1]?.toLowerCase()
    if (!tagName) {
      mergedChildren.push(child)
      continue
    }
    const closeIndex = matchingCloseIndexes[index] ?? -1

    if (closeIndex < 0) {
      mergedChildren.push(child)
      continue
    }

    const closeNode = node.children[closeIndex]
    if (!closeNode) {
      mergedChildren.push(child)
      continue
    }

    const innerNodes = node.children.slice(index + 1, closeIndex)
    const pairedSource = getSourceSlice(
      markdown,
      child,
      closeNode,
      descendantsInsideMarkdownContainer
    )
    if (pairedSource?.includes('\n') && isGfmHtmlBlock(pairedSource)) {
      mergedChildren.push({
        ...createMergedHtmlNode(child, closeNode, pairedSource),
        githubHtmlBlock: canPromoteWholeNodeToFlow
          && index === 0
          && closeIndex === node.children.length - 1,
      } as MarkdownNode)
      index = closeIndex
      continue
    }

    const rawSource = hasRawHtmlTagText(innerNodes)
      ? pairedSource
      : null
    if (rawSource) {
      mergedChildren.push({
        type: 'html',
        value: rawSource,
      } as MarkdownNode)
      index = closeIndex
      continue
    }

    if (LOCALLY_PARSED_HTML_TAGS.has(tagName)) {
      mergedChildren.push(child)
      continue
    }
    const renderContext = { visitedNodes: 0 }
    const innerHtmlParts = innerNodes.map((innerNode) =>
      markdownInlineNodeToHtml(innerNode, renderContext)
    )
    if (innerHtmlParts.some((part) => part === null)) {
      mergedChildren.push(child)
      continue
    }

    mergedChildren.push({
      type: 'html',
      value: `${value}${innerHtmlParts.join('')}${readMarkdownValue(closeNode.value) ?? ''}`,
    } as MarkdownNode)
    index = closeIndex
  }

  node.children = mergedChildren
  const firstChild = node.children[0]
  if (
    node.type === 'listItem'
    && firstChild?.type !== 'paragraph'
    && node.position?.start?.line === firstChild?.position?.start?.line
  ) {
    node.sourceTightFirstBlock = true
  }
  if (canContainMarkdownFlow)
    node.children = node.children.map(markGfmHtmlBlock)
  if (node.type === 'paragraph' && node.children.length === 1) {
    const child = node.children[0]
    if (!child) return node
    const rawValue = child.type === 'html' ? readMarkdownValue(child.value) : ''
    const value = rawValue === null ? '' : rawValue.trim()
    if (isGfmHtmlBlock(value))
      return markGfmHtmlBlock(child)
  }
  return node
}
