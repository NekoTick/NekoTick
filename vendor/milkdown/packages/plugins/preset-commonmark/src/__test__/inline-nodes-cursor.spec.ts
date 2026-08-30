import '@testing-library/jest-dom/vitest'

import { defaultValueCtx, Editor, editorViewCtx } from '@milkdown/core'
import { TextSelection } from '@milkdown/prose/state'
import type { EditorView } from '@milkdown/prose/view'
import { afterEach, expect, it, vi } from 'vitest'

import { commonmark } from '..'

function createEditor() {
  return Editor.make()
    .config((ctx) => {
      ctx.set(defaultValueCtx, '![alt](https://example.com/image.png)')
    })
    .use(commonmark)
}

function setCursorAfterImage(view: EditorView) {
  let imagePos: number | null = null
  view.state.doc.descendants((node, pos) => {
    if (node.type.name !== 'image') return true
    imagePos = pos
    return false
  })
  if (imagePos === null) throw new Error('Expected an image node')
  view.dispatch(
    view.state.tr.setSelection(TextSelection.create(view.state.doc, imagePos + 1))
  )
}

function handleDomEvent(view: EditorView, type: 'compositionstart' | 'compositionend', event: CompositionEvent) {
  let handled = false
  view.someProp('handleDOMEvents', (handlers) => {
    handled = handlers[type]?.(view, event) || handled
  })
  return handled
}

function handleKeydown(view: EditorView, event: KeyboardEvent) {
  let handled = false
  view.someProp('handleDOMEvents', (handlers) => {
    handled = handlers.keydown?.(view, event) || handled
  })
  return handled
}

afterEach(() => {
  vi.restoreAllMocks()
})

it('does not insert an old composition commit after the next composition starts', async () => {
  const callbacks: FrameRequestCallback[] = []
  vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((callback) => {
    callbacks.push(callback)
    return callbacks.length
  })
  const editor = createEditor()
  await editor.create()

  try {
    const view = editor.ctx.get(editorViewCtx)
    setCursorAfterImage(view)

    handleDomEvent(view, 'compositionstart', new CompositionEvent('compositionstart'))
    expect(handleDomEvent(
      view,
      'compositionend',
      new CompositionEvent('compositionend', { data: '旧' }),
    )).toBe(true)

    handleDomEvent(view, 'compositionstart', new CompositionEvent('compositionstart'))
    callbacks.shift()?.(0)
    expect(JSON.stringify(view.state.doc.toJSON())).not.toContain('旧')

    expect(handleDomEvent(
      view,
      'compositionend',
      new CompositionEvent('compositionend', { data: '新' }),
    )).toBe(true)
    callbacks.shift()?.(16)
    expect(JSON.stringify(view.state.doc.toJSON())).toContain('新')
  } finally {
    await editor.destroy()
  }
})

it('does not run a pending composition commit after the editor is destroyed', async () => {
  const callbacks: FrameRequestCallback[] = []
  vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((callback) => {
    callbacks.push(callback)
    return callbacks.length
  })
  const editor = createEditor()
  await editor.create()
  const view = editor.ctx.get(editorViewCtx)
  setCursorAfterImage(view)

  handleDomEvent(view, 'compositionstart', new CompositionEvent('compositionstart'))
  handleDomEvent(
    view,
    'compositionend',
    new CompositionEvent('compositionend', { data: '旧' }),
  )
  await editor.destroy()

  expect(() => callbacks.shift()?.(0)).not.toThrow()
})

it('leaves an empty composition commit to the native editor', async () => {
  const editor = createEditor()
  await editor.create()

  try {
    const view = editor.ctx.get(editorViewCtx)
    setCursorAfterImage(view)

    handleDomEvent(view, 'compositionstart', new CompositionEvent('compositionstart'))
    const event = new CompositionEvent('compositionend', { data: '' })

    expect(handleDomEvent(view, 'compositionend', event)).toBe(false)
    expect(event.defaultPrevented).toBe(false)
  } finally {
    await editor.destroy()
  }
})

it('leaves an Enter-confirmed composition commit to the native editor', async () => {
  const requestFrame = vi.spyOn(globalThis, 'requestAnimationFrame')
  const editor = createEditor()
  await editor.create()

  try {
    const view = editor.ctx.get(editorViewCtx)
    setCursorAfterImage(view)

    handleDomEvent(view, 'compositionstart', new CompositionEvent('compositionstart'))
    expect(handleKeydown(view, new KeyboardEvent('keydown', {
      key: 'Enter',
      isComposing: false,
    }))).toBe(false)
    const event = new CompositionEvent('compositionend', { data: '饿' })

    expect(handleDomEvent(view, 'compositionend', event)).toBe(false)
    expect(event.defaultPrevented).toBe(false)
    expect(requestFrame).not.toHaveBeenCalled()
  } finally {
    await editor.destroy()
  }
})
