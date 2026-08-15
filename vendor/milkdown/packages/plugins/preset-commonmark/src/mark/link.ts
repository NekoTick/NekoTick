import type { MarkType, Node as ProseNode } from '@milkdown/prose/model'

import { expectDomTypeError } from '@milkdown/exception'
import { toggleMark } from '@milkdown/prose/commands'
import { TextSelection } from '@milkdown/prose/state'
import { $command, $markAttr, $markSchema } from '@milkdown/utils'

import { withMeta } from '../__internal__'
import { hasInternalImageUrlPathSegment, hasUrlCredentials } from '../__internal__/url-security'
import { addMarkdownSyntax, markdownSyntaxSchema } from './markdown-syntax'

const controlOrBidiPattern = /[\u0000-\u001F\u007F\u202A-\u202E\u2066-\u2069\uFFFD]/
const schemePattern = /^([A-Za-z][A-Za-z0-9+.-]*):/
const backslashEscapedSchemePattern = /^[A-Za-z][A-Za-z0-9+.-]*\\+:/
const windowsAbsolutePathPattern = /^[A-Za-z]:[\\/]/
const safeLinkSchemes = new Set(['http:', 'https:', 'mailto:', 'weixin:'])
const maxLinkHrefChars = 16 * 1024
const httpAuthorityUrlPattern = /^https?:\/\//i
export const MAX_LINK_TITLE_CHARS = 4096
export const MAX_LINK_UPDATE_SCAN_NODES = 20_000

function getPersistedLinkHref(value: unknown) {
  return typeof value === 'string' && value.length > 0 && value.length <= maxLinkHrefChars
    ? value
    : null
}

function getLinkDestinationSource(href: string) {
  const escaped = href.replace(/([\\<>])/g, '\\$1')
  return /[\s()<>]/.test(href) ? `<${escaped}>` : href.replace(/([()])/g, '\\$1')
}

function getLinkTitleSource(title: string | null) {
  return title ? ` "${title.replace(/(["\\])/g, '\\$1')}"` : ''
}

function hasUnsafeBackslashUrlSyntax(value: string) {
  return value.includes('\\') && (
    value.startsWith('\\') ||
    value.startsWith('//') ||
    schemePattern.test(value) ||
    backslashEscapedSchemePattern.test(value)
  )
}

export function sanitizeLinkHref(value: unknown) {
  if (typeof value !== 'string') return null
  if (value.length > maxLinkHrefChars) return null
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > maxLinkHrefChars || trimmed.startsWith('//') || controlOrBidiPattern.test(trimmed) || hasUnsafeBackslashUrlSyntax(trimmed) || windowsAbsolutePathPattern.test(trimmed)) return null

  const scheme = schemePattern.exec(trimmed)?.[1]?.toLowerCase()
  if (!scheme && hasInternalImageUrlPathSegment(trimmed)) return null
  if (!scheme) return trimmed
  const normalizedScheme = `${scheme}:`
  if ((normalizedScheme === 'http:' || normalizedScheme === 'https:') && !httpAuthorityUrlPattern.test(trimmed)) return null
  if ((normalizedScheme === 'http:' || normalizedScheme === 'https:') && hasUrlCredentials(trimmed)) return null
  return safeLinkSchemes.has(normalizedScheme) ? trimmed : null
}

export function normalizeLinkTitle(value: unknown) {
  return typeof value === 'string' ? value.slice(0, MAX_LINK_TITLE_CHARS) : null
}

/// HTML attributes for the link mark.
export const linkAttr = $markAttr('link')

withMeta(linkAttr, {
  displayName: 'Attr<link>',
  group: 'Link',
})

/// Link mark schema.
export const linkSchema = $markSchema('link', (ctx) => ({
  markdownSyntaxDelimited: true,
  attrs: {
    href: { validate: 'string' },
    title: { default: null, validate: 'string|null' },
  },
  parseDOM: [
    {
      tag: 'a[href]',
      getAttrs: (dom) => {
        if (!(dom instanceof HTMLElement)) throw expectDomTypeError(dom)
        const href = sanitizeLinkHref(dom.getAttribute('href'))
        if (!href) return false

        return {
          href,
          title: normalizeLinkTitle(dom.getAttribute('title')),
        }
      },
    },
  ],
  toDOM: (mark) => {
    const href = sanitizeLinkHref(mark.attrs.href)
    if (!href) return ['span', 0]
    return [
      'a',
      {
        ...ctx.get(linkAttr.key)(mark),
        ...mark.attrs,
        href: href ?? undefined,
        title: normalizeLinkTitle(mark.attrs.title),
      },
    ]
  },
  parseMarkdown: {
    match: (node) => node.type === 'link',
    runner: (state, node, markType) => {
      const url = getPersistedLinkHref(node.url)
      if (!url) {
        state.next(node.children)
        return
      }
      const title = normalizeLinkTitle(node.title)
      const syntaxMarkType = markdownSyntaxSchema.type(ctx)
      addMarkdownSyntax(state, syntaxMarkType, '[', {
        edge: 'open',
        kind: 'link',
      })
      state.openMark(markType, { href: url, title })
      state.next(node.children)
      state.closeMark(markType)
      addMarkdownSyntax(
        state,
        syntaxMarkType,
        `](${getLinkDestinationSource(url)}${getLinkTitleSource(title)})`,
        { edge: 'close', kind: 'link' }
      )
    },
  },
  toMarkdown: {
    match: (mark) => mark.type.name === 'link',
    runner: (state, mark) => {
      const href = getPersistedLinkHref(mark.attrs.href)
      if (!href) return
      state.withMark(mark, 'link', undefined, {
        title: normalizeLinkTitle(mark.attrs.title),
        url: href,
      })
    },
  },
}))

withMeta(linkSchema.mark, {
  displayName: 'MarkSchema<link>',
  group: 'Link',
})

/// @internal
export interface UpdateLinkCommandPayload {
  href?: string
  title?: string | null
}

function sanitizeLinkPayload(payload: UpdateLinkCommandPayload) {
  const title = payload.title === undefined ? undefined : normalizeLinkTitle(payload.title)
  const normalizedPayload = title === undefined ? payload : { ...payload, title }
  if (payload.href === undefined) return normalizedPayload
  const href = sanitizeLinkHref(payload.href)
  return href ? { ...normalizedPayload, href } : null
}

export function findFirstLinkMarkInRange(
  doc: ProseNode,
  from: number,
  to: number,
  linkType: MarkType,
  maxScanNodes = MAX_LINK_UPDATE_SCAN_NODES
) {
  const start = Math.max(0, Math.min(from, doc.content.size))
  const end = Math.max(start, Math.min(to, doc.content.size))
  let scanned = 0
  const stack: Array<{
    contentStart: number
    index: number
    node: ProseNode
    offset: number
  }> = [{
    contentStart: 0,
    index: 0,
    node: doc,
    offset: 0,
  }]

  while (stack.length > 0 && scanned < maxScanNodes) {
    const frame = stack[stack.length - 1]!
    if (frame.index >= frame.node.childCount) {
      stack.pop()
      continue
    }

    const node = frame.node.child(frame.index)
    const pos = frame.contentStart + frame.offset
    const nodeEnd = pos + node.nodeSize
    frame.index += 1
    frame.offset += node.nodeSize

    if (nodeEnd < start) continue
    if (pos > end) break

    scanned += 1
    const mark = linkType.isInSet(node.marks)
    if (mark) {
      return { mark, node, pos }
    }

    if (node.childCount > 0) {
      stack.push({
        contentStart: pos + 1,
        index: 0,
        node,
        offset: 0,
      })
    }
  }

  return null
}

/// A command to toggle the link mark.
/// You can pass the `href` and `title` to the link.
export const toggleLinkCommand = $command(
  'ToggleLink',
  (ctx) =>
    (payload: UpdateLinkCommandPayload = {}) => {
      const attrs = sanitizeLinkPayload(payload)
      if (!attrs) return () => false
      return toggleMark(linkSchema.type(ctx), attrs)
    }
)

withMeta(toggleLinkCommand, {
  displayName: 'Command<toggleLinkCommand>',
  group: 'Link',
})

/// A command to update the link mark.
/// You can pass the `href` and `title` to update the link.
export const updateLinkCommand = $command(
  'UpdateLink',
  (ctx) =>
    (payload: UpdateLinkCommandPayload = {}) =>
    (state, dispatch) => {
      if (!dispatch) return false

      const linkType = linkSchema.type(ctx)
      const { selection } = state
      const { from, to } = selection
      const link = findFirstLinkMarkInRange(state.doc, from, from === to ? to + 1 : to, linkType)
      if (!link) return false

      const start = link.pos
      const end = link.pos + link.node.nodeSize
      const { tr } = state
      const attrs = sanitizeLinkPayload({ ...link.mark.attrs, ...payload })
      if (!attrs) return false
      const linkMark = linkSchema
        .type(ctx)
        .create(attrs)
      if (!linkMark) return false

      dispatch(
        tr
          .removeMark(start, end, link.mark)
          .addMark(start, end, linkMark)
          .setSelection(new TextSelection(tr.selection.$anchor))
          .scrollIntoView()
      )

      return true
    }
)

withMeta(updateLinkCommand, {
  displayName: 'Command<updateLinkCommand>',
  group: 'Link',
})
