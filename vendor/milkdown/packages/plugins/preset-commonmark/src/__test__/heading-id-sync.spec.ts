import '@testing-library/jest-dom/vitest'

import { defaultValueCtx, Editor, editorViewCtx } from '@milkdown/core'
import { Schema } from '@milkdown/prose/model'
import { expect, it } from 'vitest'

import { commonmark } from '..'
import {
  MAX_HEADING_ID_TEXT_CHARS,
  getBoundedHeadingTextForId,
  headingIdGenerator,
} from '../node/heading'
import {
  MAX_HEADING_ID_SYNC_UPDATES,
  collectHeadingIdUpdates,
  rangeHasHeading,
} from '../plugin/sync-heading-id-plugin'

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    heading: {
      attrs: {
        id: { default: '' },
        level: { default: 1 },
      },
      content: 'text*',
      group: 'block',
      toDOM: (node) => [`h${node.attrs.level}`, { id: node.attrs.id }, 0],
      parseDOM: [{ tag: 'h1' }],
    },
    paragraph: {
      content: 'text*',
      group: 'block',
      toDOM: () => ['p', 0],
      parseDOM: [{ tag: 'p' }],
    },
    text: { group: 'inline' },
  },
})

function heading(text: string, id = '') {
  return schema.nodes.heading.create(
    { id, level: 1 },
    text ? schema.text(text) : undefined
  )
}

function paragraph(text: string) {
  return schema.nodes.paragraph.create(null, schema.text(text))
}

function headingId(node: { textContent: string }) {
  return node.textContent.toLowerCase().trim().replace(/\s+/g, '-')
}

function createEditor(defaultValue: string, onGenerate: () => void) {
  return Editor.make()
    .config((ctx) => {
      ctx.set(defaultValueCtx, defaultValue)
      ctx.set(headingIdGenerator.key, (node) => {
        onGenerate()
        return node.textContent.toLowerCase().trim().replace(/\s+/g, '-')
      })
    })
    .use(commonmark)
}

function getHeadingIds(editor: Editor) {
  const view = editor.ctx.get(editorViewCtx)
  const ids: string[] = []

  view.state.doc.descendants((node) => {
    if (node.type.name === 'heading') ids.push(node.attrs.id)
  })

  return ids
}

it('should avoid regenerating heading ids for non-heading edits', async () => {
  let generated = 0
  const editor = createEditor('# Same\n\nparagraph\n\n# Same\n', () => {
    generated += 1
  })

  await editor.create()

  const view = editor.ctx.get(editorViewCtx)

  expect(generated).toBeGreaterThan(0)
  expect(getHeadingIds(editor)).toEqual(['same', 'same-#2'])

  generated = 0
  view.dispatch(view.state.tr.insertText(' edited', 9))

  expect(generated).toBe(0)
  expect(getHeadingIds(editor)).toEqual(['same', 'same-#2'])

  generated = 0
  view.dispatch(view.state.tr.insertText('changed', 2))

  expect(generated).toBeGreaterThan(0)
  expect(getHeadingIds(editor)).toEqual(['schangedame', 'same'])

  await editor.destroy()
})

it('collects duplicate heading ids in document order', () => {
  const doc = schema.nodes.doc.create(null, [
    heading('Same'),
    paragraph('body'),
    heading('Same'),
  ])

  const updates = collectHeadingIdUpdates(doc, schema.nodes.heading, headingId)

  expect(updates).toHaveLength(2)
  expect(updates.map((update) => update.attrs.id)).toEqual([
    'same',
    'same-#2',
  ])
  expect(updates[0]!.pos).toBe(0)
  expect(updates[1]!.pos).toBe(doc.child(0).nodeSize + doc.child(1).nodeSize)
})

it('caps heading id updates collected in one pass', () => {
  const doc = schema.nodes.doc.create(null, Array.from(
    { length: MAX_HEADING_ID_SYNC_UPDATES + 2 },
    () => heading('Same')
  ))

  expect(
    collectHeadingIdUpdates(doc, schema.nodes.heading, headingId)
  ).toHaveLength(MAX_HEADING_ID_SYNC_UPDATES)
})

it('caps heading id scans by node count', () => {
  const doc = schema.nodes.doc.create(null, [
    ...Array.from({ length: 5 }, () => paragraph('plain')),
    heading('Later'),
  ])

  expect(
    collectHeadingIdUpdates(doc, schema.nodes.heading, headingId, 5)
  ).toHaveLength(0)
})

it('skips blank headings without reading aggregate heading text', () => {
  const headingType = schema.nodes.heading
  const blankTextNode = {
    isText: true,
    marks: [],
    text: ' '.repeat(8_192),
  }
  const blankHeading = {
    attrs: { id: '', level: 1 },
    child: (index: number) => {
      if (index !== 0) throw new Error('Unexpected child index')
      return blankTextNode
    },
    childCount: 1,
    content: { size: 8_192 },
    nodeSize: 8_194,
    type: headingType,
    get textContent() {
      throw new Error('aggregate heading textContent should not be read')
    },
  }
  const doc = {
    child: (index: number) => {
      if (index !== 0) throw new Error('Unexpected child index')
      return blankHeading
    },
    childCount: 1,
    content: { size: 8_194 },
  } as unknown as Parameters<typeof collectHeadingIdUpdates>[0]

  expect(
    collectHeadingIdUpdates(doc, headingType, () => {
      throw new Error('Blank headings should not generate ids')
    })
  ).toHaveLength(0)
})

it('generates bounded heading id text without reading aggregate heading text', () => {
  const textNode = {
    isText: true,
    marks: [],
    text: `${'Title '.repeat(1000)}Tail`,
  }
  const node = {
    child: (index: number) => {
      if (index !== 0) throw new Error('Unexpected child index')
      return textNode
    },
    childCount: 1,
    get textContent() {
      throw new Error('aggregate heading textContent should not be read')
    },
    isText: false,
  } as unknown as Parameters<typeof getBoundedHeadingTextForId>[0]

  const result = getBoundedHeadingTextForId(node)

  expect(result).toHaveLength(MAX_HEADING_ID_TEXT_CHARS)
  expect(result).toBe(textNode.text.slice(0, MAX_HEADING_ID_TEXT_CHARS))
})

it('caps heading range precheck scans by node count', () => {
  const doc = schema.nodes.doc.create(null, [
    ...Array.from({ length: 5 }, () => paragraph('plain')),
    heading('Later'),
  ])

  expect(
    rangeHasHeading(doc, 0, doc.content.size, schema.nodes.heading, 5)
  ).toBe(false)
})

it('stops heading range precheck after finding a heading', () => {
  let accessed = 0
  const children = [
    heading('First'),
    ...Array.from({ length: MAX_HEADING_ID_SYNC_UPDATES }, () => paragraph('plain')),
  ]
  const doc = {
    child(index: number) {
      accessed += 1
      return children[index]!
    },
    childCount: children.length,
    content: {
      size: children.reduce((size, node) => size + node.nodeSize, 0),
    },
  } as unknown as Parameters<typeof rangeHasHeading>[0]

  expect(
    rangeHasHeading(doc, 0, doc.content.size, schema.nodes.heading)
  ).toBe(true)
  expect(accessed).toBe(1)
})
