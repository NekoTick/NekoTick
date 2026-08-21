import type { MilkdownPlugin } from '@milkdown/ctx'
import { expect, test } from 'vitest'

import { Editor, EditorStatus } from './editor'

test('leaves a failed editor destroyable', async () => {
  const failure = new Error('Plugin creation failed')
  const plugin: MilkdownPlugin = () => () => {
    throw failure
  }
  const editor = Editor.make().use(plugin)

  await expect(editor.create()).rejects.toBe(failure)
  expect(editor.status).toBe(EditorStatus.Destroyed)
  await expect(editor.destroy()).resolves.toBe(editor)
})

test('preserves the creation error when the destroyed status listener throws', async () => {
  const failure = new Error('Plugin creation failed')
  const listenerFailure = new Error('Status listener failed')
  const plugin: MilkdownPlugin = () => () => {
    throw failure
  }
  const editor = Editor.make()
    .use(plugin)
    .onStatusChange((status) => {
      if (status === EditorStatus.Destroyed) throw listenerFailure
    })

  await expect(editor.create()).rejects.toBe(failure)
  expect(editor.status).toBe(EditorStatus.Destroyed)
})

test('recovers when the creating status listener throws', async () => {
  const failure = new Error('Status listener failed')
  const editor = Editor.make().onStatusChange((status) => {
    if (status === EditorStatus.OnCreate) throw failure
  })

  await expect(editor.create()).rejects.toBe(failure)
  expect(editor.status).toBe(EditorStatus.Destroyed)
})
