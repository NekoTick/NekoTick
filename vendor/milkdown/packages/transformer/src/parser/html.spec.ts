import { describe, expect, it } from 'vitest'

import type { MarkdownNode } from '../utility'

import {
  MAX_INLINE_HTML_MERGE_CHILDREN,
  MAX_INLINE_HTML_MERGE_DEPTH,
  mergePairedInlineHtml,
} from './html'

function createPositionedInlineNodes(
  markdown: string,
  parts: Array<{
    type: string
    value?: string
    children?: MarkdownNode[]
    data?: Record<string, unknown>
    source?: string
  }>
): MarkdownNode[] {
  let offset = 0
  return parts.map((part) => {
    const source = part.source ?? part.value
    if (source === undefined) throw new Error('Missing markdown part source')
    const start = markdown.indexOf(source, offset)
    if (start < 0) throw new Error(`Missing markdown part: ${source}`)
    offset = start + source.length
    return {
      ...part,
      position: {
        start: { offset: start },
        end: { offset },
      },
    } as MarkdownNode
  })
}

function createTree(
  markdown: string,
  parts: Array<{ type: string; value?: string; children?: MarkdownNode[]; source?: string }>
): MarkdownNode {
  return {
    type: 'root',
    children: [
      {
        type: 'paragraph',
        children: createPositionedInlineNodes(markdown, parts),
      } as MarkdownNode,
    ],
  } as MarkdownNode
}

function createBlockTree(
  markdown: string,
  parts: Array<{ type: string; value?: string; children?: MarkdownNode[]; source?: string }>
): MarkdownNode {
  return {
    type: 'root',
    children: createPositionedInlineNodes(markdown, parts),
  } as MarkdownNode
}

function paragraphChildren(tree: MarkdownNode): MarkdownNode[] {
  return tree.children?.[0]?.children ?? []
}

function createNestedStrongNode(depth: number): MarkdownNode {
  let node = { type: 'text', value: 'nested' } as MarkdownNode
  for (let index = 0; index < depth; index += 1) {
    node = {
      type: 'strong',
      children: [node],
    } as MarkdownNode
  }
  return node
}

describe('mergePairedInlineHtml', () => {
  it('restores raw source for paired containers with nested html nodes', () => {
    const markdown = '<span style="color : #123456"><em>nested</em></span> <mark style="background-color : #ecf6ff"><strong>bold</strong></mark>'
    const tree = createTree(markdown, [
      { type: 'html', value: '<span style="color : #123456">' },
      { type: 'html', value: '<em>' },
      { type: 'text', value: 'nested' },
      { type: 'html', value: '</em>' },
      { type: 'html', value: '</span>' },
      { type: 'text', value: ' ' },
      { type: 'html', value: '<mark style="background-color : #ecf6ff">' },
      { type: 'html', value: '<strong>' },
      { type: 'text', value: 'bold' },
      { type: 'html', value: '</strong>' },
      { type: 'html', value: '</mark>' },
    ])

    const result = mergePairedInlineHtml(tree, markdown)

    expect(paragraphChildren(result).map((node) => ({ type: node.type, value: node.value }))).toEqual([
      { type: 'html', value: '<span style="color : #123456"><em>nested</em></span>' },
      { type: 'text', value: ' ' },
      { type: 'html', value: '<mark style="background-color : #ecf6ff"><strong>bold</strong></mark>' },
    ])
  })

  it('restores raw source for paired containers with entity-encoded nested html text', () => {
    const markdown = '<span style="color : #123456"><em>nested</em></span>'
    const tree = createTree(markdown, [
      { type: 'html', value: '<span style="color : #123456">' },
      { type: 'text', value: '&lt;em&gt;nested&lt;/em&gt;', source: '<em>nested</em>' },
      { type: 'html', value: '</span>' },
    ])

    const result = mergePairedInlineHtml(tree, markdown)

    expect(paragraphChildren(result).map((node) => ({ type: node.type, value: node.value }))).toEqual([
      { type: 'html', value: markdown },
    ])
  })

  it('keeps multiline block html inline when a paragraph has adjacent content', () => {
    const markdown = ['Before', '<textarea>', 'raw', '</textarea>', 'After'].join('\n')
    const tree = createTree(markdown, [
      { type: 'text', value: 'Before\n' },
      { type: 'html', value: '<textarea>' },
      { type: 'text', value: '\nraw\n' },
      { type: 'html', value: '</textarea>' },
      { type: 'text', value: '\nAfter' },
    ])

    const result = mergePairedInlineHtml(tree, markdown)

    expect(paragraphChildren(result)).toMatchObject([
      { type: 'text', value: 'Before\n' },
      {
        type: 'html',
        value: ['<textarea>', 'raw', '</textarea>'].join('\n'),
        githubHtmlBlock: false,
      },
      { type: 'text', value: '\nAfter' },
    ])
  })

  it('preserves source boundary data while merging multiline html', () => {
    const markdown = ['<textarea>', 'raw', '</textarea>', '', 'After'].join('\n')
    const tree = createTree(markdown, [
      { type: 'html', value: '<textarea>', data: { sourceTightBefore: true } },
      { type: 'text', value: '\nraw\n' },
      {
        type: 'html',
        value: '</textarea>',
        data: { sourceBlankLineCountAfter: 1 },
      },
    ])

    const result = mergePairedInlineHtml(tree, markdown)

    expect(result.children?.[0]).toMatchObject({
      type: 'html',
      data: {
        sourceBlankLineCountAfter: 1,
        sourceTightBefore: true,
      },
      position: {
        start: { offset: 0 },
        end: { offset: markdown.indexOf('</textarea>') + '</textarea>'.length },
      },
    })
  })

  it.each(['heading', 'tableCell'])(
    'keeps multiline block html inline inside %s nodes',
    (type) => {
      const markdown = [': <textarea>', 'raw', '</textarea>'].join('\n')
      const tree = {
        type: 'root',
        children: [{
          type,
          children: createPositionedInlineNodes(markdown, [
            { type: 'text', value: ': ' },
            { type: 'html', value: '<textarea>' },
            { type: 'text', value: '\nraw\n' },
            { type: 'html', value: '</textarea>' },
          ]),
        } as MarkdownNode],
      } as MarkdownNode

      const result = mergePairedInlineHtml(tree, markdown)

      expect(result.children?.[0]?.children).toMatchObject([
        { type: 'text', value: ': ' },
        {
          type: 'html',
          value: ['<textarea>', 'raw', '</textarea>'].join('\n'),
          githubHtmlBlock: false,
        },
      ])
    }
  )

  it('restores single html nodes from source when their value has encoded nested tags', () => {
    const markdown = '<span style="color : #123456"><em>nested</em></span>'
    const tree = createTree(markdown, [
      {
        type: 'html',
        value: '<span style="color : #123456">&lt;em&gt;nested&lt;/em&gt;</span>',
        source: markdown,
      },
    ])

    const result = mergePairedInlineHtml(tree, markdown)

    expect(paragraphChildren(result).map((node) => ({ type: node.type, value: node.value }))).toEqual([
      { type: 'html', value: markdown },
    ])
  })

  it.each([
    {
      container: 'blockquote',
      markdown: ['> <textarea>', '> hidden source', '> </textarea>'].join('\n'),
      source: '<textarea>\n> hidden source\n> </textarea>',
      start: 2,
      startColumn: 3,
      tree: (node: MarkdownNode) => ({
        type: 'root',
        children: [{
          type: 'blockquote',
          children: [{ type: 'paragraph', children: [node] } as MarkdownNode],
        } as MarkdownNode],
      } as MarkdownNode),
    },
    {
      container: 'list item',
      markdown: ['- <textarea>', '  hidden source', '  </textarea>'].join('\n'),
      source: '<textarea>\n  hidden source\n  </textarea>',
      start: 2,
      startColumn: 3,
      tree: (node: MarkdownNode) => ({
        type: 'root',
        children: [{
          type: 'list',
          children: [{
            type: 'listItem',
            children: [{ type: 'paragraph', children: [node] } as MarkdownNode],
          } as MarkdownNode],
        } as MarkdownNode],
      } as MarkdownNode),
    },
  ])('removes $container prefixes while restoring multiline html source', ({
    markdown,
    source,
    start,
    startColumn,
    tree,
  }) => {
    const value = ['<textarea>', 'hidden source', '</textarea>'].join('\n')
    const html = {
      type: 'html',
      value,
      position: {
        start: { column: startColumn, offset: start },
        end: { offset: start + source.length },
      },
    } as MarkdownNode

    const result = mergePairedInlineHtml(tree(html), markdown)
    const serialized = JSON.stringify(result)

    expect(serialized).toContain(JSON.stringify(value).slice(1, -1))
    expect(serialized).not.toContain('> hidden source')
    expect(serialized).not.toContain('  hidden source')
  })

  it.each([
    {
      expected: true,
      markdown: ['- <textarea>', '  hidden source', '  </textarea>'].join('\n'),
      sourceLine: 1,
    },
    {
      expected: undefined,
      markdown: ['-', '', '  <textarea>', '  hidden source', '  </textarea>'].join('\n'),
      sourceLine: 3,
    },
  ])('marks a list item tight-first-block as $expected for source line $sourceLine', ({
    expected,
    markdown,
    sourceLine,
  }) => {
    const value = ['<textarea>', 'hidden source', '</textarea>'].join('\n')
    const html = {
      type: 'html',
      value,
      position: {
        start: {
          column: 3,
          line: sourceLine,
          offset: markdown.indexOf('<textarea>'),
        },
        end: { offset: markdown.length },
      },
    } as MarkdownNode
    const tree = {
      type: 'root',
      children: [{
        type: 'list',
        children: [{
          type: 'listItem',
          position: { start: { line: 1, offset: 0 }, end: { offset: markdown.length } },
          children: [{ type: 'paragraph', children: [html] } as MarkdownNode],
        } as MarkdownNode],
      } as MarkdownNode],
    } as MarkdownNode

    const result = mergePairedInlineHtml(tree, markdown)
    const listItem = result.children?.[0]?.children?.[0]

    expect(listItem?.sourceTightFirstBlock).toBe(expected)
  })

  it('pairs same-tag nested inline html by nesting depth', () => {
    const markdown = '<span style="color : #123456"><span style="font-weight : 600">nested</span></span>'
    const tree = createTree(markdown, [
      { type: 'html', value: '<span style="color : #123456">' },
      { type: 'html', value: '<span style="font-weight : 600">' },
      { type: 'text', value: 'nested' },
      { type: 'html', value: '</span>' },
      { type: 'html', value: '</span>' },
    ])

    const result = mergePairedInlineHtml(tree, markdown)

    expect(paragraphChildren(result).map((node) => ({ type: node.type, value: node.value }))).toEqual([
      { type: 'html', value: markdown },
    ])
  })

  it('restores raw source for search listed-tag html blocks with inline markdown text', () => {
    const markdown = '<search>Find *literal emphasis markers*\n</search>'
    const tree = createTree(markdown, [
      { type: 'html', value: '<search>' },
      { type: 'text', value: 'Find ' },
      {
        type: 'emphasis',
        children: [{ type: 'text', value: 'literal emphasis markers' }] as MarkdownNode[],
        source: '*literal emphasis markers*',
      },
      { type: 'text', value: '\n' },
      { type: 'html', value: '</search>' },
    ])

    const result = mergePairedInlineHtml(tree, markdown)

    expect(result).toMatchObject({
      type: 'root',
      children: [
        {
          type: 'html',
          value: markdown,
          githubHtmlBlock: true,
        },
      ],
    })
  })

  it('restores raw source for paired block html split by markdown blank lines', () => {
    const markdown = '<div>\nAlpha\n\nBeta\n</div>'
    const tree = createBlockTree(markdown, [
      { type: 'html', value: '<div>\nAlpha' },
      {
        type: 'paragraph',
        children: [{ type: 'text', value: 'Beta' }] as MarkdownNode[],
        source: 'Beta',
      },
      { type: 'html', value: '</div>' },
    ])

    const result = mergePairedInlineHtml(tree, markdown)

    expect(result).toMatchObject({
      type: 'root',
      children: [
        {
          type: 'html',
          value: markdown,
          githubHtmlBlock: true,
        },
      ],
    })
  })

  it('does not repeatedly scan all siblings for unmatched open tags', () => {
    let stringReads = 0
    const children = Array.from({ length: 400 }, () => ({
      type: 'html',
      value: {
        toString() {
          stringReads += 1
          return '<span>'
        },
      },
    })) as MarkdownNode[]
    const tree = {
      type: 'paragraph',
      children,
    } as MarkdownNode

    const result = mergePairedInlineHtml(tree)

    expect(result.children).toHaveLength(children.length)
    expect(stringReads).toBeLessThanOrEqual(children.length * 2)
  })

  it('does not repeatedly scan all siblings for unmatched block open tags', () => {
    let stringReads = 0
    const children = Array.from({ length: 400 }, () => ({
      type: 'html',
      value: {
        toString() {
          stringReads += 1
          return '<div>'
        },
      },
    })) as MarkdownNode[]
    const tree = {
      type: 'root',
      children,
    } as MarkdownNode

    const result = mergePairedInlineHtml(tree)

    expect(result.children).toHaveLength(children.length)
    expect(stringReads).toBeLessThanOrEqual(children.length * 6)
  })

  it('ignores non-primitive inline html values without coercion', () => {
    let stringReads = 0
    const throwingValue = {
      toString() {
        stringReads += 1
        throw new Error('Unexpected markdown value coercion')
      },
    }
    const tree = {
      type: 'paragraph',
      children: [
        { type: 'html', value: '<span>' },
        { type: 'text', value: throwingValue },
        { type: 'inlineCode', value: throwingValue },
        { type: 'html', value: '</span>' },
        { type: 'html', value: throwingValue },
      ],
    } as MarkdownNode

    expect(() => mergePairedInlineHtml(tree)).not.toThrow()
    expect(stringReads).toBe(0)
    expect(tree.children?.map((node) => node.type)).toEqual([
      'html',
      'text',
      'inlineCode',
      'html',
      'html',
    ])
  })

  it('skips paired inline html merging when child count exceeds the merge budget', () => {
    const children = Array.from({ length: MAX_INLINE_HTML_MERGE_CHILDREN + 1 }, (_, index) => ({
      type: index === 0 || index === MAX_INLINE_HTML_MERGE_CHILDREN ? 'html' : 'text',
      value: index === 0 ? '<span style="color : #123456">' : index === MAX_INLINE_HTML_MERGE_CHILDREN ? '</span>' : 'x',
    })) as MarkdownNode[]
    const tree = {
      type: 'paragraph',
      children,
    } as MarkdownNode

    const result = mergePairedInlineHtml(tree)

    expect(result.children).toHaveLength(children.length)
    expect(result.children?.[0]).toBe(children[0])
    expect(result.children?.[MAX_INLINE_HTML_MERGE_CHILDREN]).toBe(children[MAX_INLINE_HTML_MERGE_CHILDREN])
  })

  it('stops descending after the inline html merge depth budget', () => {
    const leaf = {
      type: 'paragraph',
      children: [
        { type: 'html', value: '<span style="color : #123456">' },
        { type: 'strong', children: [{ type: 'text', value: 'nested' }] as MarkdownNode[] },
        { type: 'html', value: '</span>' },
      ],
    } as MarkdownNode
    let node = leaf
    for (let depth = 0; depth <= MAX_INLINE_HTML_MERGE_DEPTH; depth += 1) {
      node = {
        type: 'container',
        children: [node],
      } as MarkdownNode
    }

    expect(() => mergePairedInlineHtml(node)).not.toThrow()
    expect(leaf.children).toHaveLength(3)
  })

  it('skips inline html rendering when nested markdown exceeds the render budget', () => {
    const nested = createNestedStrongNode(MAX_INLINE_HTML_MERGE_DEPTH + 2)
    const tree = {
      type: 'paragraph',
      children: [
        { type: 'html', value: '<span>' },
        nested,
        { type: 'html', value: '</span>' },
      ],
    } as MarkdownNode

    expect(() => mergePairedInlineHtml(tree)).not.toThrow()
    expect(tree.children).toEqual([
      { type: 'html', value: '<span>' },
      nested,
      { type: 'html', value: '</span>' },
    ])
  })
})
