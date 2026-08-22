import '@testing-library/jest-dom/vitest'
import { commandsCtx, defaultValueCtx, Editor, editorViewCtx } from '@milkdown/core'
import { TextSelection } from '@milkdown/prose/state'
import type { EditorView } from '@milkdown/prose/view'
import { expect, it } from 'vitest'

import { commonmark } from '..'
import { insertHrCommand } from '../node/hr'

function createEditor() {
  const editor = Editor.make()
  editor.use(commonmark)
  return editor
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

it('parses a thematic break as editable markdown source', async () => {
  const editor = Editor.make()
    .config((ctx) => {
      ctx.set(defaultValueCtx, '---')
    })
    .use(commonmark)

  await editor.create()

  const view = editor.ctx.get(editorViewCtx)
  const hr = view.state.doc.firstChild
  expect(hr?.type.name).toBe('hr')
  expect(hr?.isTextblock).toBe(true)
  expect(hr?.textContent).toBe('---')
  expect(hr?.firstChild?.marks).toEqual([
    expect.objectContaining({
      attrs: expect.objectContaining({ edge: 'prefix', kind: 'hr' }),
    }),
  ])

  await editor.destroy()
})

it('should not create a thematic break from --- followed by space', async () => {
  const editor = createEditor()

  await editor.create()

  const view = editor.ctx.get(editorViewCtx)

  typeText(view, '--- ')

  expect(view.state.doc.firstChild?.type.name).toBe('paragraph')
  expect(view.state.doc.firstChild?.textContent).toBe('--- ')
})

it('should not add a paragraph when inserting a thematic break between blocks', async () => {
  const editor = createEditor()
  await editor.create()

  const view = editor.ctx.get(editorViewCtx)
  const { schema } = view.state
  const heading = schema.nodes.heading.create({ level: 1 }, schema.text('Heading'))
  const paragraph = schema.nodes.paragraph.create()
  const code = schema.nodes.code_block.create(null, schema.text('code'))
  const tr = view.state.tr.replaceWith(0, view.state.doc.content.size, [heading, paragraph, code])
  view.dispatch(tr.setSelection(TextSelection.create(tr.doc, heading.nodeSize + 1)))

  expect(editor.ctx.get(commandsCtx).call(insertHrCommand.key)).toBe(true)
  expect(Array.from(
    { length: view.state.doc.childCount },
    (_, index) => view.state.doc.child(index).type.name
  )).toEqual(['heading', 'hr', 'code_block'])
  expect(view.state.doc.child(1).textContent).toBe('---')

  await editor.destroy()
})

it('should keep a trailing paragraph when inserting a thematic break at the document end', async () => {
  const editor = createEditor()
  await editor.create()

  const view = editor.ctx.get(editorViewCtx)
  expect(editor.ctx.get(commandsCtx).call(insertHrCommand.key)).toBe(true)
  expect(Array.from(
    { length: view.state.doc.childCount },
    (_, index) => view.state.doc.child(index).type.name
  )).toEqual(['hr', 'paragraph'])
  expect(view.state.doc.child(0).textContent).toBe('---')
  expect(view.state.selection).toBeInstanceOf(TextSelection)
  expect(view.state.selection.$from.parent).toBe(view.state.doc.child(1))

  await editor.destroy()
})
