import { EditorState, Plugin, TextSelection } from '@milkdown/prose/state'
import { EditorView } from '@milkdown/prose/view'
import { Node as ProseNode, Schema } from '@milkdown/prose/model'
import { afterEach, describe, expect, test } from 'vitest'

import {
  createVirtualizedEditorViewPlugin,
  createVirtualizedNodeViews,
  virtualizedEditorViewKey,
} from './virtualized-editor-view'

function createSchema(): Schema {
  return new Schema({
    nodes: {
      doc: { content: 'block+' },
      paragraph: {
        content: 'inline*',
        group: 'block',
        toDOM: () => ['p', 0],
        parseDOM: [{ tag: 'p' }],
      },
      text: { group: 'inline' },
    },
  })
}

function createDocument(schema: Schema, count: number): ProseNode {
  const paragraphs = Array.from({ length: count }, (_, index) =>
    schema.nodes.paragraph.create(null, schema.text(`paragraph ${index}`)),
  )
  return schema.topNodeType.create(null, paragraphs)
}

describe('virtualized editor view', () => {
  const originalIntersectionObserver = window.IntersectionObserver

  afterEach(() => {
    window.IntersectionObserver = originalIntersectionObserver
    document.body.replaceChildren()
  })

  test('renders only the initial top-level blocks and materializes observed blocks', async () => {
    let observeCallback: IntersectionObserverCallback | undefined
    const observed = new Set<Element>()
    class MockIntersectionObserver {
      constructor(callback: IntersectionObserverCallback) {
        observeCallback = callback
      }

      disconnect() {}
      observe(element: Element) {
        observed.add(element)
      }
      unobserve() {}
    }
    window.IntersectionObserver = MockIntersectionObserver as unknown as typeof IntersectionObserver

    const schema = createSchema()
    const customParagraphView = new Plugin({
      props: {
        nodeViews: {
          paragraph: () => {
            const dom = document.createElement('p')
            dom.className = 'custom-paragraph'
            return { dom, contentDOM: dom }
          },
        },
      },
    })
    const state = EditorState.create({
      schema,
      doc: createDocument(schema, 500),
      plugins: [createVirtualizedEditorViewPlugin(true), customParagraphView],
    })
    const view = new EditorView(document.body, {
      state,
      nodeViews: createVirtualizedNodeViews(state, {}, document.body),
    })

    expect(view.dom.querySelectorAll('p')).toHaveLength(40)
    expect(view.dom.querySelectorAll('p.custom-paragraph')).toHaveLength(40)
    const placeholders = view.dom.querySelectorAll<HTMLElement>('.editor-virtual-block-placeholder')
    expect(placeholders).toHaveLength(460)
    expect(view.dom.textContent).not.toContain('paragraph 499')
    expect(view.state.doc.textContent).toContain('paragraph 499')
    const pluginState = virtualizedEditorViewKey.getState(view.state)
    view.dispatch(view.state.tr.setMeta('unrelated', true))
    expect(virtualizedEditorViewKey.getState(view.state)).toBe(pluginState)
    await Promise.resolve()
    expect(observed.size).toBe(460)

    const target = placeholders[300]
    expect(target).toBeDefined()
    observeCallback?.([
      { target, isIntersecting: true } as IntersectionObserverEntry,
    ], {} as IntersectionObserver)
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))

    expect(view.dom.querySelectorAll('p')).toHaveLength(41)
    expect(view.dom.querySelectorAll('p.custom-paragraph')).toHaveLength(41)
    expect(view.state.doc.textContent).toContain('paragraph 340')
    view.destroy()
  })

  test('materializes the block containing a remote text selection', () => {
    const schema = createSchema()
    const state = EditorState.create({
      schema,
      doc: createDocument(schema, 500),
      plugins: [createVirtualizedEditorViewPlugin(true)],
    })
    const view = new EditorView(document.body, {
      state,
      nodeViews: createVirtualizedNodeViews(state, {}, document.body),
    })

    const blockPos = view.state.doc.content.size - view.state.doc.lastChild!.nodeSize
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, blockPos + 1)))

    expect(view.dom.querySelectorAll('p')).toHaveLength(41)
    expect(view.dom.lastElementChild).toBeInstanceOf(HTMLParagraphElement)
    view.destroy()
  })

  test('does not enable virtualization for small documents', () => {
    const schema = createSchema()
    const state = EditorState.create({
      schema,
      doc: createDocument(schema, 199),
      plugins: [createVirtualizedEditorViewPlugin(true)],
    })
    const view = new EditorView(document.body, {
      state,
      nodeViews: createVirtualizedNodeViews(state, {}, document.body),
    })

    expect(view.dom.querySelectorAll('.editor-virtual-block-placeholder')).toHaveLength(0)
    expect(view.dom.querySelectorAll('p')).toHaveLength(199)
    view.destroy()
  })
})
