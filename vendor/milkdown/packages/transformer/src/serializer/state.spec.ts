import type { Mark, Schema } from '@milkdown/prose/model'

import { describe, expect, it, vi } from 'vitest'

import {
  areSerializerMarkPropsEqual,
  MAX_SERIALIZER_MARK_SEARCH_DEPTH,
  MAX_SERIALIZER_MARK_PROP_STRING_CHARS,
  SerializerState,
} from './state'

const boldMark = {
  isInSet: (arr: string[]) => arr.includes('bold'),
  addToSet: (arr: string[]) => arr.concat('bold'),
  type: {
    removeFromSet: (arr: string[]) => arr.filter((x) => x !== 'bold'),
  },
} as unknown as Mark

const italicMark = {
  isInSet: (arr: string[]) => arr.includes('italic'),
  addToSet: (arr: string[]) => arr.concat('italic'),
  type: {
    removeFromSet: (arr: string[]) => arr.filter((x) => x !== 'italic'),
  },
} as unknown as Mark

const schema = {
  nodes: {
    doc: {
      spec: {
        toMarkdown: {
          match: (node: { type: string }) => node.type === 'doc',
          runner: (state: SerializerState, node: { content: never }) => {
            state.openNode('doc')
            state.next(node.content)
          },
        },
      },
    },
    paragraph: {
      spec: {
        toMarkdown: {
          match: (node: { type: string }) => node.type === 'paragraph',
          runner: (state: SerializerState, node: { value: string }) => {
            state.addNode('text', [], node.value)
          },
        },
      },
    },
    blockquote: {
      spec: {
        toMarkdown: {
          match: (node: { type: string }) => node.type === 'blockquote',
          runner: (state: SerializerState, node: { content: never }) => {
            state.openNode('blockquote')
            state.next(node.content)
            state.closeNode()
          },
        },
      },
    },
  },
  marks: {},
  text: (text: string, marks: string[]) => ({ text, marks, isText: true }),
} as unknown as Schema

describe('serializer-state', () => {
  it('uses the serializer attached to the node type without scanning unrelated types', () => {
    const unrelatedMatch = vi.fn(() => false)
    const nodeType = {
      spec: {
        toMarkdown: {
          match: vi.fn(() => true),
          runner: (state: SerializerState) => {
            state.addNode('text', [], 'content')
          },
        },
      },
    }
    const localSchema = {
      nodes: {
        unrelated: {
          spec: {
            toMarkdown: {
              match: unrelatedMatch,
              runner: vi.fn(),
            },
          },
        },
        node: nodeType,
      },
      marks: {},
    } as unknown as Schema
    const node = {
      type: nodeType,
      marks: [],
    }

    const state = new SerializerState(localSchema)
    state.openNode('doc')
    state.run(node as never)

    expect(unrelatedMatch).not.toHaveBeenCalled()
    expect(nodeType.spec.toMarkdown.match).toHaveBeenCalledOnce()
    expect(state.top()).toMatchObject({
      type: 'doc',
      children: [{ type: 'text', value: 'content' }],
    })
  })

  it('node', () => {
    const state = new SerializerState(schema)
    state.openNode('doc')
    state.openNode('paragraph', 'paragraph node value', { foo: 'bar' })
    state.addNode('text', [], 'text node value')
    state.closeNode()

    expect(state.top()).toMatchObject({
      type: 'doc',
      children: [
        {
          type: 'paragraph',
          value: 'paragraph node value',
          children: [
            {
              type: 'text',
              value: 'text node value',
            },
          ],
        },
      ],
    })
  })

  it('maybe merge children for same mark', () => {
    const state = new SerializerState(schema)
    state.openNode('doc')
    state.openNode('paragraph')
    state.withMark(boldMark, 'bold')
    state.addNode('text', [], 'The lunatic is on the grass.')
    state.closeMark(boldMark)
    state.withMark(boldMark, 'bold')
    state.addNode('text', [], 'The lunatic is in the hell.')
    state.closeMark(boldMark)
    state.closeNode()

    expect(state.top()).toMatchObject({
      type: 'doc',
      children: [
        {
          type: 'paragraph',
          children: [
            {
              type: 'bold',
              isMark: true,
              children: [
                {
                  type: 'text',
                  value: 'The lunatic is on the grass.',
                },
                {
                  type: 'text',
                  value: 'The lunatic is in the hell.',
                },
              ],
            },
          ],
        },
      ],
    })
  })

  it('build', () => {
    const state = new SerializerState(schema)
    state.openNode('doc')
    state.openNode('paragraph', 'paragraph node value', { foo: 'bar' })
    state.addNode('text', [], 'text node value')
    state.closeNode()

    expect(state.build()).toMatchObject({
      type: 'doc',
      children: [
        {
          type: 'paragraph',
          value: 'paragraph node value',
          children: [
            {
              type: 'text',
              value: 'text node value',
            },
          ],
        },
      ],
    })
  })

  it('next', () => {
    const state = new SerializerState(schema)
    state.openNode('doc')
    state.next({
      type: 'blockquote',
      marks: [],
      content: {
        type: 'paragraph',
        marks: [],
        value: 'The lunatic is on the grass.',
      },
    } as any)

    expect(state.build()).toMatchObject({
      type: 'doc',
      children: [
        {
          type: 'blockquote',
          children: [
            {
              type: 'text',
              value: 'The lunatic is on the grass.',
            },
          ],
        },
      ],
    })
  })

  it('trim spaces around marks', () => {
    const state = new SerializerState(schema)

    state.openNode('doc')
    state.openNode('paragraph')
    // Open a bold mark, add a text node with surrounding spaces, then close the mark
    state.withMark(boldMark, 'bold')
    state.addNode('text', [], ' hello ')
    state.closeMark(boldMark)
    state.closeNode() // close paragraph

    // Expect SerializerState to move the spaces outside of the mark node.
    expect(state.top()).toMatchObject({
      type: 'doc',
      children: [
        {
          type: 'paragraph',
          children: [
            { type: 'text', value: ' ' },
            {
              type: 'bold',
              isMark: true,
              children: [{ type: 'text', value: 'hello' }],
            },
            { type: 'text', value: ' ' },
          ],
        },
      ],
    })
  })

  it('try to merge marks', () => {
    const state = new SerializerState(schema)

    state.openNode('doc')
    state.openNode('paragraph')
    state.withMark(boldMark, 'bold')
    state.withMark(italicMark, 'italic')
    state.addNode('text', [], 'hello')
    state.closeMark(italicMark)
    state.addNode('text', [], 'world')
    state.closeMark(boldMark)
    state.closeNode()

    expect(state.top()).toMatchObject({
      type: 'doc',
      children: [
        {
          type: 'paragraph',
          children: [
            {
              type: 'bold',
              isMark: true,
              children: [
                {
                  type: 'italic',
                  isMark: true,
                  children: [{ type: 'text', value: 'hello' }],
                },
                { type: 'text', value: 'world' },
              ],
            },
          ],
        },
      ],
    })
  })

  it('keeps bounded mark prop equality compatible with ordinary JSON props', () => {
    expect(
      areSerializerMarkPropsEqual(
        { type: 'link', href: 'https://example.test', title: null, isMark: true },
        { type: 'link', href: 'https://example.test', title: null, isMark: true }
      )
    ).toBe(true)
    expect(
      areSerializerMarkPropsEqual(
        { type: 'link', href: 'https://example.test/a', isMark: true },
        { type: 'link', href: 'https://example.test/b', isMark: true }
      )
    ).toBe(false)
  })

  it('does not call toJSON while comparing mark props', () => {
    const value = {
      toJSON: () => {
        throw new Error('toJSON should not be called')
      },
    }

    expect(
      areSerializerMarkPropsEqual(
        { type: 'link', href: value, isMark: true },
        { type: 'link', href: value, isMark: true }
      )
    ).toBe(true)
    expect(
      areSerializerMarkPropsEqual(
        { type: 'link', href: value, isMark: true },
        { type: 'link', href: { ...value }, isMark: true }
      )
    ).toBe(false)
  })

  it('does not merge marks when prop comparison exceeds string budget', () => {
    const state = new SerializerState(schema)
    const largeHref = 'https://example.test/' + 'a'.repeat(MAX_SERIALIZER_MARK_PROP_STRING_CHARS)

    state.openNode('doc')
    state.openNode('paragraph')
    state.withMark(boldMark, 'link', undefined, { href: largeHref })
    state.addNode('text', [], 'first')
    state.closeMark(boldMark)
    state.withMark(boldMark, 'link', undefined, { href: largeHref })
    state.addNode('text', [], 'second')
    state.closeMark(boldMark)
    state.closeNode()

    expect(state.top()).toMatchObject({
      type: 'doc',
      children: [
        {
          type: 'paragraph',
          children: [
            {
              type: 'link',
              isMark: true,
              href: largeHref,
              children: [{ type: 'text', value: 'first' }],
            },
            {
              type: 'link',
              isMark: true,
              href: largeHref,
              children: [{ type: 'text', value: 'second' }],
            },
          ],
        },
      ],
    })
  })

  it('does not recursively search mark chains beyond the merge search depth', () => {
    const state = new SerializerState(schema)
    let nested = {
      type: 'text',
      value: 'second',
    }
    for (let depth = 0; depth <= MAX_SERIALIZER_MARK_SEARCH_DEPTH; depth += 1) {
      nested = {
        type: 'wrapper',
        children: [nested],
      } as typeof nested
    }

    state.openNode('doc')
    state.addNode('paragraph', [
      {
        type: 'bold',
        isMark: true,
        children: [{ type: 'text', value: 'first' }],
      },
      {
        ...nested,
        isMark: true,
      },
    ] as never)

    expect(state.top()).toMatchObject({
      type: 'doc',
      children: [
        {
          type: 'paragraph',
          children: [
            {
              type: 'bold',
              isMark: true,
              children: [{ type: 'text', value: 'first' }],
            },
            {
              type: 'wrapper',
              isMark: true,
            },
          ],
        },
      ],
    })
  })

  it('merges many adjacent marks without copying the previous children array each time', () => {
    const state = new SerializerState(schema)
    const children = Array.from({ length: 2000 }, (_, index) => ({
      type: 'bold',
      isMark: true,
      children: [{ type: 'text', value: String(index) }],
    }))
    const slice = Array.prototype.slice
    let sliceCalls = 0

    Array.prototype.slice = function patchedSlice(...args) {
      sliceCalls += 1
      return slice.apply(this, args)
    }
    try {
      state.openNode('doc')
      state.addNode('paragraph', children as never)
    }
    finally {
      Array.prototype.slice = slice
    }

    expect(sliceCalls).toBe(0)
    expect(state.top()).toMatchObject({
      type: 'doc',
      children: [
        {
          type: 'paragraph',
          children: [
            {
              type: 'bold',
              isMark: true,
              children: children.flatMap((child) => child.children),
            },
          ],
        },
      ],
    })
  })

  it('does not reuse dirty serializer state after a failed serializer call', () => {
    const serializer = SerializerState.create(schema, {
      stringify: (node: unknown) => JSON.stringify(node),
    } as never)

    expect(() => serializer({
      type: 'blockquote',
      content: {
        type: 'unknown',
        marks: [],
      },
      marks: [],
    } as never)).toThrow()

    expect(serializer({
      type: 'doc',
      content: {
        type: 'paragraph',
        value: 'good',
        marks: [],
      },
      marks: [],
    } as never)).toContain('"value":"good"')
  })
})
