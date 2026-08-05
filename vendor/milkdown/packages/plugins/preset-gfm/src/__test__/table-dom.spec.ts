import '@testing-library/jest-dom/vitest'
import { Editor, editorViewCtx } from '@milkdown/core'
import { DOMParser as ProseDOMParser } from '@milkdown/prose/model'
import { expect, it } from 'vitest'

import { commonmark } from '@milkdown/preset-commonmark'

import { gfm } from '..'

it('should parse standard HTML table sections and cell alignment', async () => {
  const editor = Editor.make().use(commonmark).use(gfm)
  await editor.create()

  const view = editor.ctx.get(editorViewCtx)
  const container = document.createElement('div')
  container.innerHTML = [
    '<table><thead><tr><th style="text-align: center">Name</th></tr></thead>',
    '<tbody><tr><td style="text-align: center">Ada</td></tr></tbody></table>',
  ].join('')
  const doc = ProseDOMParser.fromSchema(view.state.schema).parse(container)
  const table = doc.firstChild

  expect(table?.type.name).toBe('table')
  expect(table?.firstChild?.type.name).toBe('table_header_row')
  expect(table?.firstChild?.firstChild?.type.name).toBe('table_header')
  expect(table?.firstChild?.firstChild?.attrs.alignment).toBe('center')
  expect(table?.lastChild?.type.name).toBe('table_row')
  expect(table?.lastChild?.firstChild?.attrs.alignment).toBe('center')

  await editor.destroy()
})
