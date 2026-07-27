import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useEmbeddedComposerInsert } from './useEmbeddedComposerInsert'

const composer = vi.hoisted(() => ({
  focusComposerInput: vi.fn(() => true),
  insertTextIntoComposer: vi.fn(() => true),
}))

vi.mock('@/lib/ui/composerFocusRegistry', () => composer)

describe('useEmbeddedComposerInsert', () => {
  it('waits for the embedded Chat instance to become active', () => {
    const consumePendingComposerInsert = vi.fn()
    const pendingComposerInsert = { id: 1, text: 'Selected text' }
    const { rerender } = renderHook(
      ({ active }) => useEmbeddedComposerInsert({
        active,
        consumePendingComposerInsert,
        isEmbedded: true,
        pendingComposerInsert,
      }),
      { initialProps: { active: false } },
    )

    expect(composer.insertTextIntoComposer).not.toHaveBeenCalled()
    expect(consumePendingComposerInsert).not.toHaveBeenCalled()

    rerender({ active: true })

    expect(composer.insertTextIntoComposer).toHaveBeenCalledWith('Selected text')
    expect(composer.focusComposerInput).toHaveBeenCalledTimes(1)
    expect(consumePendingComposerInsert).toHaveBeenCalledWith(1)
  })
})
