import '@testing-library/jest-dom/vitest'
import {
  Editor,
  defaultValueCtx,
  editorViewCtx,
  remarkStringifyOptionsCtx,
} from '@milkdown/core'
import { DOMParser as ProseDOMParser } from '@milkdown/prose/model'
import { TextSelection } from '@milkdown/prose/state'
import type { EditorView } from '@milkdown/prose/view'
import { commonmark } from '@milkdown/preset-commonmark'
import { getMarkdown } from '@milkdown/utils'
import { expect, it } from 'vitest'

import { gfm } from '..'

function createEditor() {
  const editor = Editor.make()
  editor
    .config((ctx) => {
      ctx.update(remarkStringifyOptionsCtx, (prev) => ({
        ...prev,
        bullet: '-',
      }))
    })
    .use(commonmark)
    .use(gfm)
  return editor
}

function createEditorWithContent(content: string) {
  const editor = Editor.make()
  editor
    .config((ctx) => {
      ctx.set(defaultValueCtx, content)
      ctx.update(remarkStringifyOptionsCtx, (prev) => ({
        ...prev,
        bullet: '-',
      }))
    })
    .use(commonmark)
    .use(gfm)
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

function moveCursorBeforeText(view: EditorView, text: string) {
  let pos: number | null = null
  view.state.doc.descendants((node, nodePos) => {
    if (pos !== null || !node.isText || typeof node.text !== 'string') return
    const index = node.text.indexOf(text)
    if (index < 0) return
    pos = nodePos + index
  })
  if (pos === null) throw new Error(`Expected text: ${text}`)
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos)))
}

function pressEnter(view: EditorView) {
  const event = new KeyboardEvent('keydown', {
    key: 'Enter',
    bubbles: true,
    cancelable: true,
  })
  let handled = false

  view.someProp('handleKeyDown', (handleKeyDown) => {
    handled = handleKeyDown(view, event) || handled
    return handled
  })

  expect(handled).toBe(true)
}

function collectTaskItemCheckedAttrs(view: EditorView): Array<boolean | null> {
  const checkedAttrs: Array<boolean | null> = []
  view.state.doc.descendants((node) => {
    if (node.type.name === 'list_item') checkedAttrs.push(node.attrs.checked as boolean | null)
    return true
  })
  return checkedAttrs
}

it.each([
  ['- [ ] todo', '- [ ] todo\n'],
  ['- 【 】 todo', '- [ ] todo\n'],
  ['- [ 】 todo', '- [ ] todo\n'],
  ['- 【 ] todo', '- [ ] todo\n'],
  ['- 【x】 done', '- [x] done\n'],
  ['- [x】 done', '- [x] done\n'],
  ['- 【x] done', '- [x] done\n'],
  ['- [X] done', '- [x] done\n'],
  ['- [✓] done', '- [x] done\n'],
])('should serialize %s as standard markdown', async (input, expected) => {
  const editor = createEditor()

  await editor.create()

  const view = editor.ctx.get(editorViewCtx)

  typeText(view, input)

  const markdown = editor.action(getMarkdown())
  expect(markdown).toBe(expected)
})

it.each([
  ['- [X] done', '- [x] done\n'],
  ['- [✓] done', '- [x] done\n'],
  ['- 【 】 todo', '- [ ] todo\n'],
  ['1. 【X】 done', '1. [x] done\n'],
  ['- 【x】\tdone', '- [x] done\n'],
])('should parse %s and serialize back as standard markdown', async (input, expected) => {
  const editor = createEditorWithContent(input)

  await editor.create()

  const markdown = editor.action(getMarkdown())
  expect(markdown).toBe(expected)
})

it.each([
  [
    'fenced code',
    ['```text', '- [✓] literal', '1. 【X】 literal', '```'].join('\n'),
  ],
  [
    'raw HTML',
    ['<div>', '- [✓] literal', '1. 【X】 literal', '</div>'].join('\n'),
  ],
])('should preserve task marker text inside %s', async (_name, input) => {
  const editor = createEditorWithContent(input)

  await editor.create()

  const markdown = editor.action(getMarkdown())
  expect(markdown).toContain('- [✓] literal')
  expect(markdown).toContain('1. 【X】 literal')

  await editor.destroy()
})

it('should create an unchecked empty task item when pressing enter at task text start', async () => {
  const editor = createEditorWithContent('- [ ] 2\n- [x] 3')

  await editor.create()

  const view = editor.ctx.get(editorViewCtx)
  moveCursorBeforeText(view, '2')

  pressEnter(view)

  expect(collectTaskItemCheckedAttrs(view)).toEqual([false, false, true])
  expect(view.state.selection.$from.parent.type.name).toBe('paragraph')
  expect(view.state.selection.$from.parent.textContent).toBe('')
  expect(view.state.selection.$from.parentOffset).toBe(0)

  typeText(view, '1')

  const markdown = editor.action(getMarkdown())
  expect(markdown).toContain('- [ ] 1')
  expect(markdown).toContain('- [ ] 2')
  expect(markdown).toContain('- [x] 3')

  await editor.destroy()
})

it('should not inherit checked state when pressing enter at checked task text start', async () => {
  const editor = createEditorWithContent('- [x] 2\n- [ ] 3')

  await editor.create()

  const view = editor.ctx.get(editorViewCtx)
  moveCursorBeforeText(view, '2')

  pressEnter(view)

  expect(collectTaskItemCheckedAttrs(view)).toEqual([false, true, false])
  expect(view.state.selection.$from.parent.type.name).toBe('paragraph')
  expect(view.state.selection.$from.parent.textContent).toBe('')
  expect(view.state.selection.$from.parentOffset).toBe(0)

  await editor.destroy()
})

it('should bound task list DOM attrs when parsing pasted HTML', async () => {
  const editor = createEditor()

  await editor.create()

  const view = editor.ctx.get(editorViewCtx)
  const container = document.createElement('div')
  container.innerHTML = `<ul><li data-item-type="task" data-label="${'1'.repeat(128)}" data-list-type="${'x'.repeat(64)}" data-checked="true"><p>todo</p></li></ul>`
  const doc = ProseDOMParser.fromSchema(view.state.schema).parse(container)
  const listItem = doc.firstChild?.firstChild

  expect(listItem?.attrs.label).toBe('•')
  expect(listItem?.attrs.listType).toBe('bullet')
  expect(listItem?.attrs.checked).toBe(true)

  await editor.destroy()
})
