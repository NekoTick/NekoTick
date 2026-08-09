import type { MarkType, NodeType, Schema } from '@milkdown/prose/model'

import { describe, expect, it, vi } from 'vitest'

import type { MarkdownNode } from '../utility'

import { ParserState } from './state'

const docNodeType = {
  createAndFill: vi.fn().mockImplementation((attrs, content, marks) => ({
    name: 'docNode',
    content,
    attrs,
    marks,
  })),
} as unknown as NodeType
const paragraphNodeType = {
  createAndFill: vi.fn().mockImplementation((attrs, content, marks) => ({
    name: 'paragraphNode',
    content,
    attrs,
    marks,
  })),
} as unknown as NodeType
const blockquoteNodeType = {
  createAndFill: vi.fn().mockImplementation((attrs, content, marks) => ({
    name: 'blockquoteNode',
    content,
    attrs,
    marks,
  })),
} as unknown as NodeType
const boldType = {
  create: vi.fn().mockImplementation((attrs) => ({
    name: 'boldMark',
    attrs,
    addToSet: (arr: string[]) => arr.concat('bold'),
    removeFromSet: (arr: string[]) => arr.filter((x) => x !== 'bold'),
  })),
  addToSet: (arr: string[]) => arr.concat('bold'),
  removeFromSet: (arr: string[]) => arr.filter((x) => x !== 'bold'),
} as unknown as MarkType

const schema = {
  nodes: {
    doc: {
      spec: {
        parseMarkdown: {
          match: (node: { type: string }) => node.type === 'root',
          runner: (state: ParserState, node: { children: MarkdownNode[] }) => {
            state.injectRoot(node as MarkdownNode, docNodeType)
          },
        },
      },
    },
    paragraph: {
      spec: {
        parseMarkdown: {
          match: (node: { type: string }) => node.type === 'paragraphNode',
          runner: (state: ParserState, node: { value: string }) => {
            state.addText(node.value)
          },
        },
      },
    },
    blockquote: {
      spec: {
        parseMarkdown: {
          match: (node: { type: string }) => node.type === 'blockquoteNode',
          runner: (state: ParserState, node: { children: MarkdownNode[] }) => {
            state.openNode(blockquoteNodeType)
            state.next(node.children)
            state.closeNode()
          },
        },
      },
    },
  },
  text: (text: string, marks: string[]) => ({ text, marks, isText: true }),
} as unknown as Schema

function createDeepTree(depth: number): MarkdownNode {
  let current: MarkdownNode = {
    type: 'paragraphNode',
    value: 'leaf',
  }

  for (let index = 0; index < depth; index += 1) {
    current = {
      type: 'blockquoteNode',
      children: [current],
    }
  }

  return current
}

describe('parser-state', () => {
  it('reuses the schema type list for every Markdown AST node', () => {
    let nodesReadCount = 0
    const localSchema = {
      get nodes() {
        nodesReadCount += 1
        return schema.nodes
      },
      marks: {},
      text: schema.text,
    } as unknown as Schema
    const state = new ParserState(localSchema)
    state.openNode(docNodeType)

    state.next([
      { type: 'paragraphNode', value: 'one' },
      { type: 'paragraphNode', value: 'two' },
      { type: 'paragraphNode', value: 'three' },
    ])

    expect(nodesReadCount).toBe(1)
  })

  it('node', () => {
    const state = new ParserState(schema)
    state.openNode(docNodeType)

    state
      .openNode(blockquoteNodeType, { id: 'blockquote' })
      .addNode(paragraphNodeType, { id: 1 })
      .addNode(paragraphNodeType, { id: 2 })
      .closeNode()

    expect(state.top()).toMatchObject({
      content: [
        {
          name: 'blockquoteNode',
          content: [
            {
              name: 'paragraphNode',
              attrs: {
                id: 1,
              },
            },
            {
              name: 'paragraphNode',
              attrs: {
                id: 2,
              },
            },
          ],
        },
      ],
    })
  })

  it('mark', () => {
    const state = new ParserState(schema)
    state.openNode(docNodeType)
    state.openMark(boldType).addNode(paragraphNodeType).closeMark(boldType)

    expect(state.top()).toMatchObject({
      content: [
        {
          name: 'paragraphNode',
          marks: ['bold'],
        },
      ],
    })
  })

  it('merge text for no mark', () => {
    const state = new ParserState(schema)
    state.openNode(docNodeType)

    state
      .openNode(paragraphNodeType)
      .addText('The lunatic is on the grass.\n')
      .addText("I'll see you on the dark side of the moon.")
      .closeNode()

    expect(state.top()).toMatchObject({
      content: [
        {
          name: 'paragraphNode',
          content: [
            {
              text: "The lunatic is on the grass.\nI'll see you on the dark side of the moon.",
            },
          ],
        },
      ],
    })
  })

  it('merge text for same mark', () => {
    const state = new ParserState(schema)
    state.openNode(docNodeType)

    state
      .openNode(paragraphNodeType)
      .openMark(boldType)
      .addText('The lunatic is on the grass.\n')
      .addText("I'll see you on the dark side of the moon.")
      .closeMark(boldType)
      .closeNode()

    expect(state.top()).toMatchObject({
      content: [
        {
          name: 'paragraphNode',
          content: [
            {
              text: "The lunatic is on the grass.\nI'll see you on the dark side of the moon.",
            },
          ],
        },
      ],
    })
  })

  it('not merge text for different marks', () => {
    const state = new ParserState(schema)
    state.openNode(docNodeType)

    state
      .openNode(paragraphNodeType)
      .openMark(boldType)
      .addText('The lunatic is on the grass.\n')
      .closeMark(boldType)
      .addText("I'll see you on the dark side of the moon.")
      .closeNode()

    expect(state.top()).toMatchObject({
      content: [
        {
          name: 'paragraphNode',
          content: [
            {
              text: 'The lunatic is on the grass.\n',
            },
            {
              text: "I'll see you on the dark side of the moon.",
            },
          ],
        },
      ],
    })
  })

  it('build', () => {
    const state = new ParserState(schema)
    state.openNode(docNodeType)

    state
      .openNode(blockquoteNodeType, { id: 'blockquote' })
      .addNode(paragraphNodeType, { id: 1 })
      .addNode(paragraphNodeType, { id: 2 })
      .closeNode()

    const node = state.build()
    expect(node).toMatchObject({
      name: 'docNode',
      content: [
        {
          name: 'blockquoteNode',
          content: [
            {
              name: 'paragraphNode',
              attrs: {
                id: 1,
              },
            },
            {
              name: 'paragraphNode',
              attrs: {
                id: 2,
              },
            },
          ],
        },
      ],
    })
  })

  it('next', () => {
    const state = new ParserState(schema)
    state.openNode(docNodeType)
    state.next([
      {
        type: 'blockquoteNode',
        children: [
          {
            type: 'paragraphNode',
            value: 'The lunatic is on the grass.',
          },
        ],
      },
    ])

    const node = state.build()
    expect(node).toMatchObject({
      name: 'docNode',
      content: [
        {
          name: 'blockquoteNode',
          content: [
            {
              text: 'The lunatic is on the grass.',
            },
          ],
        },
      ],
    })
  })

  it('does not materialize a copied node array while advancing parser state', () => {
    const state = new ParserState(schema)
    state.openNode(docNodeType)
    const nodes = Array.from({ length: 4000 }, (_, index) => ({
      type: 'paragraphNode',
      value: `node-${index}\n`,
    }))
    const flatSpy = vi.spyOn(Array.prototype, 'flat')

    state.next(nodes)
    const flatCallCount = flatSpy.mock.calls.length
    flatSpy.mockRestore()

    expect(flatCallCount).toBe(0)
    expect(state.top()?.content).toHaveLength(1)
    expect(state.top()?.content[0]).toMatchObject({
      text: expect.stringContaining('node-3999'),
    })
  })

  it('does not reuse dirty parser state after a failed parser call', () => {
    const parser = ParserState.create(schema, {
      parse: (markdown: string) => ({
        type: 'root',
        children: markdown === 'bad'
          ? [{ type: 'blockquoteNode', children: [{ type: 'unknownNode' }] }]
          : [{ type: 'paragraphNode', value: markdown }],
      }),
      runSync: (tree: unknown) => tree,
    } as never)

    expect(() => parser('bad')).toThrow()
    expect(parser('good')).toMatchObject({
      name: 'docNode',
      content: [{ text: 'good' }],
    })
  })

  it('rejects over-deep remark ASTs before transforming parser state', () => {
    const parser = ParserState.create(schema, {
      parse: () => ({
        type: 'root',
        children: [createDeepTree(201)],
      }),
      runSync: (tree: unknown) => tree,
    } as never)

    expect(() => parser('deep')).toThrow('Markdown document is too complex to parse safely.')
  })

  it('rejects over-large remark ASTs before scheduling every child', () => {
    const parser = ParserState.create(schema, {
      parse: () => ({
        type: 'root',
        children: new Array(250_000).fill({
          type: 'paragraphNode',
          value: 'leaf',
        }),
      }),
      runSync: (tree: unknown) => tree,
    } as never)

    expect(() => parser('wide')).toThrow('Markdown document is too complex to parse safely.')
  })
})
