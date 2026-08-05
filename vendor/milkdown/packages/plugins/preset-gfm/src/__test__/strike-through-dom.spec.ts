import '@testing-library/jest-dom/vitest'
import { Editor, editorViewCtx } from '@milkdown/core'
import { DOMParser as ProseDOMParser } from '@milkdown/prose/model'
import { expect, it } from 'vitest'

import { commonmark } from '@milkdown/preset-commonmark'

import { gfm } from '..'

it('should parse common HTML strikethrough tags', async () => {
  const editor = Editor.make().use(commonmark).use(gfm)
  await editor.create()

  const view = editor.ctx.get(editorViewCtx)
  const container = document.createElement('div')
  container.innerHTML = '<p><del>del</del></p><p><s>s</s></p><p><strike>strike</strike></p>'
  const doc = ProseDOMParser.fromSchema(view.state.schema).parse(container)
  const markedText = new Map<string, string[]>()

  doc.descendants((node) => {
    if (node.isText) markedText.set(node.text ?? '', node.marks.map((mark) => mark.type.name))
  })

  expect(markedText.get('del')).toContain('strike_through')
  expect(markedText.get('s')).toContain('strike_through')
  expect(markedText.get('strike')).toContain('strike_through')

  await editor.destroy()
})
