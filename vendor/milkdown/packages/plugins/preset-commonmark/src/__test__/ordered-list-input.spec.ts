import '@testing-library/jest-dom/vitest'
import type { EditorView } from '@milkdown/prose/view'

import { defaultValueCtx, Editor, editorViewCtx } from '@milkdown/core'
import { DOMParser as ProseDOMParser } from '@milkdown/prose/model'
import { TextSelection } from '@milkdown/prose/state'
import { getMarkdown } from '@milkdown/utils'
import { expect, it, vi } from 'vitest'

import { commonmark } from '..'
import {
  findNextEmptyTextblockSelectionPos,
  MAX_SPLIT_LIST_ITEM_SELECTION_SCAN_NODES,
} from '../node/list-item'
import { MAX_LIST_ORDER_SYNC_UPDATES } from '../plugin/sync-list-order-plugin'

function createEditor(defaultValue?: string) {
  const editor = Editor.make()
  if (defaultValue != null) {
    editor.config((ctx) => {
      ctx.set(defaultValueCtx, defaultValue)
    })
  }
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

function moveCursorAfterText(view: EditorView, text: string) {
  let pos: number | null = null
  view.state.doc.descendants((node, nodePos) => {
    if (pos !== null || !node.isText || typeof node.text !== 'string') return
    const index = node.text.indexOf(text)
    if (index < 0) return
    pos = nodePos + index + text.length
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

function pressKey(view: EditorView, key: string) {
  const event = new KeyboardEvent('keydown', {
    key,
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

function pressBackspace(view: EditorView) {
  pressKey(view, 'Backspace')
}

function pressDelete(view: EditorView) {
  pressKey(view, 'Delete')
}

function collectListItemPrimaryTexts(view: EditorView): string[] {
  const texts: string[] = []
  view.state.doc.descendants((node) => {
    if (node.type.name !== 'list_item') return true
    const firstChild = node.firstChild
    texts.push(firstChild?.type.name === 'paragraph' ? firstChild.textContent : '')
    return true
  })
  return texts
}

function collectOrderedListLabels(view: EditorView): string[][] {
  const labels: string[][] = []
  view.state.doc.descendants((node) => {
    if (node.type.name !== 'ordered_list') return true
    const listLabels: string[] = []
    node.forEach((child) => {
      listLabels.push(String(child.attrs.label ?? ''))
    })
    labels.push(listLabels)
    return true
  })
  return labels
}

it.each(['2. hello', '２. hello', '2． hello', '２． hello'])(
  'should preserve ordered list start when created from input rule: %s',
  async (input) => {
    const editor = createEditor()

    await editor.create()

    const view = editor.ctx.get(editorViewCtx)

    typeText(view, input)

    expect(view.state.doc.firstChild?.attrs.order).toBe(2)

    const markdown = editor.action(getMarkdown())
    expect(markdown).toBe('2. hello\n')
  }
)

it.each(['1234567890. hello', '１２３４５６７８９０． hello'])(
  'should not create an ordered list from a marker longer than nine digits: %s',
  async (input) => {
    const editor = createEditor()

    await editor.create()

    const view = editor.ctx.get(editorViewCtx)
    typeText(view, input)

    expect(view.state.doc.firstChild?.type.name).toBe('paragraph')
    expect(view.state.doc.textContent).toBe(input)

    await editor.destroy()
  }
)

it.each([
  ['ordered', '1. 2\n2. 3'],
  ['bullet', '- 2\n- 3'],
])('should keep cursor in a new empty %s item when pressing enter at item text start', async (_name, input) => {
  const editor = createEditor(input)

  await editor.create()

  const view = editor.ctx.get(editorViewCtx)
  moveCursorBeforeText(view, '2')

  pressEnter(view)

  expect(collectListItemPrimaryTexts(view)).toEqual(['', '2', '3'])
  expect(view.state.selection.$from.parent.type.name).toBe('paragraph')
  expect(view.state.selection.$from.parent.textContent).toBe('')
  expect(view.state.selection.$from.parentOffset).toBe(0)

  typeText(view, '1')

  expect(collectListItemPrimaryTexts(view)).toEqual(['1', '2', '3'])

  await editor.destroy()
})

it('should keep cursor in a new empty middle list item when pressing enter at item text start', async () => {
  const editor = createEditor('1. 1\n2. 2\n3. 3')

  await editor.create()

  const view = editor.ctx.get(editorViewCtx)
  moveCursorBeforeText(view, '2')

  pressEnter(view)

  expect(collectListItemPrimaryTexts(view)).toEqual(['1', '', '2', '3'])
  expect(view.state.selection.$from.parent.type.name).toBe('paragraph')
  expect(view.state.selection.$from.parent.textContent).toBe('')
  expect(view.state.selection.$from.parentOffset).toBe(0)

  typeText(view, 'new')

  expect(collectListItemPrimaryTexts(view)).toEqual(['1', 'new', '2', '3'])

  await editor.destroy()
})

it('should preserve ordered list start when pressing enter at first item text start', async () => {
  const editor = createEditor('5. 2\n6. 3')

  await editor.create()

  const view = editor.ctx.get(editorViewCtx)
  moveCursorBeforeText(view, '2')

  pressEnter(view)

  expect(view.state.doc.firstChild?.attrs.order).toBe(5)
  expect(collectOrderedListLabels(view)).toEqual([['5.', '6.', '7.']])
  expect(collectListItemPrimaryTexts(view)).toEqual(['', '2', '3'])
  expect(view.state.selection.$from.parent.type.name).toBe('paragraph')
  expect(view.state.selection.$from.parent.textContent).toBe('')
  expect(view.state.selection.$from.parentOffset).toBe(0)

  await editor.destroy()
})

it('should remove the empty item when backspacing after enter at item text start', async () => {
  const editor = createEditor('1. 2\n2. 3')

  await editor.create()

  const view = editor.ctx.get(editorViewCtx)
  moveCursorBeforeText(view, '2')
  pressEnter(view)
  pressBackspace(view)

  expect(collectListItemPrimaryTexts(view)).toEqual(['2', '3'])
  expect(view.state.selection.$from.parent.type.name).toBe('paragraph')
  expect(view.state.selection.$from.parent.textContent).toBe('2')
  expect(view.state.selection.$from.parentOffset).toBe(0)

  await editor.destroy()
})

it('should remove the empty item when deleting after enter at item text start', async () => {
  const editor = createEditor('1. 2\n2. 3')

  await editor.create()

  const view = editor.ctx.get(editorViewCtx)
  moveCursorBeforeText(view, '2')
  pressEnter(view)
  pressDelete(view)

  expect(collectListItemPrimaryTexts(view)).toEqual(['2', '3'])
  expect(view.state.selection.$from.parent.type.name).toBe('paragraph')
  expect(view.state.selection.$from.parent.textContent).toBe('2')
  expect(view.state.selection.$from.parentOffset).toBe(0)

  await editor.destroy()
})

it('should return to the previous item when backspacing an empty item created at item end', async () => {
  const editor = createEditor('1. 1\n2. 2')

  await editor.create()

  const view = editor.ctx.get(editorViewCtx)
  moveCursorAfterText(view, '1')
  pressEnter(view)
  pressBackspace(view)

  expect(collectListItemPrimaryTexts(view)).toEqual(['1', '2'])
  expect(view.state.selection.$from.parent.type.name).toBe('paragraph')
  expect(view.state.selection.$from.parent.textContent).toBe('1')
  expect(view.state.selection.$from.parentOffset).toBe(1)

  await editor.destroy()
})

it('should return to the previous item when backspacing a middle empty list item', async () => {
  const editor = createEditor('1. 1\n2. 2\n3. 3')

  await editor.create()

  const view = editor.ctx.get(editorViewCtx)
  moveCursorBeforeText(view, '2')
  pressEnter(view)
  pressBackspace(view)

  expect(collectListItemPrimaryTexts(view)).toEqual(['1', '2', '3'])
  expect(view.state.selection.$from.parent.type.name).toBe('paragraph')
  expect(view.state.selection.$from.parent.textContent).toBe('1')
  expect(view.state.selection.$from.parentOffset).toBe(1)

  await editor.destroy()
})

it('should keep cursor in a nested list when backspacing a nested empty item', async () => {
  const editor = createEditor('- parent\n  - 2\n  - 3')

  await editor.create()

  const view = editor.ctx.get(editorViewCtx)
  moveCursorBeforeText(view, '2')
  pressEnter(view)
  pressBackspace(view)

  expect(collectListItemPrimaryTexts(view)).toEqual(['parent', '2', '3'])
  expect(view.state.selection.$from.parent.type.name).toBe('paragraph')
  expect(view.state.selection.$from.parent.textContent).toBe('2')
  expect(view.state.selection.$from.parentOffset).toBe(0)

  await editor.destroy()
})

it('should keep cursor in a new empty nested list item when pressing enter at nested item text start', async () => {
  const editor = createEditor('- parent\n  - 2\n  - 3')

  await editor.create()

  const view = editor.ctx.get(editorViewCtx)
  moveCursorBeforeText(view, '2')

  pressEnter(view)

  expect(collectListItemPrimaryTexts(view)).toEqual(['parent', '', '2', '3'])
  expect(view.state.selection.$from.parent.type.name).toBe('paragraph')
  expect(view.state.selection.$from.parent.textContent).toBe('')
  expect(view.state.selection.$from.parentOffset).toBe(0)

  typeText(view, '1')

  expect(collectListItemPrimaryTexts(view)).toEqual(['parent', '1', '2', '3'])

  await editor.destroy()
})

it('should preserve ordered list start when loading markdown', async () => {
  const editor = createEditor('2. hello\n')

  await editor.create()

  const view = editor.ctx.get(editorViewCtx)

  expect(view.state.doc.firstChild?.attrs.order).toBe(2)

  const markdown = editor.action(getMarkdown())
  expect(markdown).toBe('2. hello\n')
})

it('should skip ordered list label synchronization for non-list edits', async () => {
  const editor = createEditor('plain text')

  await editor.create()

  const view = editor.ctx.get(editorViewCtx)
  const tr = view.state.tr.insertText('!', 1)
  const descendants = vi.spyOn(tr.doc, 'descendants').mockImplementation(() => {
    throw new Error('Document descendants should not be scanned')
  })
  const result = view.state.applyTransaction(tr)

  expect(result.transactions).toHaveLength(1)
  expect(descendants).not.toHaveBeenCalled()

  await editor.destroy()
})

it('should synchronize ordered list labels without scanning the whole document', async () => {
  const editor = createEditor('1. one\n2. two\n\nparagraph\n\n1. far\n2. away')

  await editor.create()

  const view = editor.ctx.get(editorViewCtx)
  let secondItemPos = -1
  view.state.doc.descendants((node, pos, parent, index) => {
    if (
      secondItemPos === -1 &&
      node.type.name === 'list_item' &&
      parent?.type.name === 'ordered_list' &&
      index === 1
    ) {
      secondItemPos = pos
      return false
    }
    return secondItemPos === -1
  })
  expect(secondItemPos).toBeGreaterThan(-1)

  const listItem = view.state.doc.nodeAt(secondItemPos)
  expect(listItem).not.toBeNull()
  const tr = view.state.tr.setNodeMarkup(secondItemPos, undefined, {
    ...listItem!.attrs,
    label: '99.',
  })
  const descendants = vi.spyOn(tr.doc, 'descendants').mockImplementation(() => {
    throw new Error('Document descendants should not be scanned')
  })
  const result = view.state.applyTransaction(tr)

  expect(result.transactions).toHaveLength(2)
  expect(result.state.doc.nodeAt(secondItemPos)?.attrs.label).toBe('2.')
  expect(descendants).not.toHaveBeenCalled()

  await editor.destroy()
})

it('should normalize ordered list labels after converting an ordered-styled bullet list', async () => {
  const editor = createEditor()

  await editor.create()

  const view = editor.ctx.get(editorViewCtx)
  const { schema } = view.state
  const list = schema.nodes.bullet_list.create({ spread: false }, [
    schema.nodes.list_item.create(
      { label: '3.', listType: 'ordered', spread: true },
      [schema.nodes.paragraph.create(null, schema.text('three'))]
    ),
    schema.nodes.list_item.create(
      { label: '1.', listType: 'ordered', spread: true },
      [schema.nodes.paragraph.create(null, schema.text('four'))]
    ),
  ])

  view.dispatch(view.state.tr.replaceWith(0, view.state.doc.content.size, list))

  const normalizedList = view.state.doc.firstChild
  expect(normalizedList?.type.name).toBe('ordered_list')
  expect(normalizedList?.attrs.order).toBe(3)
  expect(normalizedList?.child(0).attrs.label).toBe('3.')
  expect(normalizedList?.child(1).attrs.label).toBe('4.')

  await editor.destroy()
})

it('should ignore malformed ordered-styled bullet list labels while normalizing', async () => {
  const editor = createEditor()

  await editor.create()

  const view = editor.ctx.get(editorViewCtx)
  const { schema } = view.state
  const list = schema.nodes.bullet_list.create({ spread: false }, [
    schema.nodes.list_item.create(
      { label: '3x', listType: 'ordered', spread: true },
      [schema.nodes.paragraph.create(null, schema.text('one'))]
    ),
    schema.nodes.list_item.create(
      { label: '1.', listType: 'ordered', spread: true },
      [schema.nodes.paragraph.create(null, schema.text('two'))]
    ),
  ])

  view.dispatch(view.state.tr.replaceWith(0, view.state.doc.content.size, list))

  const normalizedList = view.state.doc.firstChild
  expect(normalizedList?.type.name).toBe('ordered_list')
  expect(normalizedList?.attrs.order).toBe(1)
  expect(normalizedList?.child(0).attrs.label).toBe('1.')
  expect(normalizedList?.child(1).attrs.label).toBe('2.')

  await editor.destroy()
})

it('should bound list item DOM attrs when parsing pasted HTML', async () => {
  const editor = createEditor()

  await editor.create()

  const view = editor.ctx.get(editorViewCtx)
  const container = document.createElement('div')
  container.innerHTML = `<ul><li data-label="${'1'.repeat(128)}" data-list-type="${'x'.repeat(64)}"><p>item</p></li></ul>`
  const doc = ProseDOMParser.fromSchema(view.state.schema).parse(container)
  const listItem = doc.firstChild?.firstChild

  expect(listItem?.attrs.label).toBe('•')
  expect(listItem?.attrs.listType).toBe('bullet')

  await editor.destroy()
})

it('should cap ordered-styled bullet list normalization updates', async () => {
  const editor = createEditor()

  await editor.create()

  const view = editor.ctx.get(editorViewCtx)
  const { schema } = view.state
  const list = schema.nodes.bullet_list.create(
    { spread: false },
    Array.from({ length: MAX_LIST_ORDER_SYNC_UPDATES + 2 }, () =>
      schema.nodes.list_item.create(
        { label: '1.', listType: 'ordered', spread: true },
        [schema.nodes.paragraph.create(null, schema.text('item'))]
      )
    )
  )

  view.dispatch(view.state.tr.replaceWith(0, view.state.doc.content.size, list))

  const normalizedList = view.state.doc.firstChild
  expect(normalizedList?.type.name).toBe('ordered_list')
  expect(normalizedList?.child(MAX_LIST_ORDER_SYNC_UPDATES + 1).attrs.label).toBe('1.')

  await editor.destroy()
})

it('should cap split list item empty selection scans', async () => {
  const editor = createEditor()

  await editor.create()

  const view = editor.ctx.get(editorViewCtx)
  const { schema } = view.state
  const doc = schema.nodes.doc.create(null, [
    ...Array.from(
      { length: MAX_SPLIT_LIST_ITEM_SELECTION_SCAN_NODES + 2 },
      () => schema.nodes.paragraph.create(null, schema.text('filled'))
    ),
    schema.nodes.paragraph.create(),
  ])

  expect(findNextEmptyTextblockSelectionPos(doc, 0)).toBe(-1)
  expect(findNextEmptyTextblockSelectionPos(doc, 0, MAX_SPLIT_LIST_ITEM_SELECTION_SCAN_NODES + 3)).toBeGreaterThan(0)

  await editor.destroy()
})
