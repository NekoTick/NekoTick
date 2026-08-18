import { commandsCtx, defaultValueCtx, Editor, editorViewCtx, parserCtx } from '@milkdown/core'
import { NodeSelection, TextSelection } from '@milkdown/prose/state'
import type { EditorView } from '@milkdown/prose/view'
import { expect, it, vi, afterEach } from 'vitest'

import { commonmark } from '..'
import {
  isLocalNetworkHttpUrl,
  isPublicRemoteMediaUrl,
  sanitizeMediaSrc,
} from '../__internal__'
import {
  MAX_LINK_UPDATE_SCAN_NODES,
  findFirstLinkMarkInRange,
  MAX_LINK_TITLE_CHARS,
  normalizeLinkTitle,
  sanitizeLinkHref,
  toggleLinkCommand,
  updateLinkCommand,
} from '../mark/link'
import {
  insertImageCommand,
  MAX_IMAGE_TEXT_ATTR_CHARS,
  normalizeImageTextAttr,
  sanitizeImageSrc,
  updateImageCommand,
} from '../node/image'

const maxInlineImageBytes = 10 * 1024 * 1024
const maxUrlChars = 16 * 1024

function createOversizedBase64Payload() {
  return 'A'.repeat(Math.ceil((maxInlineImageBytes + 1) / 3) * 4)
}

function createOversizedUrlPath() {
  return `${'a'.repeat(maxUrlChars)}.png`
}

function createEditor(defaultValue = '') {
  const editor = Editor.make()
  editor.config((ctx) => {
    ctx.set(defaultValueCtx, defaultValue)
  })
  editor.use(commonmark)
  return editor
}

function findFirstImageInView(view: EditorView) {
  let image: { pos: number; src: string } | null = null
  view.state.doc.descendants((node, pos) => {
    if (node.type.name !== 'image') return true
    image = { pos, src: node.attrs.src }
    return false
  })
  return image
}

function typeText(view: EditorView, input: string) {
  for (const text of input) {
    const { from, to } = view.state.selection
    let handled = false
    view.someProp('handleTextInput', (handleTextInput) => {
      handled = handleTextInput(view, from, to, text) || handled
    })
    if (!handled) view.dispatch(view.state.tr.insertText(text, from, to))
  }
}

function findFirstLinkInView(view: EditorView) {
  let href: string | null = null
  view.state.doc.descendants((node) => {
    const link = node.marks.find((mark) => mark.type.name === 'link')
    if (!link) return true
    href = link.attrs.href
    return false
  })
  return href
}

afterEach(() => {
  vi.unstubAllGlobals()
})

it('blocks local-network media URLs without a browser window', () => {
  vi.stubGlobal('window', undefined)

  expect(isLocalNetworkHttpUrl('http://127.0.0.1:3000/image.png')).toBe(true)
  expect(isLocalNetworkHttpUrl('//127.0.0.1:3000/image.png')).toBe(true)
  expect(isLocalNetworkHttpUrl('http://localhost./image.png')).toBe(true)
  expect(isLocalNetworkHttpUrl('http://assets.localhost/image.png')).toBe(true)
  expect(isLocalNetworkHttpUrl('http://printer.local/image.png')).toBe(true)
  expect(isLocalNetworkHttpUrl('http://router/image.png')).toBe(true)
  expect(isLocalNetworkHttpUrl('http://100.64.0.1/image.png')).toBe(true)
  expect(isLocalNetworkHttpUrl('http://198.18.0.1/image.png')).toBe(true)
  expect(isLocalNetworkHttpUrl('http://[ff02::1]/image.png')).toBe(true)
  expect(isLocalNetworkHttpUrl('http://[::7f00:1]/image.png')).toBe(true)
  expect(isLocalNetworkHttpUrl('http://[::ffff:0:7f00:1]/image.png')).toBe(true)
  expect(isPublicRemoteMediaUrl('http://router/image.png')).toBe(false)
  expect(isPublicRemoteMediaUrl('http://[::7f00:1]/image.png')).toBe(false)
  expect(isPublicRemoteMediaUrl(String.raw`http:\127.0.0.1\image.png`)).toBe(false)
  expect(isPublicRemoteMediaUrl(String.raw`\\127.0.0.1\image.png`)).toBe(false)
  expect(sanitizeMediaSrc('http://127.0.0.1:3000/image.png')).toBe(null)
  expect(sanitizeMediaSrc('//127.0.0.1:3000/image.png')).toBe(null)
  expect(sanitizeMediaSrc('http://assets.localhost/image.png')).toBe(null)
  expect(sanitizeMediaSrc('http://100.64.0.1/image.png')).toBe(null)
  expect(sanitizeMediaSrc('http://[::7f00:1]/image.png')).toBe(null)
  expect(sanitizeMediaSrc('http://[::ffff:0:7f00:1]/image.png')).toBe(null)
  expect(sanitizeMediaSrc(String.raw`http:\127.0.0.1\image.png`)).toBe(null)
  expect(sanitizeMediaSrc(String.raw`\\127.0.0.1\image.png`)).toBe(null)
})

it('requires dotted IPv4 hostnames to use short decimal octets', () => {
  vi.stubGlobal('window', undefined)

  expect(isLocalNetworkHttpUrl('http://01.02.03.04/image.png')).toBe(false)
  expect(isLocalNetworkHttpUrl('http://1e2.0.0.1/image.png')).toBe(false)
  expect(isPublicRemoteMediaUrl('http://01.02.03.04/image.png')).toBe(true)
  expect(isPublicRemoteMediaUrl('http://1e2.0.0.1/image.png')).toBe(false)
})

it('allows public media URLs without a browser window', () => {
  vi.stubGlobal('window', undefined)

  expect(isLocalNetworkHttpUrl('https://example.com/image.png')).toBe(false)
  expect(isLocalNetworkHttpUrl('https://100.128.0.1/image.png')).toBe(false)
  expect(isLocalNetworkHttpUrl('https://[2606:4700:4700::1111]/image.png')).toBe(false)
  expect(isLocalNetworkHttpUrl('https://fc.example.com/image.png')).toBe(false)
  expect(isLocalNetworkHttpUrl('https://fd.example.com/image.png')).toBe(false)
  expect(isLocalNetworkHttpUrl('https://ff.example.com/image.png')).toBe(false)
  expect(isPublicRemoteMediaUrl('https://example.com/image.png')).toBe(true)
  expect(isPublicRemoteMediaUrl('https://[2606:4700:4700::1111]/image.png')).toBe(true)
  expect(isPublicRemoteMediaUrl('https://fc.example.com/image.png')).toBe(true)
  expect(isPublicRemoteMediaUrl('https://fd.example.com/image.png')).toBe(true)
  expect(isPublicRemoteMediaUrl('https://ff.example.com/image.png')).toBe(true)
  expect(sanitizeMediaSrc('https://example.com/image.png')).toBe('https://example.com/image.png')
  expect(sanitizeMediaSrc('https://fc.example.com/image.png')).toBe('https://fc.example.com/image.png')
  expect(sanitizeMediaSrc('//example.com/image.png')).toBe('https://example.com/image.png')
})

it('does not classify unsafe remote strings as public media URLs', () => {
  expect(isPublicRemoteMediaUrl('https://example.com/\u202Ecod.exe')).toBe(false)
  expect(isPublicRemoteMediaUrl('https://example.com/image.png\u0000')).toBe(false)
  expect(isPublicRemoteMediaUrl('//example.com/image.png\uFFFD')).toBe(false)
  expect(isPublicRemoteMediaUrl(String.raw`//example.com\image.png`)).toBe(false)
  expect(isPublicRemoteMediaUrl('https://user:pass@example.com/image.png')).toBe(false)
  expect(isPublicRemoteMediaUrl('//user:pass@example.com/image.png')).toBe(false)
  expect(isPublicRemoteMediaUrl('https:example.com/image.png')).toBe(false)
  expect(isPublicRemoteMediaUrl('http:/example.com/image.png')).toBe(false)
})

it('sanitizes image sources consistently for schema and component editors', () => {
  expect(sanitizeImageSrc('./assets/image.png')).toBe('./assets/image.png')
  expect(sanitizeImageSrc('img:assets/image.png')).toBe('img:assets/image.png')
  expect(sanitizeImageSrc('IMG:assets/image.png')).toBe('IMG:assets/image.png')
  expect(sanitizeImageSrc('img:.notes/image.png')).toBe('img:.notes/image.png')
  expect(sanitizeImageSrc('img:%2enotes/image.png')).toBe('img:%2enotes/image.png')
  expect(sanitizeImageSrc('data:image/png;base64,aGk=')).toBe('data:image/png;base64,aGk=')
  expect(sanitizeImageSrc('DATA:IMAGE/WEBP;BASE64,AQI=')).toBe('data:image/webp;base64,AQI=')
  expect(sanitizeImageSrc('', { allowEmpty: true })).toBe('')
  expect(sanitizeImageSrc('')).toBe(null)

  expect(sanitizeImageSrc('.vlaina/assets/image.png')).toBe(null)
  expect(sanitizeImageSrc('docs/.GIT/image.png')).toBe(null)
  expect(sanitizeImageSrc('docs/%252egit/image.png')).toBe(null)
  expect(sanitizeImageSrc('javascript:alert(1)')).toBe(null)
  expect(sanitizeImageSrc('data:image/svg+xml,<svg></svg>')).toBe(null)
  expect(sanitizeImageSrc('data:text/html;base64,PHNjcmlwdD4=')).toBe(null)
  expect(sanitizeImageSrc('img:/etc/passwd')).toBe(null)
  expect(sanitizeImageSrc('img:\\secret.png')).toBe(null)
  expect(sanitizeImageSrc('img://example.com/image.png')).toBe(null)
  expect(sanitizeImageSrc('img:.vlaina/assets/image.png')).toBe(null)
  expect(sanitizeImageSrc('img:docs/.GIT/image.png')).toBe(null)
  expect(sanitizeImageSrc('img:%2evlaina/assets/image.png')).toBe(null)
  expect(sanitizeImageSrc('img:docs/%252egit/image.png')).toBe(null)
  expect(sanitizeImageSrc('/etc/passwd')).toBe(null)
  expect(sanitizeImageSrc('C:\\Users\\secret.png')).toBe(null)
  expect(sanitizeImageSrc('http://127.0.0.1:3000/image.png')).toBe(null)
  expect(sanitizeImageSrc('https://user:pass@example.com/image.png')).toBe(null)
  expect(sanitizeImageSrc('//user:pass@example.com/image.png')).toBe(null)
  expect(sanitizeImageSrc(String.raw`//example.com\image.png`)).toBe(null)
  expect(sanitizeImageSrc(String.raw`data\:image/png;base64,aGk=`)).toBe(null)
  expect(sanitizeImageSrc(String.raw`img\:assets/image.png`)).toBe(null)
  expect(sanitizeImageSrc(String.raw`blob\:https://example.com/image`)).toBe(null)
  expect(sanitizeImageSrc('https:example.com/image.png')).toBe(null)
  expect(sanitizeImageSrc('http:/example.com/image.png')).toBe(null)
})

it('bounds image text attrs consistently', () => {
  expect(normalizeImageTextAttr('Alt')).toBe('Alt')
  expect(normalizeImageTextAttr('x'.repeat(MAX_IMAGE_TEXT_ATTR_CHARS + 1))).toHaveLength(MAX_IMAGE_TEXT_ATTR_CHARS)
  expect(normalizeImageTextAttr(null)).toBe('')
})

it('rejects oversized inline data image sources', () => {
  expect(sanitizeImageSrc('data:image/png;base64,aGk=')).toBe('data:image/png;base64,aGk=')
  expect(sanitizeImageSrc(`data:image/png;base64,${createOversizedBase64Payload()}`)).toBe(null)
})

it('rejects oversized media sources and link hrefs', () => {
  const oversizedPath = createOversizedUrlPath()

  expect(isPublicRemoteMediaUrl(`https://example.com/${oversizedPath}`)).toBe(false)
  expect(sanitizeMediaSrc(`https://example.com/${oversizedPath}`)).toBe(null)
  expect(sanitizeMediaSrc(`blob:https://example.com/${oversizedPath}`)).toBe(null)
  expect(sanitizeMediaSrc(String.raw`data\:image/png;base64,aGk=`)).toBe(null)
  expect(sanitizeMediaSrc(String.raw`img\:assets/image.png`)).toBe(null)
  expect(sanitizeMediaSrc('https://user:pass@example.com/image.png')).toBe(null)
  expect(sanitizeImageSrc(`img:${oversizedPath}`)).toBe(null)
  expect(sanitizeImageSrc(oversizedPath)).toBe(null)
  expect(sanitizeLinkHref(`${'a'.repeat(maxUrlChars)}.md`)).toBe(null)
  expect(isPublicRemoteMediaUrl(' '.repeat(maxUrlChars + 1))).toBe(false)
  expect(sanitizeMediaSrc(' '.repeat(maxUrlChars + 1))).toBe(null)
  expect(sanitizeLinkHref(' '.repeat(maxUrlChars + 1))).toBe(null)
})

it('drops unsafe markdown image sources during parsing', async () => {
  const editor = createEditor(
    [
      '![local](http://127.0.0.1:3000/a.png)',
      '![script](javascript:alert(1))',
      '![entity-script](javascript&colon;alert(1))',
      '![numeric-script](java&#x73;cript&#58;alert(1))',
      '![safe](./assets/safe.png)',
      '![internal](img:assets/safe.png)',
      '![bad-internal](img:/etc/passwd)',
      '![bad-vlaina](img:.vlaina/private.png)',
      '![bad-git](img:docs/%2egit/config.png)',
      '![entity-safe](https://example.com/path?a=1&amp;b=2.png)',
    ].join('\n\n')
  )

  await editor.create()

  const doc = editor.ctx.get(parserCtx)(editor.ctx.get(defaultValueCtx))
  const sources: string[] = []
  doc.descendants((node) => {
    if (node.type.name === 'image') sources.push(node.attrs.src)
  })

  expect(sources).toEqual(['./assets/safe.png', 'img:assets/safe.png', 'https://example.com/path?a=1&b=2.png'])

  await editor.destroy()
})

it('does not create image nodes from unsafe image input rules', async () => {
  const editor = createEditor()

  await editor.create()

  const view = editor.ctx.get(editorViewCtx)
  typeText(view, '![bad](javascript:alert(1))')

  let hasImage = false
  view.state.doc.descendants((node) => {
    if (node.type.name === 'image') hasImage = true
  })

  expect(hasImage).toBe(false)

  await editor.destroy()
})

it('decodes image input rule destinations before safety checks', async () => {
  const editor = createEditor()

  await editor.create()

  const view = editor.ctx.get(editorViewCtx)
  typeText(view, '![bad](javascript&colon;alert(1))')
  expect(findFirstImageInView(view)).toBe(null)

  view.dispatch(view.state.tr.delete(1, view.state.doc.content.size))
  typeText(view, '![safe](https://example.com/path?a=1&amp;b=2.png)')
  expect(findFirstImageInView(view)?.src).toBe('https://example.com/path?a=1&b=2.png')

  await editor.destroy()
})

it('does not insert or update images with unsafe command sources', async () => {
  const editor = createEditor()

  await editor.create()

  const commands = editor.ctx.get(commandsCtx)
  const view = editor.ctx.get(editorViewCtx)

  expect(commands.call(insertImageCommand.key, { src: 'javascript:alert(1)' })).toBe(false)
  expect(findFirstImageInView(view)).toBe(null)

  expect(commands.call(insertImageCommand.key, { src: './assets/safe.png' })).toBe(true)
  const inserted = findFirstImageInView(view)
  expect(inserted?.src).toBe('./assets/safe.png')
  expect(inserted).not.toBe(null)

  view.dispatch(
    view.state.tr.setSelection(NodeSelection.create(view.state.doc, inserted!.pos))
  )
  expect(commands.call(updateImageCommand.key, { src: 'http://127.0.0.1/a.png' })).toBe(false)
  expect(findFirstImageInView(view)?.src).toBe('./assets/safe.png')

  expect(commands.call(updateImageCommand.key, { src: 'img:assets/safe.png' })).toBe(true)
  expect(findFirstImageInView(view)?.src).toBe('img:assets/safe.png')
  expect(commands.call(updateImageCommand.key, { src: 'img:/etc/passwd' })).toBe(false)
  expect(findFirstImageInView(view)?.src).toBe('img:assets/safe.png')
  expect(commands.call(updateImageCommand.key, { src: `data:image/png;base64,${createOversizedBase64Payload()}` })).toBe(false)
  expect(findFirstImageInView(view)?.src).toBe('img:assets/safe.png')
  expect(commands.call(updateImageCommand.key, { src: createOversizedUrlPath() })).toBe(false)
  expect(findFirstImageInView(view)?.src).toBe('img:assets/safe.png')

  await editor.destroy()
})

it('sanitizes link hrefs consistently for schema and component editors', () => {
  expect(sanitizeLinkHref('https://example.com/path')).toBe('https://example.com/path')
  expect(sanitizeLinkHref('mailto:user@example.com')).toBe('mailto:user@example.com')
  expect(sanitizeLinkHref('weixin://')).toBe('weixin://')
  expect(sanitizeLinkHref('weixin://dl/chat')).toBe('weixin://dl/chat')
  expect(sanitizeLinkHref('#heading')).toBe('#heading')
  expect(sanitizeLinkHref('../docs/readme.md')).toBe('../docs/readme.md')
  expect(sanitizeLinkHref('.notes/readme.md')).toBe('.notes/readme.md')

  expect(sanitizeLinkHref('.vlaina/workspace.md')).toBe(null)
  expect(sanitizeLinkHref('./.vlaina/workspace.md')).toBe(null)
  expect(sanitizeLinkHref('docs/.git/config.md')).toBe(null)
  expect(sanitizeLinkHref('docs/.GIT/config.md')).toBe(null)
  expect(sanitizeLinkHref('%2evlaina/workspace.md')).toBe(null)
  expect(sanitizeLinkHref('docs/%252egit/config.md')).toBe(null)
  expect(sanitizeLinkHref('https://example.com/.git/config.md')).toBe('https://example.com/.git/config.md')
  expect(sanitizeLinkHref('javascript:alert(1)')).toBe(null)
  expect(sanitizeLinkHref('data:text/html,alert(1)')).toBe(null)
  expect(sanitizeLinkHref('//example.com/path')).toBe(null)
  expect(sanitizeLinkHref(String.raw`//example.com\path`)).toBe(null)
  expect(sanitizeLinkHref('https://user:pass@example.com/path')).toBe(null)
  expect(sanitizeLinkHref('https:example.com/path')).toBe(null)
  expect(sanitizeLinkHref('http:/example.com/path')).toBe(null)
  expect(sanitizeLinkHref(String.raw`https:\example.com\path`)).toBe(null)
  expect(sanitizeLinkHref(String.raw`https\://example.com/path`)).toBe(null)
  expect(sanitizeLinkHref(String.raw`mailto\:user@example.test`)).toBe(null)
  expect(sanitizeLinkHref(String.raw`\\example.com\path`)).toBe(null)
  expect(sanitizeLinkHref('C:\\Users\\secret.txt')).toBe(null)
  expect(sanitizeLinkHref('https://example.com/\u202Ecod.exe')).toBe(null)
})

it('keeps weixin markdown links as editable link marks', async () => {
  const editor = createEditor('[wx](weixin://)')

  await editor.create()

  const doc = editor.ctx.get(parserCtx)(editor.ctx.get(defaultValueCtx))
  let linkHref: string | null = null
  doc.descendants((node) => {
    const link = node.marks.find((mark) => mark.type.name === 'link')
    if (!link) return true
    linkHref = link.attrs.href
    return false
  })

  expect(doc.textContent).toBe('wx')
  expect(linkHref).toBe('weixin://')

  await editor.destroy()
})

it('bounds link title attrs consistently', () => {
  expect(normalizeLinkTitle('Title')).toBe('Title')
  expect(normalizeLinkTitle('x'.repeat(MAX_LINK_TITLE_CHARS + 1))).toHaveLength(MAX_LINK_TITLE_CHARS)
  expect(normalizeLinkTitle(null)).toBeNull()
})

it('preserves markdown link titles without rendering native hover text', async () => {
  const editor = createEditor('[Docs](https://example.com "Docs title")')

  await editor.create()

  const view = editor.ctx.get(editorViewCtx)
  expect(view.dom.querySelector('a')?.hasAttribute('title')).toBe(false)

  const doc = editor.ctx.get(parserCtx)(editor.ctx.get(defaultValueCtx))
  let linkTitle: string | null = null
  doc.descendants((node) => {
    const link = node.marks.find((mark) => mark.type.name === 'link')
    if (!link) return true
    linkTitle = link.attrs.title
    return false
  })
  expect(linkTitle).toBe('Docs title')

  await editor.destroy()
})

it('does not add or update links with unsafe command hrefs', async () => {
  const editor = createEditor('link')

  await editor.create()

  const commands = editor.ctx.get(commandsCtx)
  const view = editor.ctx.get(editorViewCtx)
  view.dispatch(
    view.state.tr.setSelection(TextSelection.create(view.state.doc, 1, 5))
  )

  expect(commands.call(toggleLinkCommand.key, { href: 'javascript:alert(1)' })).toBe(false)
  expect(findFirstLinkInView(view)).toBe(null)

  expect(commands.call(toggleLinkCommand.key, { href: './safe.md' })).toBe(true)
  expect(findFirstLinkInView(view)).toBe('./safe.md')

  expect(commands.call(updateLinkCommand.key, { href: 'data:text/html,alert(1)' })).toBe(false)
  expect(findFirstLinkInView(view)).toBe('./safe.md')

  expect(commands.call(updateLinkCommand.key, { href: String.raw`https:\example.com\path` })).toBe(false)
  expect(findFirstLinkInView(view)).toBe('./safe.md')

  expect(commands.call(updateLinkCommand.key, { href: `${'a'.repeat(maxUrlChars)}.md` })).toBe(false)
  expect(findFirstLinkInView(view)).toBe('./safe.md')

  await editor.destroy()
})

it('stops link update scans after finding the first link mark', () => {
  const linkType = {
    isInSet: (marks: readonly unknown[]) => marks[0] ?? null,
  }
  const linkMark = { attrs: { href: './safe.md' } }
  let accessed = 0
  const children = [
    {
      childCount: 0,
      marks: [linkMark],
      nodeSize: 1,
      type: { name: 'text' },
    },
    ...Array.from({ length: MAX_LINK_UPDATE_SCAN_NODES }, () => ({
      childCount: 0,
      marks: [],
      nodeSize: 1,
      type: { name: 'text' },
    })),
  ]
  const doc = {
    child(index: number) {
      accessed += 1
      return children[index]!
    },
    childCount: children.length,
    content: { size: children.length },
  }

  expect(
    findFirstLinkMarkInRange(doc as never, 0, children.length, linkType as never)
  ).toMatchObject({
    mark: linkMark,
    pos: 0,
  })
  expect(accessed).toBe(1)
})
