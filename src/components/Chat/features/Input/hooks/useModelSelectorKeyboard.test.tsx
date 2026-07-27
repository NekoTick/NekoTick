import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { useModelSelectorKeyboard } from './useModelSelectorKeyboard'
import type { AIModel } from '@/lib/ai/types'

const MODELS: AIModel[] = [
  { id: 'model-a', apiModelId: 'model-a', name: 'Model A', providerId: 'p1', enabled: true, createdAt: 1 },
  { id: 'model-b', apiModelId: 'model-b', name: 'Model B', providerId: 'p1', enabled: true, createdAt: 1 },
  { id: 'model-c', apiModelId: 'model-c', name: 'Model C', providerId: 'p1', enabled: true, createdAt: 1 },
]

function fireKeydown(init: KeyboardEventInit, composing = false): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    ...init,
  })

  if (composing) {
    Object.defineProperty(event, 'isComposing', {
      value: true,
      configurable: true,
    })
  }

  window.dispatchEvent(event)
  return event
}

function KeyboardHarness({
  isOpen = true,
  visibleModelIds = MODELS.map((model) => model.id),
  initialFocusedId = null,
  onShortcutToggle = vi.fn(),
  onClose = vi.fn(),
  onSelectModel = vi.fn(),
  requestNearestScroll = vi.fn(),
  clearScrollMode = vi.fn(),
  setKeyboardNavigating = vi.fn(),
  shouldHandleOpenEvent,
}: {
  isOpen?: boolean
  visibleModelIds?: string[]
  initialFocusedId?: string | null
  onShortcutToggle?: () => void
  onClose?: () => void
  onSelectModel?: (modelId: string) => void
  requestNearestScroll?: () => void
  clearScrollMode?: () => void
  setKeyboardNavigating?: (value: boolean) => void
  shouldHandleOpenEvent?: (target: EventTarget | null) => boolean
}) {
  const [focusedModelId, setFocusedModelId] = useState<string | null>(initialFocusedId)

  useModelSelectorKeyboard({
    isOpen,
    visibleModelIds,
    focusedModelId,
    setFocusedModelId,
    setKeyboardNavigating,
    onShortcutToggle,
    onClose,
    onSelectModel,
    requestNearestScroll,
    clearScrollMode,
    shouldHandleOpenEvent,
  })

  return <div data-testid="focused-id">{focusedModelId ?? ''}</div>
}

describe('useModelSelectorKeyboard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('falls back to first visible model when focused model is filtered out and Enter is pressed', () => {
    const onSelectModel = vi.fn()
    render(
      <KeyboardHarness
        isOpen
        visibleModelIds={MODELS.slice(1).map((model) => model.id)}
        initialFocusedId="model-a"
        onSelectModel={onSelectModel}
      />,
    )

    act(() => {
      fireKeydown({ key: 'Enter' })
    })

    expect(onSelectModel).toHaveBeenCalledWith('model-b')
  })

  it('ignores keyboard handling during IME composition', () => {
    const onSelectModel = vi.fn()
    render(
      <KeyboardHarness
        isOpen
        visibleModelIds={MODELS.map((model) => model.id)}
        initialFocusedId="model-a"
        onSelectModel={onSelectModel}
      />,
    )

    act(() => {
      fireKeydown({ key: 'Enter' }, true)
    })

    expect(onSelectModel).not.toHaveBeenCalled()
  })

  it('clears focus without nearest-scroll request when model list is empty', async () => {
    const requestNearestScroll = vi.fn()
    const clearScrollMode = vi.fn()
    const setKeyboardNavigating = vi.fn()
    render(
      <KeyboardHarness
        isOpen
        visibleModelIds={[]}
        initialFocusedId="model-a"
        requestNearestScroll={requestNearestScroll}
        clearScrollMode={clearScrollMode}
        setKeyboardNavigating={setKeyboardNavigating}
      />,
    )

    act(() => {
      fireKeydown({ key: 'ArrowDown' })
    })

    await waitFor(() => {
      expect(screen.getByTestId('focused-id')).toHaveTextContent('')
    })
    expect(clearScrollMode).toHaveBeenCalledTimes(1)
    expect(requestNearestScroll).not.toHaveBeenCalled()
    expect(setKeyboardNavigating).not.toHaveBeenCalled()
  })

  it('handles Ctrl+M via toggle callback even when selector is closed', () => {
    const onShortcutToggle = vi.fn()
    render(<KeyboardHarness isOpen={false} onShortcutToggle={onShortcutToggle} />)

    let event: KeyboardEvent
    act(() => {
      event = fireKeydown({ key: 'm', ctrlKey: true })
    })

    expect(event!.defaultPrevented).toBe(true)
    expect(onShortcutToggle).toHaveBeenCalledTimes(1)
  })

  it('does not handle Ctrl+M from a dialog', () => {
    const onShortcutToggle = vi.fn()
    const dialog = document.createElement('div')
    const button = document.createElement('button')
    dialog.setAttribute('role', 'dialog')
    dialog.append(button)
    document.body.append(dialog)
    render(<KeyboardHarness isOpen={false} onShortcutToggle={onShortcutToggle} />)

    const event = new KeyboardEvent('keydown', {
      key: 'm',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    })
    button.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(false)
    expect(onShortcutToggle).not.toHaveBeenCalled()
    dialog.remove()
  })

  it('navigates by rendered model order instead of source array order', async () => {
    render(
      <KeyboardHarness
        isOpen
        visibleModelIds={['model-b', 'model-a', 'model-c']}
        initialFocusedId="model-b"
      />,
    )

    act(() => {
      fireKeydown({ key: 'ArrowDown' })
    })

    await waitFor(() => {
      expect(screen.getByTestId('focused-id')).toHaveTextContent('model-a')
    })
  })

  it('ignores open-selector navigation events outside the Chat selector', () => {
    const onSelectModel = vi.fn()
    const inside = document.createElement('input')
    const outside = document.createElement('input')
    document.body.append(inside, outside)
    render(
      <KeyboardHarness
        isOpen
        initialFocusedId="model-a"
        onSelectModel={onSelectModel}
        shouldHandleOpenEvent={(target) => target === inside}
      />,
    )

    const outsideEvent = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
    outside.dispatchEvent(outsideEvent)
    expect(outsideEvent.defaultPrevented).toBe(false)
    expect(onSelectModel).not.toHaveBeenCalled()

    const insideEvent = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
    inside.dispatchEvent(insideEvent)
    expect(insideEvent.defaultPrevented).toBe(true)
    expect(onSelectModel).toHaveBeenCalledWith('model-a')
    inside.remove()
    outside.remove()
  })
})
