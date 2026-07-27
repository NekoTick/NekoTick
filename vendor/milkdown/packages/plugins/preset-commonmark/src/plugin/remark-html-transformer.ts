import type { Node } from '@milkdown/transformer'

import { $remark } from '@milkdown/utils'

import { withMeta } from '../__internal__'
import {
  gfmDisallowedRawHtmlTags,
  sanitizerOnlyDropWithContentTags,
} from '../node/github-html'
import { prepareGithubRawHtmlForSanitizerFragment } from '../node/github-raw-html'
import { canTransformRemarkAst } from './remark-ast-budget'

const isParent = (node: Node): node is Node & { children: Node[] } =>
  !!(node as Node & { children: Node[] }).children
const isHTML = (
  node: Node
): node is Node & { children: Node[]; value: unknown } => node.type === 'html'
const isText = (
  node: Node
): node is Node & { value: unknown } => node.type === 'text'

interface RawHtmlState {
  activeDepth: number
  activeMode: 'drop' | 'escape' | null
  activeTag: string | null
}

const noRawHtmlTags = new Set<string>()

function flatMapWithDepth(
  ast: Node,
  markdown: string | null,
  fn: (node: Node, index: number, parent: Node | null) => Node[]
) {
  const rawHtmlState: RawHtmlState = {
    activeDepth: 1,
    activeMode: null,
    activeTag: null,
  }

  return transform(ast, 0, null)[0]

  function transform(node: Node, index: number, parent: Node | null) {
    if (isHTML(node) && typeof node.value === 'string') {
      const sanitized = sanitizeRawHtmlNode(node, rawHtmlState)
      const out = []
      for (let i = 0, n = sanitized.length; i < n; i++) {
        const item = sanitized[i]
        if (!item) continue
        const xs = fn(item, index, parent)
        for (let j = 0, m = xs.length; j < m; j++) {
          const mapped = xs[j]
          if (mapped) out.push(mapped)
        }
      }
      return out
    }

    if (isText(node)) {
      const sanitized = syncTextRawHtmlState(node, rawHtmlState, markdown)
      if (!sanitized)
        return []
      if (sanitized !== node)
        return fn(sanitized, index, parent)
    }

    const enteredDroppedRawHtml = rawHtmlState.activeTag && rawHtmlState.activeMode === 'drop'
    if (isParent(node)) {
      const out = []
      for (let i = 0, n = node.children.length; i < n; i++) {
        const nthChild = node.children[i]
        if (nthChild) {
          const xs = transform(nthChild, i, node)
          if (xs) {
            for (let j = 0, m = xs.length; j < m; j++) {
              const item = xs[j]
              if (item) out.push(item)
            }
          }
        }
      }
      node.children = out
      if (enteredDroppedRawHtml && node.children.length === 0) {
        const suppressed = createRawHtmlRenderNode(node, markdown, '')
        return suppressed ? fn(suppressed, index, parent) : []
      }
    }
    else if (enteredDroppedRawHtml) {
      const suppressed = createRawHtmlRenderNode(node, markdown, '')
      return suppressed ? fn(suppressed, index, parent) : []
    }

    return fn(node, index, parent)
  }
}

// List of container node types that can contain block-level content
// and thus may need HTML content to be wrapped in paragraphs
const BLOCK_CONTAINER_TYPES = ['root', 'blockquote', 'listItem']

function getMarkdownNodeSource(node: Node, markdown: string | null) {
  const position = (node as Node & {
    position?: { end?: { offset?: unknown }; start?: { offset?: unknown } }
  }).position
  const start = position?.start?.offset
  const end = position?.end?.offset
  if (
    markdown
    && typeof start === 'number'
    && typeof end === 'number'
    && start >= 0
    && end > start
    && end <= markdown.length
  )
    return markdown.slice(start, end)

  const value = (node as Node & { value?: unknown }).value
  return typeof value === 'string' ? value : null
}

function createRawHtmlRenderNode(
  node: Node,
  markdown: string | null,
  renderValue: string
) {
  const value = getMarkdownNodeSource(node, markdown)
  if (value === null) return null
  return {
    type: 'html',
    value,
    position: (node as Node & { position?: unknown }).position,
    githubHtmlRenderValue: renderValue,
  } as Node
}

function sanitizeRawHtmlNode(node: Node, state: RawHtmlState) {
  const value = node.value as string
  const result = prepareGithubRawHtmlForSanitizerFragment(
    value,
    state.activeTag,
    state.activeMode,
    {
      activeDepth: state.activeDepth,
      gfmDisallowedRawHtmlTags,
      sanitizerOnlyDropWithContentTags,
    },
  )
  state.activeTag = result.activeTag
  state.activeMode = result.mode
  state.activeDepth = result.activeDepth || 1
  return [result.value === value
    ? node
    : { ...node, githubHtmlRenderValue: result.value }]
}

function syncTextRawHtmlState(
  node: Node & { value: unknown },
  state: RawHtmlState,
  markdown: string | null
) {
  if (typeof node.value !== 'string')
    return node

  if (state.activeTag && state.activeMode !== 'drop')
    return node

  const value = node.value
  const result = prepareGithubRawHtmlForSanitizerFragment(
    value,
    state.activeTag,
    state.activeMode,
    {
      activeDepth: state.activeDepth,
      gfmDisallowedRawHtmlTags: noRawHtmlTags,
      sanitizerOnlyDropWithContentTags,
    },
  )
  state.activeTag = result.activeTag
  state.activeMode = result.mode
  state.activeDepth = result.activeDepth || 1
  if (result.value === value)
    return node
  return createRawHtmlRenderNode(node, markdown, result.value)
}

/// @internal
/// This plugin should be deprecated after we support HTML.
export const remarkHtmlTransformer = $remark(
  'remarkHTMLTransformer',
  () => () => (tree: Node, file) => {
    if (!canTransformRemarkAst(tree)) return

    const markdown = typeof file.value === 'string' ? file.value : null
    flatMapWithDepth(tree, markdown, (node, _index, parent) => {
      if (!isHTML(node)) return [node]

      // If the parent is a block container that expects block content,
      // wrap the HTML in a paragraph node
      if (parent && BLOCK_CONTAINER_TYPES.includes(parent.type)) {
        node.children = [{ ...node }]
        delete node.value
        ;(node as { type: string }).type = 'paragraph'
      }

      return [node]
    })
  }
)

withMeta(remarkHtmlTransformer.plugin, {
  displayName: 'Remark<remarkHtmlTransformer>',
  group: 'Remark',
})

withMeta(remarkHtmlTransformer.options, {
  displayName: 'RemarkConfig<remarkHtmlTransformer>',
  group: 'Remark',
})
